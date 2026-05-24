'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

const STATES: Record<string, string> = {
  'KA': 'Karnataka', 'MH': 'Maharashtra', 'UP': 'Uttar Pradesh', 'RJ': 'Rajasthan', 'GJ': 'Gujarat', 'TG': 'Telangana', 'AP': 'Andhra Pradesh'
};

const CROPS = ['TOMATO', 'ONION', 'POTATO', 'WHEAT', 'RICE', 'COTTON', 'SUGARCANE'];

export default function RfqCreatePage() {
  const [formData, setFormData] = useState({
    crop_type: 'TOMATO',
    quantity_mt: 1,
    price_ceiling_inr_per_kg: 25,
    delivery_date: '2026-06-15',
    delivery_state_code: 'KA',
    delivery_district: 'Bengaluru',
    quality_requirements: 'Grade A'
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch('/api/v1/rfq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to create RFQ');
      return res.json();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  if (createMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-3xl font-bold text-green-700 mb-4">RFQ Created Successfully!</h1>
          <p className="text-lg text-gray-600 mb-2">RFQ ID: <span className="font-mono font-bold">{(createMutation.data as any)?.rfq_id}</span></p>
          <p className="text-gray-600 mb-6">Matched Farmers: {(createMutation.data as any)?.matched_farmers_count}</p>
          <a href="/" className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Back to dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-green-700 mb-8">Create RFQ (Request for Quote)</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Crop Type</label>
            <select value={formData.crop_type} onChange={(e) => setFormData({ ...formData, crop_type: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent">
              {CROPS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantity (Metric Tonnes)</label>
              <input type="number" step="0.1" value={formData.quantity_mt} onChange={(e) => setFormData({ ...formData, quantity_mt: parseFloat(e.target.value) })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Price Ceiling (₹/kg)</label>
              <input type="number" step="0.01" value={formData.price_ceiling_inr_per_kg} onChange={(e) => setFormData({ ...formData, price_ceiling_inr_per_kg: parseFloat(e.target.value) })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Date</label>
            <input type="date" value={formData.delivery_date} onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
              <select value={formData.delivery_state_code} onChange={(e) => setFormData({ ...formData, delivery_state_code: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent">
                {Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">District</label>
              <input type="text" value={formData.delivery_district} onChange={(e) => setFormData({ ...formData, delivery_district: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quality Requirements</label>
            <textarea value={formData.quality_requirements} onChange={(e) => setFormData({ ...formData, quality_requirements: e.target.value })} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>

          <button type="submit" disabled={createMutation.isPending} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {createMutation.isPending ? 'Creating...' : 'Create RFQ'}
          </button>

          {createMutation.isError && <p className="text-red-600 text-center">{(createMutation.error as any)?.message || 'Error creating RFQ'}</p>}
        </form>
      </div>
    </div>
  );
}
