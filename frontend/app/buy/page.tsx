/**
 * Main buyer home page with featured listings and browse options
 */

'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useListings } from '@/lib/hooks';
import { ListingCard, EmptyState } from '@/components/shared/UIComponents';
import { ListingGridSkeleton } from '@/components/Skeletons';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function FeaturedListingsContent() {
  const [page, setPage] = useState(1);
  const { data: listingsData, isLoading } = useListings(page, { limit: 12 });

  const listings = listingsData?.data || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-4xl font-bold mb-4">Fresh Produce, Direct from Farmers</h1>
          <p className="text-lg text-green-100 mb-6">
            Discover quality crops at fair prices with transparent pricing and secure escrow payments.
          </p>
          <div className="flex gap-4">
            <Link
              href="/buy/listings"
              className="bg-white text-green-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100"
            >
              Browse All
            </Link>
            <Link
              href="/buy/rfq"
              className="border-2 border-white text-white px-6 py-2 rounded-lg font-semibold hover:bg-white hover:text-green-600"
            >
              Send RFQ
            </Link>
          </div>
        </div>
      </div>

      {/* Featured Listings */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold mb-8">Featured Products</h2>

        {listings.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {listings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/buy/listings/${listing.id}`}
                  className="no-underline hover:shadow-lg transition-shadow"
                >
                  <ListingCard listing={listing} />
                </Link>
              ))}
            </div>

            <div className="text-center mt-12">
              <Link
                href="/buy/listings"
                className="inline-block bg-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-green-700"
              >
                View All Products
              </Link>
            </div>
          </>
        ) : isLoading ? (
          <ListingGridSkeleton />
        ) : (
          <EmptyState
            icon="🚜"
            title="No products available"
            description="Check back soon for fresh listings"
          />
        )}
      </div>

      {/* Info Cards */}
      <div className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-4xl mb-3">✓</div>
              <h3 className="font-bold text-lg mb-2">Direct from Farmers</h3>
              <p className="text-gray-600">Skip middlemen and buy directly from agricultural producers</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-4xl mb-3">💰</div>
              <h3 className="font-bold text-lg mb-2">Fair Pricing</h3>
              <p className="text-gray-600">See mandi rates and get transparent pricing for your purchases</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-4xl mb-3">🔒</div>
              <h3 className="font-bold text-lg mb-2">Secure Escrow</h3>
              <p className="text-gray-600">Money held safely until you receive quality goods</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BuyHomePage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<ListingGridSkeleton />}>
        <FeaturedListingsContent />
      </Suspense>
    </ErrorBoundary>
  );
}
                placeholder="Search for crops, districts, or categories..."
                className="w-full border-0 bg-transparent py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="border-l border-slate-200 px-4">
                <button className="flex items-center gap-2 font-medium text-slate-600 hover:text-emerald-600">
                  <MapPin className="h-5 w-5" />
                  <span>Anywhere</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="-mt-12 mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Filters Sidebar */}
          <aside className="w-full shrink-0 lg:w-64">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
                <SlidersHorizontal className="h-5 w-5 text-slate-400" />
              </div>

              <div className="mt-6 space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-slate-900">Sort By</h3>
                  <div className="mt-3 space-y-2">
                    {['recency', 'price_asc', 'price_desc', 'trust_score'].map((opt) => (
                      <label key={opt} className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="sort"
                          value={opt}
                          checked={filters.sort === opt}
                          onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
                          className="h-4 w-4 border-slate-300 text-emerald-600 focus:ring-emerald-600"
                        />
                        <span className="text-sm text-slate-700 capitalize">
                          {opt.replace('_', ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <h3 className="text-sm font-medium text-slate-900">Preferences</h3>
                  <div className="mt-3 space-y-3">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={filters.organic}
                        onChange={(e) => setFilters({ ...filters, organic: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                      />
                      <span className="text-sm text-slate-700">Organic Certified</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={filters.delivery_available}
                        onChange={(e) => setFilters({ ...filters, delivery_available: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                      />
                      <span className="text-sm text-slate-700">Delivery Available</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Results Grid */}
          <div className="flex-1">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                {isLoading ? 'Loading...' : `${data?.total_count || 0} listings found`}
              </h2>
            </div>

            {isLoading ? (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-96 animate-pulse rounded-2xl bg-slate-200"></div>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600 ring-1 ring-red-100">
                Failed to load listings. Please try again later.
              </div>
            ) : data?.results?.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {data.results.map((listing: any) => (
                  <ListingCard key={listing.listing_id} listing={listing} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-24 text-center">
                <Filter className="h-12 w-12 text-slate-300" />
                <h3 className="mt-4 text-lg font-medium text-slate-900">No listings found</h3>
                <p className="mt-1 text-slate-500">Try adjusting your filters or search query.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
