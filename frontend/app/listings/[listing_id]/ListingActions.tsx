'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';

type ListingActionsProps = {
  listingId: string;
  shareUrl: string;
  expiresAt: string;
};

type OrderMode = 'BUY_NOW' | 'MAKE_OFFER' | 'RFQ' | null;

function formatRemaining(seconds: number) {
  if (seconds <= 0) {
    return 'Expired';
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) {
      return resolve();
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout')); 
    document.body.appendChild(script);
  });
}

export default function ListingActions({ listingId, shareUrl, expiresAt }: ListingActionsProps) {
  const [countdown, setCountdown] = useState(() => {
    const delta = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    return formatRemaining(delta);
  });
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<OrderMode>(null);
  const [quantity, setQuantity] = useState(1);
  const [offerPrice, setOfferPrice] = useState(0);
  const [message, setMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const auth = useAuthStore();

  useEffect(() => {
    const interval = setInterval(() => {
      const delta = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setCountdown(formatRemaining(delta));
    }, 60000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const loginReferral = `/register?next=/listings/${listingId}`;

  const resetState = () => {
    setMode(null);
    setQuantity(1);
    setOfferPrice(0);
    setMessage('');
    setStatusMessage(null);
  };

  const onShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'KisanDirect listing', url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage('Link copied to clipboard');
    } catch (error) {
      setShareMessage('Unable to share on this device');
    }
  };

  const actionUrl = useMemo(() => {
    if (!auth.accessToken) {
      return loginReferral;
    }
    return '#';
  }, [auth.accessToken, loginReferral]);

  const callBackend = async (path: string, body: Record<string, any>) => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const response = await fetch(`${backendUrl}/api/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    return response.json();
  };

  const handleRazorpay = async (orderResponse: any) => {
    if (!orderResponse.razorpay_order_id) {
      setStatusMessage('Payment could not be started.');
      return;
    }

    try {
      await loadRazorpay();
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
        order_id: orderResponse.razorpay_order_id,
        amount: orderResponse.amount ?? orderResponse.amount_paise,
        currency: 'INR',
        name: 'KisanDirect',
        description: 'Escrow payment for farm produce',
        prefill: {},
        handler: (response: any) => {
          setStatusMessage('Payment completed. Order is being processed.');
        },
        theme: { color: '#16a34a' }
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
      return true;
    } catch (error) {
      setStatusMessage('Unable to open Razorpay checkout.');
      return false;
    }
  };

  const submitOrder = async () => {
    if (!auth.accessToken) {
      window.location.href = loginReferral;
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    try {
      let response;
      if (mode === 'BUY_NOW') {
        response = await callBackend('orders/buy-now', { listing_id: listingId, quantity_kg: quantity });
        if (response.razorpay_order_id) {
          await handleRazorpay(response);
        }
      } else if (mode === 'MAKE_OFFER') {
        response = await callBackend('orders/make-offer', { listing_id: listingId, quantity_kg: quantity, offer_price_per_kg_inr: offerPrice });
        setStatusMessage('Offer submitted. Farmer will review your price.');
      } else if (mode === 'RFQ') {
        response = await callBackend('orders/rfq', { listing_id: listingId, quantity_kg: quantity, message });
        setStatusMessage('RFQ sent. Farmer will reply with availability and price.');
      }
      if (response?.error) {
        setStatusMessage(response.error || 'Unable to process request.');
      }
    } catch (err) {
      setStatusMessage('Something went wrong. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setMode('BUY_NOW')}
          className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-4 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          Buy Now
        </button>
        <button
          type="button"
          onClick={() => setMode('MAKE_OFFER')}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
        >
          Make Offer
        </button>
        <button
          type="button"
          onClick={() => setMode('RFQ')}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
        >
          Request Quote
        </button>
      </div>

      {mode ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">{mode === 'BUY_NOW' ? 'Buy Now' : mode === 'MAKE_OFFER' ? 'Make an Offer' : 'Request a Quote'}</h3>
            <button type="button" onClick={resetState} className="text-sm text-slate-500 hover:text-slate-900">Cancel</button>
          </div>

          <label className="block text-sm font-medium text-slate-700">Quantity (kg)</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
          />

          {mode === 'MAKE_OFFER' ? (
            <>
              <label className="mt-4 block text-sm font-medium text-slate-700">Your offer price (₹/kg)</label>
              <input
                type="number"
                step="1"
                min={1}
                value={offerPrice}
                onChange={(event) => setOfferPrice(Number(event.target.value))}
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
              />
            </>
          ) : null}

          {mode === 'RFQ' ? (
            <>
              <label className="mt-4 block text-sm font-medium text-slate-700">Message for farmer</label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
                rows={4}
              />
            </>
          ) : null}

          <button
            type="button"
            disabled={loading}
            onClick={submitOrder}
            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Processing…' : mode === 'BUY_NOW' ? 'Pay Securely' : mode === 'MAKE_OFFER' ? 'Submit Offer' : 'Send RFQ'}
          </button>
          {statusMessage ? <p className="mt-3 text-sm text-slate-700">{statusMessage}</p> : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onShare}
        className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
      >
        Share this listing
      </button>
      {shareMessage ? (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{shareMessage}</p>
      ) : null}
      <div className="rounded-3xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Expires in</p>
        <p className="mt-2 text-xl font-semibold text-emerald-700">{countdown}</p>
      </div>
    </div>
  );
}
