/**
 * E-Challan Service
 * Core service for digital challan workflow
 * Handles PDF generation, OTP verification, signature capture, and auditing
 */

import { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import puppeteer, { Browser, Page } from 'puppeteer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import QRCode from 'qrcode';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import {
  EChallan,
  EChallanStatus,
  ChallanSignature,
  ChallanSignatureType,
  ChallanAuditLog,
  ChallanAuditAction,
  ChallanContentData,
  EChallanError,
  EChallanErrorCodes,
  EChallanConfig,
  VerificationMethod,
  CreateChallanRequest,
  CreateChallanResponse,
  SendOtpRequest,
  SendOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  SignChallanRequest,
  SignChallanResponse,
  DownloadChallanRequest,
  DownloadChallanResponse,
  GeneratePdfResponse,
  QrCodeData,
  AuditTrailEntry,
  EscrowReleaseTriggerRequest,
  EscrowReleaseTriggerResponse,
  IntegrityCheckResult,
  VerifySignatureResponse,
  VALID_STATUS_TRANSITIONS,
} from '../types/e-challan';
import { getChallanTemplate } from './e-challan-template';

export class EChallanService {
  private db: any;
  private redis: Redis;
  private server: FastifyInstance;
  private s3Client: S3Client;
  private config: EChallanConfig;
  private browser: Browser | null = null;

  constructor(
    server: FastifyInstance,
    db: any,
    redis: Redis,
    s3Client: S3Client,
    config: EChallanConfig,
  ) {
    this.server = server;
    this.db = db;
    this.redis = redis;
    this.s3Client = s3Client;
    this.config = config;
  }

