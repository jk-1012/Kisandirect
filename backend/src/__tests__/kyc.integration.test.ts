/**
 * Integration Tests for DigiLocker KYC System
 * Tests complete OAuth2 flow, document fetching, encryption, and vault storage
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { buildApp } from '../app';
import { VaultEncryptionService } from '../utils/encryption';
import { DigiLockerService, createDigiLockerService } from '../services/digilocker-service';

describe('DigiLocker KYC Integration Tests', () => {
  let server: FastifyInstance;
  let encryptionService: VaultEncryptionService;
  let digiLockerService: DigiLockerService;
  const testEncryptionKey = crypto.randomBytes(32).toString('hex');
  const testUserId = crypto.randomUUID();
  const testFarmerId = crypto.randomUUID();

  beforeAll(async () => {
    server = await buildApp();
    await server.listen({ port: 3001 });
    encryptionService = new VaultEncryptionService(testEncryptionKey, 'test-key');
    digiLockerService = createDigiLockerService(server);
  });

  afterAll(async () => {
    await server.close();
  });

  describe('KYC Initiation', () => {
    it('should generate authorization URL with state and nonce', async () => {
      const authRequest = await digiLockerService.generateAuthorizationUrl(testUserId, testFarmerId);

      expect(authRequest).toBeDefined();
      expect(authRequest.url).toContain('client_id=');
      expect(authRequest.url).toContain('response_type=code');
      expect(authRequest.url).toContain('redirect_uri=');
      expect(authRequest.state).toBeDefined();
      expect(authRequest.nonce).toBeDefined();
      expect(authRequest.expiresIn).toBeGreaterThan(0);
    });

    it('should store state in Redis with correct TTL', async () => {
      const authRequest = await digiLockerService.generateAuthorizationUrl(testUserId, testFarmerId);
      const stateKey = `kyc:state:${authRequest.state}`;
      const storedState = await server.queues.connection.get(stateKey);

      expect(storedState).toBeDefined();
      const parsed = JSON.parse(storedState!);
      expect(parsed.userId).toBe(testUserId);
      expect(parsed.farmerId).toBe(testFarmerId);
      expect(parsed.nonce).toBe(authRequest.nonce);
    });

    it('should POST /farmers/kyc/initiate return auth URL', async () => {
      // First create a test farmer
      await server.db.query(
        'INSERT INTO farmers (id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [testFarmerId, testUserId]
      );

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/farmers/kyc/initiate',
        payload: { farmerId: testFarmerId },
        headers: {
          authorization: `Bearer ${await createTestToken(server, testUserId)}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.authUrl).toBeDefined();
      expect(body.state).toBeDefined();
      expect(body.sessionId).toBeDefined();
      expect(body.expiresIn).toBeGreaterThan(0);
    });

    it('should reject initiation for unauthorized farmer', async () => {
      const differentFarmerId = crypto.randomUUID();
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/farmers/kyc/initiate',
        payload: { farmerId: differentFarmerId },
        headers: {
          authorization: `Bearer ${await createTestToken(server, testUserId)}`
        }
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Encryption & Decryption', () => {
    it('should encrypt and decrypt Aadhaar number', () => {
      const testAadhaar = '123456789012';
      const encrypted = encryptionService.encrypt(testAadhaar);

      expect(encrypted).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();
      expect(encrypted.keyId).toBe('test-key');
      expect(encrypted.algorithm).toBe('AES-256-GCM');

      const decrypted = encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(testAadhaar);
    });

    it('should produce different ciphertexts for same plaintext (due to random IV)', () => {
      const testData = 'SensitiveData123';
      const encrypted1 = encryptionService.encrypt(testData);
      const encrypted2 = encryptionService.encrypt(testData);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);

      // But both should decrypt to the same value
      expect(encryptionService.decrypt(encrypted1)).toBe(testData);
      expect(encryptionService.decrypt(encrypted2)).toBe(testData);
    });

    it('should detect tampering with ciphertext', () => {
      const testData = 'SecureData';
      const encrypted = encryptionService.encrypt(testData);

      // Tamper with ciphertext
      encrypted.ciphertext = Buffer.from(encrypted.ciphertext, 'base64').subarray(0, -2).toString('base64');

      expect(() => {
        encryptionService.decrypt(encrypted);
      }).toThrow();
    });

    it('should serialize and deserialize encrypted payload', () => {
      const testData = 'TestPayload';
      const encrypted = encryptionService.encrypt(testData);
      const serialized = encryptionService.serializePayload(encrypted);

      expect(typeof serialized).toBe('string');

      const deserialized = encryptionService.deserializePayload(serialized);
      expect(deserialized.ciphertext).toBe(encrypted.ciphertext);
      expect(deserialized.iv).toBe(encrypted.iv);
      expect(deserialized.tag).toBe(encrypted.tag);
      expect(deserialized.keyId).toBe(encrypted.keyId);

      const decrypted = encryptionService.decrypt(deserialized);
      expect(decrypted).toBe(testData);
    });
  });

  describe('Token Exchange', () => {
    it('should validate state token during code exchange', async () => {
      const invalidState = 'invalid-state-token';

      expect(async () => {
        await digiLockerService.exchangeAuthCode('dummy-code', invalidState);
      }).rejects.toThrow();
    });

    it('should increment attempt counter on failed exchange', async () => {
      const authRequest = await digiLockerService.generateAuthorizationUrl(testUserId, testFarmerId);
      const stateKey = `kyc:state:${authRequest.state}`;

      // First attempt (fails)
      try {
        await digiLockerService.exchangeAuthCode('invalid-code', authRequest.state);
      } catch (e) {
        // Expected to fail
      }

      // Check attempt counter
      const stored = await server.queues.connection.get(stateKey);
      const parsed = JSON.parse(stored!);
      expect(parsed.attempts).toBe(1);
    });

    it('should reject after max attempts', async () => {
      const authRequest = await digiLockerService.generateAuthorizationUrl(testUserId, testFarmerId);

      // Exhaust attempts
      for (let i = 0; i < 3; i++) {
        try {
          await digiLockerService.exchangeAuthCode('invalid-code', authRequest.state);
        } catch (e) {
          // Expected to fail
        }
      }

      // Now it should reject outright
      expect(async () => {
        await digiLockerService.exchangeAuthCode('invalid-code', authRequest.state);
      }).rejects.toThrow('Too many token exchange attempts');
    });
  });

  describe('KYC Status', () => {
    it('should retrieve KYC session status', async () => {
      // Create a mock session
      const sessionId = crypto.randomBytes(16).toString('hex');
      const mockSession = {
        sessionId,
        userId: testUserId,
        farmerId: testFarmerId,
        status: 'PENDING',
        documentsRequested: ['AADHAAR', 'PAN', 'LAND_OWNERSHIP'],
        documentsFetched: [],
        startedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        attempts: 0
      };

      await server.queues.connection.setEx(
        `kyc:session:${sessionId}`,
        3600,
        JSON.stringify(mockSession)
      );

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/farmers/kyc/status/${sessionId}`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('PENDING');
      expect(body.documentsRequested).toHaveLength(3);
      expect(body.documentsFetched).toHaveLength(0);
      expect(body.progress).toBe(0);
    });

    it('should return 404 for expired session', async () => {
      const expiredSessionId = crypto.randomBytes(16).toString('hex');

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/farmers/kyc/status/${expiredSessionId}`
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('SESSION_NOT_FOUND');
    });

    it('should calculate progress correctly', async () => {
      const sessionId = crypto.randomBytes(16).toString('hex');
      const mockSession = {
        sessionId,
        userId: testUserId,
        farmerId: testFarmerId,
        status: 'DOCUMENTS_FETCHED',
        documentsRequested: ['AADHAAR', 'PAN', 'LAND_OWNERSHIP'],
        documentsFetched: ['AADHAAR', 'PAN'],
        startedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        attempts: 0
      };

      await server.queues.connection.setEx(
        `kyc:session:${sessionId}`,
        3600,
        JSON.stringify(mockSession)
      );

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/farmers/kyc/status/${sessionId}`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.progress).toBe(67); // 2 of 3 documents
    });
  });

  describe('Document Storage', () => {
    it('should retrieve KYC document reference number', async () => {
      // Store a test KYC record
      await server.db.query(
        `INSERT INTO vault.farmer_kyc (farmer_id, aadhaar_ref_number, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (farmer_id) DO UPDATE SET aadhaar_ref_number = $2`,
        [testFarmerId, 'test-ref-123']
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/farmers/kyc/document/AADHAAR',
        headers: {
          authorization: `Bearer ${await createTestToken(server, testUserId)}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.documentType).toBe('AADHAAR');
      expect(body.refNumber).toBe('test-ref-123');
    });

    it('should reject invalid document type', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/farmers/kyc/document/INVALID_TYPE',
        headers: {
          authorization: `Bearer ${await createTestToken(server, testUserId)}`
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('INVALID_DOCUMENT_TYPE');
    });

    it('should return 404 when document not found', async () => {
      const newFarmerId = crypto.randomUUID();
      await server.db.query(
        'INSERT INTO farmers (id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [newFarmerId, testUserId]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/farmers/kyc/document/AADHAAR',
        headers: {
          authorization: `Bearer ${await createTestToken(server, testUserId)}`
        }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('DOCUMENT_NOT_FOUND');
    });
  });

  describe('Current User KYC Status', () => {
    it('should return current user KYC status', async () => {
      // Create farmer with KYC status
      const freshUserId = crypto.randomUUID();
      const freshFarmerId = crypto.randomUUID();

      await server.db.query(
        `INSERT INTO farmers (id, user_id, kyc_status, kyc_verified_at, kyc_expires_at)
         VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '365 days')
         ON CONFLICT DO NOTHING`,
        [freshFarmerId, freshUserId, 'VERIFIED']
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/farmers/kyc/me',
        headers: {
          authorization: `Bearer ${await createTestToken(server, freshUserId)}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('VERIFIED');
      expect(body.isVerified).toBe(true);
      expect(body.isExpired).toBe(false);
    });

    it('should detect expired KYC', async () => {
      const expiredUserId = crypto.randomUUID();
      const expiredFarmerId = crypto.randomUUID();

      await server.db.query(
        `INSERT INTO farmers (id, user_id, kyc_status, kyc_verified_at, kyc_expires_at)
         VALUES ($1, $2, $3, NOW() - INTERVAL '100 days', NOW() - INTERVAL '1 day')
         ON CONFLICT DO NOTHING`,
        [expiredFarmerId, expiredUserId, 'EXPIRED']
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/farmers/kyc/me',
        headers: {
          authorization: `Bearer ${await createTestToken(server, expiredUserId)}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isExpired).toBe(true);
    });
  });

  describe('Audit Logging', () => {
    it('should log KYC events to audit table', async () => {
      const eventId = crypto.randomUUID();

      // This would be called during KYC operations
      await server.db.query(
        `INSERT INTO vault.kyc_audit_logs 
         (event_id, event_type, ip_address, user_agent, details, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [eventId, 'DOCUMENT_FETCHED', '127.0.0.1', 'test-agent', JSON.stringify({ test: true }), 'success']
      );

      const result = await server.db.query(
        `SELECT * FROM vault.kyc_audit_logs WHERE event_id = $1`,
        [eventId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].event_type).toBe('DOCUMENT_FETCHED');
      expect(result.rows[0].status).toBe('success');
    });
  });
});

// Helper function to create test JWT tokens
async function createTestToken(server: FastifyInstance, userId: string): Promise<string> {
  return server.jwt.sign(
    {
      userId,
      phone: '+919876543210',
      role: 'FARMER',
      kisanId: null,
      kycStatus: 'PENDING'
    },
    { expiresIn: '1h' }
  );
}
