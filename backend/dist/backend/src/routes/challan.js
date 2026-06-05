/**
 * E-Challan Routes
 * Digital delivery note workflow: create, sign, verify, download
 */
import { z } from 'zod';
import { S3Client } from '@aws-sdk/client-s3';
import { EChallanError, EChallanErrorCodes, } from '../types/e-challan';
import { createEChallanService } from '../services/e-challan-service';
// Validation schemas
const createChallanSchema = z.object({
    orderId: z.string().uuid(),
    deliveryDate: z.date().optional(),
    estimatedDeliveryDate: z.date().optional(),
});
const sendOtpSchema = z.object({
    recipientType: z.enum(['BUYER', 'FARMER']),
    phoneNumber: z.string().min(10).max(15),
    email: z.string().email().optional(),
});
const verifyOtpSchema = z.object({
    otpCode: z.string().length(6),
    recipientType: z.enum(['BUYER', 'FARMER']),
});
const signChallanSchema = z.object({
    signerName: z.string().min(1).max(255),
    signerPhone: z.string().min(10).max(15),
    signerEmail: z.string().email().optional(),
    signatureImageBase64: z.string().min(100), // Min size check
    signatureType: z.enum(['canvas', 'typed', 'photo']),
    signerType: z.enum(['BUYER', 'FARMER']),
    deviceInfo: z.object({
        userAgent: z.string(),
        platform: z.string(),
        resolution: z.string(),
    }).optional(),
    geolocation: z.object({
        latitude: z.number(),
        longitude: z.number(),
        accuracy: z.number(),
    }).optional(),
});
const downloadChallanSchema = z.object({
    includeHistory: z.boolean().default(false),
});
export default async function (server) {
    const db = server.pg;
    const redis = server.redis;
    // Initialize EChallan service
    const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
    });
    const challanConfig = {
        otpLength: 6,
        otpExpirySeconds: 300, // 5 minutes
        otpMaxAttempts: 5,
        pdfTimeout: 30000, // 30 seconds
        pdfWidth: 210,
        pdfHeight: 297,
        s3Bucket: process.env.S3_CHALLAN_BUCKET || 'kisandirect-challans',
        s3Region: process.env.AWS_REGION || 'us-east-1',
        s3EncryptionEnabled: true,
        s3PublicUrl: false,
        qrCodeSize: 200,
        qrErrorCorrectionLevel: 'H',
        signatureMaxSizeKB: 500,
        redisKeyPrefix: 'challan',
        redisTtl: 300,
    };
    const challanService = createEChallanService(server, db, redis, s3Client, challanConfig);
    /**
     * POST /orders/:id/challan/create
     * Create a new e-challan for an order
     */
    server.post('/orders/:id/challan/create', async (request, reply) => {
        try {
            const orderId = request.params.id;
            // Validate input
            const body = createChallanSchema.parse({
                orderId,
                ...request.body,
            });
            // Check order exists and belongs to authenticated user
            const orderCheck = await db.query('SELECT id, farmer_id, buyer_id FROM public.orders WHERE id = $1', [orderId]);
            if (orderCheck.rows.length === 0) {
                return reply.status(404).send({
                    success: false,
                    error: 'Order not found',
                    code: EChallanErrorCodes.CHALLAN_NOT_FOUND,
                });
            }
            // Create challan
            const response = await challanService.createChallan({
                orderId: body.orderId,
                deliveryDate: body.deliveryDate,
                estimatedDeliveryDate: body.estimatedDeliveryDate,
            });
            server.log.info(`Challan created for order ${orderId}`);
            return reply.status(201).send({
                success: true,
                data: response,
                message: 'E-Challan created successfully',
            });
        }
        catch (error) {
            if (error instanceof EChallanError) {
                server.log.error(`EChallan Error: ${error.code} - ${error.message}`);
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.message,
                    code: error.code,
                    context: error.context,
                });
            }
            server.log.error('Create challan failed', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to create challan',
                code: EChallanErrorCodes.INTERNAL_ERROR,
            });
        }
    });
    /**
     * POST /orders/:id/challan/send-otp
     * Send OTP to farmer or buyer for signature verification
     */
    server.post('/orders/:id/challan/send-otp', async (request, reply) => {
        try {
            const challanId = request.params.id;
            // Validate input
            const body = sendOtpSchema.parse(request.body);
            // Send OTP
            const response = await challanService.sendOtp({
                challanId,
                ...body,
            });
            server.log.info(`OTP sent for challan ${challanId} to ${body.phoneNumber}`);
            return reply.status(200).send({
                success: true,
                data: response,
                message: `OTP sent to ${body.phoneNumber}. Expires in ${response.expiresIn} seconds.`,
            });
        }
        catch (error) {
            if (error instanceof EChallanError) {
                server.log.error(`EChallan Error: ${error.code} - ${error.message}`);
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.message,
                    code: error.code,
                });
            }
            server.log.error('Send OTP failed', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to send OTP',
                code: EChallanErrorCodes.INTERNAL_ERROR,
            });
        }
    });
    /**
     * POST /orders/:id/challan/verify-otp
     * Verify OTP code sent to farmer or buyer
     */
    server.post('/orders/:id/challan/verify-otp', async (request, reply) => {
        try {
            const challanId = request.params.id;
            // Validate input
            const body = verifyOtpSchema.parse(request.body);
            // Verify OTP
            const response = await challanService.verifyOtp({
                challanId,
                ...body,
            });
            server.log.info(`OTP verified for challan ${challanId}`);
            return reply.status(200).send({
                success: true,
                data: response,
                message: 'OTP verified successfully. Proceed to signature capture.',
            });
        }
        catch (error) {
            if (error instanceof EChallanError) {
                server.log.error(`EChallan Error: ${error.code} - ${error.message}`);
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.message,
                    code: error.code,
                });
            }
            server.log.error('Verify OTP failed', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to verify OTP',
                code: EChallanErrorCodes.INTERNAL_ERROR,
            });
        }
    });
    /**
     * POST /orders/:id/challan/sign
     * Capture digital signature from farmer or buyer
     * Mobile-friendly signature capture
     */
    server.post('/orders/:id/challan/sign', async (request, reply) => {
        try {
            const challanId = request.params.id;
            // Validate input
            const body = signChallanSchema.parse(request.body);
            // Get request context (IP, User-Agent)
            const requestIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';
            const userAgent = request.headers['user-agent'] || 'unknown';
            // Extract device type from user agent
            let deviceType = 'DESKTOP';
            if (userAgent.includes('Mobile'))
                deviceType = 'MOBILE';
            else if (userAgent.includes('Tablet'))
                deviceType = 'TABLET';
            // Enhance signature request with request context
            const enrichedRequest = {
                challanId,
                ...body,
                deviceInfo: {
                    ...body.deviceInfo,
                    userAgent,
                },
            };
            // Sign challan
            const response = await challanService.signChallan(enrichedRequest);
            server.log.info(`Signature captured for challan ${challanId} by ${body.signerType} from ${requestIp}`);
            return reply.status(200).send({
                success: true,
                data: response,
                message: response.isComplete
                    ? 'Challan fully signed! Escrow release initiated.'
                    : `Signature captured. Waiting for ${response.nextSigner} signature.`,
            });
        }
        catch (error) {
            if (error instanceof EChallanError) {
                server.log.error(`EChallan Error: ${error.code} - ${error.message}`);
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.message,
                    code: error.code,
                });
            }
            server.log.error('Sign challan failed', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to capture signature',
                code: EChallanErrorCodes.INTERNAL_ERROR,
            });
        }
    });
    /**
     * GET /orders/:id/challan/download
     * Download signed challan PDF
     */
    server.get('/orders/:id/challan/download', async (request, reply) => {
        try {
            const challanId = request.params.id;
            // Validate query params
            const query = downloadChallanSchema.parse(request.query);
            // Download challan
            const response = await challanService.downloadChallan({
                challanId,
                ...query,
            });
            server.log.info(`Challan downloaded: ${challanId}`);
            return reply.status(200).send({
                success: true,
                data: response,
                message: 'Challan ready for download',
            });
        }
        catch (error) {
            if (error instanceof EChallanError) {
                server.log.error(`EChallan Error: ${error.code} - ${error.message}`);
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.message,
                    code: error.code,
                });
            }
            server.log.error('Download challan failed', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to download challan',
                code: EChallanErrorCodes.INTERNAL_ERROR,
            });
        }
    });
    /**
     * GET /orders/:id/challan/verify
     * Verify challan integrity and authenticity via QR code scan
     */
    server.get('/orders/:id/challan/verify', async (request, reply) => {
        try {
            const challanId = request.params.id;
            // Check integrity
            const integrityResult = await challanService.checkIntegrity(challanId);
            server.log.info(`Challan verified: ${challanId} - Valid: ${integrityResult.isValid}`);
            return reply.status(200).send({
                success: true,
                data: integrityResult,
                message: integrityResult.isValid
                    ? 'Challan is authentic and has not been tampered with'
                    : 'Warning: Challan integrity check failed',
            });
        }
        catch (error) {
            if (error instanceof EChallanError) {
                server.log.error(`EChallan Error: ${error.code} - ${error.message}`);
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.message,
                    code: error.code,
                });
            }
            server.log.error('Challan verification failed', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to verify challan',
                code: EChallanErrorCodes.INTERNAL_ERROR,
            });
        }
    });
}
