'use client';

import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../../../store/useAuthStore';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function submitFarmer(data: FormData) {
  const payload = Object.fromEntries(data.entries());
  const res = await fetch(`${API_BASE_URL}/api/farmers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error('Failed to submit farmer onboarding');
  }

  return res.json();
}

export default function FarmerOnboardingPage() {
  const [status, setStatus] = useState<string | null>(null);
  const { phone } = useAuthStore();
  const mutation = useMutation<any, Error, FormData>({
    mutationFn: (formData: FormData) => submitFarmer(formData),
    onSuccess: () => setStatus('Farmer onboarding started successfully'),
    onError: () => setStatus('Unable to submit onboarding, try again')
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Farmer Onboarding</h1>
        <p className="mt-2 text-slate-600">Farmers can onboard with localized information and KisanID generation.</p>
        <form
          className="mt-6 grid gap-4"
          onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            mutation.mutate(formData);
          }}
        >
          <input name="name" placeholder="Farmer name" required className="rounded-xl border px-4 py-3" />
          <input name="phone" defaultValue={phone ?? ''} placeholder="Phone number" required className="rounded-xl border px-4 py-3" />
          <input name="stateCode" placeholder="State code (KA, MH)" required className="rounded-xl border px-4 py-3" />
          <input name="district" placeholder="District" required className="rounded-xl border px-4 py-3" />
          <input name="village" placeholder="Village" required className="rounded-xl border px-4 py-3" />
          <select name="language" defaultValue="en" className="rounded-xl border px-4 py-3">
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="kn">Kannada</option>
          </select>
          <button type="submit" className="rounded-xl bg-slate-900 px-4 py-3 text-white hover:bg-slate-800">
            Start Onboarding
          </button>
        </form>
        {status ? <p className="mt-4 text-green-700">{status}</p> : null}
      </div>
    </div>
  );
}
