/**
 * Loading skeletons and fallback components
 */

'use client';

import React from 'react';

export function ListingCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow animate-pulse">
      <div className="aspect-square bg-gray-200 rounded-t-lg" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="flex justify-between">
          <div className="h-5 bg-gray-200 rounded w-1/4" />
          <div className="h-5 bg-gray-200 rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}

export function ListingGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CartItemSkeleton() {
  return (
    <div className="flex gap-4 p-4 border-b animate-pulse">
      <div className="w-20 h-20 bg-gray-200 rounded" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-4 bg-gray-200 rounded w-1/3" />
      </div>
    </div>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow p-4 animate-pulse space-y-3">
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="flex gap-2">
        <div className="h-6 bg-gray-200 rounded w-20" />
        <div className="h-6 bg-gray-200 rounded w-20" />
      </div>
    </div>
  );
}

export function OrderlistSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CheckoutPageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6 animate-pulse">
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <div className="bg-white rounded-lg p-6 space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/3" />
            <CartItemSkeleton />
            <CartItemSkeleton />
          </div>

          {/* Shipping */}
          <div className="bg-white rounded-lg p-6 space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/3" />
            <div className="h-10 bg-gray-200 rounded" />
          </div>

          {/* Payment */}
          <div className="bg-white rounded-lg p-6 space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/3" />
            <div className="h-10 bg-gray-200 rounded" />
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-lg p-6 h-fit space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/2" />
          <div className="space-y-2">
            <div className="flex justify-between"><div className="h-4 bg-gray-200 rounded w-20" /><div className="h-4 bg-gray-200 rounded w-16" /></div>
            <div className="flex justify-between"><div className="h-4 bg-gray-200 rounded w-20" /><div className="h-4 bg-gray-200 rounded w-16" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PriceChartSkeleton() {
  return (
    <div className="bg-white rounded-lg p-6 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="h-64 bg-gray-200 rounded" />
    </div>
  );
}

export function NotificationSkeleton() {
  return (
    <div className="p-4 border-b animate-pulse flex gap-3">
      <div className="w-2 h-2 bg-gray-200 rounded-full mt-2 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
      </div>
    </div>
  );
}
