'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import StepProgress from '../components/StepProgress';

export default function KycStep() {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/farmers/kyc/initiate');
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body?.error || 'Unable to start DigiLocker verification');
      }

      const payload = await response.json();
      if (!payload.redirectUrl) {
        throw new Error('Missing redirect URL');
      }

      window.location.href = payload.redirectUrl;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-lg flex-col justify-center gap-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <StepProgress activeStep={2} />
          <p className="mt-4 text-sm text-slate-500">{t('stepLabel', { step: 3 })}</p>
          <div className="mt-6 space-y-4">
            <h1 className="text-2xl font-semibold text-slate-900">{t('kycHeading')}</h1>
            <p className="text-sm leading-6 text-slate-600">{t('kycIntro')}</p>
          </div>

          <div className="mt-8 grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
            {[
              { icon: '🪪', label: t('kycDetailAadhaar') },
              { icon: '📇', label: t('kycDetailPan') },
              { icon: '🌾', label: t('kycDetailLand') }
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-4 rounded-2xl bg-white px-4 py-4 shadow-sm">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-xl">{item.icon}</span>
                <span className="text-base font-medium text-slate-900">{item.label}</span>
              </div>
            ))}
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleVerify}
            disabled={isLoading}
            className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-sky-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-3">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {t('submitting')}
              </span>
            ) : (
              t('verifyWithDigiLocker')
            )}
          </button>

          <div className="mt-4 text-center text-sm">
            <a href="#" className="font-semibold text-slate-700 underline underline-offset-4 hover:text-slate-900">
              {t('uploadManually')}
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
