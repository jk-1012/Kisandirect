'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Calendar, Scale, TrendingUp, TrendingDown, Star, Leaf, ShieldCheck, Truck, MessageSquare } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function ListingDetailPage() {
  const params = useParams();
  const listingId = params.id as string;
  const [quantity, setQuantity] = useState(10);
  const [delivery, setDelivery] = useState(false);
  const [address, setAddress] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerPrice, setOfferPrice] = useState(0);

  const { data: listing, isLoading, error } = useQuery({
    queryKey: ['listing', listingId],
    queryFn: async () => {
      const res = await fetch(`http://localhost:4000/api/v1/listings/${listingId}`);
      if (!res.ok) throw new Error('Failed to fetch listing');
      return res.json();
    }
  });

  if (isLoading) return <div className="min-h-screen animate-pulse bg-slate-50 p-8"><div className="mx-auto h-96 max-w-5xl rounded-2xl bg-slate-200"></div></div>;
  if (error || !listing) return <div className="min-h-screen bg-slate-50 p-8 text-center text-red-600">Failed to load listing details.</div>;

  const isAboveMandi = listing.mandi_comparison?.direction === 'above';
  const totalPrice = quantity * (Number(listing.asking_price_paise) / 100);

  const handleBuyNow = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('http://localhost:4000/api/v1/orders/buy-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ listing_id: listingId, quantity_kg: quantity, delivery_requested: delivery, delivery_address: delivery ? address : undefined })
      });
      if (!res.ok) throw new Error('Order creation failed');
      const order = await res.json();

      // Open Razorpay
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_123',
        amount: order.amount_due_paise,
        currency: 'INR',
        name: 'KisanDirect',
        description: `Escrow payment for ${listing.crop_type_display}`,
        order_id: order.payment_session_id,
        handler: function (response: any) {
          alert(`Payment successful! Payment ID: ${response.razorpay_payment_id}`);
        },
        prefill: {
          contact: order.buyer_id
        },
        theme: {
          color: '#059669'
        }
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err) {
      alert('Failed to initiate checkout.');
    } finally {
      setIsProcessing(false);
    }
  };

  const submitOffer = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('http://localhost:4000/api/v1/orders/make-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ listing_id: listingId, quantity_kg: quantity, offer_price_per_kg_inr: offerPrice })
      });
      if (!res.ok) throw new Error('Offer creation failed');
      alert('Offer submitted successfully!');
      setShowOfferModal(false);
    } catch (err) {
      alert('Failed to submit offer.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left Column: Photos & Details */}
          <div className="space-y-6">
            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="aspect-[4/3] w-full bg-slate-100">
                {listing.photo_urls && listing.photo_urls.length > 0 ? (
                  <img src={listing.photo_urls[0]} alt="Crop" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">No Image</div>
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-bold text-slate-900">Crop Details</h2>
              <p className="mt-4 text-slate-600 leading-relaxed">
                {listing.description || 'No description provided by the farmer.'}
              </p>
              
              <div className="mt-6 grid grid-cols-2 gap-6 border-t border-slate-100 pt-6">
                <div>
                  <div className="text-sm text-slate-500">Harvest Date</div>
                  <div className="mt-1 font-semibold text-slate-900 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-emerald-600" />
                    {new Date(listing.harvest_date).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">Grade</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {listing.grade ? `Grade ${listing.grade}` : 'Unsorted/Mixed'}
                  </div>
                </div>
                {listing.organic && (
                  <div className="col-span-2">
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
                      <Leaf className="h-4 w-4" />
                      Certified Organic Produce
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Pricing & Action */}
          <div className="space-y-6">
            <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">{listing.crop_type_display}</h1>
                  <p className="mt-2 flex items-center text-slate-600">
                    <MapPin className="mr-1.5 h-4 w-4" />
                    {listing.farmer.district}, {listing.farmer.state}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-emerald-700">
                    ₹{Number(listing.asking_price_paise) / 100}
                    <span className="text-lg font-normal text-slate-500">/kg</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {listing.quantity_remaining_kg} kg available
                  </div>
                </div>
              </div>

              {/* Price Intelligence Widget */}
              <div className="mt-6 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                  Price Intelligence
                </h3>
                {listing.mandi_price_paise ? (
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm text-slate-500">Local Mandi Avg</div>
                      <div className="text-lg font-semibold text-slate-900">₹{Number(listing.mandi_price_paise) / 100}/kg</div>
                    </div>
                    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${isAboveMandi ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {isAboveMandi ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {((Number(listing.asking_price_paise) / Number(listing.mandi_price_paise) - 1) * 100).toFixed(1).replace('-', '')}% {isAboveMandi ? 'higher' : 'lower'}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">Mandi comparison data not currently available for this region.</p>
                )}
              </div>

              {/* Purchase Configurator */}
              <div className="mt-8 space-y-6">
                <div>
                  <label className="text-sm font-medium text-slate-900 flex justify-between">
                    <span>Order Quantity (kg)</span>
                    <span className="text-slate-500">{quantity} kg</span>
                  </label>
                  <input 
                    type="range" 
                    min="10" 
                    max={listing.quantity_remaining_kg} 
                    value={quantity} 
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="mt-3 w-full accent-emerald-600" 
                  />
                  <div className="mt-2 flex justify-between text-xs text-slate-400">
                    <span>Min 10kg</span>
                    <span>Max {listing.quantity_remaining_kg}kg</span>
                  </div>
                </div>

                {listing.delivery_available && (
                  <div className="rounded-xl border border-slate-200 p-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={delivery}
                        onChange={(e) => setDelivery(e.target.checked)}
                        className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600" 
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-900 flex items-center gap-2">
                          <Truck className="h-4 w-4 text-slate-400" />
                          Request Delivery
                        </div>
                        <div className="text-sm text-slate-500">Farmer will arrange transport</div>
                      </div>
                    </label>
                    {delivery && (
                      <textarea
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Enter full delivery address..."
                        className="mt-3 w-full rounded-lg border-slate-200 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                        rows={2}
                      />
                    )}
                  </div>
                )}

                <div className="border-t border-slate-100 pt-6">
                  <div className="flex justify-between items-end mb-6">
                    <div className="text-slate-500 font-medium">Total Price</div>
                    <div className="text-3xl font-bold text-slate-900">₹{totalPrice.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={handleBuyNow}
                      disabled={isProcessing}
                      className="rounded-xl bg-emerald-600 px-4 py-4 text-center font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isProcessing ? 'Processing...' : 'Buy Now (Escrow)'}
                    </button>
                    <button 
                      onClick={() => { setOfferPrice(Number(listing.asking_price_paise) / 100); setShowOfferModal(true); }}
                      className="flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 px-4 py-4 text-center font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
                    >
                      <MessageSquare className="h-5 w-5" />
                      Negotiate
                    </button>
                  </div>
                  <p className="mt-4 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                    Payments are held in Escrow until delivery is verified.
                  </p>
                </div>
              </div>
            </div>

            {/* Farmer Profile Summary */}
            <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-xl font-bold">
                  {listing.farmer.kisan_id?.substring(0, 2) || 'KD'}
                </div>
                <div>
                  <h3 className="font-semibold text-white">Verified Farmer</h3>
                  <p className="text-sm text-slate-400">KisanID: {listing.farmer.kisan_id}</p>
                </div>
                <div className="ml-auto text-right">
                  <div className="flex items-center justify-end gap-1 font-bold text-amber-400">
                    <Star className="h-4 w-4 fill-current" />
                    {listing.farmer.trust_score || 'New'}
                  </div>
                  <div className="text-xs text-slate-400">Trust Score</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showOfferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Make an Offer</h3>
            <p className="mt-2 text-sm text-slate-600">Propose a new price per kg for {quantity}kg of {listing.crop_type_display}.</p>
            
            <div className="mt-6">
              <label className="text-sm font-medium text-slate-700">Offer Price (₹/kg)</label>
              <div className="mt-2 flex items-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2">
                <span className="text-slate-500">₹</span>
                <input 
                  type="number" 
                  min="1" 
                  step="0.5" 
                  value={offerPrice} 
                  onChange={(e) => setOfferPrice(Number(e.target.value))}
                  className="w-full bg-transparent px-2 font-semibold text-slate-900 outline-none" 
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button 
                onClick={() => setShowOfferModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button 
                onClick={submitOffer}
                disabled={isProcessing}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isProcessing ? 'Sending...' : 'Send Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
