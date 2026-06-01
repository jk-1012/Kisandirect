/**
 * Core UI components for buyer features
 */

'use client';

import React from 'react';
import {
  formatCurrency,
  getRatingColor,
  getTrustBadges,
  getOrderStatusColor,
  getOrderStatusLabel,
  getSupplyTrendLabel,
  getSupplyTrendColor,
} from '@/lib/utils';
import { Listing, TrustScore } from '@/lib/types';

/**
 * Price display component
 */
export function PriceDisplay({
  price,
  unit,
  minimumQuantity,
  onAddToCart,
  loading = false,
}: {
  price: number;
  unit: string;
  minimumQuantity: number;
  onAddToCart?: () => void;
  loading?: boolean;
}) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 space-y-2">
      <div className="text-sm text-gray-600">Price per {unit}</div>
      <div className="text-3xl font-bold text-blue-900">{formatCurrency(price)}</div>
      <div className="text-xs text-gray-600">Minimum: {minimumQuantity} {unit}</div>
      {onAddToCart && (
        <button
          onClick={onAddToCart}
          disabled={loading}
          className="w-full mt-4 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Adding...' : 'Add to Cart'}
        </button>
      )}
    </div>
  );
}

/**
 * Rating badge
 */
export function RatingBadge({
  rating,
  count = 0,
  compact = false,
}: {
  rating: number;
  count?: number;
  compact?: boolean;
}) {
  const color = getRatingColor(rating);

  return (
    <div className={`flex items-center gap-1 ${compact ? 'text-xs' : ''}`}>
      <span className={`font-semibold ${color}`}>{rating.toFixed(1)}</span>
      <span className="text-yellow-400">★</span>
      {count > 0 && !compact && <span className="text-gray-600">({count})</span>}
    </div>
  );
}

/**
 * Trust score badges
 */
