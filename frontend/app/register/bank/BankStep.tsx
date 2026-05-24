'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import StepProgress from '../components/StepProgress';

const bankSchema = z.object({
  account_number: z.string().min(9, 'Account number is too short').max(18, 'Account number is too long'),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code')
});

type BankFormValues = z.infer<typeof bankSchema>;

export default function BankStep() {
  const t = useTranslations();
  const [bankName, setBankName] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState<{ kisanId?: string; message: string } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<BankFormValues>({
    resolver: zodResolver(bankSchema),
    defaultValues: { account_number: '', ifsc: '' }
  });

  const ifscValue = watch('ifsc');
  const normalizedIfsc = useMemo(() => ifscValue.toUpperCase(), [ifscValue]);

  useEffect(() => {
    setValue('ifsc', normalizedIfsc);
  }, [normalizedIfsc, setValue]);

  useEffect(() => {
    if (normalizedIfsc.length !== 11) {
      setBankName(null);
      setLookupError(null);
      return;
    }

    const controller = new AbortController();

    const fetchBank = async () => {
      setBankName(null);
      setLookupError(null);
      try {
        const response = await fetch(`https://ifsc.razorpay.com/${normalizedIfsc}`, {
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error('Not found');
        }
        const data = await response.json();
        setBankName(`${data.BANK ?? 'Bank'} • ${data.BRANCH ?? 'Branch'}`);
      } catch {
        if (!controller.signal.aborted) {
          setLookupError(t('bankLookupError'));
        }
      }
    };

    fetchBank();

    return () => controller.abort();
  }, [normalizedIfsc, t]);

  const onSubmit = async (values: BankFormValues) => {
    setIsLoading(true);
    setSuccess(null);

    try {
      const response = await fetch('/api/v1/farmers/bank/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body?.error || 'Unable to add bank account');
      }

      const payload = await response.json();
      setSuccess({ kisanId: payload.kisanId, message: payload.message ?? t('bankPending') });
    } catch (error) {
      setSuccess({ message: error instanceof Error ? error.message : t('fetchError') });
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
        <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-lg flex-col justify-center gap-8">
          <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
            <div className="mb-4 text-5xl">🎉</div>
            <h1 className="text-3xl font-semibold text-slate-900">{t('successTitle')}</h1>
            <p className="mt-3 text-slate-600">{success.message}</p>
            {success.kisanId && (
              <div className="mx-auto mt-8 inline-flex flex-col items-center rounded-3xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-left">
                <span className="text-sm uppercase text-emerald-700">{t('kisanIdLabel')}</span>
                <span className="mt-2 text-2xl font-semibold text-slate-900">{success.kisanId}</span>
              </div>
            )}
            <a
              href="/"
              className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white hover:bg-emerald-700"
            >
              {t('dashboardCta')}
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-lg flex-col justify-center gap-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <StepProgress activeStep={3} />
          <p className="mt-4 text-sm text-slate-500">{t('stepLabel', { step: 4 })}</p>
          <div className="mt-6">
            <h1 className="text-2xl font-semibold text-slate-900">{t('accountNumberLabel')}</h1>
            <p className="mt-2 text-sm text-slate-500">{t('ifscLabel')}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
            <div>
              <label htmlFor="account_number" className="block text-sm font-medium text-slate-700">
                {t('accountNumberLabel')}
              </label>
              <input
                id="account_number"
                type="text"
                autoComplete="off"
                inputMode="numeric"
                className={`mt-2 w-full rounded-2xl border px-4 py-4 text-lg outline-none transition ${
                  errors.account_number ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-100'
                }`}
                {...register('account_number')}
              />
              {errors.account_number && <p className="mt-2 text-sm text-red-600">{t('invalidAccount')}</p>}
            </div>

            <div>
              <label htmlFor="ifsc" className="block text-sm font-medium text-slate-700">
                {t('ifscLabel')}
              </label>
              <input
                id="ifsc"
                type="text"
                autoComplete="off"
                className={`mt-2 w-full rounded-2xl border px-4 py-4 text-lg uppercase outline-none transition ${
                  errors.ifsc ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-100'
                }`}
                {...register('ifsc')}
              />
              {(bankName || lookupError) && (
                <p className="mt-3 text-sm font-medium text-slate-700">{bankName ?? lookupError}</p>
              )}
              {errors.ifsc && <p className="mt-2 text-sm text-red-600">{t('invalidIfsc')}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-3">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {t('submitting')}
                </span>
              ) : (
                t('verifyBank')
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
