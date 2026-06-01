/**
 * Dispute Escalation Worker
 * Handles escalation of disputes that are stalled or unresolved
 */

import { Job } from 'bullmq';
import { FastifyInstance } from 'fastify';

export interface DisputeEscalationJob {
  disputeId: string;
  escalationLevel: number; // 1, 2, 3
  reason: string;
}

export interface DisputeEscalationResult {
  disputeId: string;
  escalatedLevel: number;
  assignedAgent?: string;
  escalatedAt: string;
}

export async function disputeEscalationHandler(
  job: Job<DisputeEscalationJob>,
  server: FastifyInstance,
): Promise<DisputeEscalationResult> {
  const { disputeId, escalationLevel, reason } = job.data;

  try {
    server.log.info(
      {
        jobId: job.id,
        disputeId,
        escalationLevel,
        reason,
      },
      'Processing dispute escalation',
    );

    // Verify dispute exists
    const disputeResult = await server.db.query(
      'SELECT id, status, escalation_level, buyer_id, seller_id FROM disputes WHERE id = $1',
      [disputeId],
    );

    if (!disputeResult.rows || disputeResult.rows.length === 0) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    const dispute = disputeResult.rows[0];

    // Check if already at max escalation level
    const currentLevel = dispute.escalation_level || 0;
    const newLevel = Math.min(escalationLevel, 3); // Max escalation level is 3

    if (currentLevel >= newLevel) {
      server.log.info(
        { jobId: job.id, disputeId, currentLevel, newLevel },
        'Dispute already at or above escalation level',
      );

      return {
        disputeId,
        escalatedLevel: currentLevel,
        escalatedAt: new Date().toISOString(),
      };
    }

    // Update escalation level
    let assignedAgent = null;
    if (newLevel >= 2) {
      // Assign a dispute resolution agent
      const agentResult = await server.db.query(
        `SELECT id FROM dispute_agents 
         WHERE status = 'ACTIVE' 
         ORDER BY RANDOM() 
         LIMIT 1`,
      );

      if (agentResult.rows && agentResult.rows.length > 0) {
        assignedAgent = agentResult.rows[0].id;
      }
    }

    // Update the dispute
    const updateResult = await server.db.query(
      `UPDATE disputes 
       SET escalation_level = $1, 
           assigned_agent_id = $2, 
           escalation_reason = $3, 
           escalated_at = NOW(), 
           updated_at = NOW()
       WHERE id = $4 
       RETURNING escalation_level, escalated_at`,
      [newLevel, assignedAgent, reason, disputeId],
    );

    if (!updateResult.rows || updateResult.rows.length === 0) {
      throw new Error(`Failed to escalate dispute: ${disputeId}`);
    }

    // Send notifications
    try {
      const notificationQueue = (server as any).queues?.get('notification-queue');
      if (notificationQueue) {
        // Notify buyer
        await notificationQueue.add(
          'DELIVER_NOTIFICATION',
          {
            userId: dispute.buyer_id,
            type: 'DISPUTE_ESCALATED',
            title: 'Dispute Escalated',
            message: `Your dispute has been escalated to level ${newLevel}. ${assignedAgent ? 'An agent has been assigned.' : ''}`,
            data: {
              disputeId,
              escalationLevel: newLevel,
              reason,
            },
          },
          { attempts: 3 },
        );

        // Notify seller
        await notificationQueue.add(
          'DELIVER_NOTIFICATION',
          {
            userId: dispute.seller_id,
            type: 'DISPUTE_ESCALATED',
            title: 'Dispute Escalated',
            message: `A dispute against you has been escalated to level ${newLevel}. ${assignedAgent ? 'An agent has been assigned.' : ''}`,
            data: {
              disputeId,
              escalationLevel: newLevel,
              reason,
            },
          },
          { attempts: 3 },
        );
      }
    } catch (notificationError: any) {
      server.log.warn(
        { jobId: job.id, disputeId, error: notificationError?.message },
        'Failed to send escalation notifications',
      );
    }

    server.log.info(
      {
        jobId: job.id,
        disputeId,
        escalatedLevel: newLevel,
        assignedAgent,
      },
      'Dispute escalated successfully',
    );

    return {
      disputeId,
      escalatedLevel: newLevel,
      assignedAgent,
      escalatedAt: updateResult.rows[0].escalated_at,
    };
  } catch (error: any) {
    server.log.error(
      {
        jobId: job.id,
        disputeId,
        error: error?.message,
        stack: error?.stack,
        attemptsMade: job.attemptsMade,
      },
      'Dispute escalation failed',
    );

    throw error;
  }
}

/**
 * Configuration for dispute escalation worker
 */
export const disputeEscalationWorkerConfig = {
  name: 'dispute-escalation',
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 86400, // Remove after 24 hours
    },
    removeOnFail: false,
    timeout: 15000,
  },
  concurrency: 8,
  settings: {
    maxStalledCount: 3,
    maxStalledInterval: 60000,
    lockDuration: 15000,
  },
};
