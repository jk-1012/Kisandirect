/**
 * Price Alert Worker
 * Handles price monitoring and alerts for user subscriptions
 */
export async function priceAlertHandler(job, server) {
    const { alertId, userId, cropType, targetPrice, operator, market } = job.data;
    try {
        server.log.info({
            jobId: job.id,
            alertId,
            userId,
            cropType,
            targetPrice,
            operator,
            market,
        }, 'Processing price alert');
        // Get latest price for crop
        const priceResult = await server.db.query(`SELECT price, market FROM market_prices 
       WHERE crop_type = $1 AND (market = $2 OR $2 IS NULL)
       ORDER BY fetched_at DESC 
       LIMIT 1`, [cropType, market || null]);
        if (!priceResult.rows || priceResult.rows.length === 0) {
            server.log.info({ jobId: job.id, alertId, cropType, market }, 'No price data available for crop');
            return {
                alertId,
                triggered: false,
                message: 'No price data available',
            };
        }
        const priceData = priceResult.rows[0];
        const currentPrice = priceData.price;
        // Check if alert should trigger
        let triggered = false;
        if (operator === 'ABOVE') {
            triggered = currentPrice >= targetPrice;
        }
        else if (operator === 'BELOW') {
            triggered = currentPrice <= targetPrice;
        }
        server.log.info({
            jobId: job.id,
            alertId,
            currentPrice,
            targetPrice,
            operator,
            triggered,
        }, 'Price alert evaluation');
        if (triggered) {
            // Send notification to user
            try {
                const phrase = operator === 'ABOVE'
                    ? `Price of ${cropType} has reached ₹${currentPrice}/unit on ${priceData.market}`
                    : `Price of ${cropType} has dropped to ₹${currentPrice}/unit on ${priceData.market}`;
                // Add to notification queue
                const notificationQueue = server.queues?.get('notification-queue');
                if (notificationQueue) {
                    await notificationQueue.add('DELIVER_NOTIFICATION', {
                        userId,
                        type: 'PRICE_ALERT',
                        title: 'Price Alert',
                        message: phrase,
                        data: {
                            alertId,
                            cropType,
                            currentPrice,
                            targetPrice,
                            market: priceData.market,
                        },
                    }, {
                        delay: 0,
                        attempts: 3,
                    });
                    server.log.info({ jobId: job.id, alertId, userId }, 'Price alert notification queued');
                }
            }
            catch (notificationError) {
                server.log.warn({ jobId: job.id, alertId, error: notificationError?.message }, 'Failed to queue price alert notification');
                // Don't fail the whole job if notification fails
            }
            // Record the triggered event
            try {
                await server.db.query(`INSERT INTO price_alert_triggers (alert_id, user_id, triggered_at, current_price) 
           VALUES ($1, $2, NOW(), $3)`, [alertId, userId, currentPrice]);
            }
            catch (recordError) {
                server.log.warn({ jobId: job.id, alertId, error: recordError?.message }, 'Failed to record price alert trigger');
            }
        }
        return {
            alertId,
            triggered,
            currentPrice,
            message: triggered
                ? `Alert triggered: ${cropType} at ₹${currentPrice}`
                : `Price not met: ${cropType} at ₹${currentPrice}`,
        };
    }
    catch (error) {
        server.log.error({
            jobId: job.id,
            alertId,
            error: error?.message,
            stack: error?.stack,
            attemptsMade: job.attemptsMade,
        }, 'Price alert processing failed');
        throw error;
    }
}
/**
 * Configuration for price alert worker
 */
export const priceAlertWorkerConfig = {
    name: 'price-alerts',
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'fixed',
            delay: 10000,
        },
        removeOnComplete: {
            age: 86400, // Remove after 24 hours
        },
        removeOnFail: false,
        timeout: 15000,
    },
    concurrency: 20, // High concurrency for alert checks
    settings: {
        maxStalledCount: 2,
        maxStalledInterval: 60000,
        lockDuration: 15000,
    },
};
