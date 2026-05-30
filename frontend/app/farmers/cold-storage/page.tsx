'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, ThermometerSnowflake, Navigation, Calendar, Box, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function ColdStorageMapPage() {
  const [selectedFacility, setSelectedFacility] = useState<any>(null);
  const [bookingDetails, setBookingDetails] = useState({
    date: '',
    durationDays: 7,
    quantityMt: 1
  });
  const [isBooking, setIsBooking] = useState(false);

  const { data: facilities, isLoading } = useQuery({
    queryKey: ['cold_storages'],
    queryFn: async () => {
      const res = await fetch('http://localhost:4000/api/v1/cold-storage?lat=28.6139&lng=77.2090&radius=50');
      if (!res.ok) throw new Error('Failed to fetch facilities');
      return res.json();
    }
  });

  const handleBooking = async () => {
    setIsBooking(true);
    try {
      const exitDate = new Date(bookingDetails.date);
      exitDate.setDate(exitDate.getDate() + bookingDetails.durationDays);

      const res = await fetch('http://localhost:4000/api/v1/cold-storage/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          facility_id: selectedFacility.id,
          entry_date: bookingDetails.date,
          exit_date: exitDate.toISOString().split('T')[0],
          quantity_mt: bookingDetails.quantityMt,
          crop_type: 'Produce' // Mock crop type
        })
      });
      if (!res.ok) throw new Error('Booking failed');
      alert('Cold storage slot booked successfully! You will receive a WhatsApp confirmation.');
      setSelectedFacility(null);
    } catch (error) {
      alert('Failed to book cold storage. Please try again later.');
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex-none bg-emerald-900 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Find Cold Storage</h1>
            <p className="text-sm text-emerald-100">NABARD Registered Facilities near you</p>
          </div>
          <Link href="/farmers/dashboard" className="text-emerald-100 hover:text-white font-medium text-sm">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar List */}
        <aside className="w-full max-w-md flex-none overflow-y-auto border-r border-slate-200 bg-white">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <ThermometerSnowflake className="h-5 w-5 text-emerald-600" />
              {facilities?.length || 0} Facilities Found
            </h2>
          </div>
          
          <div className="divide-y divide-slate-100">
            {isLoading ? (
              <div className="p-8 text-center text-slate-500">Loading map data...</div>
            ) : facilities?.map((facility: any) => (
              <div 
                key={facility.id} 
                className={`cursor-pointer p-4 transition-colors hover:bg-slate-50 ${selectedFacility?.id === facility.id ? 'bg-emerald-50 ring-1 ring-emerald-200' : ''}`}
                onClick={() => setSelectedFacility(facility)}
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-slate-900">{facility.name}</h3>
                  <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    <ShieldCheck className="h-3 w-3" /> NABARD
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-500 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {facility.distance_km} km away • {facility.location}
                </p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <div className="font-medium text-emerald-700">₹{facility.price_per_mt_inr}/MT per day</div>
                  <div className="text-slate-600">{facility.available_mt} MT Available</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Map Area (Mocked visual) */}
        <main className="relative flex-1 bg-slate-200 flex flex-col">
          <div className="absolute inset-0 bg-[url('https://maps.mapmyindia.com/images/map_bg.png')] bg-cover bg-center opacity-50"></div>
          
          <div className="absolute inset-0 flex items-center justify-center p-4">
            {/* Mocking a map pin for the selected facility */}
            {selectedFacility ? (
              <div className="animate-bounce-short">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl ring-4 ring-white">
                  <ThermometerSnowflake className="h-6 w-6" />
                  <div className="absolute -bottom-2 left-1/2 -ml-2 h-4 w-4 rotate-45 bg-emerald-600"></div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-white/80 p-4 text-center shadow-lg backdrop-blur text-slate-600 font-medium">
                Select a facility from the list to view on map
              </div>
            )}
          </div>

          {/* Booking Panel Overlay */}
          {selectedFacility && (
            <div className="absolute bottom-6 left-6 right-6 lg:left-auto lg:w-96 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200 z-10 animate-slide-up">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-xl text-slate-900">{selectedFacility.name}</h3>
                <button onClick={() => setSelectedFacility(null)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Entry Date</label>
                  <input type="date" value={bookingDetails.date} onChange={e => setBookingDetails({...bookingDetails, date: e.target.value})} className="w-full rounded-lg border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Duration (Days)</label>
                    <input type="number" min="1" value={bookingDetails.durationDays} onChange={e => setBookingDetails({...bookingDetails, durationDays: Number(e.target.value)})} className="w-full rounded-lg border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Space (MT)</label>
                    <input type="number" min="1" max={selectedFacility.available_mt} value={bookingDetails.quantityMt} onChange={e => setBookingDetails({...bookingDetails, quantityMt: Number(e.target.value)})} className="w-full rounded-lg border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500" />
                  </div>
                </div>
                
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mt-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Estimated Cost:</span>
                    <span className="font-bold text-lg text-slate-900">
                      ₹{(bookingDetails.durationDays * bookingDetails.quantityMt * selectedFacility.price_per_mt_inr).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button className="flex items-center justify-center rounded-xl border border-slate-300 bg-white p-3 text-slate-700 hover:bg-slate-50">
                    <Navigation className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={handleBooking}
                    disabled={isBooking || !bookingDetails.date}
                    className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isBooking ? 'Booking...' : 'Book Space'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
