'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import StepProgress from '../components/StepProgress';

const phoneSchema = z.object({
  phone: z.string().regex(/^[6-9][0-9]{9}$/, 'Invalid Indian mobile number')
});

type PhoneFormValues = z.infer<typeof phoneSchema>;

export default function MobileStep() {
  const router = useRouter();
  const t = useTranslations();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' }
  });

  const onSubmit = async (data: PhoneFormValues) => {
    setSubmitError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: data.phone })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || 'Unable to send OTP');
      }

      window.localStorage.setItem('kd_phone', data.phone);
      window.localStorage.setItem('kd_lang', window.localStorage.getItem('kd_lang') ?? 'en');
      const secure = window.location.protocol === 'https:';
      document.cookie = `kd_phone=${data.phone}; path=/; max-age=${600}; sameSite=lax${secure ? '; secure' : ''}`;

      router.push('/register/otp');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-lg flex-col justify-center gap-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <StepProgress activeStep={0} />
          <p className="mt-4 text-sm text-slate-500">{t('stepLabel', { step: 1 })}</p>
          <div className="mt-6 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-4xl">📱</div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{t('enterMobileTitle')}</h1>
              <p className="mt-2 text-sm text-slate-500">{t('phoneLabel')}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
            <label className="block text-sm font-medium text-slate-700" htmlFor="phone">
              {t('phoneLabel')}
            </label>
            <div className="flex items-stretch gap-2">
              <span className="inline-flex items-center rounded-2xl border border-slate-300 bg-slate-100 px-4 text-base font-medium text-slate-700">
                +91
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                pattern="[6-9][0-9]{9}"
                placeholder={t('mobilePlaceholder')}
                className={`min-h-[56px] flex-1 rounded-2xl border px-4 text-lg outline-none transition ${
                  errors.phone ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                }`}
                {...register('phone')}
              />
            </div>
            {errors.phone && <p className="text-sm text-red-600">{t('invalidPhone')}</p>}
            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-3">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {t('sending')}
                </span>
              ) : (
                t('sendOtp')
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
