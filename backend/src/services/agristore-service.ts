import { FastifyInstance } from 'fastify';
import { Db, Document } from 'mongodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as QRCode from 'qrcode';

export type AgriStoreBlock =
  | { type: 'hero'; title: string; subtitle: string; imageUrl?: string; ctaText?: string; ctaUrl?: string }
  | { type: 'feature'; title: string; description: string; icon?: string }
  | { type: 'gallery'; items: Array<{ imageUrl: string; caption?: string }> }
  | { type: 'contact'; heading: string; phone?: string; email?: string; address?: string }
  | { type: 'rich_text'; html: string };

export type AgriStorePagePayload = {
  slug: string;
  name: string;
  description: string;
  hero: { title: string; subtitle: string; backgroundImage?: string };
  blocks: AgriStoreBlock[];
  metadata?: { keywords?: string[]; seoTitle?: string; seoDescription?: string };
  ownerId: string;
};

export type AgriStorePageRecord = AgriStorePagePayload & {
  publishedAt: Date;
  updatedAt: Date;
  cloudfrontKey: string;
  status: 'DRAFT' | 'PUBLISHED';
};

export function createAgriStoreService(server: FastifyInstance) {
  const pageCollection = server.mongo.db.collection<AgriStorePageRecord>('agristore_pages');
  const analyticsCollection = server.mongo.db.collection<Document>('agristore_analytics');

  async function normalizeSlug(slug: string) {
    return slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function buildPageHtml(page: AgriStorePageRecord) {
    const title = page.metadata?.seoTitle ?? page.name;
    const description = page.metadata?.seoDescription ?? page.description;
    const keywordString = (page.metadata?.keywords ?? []).join(', ');
    const canonical = `https://${page.slug}.kisandirect.in`;

    const bodyContent = page.blocks
      .map((block) => {
        switch (block.type) {
          case 'hero':
            return `
              <section class="hero" style="background-image: url('${block.imageUrl ?? ''}'); background-size: cover; background-position: center; padding: 5rem 1rem; color: #0f172a;">
                <div style="max-width: 900px; margin: 0 auto; background: rgba(255,255,255,0.88); border-radius: 24px; padding: 3rem;">
                  <h1 style="font-size: clamp(2.5rem, 4vw, 4rem); margin-bottom: 1rem;">${block.title}</h1>
                  <p style="font-size: 1.1rem; line-height: 1.8; margin-bottom: 1.5rem;">${block.subtitle}</p>
                  ${block.ctaText && block.ctaUrl ? `<a href="${block.ctaUrl}" style="display:inline-block;padding:0.9rem 1.8rem;background:#059669;color:white;border-radius:9999px;text-decoration:none;font-weight:600;">${block.ctaText}</a>` : ''}
                </div>
              </section>
            `;
          case 'feature':
            return `
              <article class="feature" style="padding: 2rem; border-bottom: 1px solid #e2e8f0;">
                <h2 style="font-size: 1.5rem; margin-bottom: 0.7rem;">${block.title}</h2>
                <p style="color:#334155;">${block.description}</p>
              </article>
            `;
          case 'gallery':
            return `
              <section class="gallery" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;padding:2rem;">
                ${block.items
                  .map(
                    (item) => `
                    <div style="border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08);">
                      <img src="${item.imageUrl}" alt="${item.caption ?? page.name}" style="width:100%;height:220px;object-fit:cover;" />
                      ${item.caption ? `<p style="padding:1rem;background:#fff;color:#0f172a;margin:0;">${item.caption}</p>` : ''}
                    </div>`
                  )
                  .join('')}
              </section>
            `;
          case 'contact':
            return `
              <section class="contact" style="padding: 2rem; background: #f8fafc;">
                <h2 style="font-size: 1.8rem; margin-bottom: 1rem;">${block.heading}</h2>
                <div style="display:grid; gap:1rem; max-width:700px;">
                  ${block.phone ? `<div><strong>Phone:</strong> <a href="tel:${block.phone}" style="color:#0f172a;">${block.phone}</a></div>` : ''}
                  ${block.email ? `<div><strong>Email:</strong> <a href="mailto:${block.email}" style="color:#0f172a;">${block.email}</a></div>` : ''}
                  ${block.address ? `<div><strong>Address:</strong> ${block.address}</div>` : ''}
                </div>
              </section>
            `;
          case 'rich_text':
            return `<section style="padding:2rem;">${block.html}</section>`;
          default:
            return '';
        }
      })
      .join('\n');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="keywords" content="${keywordString}" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${canonical}" />
  <style>
    body { margin:0; font-family: Inter, system-ui, sans-serif; background:#f8fafc; color:#0f172a; }
    a { color:#059669; }
    .container { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <header style="padding:2rem 0; text-align:center;">
      <p style="margin:0;font-size:0.9rem;color:#6b7280;">AgriStore by KisanDirect</p>
      <h1 style="font-size: clamp(2rem, 3vw, 3.5rem); margin:0.8rem 0 0;">${page.name}</h1>
      <p style="max-width:720px;margin:1rem auto 0;color:#475569;">${page.description}</p>
    </header>
    ${bodyContent}
  </div>
</body>
</html>`;
  }

  async function uploadHtml(slug: string, html: string) {
    const s3Client = server.storage.s3Client as S3Client;
    const key = `agristore/${slug}/index.html`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: server.storage.bucketName,
        Key: key,
        Body: html,
        ContentType: 'text/html',
        CacheControl: 'public, max-age=60'
      })
    );
    return key;
  }

  async function publishPage(payload: AgriStorePagePayload) {
    const slug = await normalizeSlug(payload.slug);
    const now = new Date();
    const cloudfrontKey = `agristore/${slug}/index.html`;
    const page: AgriStorePageRecord = {
      ...payload,
      slug,
      publishedAt: now,
      updatedAt: now,
      cloudfrontKey,
      status: 'PUBLISHED'
    };

    const html = buildPageHtml(page);
    await uploadHtml(slug, html);
    await pageCollection.updateOne({ slug }, { $set: page }, { upsert: true });

    return {
      slug,
      publishedAt: now,
      pageUrl: `https://${slug}.kisandirect.in`,
      cdnUrl: `${server.storage.cloudfrontDomain.replace(/\/$/, '')}/${cloudfrontKey}`
    };
  }

  async function getPageBySlug(slug: string) {
    const normalized = await normalizeSlug(slug);
    return pageCollection.findOne({ slug: normalized });
  }

  async function recordPageView(slug: string, userAgent?: string, ip?: string) {
    const normalized = await normalizeSlug(slug);
    const date = new Date().toISOString().slice(0, 10);
    await analyticsCollection.updateOne(
      { slug: normalized, date },
      {
        $inc: { views: 1 },
        $setOnInsert: { createdAt: new Date() },
        $set: { updatedAt: new Date() }
      },
      { upsert: true }
    );
  }

  async function getAnalytics(slug: string) {
    const normalized = await normalizeSlug(slug);
    const results = (await analyticsCollection
      .find({ slug: normalized })
      .sort({ date: -1 })
      .limit(30)
      .toArray()) as unknown as Array<{ date: string; views?: number }>;

    const totalViews = results.reduce((sum, item) => sum + (item.views ?? 0), 0);
    return {
      slug: normalized,
      totalViews,
      recent: results.map((item) => ({ date: item.date, views: item.views ?? 0 }))
    };
  }

  async function generateQrCodeUrl(slug: string) {
    const url = `https://${slug}.kisandirect.in`;
    return QRCode.toDataURL(url, { width: 320 });
  }

  return {
    publishPage,
    getPageBySlug,
    recordPageView,
    getAnalytics,
    generateQrCodeUrl
  };
}
