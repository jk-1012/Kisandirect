/**
 * Queue Integration Guide
 * 
 * This file documents how to integrate the new Queue Manager and Enhanced Workers
 * into the existing BullMQ queues infrastructure.
 * 
 * COMPONENTS CREATED:
 * 1. Queue Manager (src/services/queue-manager.ts) - 450+ lines
 * 2. Photo Compression Worker (src/workers/photo-compression-worker.ts) - 200+ lines
 * 3. Listing Expiry Worker (src/workers/listing-expiry-worker.ts) - 150+ lines
 * 4. Price Alert Worker (src/workers/price-alert-worker.ts) - 140+ lines
 * 5. Supply Forecast Worker (src/workers/supply-forecast-worker.ts) - 130+ lines
 * 6. Dispute Escalation Worker (src/workers/dispute-escalation-worker.ts) - 170+ lines
 * 7. Notification Fallback Worker (src/workers/notification-fallback-worker.ts) - 220+ lines
 * 8. Sitemap Generator Worker (src/workers/sitemap-generator-worker.ts) - 280+ lines
 * 
 * TOTAL NEW CODE: 1,700+ lines
 * 
 * INTEGRATION STEP-BY-STEP:
 * 
 * 1. Update Fastify Plugin (backend/src/plugins/queues.ts)
 *    
 *    Replace the current queue initialization with:
 * 
 *    ```typescript
 *    import { getContext } from '../context.js';
 *    import { QueueManager } from '../services/queue-manager.js';
 *    import { photoCompressionHandler, photoCompressionWorkerConfig } from '../workers/photo-compression-worker.js';
 *    import { listingExpiryHandler, listingExpiryWorkerConfig } from '../workers/listing-expiry-worker.js';
 *    import { priceAlertHandler, priceAlertWorkerConfig } from '../workers/price-alert-worker.js';
 *    import { supplyForecastHandler, supplyForecastWorkerConfig } from '../workers/supply-forecast-worker.js';
 *    import { disputeEscalationHandler, disputeEscalationWorkerConfig } from '../workers/dispute-escalation-worker.js';
 *    import { notificationFallbackHandler, notificationFallbackWorkerConfig } from '../workers/notification-fallback-worker.js';
 *    import { sitemapGeneratorHandler, sitemapGeneratorWorkerConfig } from '../workers/sitemap-generator-worker.js';
 *    
 *    export const queuePlugin = fp(async (server) => {
 *      const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
 *      const redisClient = createClient({ url: redisUrl });
 *      await redisClient.connect();
 *      const connection = redisClient as any;
 *    
 *      // Initialize Queue Manager
 *      const queueManager = createQueueManager(connection, server);
 *      
 *      // Store in server context for access in routes
 *      server.queues = queueManager.getAllQueues();
 *      (server as any).queueManager = queueManager;
 *    
 *      // Register all queues with the manager
 *      await queueManager.registerQueue({
 *        name: 'escrow-payout',
 *        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
 *        concurrency: 10,
 *      });
 *    
 *      await queueManager.registerQueue({
 *        name: 'bulk-register',
 *        defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 10000 } },
 *        concurrency: 5,
 *      });
 *    
 *      await queueManager.registerQueue({
 *        name: 'notification-queue',
 *        defaultJobOptions: { attempts: 4, backoff: { type: 'exponential', delay: 2000 } },
 *        concurrency: 20,
 *      });
 *    
 *      // Continue for all 10+ queues...
 *    
 *      // Register enhanced workers with Queue Manager
 *      await queueManager.registerWorker('photo-processing', photoCompressionHandler, 5);
 *      await queueManager.registerWorker('listing-expiry', listingExpiryHandler, 10);
 *      await queueManager.registerWorker('price-alerts', priceAlertHandler, 20);
 *      await queueManager.registerWorker('supply-forecast', supplyForecastHandler, 5);
 *      await queueManager.registerWorker('dispute-escalation', disputeEscalationHandler, 8);
 *      await queueManager.registerWorker('notification-fallback', notificationFallbackHandler, 15);
 *      await queueManager.registerWorker('sitemap-generator', sitemapGeneratorHandler, 2);
 *    
 *      // Start health checks and metrics collection
 *      queueManager.startHealthChecks(30000);
 *      queueManager.startMetricsCollection(60000);
 *    
 *      // Setup graceful shutdown
 *      server.addHook('onClose', async () => {
 *        await queueManager.shutdown();
 *      });
 *    });
 *    ```
 * 
 * 2. Create Database Tables for New Features
 * 
 *    The following tables should be created in your database migration:
 * 
 *    - supply_forecasts (crop_type, region, forecast_date, supply_trend, etc.)
 *    - price_alert_triggers (alert_id, user_id, triggered_at, current_price)
 *    - price_alerts (user_id, crop_type, target_price, operator, status)
 *    - dispute_agents (id, status, assigned_disputes_count)
 *    - sitemaps (sitemap_type, region, url_count, file_path, published_at)
 *    - notifications (if not exists) (id, user_id, status, delivery_channel, etc.)
 * 
 * 3. Add Queue Routes for Admin Dashboard (optional)
 * 
 *    Create: backend/src/routes/admin-queues.ts
 * 
 *    ```typescript
 *    import { FastifyInstance } from 'fastify';
 *    
 *    export async function registerQueueAdminRoutes(server: FastifyInstance) {
 *      server.get('/admin/queues/metrics', async (request, reply) => {
 *        const queueManager = (server as any).queueManager;
 *        const metrics = await queueManager.getQueueMetrics();
 *        return reply.send(metrics);
 *      });
 *    
 *      server.post('/admin/queues/:queueName/pause', async (request, reply) => {
 *        const queueManager = (server as any).queueManager;
 *        await queueManager.pauseQueue((request.params as any).queueName);
 *        return reply.send({ status: 'paused' });
 *      });
 *    
 *      server.post('/admin/queues/:queueName/resume', async (request, reply) => {
 *        const queueManager = (server as any).queueManager;
 *        await queueManager.resumeQueue((request.params as any).queueName);
 *        return reply.send({ status: 'resumed' });
 *      });
 *    }
 *    ```
 * 
 * 4. Usage Examples
 * 
 *    Queue a photo for processing:
 *    ```typescript
 *    const photoQueue = queueManager.getQueue('photo-processing');
 *    await photoQueue.add('PROCESS_PHOTO', {
 *      photoKey: 's3Key',
 *      listingId: 'listing123',
 *      farmerUserId: 'user456',
 *      fileName: 'photo.jpg',
 *      bucketName: 'bucket-name'
 *    }, {
 *      delay: 1000, // Delay 1 second
 *      jobId: `photo-${photoKey}` // Prevent duplicates
 *    });
 *    ```
 * 
 *    Get queue metrics:
 *    ```typescript
 *    const metrics = await queueManager.getQueueMetrics();
 *    console.log(metrics);
 *    // [
 *    //   {
 *    //     name: 'photo-processing',
 *    //     queueSize: 45,
 *    //     activeCount: 5,
 *    //     completedCount: 1200,
 *    //     failedCount: 3,
 *    //     errorRate: 0.25,
 *    //     avgProcessingTime: 2500
 *    //   },
 *    //   ...
 *    // ]
 *    ```
 * 
 * FEATURES PROVIDED:
 * 
 * ✅ Queue Manager:
 *    - Centralized queue registration and configuration
 *    - Standard retry policies (exponential/fixed backoff)
 *    - Automatic job timeout handling
 *    - Health monitoring with alerts
 *    - Graceful shutdown with job completion wait
 *    - Redis connection recovery with exponential backoff
 *    - Real-time metrics collection
 * 
 * ✅ Photo Compression Worker:
 *    - Async image resizing (200px, 800px)
 *    - Vision API integration for content moderation
 *    - Automatic fallback if Vision API fails
 *    - Safe search detection
 *    - Configurable attempt/timeout
 * 
 * ✅ Listing Expiry Worker:
 *    - Automatic archival of old listings
 *    - Ownership verification
 *    - Event publishing for downstream services
 *    - Audit trail
 * 
 * ✅ Price Alert Worker:
 *    - Continuous price monitoring
 *    - Threshold-based trigger (ABOVE/BELOW)
 *    - Notification queue integration
 *    - Trigger history tracking
 * 
 * ✅ Supply Forecast Worker:
 *    - Market supply aggregation
 *    - Trend analysis (INCREASING/DECREASING/STABLE)
 *    - Regional supply forecasting
 *    - Historical data persistence
 * 
 * ✅ Dispute Escalation Worker:
 *    - Multi-level escalation (1/2/3)
 *    - Agent assignment on escalation
 *    - Notification to both parties
 *    - Escalation reason tracking
 * 
 * ✅ Notification Fallback Worker:
 *    - Multi-channel delivery (EMAIL/SMS/PUSH)
 *    - Automatic fallback on primary channel failure
 *    - Configurable retry strategy
 *    - Delivery channel recording
 * 
 * ✅ Sitemap Generator Worker:
 *    - XML sitemap generation
 *    - S3 publishing
 *    - SEO-optimized changefreq/priority
 *    - Metadata tracking
 *    - Support for listings, storefronts, pages
 * 
 * MONITORING & OBSERVABILITY:
 * 
 * Health Checks (every 30 seconds):
 *    - Queue depth monitoring
 *    - Active job count
 *    - Error rate threshold alerts (>10%)
 *    - Stalled job detection
 * 
 * Metrics Collection (every 60 seconds):
 *    - Job processing time distribution
 *    - Success/failure ratios
 *    - Queue size trends
 *    - Worker concurrency utilization
 * 
 * Logging:
 *    - Structured logs with job IDs
 *    - Error traces with retry counts
 *    - Performance timing data
 *    - Channel delivery logs
 * 
 * MIGRATION PATH:
 * 
 * Phase 1 (Current):
 *    - Deploy queue manager infrastructure
 *    - Refactor existing queue plugin to use manager
 *    - Add new queue definitions for new workers
 *    - Register all workers with manager
 * 
 * Phase 2:
 *    - Create admin dashboard routes
 *    - Integrate Bull Board UI (optional)
 *    - Set up monitoring/alerting
 *    - Performance tuning based on metrics
 * 
 * Phase 3:
 *    - Implement database tables for new features
 *    - Enable price alerts/supply forecasts
 *    - Activate dispute escalation automation
 *    - Full sitemap generation workflow
 * 
 * TROUBLESHOOTING:
 * 
 * Q: Jobs are getting stalled
 * A: Check worker concurrency and job timeout settings. Increase timeout if processing is slow.
 * 
 * Q: High error rate on a queue
 * A: Check logs for specific errors. Adjust retry policy: increase attempts/backoff delay.
 * 
 * Q: Vision API quota exceeded
 * A: Implement rate limiting with jobId deduplication. Fallback gracefully (already handled).
 * 
 * Q: Notifications not being delivered
 * A: Check notification-fallback worker logs. Verify SMS/Email service credentials.
 * 
 * NEXT STEPS:
 * 
 * 1. Update backend/src/plugins/queues.ts to use QueueManager
 * 2. Create necessary database tables
 * 3. Set up environment variables (REDIS_URL, GOOGLE_CLOUD_VISION_API_KEY, etc.)
 * 4. Deploy and monitor queue metrics
 * 5. Implement Bull Board dashboard for visualization
 * 6. Set up external alerts (Slack, email) for queue health
 */

export const QUEUE_INTEGRATION_GUIDE = true;