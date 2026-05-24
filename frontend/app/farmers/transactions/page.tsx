'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

function formatINR(amount: string | number) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN');
}

export default function FarmerTransactionsPage() {
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['farmer-transactions', page, fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (fromDate) params.append('from_date', fromDate);
      if (toDate) params.append('to_date', toDate);
      const res = await fetch(`/api/v1/farmers/me/transactions?${params}`);
      if (!res.ok) throw new Error('Failed to load transactions');
      return res.json();
    }
  });

  const handleDownloadPDF = async () => {
    const res = await fetch('/api/v1/farmers/me/transactions/pdf');
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transactions.pdf';
      a.click();
    }
  };

  const getStatusBadgeColor = (status: string) => {
    if (status === 'RELEASED') return 'bg-green-100 text-green-800';
    if (status === 'ESCROW_HELD') return 'bg-yellow-100 text-yellow-800';
    if (status === 'DISPUTE_FROZEN') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    if (status === 'RELEASED') return 'Paid to You';
    if (status === 'ESCROW_HELD') return 'Payment Secured';
    if (status === 'DISPUTE_FROZEN') return 'Dispute in Progress';
    if (status === 'REFUNDED') return 'Refunded to Buyer';
    return status;
  };

  if (isLoading) return <div className="text-center py-12">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Your Transactions</h1>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-medium">Total Earnings</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{formatINR(data?.total_earnings_inr ?? 0)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-medium">Platform Fees Paid</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{formatINR(data?.total_fees_inr ?? 0)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-medium">Total Orders</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">{data?.transactions?.length ?? 0}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
              <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
              <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div className="flex items-end">
              <button onClick={handleDownloadPDF} className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 font-semibold">Download PDF</button>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Order ID</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Crop</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">District</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Qty (kg)</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Gross</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.transactions?.map((tx: any, idx: number) => (
                <tr key={idx} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{formatDate(tx.date)}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-600">{tx.order_id}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{tx.crop}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{tx.buyer_district || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{Number(tx.quantity_kg).toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">{formatINR(tx.gross_amount_inr)}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeColor(tx.status)}`}>
                      {getStatusText(tx.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.transactions?.length && (
            <div className="text-center py-12 text-gray-500">No transactions found.</div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex justify-center gap-2 mt-8">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50">Previous</button>
          <span className="px-4 py-2 text-gray-600">Page {page}</span>
          <button onClick={() => setPage(p => p + 1)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Next</button>
        </div>
      </div>
    </div>
  );
}
