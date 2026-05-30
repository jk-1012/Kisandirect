'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ListingCard from '../../components/ListingCard';
import { Search, Filter, SlidersHorizontal, MapPin } from 'lucide-react';

export default function BuyerCataloguePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    organic: false,
    delivery_available: false,
    sort: 'recency'
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['listings', searchQuery, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (filters.organic) params.set('organic', 'true');
      if (filters.delivery_available) params.set('delivery_available', 'true');
      params.set('sort', filters.sort);
      
      const res = await fetch(`http://localhost:4000/api/v1/listings/search?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch listings');
      return res.json();
    }
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-emerald-900 pb-24 pt-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Fresh produce, direct from farmers.
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-emerald-100">
              Discover quality crops at fair prices, with transparent mandi comparisons and secure escrow payments.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-3xl">
            <div className="flex items-center overflow-hidden rounded-2xl bg-white p-2 shadow-lg focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2 focus-within:ring-offset-emerald-900">
              <div className="flex items-center px-4 text-slate-400">
                <Search className="h-5 w-5" />
              </div>
              <input
                type="text"
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
