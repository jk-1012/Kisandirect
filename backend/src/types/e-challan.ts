/**
 * E-Challan Type Definitions
 * Complete type system for digital challan workflow
 */

/**
 * Enums for Challan Status
 */
export enum EChallanStatus {
  DRAFT = 'DRAFT',
  OTP_SENT = 'OTP_SENT',
  OTP_VERIFIED = 'OTP_VERIFIED',
  BUYER_SIGNED = 'BUYER_SIGNED',
  FARMER_SIGNED = 'FARMER_SIGNED',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
  CANCELLED = 'CANCELLED',
}

/**
 * Enum for Signature Types
 */
export enum ChallanSignatureType {
  BUYER = 'BUYER',
  FARMER = 'FARMER',
  DELIVERY_AGENT = 'DELIVERY_AGENT',
}

/**
 * Enum for Signature Input Methods
 */
export enum SignatureInputMethod {
  CANVAS = 'canvas', // Digital signature drawn on touchscreen/mouse
  TYPED = 'typed', // Typed signature text
  PHOTO = 'photo', // Photo of signature
}

/**
 * Enum for Audit Actions
 */
export enum ChallanAuditAction {
  CREATED = 'CREATED',
  OTP_SENT = 'OTP_SENT',
  OTP_VERIFIED = 'OTP_VERIFIED',
  SIGNATURE_CAPTURED = 'SIGNATURE_CAPTURED',
  BUYER_SIGNED = 'BUYER_SIGNED',
  FARMER_SIGNED = 'FARMER_SIGNED',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
  CANCELLED = 'CANCELLED',
  INTEGRITY_VERIFIED = 'INTEGRITY_VERIFIED',
  TAMPER_DETECTED = 'TAMPER_DETECTED',
}

/**
 * Enum for Verification Methods
 */
export enum VerificationMethod {
  OTP = 'OTP',
  BIOMETRIC = 'BIOMETRIC',
  MANUAL = 'MANUAL',
}

/**
 * Challan Status Transition Map
 */
export const VALID_STATUS_TRANSITIONS: Record<EChallanStatus, EChallanStatus[]> = {
  [EChallanStatus.DRAFT]: [EChallanStatus.OTP_SENT, EChallanStatus.CANCELLED],
  [EChallanStatus.OTP_SENT]: [EChallanStatus.OTP_VERIFIED, EChallanStatus.CANCELLED],
  [EChallanStatus.OTP_VERIFIED]: [EChallanStatus.BUYER_SIGNED, EChallanStatus.CANCELLED],
  [EChallanStatus.BUYER_SIGNED]: [EChallanStatus.FARMER_SIGNED, EChallanStatus.CANCELLED],
  [EChallanStatus.FARMER_SIGNED]: [EChallanStatus.COMPLETED, EChallanStatus.CANCELLED],
  [EChallanStatus.COMPLETED]: [EChallanStatus.ARCHIVED],
  [EChallanStatus.ARCHIVED]: [],
  [EChallanStatus.CANCELLED]: [],
};

/**
 * Core E-Challan Document
 */
export interface EChallan {
  id: string;
  orderId: string;
  farmerId: string;
  buyerId: string;
  status: EChallanStatus;
  challanNumber: string;
  challanHtml?: string;
  challanPdfPath?: string;
  otpCode?: string;
  otpSentAt?: Date;
  otpVerifiedAt?: Date;
  otpAttempts: number;
  otpMaxAttempts: number;
  qrCode?: string;
  qrVerificationToken?: string;
  qrVerifiedAt?: Date;
  contentHash: string;
  finalHash?: string;
  delivery_date?: Date;
  estimatedDeliveryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  archivedAt?: Date;
  createdBy?: string;
  modifiedBy?: string;
}

/**
 * Challan Signature Entry
 */
