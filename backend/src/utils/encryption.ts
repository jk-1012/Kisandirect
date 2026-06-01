/**
 * Encryption/Decryption utilities for sensitive KYC data
 * Uses PostgreSQL pgcrypto extension for server-side encryption
 * and Node.js crypto for client-side operations when needed
 */

import crypto from 'crypto';
import { FastifyInstance } from 'fastify';

export interface EncryptionKey {
  id: string;
  algorithm: 'AES-256-GCM';
  key: Buffer; // 32 bytes for AES-256
  createdAt: Date;
  rotatedAt?: Date;
  active: boolean;
}

export interface EncryptedPayload {
  ciphertext: string; // Base64 encoded
  iv: string; // Base64 encoded
  tag: string; // Base64 encoded (for GCM)
  keyId: string;
  algorithm: string;
}

/**
 * Vault encryption service
 * Handles encryption/decryption of sensitive KYC data
 * Uses AES-256-GCM for authenticated encryption
 */
export class VaultEncryptionService {
  private masterKey: Buffer;
  private keyId: string;

  constructor(masterKeyHex: string, keyId: string = 'default') {
    // Master key should be 32 bytes (256 bits) for AES-256
    if (masterKeyHex.length !== 64) {
      throw new Error('Master key must be 64 hex characters (32 bytes for AES-256)');
    }
    this.masterKey = Buffer.from(masterKeyHex, 'hex');
    this.keyId = keyId;
  }

  /**
   * Encrypt sensitive data using AES-256-GCM
   * GCM mode provides both confidentiality and authenticity
   */
  encrypt(plaintext: string): EncryptedPayload {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const tag = cipher.getAuthTag(); // 16-byte authentication tag

    return {
      ciphertext,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      keyId: this.keyId,
      algorithm: 'AES-256-GCM'
    };
  }

  /**
   * Decrypt data encrypted with encrypt()
   * Verifies authentication tag for integrity
   */
  decrypt(payload: EncryptedPayload): string {
    if (payload.keyId !== this.keyId) {
      throw new Error(`Key ID mismatch. Expected ${this.keyId}, got ${payload.keyId}`);
    }

    if (payload.algorithm !== 'AES-256-GCM') {
      throw new Error(`Unsupported algorithm: ${payload.algorithm}`);
    }

    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);

    let plaintext = decipher.update(payload.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  /**
   * Serialize encrypted payload to JSON string for database storage
   */
  serializePayload(payload: EncryptedPayload): string {
    return JSON.stringify(payload);
  }

  /**
   * Deserialize encrypted payload from database
   */
  deserializePayload(serialized: string): EncryptedPayload {
    return JSON.parse(serialized);
  }
}

/**
 * Server-side encryption service using PostgreSQL pgcrypto
 * For storing sensitive data directly encrypted in the database
 */
export class PostgresVaultService {
  constructor(private server: FastifyInstance, private encryptionKey: string) {}

  /**
   * Encrypt data using PostgreSQL pgcrypto
   * Data is encrypted at rest in the database
   */
  async encryptWithPgCrypto(plaintext: string): Promise<string> {
    const result = await this.server.db.query(
      `SELECT encode(encrypt($1, $2, 'aes'), 'hex') as encrypted`,
      [plaintext, this.encryptionKey]
    );
    return result.rows[0].encrypted;
  }

  /**
   * Decrypt data stored with PostgreSQL pgcrypto
   */
  async decryptWithPgCrypto(encrypted: string): Promise<string> {
    const result = await this.server.db.query(
      `SELECT decrypt(decode($1, 'hex'), $2, 'aes') as decrypted`,
      [encrypted, this.encryptionKey]
    );
    return result.rows[0].decrypted.toString('utf8');
  }

  /**
   * Store encrypted Aadhaar data in vault
   * PII is encrypted at database level
   */
  async storeAadhaarEncrypted(farmerId: string, aadhaarNumber: string, aadhaarRefNumber: string): Promise<void> {
    await this.server.db.query(
      `INSERT INTO vault.farmer_kyc (farmer_id, aadhaar_encrypted, aadhaar_ref_number, kyc_updated_at)
       VALUES ($1, encode(encrypt($2, $3, 'aes'), 'hex'), $4, NOW())
       ON CONFLICT (farmer_id) DO UPDATE SET 
         aadhaar_encrypted = encode(encrypt($2, $3, 'aes'), 'hex'),
         aadhaar_ref_number = $4,
         kyc_updated_at = NOW()`,
      [farmerId, aadhaarNumber, this.encryptionKey, aadhaarRefNumber]
    );
  }

