/**
 * DigiLocker KYC Integration Types
 * Covers OAuth2 flow, document handling, and KYC state management
 */

// OAuth2 Types
export interface DigiLockerConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationUrl: string;
  tokenUrl: string;
  digiLockerApiBase: string;
  apiBaseUrl?: string;
  scope: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  sessionTimeout?: number;
}

export interface DigiLockerAuthRequest {
  clientId: string;
  redirectUri: string;
  scope: string[]; // e.g., ["AUA_CODE", "AADHAAR_DATA", "PAN_DATA"]
  state: string; // CSRF protection token
  url?: string; // Authorization URL
  nonce?: string;
  expiresIn?: number;
}

export interface DigiLockerAuthResponse {
  code: string; // Authorization code
  state: string; // Must match request state
  error?: string;
  errorDescription?: string;
}

export interface DigiLockerTokenRequest {
  grantType: 'authorization_code';
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface DigiLockerTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // seconds
  refreshToken?: string;
  scope: string[];
}

// Document Types
export type DocumentType = 'AADHAAR' | 'PAN' | 'LAND_OWNERSHIP' | 'BANK_STATEMENT';

export interface DigiLockerDocument {
  refNumber: string;
  documentType: DocumentType;
  certificateUrl?: string;
  signedXmlUrl?: string;
  issuedOn?: string;
  expiryDate?: string;
  docStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  metadata?: Record<string, unknown>;
}

export interface AadhaarData {
  uid: string; // Aadhaar UID (12 digits, encrypted)
  name: string;
  dateOfBirth: string; // YYYY-MM-DD format
  gender: 'M' | 'F' | 'O';
  address: {
    street?: string;
    district: string;
    state: string;
    pincode: string;
    country: string;
  };
  phone?: string;
  email?: string;
  refNumber: string;
  docStatus: 'ACTIVE' | 'INACTIVE';
}

export interface PANData {
  number: string; // PAN number (10 digit alphanumeric, encrypted)
  name: string;
  fatherName?: string;
  dateOfBirth: string; // YYYY-MM-DD format
  type: 'I' | 'C' | 'H' | 'F' | 'P'; // I=Individual, C=Company, etc.
  refNumber: string;
  docStatus: 'ACTIVE' | 'INACTIVE';
}

export interface LandOwnershipData {
  surveyNumber?: string;
  villageCode?: string;
  talukaCode?: string;
  districtCode?: string;
  stateCode?: string;
  areaInHectares?: number;
  ownershipType?: 'INDIVIDUAL' | 'JOINT' | 'PARTNERSHIP';
  ownership_percentage?: number;
  refNumber: string;
  originalDocument?: string; // XML/JSON raw data
}

// KYC State and Status
export type KYCStatus = 'PENDING' | 'IN_PROGRESS' | 'AADHAAR_VERIFIED' | 'PAN_VERIFIED' | 'LAND_VERIFIED' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'REJECTED';

export type KYCFailureReason = 'OAUTH_FAILED' | 'TOKEN_EXCHANGE_FAILED' | 'DOCUMENT_FETCH_FAILED' | 'PARSING_ERROR' | 'VALIDATION_FAILED' | 'ENCRYPTION_FAILED' | 'TIMEOUT' | 'MANUALLY_REJECTED' | 'USER_CANCELLED';

export interface KYCSession {
  sessionId: string;
  userId: string;
  farmerId: string;
  state: string; // OAuth state token
  startedAt: number; // Timestamp
  expiresAt: number; // Timestamp
  status: KYCStatus;
  accessToken?: string; // Encrypted in storage
  aadhaarRefNumber?: string;
  panRefNumber?: string;
  landOwnershipRefNumber?: string;
  failureReason?: KYCFailureReason;
  failureDetails?: string;
  attempts: number; // Retry count
  lastAttemptAt?: number;
  documentsRequested?: DocumentType[];
  documentsFetched?: DocumentType[];
  vaultRecordId?: string;
  lastError?: string | null;
}

export interface KYCSessionStore {
  [sessionId: string]: KYCSession;
}

// Vault storage for sensitive data
export interface VaultKYCRecord {
  farmerId: string;
  aadhaarEncrypted?: string; // AES-256 encrypted
  aadhaarRefNumber?: string; // Plain text for lookup
  panEncrypted?: string; // AES-256 encrypted
  panRefNumber?: string; // Plain text for lookup
  landOwnershipEncrypted?: string; // AES-256 encrypted
  landOwnershipRefNumber?: string;
  kycStatus: KYCStatus;
  digilockerRef?: string; // Reference ID for audit trail
  kycCompletedAt?: Date; // Timestamp
  kycExpiresAt?: Date; // Timestamp for re-verification
  source?: 'DIGILOCKER' | 'MANUAL'; // How KYC was completed
  verifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  documentHashes?: {
    aadhaar?: string;
    pan?: string;
    landOwnership?: string;
  };
}

// API Response Types
export interface DigiLockerFetchResponse {
  code: number;
  msg: string;
  referenceNumber?: string;
  docType?: string;
  docStatus?: string;
  docData?: {
    xml?: string;
    json?: any;
    signedXml?: string;
  };
  issuedOn?: string;
  expiryDate?: string;
}

export interface KYCInitiateResponse {
  sessionId: string;
  authorizationUrl: string;
  expiresIn: number; // seconds
}

export interface KYCStatusResponse {
  sessionId: string;
  status: KYCStatus;
  progress: {
    aadhaarVerified: boolean;
    panVerified: boolean;
    landOwnershipVerified: boolean;
  };
  completedAt?: number;
  failureReason?: KYCFailureReason;
  failureDetails?: string;
}

export interface KYCCallbackError {
  error: string;
  errorDescription: string;
  state: string;
}

// Logging and Audit
export type EventType = 'INITIATE' | 'CALLBACK' | 'AADHAAR_FETCH' | 'PAN_FETCH' | 'LAND_FETCH' | 'ENCRYPTION' | 'STORAGE' | 'COMPLETION' | 'FAILURE' | 'EXPIRY' | 'DOCUMENT_FETCHED' | 'KYC_STORED' | 'KYC_COMPLETED';

export interface KYCAuditLog {
  eventId: string;
  userId?: string;
  sessionId?: string;
  eventType: EventType;
  status: 'SUCCESS' | 'FAILURE' | 'success' | 'failed' | 'completed';
  details: Record<string, unknown>;
  errorMessage?: string;
  timestamp: number | Date;
  ipAddress?: string;
  userAgent?: string;
}

// Retry Policy
export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// DTOs for API Requests/Responses
export interface InitiateKYCRequest {
  // No request body needed - authenticated via user token
}

export interface CallbackKYCRequest {
  code?: string;
  state: string;
  error?: string;
  errorDescription?: string;
}

export interface CheckStatusRequest {
  sessionId: string;
}

// Encryption Context
export interface EncryptionContext {
  algorithm: 'AES-256-GCM';
  keyId: string;
  iv: string;
  tag: string;
}

export interface EncryptedData {
  ciphertext: string; // Base64 encoded
  context: EncryptionContext;
}
