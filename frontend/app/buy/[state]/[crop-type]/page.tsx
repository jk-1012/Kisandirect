import React from 'react';
import ListingListClient from './ListingListClient';

type Params = { state: string; ['crop-type']: string };

export async function generateStaticParams() {
  try {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3000';
    const res = await fetch(`${backend}/api/v1/listings/search?limit=1000`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    const combos = new Map<string, { state: string; crop: string }>();
    (data.results || data.listings || data.hits || []).forEach((l: any) => {
      const state = (l.state || l.farmer?.state || l.state_code || '').toLowerCase();
      const crop = (l.crop_type || '').toLowerCase();
      if (state && crop) combos.set(`${state}|${crop}`, { state, crop });
    });
    return Array.from(combos.values()).map((c) => ({ state: c.state, ['crop-type']: c.crop }));
  } catch (err) {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }) {
  const state = params.state;
  const crop = params['crop-type'];
  const cropDisplay = crop.replace(/-/g, ' ');
  const stateName = state.charAt(0).toUpperCase() + state.slice(1);
  return {
    title: `Buy Fresh ${cropDisplay} from Farmers in ${stateName} | KisanDirect`,
    description: `Direct from farmer ${cropDisplay} in ${stateName}. Compare prices, see mandi rates, order directly. No middlemen.`,
    alternates: { canonical: `https://kisandirect.in/buy/${state}/${crop}` }
  };
}

export default async function Page({ params }: { params: Params }) {
  const state = params.state;
  const crop = params['crop-type'];

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';
  const url = `${backend}/api/v1/listings/search?state=${encodeURIComponent(state)}&crop_type=${encodeURIComponent(crop)}&limit=24`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  const data = await res.ok ? await res.json() : { results: [] };
  const listings = data.results || data.listings || data.hits || [];

  const cropDisplayName = crop.replace(/-/g, ' ');
  const stateName = state.charAt(0).toUpperCase() + state.slice(1);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${cropDisplayName} listings in ${stateName}`,
    itemListElement: listings.map((l: any, i: number) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: l.crop_type_display ?? l.crop_type,
        offers: { '@type': 'Offer', price: (l.asking_price_paise ?? l.price_per_kg_inr) / 100, priceCurrency: 'INR' }
      }
    }))
  };

  return (
    <div className="min-h-screen container mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Buy {cropDisplayName} in {stateName}</h1>
        <p className="text-sm text-muted-foreground">Direct from farmers — compare prices, place orders, and pay securely.</p>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1">
          {/* Filters placeholder; client will manage interactive filters */}
          <div className="sticky top-6 bg-white p-4 rounded shadow">
            <h3 className="font-semibold">Filters</h3>
            <p className="text-sm text-gray-600">Use filters to refine results (client-side).</p>
          </div>
        </aside>

        <section className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex space-x-2">
              <button className="btn">Proximity</button>
              <button className="btn">Newest</button>
              <button className="btn">Price: Low to High</button>
            </div>
          </div>

          <ListingListClient initialListings={listings} state={state} crop={crop} />
        </section>
      </main>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
