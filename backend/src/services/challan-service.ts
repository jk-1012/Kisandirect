import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import puppeteer from 'puppeteer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createNotificationService } from './notification-service.js';

type EChallanStatus = 'GENERATED' | 'AWAITING_BUYER_OTP' | 'COMPLETED';

export function createChallanService(server: FastifyInstance) {
  async function createEChallan(orderId: string, actorId: string) {
    const res = await server.db.query(
      `SELECT o.*, l.crop_type, l.crop_type AS crop_type_display, l.harvest_date, l.grade, u.phone AS buyer_phone, u.language AS buyer_language,
              f.kisan_id AS farmer_kisan_id, fp.state_code AS farmer_state, fp.district AS farmer_district,
              up.state_code AS buyer_state, up.district AS buyer_district
       FROM public.orders o
       JOIN public.listings l ON l.id = o.listing_id
       JOIN public.users u ON u.id = o.buyer_id
       JOIN public.users f ON f.id = o.farmer_id
       LEFT JOIN public.farmer_profiles fp ON fp.user_id = f.id
       LEFT JOIN public.farmer_profiles up ON up.user_id = u.id
       WHERE o.order_id = $1`,
      [orderId]
    );

    const order = res.rows[0];
    if (!order) throw server.httpErrors.notFound('Order not found');
    if (![order.buyer_id, order.farmer_id].includes(actorId)) {
      throw server.httpErrors.forbidden('Not authorized to generate challan for this order');
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const baseUrl = process.env.API_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:4000';
    const verificationUrl = `${baseUrl}/api/v1/orders/${orderId}/challan/verify?token=${verificationToken}`;

    const html = buildChallanHtml(order, verificationUrl, 'GENERATED');
    const pdfBuffer = await generatePdfBuffer(html);

    const objectKey = `challans/${order.order_id}/challan.pdf`;
    const bucketName = process.env.LISTINGS_PHOTO_BUCKET ?? `kisandirect-listings-${(process.env.NODE_ENV ?? 'dev').toLowerCase()}`;
    await server.storage.s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ServerSideEncryption: 'AES256'
      })
    );

    const challanUrl = `${process.env.CDN_BASE || `https://${bucketName}.s3.${process.env.AWS_REGION ?? 'ap-south-1'}.amazonaws.com`}/${objectKey}`;

    await server.db.query('BEGIN');
    try {
      const existing = await server.db.query('SELECT id FROM public.e_challans WHERE order_id = $1', [order.id]);
      if (existing.rowCount > 0) {
        await server.db.query(
          `UPDATE public.e_challans
           SET verification_token = $1, challan_url = $2, status = $3, generated_at = NOW(), updated_at = NOW(), farmer_signed_at = NULL, buyer_verified_at = NULL, buyer_otp_hash = NULL, buyer_otp_expires_at = NULL
           WHERE order_id = $4`,
          [verificationToken, challanUrl, 'GENERATED', order.id]
        );
      } else {
        await server.db.query(
          `INSERT INTO public.e_challans
           (order_id, verification_token, challan_url, status, generated_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,NOW(),NOW(),NOW())`,
          [order.id, verificationToken, challanUrl, 'GENERATED']
        );
      }
      await server.db.query('UPDATE public.orders SET challan_url = $1, updated_at = NOW() WHERE order_id = $2', [challanUrl, order.order_id]);
      await server.db.query('COMMIT');
    } catch (err) {
      await server.db.query('ROLLBACK');
      throw err;
    }

    server.log.info({ order_id: orderId, challan_url: challanUrl }, 'E-challan created');
    return { challan_url: challanUrl, verification_url: verificationUrl, status: 'GENERATED' };
  }

  async function signEChallan(orderId: string, actorId: string) {
    const res = await server.db.query(
      `SELECT ec.*, o.order_id, o.farmer_id, o.buyer_id, u.phone AS buyer_phone
       FROM public.e_challans ec
       JOIN public.orders o ON o.id = ec.order_id
       JOIN public.users u ON u.id = o.buyer_id
       WHERE o.order_id = $1`,
      [orderId]
    );
    const challan = res.rows[0];
    if (!challan) throw server.httpErrors.notFound('e-Challan not found for order');
    if (actorId !== challan.farmer_id) throw server.httpErrors.forbidden('Only farmer may initiate challan signing');
    if (challan.status !== 'GENERATED') {
      throw server.httpErrors.badRequest('Challan is not in a state that can be signed');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await server.db.query(
      `UPDATE public.e_challans
       SET status = $1, farmer_signed_at = NOW(), buyer_otp_hash = $2, buyer_otp_expires_at = $3, updated_at = NOW()
       WHERE id = $4`,
      ['AWAITING_BUYER_OTP', otpHash, expiresAt, challan.id]
    );

    const notificationService = createNotificationService(server);
    const message = `Your e-Challan for order ${orderId} is ready for verification. Use OTP ${otp} to complete the signature.`;
    await notificationService.createNotification({
      userId: challan.buyer_id,
      type: 'ECHALLAN_OTP',
      title: 'Verify your e-Challan',
      body: message,
      data: { order_id: orderId, challan_status: 'AWAITING_BUYER_OTP' }
    });

    server.log.info({ order_id: orderId }, 'E-challan signing initiated, OTP sent to buyer');
    return { message: 'OTP sent to buyer. Buyer must verify to complete the e-Challan.' };
  }

  async function verifyEChallanOtp(orderId: string, actorId: string, otp: string) {
    const res = await server.db.query(
      `SELECT ec.*, o.order_id, o.buyer_id, o.farmer_id
       FROM public.e_challans ec
       JOIN public.orders o ON o.id = ec.order_id
       WHERE o.order_id = $1`,
      [orderId]
    );
    const challan = res.rows[0];
    if (!challan) throw server.httpErrors.notFound('e-Challan not found for order');
    if (actorId !== challan.buyer_id) throw server.httpErrors.forbidden('Only buyer may verify the challan OTP');
    if (challan.status !== 'AWAITING_BUYER_OTP') {
      throw server.httpErrors.badRequest('No OTP verification is pending for this challan');
    }
    if (!challan.buyer_otp_hash || !challan.buyer_otp_expires_at || new Date() > new Date(challan.buyer_otp_expires_at)) {
      throw server.httpErrors.unauthorized('OTP expired or invalid');
    }

    const match = await bcrypt.compare(otp, challan.buyer_otp_hash);
    if (!match) {
      throw server.httpErrors.unauthorized('Invalid OTP');
    }

    await server.db.query('BEGIN');
    try {
      await server.db.query(
        `UPDATE public.e_challans
         SET status = $1, buyer_verified_at = NOW(), buyer_otp_hash = NULL, buyer_otp_expires_at = NULL, updated_at = NOW()
         WHERE id = $2`,
        ['COMPLETED', challan.id]
      );

      server.log.info({ order_id: orderId }, 'E-challan verified, delivery confirmed');
      await server.db.query('COMMIT');
    } catch (err) {
      await server.db.query('ROLLBACK');
      throw err;
    }

    return { success: true, message: 'e-Challan verified and completed.' };
  }

  async function getEChallanByToken(token: string) {
    const res = await server.db.query(
      `SELECT ec.status, ec.challan_url, ec.generated_at, ec.farmer_signed_at, ec.buyer_verified_at,
              o.order_id, o.quantity_kg, o.agreed_price_paise, o.subtotal_paise, o.delivery_confirmed_at,
              l.crop_type, l.harvest_date, l.grade, f.kisan_id AS farmer_kisan_id, fp.state_code AS farmer_state, fp.district AS farmer_district,
              u.phone AS buyer_phone, up.state_code AS buyer_state, up.district AS buyer_district
       FROM public.e_challans ec
       JOIN public.orders o ON o.id = ec.order_id
       JOIN public.listings l ON l.id = o.listing_id
       JOIN public.users f ON f.id = o.farmer_id
       LEFT JOIN public.farmer_profiles fp ON fp.user_id = f.id
       JOIN public.users u ON u.id = o.buyer_id
       LEFT JOIN public.farmer_profiles up ON up.user_id = u.id
       WHERE ec.verification_token = $1`,
      [token]
    );

    const row = res.rows[0];
    if (!row) throw server.httpErrors.notFound('e-Challan not found');

    return {
      order_id: row.order_id,
      challan_url: row.challan_url,
      status: row.status,
      generated_at: row.generated_at,
      farmer_signed_at: row.farmer_signed_at,
      buyer_verified_at: row.buyer_verified_at,
      crop_type: row.crop_type,
      quantity_kg: Number(row.quantity_kg),
      agreed_price_inr: Number(row.agreed_price_paise) / 100,
      total_value_inr: Number(row.subtotal_paise) / 100,
      farmer_kisan_id: row.farmer_kisan_id,
      farmer_state: row.farmer_state,
      farmer_district: row.farmer_district,
      buyer_state: row.buyer_state,
      buyer_district: row.buyer_district,
      delivery_confirmed_at: row.delivery_confirmed_at
    };
  }

  function buildChallanHtml(order: any, verificationUrl: string, status: EChallanStatus) {
    const formatDate = (date: Date) => date.toLocaleDateString('en-IN');
    const formatDateTime = (date: Date) => date.toLocaleString('en-IN');

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 30px; }
  .header { display: flex; justify-content: space-between; border-bottom: 3px solid #2d8a4e; padding-bottom: 15px; margin-bottom: 20px; }
  .title { font-size: 22px; font-weight: bold; text-align: center; color: #2d8a4e; margin-bottom: 20px; }
  .section { margin-bottom: 15px; }
  .label { font-weight: bold; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-top: 15px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f0f7f0; }
  .signature-box { border: 2px dashed #ccc; height: 60px; margin-top: 10px; text-align: center; padding-top: 20px; color: #999; }
  .footer { margin-top: 30px; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 10px; }
  .status-badge { background: #2d8a4e; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold; }
</style>
</head>
<body>
  <div class="header">
    <div><strong style="font-size:20px; color:#2d8a4e;">🌾 KisanDirect</strong><br><small>India's Direct Farm-to-Buyer Marketplace</small></div>
    <div style="text-align:right"><strong>e-CHALLAN</strong><br>Order: ${order.order_id}<br>Date: ${formatDate(new Date())}</div>
  </div>
  <div class="title">DIGITAL DELIVERY RECEIPT (e-CHALLAN)</div>
  <table>
    <tr><th colspan="2">Produce Details</th></tr>
    <tr><td class="label">Crop Type</td><td>${order.crop_type_display}</td></tr>
    <tr><td class="label">Quantity</td><td>${order.quantity_kg} kg</td></tr>
    <tr><td class="label">Agreed Price</td><td>₹${(order.agreed_price_paise / 100).toFixed(2)} per kg</td></tr>
    <tr><td class="label">Total Value</td><td>₹${(order.subtotal_paise / 100).toFixed(2)}</td></tr>
    <tr><td class="label">Harvest Date</td><td>${order.harvest_date ?? 'N/A'}</td></tr>
    <tr><td class="label">Grade</td><td>${order.grade || 'Self-declared'}</td></tr>
  </table>
  <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
    <div>
      <strong>SELLER (Farmer)</strong>
      <p>KisanID: ${order.farmer_kisan_id || 'N/A'}<br>
      District: ${order.farmer_district || 'N/A'}, ${order.farmer_state || 'N/A'}<br>
      <em>(Identity protected per DPDP Act 2023)</em></p>
      <div class="signature-box">Farmer Digital Signature<br><small>${order.farmer_signed_at ? formatDateTime(new Date(order.farmer_signed_at)) : 'Pending'}</small></div>
    </div>
    <div>
      <strong>BUYER</strong>
      <p>Name: ${order.buyer_name || 'Buyer'}<br>
      District: ${order.buyer_district || 'N/A'}<br>
      ${order.buyer_gstin ? `GSTIN: ${order.buyer_gstin}` : ''}</p>
      <div class="signature-box">Buyer Digital Signature<br><small>${order.buyer_verified_at ? formatDateTime(new Date(order.buyer_verified_at)) : 'Pending'}</small></div>
    </div>
  </div>
  <div style="margin-top: 20px; text-align: center;">
    <p>Verify this e-Challan at: <strong>${verificationUrl}</strong></p>
    <p>Status: <span class="status-badge">${status}</span></p>
  </div>
  <div class="footer">
    This is a legally admissible digital document. Generated by KisanDirect Platform.<br>
    Stored securely for 7 years per Indian record-keeping regulations.<br>
    For disputes, contact: support@kisandirect.in | Order ID: ${order.order_id}
  </div>
</body>
</html>`;
  }

  async function generatePdfBuffer(html: string) {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' } });
    await browser.close();
    return pdfBuffer;
  }

  return { createEChallan, signEChallan, verifyEChallanOtp, getEChallanByToken };
}
