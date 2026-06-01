/**
 * Notification Fallback Worker
 * Handles retrying failed notifications with multiple channels
 */

import { Job } from 'bullmq';
import { FastifyInstance } from 'fastify';

export interface NotificationFallbackJob {
  notificationId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  channels: string[]; // ['EMAIL', 'SMS', 'PUSH']
  attempt: number;
  primaryChannelFailed: string;
}

export interface NotificationFallbackResult {
  notificationId: string;
  delivered: boolean;
  channel: string;
  deliveredAt: string;
}

export async function notificationFallbackHandler(
  job: Job<NotificationFallbackJob>,
  server: FastifyInstance,
): Promise<NotificationFallbackResult> {
  const {
    notificationId,
    userId,
    type,
    title,
    message,
    channels,
    attempt,
    primaryChannelFailed,
  } = job.data;

  try {
    server.log.info(
      {
        jobId: job.id,
        notificationId,
        userId,
        type,
        attempt,
        primaryChannelFailed,
        fallbackChannels: channels.filter((c) => c !== primaryChannelFailed),
      },
      'Processing notification fallback',
    );

    // Get fallback channels (exclude the one that failed)
    const fallbackChannels = channels.filter((c) => c !== primaryChannelFailed);

    if (fallbackChannels.length === 0) {
      server.log.warn(
        { jobId: job.id, notificationId, userId },
        'No fallback channels available',
      );

      // Mark notification as permanently failed
      await server.db.query(
        `UPDATE notifications 
         SET status = 'FAILED', failed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [notificationId],
      );

      throw new Error('All notification channels exhausted');
    }

    // Try fallback channels in order
    let delivered = false;
    let successChannel = null;

    for (const channel of fallbackChannels) {
      try {
        server.log.info(
          { jobId: job.id, notificationId, channel, attempt },
          `Attempting to deliver via ${channel}`,
        );

        const result = await deliverNotificationViChannel(
          server,
          userId,
          channel,
          title,
          message,
        );

        if (result.success) {
          successChannel = channel;
          delivered = true;
          break;
        }
      } catch (channelError: any) {
        server.log.warn(
          { jobId: job.id, notificationId, channel, error: channelError?.message },
          `Failed to deliver via ${channel}`,
        );
        // Continue to next channel
      }
    }

    if (!delivered) {
      throw new Error(`All fallback channels failed for notification: ${notificationId}`);
    }

    // Mark notification as delivered
    await server.db.query(
      `UPDATE notifications 
       SET status = 'DELIVERED', delivered_at = NOW(), delivery_channel = $2, updated_at = NOW()
       WHERE id = $1`,
      [notificationId, successChannel],
    );

    server.log.info(
      {
        jobId: job.id,
        notificationId,
        userId,
        successChannel,
        attempt,
      },
      'Notification delivered via fallback channel',
    );

    return {
      notificationId,
      delivered: true,
      channel: successChannel!,
      deliveredAt: new Date().toISOString(),
    };
  } catch (error: any) {
    server.log.error(
      {
        jobId: job.id,
        notificationId,
        userId,
        error: error?.message,
        stack: error?.stack,
        attemptsMade: job.attemptsMade,
      },
      'Notification fallback failed',
    );

    throw error;
  }
}

/**
 * Deliver notification via a specific channel
 */
async function deliverNotificationViChannel(
  server: FastifyInstance,
  userId: string,
  channel: string,
  title: string,
  message: string,
): Promise<{ success: boolean }> {
  try {
    // Get user contact info
    const userResult = await server.db.query(
      'SELECT email, phone FROM public.users WHERE id = $1',
      [userId],
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      throw new Error(`User not found: ${userId}`);
    }

    const user = userResult.rows[0];

    if (channel === 'EMAIL') {
      if (!user.email) {
        throw new Error('User email not available');
      }
      // Email delivery logic
      await sendEmail(server, user.email, title, message);
      return { success: true };
    } else if (channel === 'SMS') {
      if (!user.phone) {
        throw new Error('User phone not available');
      }
      // SMS delivery logic
      await sendSms(server, user.phone, message);
      return { success: true };
    } else if (channel === 'PUSH') {
      // Push notification logic
      await sendPushNotification(server, userId, title, message);
      return { success: true };
    } else {
      throw new Error(`Unknown notification channel: ${channel}`);
    }
  } catch (error: any) {
    server.log.debug(
      { error: error?.message, channel },
      'Channel delivery attempt failed',
    );
    return { success: false };
  }
}

/**
 * Send email notification
 */
async function sendEmail(
  server: FastifyInstance,
  email: string,
  title: string,
  message: string,
): Promise<void> {
  // Implementation depends on your email service
  // This is a placeholder
  server.log.debug({ email, title }, 'Sending email notification');
  // await server.emailService.send({ to: email, subject: title, body: message });
}

/**
 * Send SMS notification
 */
async function sendSms(
  server: FastifyInstance,
  phone: string,
  message: string,
): Promise<void> {
  // Implementation depends on your SMS service
  // This is a placeholder
  server.log.debug({ phone }, 'Sending SMS notification');
  // await server.smsService.send({ to: phone, body: message });
}

/**
 * Send push notification
 */
async function sendPushNotification(
  server: FastifyInstance,
  userId: string,
  title: string,
  message: string,
): Promise<void> {
  // Implementation depends on your push notification service
  // This is a placeholder
  server.log.debug({ userId, title }, 'Sending push notification');
  // await server.pushService.send({ userId, title, body: message });
}

/**
 * Configuration for notification fallback worker
 */
export const notificationFallbackWorkerConfig = {
  name: 'notification-fallback',
  defaultJobOptions: {
    attempts: 4, // Retry 4 times with different channels
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 259200, // Remove after 3 days
    },
    removeOnFail: false,
    timeout: 20000,
  },
  concurrency: 15,
  settings: {
    maxStalledCount: 2,
    maxStalledInterval: 60000,
    lockDuration: 20000,
  },
};
