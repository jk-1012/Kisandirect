/**
 * Listing Expiry Worker
 * Handles automatic expiration and archival of old listings
 */

import { Job } from 'bullmq';
import { FastifyInstance } from 'fastify';

export interface ListingExpiryJob {
  listingId: string;
  sellerId: string;
  reason: 'EXPIRED' | 'SOLD' | 'MANUAL';
}

export interface ListingExpiryResult {
  listingId: string;
  status: string;
  archivedAt: string;
  previousStatus: string;
}

export async function listingExpiryHandler(
  job: Job<ListingExpiryJob>,
  server: FastifyInstance,
): Promise<ListingExpiryResult> {
  const { listingId, sellerId, reason } = job.data;

  try {
    server.log.info(
      { jobId: job.id, listingId, sellerId, reason },
      'Starting listing expiry job',
    );

    // Get current listing
    const result = await server.db.query('SELECT id, status, seller_id FROM listings WHERE id = $1', [
      listingId,
    ]);

    if (!result.rows || result.rows.length === 0) {
      throw new Error(`Listing not found: ${listingId}`);
    }

    const listing = result.rows[0];

    // Verify ownership
    if (listing.seller_id !== sellerId) {
      throw new Error(`Seller ${sellerId} does not own listing ${listingId}`);
    }

    // Check current status - only expire if ACTIVE
    if (listing.status !== 'ACTIVE') {
      server.log.info(
        { jobId: job.id, listingId, currentStatus: listing.status },
        'Listing already expired or archived',
      );
      return {
        listingId,
        status: listing.status,
        archivedAt: new Date().toISOString(),
        previousStatus: listing.status,
      };
    }

    // Archive the listing
    const updateResult = await server.db.query(
      `UPDATE listings 
       SET status = $1, expired_at = NOW(), expiry_reason = $2, updated_at = NOW() 
       WHERE id = $3 AND seller_id = $4 
       RETURNING status, expired_at`,
      ['ARCHIVED', reason, listingId, sellerId],
    );

    if (!updateResult.rows || updateResult.rows.length === 0) {
      throw new Error(`Failed to archive listing: ${listingId}`);
    }

    server.log.info(
      {
        jobId: job.id,
        listingId,
        previousStatus: listing.status,
        newStatus: 'ARCHIVED',
        reason,
      },
      'Listing archived successfully',
    );

    // Publish event for other services
    try {
      if ((server as any).sendEvent) {
        await (server as any).sendEvent?.('listing:expired', {
          listingId,
          sellerId,
          reason,
          archivedAt: updateResult.rows[0].expired_at,
        });
      }
    } catch (eventError: any) {
      server.log.warn(
        { jobId: job.id, listingId, error: eventError?.message },
        'Failed to publish listing expired event',
      );
    }

    return {
      listingId,
      status: 'ARCHIVED',
      archivedAt: updateResult.rows[0].expired_at,
      previousStatus: listing.status,
    };
  } catch (error: any) {
    server.log.error(
      {
        jobId: job.id,
        listingId,
        error: error?.message,
        stack: error?.stack,
        attemptsMade: job.attemptsMade,
      },
      'Listing expiry job failed',
    );

    throw error;
  }
}

/**
 * Configuration for listing expiry worker
 */
export const listingExpiryWorkerConfig = {
  name: 'listing-expiry',
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
    removeOnComplete: {
      age: 86400, // Remove after 24 hours
    },
    removeOnFail: false,
    timeout: 10000,
  },
  concurrency: 10,
  settings: {
    maxStalledCount: 2,
    maxStalledInterval: 60000,
    lockDuration: 10000,
  },
};
