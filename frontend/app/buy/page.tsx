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
