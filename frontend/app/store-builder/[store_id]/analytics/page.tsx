import { Metadata } from 'next';
import React from 'react';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export const metadata: Metadata = {
  title: 'Storefront Analytics'
};

async function fetchAnalytics(storeId: string) {
  const res = await fetch(`${apiBase}/api/v1/storefronts/${storeId}/analytics`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

// Client-side charting components
function ChartsClient({ data }: { data: any }) {
  'use client';
  // Dynamic import of recharts to avoid SSR trouble
  const { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Legend } = require('recharts');

  const daily = data?.daily_views ?? [];
  const sources = data?.traffic_sources ?? [];
  const devices = data?.devices ?? [];
  const topStates = data?.top_states ?? [];

  const lineData = daily.map((r: any) => ({ day: new Date(r.day).toISOString().slice(0,10), views: Number(r.views) }));
  const sourcesData = sources.map((r: any) => ({ name: r.source ?? r.source, value: Number(r.count) }));
  const devicesData = devices.map((r: any) => ({ name: r.device_type, value: Number(r.count) }));

  const COLORS = ['#16a34a','#0ea5e9','#f59e0b','#ef4444','#7c3aed'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-white p-4 shadow"> <h4 className="text-sm text-slate-500">Page Views Today</h4><p className="text-2xl font-semibold">{data?.summary?.today ?? 0}</p></div>
        <div className="rounded-lg bg-white p-4 shadow"> <h4 className="text-sm text-slate-500">Page Views This Week</h4><p className="text-2xl font-semibold">{data?.summary?.week ?? 0}</p></div>
        <div className="rounded-lg bg-white p-4 shadow"> <h4 className="text-sm text-slate-500">Page Views This Month</h4><p className="text-2xl font-semibold">{data?.summary?.month ?? 0}</p></div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 rounded-lg bg-white p-4 shadow" style={{ height: 320 }}>
          <h3 className="mb-2 font-semibold">30-day page view trend</h3>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="views" stroke="#16a34a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg bg-white p-4 shadow" style={{ height: 320 }}>
          <h3 className="mb-2 font-semibold">Traffic sources</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={sourcesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="rounded-lg bg-white p-4 shadow" style={{ height: 320 }}>
          <h3 className="mb-2 font-semibold">Device types</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={devicesData} dataKey="value" nameKey="name" outerRadius={80} label>
                {devicesData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-2 rounded-lg bg-white p-4 shadow" style={{ minHeight: 320 }}>
          <h3 className="mb-2 font-semibold">Top visitor states</h3>
          <div className="grid grid-cols-2 gap-2">
            {topStates.length === 0 ? <p className="text-sm text-slate-500">No geographic data</p> : topStates.map((s: any, idx: number) => (
              <div key={s.visitor_state} className="p-3 border rounded">
                <div className="flex justify-between"><span className="font-medium">{s.visitor_state}</span><span>{s.views}</span></div>
                <div className="h-2 bg-slate-100 rounded mt-2"><div style={{ width: `${Math.min(100, (s.views / (topStates[0]?.views || 1)) * 100)}%`, height: '8px', background: '#0ea5e9', borderRadius: 6 }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="mb-3 font-semibold">Top content clicks</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600"><th>Section</th><th className="text-right">Clicks</th></tr>
          </thead>
          <tbody>
            {data?.event_breakdown?.map((e: any) => (
              <tr key={e.event_type}><td className="py-2">{e.event_type}</td><td className="text-right">{e.count}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function AnalyticsPage({ params }: { params: { store_id: string } }) {
  const storeId = params.store_id;
  const data = await fetchAnalytics(storeId);

  if (!data) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="text-slate-500">No analytics data available or failed to load.</p>
      </div>
    );
  }

  return (
    <main className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Storefront analytics</h1>
        <p className="text-sm text-slate-600">Owner-only dashboard for store {storeId}</p>
      </header>

      {/* Render client charts */}
      {/* @ts-ignore */}
      <ChartsClient data={data} />
    </main>
  );
}
