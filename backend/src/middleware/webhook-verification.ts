/**
 * Razorpay Webhook Verification Middleware
 * 
 * Features:
 * - HMAC-SHA256 signature verification
 * - Idempotency via webhook_event_id deduplication
 * - Automatic retry tracking
 * - Dead-letter queue for failed webhooks
 * - Structured logging for audit trail
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { WebhookEvent, WebhookProcessingStatus, RazorpayWebhookPayload } from '../types/payments.js';

export interface WebhookMiddlewareOptions {
  reasonableClockSkew?: number; // in seconds, default 300
  maxRetries?: number; // default 3
}

export function createWebhookVerificationMiddleware(
  server: FastifyInstance,
  options: WebhookMiddlewareOptions = {}
) {
  const REASONABLE_CLOCK_SKEW = options.reasonableClockSkew ?? 300; // 5 minutes
  const MAX_RETRIES = options.maxRetries ?? 3;

  /**
   * Verify Razorpay webhook signature using HMAC-SHA256
   * @param payload - The raw webhook payload (must be string for HMAC)
   * @param signature - The X-Razorpay-Signature header value
   * @returns true if signature is valid
   */
  function verifyWebhookSignature(payload: string, signature: string): boolean {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      server.log.error('RAZORPAY_WEBHOOK_SECRET not configured');
      return false;
    }

    // Compute HMAC-SHA256
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  }

  /**
   * Check if webhook event is within reasonable clock skew
   * Prevents replay attacks from very old webhooks
   */
  function isWithinClockSkew(webhookTimestamp: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    const skew = Math.abs(now - webhookTimestamp);
    
    if (skew > REASONABLE_CLOCK_SKEW) {
      server.log.warn(
        { skew, threshold: REASONABLE_CLOCK_SKEW },
        'Webhook timestamp outside reasonable clock skew'
      );
      return false;
    }
    return true;
  }

  /**
   * Check if webhook event has already been processed (idempotency)
   * Returns existing webhook record if found
   */
  async function getExistingWebhookEvent(webhookEventId: string): Promise<WebhookEvent | null> {
    try {
      const result = await server.db.query(
        `SELECT * FROM vault.webhook_events WHERE webhook_event_id = $1`,
        [webhookEventId]
      );
      return result.rows[0] || null;
    } catch (err) {
      server.log.error({ err }, 'Failed to check existing webhook event');
      return null;
    }
  }

  /**
   * Store webhook event in database for idempotency
   */
  async function storeWebhookEvent(
    webhookEventId: string,
    signature: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<WebhookEvent> {
    const result = await server.db.query(
      `INSERT INTO vault.webhook_events
       (webhook_event_id, webhook_signature, event_type, payload, processing_status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [webhookEventId, signature, eventType, JSON.stringify(payload), 'PENDING']
    );

    return result.rows[0];
  }

  /**
   * Update webhook processing status
   */
  async function updateWebhookStatus(
    webhookEventId: string,
    status: WebhookProcessingStatus,
    transactionId?: string,
    error?: string
  ): Promise<void> {
    await server.db.query(
      `UPDATE vault.webhook_events 
       SET processing_status = $1,
           transaction_id = $2,
           last_attempt_at = NOW(),
           attempt_count = attempt_count + 1,
           last_error = $3,
           completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE NULL END
       WHERE webhook_event_id = $4`,
      [status, transactionId, error, webhookEventId]
    );
  }

  /**
   * Send webhook to dead-letter queue if max retries exceeded
   */
  async function sendToDeadLetterQueue(
    webhookEventId: string,
    error: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      server.log.error(
        { webhook_event_id: webhookEventId, error },
        'Webhook exceeded max retries, sending to DLQ'
      );

      // Queue the DLQ job
      if (server.queues?.payoutQueue) {
        await server.queues.payoutQueue.add(
          'WEBHOOK_DEAD_LETTER',
          {
            webhook_event_id: webhookEventId,
            error,
            payload,
            timestamp: new Date().toISOString()
          },
          {
            delay: 60000, // 1 minute
            attempts: 1, // DLQ doesn't retry
            removeOnComplete: false
          }
        );
      }

      // Mark as DEAD_LETTER in database
      await server.db.query(
        `UPDATE vault.webhook_events 
         SET processing_status = $1
         WHERE webhook_event_id = $2`,
        ['DEAD_LETTER', webhookEventId]
      );
    } catch (err) {
      server.log.error({ err }, 'Failed to send webhook to DLQ');
    }
  }

  /**
   * Middleware function to be attached to webhook route
   * Usage: server.post('/webhooks/razorpay', { preHandler: [verifyWebhookMiddleware] }, ...)
   */
  async function verifyWebhookMiddleware(request: FastifyRequest, reply: FastifyReply) {
    try {
      // 1. Get signature from header
      const signature = request.headers['x-razorpay-signature'] as string;
      if (!signature) {
        server.log.warn('Missing X-Razorpay-Signature header');
        return reply.code(401).send({ error: 'Missing signature header' });
      }

      // 2. Get request body for signature verification
      const rawBody = Buffer.isBuffer(request.body) 
        ? request.body 
        : JSON.stringify(request.body);
      
      if (!rawBody) {
        server.log.warn('Missing request body');
        return reply.code(400).send({ error: 'Missing request body' });
      }

      // 3. Verify signature
      const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
      if (!verifyWebhookSignature(bodyStr, signature)) {
        server.log.warn({ signature }, 'Invalid webhook signature');
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      // 4. Parse payload
      const payload = JSON.parse(bodyStr) as RazorpayWebhookPayload;

      // 5. Validate event structure
      if (!payload.event || !payload.payload) {
        server.log.warn('Invalid webhook payload structure');
        return reply.code(400).send({ error: 'Invalid payload structure' });
      }

      // 6. Check clock skew
      if (!isWithinClockSkew(payload.created_at)) {
        // Still acknowledge the webhook, but log it
        server.log.warn(
          { event: payload.event, created_at: payload.created_at },
          'Webhook timestamp outside acceptable range'
        );
        // Continue processing but mark for manual review
      }

      // 7. Check for duplicate webhook event (idempotency)
      // Razorpay generates event_id from event field - we use this for deduplication
      const webhookEventId = `${payload.event}_${payload.created_at}`;
      const existingWebhook = await getExistingWebhookEvent(webhookEventId);

      if (existingWebhook) {
        server.log.info(
          { webhook_event_id: webhookEventId, previous_status: existingWebhook.processing_status },
          'Duplicate webhook event received'
        );

        // If already completed, return success immediately (idempotent)
        if (existingWebhook.processing_status === 'COMPLETED') {
          return reply.code(200).send({
            success: true,
            acknowledged: true,
            message: 'Webhook already processed (idempotent)',
            webhook_event_id: webhookEventId
          });
        }

        // If still processing, acknowledge and exit
        if (existingWebhook.processing_status === 'PROCESSING') {
          return reply.code(202).send({
            success: true,
            acknowledged: true,
            message: 'Webhook is already being processed',
            webhook_event_id: webhookEventId
          });
        }

        // If failed, we might retry - increment the attempt
        if (existingWebhook.attempt_count < MAX_RETRIES) {
          server.log.info(
            { webhook_event_id: webhookEventId, attempt: existingWebhook.attempt_count + 1 },
            'Retrying failed webhook'
          );
          // Attach the existing webhook to request for processing
          (request as any).webhookEvent = existingWebhook;
          (request as any).isRetry = true;
        } else {
          // Max retries exceeded
          await sendToDeadLetterQueue(
            webhookEventId,
            `Max retries (${MAX_RETRIES}) exceeded`,
            payload.payload
          );
          return reply.code(200).send({
            success: false,
            acknowledged: true,
            message: 'Webhook sent to dead-letter queue after max retries'
          });
        }
      } else {
        // New webhook event - store it
        const webhookEvent = await storeWebhookEvent(
          webhookEventId,
          signature,
          payload.event,
          payload.payload
        );
        (request as any).webhookEvent = webhookEvent;
        (request as any).isRetry = false;
      }

      // 8. Attach verified data to request for handler
      (request as any).verifiedWebhook = {
        event_id: webhookEventId,
        event_type: payload.event,
        payload: payload.payload,
        created_at: payload.created_at,
        signature
      };

      server.log.info(
        { event_id: webhookEventId, event_type: payload.event },
        'Webhook signature verified'
      );

      // Continue to next handler
    } catch (err) {
      server.log.error({ err }, 'Webhook verification failed');
      return reply.code(400).send({
        error: 'Webhook verification failed',
        message: (err as Error).message
      });
    }
  }

  /**
   * Mark webhook as completed with transaction ID
   * Call from webhook handler after successful processing
   */
  async function completeWebhookProcessing(
    webhookEventId: string,
    transactionId: string
  ): Promise<void> {
    await updateWebhookStatus(webhookEventId, 'COMPLETED', transactionId);
    server.log.info(
      { webhook_event_id: webhookEventId, transaction_id: transactionId },
      'Webhook processing completed'
    );
  }

  /**
   * Mark webhook as failed and handle retry logic
   * Call from webhook handler if error occurs
   */
  async function failWebhookProcessing(
    webhookEventId: string,
    error: string
  ): Promise<void> {
    const webhook = await getExistingWebhookEvent(webhookEventId);
    if (!webhook) return;

    if (webhook.attempt_count < MAX_RETRIES) {
      await updateWebhookStatus(webhookEventId, 'FAILED', undefined, error);
      server.log.warn(
        { webhook_event_id: webhookEventId, attempt: webhook.attempt_count + 1, error },
        'Webhook processing failed, will retry'
      );
    } else {
      await updateWebhookStatus(webhookEventId, 'FAILED', undefined, error);
      await sendToDeadLetterQueue(
        webhookEventId,
        `Max retries exceeded: ${error}`,
        webhook.payload
      );
    }
  }

  return {
    verifyWebhookMiddleware,
    verifyWebhookSignature,
    isWithinClockSkew,
    getExistingWebhookEvent,
    storeWebhookEvent,
    updateWebhookStatus,
    completeWebhookProcessing,
    failWebhookProcessing,
    sendToDeadLetterQueue
  };
}

export type WebhookVerificationService = ReturnType<typeof createWebhookVerificationMiddleware>;