export interface ChallanSignature {
  id: string;
  challanId: string;
  signerId: string;
  signerType: ChallanSignatureType;
  signerName: string;
  signerPhone?: string;
  signerEmail?: string;
  signatureImageBase64: string;
  signatureType: SignatureInputMethod;
  signatureTimestamp: Date;
  deviceInfo?: {
    userAgent: string;
    platform: string;
    resolution: string;
  };
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  ipAddress?: string;
  signatureHash: string;
  verifiedAt?: Date;
  verificationMethod?: VerificationMethod;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Challan Audit Log Entry (Immutable)
 */
export interface ChallanAuditLog {
  id: string;
  challanId: string;
  action: ChallanAuditAction;
  previousStatus?: EChallanStatus;
  newStatus?: EChallanStatus;
  actorId?: string;
  actorType: 'SYSTEM' | 'USER' | 'ADMIN';
  changeDetails?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  actionHash: string;
  createdAt: Date;
}

/**
 * OTP Cache Entry
 */
export interface OtpCache {
  id: string;
  challanId: string;
  otpCode: string;
  recipientPhone: string;
  recipientEmail?: string;
  expiresAt: Date;
  verificationAttempts: number;
  maxAttempts: number;
  createdAt: Date;
}

/**
 * S3 Archive Record
 */
export interface ChallanS3Archive {
  id: string;
  challanId: string;
  bucketName: string;
  fileKey: string;
  fileSizeBytes: number;
  contentType: string;
  etag: string;
  serverSideEncryption: string;
  encryptionKeyId?: string;
  isPublic: boolean;
  accessControlList: 'private' | 'public-read' | 'authenticated-read';
  httpsUrl: string;
  expiresAt?: Date;
  fileHash: string;
  uploadedAt: Date;
  lastAccessedAt?: Date;
  updatedAt: Date;
}

/**
 * Challan Summary View
 */
export interface ChallanSummary {
  id: string;
  orderId: string;
  challanNumber: string;
  status: EChallanStatus;
  farmerId: string;
  buyerId: string;
  signatureCount: number;
  auditLogCount: number;
  createdAt: Date;
  completedAt?: Date;
  archivedAt?: Date;
  processingHours: number;
}

/**
 * Request: Create Challan
 */
export interface CreateChallanRequest {
  orderId: string;
  deliveryDate?: Date;
  estimatedDeliveryDate?: Date;
}

/**
 * Response: Create Challan
 */
export interface CreateChallanResponse {
  challanId: string;
  challanNumber: string;
  status: EChallanStatus;
  challanHtml: string;
  qrCode: string;
  createdAt: Date;
}

/**
 * Request: Send OTP
 */
export interface SendOtpRequest {
  challanId: string;
  recipientType: 'BUYER' | 'FARMER';
  phoneNumber: string;
  email?: string;
}

/**
 * Response: Send OTP
 */
export interface SendOtpResponse {
  challanId: string;
  otpSentAt: Date;
  expiresIn: number; // seconds
  status: EChallanStatus;
}

/**
 * Request: Verify OTP
 */
export interface VerifyOtpRequest {
  challanId: string;
  otpCode: string;
  recipientType: 'BUYER' | 'FARMER';
}

/**
 * Response: Verify OTP
 */
export interface VerifyOtpResponse {
  challanId: string;
  otpVerifiedAt: Date;
  status: EChallanStatus;
  remainingAttempts: number;
}

/**
 * Request: Sign Challan
 */
export interface SignChallanRequest {
  challanId: string;
  signerName: string;
  signerPhone: string;
  signerEmail?: string;
  signatureImageBase64: string;
  signatureType: SignatureInputMethod;
  signerType: ChallanSignatureType;
  deviceInfo?: {
    userAgent: string;
    platform: string;
    resolution: string;
  };
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

/**
 * Response: Sign Challan
 */
export interface SignChallanResponse {
  challanId: string;
  signatureId: string;
  signerType: ChallanSignatureType;
  signedAt: Date;
  status: EChallanStatus;
  isComplete: boolean;
  nextSigner?: 'BUYER' | 'FARMER';
}

/**
 * Request: Download Challan
 */
export interface DownloadChallanRequest {
  challanId: string;
  includeHistory?: boolean;
}

/**
 * Response: Download Challan
 */
export interface DownloadChallanResponse {
  challanId: string;
  challanNumber: string;
  pdfUrl: string;
  pdfHash: string;
  status: EChallanStatus;
  signatures: ChallanSignature[];
  auditLog?: ChallanAuditLog[];
  downloadUrl: string;
  expiresAt: Date;
}

/**
 * Challan Content Data (for PDF generation)
 */
export interface ChallanContentData {
  challanNumber: string;
  orderId: string;
  orderDate: Date;
  deliveryDate: Date;
  estimatedDeliveryDate: Date;
  qrCode: string;
  qrVerificationToken: string;
  
  // Farmer Info
  farmerName: string;
  farmerPhone: string;
  farmerEmail: string;
  farmerId: string;
  farmerGSTIN?: string;
  farmerAddress: string;
  
  // Buyer Info
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  buyerId: string;
  buyerAddress: string;
  
