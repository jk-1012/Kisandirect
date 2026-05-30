'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PlusCircle, Sprout, TrendingUp, Package, AlertCircle } from 'lucide-react';

export default function FarmerDashboard() {
  const { data: listings, isLoading } = useQuery({
    queryKey: ['farmer_listings'],
    queryFn: async () => {
      const res = await fetch('http://localhost:4000/api/v1/farmers/listings/mine', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch listings');
      return res.json();
    }
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-emerald-900 pb-24 pt-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Farmer Dashboard</h1>
              <p className="mt-1 text-emerald-100">Manage your produce and track sales</p>
            </div>
            <Link 
              href="/farmers/listings/new" 
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-emerald-900 shadow-sm transition-all hover:bg-emerald-50"
            >
              <PlusCircle className="h-5 w-5" />
              <span className="hidden sm:inline">New Listing</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="-mt-16 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-3 text-slate-500">
              <Package className="h-5 w-5" />
              <span className="text-sm font-medium">Active Listings</span>
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">
              {listings?.listings?.filter((l: any) => l.status === 'ACTIVE').length || 0}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-3 text-slate-500">
              <TrendingUp className="h-5 w-5" />
              <span className="text-sm font-medium">Total Orders</span>
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">
              {listings?.listings?.reduce((acc: number, l: any) => acc + (l.order_count || 0), 0) || 0}
            </div>
          </div>
        </div>

        {/* Listings List */}
        <div className="mt-8 rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-lg font-bold text-slate-900">Your Produce</h2>
          </div>
          
          <div className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-slate-500">Loading your listings...</div>
            ) : listings?.listings?.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {listings.listings.map((listing: any) => (
                  <li key={listing.listing_id} className="flex items-center justify-between p-6 hover:bg-slate-50">
                    <div className="flex items-center gap-5">
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100">
                        {listing.photo_urls?.[0] ? (
                          <img src={listing.photo_urls[0]} alt="Crop" className="h-full w-full rounded-xl object-cover" />
                        ) : (
                          <Sprout className="h-8 w-8 text-emerald-600" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">{listing.crop_type}</h3>
                        <p className="text-sm text-slate-500">
                          {listing.quantity_remaining_kg} kg • ₹{Number(listing.asking_price_paise) / 100}/kg
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        listing.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {listing.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <AlertCircle className="h-12 w-12 text-slate-300" />
                <h3 className="mt-4 text-lg font-medium text-slate-900">No listings yet</h3>
                <p className="mt-1 max-w-sm text-slate-500">You haven't listed any produce. Create your first listing to start selling.</p>
                <Link 
                  href="/farmers/listings/new" 
                  className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white hover:bg-emerald-700"
                >
                  Create Listing
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
