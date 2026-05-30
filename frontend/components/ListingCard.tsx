'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin, Calendar, Scale, TrendingUp, TrendingDown, Star, Leaf } from 'lucide-react';

export default function ListingCard({ listing }: { listing: any }) {
  const isAboveMandi = listing.mandi_comparison?.direction === 'above';
  
  return (
    <Link href={`/buy/listings/${listing.listing_id}`} className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-md hover:ring-emerald-500">
      <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
        {listing.photo_url ? (
          <img 
            src={listing.photo_url} 
            alt={listing.crop.display_name} 
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
            No image available
          </div>
        )}
        {listing.organic && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-sm backdrop-blur-md">
            <Leaf className="h-3 w-3" />
            Organic
          </div>
        )}
        {listing.grade && (
          <div className="absolute right-3 top-3 inline-flex items-center rounded-full bg-slate-900/80 px-2.5 py-1 text-xs font-bold text-white shadow-sm backdrop-blur-md">
            Grade {listing.grade}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{listing.crop.display_name}</h3>
            <p className="mt-1 flex items-center text-sm text-slate-500">
              <MapPin className="mr-1 h-3.5 w-3.5" />
              {listing.farmer.district}, {listing.farmer.state}
              {listing.distance_km && ` • ${listing.distance_km.toFixed(1)} km`}
            </p>
          </div>
          <div className="flex flex-col items-end text-right">
            <span className="text-xl font-bold text-emerald-700">
              ₹{listing.price_per_kg_inr}
              <span className="text-sm font-normal text-slate-500">/kg</span>
            </span>
          </div>
        </div>

        {listing.mandi_comparison && (
          <div className={`mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${isAboveMandi ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {isAboveMandi ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            <span>
              {listing.mandi_comparison.difference_pct} vs mandi (₹{listing.mandi_price_per_kg_inr}/kg)
            </span>
          </div>
        )}

        <div className="mt-4 grid flex-1 grid-cols-2 gap-y-2 text-sm text-slate-600">
          <div className="flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-900">{listing.quantity_remaining_kg} kg</span> left
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span>Harvest: {listing.harvest_date ? new Date(listing.harvest_date).toLocaleDateString() : 'N/A'}</span>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                {listing.farmer.kisan_id?.substring(0, 2) || 'KD'}
              </div>
              <span className="text-xs font-medium text-slate-700">KisanID: {listing.farmer.kisan_id}</span>
            </div>
            {listing.farmer.trust_score > 0 && (
              <div className="flex items-center gap-1 text-xs font-semibold text-amber-500">
                <Star className="h-3.5 w-3.5 fill-current" />
                {listing.farmer.trust_score}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
