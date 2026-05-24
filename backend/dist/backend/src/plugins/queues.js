import crypto from 'crypto';
import fp from 'fastify-plugin';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { createClient } from 'redis';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { createAuthService } from '../services/auth-service.js';
import { CROP_TAXONOMY, VISION_LABEL_MAP } from '../../../data/cropTaxonomy.js';
import { INDEX_LISTING_TO_ES, indexListingJob } from '../jobs/indexListingJob.js';
import { RELEASE_ESCROW, processReleaseEscrow } from '../jobs/escrowReleaseJob.js';
import { createMarketService, INGEST_AGMARKNET_PRICES } from '../services/market-service.js';
import { createNotificationService, DELIVER_NOTIFICATION, NOTIFICATION_FALLBACK } from '../services/notification-service.js';
const MAX_VISION_TIMEOUT = 5000;
const SAFE_FLAGGED = new Set(['LIKELY', 'VERY_LIKELY']);
const SENSITIVE_KEYWORDS = ['currency', 'money', 'rupee', 'cash', 'banknote', 'note', 'bill', 'face', 'faces', 'person', 'people', 'human', 'portrait'];
function getListingBucketName() {
    return process.env.LISTINGS_PHOTO_BUCKET ?? `kisandirect-listings-${(process.env.NODE_ENV ?? 'dev').toLowerCase()}`;
}
function getCdnBase(server) {
    if (process.env.CDN_BASE) {
        return process.env.CDN_BASE.replace(/\/$/, '');
    }
    if (server.storage.cloudfrontDomain) {
        return `https://${server.storage.cloudfrontDomain}`;
    }
    return `https://${getListingBucketName()}.s3.${process.env.AWS_REGION ?? 'ap-south-1'}.amazonaws.com`;
}
async function streamToBuffer(stream) {
    if (!stream) {
        return Buffer.from([]);
    }
    if (typeof stream?.arrayBuffer === 'function') {
        const buffer = await stream.arrayBuffer();
        return Buffer.from(buffer);
    }
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}
function findCategoryForCrop(cropType) {
    for (const [category, crops] of Object.entries(CROP_TAXONOMY)) {
        if (Object.prototype.hasOwnProperty.call(crops, cropType)) {
            return category;
        }
    }
    return null;
}
function labelTriggersModeration(label) {
    const normalized = label.toLowerCase();
    return SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
export const queuePlugin = fp(async (server) => {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const redisClient = createClient({ url: redisUrl });
    await redisClient.connect();
    const connection = redisClient;
    const payoutQueue = new Queue('escrow-payout', { connection });
    const bulkRegisterQueue = new Queue('bulk-register', { connection });
    const photoProcessingQueue = new Queue('photo-processing', { connection });
    const photoProcessingEvents = new QueueEvents('photo-processing', { connection });
    const listingQueue = new Queue('listing-queue', { connection });
    const marketQueue = new Queue('market-queue', { connection });
    const notificationQueue = new Queue('notification-queue', { connection });
    const sitemapQueue = new Queue('sitemap', { connection });
    const authService = createAuthService(server);
    new Worker('escrow-payout', async (job) => {
        server.log.info({ jobId: job.id, name: job.name, data: job.data }, 'processing escrow payout job');
        if (job.name === RELEASE_ESCROW) {
            return await processReleaseEscrow(server, job.data);
        }
        server.log.warn({ jobId: job.id, jobName: job.name }, 'unknown escrow-payout job');
        return { status: 'ignored' };
    }, { connection });
    new Worker('bulk-register', async (job) => {
        const rows = job.data.rows;
        const total = rows.length;
        let processed = 0;
        let failed = 0;
        const failedMobiles = [];
        for (const row of rows) {
            try {
                const existing = await server.db.query('SELECT id FROM public.users WHERE phone = $1', [row.mobile]);
                if (existing.rows.length === 0) {
                    await server.db.query('INSERT INTO public.users (phone, role, language, kyc_status, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())', [row.mobile, 'FARMER', 'en', 'PENDING_KYC']);
                }
                await authService.requestOtp(row.mobile);
            }
            catch (error) {
                failed += 1;
                failedMobiles.push(row.mobile);
            }
            finally {
                processed += 1;
                await job.updateProgress({ total, processed, failed, failedMobiles });
            }
        }
        return { total, processed, failed, failedMobiles };
    }, { connection });
    new Worker('photo-processing', async (job) => {
        const { userId, s3Key, bucketName } = job.data;
        const object = await server.storage.s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: s3Key }));
        const originalBuffer = await streamToBuffer(object.Body);
        const baseFilename = s3Key.split('/').pop()?.replace(/\.[^.]+$/, '') ?? crypto.randomUUID();
        const thumbnailKey = `listings/thumbnails/${userId}/${baseFilename}_thumb.webp`;
        const mediumKey = `listings/medium/${userId}/${baseFilename}_medium.webp`;
        const thumbnailBuffer = await sharp(originalBuffer).resize(200, 200, { fit: 'cover' }).webp().toBuffer();
        const mediumBuffer = await sharp(originalBuffer).resize(800, 600, { fit: 'cover' }).webp().toBuffer();
        await server.storage.s3Client.send(new PutObjectCommand({ Bucket: bucketName, Key: thumbnailKey, Body: thumbnailBuffer, ContentType: 'image/webp', ACL: 'public-read' }));
        await server.storage.s3Client.send(new PutObjectCommand({ Bucket: bucketName, Key: mediumKey, Body: mediumBuffer, ContentType: 'image/webp', ACL: 'public-read' }));
        await server.storage.s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: s3Key }));
        const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
        let aiDetectedCrop = null;
        let aiCategory = null;
        let aiConfidence = null;
        let flagged = false;
        let message = null;
        const cdnBase = getCdnBase(server);
        const thumbnailUrl = `${cdnBase}/${thumbnailKey}`;
        const mediumUrl = `${cdnBase}/${mediumKey}`;
        if (!apiKey) {
            return { thumbnailUrl, mediumUrl, aiDetectedCrop: null, aiCategory: null, aiConfidence: null, flagged: false };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), MAX_VISION_TIMEOUT);
        try {
            const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requests: [
                        {
                            image: { source: { gcsImageUri: `gs://${bucketName}/${s3Key}` } },
                            features: [
                                { type: 'LABEL_DETECTION', maxResults: 10 },
                                { type: 'SAFE_SEARCH_DETECTION' }
                            ]
                        }
                    ]
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (visionResponse.status === 429) {
                server.log.warn({ service: 'vision', status: 429 }, 'Vision API quota exceeded');
                return { thumbnailUrl, mediumUrl, aiDetectedCrop: null, aiCategory: null, aiConfidence: null, flagged: false, message: 'Manual selection required' };
            }
            if (!visionResponse.ok) {
                server.log.warn({ status: visionResponse.status }, 'Vision API returned an error');
                return { thumbnailUrl, mediumUrl, aiDetectedCrop: null, aiCategory: null, aiConfidence: null, flagged: false, message: 'Manual selection required' };
            }
            const json = (await visionResponse.json());
            const labels = json.responses?.[0]?.labelAnnotations;
            const safeSearch = json.responses?.[0]?.safeSearchAnnotation;
            if (labels?.length) {
                for (const label of labels) {
                    if (!label.description)
                        continue;
                    const normalized = label.description.toLowerCase();
                    if (!aiDetectedCrop) {
                        for (const [alias, cropType] of Object.entries(VISION_LABEL_MAP)) {
                            if (normalized.includes(alias)) {
                                aiDetectedCrop = cropType;
                                aiConfidence = Math.round((label.score ?? 0) * 100) / 100;
                                aiCategory = findCategoryForCrop(cropType);
                                break;
                            }
                        }
                    }
                    if (labelTriggersModeration(label.description)) {
                        flagged = true;
                    }
                }
            }
            if (safeSearch) {
                const found = ['adult', 'violence', 'racy'].some((field) => SAFE_FLAGGED.has((safeSearch[field] ?? '').toUpperCase()));
                if (found) {
                    flagged = true;
                }
            }
            server.log.info({ event: 'vision_api_call', costUnits: 0.0001, labels: labels?.map((label) => label.description) }, 'Vision API call logged');
        }
        catch (error) {
            clearTimeout(timeout);
            if (error.name === 'AbortError') {
                return { thumbnailUrl, mediumUrl, aiDetectedCrop: null, aiCategory: null, aiConfidence: null, flagged: false, message: 'Manual selection required' };
            }
            server.log.error({ error }, 'Vision API processing failed');
            return { thumbnailUrl, mediumUrl, aiDetectedCrop: null, aiCategory: null, aiConfidence: null, flagged: false, message: 'Manual selection required' };
        }
        return { thumbnailUrl, mediumUrl, aiDetectedCrop, aiCategory, aiConfidence, flagged };
    }, { connection });
    new Worker('listing-queue', async (job) => {
        const { listingId } = job.data;
        if (!listingId) {
            server.log.warn({ jobId: job.id }, 'missing listingId for listing job');
            return null;
        }
        if (job.name === INDEX_LISTING_TO_ES) {
            return await indexListingJob(server, listingId);
        }
        if (job.name === 'LISTING_EXPIRE') {
            await server.db.query(`UPDATE public.listings SET status = 'EXPIRED', updated_at = NOW() WHERE listing_id = $1 AND status = 'ACTIVE'`, [listingId]);
            await server.storage.searchClient.update({
                index: server.storage.listingIndexName,
                id: listingId,
                body: { doc: { status: 'EXPIRED' } },
                refresh: 'wait_for'
            });
            return { expired: true, listingId };
        }
        if (job.name === 'OFFER_EXPIRE') {
            const { offerId } = job.data;
            if (!offerId)
                return { ok: false };
            try {
                const offerService = createAuthService(server); // reuse to avoid circular import, but we need offer handler differently
            }
            catch (e) {
                // noop
            }
            // expire offer directly via DB update here
            await server.db.query("UPDATE public.offers SET status = 'EXPIRED', updated_at = NOW() WHERE offer_id = $1 AND status IN ('PENDING','COUNTER_OFFERED')", [offerId]);
            // notify buyer
            try {
                const buyer = await server.db.query('SELECT u.phone FROM public.offers o JOIN public.users u ON u.id = o.buyer_id WHERE o.offer_id = $1', [offerId]);
                const phone = buyer.rows[0]?.phone;
                if (phone) {
                    const apiUrl = process.env.WHATSAPP_API_URL;
                    const token = process.env.WHATSAPP_API_TOKEN;
                    if (apiUrl && token) {
                        await fetch(apiUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: `91${phone}`, message: `Your offer ${offerId} has expired.` }) });
                    }
                }
            }
            catch (err) {
                server.log.warn({ err, offerId }, 'failed to notify buyer about expired offer');
            }
            return { expired: true, offerId };
        }
        if (job.name === 'EXPIRY_WARNING_24H' || job.name === 'EXPIRY_WARNING_1H') {
            server.log.info({ listingId, warningType: job.name }, 'Listing expiry reminder queued');
            return { reminderQueued: true, listingId, warningType: job.name };
        }
        server.log.warn({ jobId: job.id, jobName: job.name }, 'unknown listing queue job');
        return null;
    }, { connection });
    new Worker('market-queue', async (job) => {
        if (job.name === INGEST_AGMARKNET_PRICES) {
            return await createMarketService(server).ingestAgmarknetPrices();
        }
        server.log.warn({ jobId: job.id, jobName: job.name }, 'unknown market queue job');
        return null;
    }, { connection });
    new Worker('notification-queue', async (job) => {
        if (job.name === DELIVER_NOTIFICATION) {
            return await createNotificationService(server).deliverNotification(job.data.notificationId);
        }
        if (job.name === NOTIFICATION_FALLBACK) {
            return await createNotificationService(server).fallbackNotification(job.data.notificationId);
        }
        server.log.warn({ jobId: job.id, jobName: job.name }, 'unknown notification queue job');
        return null;
    }, { connection });
    new Worker('sitemap', async (job) => {
        if (job.name !== 'GENERATE_SITEMAP')
            return null;
        server.log.info({ jobId: job.id }, 'generating catalogue sitemap');
        const rows = await server.db.query(`SELECT DISTINCT fp.state_code AS state, l.crop_type
         FROM public.listings l
         JOIN public.farmer_profiles fp ON l.farmer_id = fp.user_id
         WHERE l.status = 'ACTIVE'`);
        const combos = rows.rows.filter((r) => r.state && r.crop_type).map((r) => ({ state: String(r.state).toLowerCase(), crop: String(r.crop_type).toLowerCase() }));
        const urls = combos.map((c) => `<url><loc>https://kisandirect.in/buy/${encodeURIComponent(c.state)}/${encodeURIComponent(c.crop)}</loc></url>`).join('\n');
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
        try {
            await server.storage.s3Client.send(new PutObjectCommand({ Bucket: server.storage.bucketName, Key: 'sitemaps/catalogue.xml', Body: xml, ContentType: 'application/xml', ACL: 'public-read' }));
            server.log.info({ count: combos.length }, 'sitemap uploaded to S3');
            return { uploaded: true, count: combos.length };
        }
        catch (err) {
            server.log.error({ err }, 'failed to upload sitemap');
            return { uploaded: false };
        }
    }, { connection });
    // ensure market ingestion runs hourly
    try {
        await marketQueue.add(INGEST_AGMARKNET_PRICES, {}, { jobId: 'agmarknet_ingest_job', repeat: { cron: '0 * * * *' }, removeOnComplete: true, removeOnFail: false });
    }
    catch (err) {
        server.log.warn({ err }, 'market ingestion repeatable job may already exist');
    }
    // ensure sitemap generation runs hourly
    try {
        await sitemapQueue.add('GENERATE_SITEMAP', {}, { jobId: 'generate_sitemap_job', repeat: { cron: '0 * * * *' }, removeOnComplete: true });
    }
    catch (err) {
        server.log.warn({ err }, 'sitemap repeatable job may already exist');
    }
    server.decorate('queues', {
        payoutQueue,
        bulkRegisterQueue,
        photoProcessingQueue,
        photoProcessingEvents,
        listingQueue,
        marketQueue,
        notificationQueue,
        sitemapQueue,
        connection
    });
    server.addHook('onClose', async () => {
        await payoutQueue.close();
        await bulkRegisterQueue.close();
        await photoProcessingQueue.close();
        await photoProcessingEvents.close();
        await listingQueue.close();
        await marketQueue.close();
        await notificationQueue.close();
        await sitemapQueue.close();
        await redisClient.quit();
    });
});
