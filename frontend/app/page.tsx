import Link from 'next/link';
import { getLocaleLabel } from '../lib/i18n';

const languages = ['en', 'hi', 'kn', 'te', 'ta', 'mr', 'gu', 'bn', 'or', 'pa', 'ml', 'as'] as const;

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">KisanDirect Phase 1</h1>
        <p className="mt-3 text-slate-600">
          Built for low-bandwidth Indian farmer onboarding, secure OTP auth, and escrow-ready marketplace flows.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/farmers/onboard" className="rounded-xl bg-emerald-600 px-4 py-3 text-white shadow-sm hover:bg-emerald-700">
            Farmer Onboarding
          </Link>
          <a href="/api/health" className="rounded-xl bg-slate-100 px-4 py-3 text-slate-800 hover:bg-slate-200">
            Backend Health Check
          </a>
        </div>
      </div>
      <div className="grid gap-2 rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Supported Languages</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {languages.map((lang) => (
            <Link key={lang} href={`/${lang}`} className="rounded-lg border border-slate-200 px-3 py-2 text-center text-sm text-slate-700 hover:bg-slate-50">
              {getLocaleLabel(lang)}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
