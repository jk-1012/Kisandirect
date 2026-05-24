import { NextResponse } from 'next/server';

export async function GET() {
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3000';
  try {
    const res = await fetch(`${backend}/api/v1/listings/search?limit=1000`, { cache: 'no-store' });
    if (!res.ok) return new NextResponse('', { status: 500 });
    const data = await res.json();
    const combos = new Map<string, string>();
    (data.listings || data.hits || []).forEach((l: any) => {
      const state = (l.state || l.farmer?.state || l.state_code || '').toLowerCase();
      const crop = (l.crop_type || '').toLowerCase();
      if (state && crop) combos.set(`${state}|${crop}`, `https://kisandirect.in/buy/${encodeURIComponent(state)}/${encodeURIComponent(crop)}`);
    });

    const urls = Array.from(combos.values()).map((u) => `<url><loc>${u}</loc></url>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

    return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml' } });
  } catch (err) {
    return new NextResponse('', { status: 500 });
  }
}
