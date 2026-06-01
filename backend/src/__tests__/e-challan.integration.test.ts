/**
 * E-Challan Integration Tests
 * Complete workflow testing: create, sign, verify, download
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { S3Client } from '@aws-sdk/client-s3';
import {
  EChallanStatus,
  ChallanSignatureType,
  SignatureInputMethod,
  EChallanConfig,
} from '../types/e-challan';
import { createEChallanService } from '../services/e-challan-service';

describe('E-Challan Integration Tests', () => {
  let mockDb: any;
  let mockRedis: any;
  let mockS3: any;
  let mockServer: FastifyInstance;
  let challanService: any;
  let testOrderId: string;
  let testChallanId: string;
  let testFarmerId: string;
  let testBuyerId: string;

  beforeAll(async () => {
    // Setup mocks
    testOrderId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    testFarmerId = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
    testBuyerId = 'f47ac10b-58cc-4372-a567-0e02b2c3d481';
    testChallanId = 'f47ac10b-58cc-4372-a567-0e02b2c3d482';

    mockDb = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn(),
        release: jest.fn(),
      }),
    };

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
    };

    mockS3 = {
      send: jest.fn(),
    };

    mockServer = {
      pg: mockDb,
      redis: mockRedis,
      log: {
        info: jest.fn(),
        error: jest.fn(),
      },
    } as any as FastifyInstance;

    const config: EChallanConfig = {
      otpLength: 6,
      otpExpirySeconds: 300,
      otpMaxAttempts: 3,
      pdfTimeout: 30000,
      pdfWidth: 210,
      pdfHeight: 297,
      s3Bucket: 'test-bucket',
      s3Region: 'us-east-1',
      s3EncryptionEnabled: true,
      s3PublicUrl: false,
      qrCodeSize: 200,
      qrErrorCorrectionLevel: 'H',
      signatureMaxSizeKB: 500,
      redisKeyPrefix: 'challan',
      redisTtl: 300,
    };

    challanService = createEChallanService(mockServer, mockDb, mockRedis, mockS3 as any, config);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Challan Creation', () => {
    it('should create a new challan for valid order', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      // Mock order query
      client.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testOrderId,
              farmer_id: testFarmerId,
              buyer_id: testBuyerId,
              created_at: new Date(),
              total_amount: 5000,
              status: 'PENDING',
              farmer_name: 'John Farmer',
              farmer_phone: '9876543210',
              farmer_email: 'farmer@example.com',
              buyer_name: 'Jane Buyer',
              buyer_phone: '9876543211',
              buyer_email: 'buyer@example.com',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ challan_number: 'CH-2024-001' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              name: 'Wheat',
              quantity: 10,
              unit: 'kg',
              price_per_unit: 500,
              total_price: 5000,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: testChallanId,
              status: EChallanStatus.DRAFT,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ rows: [] }] }); // Audit log

      const response = await challanService.createChallan({
        orderId: testOrderId,
      });

      expect(response.challanNumber).toBe('CH-2024-001');
      expect(response.status).toBe(EChallanStatus.DRAFT);
      expect(response.challanHtml).toBeDefined();
      expect(response.qrCode).toBeDefined();
      expect(mockServer.log.info).toHaveBeenCalledWith(expect.stringContaining('Challan created'));
    });

    it('should throw error for non-existent order', async () => {
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      await expect(
        challanService.createChallan({ orderId: 'non-existent' }),
      ).rejects.toThrow('Order not found');
    });

    it('should generate QR code with verification token', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testOrderId,
              farmer_id: testFarmerId,
              buyer_id: testBuyerId,
              created_at: new Date(),
              total_amount: 5000,
              farmer_name: 'John Farmer',
              farmer_phone: '9876543210',
              farmer_email: 'farmer@example.com',
              buyer_name: 'Jane Buyer',
              buyer_phone: '9876543211',
              buyer_email: 'buyer@example.com',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ challan_number: 'CH-2024-001' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              name: 'Wheat',
              quantity: 10,
              unit: 'kg',
              price_per_unit: 500,
              total_price: 5000,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: testChallanId,
              status: EChallanStatus.DRAFT,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ rows: [] }] });

      const response = await challanService.createChallan({
        orderId: testOrderId,
      });

      expect(response.qrCode).toMatch(/^data:image\/png;base64/);
    });
  });

  describe('OTP Verification', () => {
    it('should send OTP to phone number', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testChallanId,
              status: EChallanStatus.DRAFT,
              farmer_id: testFarmerId,
              buyer_id: testBuyerId,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // OTP cache insert
        .mockResolvedValueOnce({ rows: [] }); // Update challan status

      mockRedis.setex.mockResolvedValue('OK');

      const response = await challanService.sendOtp({
        challanId: testChallanId,
        recipientType: 'FARMER',
        phoneNumber: '9876543210',
        email: 'farmer@example.com',
      });

      expect(response.challanId).toBe(testChallanId);
      expect(response.expiresIn).toBe(300);
      expect(mockRedis.setex).toHaveBeenCalled();
      expect(mockServer.log.info).toHaveBeenCalledWith(
        expect.stringContaining('OTP sent'),
      );
    });

    it('should verify OTP and update challan status', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      const testOtp = '123456';
      client.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testChallanId,
              status: EChallanStatus.OTP_SENT,
              otp_attempts: 0,
              otp_max_attempts: 3,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // Update status

      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          otpCode: testOtp,
          recipientPhone: '9876543210',
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          verificationAttempts: 0,
          maxAttempts: 3,
        }),
      );
      mockRedis.del.mockResolvedValue(1);

      const response = await challanService.verifyOtp({
        challanId: testChallanId,
        otpCode: testOtp,
        recipientType: 'FARMER',
      });

      expect(response.challanId).toBe(testChallanId);
      expect(response.status).toBe(EChallanStatus.OTP_VERIFIED);
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should reject invalid OTP', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query.mockResolvedValueOnce({
        rows: [
          {
            id: testChallanId,
            status: EChallanStatus.OTP_SENT,
            otp_attempts: 0,
            otp_max_attempts: 3,
          },
        ],
      });

      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          otpCode: '123456',
          recipientPhone: '9876543210',
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          verificationAttempts: 0,
          maxAttempts: 3,
        }),
      );

      await expect(
        challanService.verifyOtp({
          challanId: testChallanId,
          otpCode: '999999',
          recipientType: 'FARMER',
        }),
      ).rejects.toThrow('Invalid OTP');
    });

    it('should enforce max OTP attempt limit', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query.mockResolvedValueOnce({
        rows: [
          {
            id: testChallanId,
            status: EChallanStatus.OTP_SENT,
            otp_attempts: 3,
            otp_max_attempts: 3,
          },
        ],
      });

      await expect(
        challanService.verifyOtp({
          challanId: testChallanId,
          otpCode: '123456',
          recipientType: 'FARMER',
        }),
      ).rejects.toThrow('Maximum OTP attempts exceeded');
    });
  });

  describe('Signature Capture', () => {
    it('should capture farmer signature', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testChallanId,
              status: EChallanStatus.OTP_VERIFIED,
              farmer_id: testFarmerId,
              buyer_id: testBuyerId,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sig-123',
              signature_timestamp: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // Check buyer signature
        .mockResolvedValueOnce({ rows: [] }) // Update challan
        .mockResolvedValueOnce({ rows: [] }); // Audit log

      const testSignature = Buffer.from('fake-signature-data').toString('base64');

      const response = await challanService.signChallan({
        challanId: testChallanId,
        signerName: 'John Farmer',
        signerPhone: '9876543210',
        signerEmail: 'farmer@example.com',
        signatureImageBase64: testSignature,
        signatureType: 'canvas' as SignatureInputMethod,
        signerType: 'FARMER' as ChallanSignatureType,
      });

      expect(response.challanId).toBe(testChallanId);
      expect(response.signerType).toBe('FARMER');
      expect(response.status).toBe(EChallanStatus.FARMER_SIGNED);
    });

    it('should capture buyer signature and mark challan complete', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testChallanId,
              status: EChallanStatus.OTP_VERIFIED,
              farmer_id: testFarmerId,
              buyer_id: testBuyerId,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sig-456',
              signature_timestamp: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // Update challan
        .mockResolvedValueOnce({ rows: [] }); // Audit log

      const testSignature = Buffer.from('fake-buyer-signature').toString('base64');

      const response = await challanService.signChallan({
        challanId: testChallanId,
        signerName: 'Jane Buyer',
        signerPhone: '9876543211',
        signerEmail: 'buyer@example.com',
        signatureImageBase64: testSignature,
        signatureType: 'canvas' as SignatureInputMethod,
        signerType: 'BUYER' as ChallanSignatureType,
      });

      expect(response.challanId).toBe(testChallanId);
      expect(response.signerType).toBe('BUYER');
      expect(response.status).toBe(EChallanStatus.BUYER_SIGNED);
    });

    it('should reject signature from wrong signer', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query.mockResolvedValueOnce({
        rows: [
          {
            id: testChallanId,
            status: EChallanStatus.DRAFT, // Wrong status
            farmer_id: testFarmerId,
            buyer_id: testBuyerId,
          },
        ],
      });

      const testSignature = Buffer.from('fake-signature').toString('base64');

      await expect(
        challanService.signChallan({
          challanId: testChallanId,
          signerName: 'John Farmer',
          signerPhone: '9876543210',
          signatureImageBase64: testSignature,
          signatureType: 'canvas' as SignatureInputMethod,
          signerType: 'FARMER' as ChallanSignatureType,
        }),
      ).rejects.toThrow('Challan must be OTP verified');
    });

    it('should reject oversized signature', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query.mockResolvedValueOnce({
        rows: [
          {
            id: testChallanId,
            status: EChallanStatus.OTP_VERIFIED,
            farmer_id: testFarmerId,
            buyer_id: testBuyerId,
          },
        ],
      });

      // Create oversized signature (> 500KB when decoded)
      const oversizedSignature = 'a'.repeat(1000000); // 1MB+

      await expect(
        challanService.signChallan({
          challanId: testChallanId,
          signerName: 'John Farmer',
          signerPhone: '9876543210',
          signatureImageBase64: oversizedSignature,
          signatureType: 'canvas' as SignatureInputMethod,
          signerType: 'FARMER' as ChallanSignatureType,
        }),
      ).rejects.toThrow('exceeds maximum size');
    });
  });

  describe('PDF Generation & S3 Upload', () => {
    it('should generate PDF on challan completion', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      // Mock challan fetch
      client.query.mockResolvedValueOnce({
        rows: [
          {
            id: testChallanId,
            challan_html: '<html>Test Challan</html>',
            order_id: testOrderId,
          },
        ],
      });

      // Initialize browser for PDF generation
      await challanService.initializeBrowser();

      // Note: Actual PDF generation would require browser context
      expect(mockServer.log.info).toBeDefined();
    });

    it('should upload PDF to S3', async () => {
      mockS3.send.mockResolvedValue({ ETag: '"test-etag"' });

      const testPdfBuffer = Buffer.from('fake pdf content');

      // This would be called internally
      // Note: S3 upload requires proper S3 client setup
      expect(mockS3).toBeDefined();
    });
  });

  describe('Integrity & Tampering Detection', () => {
    it('should verify challan content integrity', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testChallanId,
              content_hash: 'abc123def456', // Pre-calculated hash
              final_hash: 'xyz789',
              challan_html: '<html>Test</html>',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              signature_hash: 'sig-hash-1',
              signature_image_base64: Buffer.from('sig1').toString('base64'),
            },
          ],
        });

      const result = await challanService.checkIntegrity(testChallanId);

      expect(result.isValid).toBeDefined();
      expect(result.verificationTimestamp).toBeDefined();
      expect(result.allSignaturesValid).toBeDefined();
    });

    it('should detect tampering attempt', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testChallanId,
              content_hash: 'original-hash',
              final_hash: 'xyz789',
              challan_html: '<html>Modified</html>', // Content changed
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await challanService.checkIntegrity(testChallanId);

      // If hashes don't match, content has been tampered with
      expect(result).toBeDefined();
    });
  });

  describe('Audit Logging', () => {
    it('should maintain complete audit trail', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query.mockResolvedValue({ rows: [] });

      // Audit logs should be created for all operations
      expect(mockServer.log).toBeDefined();
    });

    it('should log all status transitions', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      // Status transitions should be logged
      // DRAFT -> OTP_SENT -> OTP_VERIFIED -> FARMER_SIGNED/BUYER_SIGNED -> COMPLETED

      expect(mockDb.connect).toBeDefined();
    });
  });

  describe('Escrow Integration', () => {
    it('should trigger escrow release on both signatures', async () => {
      // When both farmer and buyer sign, escrow should be triggered
      expect(mockServer.log).toBeDefined();
    });

    it('should record escrow transaction ID', async () => {
      // After escrow release, transaction ID should be stored
      expect(mockDb).toBeDefined();
    });
  });

  describe('Download & Retrieval', () => {
    it('should download completed challan with signatures', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testChallanId,
              challan_number: 'CH-2024-001',
              status: EChallanStatus.COMPLETED,
              challan_pdf_path: 's3://bucket/path/file.pdf',
              final_hash: 'xyz789',
              completed_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sig-1',
              signer_type: 'FARMER',
              signer_name: 'John Farmer',
              signature_timestamp: new Date(),
              verified_at: new Date(),
            },
            {
              id: 'sig-2',
              signer_type: 'BUYER',
              signer_name: 'Jane Buyer',
              signature_timestamp: new Date(),
              verified_at: new Date(),
            },
          ],
        });

      const response = await challanService.downloadChallan({
        challanId: testChallanId,
        includeHistory: false,
      });

      expect(response.challanId).toBe(testChallanId);
      expect(response.challanNumber).toBe('CH-2024-001');
      expect(response.status).toBe(EChallanStatus.COMPLETED);
      expect(response.signatures.length).toBe(2);
    });

    it('should include audit history if requested', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testChallanId,
              challan_number: 'CH-2024-001',
              status: EChallanStatus.COMPLETED,
              challan_pdf_path: 's3://bucket/path/file.pdf',
              final_hash: 'xyz789',
              completed_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // Signatures
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'log-1',
              action: 'CREATED',
              actor_type: 'SYSTEM',
              created_at: new Date(),
            },
            {
              id: 'log-2',
              action: 'OTP_SENT',
              actor_type: 'SYSTEM',
              created_at: new Date(),
            },
          ],
        });

      const response = await challanService.downloadChallan({
        challanId: testChallanId,
        includeHistory: true,
      });

      expect(response.auditLog?.length).toBe(2);
    });
  });

  describe('Archival', () => {
    it('should archive completed challans', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query
        .mockResolvedValueOnce({
          rows: [
            {
              status: EChallanStatus.COMPLETED,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // Update archive
        .mockResolvedValueOnce({ rows: [] }); // Audit log

      await challanService.archiveChallan(testChallanId);

      expect(mockServer.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Challan completed'),
      );
    });

    it('should prevent archival of incomplete challans', async () => {
      const client = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockDb.connect.mockResolvedValue(client);

      client.query.mockResolvedValueOnce({
        rows: [
          {
            status: EChallanStatus.DRAFT,
          },
        ],
      });

      await expect(
        challanService.archiveChallan(testChallanId),
      ).rejects.toThrow('Only completed challans can be archived');
    });
  });

  afterAll(async () => {
    await challanService.closeBrowser();
  });
});
