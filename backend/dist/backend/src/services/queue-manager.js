/**
 * Queue Manager
 * Centralized management of all BullMQ queues with health monitoring,
 * metrics, graceful shutdown, and connection recovery
 */
import { Queue, Worker, QueueEvents } from 'bullmq';
export class QueueManager {
    constructor(connection, server) {
        this.queues = new Map();
        this.workers = new Map();
        this.queueEvents = new Map();
        this.metrics = new Map();
        this.healthCheckInterval = null;
        this.metricsInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.connection = connection;
        this.server = server;
        // Setup connection listeners
        this.setupConnectionHandlers();
    }
    setupConnectionHandlers() {
        this.connection.on('error', (err) => {
            this.server.log.error({ error: err }, 'Redis connection error');
            this.attemptReconnect();
        });
        this.connection.on('reconnecting', () => {
            this.server.log.warn({ attempt: this.reconnectAttempts }, 'Redis reconnecting');
        });
        this.connection.on('connected', () => {
            this.server.log.info('Redis connected');
            this.reconnectAttempts = 0;
        });
    }
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
            setTimeout(() => {
                this.server.log.info({ attempt: this.reconnectAttempts, delay }, 'Attempting Redis reconnect');
                this.connection.connect().catch(() => {
                    this.attemptReconnect();
                });
            }, delay);
        }
        else {
            this.server.log.error('Max Redis reconnect attempts exceeded');
        }
    }
    /**
     * Register a queue with centralized configuration
     */
    async registerQueue(config) {
        if (this.queues.has(config.name)) {
            return this.queues.get(config.name);
        }
        const queueConfig = {
            connection: this.connection,
            ...config.settings,
        };
        // Add default job options to queue config
        if (config.defaultJobOptions) {
            queueConfig.defaultJobOptions = config.defaultJobOptions;
        }
        const queue = new Queue(config.name, queueConfig);
        // Initialize metrics
        this.metrics.set(config.name, {
            name: config.name,
            createdAt: new Date(),
            totalProcessed: 0,
            totalFailed: 0,
            totalRetried: 0,
            lastProcessedAt: null,
            processingTimes: [],
        });
        this.queues.set(config.name, queue);
        // Setup queue events
        const events = new QueueEvents(config.name, { connection: this.connection });
        this.queueEvents.set(config.name, events);
        // Log queue events
        events.on('error', (err) => {
            this.server.log.error({ queue: config.name, error: err }, 'Queue event error');
        });
        this.server.log.info({ queue: config.name }, 'Queue registered');
        return queue;
    }
    /**
     * Register a worker for a queue
     */
    async registerWorker(queueName, handler, concurrency = 5) {
        if (this.workers.has(queueName)) {
            this.server.log.warn({ queue: queueName }, 'Worker already registered for queue');
            return this.workers.get(queueName);
        }
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not registered`);
        }
        const worker = new Worker(queueName, async (job) => {
            const startTime = Date.now();
            const jobMetrics = this.metrics.get(queueName);
            try {
                this.server.log.info({ queue: queueName, jobId: job.id, jobName: job.name, data: job.data }, 'Job processing started');
                const result = await handler(job, this.server);
                const processingTime = Date.now() - startTime;
                jobMetrics.totalProcessed++;
                jobMetrics.lastProcessedAt = new Date();
                jobMetrics.processingTimes.push(processingTime);
                // Keep only last 100 times
                if (jobMetrics.processingTimes.length > 100) {
                    jobMetrics.processingTimes.shift();
                }
                this.server.log.info({
                    queue: queueName,
                    jobId: job.id,
                    processingTime,
                    totalProcessed: jobMetrics.totalProcessed,
                }, 'Job processing completed');
                return result;
            }
            catch (error) {
                const processingTime = Date.now() - startTime;
                jobMetrics.totalFailed++;
                this.server.log.error({
                    queue: queueName,
                    jobId: job.id,
                    jobName: job.name,
                    error,
                    processingTime,
                    attempts: job.attemptsMade,
                    maxAttempts: job.opts.attempts,
                }, 'Job processing failed');
                throw error;
            }
        }, {
            connection: this.connection,
            concurrency,
        });
        // Setup worker event listeners
        worker.on('completed', (job) => {
            this.server.log.debug({ queue: queueName, jobId: job.id }, 'Job completed');
        });
        worker.on('failed', (job, err) => {
            this.server.log.warn({ queue: queueName, jobId: job?.id, error: err, attempts: job?.attemptsMade }, 'Job failed');
        });
        worker.on('stalled', (jobId) => {
            this.server.log.warn({ queue: queueName, jobId }, 'Job stalled');
        });
        worker.on('error', (err) => {
            this.server.log.error({ queue: queueName, error: err }, 'Worker error');
        });
        this.workers.set(queueName, worker);
        this.server.log.info({ queue: queueName, concurrency }, 'Worker registered');
        return worker;
    }
    /**
     * Get all queue metrics
     */
    async getQueueMetrics() {
        const metrics = [];
        for (const [queueName, queue] of this.queues) {
            const counts = (await queue.getCountsPerStatus?.()) ?? {
                waiting: 0,
                active: 0,
                completed: 0,
                failed: 0,
                delayed: 0,
            };
            const queueMetrics = this.metrics.get(queueName);
            const isPausedValue = queue.isPaused;
            const isPausedVal = typeof isPausedValue === 'function' ? await isPausedValue() : Boolean(isPausedValue);
            const activeCount = counts.active || 0;
            const completedCount = counts.completed || 0;
            const failedCount = counts.failed || 0;
            const delayedCount = counts.delayed || 0;
            const avgProcessingTime = queueMetrics?.processingTimes?.length > 0
                ? queueMetrics.processingTimes.reduce((a, b) => a + b) /
                    queueMetrics.processingTimes.length
                : 0;
            const totalJobs = queueMetrics?.totalProcessed ?? 0;
            const failedJobs = queueMetrics?.totalFailed ?? 0;
            const errorRate = totalJobs > 0 ? (failedJobs / (totalJobs + failedJobs)) * 100 : 0;
            metrics.push({
                name: queueName,
                queueSize: counts.waiting || 0,
                activeCount,
                completedCount,
                failedCount,
                delayedCount,
                paused: isPausedVal,
                isPaused: isPausedVal,
                processingTime: queueMetrics?.processingTimes?.[queueMetrics.processingTimes.length - 1],
                errorRate: Math.round(errorRate * 100) / 100,
                avgProcessingTime: Math.round(avgProcessingTime * 100) / 100,
            });
        }
        return metrics;
    }
    /**
     * Start health check monitoring
     */
    startHealthChecks(intervalMs = 30000) {
        if (this.healthCheckInterval) {
            return;
        }
        this.healthCheckInterval = setInterval(async () => {
            try {
                const metrics = await this.getQueueMetrics();
                for (const metric of metrics) {
                    // Alert on high failure rate
                    if ((metric.errorRate ?? 0) > 10) {
                        this.server.log.warn({ queue: metric.name, errorRate: metric.errorRate, failedCount: metric.failedCount }, 'High error rate detected');
                    }
                    // Alert on stalled jobs
                    if (metric.activeCount > 100) {
                        this.server.log.warn({ queue: metric.name, activeCount: metric.activeCount }, 'High number of active jobs');
                    }
                    // Alert on queue backlog
                    if (metric.queueSize > 1000) {
                        this.server.log.warn({ queue: metric.name, queueSize: metric.queueSize }, 'Large queue backlog detected');
                    }
                }
                this.server.log.debug({ metrics }, 'Queue health check completed');
            }
            catch (error) {
                this.server.log.error({ error }, 'Health check failed');
            }
        }, intervalMs);
        this.server.log.info({ intervalMs }, 'Queue health checks started');
    }
    /**
     * Stop health check monitoring
     */
    stopHealthChecks() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            this.server.log.info('Queue health checks stopped');
        }
    }
    /**
     * Start metrics collection
     */
    startMetricsCollection(intervalMs = 60000) {
        if (this.metricsInterval) {
            return;
        }
        this.metricsInterval = setInterval(async () => {
            try {
                const metrics = await this.getQueueMetrics();
                // Store metrics in memory or send to monitoring service
                this.server.log.debug({ metrics }, 'Metrics collected');
            }
            catch (error) {
                this.server.log.error({ error }, 'Metrics collection failed');
            }
        }, intervalMs);
        this.server.log.info({ intervalMs }, 'Metrics collection started');
    }
    /**
     * Stop metrics collection
     */
    stopMetricsCollection() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
            this.server.log.info('Metrics collection stopped');
        }
    }
    /**
     * Get queue by name
     */
    getQueue(name) {
        return this.queues.get(name);
    }
    /**
     * Get all queues
     */
    getAllQueues() {
        return this.queues;
    }
    /**
     * Drain a queue (remove all jobs)
     */
    async drainQueue(queueName, _status) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }
        await queue.drain?.();
        this.server.log.info({ queue: queueName }, 'Queue drained');
    }
    /**
     * Pause a queue
     */
    async pauseQueue(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }
        await queue.pause();
        this.server.log.info({ queue: queueName }, 'Queue paused');
    }
    /**
     * Resume a queue
     */
    async resumeQueue(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }
        await queue.resume();
        this.server.log.info({ queue: queueName }, 'Queue resumed');
    }
    /**
     * Clean up old jobs
     */
    async cleanOldJobs(queueName, olderThanMs = 7 * 24 * 60 * 60 * 1000) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }
        await queue.clean?.(olderThanMs, 1000);
        this.server.log.info({ queue: queueName, olderThanMs }, 'Old jobs cleaned');
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.stopHealthChecks();
        this.stopMetricsCollection();
        this.server.log.info('Shutting down queue manager');
        // Close all workers
        for (const [queueName, worker] of this.workers) {
            try {
                await worker.close();
                this.server.log.info({ queue: queueName }, 'Worker closed');
            }
            catch (error) {
                this.server.log.error({ queue: queueName, error }, 'Error closing worker');
            }
        }
        // Close all queue events
        for (const [queueName, events] of this.queueEvents) {
            try {
                await events.close();
                this.server.log.info({ queue: queueName }, 'Queue events closed');
            }
            catch (error) {
                this.server.log.error({ queue: queueName, error }, 'Error closing queue events');
            }
        }
        // Close all queues
        for (const [queueName, queue] of this.queues) {
            try {
                await queue.close();
                this.server.log.info({ queue: queueName }, 'Queue closed');
            }
            catch (error) {
                this.server.log.error({ queue: queueName, error }, 'Error closing queue');
            }
        }
        this.server.log.info('Queue manager shutdown complete');
    }
}
export function createQueueManager(connection, server) {
    return new QueueManager(connection, server);
}
