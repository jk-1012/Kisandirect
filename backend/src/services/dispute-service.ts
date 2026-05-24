import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createTrustScoreService } from './trust-score-service.js';
import { generateDisputeId } from '../utils/ids.js';

export function createDisputeService(server: FastifyInstance) {
  async function writeLedgerEntry(entry: {
    event_type: string;
    order_id: string;
    amount_paise: number;
    farmer_id?: string;
    buyer_id?: string;
    metadata?: Record<string, any>;
  }) {
    const last = await server.db.query('SELECT entry_hash FROM audit.transaction_ledger ORDER BY created_at DESC LIMIT 1');
    const previousHash = last.rows[0]?.entry_hash ?? '';
    const now = new Date().toISOString();
    const entryHash = crypto.createHash('sha256').update(previousHash + JSON.stringify(entry) + now).digest('hex');
    await server.db.query(
      `INSERT INTO audit.transaction_ledger(txn_id, order_id, event_type, amount_paise, farmer_id, buyer_id, metadata, prev_hash, entry_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [`TXN-${crypto.randomBytes(6).toString('hex')}`, entry.order_id, entry.event_type, entry.amount_paise, entry.farmer_id ?? null, entry.buyer_id ?? null, entry.metadata ?? {}, previousHash, entryHash]
    );
    return entryHash;
  }

  async function assignAgent(disputeId: string) {
    const agentResult = await server.db.query(
      `SELECT id FROM public.users WHERE role = 'OPERATIONS' ORDER BY last_active_at NULLS LAST, created_at ASC LIMIT 1`
    );
    const agent = agentResult.rows[0];
    if (!agent) {
      await server.db.query(
        `UPDATE public.disputes SET status = 'PENDING_ASSIGNMENT', updated_at = NOW() WHERE dispute_id = $1`,
        [disputeId]
      );
      await logDisputeAudit(disputeId, 'EVIDENCE_SUBMITTED', 'PENDING_ASSIGNMENT', null, null, 'No operations agent available, pending assignment');
      return null;
    }
    await server.db.query(
      `UPDATE public.disputes SET assigned_agent_id = $1, agent_assigned_at = NOW(), status = 'AGENT_ASSIGNED', updated_at = NOW() WHERE dispute_id = $2`,
      [agent.id, disputeId]
    );
    await logDisputeAudit(disputeId, 'EVIDENCE_SUBMITTED', 'AGENT_ASSIGNED', agent.id, 'operations', 'Agent assigned automatically');
    return agent.id;
  }

  async function logDisputeAudit(disputeId: string, fromStatus: string | null, toStatus: string, actorId: string | null, actorRole: string | null, notes: string | null) {
    const disputeRow = await server.db.query('SELECT id FROM public.disputes WHERE dispute_id = $1', [disputeId]);
    const dispute = disputeRow.rows[0];
    if (!dispute) return;
    await server.db.query(
      `INSERT INTO public.dispute_audit_log (dispute_id, from_status, to_status, actor_id, actor_role, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [dispute.id, fromStatus, toStatus, actorId, actorRole, notes]
    );
  }

  async function createDispute(buyerId: string, orderId: string, reason: string, description: string | null) {
    const orderResult = await server.db.query(
      `SELECT o.id, o.order_id, o.farmer_id, o.buyer_id, o.delivery_confirmed_at, o.order_status, o.payment_status, o.subtotal_paise
       FROM public.orders o
       WHERE o.order_id = $1`,
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) throw server.httpErrors.notFound('Order not found');
    if (order.buyer_id !== buyerId) throw server.httpErrors.forbidden('Only the buyer can raise a dispute');
    if (!order.delivery_confirmed_at) throw server.httpErrors.badRequest('Delivery has not been confirmed yet');

    const deliveredAt = new Date(order.delivery_confirmed_at).getTime();
    const now = Date.now();
    if (now - deliveredAt > 24 * 60 * 60 * 1000) {
      throw server.httpErrors.badRequest('Disputes must be raised within 24 hours of delivery confirmation');
    }

    const existing = await server.db.query('SELECT id FROM public.disputes WHERE order_id = $1', [order.id]);
    if (existing.rowCount > 0) {
      throw server.httpErrors.conflict('Dispute already exists for this order');
    }

    const disputeId = generateDisputeId();
    const evidenceDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000);

    await server.db.query('BEGIN');
    try {
      await server.db.query(
        `UPDATE public.orders SET payment_status = 'DISPUTE_FROZEN', updated_at = NOW() WHERE id = $1`,
        [order.id]
      );

      await writeLedgerEntry({
        event_type: 'DISPUTE_FREEZE',
        order_id: order.id,
        amount_paise: Number(order.subtotal_paise),
        farmer_id: order.farmer_id,
        buyer_id: buyerId,
        metadata: { dispute_id: disputeId }
      });

      const insert = await server.db.query(
        `INSERT INTO public.disputes (dispute_id, order_id, raised_by, farmer_id, reason, description, status, evidence_deadline_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'AWAITING_EVIDENCE',$7,NOW(),NOW())
         RETURNING dispute_id, status, reason, description, evidence_deadline_at`,
        [disputeId, order.id, buyerId, order.farmer_id, reason, description, evidenceDeadline]
      );

      await logDisputeAudit(disputeId, null, 'AWAITING_EVIDENCE', buyerId, 'buyer', 'Dispute raised and escrow frozen');
      await server.queues.payoutQueue.remove(order.order_id);
      await server.db.query('COMMIT');

      await server.queues.disputeQueue.add('DISPUTE_EVIDENCE_TIMEOUT', { disputeId }, { delay: 12 * 60 * 60 * 1000, jobId: `dispute_evidence_timeout:${disputeId}` });
      return insert.rows[0];
    } catch (err) {
      await server.db.query('ROLLBACK');
      throw err;
    }
  }

  async function getEvidenceUploadUrls(userId: string, disputeId: string, photoCount: number) {
    const disputeResult = await server.db.query(
      `SELECT d.id, d.status, d.raised_by, d.evidence_deadline_at
       FROM public.disputes d
       WHERE d.dispute_id = $1`,
      [disputeId]
    );
    const dispute = disputeResult.rows[0];
    if (!dispute) throw server.httpErrors.notFound('Dispute not found');
    if (dispute.raised_by !== userId) throw server.httpErrors.forbidden('Only the buyer can upload evidence');
    if (dispute.status !== 'AWAITING_EVIDENCE') {
      throw server.httpErrors.badRequest('Evidence upload is not accepted at this stage');
    }
    if (dispute.evidence_deadline_at && new Date() > new Date(dispute.evidence_deadline_at)) {
      throw server.httpErrors.badRequest('Evidence deadline passed');
    }

    if (photoCount < 1 || photoCount > 5) {
      throw server.httpErrors.badRequest('photo_count must be between 1 and 5');
    }

    const uploadUrls = [] as Array<{ index: number; upload_url: string; s3_key: string }>;
    for (let i = 0; i < photoCount; i += 1) {
      const key = `disputes/${disputeId}/evidence/${Date.now()}_${i}_${crypto.randomBytes(4).toString('hex')}.jpg`;
      const command = new PutObjectCommand({
        Bucket: server.storage.bucketName,
        Key: key,
        ContentType: 'image/jpeg',
        ACL: 'private'
      });
      const uploadUrl = await getSignedUrl(server.storage.s3Client, command, { expiresIn: 60 * 60 });
      uploadUrls.push({ index: i, upload_url: uploadUrl, s3_key: key });
    }

    return { dispute_id: disputeId, upload_urls: uploadUrls };
  }

  async function confirmEvidenceUpload(userId: string, disputeId: string, s3Keys: string[]) {
    const disputeResult = await server.db.query(
      `SELECT d.id, d.status, d.raised_by, d.order_id
       FROM public.disputes d
       WHERE d.dispute_id = $1`,
      [disputeId]
    );
    const dispute = disputeResult.rows[0];
    if (!dispute) throw server.httpErrors.notFound('Dispute not found');
    if (dispute.raised_by !== userId) throw server.httpErrors.forbidden('Only the buyer can confirm evidence upload');
    if (dispute.status !== 'AWAITING_EVIDENCE') {
      throw server.httpErrors.badRequest('Evidence can only be confirmed while dispute is awaiting evidence');
    }
    if (!s3Keys || !Array.isArray(s3Keys) || s3Keys.length === 0) {
      throw server.httpErrors.badRequest('s3_keys are required');
    }

    const urls = s3Keys.map((key) => `https://${server.storage.bucketName}.s3.${server.storage.region}.amazonaws.com/${key}`);

    await server.db.query('BEGIN');
    try {
      await server.db.query(
        `UPDATE public.disputes SET status = 'EVIDENCE_SUBMITTED', evidence_urls = $1, evidence_uploaded_at = NOW(), updated_at = NOW() WHERE dispute_id = $2`,
        [urls, disputeId]
      );
      await logDisputeAudit(disputeId, 'AWAITING_EVIDENCE', 'EVIDENCE_SUBMITTED', userId, 'buyer', 'Evidence uploaded and confirmed');

      for (const url of urls) {
        await server.db.query(
          `INSERT INTO public.dispute_evidence (dispute_id, uploaded_by, evidence_url, evidence_metadata)
           VALUES ((SELECT id FROM public.disputes WHERE dispute_id = $1), $2, $3, $4)`,
          [disputeId, userId, url, { source: 'buyer_confirmed' }]
        );
      }

      await server.db.query('COMMIT');
    } catch (err) {
      await server.db.query('ROLLBACK');
      throw err;
    }

    await server.queues.disputeQueue.remove(`dispute_evidence_timeout:${disputeId}`);
    await server.queues.disputeQueue.add('DISPUTE_ASSIGN_AGENT', { disputeId }, { delay: 4 * 60 * 60 * 1000, jobId: `dispute_assign_agent:${disputeId}` });
    await server.queues.disputeQueue.add('DISPUTE_RESOLUTION_DEADLINE', { disputeId }, { delay: 72 * 60 * 60 * 1000, jobId: `dispute_resolution_deadline:${disputeId}` });

    return { dispute_id: disputeId, status: 'EVIDENCE_SUBMITTED', evidence_urls: urls };
  }

  async function resolveDispute(actorId: string, disputeId: string, outcome: 'BUYER_FAVOR' | 'FARMER_FAVOR', notes: string) {
    const disputeResult = await server.db.query(
      `SELECT d.id, d.status, d.order_id, d.farmer_id, d.buyer_id, o.id AS order_pk, o.payment_status
       FROM public.disputes d
       JOIN public.orders o ON o.id = d.order_id
       WHERE d.dispute_id = $1`,
      [disputeId]
    );
    const dispute = disputeResult.rows[0];
    if (!dispute) throw server.httpErrors.notFound('Dispute not found');
    if (!['ASSIGNED', 'EVIDENCE_SUBMITTED', 'PENDING_ASSIGNMENT'].includes(dispute.status)) {
      throw server.httpErrors.badRequest('Dispute is not in a resolvable state');
    }

    const actorResult = await server.db.query('SELECT role FROM public.users WHERE id = $1', [actorId]);
    const actor = actorResult.rows[0];
    if (!actor) throw server.httpErrors.notFound('Actor not found');
    if (actor.role !== 'ADMIN' && actor.role !== 'OPERATIONS' && dispute.buyer_id !== actorId) {
      throw server.httpErrors.forbidden('Not authorized to resolve this dispute');
    }

    const outcomeStatus = outcome === 'BUYER_FAVOR' ? 'RESOLVED_BUYER_FAVOR' : 'RESOLVED_FARMER_FAVOR';
    await server.db.query(
      `UPDATE public.disputes SET status = $1, resolved_at = NOW(), resolved_by = $2, resolution_outcome = $3, updated_at = NOW() WHERE dispute_id = $4`,
      [outcomeStatus, actorId, notes, disputeId]
    );

    if (outcome === 'BUYER_FAVOR') {
      await server.db.query(
        `UPDATE public.orders SET payment_status = 'REFUNDED', order_status = 'DISPUTE_RESOLVED_BUYER', updated_at = NOW() WHERE id = $1`,
        [dispute.order_pk]
      );
      await writeLedgerEntry({
        event_type: 'DISPUTE_RESOLVED_BUYER',
        order_id: dispute.order_pk,
        amount_paise: 0,
        farmer_id: dispute.farmer_id,
        buyer_id: dispute.buyer_id,
        metadata: { dispute_id: disputeId, notes }
      });
    } else {
      await server.db.query(
        `UPDATE public.orders SET order_status = 'DISPUTE_RESOLVED_FARMER', updated_at = NOW() WHERE id = $1`,
        [dispute.order_pk]
      );
      await writeLedgerEntry({
        event_type: 'DISPUTE_RESOLVED_FARMER',
        order_id: dispute.order_pk,
        amount_paise: 0,
        farmer_id: dispute.farmer_id,
        buyer_id: dispute.buyer_id,
        metadata: { dispute_id: disputeId, notes }
      });
      await createTrustScoreService(server).recalculateFarmerTrustScore(dispute.farmer_id);
      await server.queues.payoutQueue.add('RELEASE_ESCROW', { orderId: dispute.order_id }, { jobId: dispute.order_id, removeOnComplete: true, removeOnFail: false });
    }

    await server.queues.disputeQueue.remove(`dispute_evidence_timeout:${disputeId}`);
    await server.queues.disputeQueue.remove(`dispute_assign_agent:${disputeId}`);
    await server.queues.disputeQueue.remove(`dispute_resolution_deadline:${disputeId}`);

    return { dispute_id: disputeId, status: outcomeStatus, outcome, notes };
  }

  async function autoCloseDisputeIfEvidenceMissing(disputeId: string) {
    const disputeResult = await server.db.query(`SELECT d.id, d.status, d.order_id, d.farmer_id, d.buyer_id FROM public.disputes d WHERE d.dispute_id = $1`, [disputeId]);
    const dispute = disputeResult.rows[0];
    if (!dispute) return null;
    if (dispute.status !== 'AWAITING_EVIDENCE') return null;

    await server.db.query(
      `UPDATE public.disputes SET status = 'AUTO_CLOSED_FARMER', resolved_at = NOW(), resolution_outcome = 'FARMER_FAVOR', updated_at = NOW() WHERE dispute_id = $1`,
      [disputeId]
    );
    await server.db.query(
      `UPDATE public.orders SET order_status = 'DISPUTE_RESOLVED_FARMER', updated_at = NOW() WHERE id = $1`,
      [dispute.order_id]
    );
    await writeLedgerEntry({
      event_type: 'DISPUTE_AUTO_CLOSED_FARMER',
      order_id: dispute.order_id,
      amount_paise: 0,
      farmer_id: dispute.farmer_id,
      buyer_id: dispute.buyer_id,
      metadata: { dispute_id: disputeId }
    });
    await createTrustScoreService(server).recalculateFarmerTrustScore(dispute.farmer_id);
    await server.queues.payoutQueue.add('RELEASE_ESCROW', { orderId: dispute.order_id }, { jobId: dispute.order_id, removeOnComplete: true, removeOnFail: false });
    return { dispute_id: disputeId, status: 'AUTO_CLOSED_FARMER' };
  }

  async function autoResolveDisputeAfterDeadline(disputeId: string) {
    const disputeResult = await server.db.query(
      `SELECT d.id, d.status, d.order_id, d.farmer_id, d.buyer_id
       FROM public.disputes d
       WHERE d.dispute_id = $1`,
      [disputeId]
    );
    const dispute = disputeResult.rows[0];
    if (!dispute) return null;
    if (['RESOLVED_BUYER_FAVOR', 'RESOLVED_FARMER_FAVOR', 'AUTO_CLOSED_FARMER'].includes(dispute.status)) {
      return null;
    }

    await server.db.query(
      `UPDATE public.disputes SET status = 'AUTO_CLOSED_FARMER', resolved_at = NOW(), resolution_outcome = 'FARMER_FAVOR', updated_at = NOW() WHERE dispute_id = $1`,
      [disputeId]
    );
    await server.db.query(
      `UPDATE public.orders SET order_status = 'DISPUTE_RESOLVED_FARMER', updated_at = NOW() WHERE id = $1`,
      [dispute.order_id]
    );
    await writeLedgerEntry({
      event_type: 'DISPUTE_AUTO_CLOSED_FARMER',
      order_id: dispute.order_id,
      amount_paise: 0,
      farmer_id: dispute.farmer_id,
      buyer_id: dispute.buyer_id,
      metadata: { dispute_id: disputeId, deadline_closed: true }
    });
    await createTrustScoreService(server).recalculateFarmerTrustScore(dispute.farmer_id);
    await server.queues.payoutQueue.add('RELEASE_ESCROW', { orderId: dispute.order_id }, { jobId: dispute.order_id, removeOnComplete: true, removeOnFail: false });
    return { dispute_id: disputeId, status: 'AUTO_CLOSED_FARMER' };
  }

  async function enforceAgentAssignment(disputeId: string) {
    const disputeResult = await server.db.query(`SELECT status FROM public.disputes WHERE dispute_id = $1`, [disputeId]);
    const dispute = disputeResult.rows[0];
    if (!dispute) return null;
    if (!['EVIDENCE_SUBMITTED', 'PENDING_ASSIGNMENT'].includes(dispute.status)) {
      return null;
    }
    const agentId = await assignAgent(disputeId);
    return { dispute_id: disputeId, assigned_agent_id: agentId, status: agentId ? 'ASSIGNED' : 'PENDING_ASSIGNMENT' };
  }

  async function getDisputeById(userId: string, disputeId: string) {
    const result = await server.db.query(
      `SELECT d.*, o.order_id AS external_order_id, o.payment_status, o.order_status
       FROM public.disputes d
       JOIN public.orders o ON o.id = d.order_id
       WHERE d.dispute_id = $1 AND (d.buyer_id = $2 OR d.farmer_id = $2 OR d.assigned_agent_id = $2)`,
      [disputeId, userId]
    );
    const dispute = result.rows[0];
    if (!dispute) throw server.httpErrors.notFound('Dispute not found');
    return dispute;
  }

  async function listDisputesForUser(userId: string) {
    const result = await server.db.query(
      `SELECT d.dispute_id, d.status, d.reason, d.resolution_outcome, d.created_at, d.resolved_at, o.order_id AS external_order_id
       FROM public.disputes d
       JOIN public.orders o ON o.id = d.order_id
       WHERE d.buyer_id = $1 OR d.farmer_id = $1 OR d.assigned_agent_id = $1
       ORDER BY d.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  return {
    createDispute,
    getEvidenceUploadUrls,
    confirmEvidenceUpload,
    resolveDispute,
    autoCloseDisputeIfEvidenceMissing,
    autoResolveDisputeAfterDeadline,
    enforceAgentAssignment,
    getDisputeById,
    listDisputesForUser
  };
}