export function TrustBadgeDisplay({
  score,
  payment,
  delivery,
  communication,
  compact = false,
}: {
  score: number;
  payment: number;
  delivery: number;
  communication: number;
  compact?: boolean;
}) {
  const badges = getTrustBadges(score);
  const badgeLabels: Record<string, string> = {
    VERIFIED_BUYER: '✓ Verified',
    FAST_PAYER: '⚡ Fast Payer',
    RELIABLE_BUYER: '🎯 Reliable',
    MASTER_BUYER: '👑 Master Buyer',
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {badges.map((badge: string) => (
          <span
            key={badge}
            className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
          >
            {badgeLabels[badge] || badge}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-blue-50 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-600">Payment</div>
          <div className="text-lg font-bold text-blue-900">{payment}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Delivery</div>
          <div className="text-lg font-bold text-blue-900">{delivery}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Communication</div>
          <div className="text-lg font-bold text-blue-900">{communication}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Score</div>
          <div className="text-lg font-bold text-blue-900">{score}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {badges.map((badge: string) => (
          <span key={badge} className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
            {badgeLabels[badge] || badge}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Order status badge
 */
export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getOrderStatusColor(status)}`}>
      {getOrderStatusLabel(status)}
    </span>
  );
}

/**
 * Listing card with image optimization
 */
export function ListingCard({
  listing,
  onClick,
}: {
  listing: Listing;
  onClick?: () => void;
}) {
  const imageUrl = listing.images?.[0] || '/placeholder.png';

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden cursor-pointer h-full flex flex-col"
    >
      {/* Image */}
      <div className="relative aspect-square bg-gray-200 overflow-hidden">
        <img
          src={imageUrl}
          alt={listing.title}
          className="w-full h-full object-cover hover:scale-105 transition-transform"
          loading="lazy"
        />
        {listing.organic && (
          <span className="absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-1 rounded">
            Organic
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="font-semibold text-sm line-clamp-2 mb-2">{listing.title}</h3>

        <div className="text-xs text-gray-600 mb-2">
          <div>{listing.location}</div>
          <div className="text-gray-500">{listing.district}</div>
        </div>

        <div className="flex justify-between items-center mb-2 text-xs">
          <RatingBadge rating={listing.sellerRating} compact />
          <span className="text-gray-600">{listing.sellerReviews} reviews</span>
        </div>

        {/* Price and action */}
        <div className="mt-auto pt-2 border-t">
          <div className="font-bold text-lg text-blue-600 mb-1">
            {formatCurrency(listing.unitPrice)}/{listing.unit}
          </div>
          <div className="text-xs text-gray-600">Min: {listing.minOrderQuantity} {listing.unit}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Seller info card
 */
export function SellerCard({
  name,
  rating,
  reviews,
  location,
  trustScore,
}: {
  name: string;
  rating: number;
  reviews: number;
  location: string;
  trustScore?: number;
}) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-lg">{name}</h3>
          <p className="text-sm text-gray-600">{location}</p>
        </div>
        {trustScore && (
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">{trustScore}</div>
            <div className="text-xs text-gray-600">Trust Score</div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <RatingBadge rating={rating} count={reviews} />
      </div>
    </div>
  );
}

/**
 * Supply trend indicator
 */
export function SupplyTrendBadge({ trend }: { trend: string }) {
  const color = getSupplyTrendColor(trend);

  return (
    <div className={`text-sm font-medium ${color}`}>
      {getSupplyTrendLabel(trend)}
    </div>
  );
}

/**
 * Certification badge
 */
export function CertificationBadge({ certification }: { certification: string }) {
  const colors: Record<string, string> = {
    ORGANIC: 'bg-green-100 text-green-800',
    FRESH: 'bg-blue-100 text-blue-800',
    CERTIFIED: 'bg-purple-100 text-purple-800',
    FAIR_TRADE: 'bg-amber-100 text-amber-800',
  };

  return (
    <span className={`text-xs px-2 py-1 rounded-full ${colors[certification] || 'bg-gray-100 text-gray-800'}`}>
      {certification}
    </span>
  );
}

/**
 * Payment method selector
 */
export function PaymentMethodSelector({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (method: string) => void;
}) {
  const methods = [
    { id: 'RAZORPAY', name: 'Card / UPI', icon: '💳' },
    { id: 'BANK_TRANSFER', name: 'Bank Transfer', icon: '🏦' },
    { id: 'ESCROW', name: 'Escrow (Safe)', icon: '🔒' },
  ];

  return (
    <div className="space-y-2">
      {methods.map((method) => (
        <label
          key={method.id}
          className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
            selected === method.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
          }`}
        >
          <input
            type="radio"
            name="payment"
            value={method.id}
            checked={selected === method.id}
            onChange={(e) => onChange(e.target.value)}
            className="w-4 h-4"
          />
          <span className="text-lg">{method.icon}</span>
          <span className="font-medium">{method.name}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Address selector
 */
export function AddressSelector({
  addresses,
  selected,
  onChange,
  onAddNew,
}: {
  addresses: any[];
  selected?: string;
  onChange: (id: string) => void;
  onAddNew?: () => void;
}) {
  return (
    <div className="space-y-2">
      {addresses.map((address) => (
        <label
          key={address.id}
          className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
            selected === address.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
          }`}
        >
          <input
            type="radio"
            name="address"
            value={address.id}
            checked={selected === address.id}
            onChange={(e) => onChange(e.target.value)}
            className="w-4 h-4"
          />
          <div className="flex-1">
            <div className="font-medium">{address.name}</div>
            <div className="text-sm text-gray-600">
              {address.street}, {address.city}, {address.state} {address.zipCode}
            </div>
            <div className="text-sm text-gray-500">{address.phone}</div>
          </div>
          {address.isDefault && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              Default
            </span>
          )}
        </label>
      ))}

      {onAddNew && (
        <button
          onClick={onAddNew}
          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-600 hover:text-blue-600 transition"
        >
          + Add New Address
        </button>
      )}
    </div>
  );
}

/**
 * Quantity selector
 */
export function QuantitySelector({
  quantity,
  min = 1,
  max = 999,
  unit = '',
  onChange,
}: {
  quantity: number;
  min?: number;
  max?: number;
  unit?: string;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(min, quantity - 1))}
        className="w-8 h-8 rounded border hover:bg-gray-100"
      >
        −
      </button>
      <div className="flex-1 text-center">
        <input
          type="number"
          value={quantity}
          onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || min)))}
          className="w-16 text-center border rounded px-2 py-1"
          min={min}
          max={max}
        />
        {unit && <span className="text-sm text-gray-600 ml-2">{unit}</span>}
      </div>
      <button
        onClick={() => onChange(Math.min(max, quantity + 1))}
        className="w-8 h-8 rounded border hover:bg-gray-100"
      >
        +
      </button>
    </div>
  );
}

/**
 * Empty state
 */
export function EmptyState({
  icon = '📦',
  title = 'Nothing here',
  description = 'Get started by creating your first item',
  action,
}: {
  icon?: string;
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="text-center py-12">
      <div className="text-5xl mb-2">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-gray-600 mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
