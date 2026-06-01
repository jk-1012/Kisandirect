/**
 * KYC (Know Your Customer) Routes
 * Handles DigiLocker OAuth2 flow with complete production implementation
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createDigiLockerService } from '../services/digilocker-service.js';

// Request/Response schemas
const kycInitiateSchema = z.object({
  farmerId: z.string().uuid('farmerId must be a valid UUID')
});

const kycCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code required'),
  state: z.string().min(1, 'State token required')
});

const kycStatusSchema = z.object({
  sessionId: z.string().min(1, 'Session ID required')
});

export default async function kycRoutes(server: FastifyInstance) {
  const digiLockerService = createDigiLockerService(server);

  /**
   * POST /farmers/kyc/initiate
   * Initiates KYC process by generating DigiLocker authorization URL
   */
  server.post<{ Body: z.infer<typeof kycInitiateSchema> }>(
    '/farmers/kyc/initiate',
    { preHandler: server.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = kycInitiateSchema.parse(request.body);
        const userId = request.user.userId;
        const ip = request.ip;
        const userAgent = request.headers['user-agent'] || 'unknown';

        server.log.info({ userId, farmerId: payload.farmerId, ip }, 'KYC initiation request');

        // Verify farmer belongs to authenticated user
        const farmerResult = await server.db.query(
          'SELECT id FROM farmers WHERE id = $1 AND user_id = $2',
          [payload.farmerId, userId]
        );

        if (farmerResult.rows.length === 0) {
          server.log.warn({ userId, farmerId: payload.farmerId }, 'Unauthorized KYC initiation attempt');
          return reply.code(403).send({
            error: 'FORBIDDEN',
            message: 'Farmer not found or access denied'
          });
        }

        // Generate authorization URL
        const authRequest = await digiLockerService.generateAuthorizationUrl(userId, payload.farmerId);

        // Store session metadata in Redis for later retrieval
        const sessionId = Buffer.from(`${userId}:${payload.farmerId}:${Date.now()}`).toString('base64');
        const sessionMetadata = {
          userId,
          farmerId: payload.farmerId,
          ip,
          userAgent,
          initiatedAt: new Date().toISOString(),
          state: authRequest.state
        };

        await server.queues.connection.setEx(
          `kyc:session:metadata:${sessionId}`,
          (authRequest.expiresIn || 600) * 2,
          JSON.stringify(sessionMetadata)
        );

        return reply.code(200).send({
          authUrl: authRequest.url,
          state: authRequest.state,
          sessionId,
          expiresIn: authRequest.expiresIn
        });
      } catch (error) {
        server.log.error(error, 'KYC initiation error');
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'VALIDATION_ERROR',
            details: error.errors
          });
        }
        return reply.code(500).send({
          error: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to initiate KYC'
        });
      }
    }
  );

  /**
   * GET /farmers/kyc/callback
   * OAuth2 callback endpoint after user authorizes with DigiLocker
   */
  server.get<{ Querystring: z.infer<typeof kycCallbackSchema> }>(
    '/farmers/kyc/callback',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as Record<string, any>;
        const payload = kycCallbackSchema.parse(query);

        const ip = request.ip;
        const userAgent = request.headers['user-agent'] || 'unknown';
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        server.log.info({ ip, state: payload.state.substring(0, 8) }, 'OAuth callback received');

        // Handle OAuth callback
        const kycSession = await digiLockerService.handleCallback(payload.code, payload.state);

        // Store KYC completion status
        await server.db.query(
          `UPDATE farmers SET kyc_status = $1, kyc_verified_at = NOW() WHERE id = $2`,
          ['VERIFIED', kycSession.farmerId]
        );

        // Update user KYC status
        await server.db.query(
          `UPDATE users SET kyc_status = $1, updated_at = NOW() WHERE id = $2`,
          ['VERIFIED', kycSession.userId]
        );

        // Store KYC session in Redis for subsequent status checks
        await server.queues.connection.setEx(
          `kyc:completed:${kycSession.sessionId}`,
          86400, // 24 hours
          JSON.stringify(kycSession)
        );

        server.log.info(
          { farmerId: kycSession.farmerId, documentsCount: kycSession.documentsFetched?.length || 0 },
          'KYC completed successfully'
        );

        // Redirect to success page with session token
        const redirectUrl = new URL(`${frontendUrl}/kyc/success`);
        redirectUrl.searchParams.append('sessionId', kycSession.sessionId);
        redirectUrl.searchParams.append('status', kycSession.status);

        return reply.redirect(302, redirectUrl.toString());
      } catch (error) {
        server.log.error(error, 'KYC callback error');

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const errorUrl = new URL(`${frontendUrl}/kyc/error`);
        errorUrl.searchParams.append('reason', 'KYC_FAILED');

        if (error instanceof z.ZodError) {
          errorUrl.searchParams.append('details', error.errors[0].message);
        }

        return reply.redirect(302, errorUrl.toString());
      }
    }
  );

  /**
   * GET /farmers/kyc/status/:sessionId
   * Retrieve KYC session status and progress
   */
  server.get(
    '/farmers/kyc/status/:sessionId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sessionId } = request.params as { sessionId: string };

        // Verify session exists
        const sessionData = await server.queues.connection.get(`kyc:session:${sessionId}`);
        if (!sessionData) {
          return reply.code(404).send({
            error: 'SESSION_NOT_FOUND',
            message: 'KYC session not found or expired'
          });
        }

        const session = JSON.parse(sessionData);

        // Calculate progress
        const documentsCount = session.documentsRequested?.length || 0;
        const fetchedCount = session.documentsFetched?.length || 0;
        const progress = documentsCount > 0 ? Math.round((fetchedCount / documentsCount) * 100) : 0;

        server.log.info({ sessionId: sessionId.substring(0, 8), status: session.status, progress }, 'KYC status check');

        return reply.code(200).send({
          status: session.status,
          documentsRequested: session.documentsRequested || [],
          documentsFetched: session.documentsFetched || [],
          progress,
          expiresAt: session.expiresAt,
          error: session.lastError || null
        });
      } catch (error) {
        server.log.error(error, 'KYC status retrieval error');
        return reply.code(500).send({
          error: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve KYC status'
        });
      }
    }
  );

  /**
   * GET /farmers/kyc/me
   * Get current user's KYC status
   */
  server.get(
    '/farmers/kyc/me',
    { preHandler: server.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user.userId;

        const kycResult = await server.db.query(
          `SELECT kyc_status, kyc_verified_at, kyc_expires_at FROM farmers WHERE user_id = $1 LIMIT 1`,
          [userId]
        );

        if (kycResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'FARMER_NOT_FOUND'
          });
        }

        const kyc = kycResult.rows[0];

        return reply.code(200).send({
          status: kyc.kyc_status || 'PENDING',
          verifiedAt: kyc.kyc_verified_at,
          expiresAt: kyc.kyc_expires_at,
          isVerified: kyc.kyc_status === 'VERIFIED',
          isExpired: kyc.kyc_expires_at && new Date(kyc.kyc_expires_at) < new Date()
        });
      } catch (error) {
        server.log.error(error, 'KYC me retrieval error');
        return reply.code(500).send({
          error: 'INTERNAL_SERVER_ERROR'
        });
      }
    }
  );

  /**
   * POST /farmers/kyc/renew
   * Request KYC renewal (for expired KYC)
   */
  server.post(
    '/farmers/kyc/renew',
    { preHandler: server.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user.userId;

        // Get farmer's ID
        const farmerResult = await server.db.query(
          `SELECT id FROM farmers WHERE user_id = $1`,
          [userId]
        );

        if (farmerResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'FARMER_NOT_FOUND'
          });
        }

        const farmerId = farmerResult.rows[0].id;

        // Generate new authorization URL
        const authRequest = await digiLockerService.generateAuthorizationUrl(userId, farmerId);

        return reply.code(200).send({
          authUrl: authRequest.url,
          state: authRequest.state,
          expiresIn: authRequest.expiresIn,
          message: 'KYC renewal initiated'
        });
      } catch (error) {
        server.log.error(error, 'KYC renewal error');
        return reply.code(500).send({
          error: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to renew KYC'
        });
      }
    }
  );

  /**
   * GET /farmers/kyc/document/:documentType
   * Retrieve encrypted KYC document (with proper authorization)
   */
  server.get(
    '/farmers/kyc/document/:documentType',
    { preHandler: server.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { documentType } = request.params as { documentType: string };
        const userId = request.user.userId;

        // Validate document type
        const validDocTypes = ['AADHAAR', 'PAN', 'LAND_OWNERSHIP'];
        if (!validDocTypes.includes(documentType)) {
          return reply.code(400).send({
            error: 'INVALID_DOCUMENT_TYPE',
            message: `Valid types: ${validDocTypes.join(', ')}`
          });
        }

        // Get farmer's ID
        const farmerResult = await server.db.query(
          `SELECT id FROM farmers WHERE user_id = $1`,
          [userId]
        );

        if (farmerResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'FARMER_NOT_FOUND'
          });
        }

        const farmerId = farmerResult.rows[0].id;

        // Retrieve document from vault (encrypted)
        let fieldName = '';
        switch (documentType) {
          case 'AADHAAR':
            fieldName = 'aadhaar_ref_number';
            break;
          case 'PAN':
            fieldName = 'pan_ref_number';
            break;
          case 'LAND_OWNERSHIP':
            fieldName = 'land_ownership_ref_number';
            break;
        }

        const result = await server.db.query(
          `SELECT ${fieldName} FROM vault.farmer_kyc WHERE farmer_id = $1`,
          [farmerId]
        );

        if (result.rows.length === 0 || !result.rows[0][fieldName]) {
          return reply.code(404).send({
            error: 'DOCUMENT_NOT_FOUND',
            message: `${documentType} document not available`
          });
        }

        server.log.info({ farmerId, documentType }, 'Document retrieved');

        return reply.code(200).send({
          documentType,
          refNumber: result.rows[0][fieldName],
          retrievedAt: new Date().toISOString(),
          note: 'Document hash available for verification'
        });
      } catch (error) {
        server.log.error(error, 'Document retrieval error');
        return reply.code(500).send({
          error: 'INTERNAL_SERVER_ERROR'
        });
      }
    }
  );
}

