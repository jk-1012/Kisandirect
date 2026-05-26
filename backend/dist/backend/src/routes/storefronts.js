import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import * as QRCode from 'qrcode';
import { PutObjectCommand } from '@aws-sdk/client-s3';
const publishSchema = z.object({
    page_json: z.any(),
    html: z.string(),
    css: z.string().optional()
});
function generateMetaTitle(name) {
    return `${name} | AgriStore on KisanDirect`;
}
function generateMetaDescription(pageJson) {
    const raw = JSON.stringify(pageJson ?? '');
    const clean = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return clean.slice(0, 160) || 'Discover the AgriStore storefront for trusted farm supply, cold storage and export-ready offerings.';
}
async function verifyOwnership(server, storeId, userId) {
    const result = await server.db.query('SELECT * FROM storefronts WHERE store_id = $1 AND owner_id = $2', [storeId, userId]);
    return result.rows[0];
}
export default async function (server) {
    const pageCollection = server.mongo.db.collection('storefront_pages');
    server.post('/storefronts/:store_id/publish', { preHandler: server.authenticate }, async (request, reply) => {
        const { store_id } = request.params;
        const { page_json, html, css } = publishSchema.parse(request.body);
        const userId = request.user.userId;
        const storefront = await verifyOwnership(server, store_id, userId);
        if (!storefront) {
            return reply.code(403).send({ error: 'Not authorized' });
        }
        const sanitizedHtml = sanitizeHtml(html, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['section', 'article', 'nav', 'header', 'footer', 'main']),
            allowedAttributes: {
                '*': ['class', 'id', 'style', 'data-*', 'href', 'src', 'alt', 'target', 'rel']
            }
        });
        const slug = storefront.slug;
        const metaTitle = generateMetaTitle(storefront.name);
        const metaDescription = generateMetaDescription(page_json);
        await pageCollection.replaceOne({ store_id }, { store_id, page_json, html: sanitizedHtml, css: css ?? '', updated_at: new Date() }, { upsert: true });
        await server.db.query(`UPDATE storefronts SET
        page_json = $1,
        published = TRUE,
        published_at = NOW(),
        meta_title = $2,
        meta_description = $3,
        updated_at = NOW()
      WHERE store_id = $4`, [page_json, metaTitle, metaDescription, store_id]);
        const baseUrl = process.env.BASE_URL ?? `https://${slug}.kisandirect.in`;
        const qrUrl = `${baseUrl}/store/${slug}`;
        const qrPng = await QRCode.toBuffer(qrUrl, { width: 400, margin: 2 });
        const qrSvg = await QRCode.toString(qrUrl, { type: 'svg' });
        const bucket = server.storage.bucketName;
        const qrPngKey = `storefronts/${store_id}/qr.png`;
        const qrSvgKey = `storefronts/${store_id}/qr.svg`;
        await server.storage.s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: qrPngKey,
            Body: qrPng,
            ContentType: 'image/png'
        }));
        await server.storage.s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: qrSvgKey,
            Body: Buffer.from(qrSvg),
            ContentType: 'image/svg+xml'
        }));
        const cdnBase = server.storage.cloudfrontDomain ? server.storage.cloudfrontDomain.replace(/\/$/, '') : process.env.CDN_BASE ?? '';
        const shareUrl = storefront.custom_domain ? `https://${storefront.custom_domain}` : `https://${slug}.kisandirect.in`;
        return reply.send({
            published: true,
            share_url: shareUrl,
            qr_png_url: `${cdnBase}/${qrPngKey}`,
            qr_svg_url: `${cdnBase}/${qrSvgKey}`
        });
    });
    server.get('/storefronts/slug/:slug', async (request, reply) => {
        const { slug } = request.params;
        const result = await server.db.query('SELECT * FROM storefronts WHERE slug = $1 AND published = TRUE', [slug]);
        const storefront = result.rows[0];
        if (!storefront) {
            return reply.code(404).send({ error: 'Storefront not found' });
        }
        return reply.send(storefront);
    });
    server.get('/storefronts/:store_id/page-json', { preHandler: server.authenticate }, async (request, reply) => {
        const { store_id } = request.params;
        const userId = request.user.userId;
        const storefront = await verifyOwnership(server, store_id, userId);
        if (!storefront) {
            return reply.code(403).send({ error: 'Not authorized' });
        }
        const page = await pageCollection.findOne({ store_id });
        if (!page) {
            return reply.code(404).send({ error: 'Page JSON not found' });
        }
        return reply.send(page);
    });
    server.post('/storefronts/:store_id/autosave', { preHandler: server.authenticate }, async (request, reply) => {
        const { store_id } = request.params;
        const { page_json, html, css } = publishSchema.parse(request.body);
        const userId = request.user.userId;
        const storefront = await verifyOwnership(server, store_id, userId);
        if (!storefront) {
            return reply.code(403).send({ error: 'Not authorized' });
        }
        await pageCollection.replaceOne({ store_id }, { store_id, page_json, html: sanitizeHtml(html, {
                allowedTags: sanitizeHtml.defaults.allowedTags.concat(['section', 'article', 'nav', 'header', 'footer', 'main']),
                allowedAttributes: { '*': ['class', 'id', 'style', 'data-*', 'href', 'src', 'alt', 'target', 'rel'] }
            }), css: css ?? '', updated_at: new Date() }, { upsert: true });
        return reply.send({ saved: true, updated_at: new Date() });
    });
    server.post('/storefronts/:store_id/view', async (request, reply) => {
        const { store_id } = request.params;
        const referrer = request.headers['referer'] || null;
        const visitorCountry = request.headers['x-vercel-ip-country'];
        const visitorState = request.headers['x-vercel-ip-state'];
        const visitorDistrict = request.headers['x-vercel-ip-district'];
        const deviceType = request.headers['user-agent']?.toLowerCase().includes('mobile') ? 'mobile' : 'desktop';
        await server.db.query(`INSERT INTO storefront_analytics(store_id, event_type, referrer, visitor_country, visitor_state, visitor_district, device_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [store_id, 'PAGE_VIEW', referrer, visitorCountry, visitorState, visitorDistrict, deviceType]);
        await server.db.query('UPDATE storefronts SET view_count = view_count + 1 WHERE store_id = $1', [store_id]);
        return reply.send({ success: true });
    });
}