  // Order Details
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    totalPrice: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  
  // Additional Info
  paymentMethod: string;
  deliveryMethod: string;
  notes?: string;
}

/**
 * PDF Generation Request
 */
export interface GeneratePdfRequest {
  htmlContent: string;
  fileName: string;
}

/**
 * PDF Generation Response
 */
export interface GeneratePdfResponse {
  pdfBuffer: Buffer;
  fileName: string;
  fileSize: number;
  hash: string;
}

/**
 * QR Code Data
 */
export interface QrCodeData {
  challanId: string;
  challanNumber: string;
  farmerId: string;
  buyerId: string;
  verificationToken: string;
  createdAt: Date;
}

/**
 * Signature Verification Request
 */
export interface VerifySignatureRequest {
  challanId: string;
  signatureHash: string;
}

/**
 * Signature Verification Response
 */
export interface VerifySignatureResponse {
  isValid: boolean;
  verified: boolean;
  verificationTimestamp: Date;
}

/**
 * Challan Integrity Check
 */
export interface IntegrityCheckResult {
  isValid: boolean;
  challanStatus: EChallanStatus;
  verificationTimestamp: Date;
  contentHashMatch: boolean;
  finalHashMatch: boolean;
  allSignaturesValid: boolean;
  auditLogIntegrity: boolean;
}

/**
 * Audit Trail Entry
 */
export interface AuditTrailEntry extends ChallanAuditLog {
  actionSequence: number;
}

/**
 * Escrow Release Trigger Request
 */
export interface EscrowReleaseTriggerRequest {
  challanId: string;
  releaseAmount: number;
  releaseReason: string;
}

/**
 * Escrow Release Trigger Response
 */
export interface EscrowReleaseTriggerResponse {
  challanId: string;
  releaseInitiated: boolean;
  escrowTransactionId?: string;
  releaseScheduledFor?: Date;
}

/**
 * E-Challan Service Interface
 */
export interface IEChallanService {
  // Core operations
  createChallan(request: CreateChallanRequest): Promise<CreateChallanResponse>;
  sendOtp(request: SendOtpRequest): Promise<SendOtpResponse>;
  verifyOtp(request: VerifyOtpRequest): Promise<VerifyOtpResponse>;
  signChallan(request: SignChallanRequest): Promise<SignChallanResponse>;
  downloadChallan(request: DownloadChallanRequest): Promise<DownloadChallanResponse>;
  
  // Utility operations
  generateChallanPdf(contentData: ChallanContentData): Promise<GeneratePdfResponse>;
  generateQrCode(data: QrCodeData): Promise<string>;
  verifySignature(request: VerifySignatureRequest): Promise<VerifySignatureResponse>;
  checkIntegrity(challanId: string): Promise<IntegrityCheckResult>;
  getAuditTrail(challanId: string): Promise<AuditTrailEntry[]>;
  triggerEscrowRelease(request: EscrowReleaseTriggerRequest): Promise<EscrowReleaseTriggerResponse>;
  archiveChallan(challanId: string): Promise<void>;
}

/**
 * Error Types
 */
export class EChallanError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public context?: Record<string, any>,
  ) {
    super(message);
    this.name = 'EChallanError';
  }
}

export const EChallanErrorCodes = {
  CHALLAN_NOT_FOUND: 'CHALLAN_NOT_FOUND',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_MAX_ATTEMPTS_EXCEEDED: 'OTP_MAX_ATTEMPTS_EXCEEDED',
  SIGNATURE_INVALID: 'SIGNATURE_INVALID',
  TAMPER_DETECTED: 'TAMPER_DETECTED',
  PDF_GENERATION_FAILED: 'PDF_GENERATION_FAILED',
  S3_UPLOAD_FAILED: 'S3_UPLOAD_FAILED',
  INTEGRITY_CHECK_FAILED: 'INTEGRITY_CHECK_FAILED',
  ESCROW_RELEASE_FAILED: 'ESCROW_RELEASE_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_REQUEST: 'INVALID_REQUEST',
};

/**
 * Configuration Interface
 */
export interface EChallanConfig {
  // OTP
  otpLength: number; // Default: 6
  otpExpirySeconds: number; // Default: 300 (5 minutes)
  otpMaxAttempts: number; // Default: 3
  
  // PDF
  pdfTimeout: number; // Puppeteer timeout in ms
  pdfWidth: number; // Default: 210 (A4 width in mm)
  pdfHeight: number; // Default: 297 (A4 height in mm)
  
  // S3
  s3Bucket: string;
  s3Region: string;
  s3EncryptionEnabled: boolean;
  s3PublicUrl: boolean;
  
  // QR Code
  qrCodeSize: number; // Default: 200 (pixels)
  qrErrorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'; // Default: 'H'
  
  // Signature
  signatureMaxSizeKB: number; // Default: 500
  
  // Redis
  redisKeyPrefix: string; // Default: 'challan'
  redisTtl: number; // In seconds, default from OTP expiry
}
