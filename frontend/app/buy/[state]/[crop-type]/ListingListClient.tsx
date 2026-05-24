'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';

type Props = { initialListings: any[]; state: string; crop: string };

type Filters = {
  district: string[];
  priceMin: number;
  priceMax: number;
  quantityMin: number;
  harvestDateFrom: string;
  harvestDateTo: string;
  organic: boolean;
  grade: string;
  delivery: boolean;
  sort: string;
};

const defaultFilters: Filters = {
  district: [],
  priceMin: 0,
  priceMax: 500,
  quantityMin: 1,
  harvestDateFrom: '',
  harvestDateTo: '',
  organic: false,
  grade: 'ALL',
  delivery: false,
  sort: 'recency'
};

function buildQueryParams(state: string, crop: string, filters: Filters, cursor?: string) {
  const params = new URLSearchParams();
  params.set('state', state);
  params.set('crop_type', crop);
  params.set('limit', '24');
  params.set('sort', filters.sort);
  if (filters.district.length) params.set('district', filters.district.join(','));
  if (filters.priceMin !== 0) params.set('price_min', String(filters.priceMin));
  if (filters.priceMax !== 500) params.set('price_max', String(filters.priceMax));
  if (filters.quantityMin !== 1) params.set('quantity_min', String(filters.quantityMin));
  if (filters.harvestDateFrom) params.set('harvest_date_from', filters.harvestDateFrom);
  if (filters.harvestDateTo) params.set('harvest_date_to', filters.harvestDateTo);
  if (filters.organic) params.set('organic', 'true');
  if (filters.grade && filters.grade !== 'ALL') params.set('grade', filters.grade);
  if (filters.delivery) params.set('delivery_available', 'true');
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

async function fetchPage({ pageParam = '', state, crop, filters }: any) {
  const backend = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const queryString = buildQueryParams(state, crop, filters, pageParam);
  const res = await fetch(`${backend}/api/v1/listings/search?${queryString}`);
  if (!res.ok) throw new Error('Failed to fetch listings');
  return await res.json();
}

export default function ListingListClient({ initialListings, state, crop }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultFilters,
    grade: (searchParams.get('grade') as string) || 'ALL',
    delivery: searchParams.get('delivery_available') === 'true',
    organic: searchParams.get('organic') === 'true',
    priceMin: Number(searchParams.get('price_min') ?? 0),
    priceMax: Number(searchParams.get('price_max') ?? 500),
    quantityMin: Number(searchParams.get('quantity_min') ?? 1),
    harvestDateFrom: searchParams.get('harvest_date_from') ?? '',
    harvestDateTo: searchParams.get('harvest_date_to') ?? '',
    district: (searchParams.get('district') ?? '').split(',').filter(Boolean)
  }));

  const [items, setItems] = useState(initialListings || []);
  const [availableDistricts, setAvailableDistricts] = useState<string[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const queryKey = ['catalogue', state, crop, filters];

  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = '' }) => fetchPage({ pageParam, state, crop, filters }),
    getNextPageParam: (last) => last.next_cursor ?? null,
    initialPageParam: '',
    initialData: { pages: [{ results: initialListings }], pageParams: [''] }
  });

  useEffect(() => {
    if (q.data) {
      const merged = q.data.pages.flatMap((p: any) => p.results || []);
      setItems(merged);
      const districts = Array.from(new Set(merged.map((item: any) => item.farmer.district).filter(Boolean)));
      setAvailableDistricts(districts);
    }
  }, [q.data]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.district.length) filters.district.forEach((d) => params.append('district', d));
    if (filters.priceMin !== 0) params.set('price_min', String(filters.priceMin));
    if (filters.priceMax !== 500) params.set('price_max', String(filters.priceMax));
    if (filters.quantityMin !== 1) params.set('quantity_min', String(filters.quantityMin));
    if (filters.harvestDateFrom) params.set('harvest_date_from', filters.harvestDateFrom);
    if (filters.harvestDateTo) params.set('harvest_date_to', filters.harvestDateTo);
    if (filters.organic) params.set('organic', 'true');
    if (filters.grade !== 'ALL') params.set('grade', filters.grade);
    if (filters.delivery) params.set('delivery_available', 'true');
    if (filters.sort) params.set('sort', filters.sort);
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  }, [filters, router]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && q.hasNextPage && !q.isFetchingNextPage) {
        q.fetchNextPage();
      }
    }, { rootMargin: '200px' });
    observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage]);

  const handleToggleDistrict = (district: string) => {
    setFilters((prev) => ({
      ...prev,
      district: prev.district.includes(district) ? prev.district.filter((d) => d !== district) : [...prev.district, district]
    }));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Filters</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">District</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {availableDistricts.length ? availableDistricts.map((district) => (
                <button
                  key={district}
                  type="button"
                  onClick={() => handleToggleDistrict(district)}
                  className={`rounded-full px-3 py-2 text-sm ${filters.district.includes(district) ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
                >
                  {district}
                </button>
              )) : <p className="text-sm text-slate-500">Results populate district filters.</p>}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Sort</label>
            <select
              value={filters.sort}
              onChange={(event) => setFilters((prev) => ({ ...prev, sort: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
            >
              <option value="proximity">Proximity</option>
              <option value="recency">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="trust_score">Trust Score</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Price range (₹/kg)</label>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                min={0}
                max={filters.priceMax}
                value={filters.priceMin}
                onChange={(event) => setFilters((prev) => ({ ...prev, priceMin: Number(event.target.value) }))}
                className="w-1/2 rounded-2xl border border-slate-300 px-4 py-3"
              />
              <input
                type="number"
                min={filters.priceMin}
                max={500}
                value={filters.priceMax}
                onChange={(event) => setFilters((prev) => ({ ...prev, priceMax: Number(event.target.value) }))}
                className="w-1/2 rounded-2xl border border-slate-300 px-4 py-3"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Minimum quantity (kg)</label>
            <input
              type="number"
              min={1}
              value={filters.quantityMin}
              onChange={(event) => setFilters((prev) => ({ ...prev, quantityMin: Number(event.target.value) }))}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Harvest date from</label>
            <input
              type="date"
              value={filters.harvestDateFrom}
              onChange={(event) => setFilters((prev) => ({ ...prev, harvestDateFrom: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Harvest date to</label>
            <input
              type="date"
              value={filters.harvestDateTo}
              onChange={(event) => setFilters((prev) => ({ ...prev, harvestDateTo: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="organic-toggle"
              checked={filters.organic}
              onChange={(event) => setFilters((prev) => ({ ...prev, organic: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600"
            />
            <label htmlFor="organic-toggle" className="text-sm font-medium text-slate-700">Organic only</label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="delivery-toggle"
              checked={filters.delivery}
              onChange={(event) => setFilters((prev) => ({ ...prev, delivery: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600"
            />
            <label htmlFor="delivery-toggle" className="text-sm font-medium text-slate-700">Delivery available</label>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Grade</label>
            <select
              value={filters.grade}
              onChange={(event) => setFilters((prev) => ({ ...prev, grade: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
            >
              <option value="ALL">All</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((l: any) => (
          <article key={l.listing_id || l.id} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
            <div className="h-44 w-full bg-slate-100">
              {l.photo_url ? (
                <img src={l.photo_url} alt={l.crop.display_name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-400">No image</div>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-semibold text-slate-900">{l.crop.display_name}</p>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">{l.crop.category}</span>
              </div>
              <p className="mt-3 text-2xl font-semibold text-emerald-700">₹{l.price_per_kg_inr.toFixed(0)}/kg</p>
              <p className="mt-2 text-sm text-slate-500">{l.quantity_remaining_kg} kg available</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {l.delivery_available ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">Delivery</span> : null}
                {l.organic ? <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Organic</span> : null}
                {l.grade ? <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Grade {l.grade}</span> : null}
              </div>
              <div className="mt-4 flex gap-2">
                <a href={`/listings/${l.listing_id}`} className="inline-flex flex-1 items-center justify-center rounded-2xl bg-emerald-600 px-3 py-3 text-center text-sm font-semibold text-white transition hover:bg-emerald-700">Buy Now</a>
                <a href={`/listings/${l.listing_id}`} className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center text-sm font-semibold text-slate-900 transition hover:bg-slate-50">Offer</a>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div ref={loadMoreRef} className="h-8" />
      {q.isFetchingNextPage && <div className="py-4 text-center text-sm text-slate-600">Loading more…</div>}
      {!q.isFetching && items.length === 0 && <div className="py-8 text-center text-sm text-slate-500">No listings found. Try removing some filters.</div>}
    </div>
  );
}
