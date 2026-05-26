import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import sanitizeHtml from 'sanitize-html';
import * as QRCode from 'qrcode';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const publishSchema = z.object({
  page_json: z.any(),
  html: z.string(),
  css: z.string().optional()
});

function generateMetaTitle(name: string) {
  return `${name} | AgriStore on KisanDirect`;
}

function generateMetaDescription(pageJson: unknown) {
  const raw = JSON.stringify(pageJson ?? '');
  const clean = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.slice(0, 160) || 'Discover the AgriStore storefront for trusted farm supply, cold storage and export-ready offerings.';
}

async function verifyOwnership(server: FastifyInstance, storeId: string, userId: string) {
  const result = await server.db.query('SELECT * FROM storefronts WHERE store_id = $1 AND owner_id = $2', [storeId, userId]);
  return result.rows[0] as any;
}

export default async function (server: FastifyInstance) {
  const pageCollection = server.mongo.db.collection('storefront_pages');

  const RESERVED_SLUGS = new Set(['api', 'admin', 'buy', 'farmer', 'store', 'blog', 'support', 'www', 'mail']);

  function normalizeSlug(slug: string) {
    return slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  }

  const slugSchema = z.string().min(3).max(50).regex(/^[a-z0-9-]+$/);

  server.post('/storefronts/:store_id/publish', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { store_id } = request.params as { store_id: string };
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

    await pageCollection.replaceOne(
      { store_id },
      { store_id, page_json, html: sanitizedHtml, css: css ?? '', updated_at: new Date() },
      { upsert: true }
    );

    await server.db.query(
      `UPDATE storefronts SET
        page_json = $1,
        published = TRUE,
        published_at = NOW(),
        meta_title = $2,
        meta_description = $3,
        updated_at = NOW()
      WHERE store_id = $4`,
      [page_json, metaTitle, metaDescription, store_id]
    );

    const baseUrl = process.env.BASE_URL ?? `https://${slug}.kisandirect.in`;
    const qrUrl = `${baseUrl}/store/${slug}`;
    const qrPng = await QRCode.toBuffer(qrUrl, { width: 400, margin: 2 });
    const qrSvg = await QRCode.toString(qrUrl, { type: 'svg' });

    const bucket = server.storage.bucketName;
    const qrPngKey = `storefronts/${store_id}/qr.png`;
    const qrSvgKey = `storefronts/${store_id}/qr.svg`;

    await server.storage.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: qrPngKey,
        Body: qrPng,
        ContentType: 'image/png'
      })
    );

    await server.storage.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: qrSvgKey,
        Body: Buffer.from(qrSvg),
        ContentType: 'image/svg+xml'
      })
    );

    const cdnBase = server.storage.cloudfrontDomain ? server.storage.cloudfrontDomain.replace(/\/$/, '') : process.env.CDN_BASE ?? '';
    const shareUrl = storefront.custom_domain ? `https://${storefront.custom_domain}` : `https://${slug}.kisandirect.in`;

    return reply.send({
      published: true,
      share_url: shareUrl,
      qr_png_url: `${cdnBase}/${qrPngKey}`,
      qr_svg_url: `${cdnBase}/${qrSvgKey}`
    });
  });

  server.get('/storefronts/slug/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };
    const result = await server.db.query('SELECT * FROM storefronts WHERE slug = $1 AND published = TRUE', [slug]);
    const storefront = result.rows[0];
    if (!storefront) {
      return reply.code(404).send({ error: 'Storefront not found' });
    }
    return reply.send(storefront);
  });

  // List owner's storefronts
  server.get('/storefronts/my', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.userId;
    const res = await server.db.query('SELECT * FROM storefronts WHERE owner_id = $1 ORDER BY updated_at DESC', [userId]);
    return reply.send(res.rows);
  });

  // Create storefront from template
  server.post('/storefronts', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const bodySchema = z.object({ name: z.string().min(3), slug: z.string().min(3).max(50), template_id: z.string(), description: z.string().optional() });
    const payload = bodySchema.parse(request.body);
    const ownerId = request.user.userId;

    const rawSlug = normalizeSlug(payload.slug);
    if (!slugSchema.safeParse(rawSlug).success || RESERVED_SLUGS.has(rawSlug)) {
      return reply.code(400).send({ error: 'Invalid or reserved slug' });
    }

    const existing = await server.db.query('SELECT 1 FROM storefronts WHERE slug = $1', [rawSlug]);
    if (existing.rowCount > 0) {
      return reply.code(409).send({ error: 'Slug already taken' });
    }

    // load templates dynamically
    let templatesModule: any = null;
    try {
      templatesModule = await import(path.resolve(process.cwd(), 'data', 'storefrontTemplates'));
    } catch (err) {
      server.log.error({ err }, 'failed to load templates');
    }

    let templateHtml = '';
    if (templatesModule && templatesModule.STOREFRONT_TEMPLATES) {
      const all = Object.values(templatesModule.STOREFRONT_TEMPLATES).flat();
      const tpl = all.find((t: any) => t.id === payload.template_id);
      if (tpl) templateHtml = (tpl as any).html;
    }

    // simple placeholder replacements
    const replaced = templateHtml
      .replace(/{{FPO Name}}/g, payload.name)
      .replace(/{{Facility Name}}/g, payload.name)
      .replace(/{{Brand Name}}/g, payload.name)
      .replace(/{{State}}/g, '')
      .replace(/{{phone}}/g, '');

    const storeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`.slice(0, 25);

    const insert = await server.db.query(
      `INSERT INTO storefronts(store_id, owner_id, slug, name, description, template_used, published, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,FALSE,NOW(),NOW()) RETURNING *`,
      [storeId, ownerId, rawSlug, payload.name, payload.description ?? '', payload.template_id]
    );

    // save initial page JSON to Mongo for editor
    await pageCollection.replaceOne({ store_id: storeId }, { store_id: storeId, page_json: {}, html: replaced, css: '', updated_at: new Date() }, { upsert: true });

    return reply.code(201).send({ store_id: storeId, editor_url: `/store-builder/${storeId}/editor` });
  });

  // Get storefront details (owner-only)
  server.get('/storefronts/:store_id', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { store_id } = request.params as { store_id: string };
    const userId = request.user.userId;
    const res = await server.db.query('SELECT * FROM storefronts WHERE store_id = $1 AND owner_id = $2', [store_id, userId]);
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Not found' });
    return reply.send(res.rows[0]);
  });

  // Update storefront (owner-only)
  server.patch('/storefronts/:store_id', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { store_id } = request.params as { store_id: string };
    const userId = request.user.userId;
    const body = z.object({ name: z.string().optional(), slug: z.string().optional(), description: z.string().optional() }).parse(request.body);

    const storefront = await verifyOwnership(server, store_id, userId);
    if (!storefront) return reply.code(403).send({ error: 'Not authorized' });

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (body.name) { updates.push(`name = $${idx++}`); values.push(body.name); }
    if (body.description) { updates.push(`description = $${idx++}`); values.push(body.description); }
    if (body.slug) {
      const rawSlug = normalizeSlug(body.slug);
      if (!slugSchema.safeParse(rawSlug).success || RESERVED_SLUGS.has(rawSlug)) return reply.code(400).send({ error: 'Invalid slug' });
      const exists = await server.db.query('SELECT 1 FROM storefronts WHERE slug = $1 AND store_id <> $2', [rawSlug, store_id]);
      if (exists.rowCount > 0) return reply.code(409).send({ error: 'Slug already taken' });
      updates.push(`slug = $${idx++}`); values.push(rawSlug);
    }

    if (updates.length === 0) return reply.send({ updated: false });

    values.push(store_id);
    const sql = `UPDATE storefronts SET ${updates.join(', ')}, updated_at = NOW() WHERE store_id = $${idx} RETURNING *`;
    const res = await server.db.query(sql, values);
    return reply.send(res.rows[0]);
  });

  // Return QR URLs (PNG/SVG) for storefront
  server.get('/storefronts/:store_id/qr', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { store_id } = request.params as { store_id: string };
    const userId = request.user.userId;
    const storefront = await verifyOwnership(server, store_id, userId);
    if (!storefront) return reply.code(403).send({ error: 'Not authorized' });
    const bucket = server.storage.bucketName;
    const qrPngKey = `storefronts/${store_id}/qr.png`;
    const qrSvgKey = `storefronts/${store_id}/qr.svg`;
    const cdnBase = server.storage.cloudfrontDomain ? server.storage.cloudfrontDomain.replace(/\/$/, '') : process.env.CDN_BASE ?? '';
    return reply.send({ qr_png_url: `${cdnBase}/${qrPngKey}`, qr_svg_url: `${cdnBase}/${qrSvgKey}` });
  });

  // Upgrade storefront plan
  server.post('/storefronts/:store_id/upgrade', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { store_id } = request.params as { store_id: string };
    const { plan } = z.object({ plan: z.string() }).parse(request.body);
    const userId = request.user.userId;
    const storefront = await verifyOwnership(server, store_id, userId);
    if (!storefront) return reply.code(403).send({ error: 'Not authorized' });
    await server.db.query('UPDATE storefronts SET plan = $1, updated_at = NOW() WHERE store_id = $2', [plan, store_id]);
    return reply.send({ upgraded: true, plan });
  });

  // List templates
  server.get('/storefronts/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    let templatesModule: any = null;
    try {
      templatesModule = await import(path.resolve(process.cwd(), 'data', 'storefrontTemplates'));
    } catch (err) {
      server.log.error({ err }, 'failed to load templates');
    }
    if (!templatesModule || !templatesModule.STOREFRONT_TEMPLATES) return reply.send([]);
    const flat = Object.values(templatesModule.STOREFRONT_TEMPLATES).flat();
    const list = flat.map((t: any) => ({ id: t.id, name: t.name, thumbnail: t.thumbnail, description: t.description }));
    return reply.send(list);
  });

  // Sitemap endpoint for storefronts
  server.get('/storefronts/sitemap', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await server.db.query(`
      SELECT slug, updated_at
      FROM storefronts
      WHERE published = TRUE
      ORDER BY updated_at DESC
      LIMIT 50000
    `);
    const rows = result.rows;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.map((s:any) => `  <url>\n    <loc>https://${s.slug}.kisandirect.in</loc>\n    <lastmod>${new Date(s.updated_at).toISOString().split('T')[0]}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`).join('\n')}\n</urlset>`;
    reply.header('Content-Type', 'application/xml');
    return reply.send(xml);
  });

  server.get('/storefronts/:store_id/page-json', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { store_id } = request.params as { store_id: string };
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

  server.post('/storefronts/:store_id/autosave', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { store_id } = request.params as { store_id: string };
    const { page_json, html, css } = publishSchema.parse(request.body);
    const userId = request.user.userId;
    const storefront = await verifyOwnership(server, store_id, userId);
    if (!storefront) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    await pageCollection.replaceOne(
      { store_id },
      { store_id, page_json, html: sanitizeHtml(html, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['section', 'article', 'nav', 'header', 'footer', 'main']),
        allowedAttributes: { '*': ['class', 'id', 'style', 'data-*', 'href', 'src', 'alt', 'target', 'rel'] }
      }), css: css ?? '', updated_at: new Date() },
      { upsert: true }
    );

    return reply.send({ saved: true, updated_at: new Date() });
  });

  server.post('/storefronts/:store_id/view', async (request: FastifyRequest, reply: FastifyReply) => {
    const { store_id } = request.params as { store_id: string };
    const referrer = (request.headers['referer'] as string) || null;
    const visitorCountry = request.headers['x-vercel-ip-country'] as string | undefined;
    const visitorState = request.headers['x-vercel-ip-state'] as string | undefined;
    const visitorDistrict = request.headers['x-vercel-ip-district'] as string | undefined;
    const deviceType = request.headers['user-agent']?.toLowerCase().includes('mobile') ? 'mobile' : 'desktop';

    await server.db.query(
      `INSERT INTO storefront_analytics(store_id, event_type, referrer, visitor_country, visitor_state, visitor_district, device_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [store_id, 'PAGE_VIEW', referrer, visitorCountry, visitorState, visitorDistrict, deviceType]
    );

    await server.db.query('UPDATE storefronts SET view_count = view_count + 1 WHERE store_id = $1', [store_id]);
    return reply.send({ success: true });
  });
}
