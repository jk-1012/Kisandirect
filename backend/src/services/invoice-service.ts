import puppeteer from 'puppeteer';
import { FastifyInstance } from 'fastify';

export function createInvoiceService(server: FastifyInstance) {
  async function generateGSTInvoice(orderId: string) {
    const res = await server.db.query(
      `SELECT o.*, l.crop_type, u.phone as buyer_phone, f.kisan_id as farmer_kisan_id
       FROM public.orders o
       JOIN public.listings l ON l.id = o.listing_id
       LEFT JOIN public.users u ON u.id = o.buyer_id
       LEFT JOIN public.farmer_profiles f ON f.user_id = o.farmer_id
       WHERE o.order_id = $1`,
      [orderId]
    );
    const order = res.rows[0];
    if (!order) throw server.httpErrors.notFound('Order not found');

    const html = `<html><body><h1>Invoice ${order.order_id}</h1><p>Amount: ₹${(order.total_paise/100).toFixed(2)}</p></body></html>`;
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    // store to S3 if available
    try {
      const s3Key = `invoices/${order.order_id}/invoice.pdf`;
      await server.storage.s3Client.send({
        // @ts-ignore PutObjectCommand type
        Bucket: server.storage.bucketName,
        Key: s3Key,
        Body: pdf,
        ContentType: 'application/pdf',
        ACL: 'private'
      } as any);
    } catch (err) {
      server.log.warn({ err }, 'storing invoice to S3 failed');
    }

    return pdf;
  }

  return { generateGSTInvoice };
}

export type InvoiceService = ReturnType<typeof createInvoiceService>;
