import { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export async function GET(_req: NextRequest) {
  const res = await fetch(`${API_BASE}/api/v1/storefronts/sitemap`, { cache: 'no-store' });
  const xml = await res.text();
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
