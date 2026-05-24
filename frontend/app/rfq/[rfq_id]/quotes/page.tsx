'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';

export default function FarmerQuotePage() {
  const params = useParams();
  const rfqId = params.rfq_id as string;
  const [formData, setFormData] = useState({
    quantity_kg: 1000,
    price_per_kg_inr: 23.5,
    available_from_date: '2026-06-10',
    notes: ''
  });

  const { data: rfq, isLoading } = useQuery({
    queryKey: ['rfq', rfqId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/rfq/${rfqId}`);
      if (!res.ok) throw new Error('RFQ not found');
      return res.json();
    }
  });

  const quoteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/rfq/${rfqId}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error('Failed to submit quote');
      return res.json();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    quoteMutation.mutate();
  };

  if (isLoading) return <div className="text-center py-12">Loading...</div>;

  if (quoteMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-3xl font-bold text-green-700 mb-4">Quote Submitted!</h1>
          <p className="text-gray-600">Quote ID: <span className="font-mono font-bold">{(quoteMutation.data as any)?.quote_id}</span></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-green-700 mb-2">Submit Your Quote</h1>
        <p className="text-gray-600 mb-8">RFQ: {rfqId}</p>

        {rfq && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded">
            <p className="text-sm text-gray-700"><strong>Required:</strong> {rfq.quantity_mt * 1000}kg of {rfq.crop_type}</p>
            <p className="text-sm text-gray-700"><strong>Price Ceiling:</strong> ₹{rfq.price_ceiling_inr_per_kg}/kg</p>
            <p className="text-sm text-gray-700"><strong>Delivery:</strong> {rfq.delivery_date}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantity (kg)</label>
              <input type="number" step="1" value={formData.quantity_kg} onChange={(e) => setFormData({ ...formData, quantity_kg: parseInt(e.target.value) })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Price (₹/kg)</label>
              <input type="number" step="0.01" value={formData.price_per_kg_inr} onChange={(e) => setFormData({ ...formData, price_per_kg_inr: parseFloat(e.target.value) })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Available From</label>
            <input type="date" value={formData.available_from_date} onChange={(e) => setFormData({ ...formData, available_from_date: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} placeholder="e.g., Available at farm gate, transportation available, etc." className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>

          <button type="submit" disabled={quoteMutation.isPending} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {quoteMutation.isPending ? 'Submitting...' : 'Submit Quote'}
          </button>

          {quoteMutation.isError && <p className="text-red-600 text-center">{(quoteMutation.error as any)?.message}</p>}
        </form>
      </div>
    </div>
  );
}
