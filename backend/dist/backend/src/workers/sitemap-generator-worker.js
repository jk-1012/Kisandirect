/**
 * Sitemap Generator Worker
 * Generates and publishes sitemaps for search engine indexing
 */
import { PutObjectCommand } from '@aws-sdk/client-s3';
export async function sitemapGeneratorHandler(job, server) {
    const { sitemapType, region } = job.data;
    try {
        server.log.info({
            jobId: job.id,
            sitemapType,
            region,
        }, 'Starting sitemap generation');
        let urls = [];
        let fileName = '';
        if (sitemapType === 'LISTINGS') {
            urls = await generateListingsSitemap(server, region);
            fileName = region ? `sitemap-listings-${region}.xml` : 'sitemap-listings.xml';
        }
        else if (sitemapType === 'STOREFRONTS') {
            urls = await generateStorefrontsSitemap(server);
            fileName = 'sitemap-storefronts.xml';
        }
        else if (sitemapType === 'PAGES') {
            urls = await generatePagesSitemap(server);
            fileName = 'sitemap-pages.xml';
        }
        if (urls.length === 0) {
            server.log.warn({ jobId: job.id, sitemapType, region }, 'No URLs to generate sitemap');
            return {
                sitemapType,
                sitemapPath: '',
                urlCount: 0,
                generatedAt: new Date().toISOString(),
                publishedAt: new Date().toISOString(),
            };
        }
        // Generate sitemap XML
        const sitemapXml = generateSitemapXml(urls);
        // Upload to S3
        const bucketName = process.env.SITEMAP_BUCKET || process.env.AWS_BUCKET || 'kisandirect-web';
        const s3Path = `sitemaps/${fileName}`;
        await server.storage.s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: s3Path,
            Body: sitemapXml,
            ContentType: 'application/xml',
            CacheControl: 'max-age=86400', // Cache for 24 hours
        }));
        server.log.info({
            jobId: job.id,
            sitemapType,
            urlCount: urls.length,
            s3Path,
        }, 'Sitemap generated and published');
        // Store metadata in database
        try {
            await server.db.query(`INSERT INTO sitemaps (sitemap_type, region, url_count, file_path, published_at, created_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`, [sitemapType, region || null, urls.length, s3Path]);
        }
        catch (dbError) {
            server.log.warn({ jobId: job.id, error: dbError?.message }, 'Failed to save sitemap metadata');
        }
        return {
            sitemapType,
            sitemapPath: s3Path,
            urlCount: urls.length,
            generatedAt: new Date().toISOString(),
            publishedAt: new Date().toISOString(),
        };
    }
    catch (error) {
        server.log.error({
            jobId: job.id,
            sitemapType,
            error: error?.message,
            stack: error?.stack,
            attemptsMade: job.attemptsMade,
        }, 'Sitemap generation failed');
        throw error;
    }
}
/**
 * Generate listings sitemap URLs
 */
async function generateListingsSitemap(server, region) {
    const baseUrl = process.env.APP_URL || 'https://kisandirect.com';
    let query = 'SELECT id, slug, updated_at FROM listings WHERE status = $1 ORDER BY updated_at DESC LIMIT 50000';
    const params = ['ACTIVE'];
    if (region) {
        query = `SELECT id, slug, updated_at FROM listings 
             WHERE status = $1 AND region = $2 
             ORDER BY updated_at DESC 
             LIMIT 50000`;
        params.push(region);
    }
    const result = await server.db.query(query, params);
    return (result.rows?.map((row) => ({
        loc: `${baseUrl}/listings/${row.slug}`,
        lastmod: row.updated_at?.toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: 0.7,
    })) || []);
}
/**
 * Generate storefronts sitemap URLs
 */
async function generateStorefrontsSitemap(server) {
    const baseUrl = process.env.APP_URL || 'https://kisandirect.com';
    const result = await server.db.query('SELECT id, slug, updated_at FROM farmer_storefronts WHERE is_published = true ORDER BY updated_at DESC LIMIT 50000');
    return (result.rows?.map((row) => ({
        loc: `${baseUrl}/agristore/${row.slug}`,
        lastmod: row.updated_at?.toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: 0.8,
    })) || []);
}
/**
 * Generate static pages sitemap URLs
 */
async function generatePagesSitemap(server) {
    const baseUrl = process.env.APP_URL || 'https://kisandirect.com';
    return [
        { loc: baseUrl, changefreq: 'daily', priority: 1.0 },
        { loc: `${baseUrl}/buy`, changefreq: 'daily', priority: 0.9 },
        { loc: `${baseUrl}/sell`, changefreq: 'daily', priority: 0.9 },
        { loc: `${baseUrl}/farmers`, changefreq: 'weekly', priority: 0.7 },
        { loc: `${baseUrl}/about`, changefreq: 'monthly', priority: 0.5 },
        { loc: `${baseUrl}/contact`, changefreq: 'monthly', priority: 0.5 },
    ];
}
/**
 * Generate sitemap XML from URLs
 */
function generateSitemapXml(urls) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (const url of urls) {
        xml += '  <url>\n';
        xml += `    <loc>${escapeXml(url.loc)}</loc>\n`;
        if (url.lastmod) {
            xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
        }
        if (url.changefreq) {
            xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
        }
        if (url.priority !== undefined) {
            xml += `    <priority>${url.priority}</priority>\n`;
        }
        xml += '  </url>\n';
    }
    xml += '</urlset>';
    return xml;
}
/**
 * Escape XML special characters
 */
function escapeXml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
/**
 * Configuration for sitemap generator worker
 */
export const sitemapGeneratorWorkerConfig = {
    name: 'sitemap-generator',
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'fixed',
            delay: 30000,
        },
        removeOnComplete: {
            age: 604800, // Remove after 7 days
        },
        removeOnFail: false,
        timeout: 60000, // Long timeout for large sitemaps
    },
    concurrency: 2,
    settings: {
        maxStalledCount: 2,
        maxStalledInterval: 120000,
        lockDuration: 60000,
    },
};
