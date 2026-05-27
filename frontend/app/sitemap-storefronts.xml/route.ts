import { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${API_BASE}/api/v1/storefronts/sitemap`, { cache: 'no-store' });
    const xml = await res.text();
    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Failed to generate storefront sitemap:', error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  }
}