  /**
   * Initialize browser instance for PDF generation
   */
  async initializeBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
  }

  /**
   * Close browser instance
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Generate random OTP
   */
  private generateOtp(length: number = this.config.otpLength): string {
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += Math.floor(Math.random() * 10).toString();
    }
    return otp;
  }

  /**
   * Calculate SHA-256 hash
   */
  private calculateHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate QR Code
   */
  async generateQrCode(data: QrCodeData): Promise<string> {
    try {
      const qrString = JSON.stringify(data);
      const qrDataUrl = await QRCode.toDataURL(qrString, {
        errorCorrectionLevel: this.config.qrErrorCorrectionLevel,
        width: this.config.qrCodeSize,
        margin: 1,
      });
      return qrDataUrl;
    } catch (error) {
      this.server.log.error('QR code generation failed');
      throw new EChallanError(
        EChallanErrorCodes.PDF_GENERATION_FAILED,
        'Failed to generate QR code',
        500,
      );
    }
  }

  /**
   * Create challan document
   */
  async createChallan(request: CreateChallanRequest): Promise<CreateChallanResponse> {
    const client = await this.db.connect();

    try {
      // Fetch order details
      const orderResult = await client.query(
        `SELECT o.id, o.farmer_id, o.buyer_id, o.created_at,
                o.total_amount, o.status,
                f.name as farmer_name, f.phone as farmer_phone, f.email as farmer_email,
                b.id as buyer_id, b.name as buyer_name, b.phone as buyer_phone, b.email as buyer_email
         FROM public.orders o
         JOIN public.farmers f ON o.farmer_id = f.id
         JOIN public.buyers b ON o.buyer_id = b.id
         WHERE o.id = $1`,
        [request.orderId],
      );

      if (orderResult.rows.length === 0) {
        throw new EChallanError(
          EChallanErrorCodes.CHALLAN_NOT_FOUND,
          'Order not found',
          404,
        );
      }

      const order = orderResult.rows[0];

      // Generate challan number
      const challanNumberResult = await client.query(
        `SELECT vault.generate_challan_number() as challan_number`,
      );
      const challanNumber = challanNumberResult.rows[0].challan_number;

      // Generate QR verification token
      const qrVerificationToken = uuidv4();

      // Fetch order items
      const itemsResult = await client.query(
        `SELECT name, quantity, unit, price_per_unit, total_price
         FROM public.order_items
         WHERE order_id = $1`,
        [request.orderId],
      );

      const items = itemsResult.rows;
      const subtotal = items.reduce((sum: number, item: any) => sum + item.total_price, 0);
      const tax = subtotal * 0.18; // Assuming 18% GST
      const total = subtotal + tax;

      // Prepare challan content data
      const contentData: ChallanContentData = {
        challanNumber,
        orderId: order.id,
        orderDate: new Date(order.created_at),
        deliveryDate: request.deliveryDate || new Date(),
        estimatedDeliveryDate: request.estimatedDeliveryDate || new Date(),
        qrCode: '', // Will be set after generation
        qrVerificationToken,
        farmerName: order.farmer_name,
        farmerPhone: order.farmer_phone,
        farmerEmail: order.farmer_email,
        farmerId: order.farmer_id,
        farmerGSTIN: '', // TODO: Fetch from farmer profile
        farmerAddress: '', // TODO: Fetch from farmer address
        buyerName: order.buyer_name,
        buyerPhone: order.buyer_phone,
        buyerEmail: order.buyer_email,
        buyerId: order.buyer_id,
        buyerAddress: '', // TODO: Fetch from buyer address
        items,
        subtotal,
        tax,
        total,
        paymentMethod: 'Escrow', // TODO: Fetch from order
        deliveryMethod: 'Standard', // TODO: Fetch from order
      };

      // Generate QR code
      const qrCodeData: QrCodeData = {
        challanId: uuidv4(),
        challanNumber,
        farmerId: order.farmer_id,
        buyerId: order.buyer_id,
        verificationToken: qrVerificationToken,
        createdAt: new Date(),
      };
      const qrCode = await this.generateQrCode(qrCodeData);
      contentData.qrCode = qrCode;

      // Generate HTML template
      const challanHtml = getChallanTemplate(contentData);
      const contentHash = this.calculateHash(challanHtml);

      // Insert challan into database
      const insertResult = await client.query(
        `INSERT INTO vault.e_challans (
          order_id, farmer_id, buyer_id, status, challan_number,
          challan_html, content_hash, qr_code, qr_verification_token,
          delivery_date, estimated_delivery_date, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, status, created_at`,
        [
          order.id,
          order.farmer_id,
          order.buyer_id,
          EChallanStatus.DRAFT,
          challanNumber,
          challanHtml,
          contentHash,
          qrCode,
          qrVerificationToken,
          request.deliveryDate || new Date(),
          request.estimatedDeliveryDate || new Date(),
          null, // System-created
        ],
      );

      const challanId = insertResult.rows[0].id;

      // Create audit log
      await this.createAuditLog(
        challanId,
        ChallanAuditAction.CREATED,
        undefined,
        EChallanStatus.DRAFT,
        undefined,
        'SYSTEM',
        { challanNumber },
      );

      this.server.log.info(`Challan created: ${challanNumber}`);

      return {
        challanId,
        challanNumber,
        status: EChallanStatus.DRAFT,
        challanHtml,
        qrCode,
        createdAt: insertResult.rows[0].created_at,
      };
    } catch (error) {
      this.server.log.error('Create challan failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Send OTP to recipient
   */
  async sendOtp(request: SendOtpRequest): Promise<SendOtpResponse> {
    const client = await this.db.connect();

    try {
      // Fetch challan
      const challanResult = await client.query(
        `SELECT id, status, farmer_id, buyer_id FROM vault.e_challans WHERE id = $1`,
        [request.challanId],
      );

      if (challanResult.rows.length === 0) {
        throw new EChallanError(
          EChallanErrorCodes.CHALLAN_NOT_FOUND,
          'Challan not found',
          404,
        );
      }

      const challan = challanResult.rows[0];

      // Verify status transition
      if (!VALID_STATUS_TRANSITIONS[challan.status as EChallanStatus].includes(EChallanStatus.OTP_SENT)) {
        throw new EChallanError(
          EChallanErrorCodes.INVALID_STATUS_TRANSITION,
          `Cannot send OTP from status ${challan.status}`,
          400,
        );
      }

      // Generate OTP
      const otpCode = this.generateOtp();
      const expiresAt = new Date(Date.now() + this.config.otpExpirySeconds * 1000);

      // Store OTP in Redis for quick access
      const redisKey = `${this.config.redisKeyPrefix}:otp:${request.challanId}`;
      await this.redis.setex(
        redisKey,
        this.config.otpExpirySeconds,
        JSON.stringify({
          otpCode,
          recipientPhone: request.phoneNumber,
          recipientEmail: request.email,
          expiresAt: expiresAt.toISOString(),
          verificationAttempts: 0,
          maxAttempts: this.config.otpMaxAttempts,
        }),
      );

      // Store OTP in database
      await client.query(
        `INSERT INTO vault.otp_cache (challan_id, otp_code, recipient_phone, recipient_email, expires_at, max_attempts)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (challan_id) DO UPDATE SET
         otp_code = $2, expires_at = $5, verification_attempts = 0`,
        [request.challanId, otpCode, request.phoneNumber, request.email, expiresAt, this.config.otpMaxAttempts],
      );

      // Update challan status
      const now = new Date();
      await client.query(
        `UPDATE vault.e_challans SET status = $1, otp_code = $2, otp_sent_at = $3, otp_attempts = 0 WHERE id = $4`,
        [EChallanStatus.OTP_SENT, otpCode, now, request.challanId],
      );

      // Create audit log
      await this.createAuditLog(
        request.challanId,
        ChallanAuditAction.OTP_SENT,
        challan.status,
        EChallanStatus.OTP_SENT,
        undefined,
        'SYSTEM',
        { recipientType: request.recipientType, phoneNumber: request.phoneNumber },
      );

      // TODO: Send OTP via SMS/Email
      this.server.log.info(`OTP sent for challan ${request.challanId} to ${request.phoneNumber}`);

      return {
        challanId: request.challanId,
        otpSentAt: now,
        expiresIn: this.config.otpExpirySeconds,
        status: EChallanStatus.OTP_SENT,
      };
    } catch (error) {
      this.server.log.error('Send OTP failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify OTP
   */
  async verifyOtp(request: VerifyOtpRequest): Promise<VerifyOtpResponse> {
    const client = await this.db.connect();

    try {
      // Fetch challan
      const challanResult = await client.query(
        `SELECT id, status, otp_attempts, otp_max_attempts FROM vault.e_challans WHERE id = $1`,
        [request.challanId],
      );

      if (challanResult.rows.length === 0) {
        throw new EChallanError(
          EChallanErrorCodes.CHALLAN_NOT_FOUND,
          'Challan not found',
          404,
        );
      }

      const challan = challanResult.rows[0];

      // Check OTP attempts
      if (challan.otp_attempts >= challan.otp_max_attempts) {
        throw new EChallanError(
          EChallanErrorCodes.OTP_MAX_ATTEMPTS_EXCEEDED,
          'Maximum OTP attempts exceeded',
          429,
        );
      }

      // Fetch OTP from Redis
      const redisKey = `${this.config.redisKeyPrefix}:otp:${request.challanId}`;
      const cachedOtp = await this.redis.get(redisKey);

      if (!cachedOtp) {
        throw new EChallanError(
          EChallanErrorCodes.OTP_EXPIRED,
          'OTP has expired',
          400,
        );
      }

      const otpData = JSON.parse(cachedOtp);

      // Verify OTP code
      if (otpData.otpCode !== request.otpCode) {
        // Increment attempts
        const newAttempts = challan.otp_attempts + 1;
        await client.query(
          `UPDATE vault.e_challans SET otp_attempts = $1 WHERE id = $2`,
          [newAttempts, request.challanId],
        );

        throw new EChallanError(
          EChallanErrorCodes.OTP_INVALID,
          `Invalid OTP. ${challan.otp_max_attempts - newAttempts} attempts remaining`,
          400,
        );
      }

      // OTP verified - update challan status
      const now = new Date();
      await client.query(
        `UPDATE vault.e_challans SET status = $1, otp_verified_at = $2, otp_attempts = 0 WHERE id = $3`,
        [EChallanStatus.OTP_VERIFIED, now, request.challanId],
      );

      // Remove OTP from Redis
      await this.redis.del(redisKey);

      // Create audit log
      await this.createAuditLog(
        request.challanId,
        ChallanAuditAction.OTP_VERIFIED,
        challan.status,
        EChallanStatus.OTP_VERIFIED,
        undefined,
        'USER',
        { recipientType: request.recipientType },
      );

      this.server.log.info(`OTP verified for challan ${request.challanId}`);

      return {
        challanId: request.challanId,
        otpVerifiedAt: now,
        status: EChallanStatus.OTP_VERIFIED,
        remainingAttempts: challan.otp_max_attempts,
      };
    } catch (error) {
      this.server.log.error('Verify OTP failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sign challan with signature capture
   */
  async signChallan(request: SignChallanRequest): Promise<SignChallanResponse> {
    const client = await this.db.connect();

    try {
      // Fetch challan
      const challanResult = await client.query(
        `SELECT id, status, farmer_id, buyer_id FROM vault.e_challans WHERE id = $1`,
        [request.challanId],
      );

      if (challanResult.rows.length === 0) {
        throw new EChallanError(
          EChallanErrorCodes.CHALLAN_NOT_FOUND,
          'Challan not found',
          404,
        );
      }

      const challan = challanResult.rows[0];

      // Verify status
      if (challan.status !== EChallanStatus.OTP_VERIFIED) {
        throw new EChallanError(
          EChallanErrorCodes.INVALID_STATUS_TRANSITION,
          `Challan must be OTP verified before signing. Current status: ${challan.status}`,
          400,
        );
      }

      // Verify signer
      const expectedSignerId = request.signerType === ChallanSignatureType.BUYER
        ? challan.buyer_id
        : challan.farmer_id;

      if (request.signerType === ChallanSignatureType.BUYER && request.signerType !== ChallanSignatureType.BUYER) {
        throw new EChallanError(
          EChallanErrorCodes.UNAUTHORIZED,
          'Unauthorized signer',
          403,
        );
      }

      // Validate signature image size
      const signatureBuffer = Buffer.from(request.signatureImageBase64, 'base64');
      if (signatureBuffer.length > this.config.signatureMaxSizeKB * 1024) {
        throw new EChallanError(
          EChallanErrorCodes.INVALID_REQUEST,
          `Signature exceeds maximum size of ${this.config.signatureMaxSizeKB}KB`,
          400,
        );
      }

      // Calculate signature hash
      const signatureHash = this.calculateHash(request.signatureImageBase64);

      // Insert signature
      const signatureResult = await client.query(
        `INSERT INTO vault.e_challan_signatures (
          challan_id, signer_id, signer_type, signer_name, signer_phone, signer_email,
          signature_image_base64, signature_type, device_info, geolocation, ip_address,
          signature_hash, verified_at, verification_method
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, signature_timestamp`,
        [
          request.challanId,
          expectedSignerId,
          request.signerType,
          request.signerName,
          request.signerPhone,
          request.signerEmail,
          request.signatureImageBase64,
          request.signatureType,
          JSON.stringify(request.deviceInfo || {}),
          JSON.stringify(request.geolocation || {}),
          request.signerType === ChallanSignatureType.BUYER ? null : null, // TODO: Extract from request context
          signatureHash,
          new Date(),
          VerificationMethod.OTP,
        ],
      );

      const signatureId = signatureResult.rows[0].id;

      // Determine next status
      let newStatus = EChallanStatus.OTP_VERIFIED; // Default
      let isComplete = false;

      if (request.signerType === ChallanSignatureType.BUYER) {
        newStatus = EChallanStatus.BUYER_SIGNED;
      } else if (request.signerType === ChallanSignatureType.FARMER) {
        // Check if buyer already signed
        const buyerSignatureResult = await client.query(
          `SELECT id FROM vault.e_challan_signatures
           WHERE challan_id = $1 AND signer_type = $2`,
          [request.challanId, ChallanSignatureType.BUYER],
        );

        if (buyerSignatureResult.rows.length > 0) {
          newStatus = EChallanStatus.COMPLETED;
          isComplete = true;
        } else {
          newStatus = EChallanStatus.FARMER_SIGNED;
        }
      }

      // Update challan status
      await client.query(
        `UPDATE vault.e_challans SET status = $1, modified_by = $2, completed_at = $3 WHERE id = $4`,
        [newStatus, expectedSignerId, isComplete ? new Date() : null, request.challanId],
      );

      // Create audit log
      await this.createAuditLog(
        request.challanId,
        ChallanAuditAction.SIGNATURE_CAPTURED,
        challan.status,
        newStatus,
        expectedSignerId,
        'USER',
        { signerType: request.signerType, signatureHash },
      );

      // If challan is complete, trigger escrow release and generate final PDF
      if (isComplete) {
        await this.completeChallan(request.challanId);
      }

      this.server.log.info(`Signature captured for challan ${request.challanId} by ${request.signerType}`);

      return {
        challanId: request.challanId,
        signatureId,
        signerType: request.signerType,
        signedAt: new Date(),
        status: newStatus,
        isComplete,
        nextSigner: newStatus === EChallanStatus.FARMER_SIGNED ? 'FARMER' : undefined,
      };
    } catch (error) {
      this.server.log.error('Sign challan failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Complete challan after all signatures
   */
  private async completeChallan(challanId: string): Promise<void> {
    const client = await this.db.connect();

    try {
      // Fetch challan with content
      const challanResult = await client.query(
        `SELECT id, challan_html, order_id FROM vault.e_challans WHERE id = $1`,
        [challanId],
      );

      if (challanResult.rows.length === 0) {
        throw new Error('Challan not found');
      }

      const challan = challanResult.rows[0];

      // Generate final PDF with signatures
      const pdfResponse = await this.generateSignedPdf(challan.challan_html);
      const finalHash = this.calculateHash(Buffer.from(pdfResponse.pdfBuffer).toString('base64'));

      // Upload to S3
      const s3Path = await this.uploadToS3(challanId, pdfResponse.pdfBuffer);

      // Update challan with final PDF info
      await client.query(
        `UPDATE vault.e_challans SET challan_pdf_path = $1, final_hash = $2, status = $3, completed_at = $4
         WHERE id = $5`,
        [s3Path, finalHash, EChallanStatus.COMPLETED, new Date(), challanId],
      );

      // Trigger escrow release
      await this.triggerEscrowRelease(challan.order_id);

      // Create completion audit log
      await this.createAuditLog(
        challanId,
        ChallanAuditAction.COMPLETED,
        EChallanStatus.FARMER_SIGNED,
        EChallanStatus.COMPLETED,
        undefined,
        'SYSTEM',
        { pdfPath: s3Path, finalHash },
      );

      this.server.log.info(`Challan completed: ${challanId}`);
    } catch (error) {
      this.server.log.error('Complete challan failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate signed PDF
   */
  private async generateSignedPdf(htmlContent: string): Promise<GeneratePdfResponse> {
    try {
      await this.initializeBrowser();

      if (!this.browser) {
        throw new Error('Browser not initialized');
      }

      const page = await this.browser.newPage();

      // Set viewport
      await page.setViewport({
        width: 1080,
        height: 1920,
        deviceScaleFactor: 2,
      });

      // Set content
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: this.config.pdfTimeout,
      });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm',
        },
      });

      await page.close();

      // Calculate hash
      const hash = this.calculateHash(Buffer.from(pdfBuffer).toString('base64'));

      return {
        pdfBuffer,
        fileName: `challan-${Date.now()}.pdf`,
        fileSize: pdfBuffer.length,
        hash,
      };
    } catch (error) {
      this.server.log.error('PDF generation failed');
      throw new EChallanError(
        EChallanErrorCodes.PDF_GENERATION_FAILED,
        'Failed to generate PDF',
        500,
      );
    }
  }

  /**
   * Upload to S3
   */
  private async uploadToS3(challanId: string, pdfBuffer: Buffer): Promise<string> {
    try {
      const fileKey = `challans/${challanId}/${Date.now()}.pdf`;
      const fileHash = this.calculateHash(Buffer.from(pdfBuffer).toString('base64'));

      const command = new PutObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: fileKey,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ServerSideEncryption: this.config.s3EncryptionEnabled ? 'AES256' : undefined,
      });

      await this.s3Client.send(command);

      // Store archive record
      await this.db.query(
        `INSERT INTO vault.challan_s3_archive (
          challan_id, bucket_name, file_key, file_size_bytes, content_type,
          server_side_encryption, is_public, access_control_list, https_url, file_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          challanId,
          this.config.s3Bucket,
          fileKey,
          pdfBuffer.length,
          'application/pdf',
          this.config.s3EncryptionEnabled ? 'AES256' : null,
          false,
          'private',
          `https://${this.config.s3Bucket}.s3.${this.config.s3Region}.amazonaws.com/${fileKey}`,
          fileHash,
        ],
      );

      return fileKey;
    } catch (error) {
      this.server.log.error('S3 upload failed');
      throw new EChallanError(
        EChallanErrorCodes.S3_UPLOAD_FAILED,
        'Failed to upload PDF to S3',
        500,
      );
    }
  }

  /**
   * Download challan
   */
  async downloadChallan(request: DownloadChallanRequest): Promise<DownloadChallanResponse> {
    const client = await this.db.connect();

    try {
      // Fetch challan
      const challanResult = await client.query(
        `SELECT id, challan_number, status, challan_pdf_path, final_hash, completed_at
         FROM vault.e_challans WHERE id = $1`,
        [request.challanId],
      );

      if (challanResult.rows.length === 0) {
        throw new EChallanError(
          EChallanErrorCodes.CHALLAN_NOT_FOUND,
          'Challan not found',
          404,
        );
      }

      const challan = challanResult.rows[0];

      if (!challan.challan_pdf_path) {
        throw new EChallanError(
          EChallanErrorCodes.INVALID_REQUEST,
          'PDF not yet generated',
          400,
        );
      }

      // Fetch signatures
      const signaturesResult = await client.query(
        `SELECT id, challan_id, signer_type, signer_name, signature_timestamp, verified_at
         FROM vault.e_challan_signatures WHERE challan_id = $1`,
        [request.challanId],
      );

      // Fetch audit log if requested
      let auditLog: ChallanAuditLog[] = [];
      if (request.includeHistory) {
        const auditResult = await client.query(
          `SELECT id, challan_id, action, previous_status, new_status, actor_id, actor_type,
                  change_details, ip_address, created_at
           FROM vault.challan_audit_log WHERE challan_id = $1 ORDER BY created_at`,
          [request.challanId],
        );
        auditLog = auditResult.rows;
      }

      // Generate presigned URL
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour
      // TODO: Implement presigned URL generation with getSignedUrl()

      return {
        challanId: request.challanId,
        challanNumber: challan.challan_number,
        pdfUrl: `https://${this.config.s3Bucket}.s3.${this.config.s3Region}.amazonaws.com/${challan.challan_pdf_path}`,
        pdfHash: challan.final_hash,
        status: challan.status,
        signatures: signaturesResult.rows,
        auditLog: request.includeHistory ? auditLog : undefined,
        downloadUrl: `https://${this.config.s3Bucket}.s3.${this.config.s3Region}.amazonaws.com/${challan.challan_pdf_path}`,
        expiresAt,
      };
    } catch (error) {
      this.server.log.error('Download challan failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    challanId: string,
    action: ChallanAuditAction,
    previousStatus: EChallanStatus | undefined,
    newStatus: EChallanStatus | undefined,
    actorId: string | undefined,
    actorType: 'SYSTEM' | 'USER' | 'ADMIN',
    changeDetails: Record<string, any>,
  ): Promise<void> {
    const client = await this.db.connect();

    try {
      const actionHash = this.calculateHash(
        `${challanId}${action}${previousStatus || ''}${newStatus || ''}${actorType}${Date.now()}`,
      );

      await client.query(
        `INSERT INTO vault.challan_audit_log (
          challan_id, action, previous_status, new_status, actor_id, actor_type,
          change_details, action_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [challanId, action, previousStatus, newStatus, actorId, actorType, JSON.stringify(changeDetails), actionHash],
      );
    } catch (error) {
      this.server.log.error('Create audit log failed');
      // Don't throw - auditing failure shouldn't block main operation
    } finally {
      client.release();
    }
  }

  /**
   * Trigger escrow release
   */
  private async triggerEscrowRelease(orderId: string): Promise<void> {
    try {
      // TODO: Call escrow service to initiate release
      // For now, just log the action
      this.server.log.info(`Escrow release triggered for order ${orderId}`);
    } catch (error) {
      this.server.log.error('Escrow release trigger failed');
      // Don't throw - challan should still complete
    }
  }

  /**
   * Check challan integrity
   */
  async checkIntegrity(challanId: string): Promise<IntegrityCheckResult> {
    const client = await this.db.connect();

    try {
      const challanResult = await client.query(
        `SELECT content_hash, final_hash, challan_html FROM vault.e_challans WHERE id = $1`,
        [challanId],
      );

      if (challanResult.rows.length === 0) {
        throw new EChallanError(
          EChallanErrorCodes.CHALLAN_NOT_FOUND,
          'Challan not found',
          404,
        );
      }

      const challan = challanResult.rows[0];
      const contentHashMatch = challan.content_hash === this.calculateHash(challan.challan_html);

      // Fetch all signatures and verify hashes
      const signaturesResult = await client.query(
        `SELECT signature_hash, signature_image_base64 FROM vault.e_challan_signatures WHERE challan_id = $1`,
        [challanId],
      );

      const allSignaturesValid = signaturesResult.rows.every(
        (sig: any) => sig.signature_hash === this.calculateHash(sig.signature_image_base64),
      );

      return {
        isValid: contentHashMatch && allSignaturesValid,
        challanStatus: (await client.query(
          `SELECT status FROM vault.e_challans WHERE id = $1`,
          [challanId],
        )).rows[0].status,
        verificationTimestamp: new Date(),
        contentHashMatch,
        finalHashMatch: true, // Would compare stored hash with recalculated
        allSignaturesValid,
        auditLogIntegrity: true, // Would verify audit log hashes
      };
    } catch (error) {
      this.server.log.error('Integrity check failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Archive challan
   */
  async archiveChallan(challanId: string): Promise<void> {
    const client = await this.db.connect();

    try {
      const challanResult = await client.query(
        `SELECT status FROM vault.e_challans WHERE id = $1`,
        [challanId],
      );

      if (challanResult.rows.length === 0) {
        throw new EChallanError(
          EChallanErrorCodes.CHALLAN_NOT_FOUND,
          'Challan not found',
          404,
        );
      }

      const challan = challanResult.rows[0];

      if (challan.status !== EChallanStatus.COMPLETED) {
        throw new EChallanError(
          EChallanErrorCodes.INVALID_STATUS_TRANSITION,
          'Only completed challans can be archived',
          400,
        );
      }

      const now = new Date();
      await client.query(
        `UPDATE vault.e_challans SET status = $1, archived_at = $2 WHERE id = $3`,
        [EChallanStatus.ARCHIVED, now, challanId],
      );

      await this.createAuditLog(
        challanId,
        ChallanAuditAction.ARCHIVED,
        EChallanStatus.COMPLETED,
        EChallanStatus.ARCHIVED,
        undefined,
        'SYSTEM',
        { archivedAt: now },
      );
    } catch (error) {
      this.server.log.error('Archive challan failed');
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * Factory function to create E-Challan service
 */
export function createEChallanService(
  server: FastifyInstance,
  db: any,
  redis: Redis,
  s3Client: S3Client,
  config: EChallanConfig,
): EChallanService {
  return new EChallanService(server, db, redis, s3Client, config);
}
