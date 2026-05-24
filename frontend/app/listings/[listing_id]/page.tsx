import ListingActions from './ListingActions';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fetchListing(listingId: string) {
  const response = await fetch(`${API_BASE_URL}/api/v1/listings/${listingId}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Listing not found');
  }
  return response.json();
}

export async function generateMetadata({ params }: { params: { listing_id: string } }) {
  const listing = await fetchListing(params.listing_id);
  return {
    title: `${listing.crop_type_display} — ${listing.quantity_kg}kg at ₹${(listing.asking_price_paise / 100).toFixed(0)}/kg | KisanDirect`,
    description: `Fresh ${listing.crop_type_display} from ${listing.farmer.district}, ${listing.farmer.state}. Harvested ${listing.harvest_date}. Buy directly from farmer.`,
    openGraph: {
      title: `${listing.crop_type_display} — KisanDirect`,
      images: listing.photo_urls?.length ? [listing.photo_urls[0]] : undefined
    }
  };
}

export default async function ListingPage({ params }: { params: { listing_id: string } }) {
  const listing = await fetchListing(params.listing_id);
  const pricePerKg = (listing.asking_price_paise / 100).toFixed(0);
  const mandiComparison = listing.mandi_price_paise
    ? Math.round(((listing.asking_price_paise / listing.mandi_price_paise - 1) * 100) * 10) / 10
    : null;
  const comparisonLabel = mandiComparison === null ? null : mandiComparison <= 0 ? `${Math.abs(mandiComparison)}% below mandi price` : `${mandiComparison}% above mandi price`;
  const comparisonClass = mandiComparison === null ? 'bg-slate-100 text-slate-800' : mandiComparison <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://kisandirect.in'}/listings/${listing.listing_id}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.crop_type_display,
    description: listing.description ?? `${listing.crop_type_display} from ${listing.farmer.district}, ${listing.farmer.state}`,
    image: listing.photo_urls ?? [],
    offers: {
      '@type': 'Offer',
      price: (listing.asking_price_paise / 100).toFixed(2),
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Person', name: `Farmer KD-${listing.farmer.kisan_id}` }
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <div className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr]">
        <section className="space-y-6">
          <div className="overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-xl">
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto p-4">
              {listing.photo_urls?.length ? (
                listing.photo_urls.slice(0, 5).map((photo: string) => (
                  <img
                    key={photo}
                    src={photo}
                    alt={listing.crop_type_display}
                    className="h-[320px] min-w-full snap-center rounded-[1.5rem] object-cover"
                  />
                ))
              ) : (
                <div className="flex h-[320px] min-w-full items-center justify-center rounded-[1.5rem] bg-slate-800 text-center text-lg text-slate-300">
                  No photo available
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-[2rem] bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-semibold text-slate-900">{listing.crop_type_display}</p>
                <p className="mt-1 text-sm uppercase tracking-[0.18em] text-slate-500">{listing.crop_category}</p>
              </div>
              <div className="rounded-3xl bg-emerald-600 px-4 py-3 text-right text-xl font-semibold text-white">
                ₹{pricePerKg}/kg
              </div>
            </div>

            {comparisonLabel ? (
              <div className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold ${comparisonClass}`}>
                {comparisonLabel}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Quantity remaining</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{listing.quantity_remaining_kg} kg</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Harvest date</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{listing.harvest_date}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {listing.delivery_available ? (
                <span className="rounded-full bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800">Delivery available</span>
              ) : null}
              {listing.organic ? (
                <span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">Organic</span>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Description</p>
              <p className="mt-3 text-slate-900">{listing.description ?? 'No description provided.'}</p>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="space-y-4 rounded-[2rem] bg-white p-6 shadow-sm">
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Farmer</p>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Trust score</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{listing.farmer.trust_score}</p>
              </div>
              <div className="grid gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p><span className="font-semibold">District:</span> {listing.farmer.district}</p>
                <p><span className="font-semibold">State:</span> {listing.farmer.state}</p>
                <p><span className="font-semibold">KisanID:</span> KD-{listing.farmer.kisan_id}</p>
              </div>
            </div>
          </div>

          <ListingActions listingId={listing.listing_id} shareUrl={shareUrl} expiresAt={listing.expires_at} />
        </aside>
      </div>
    </main>
  );
}