  /**
   * Store encrypted PAN data in vault
   */
  async storePANEncrypted(farmerId: string, panNumber: string, panRefNumber: string): Promise<void> {
    await this.server.db.query(
      `INSERT INTO vault.farmer_kyc (farmer_id, pan_encrypted, pan_ref_number, kyc_updated_at)
       VALUES ($1, encode(encrypt($2, $3, 'aes'), 'hex'), $4, NOW())
       ON CONFLICT (farmer_id) DO UPDATE SET 
         pan_encrypted = encode(encrypt($2, $3, 'aes'), 'hex'),
         pan_ref_number = $4,
         kyc_updated_at = NOW()`,
      [farmerId, panNumber, this.encryptionKey, panRefNumber]
    );
  }

  /**
   * Store encrypted land ownership data
   */
  async storeLandOwnershipEncrypted(farmerId: string, landData: string, refNumber: string): Promise<void> {
    await this.server.db.query(
      `INSERT INTO vault.farmer_kyc (farmer_id, land_ownership_encrypted, land_ownership_ref_number, kyc_updated_at)
       VALUES ($1, encode(encrypt($2, $3, 'aes'), 'hex'), $4, NOW())
       ON CONFLICT (farmer_id) DO UPDATE SET 
         land_ownership_encrypted = encode(encrypt($2, $3, 'aes'), 'hex'),
         land_ownership_ref_number = $4,
         kyc_updated_at = NOW()`,
      [farmerId, landData, this.encryptionKey, refNumber]
    );
  }

  /**
   * Retrieve encrypted Aadhaar (must be decrypted by application)
   */
  async getAadhaarEncrypted(farmerId: string): Promise<string | null> {
    const result = await this.server.db.query(
      `SELECT aadhaar_encrypted FROM vault.farmer_kyc WHERE farmer_id = $1`,
      [farmerId]
    );
    return result.rows[0]?.aadhaar_encrypted || null;
  }

  /**
   * Retrieve and decrypt Aadhaar (use with caution - only when needed)
   */
  async getAadhaarDecrypted(farmerId: string): Promise<string | null> {
    const result = await this.server.db.query(
      `SELECT decrypt(decode(aadhaar_encrypted, 'hex'), $1, 'aes') as aadhaar 
       FROM vault.farmer_kyc WHERE farmer_id = $2`,
      [this.encryptionKey, farmerId]
    );
    if (!result.rows[0]?.aadhaar) return null;
    return result.rows[0].aadhaar.toString('utf8');
  }

  /**
   * Retrieve and decrypt PAN
   */
  async getPANDecrypted(farmerId: string): Promise<string | null> {
    const result = await this.server.db.query(
      `SELECT decrypt(decode(pan_encrypted, 'hex'), $1, 'aes') as pan 
       FROM vault.farmer_kyc WHERE farmer_id = $2`,
      [this.encryptionKey, farmerId]
    );
    if (!result.rows[0]?.pan) return null;
    return result.rows[0].pan.toString('utf8');
  }

  /**
   * Mark KYC as completed with proper timestamps
   */
  async markKYCCompleted(farmerId: string, kycStatus: string, digilockerRef: string): Promise<void> {
    await this.server.db.query(
      `INSERT INTO vault.farmer_kyc (farmer_id, kyc_status, digilocker_ref, kyc_completed_at, kyc_expires_at)
       VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '365 days')
       ON CONFLICT (farmer_id) DO UPDATE SET 
         kyc_status = $2,
         digilocker_ref = $3,
         kyc_completed_at = NOW(),
         kyc_expires_at = NOW() + INTERVAL '365 days'`,
      [farmerId, kycStatus, digilockerRef]
    );
  }
}

/**
 * Generate a cryptographically secure encryption key
 * Use this to generate and store the master key securely
 */
export function generateEncryptionKey(): string {
  // Generate 32 bytes (256 bits) for AES-256
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash sensitive data for compliance logging (non-reversible)
 * Use for audit logging without storing actual PII
 */
export function hashSensitiveData(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate encryption key format
 */
export function isValidEncryptionKey(keyHex: string): boolean {
  return typeof keyHex === 'string' && keyHex.length === 64 && /^[a-f0-9]{64}$/.test(keyHex);
}
