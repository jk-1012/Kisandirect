'use client';

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import StepProgress from '../components/StepProgress';

const otpSchema = z.object({
  otp: z.string().length(6, 'Please enter all 6 digits')
});

type OtpFormValues = z.infer<typeof otpSchema>;

export default function OtpStep() {
  const router = useRouter();
  const t = useTranslations();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(600);
  const [resendDelay, setResendDelay] = useState<number>(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [phone, setPhone] = useState('');
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors }
  } = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' }
  });

  const otpValue = useMemo(() => digits.join(''), [digits]);

  useEffect(() => {
    setValue('otp', otpValue);
  }, [otpValue, setValue]);

  useEffect(() => {
    const storedPhone = window.localStorage.getItem('kd_phone');
    if (storedPhone) {
      setPhone(storedPhone);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
      setResendDelay((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const focusInput = (index: number) => {
    inputsRef.current[index]?.focus();
  };

  const handleDigitChange = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 1);
    setDigits((current) => {
      const next = [...current];
      next[index] = sanitized;
      return next;
    });

    if (sanitized && index < 5) {
      focusInput(index + 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      setTimeout(() => focusInput(5), 0);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      focusInput(index - 1);
    }
  };

  const handleResend = async () => {
    if (resendDelay > 0 || !phone) return;

    setIsResending(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/v1/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || 'Unable to resend OTP');
      }

      setResendDelay(60);
      setCountdown(600);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setIsResending(false);
    }
  };

  const onSubmit = async ({ otp }: OtpFormValues) => {
    if (!phone) {
      setSubmitError('Phone number is missing from the previous step.');
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/v1/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to verify OTP');
      }

      const cookieResponse = await fetch('/api/auth/set-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: payload.accessToken, refreshToken: payload.refreshToken })
      });

      if (!cookieResponse.ok) {
        throw new Error('Unable to save session');
      }

      router.push('/register/kyc');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Verification failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-lg flex-col justify-center gap-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <StepProgress activeStep={1} />
          <p className="mt-4 text-sm text-slate-500">{t('stepLabel', { step: 2 })}</p>
          <div className="mt-6">
            <h1 className="text-2xl font-semibold text-slate-900">{t('enterOtpTitle')}</h1>
            <p className="mt-2 text-sm text-slate-500">{t('otpHelp')}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
            <div className="grid grid-cols-6 gap-2">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(event) => handleDigitChange(index, event.target.value)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  ref={(element) => {
                    inputsRef.current[index] = element;
                  }}
                  className="h-14 min-h-[44px] rounded-2xl border border-slate-300 bg-slate-50 text-center text-xl font-semibold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              ))}
            </div>

            <input type="hidden" {...register('otp')} />
            {errors.otp && <p className="text-sm text-red-600">{t('invalidOtp')}</p>}
            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">{t('otpTimerLabel')}:</p>
                <p className="text-lg font-semibold text-slate-900">{Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}</p>
              </div>

              <button
                type="button"
                disabled={resendDelay > 0 || isResending}
                onClick={handleResend}
                className="text-sm font-semibold text-slate-700 underline-offset-4 transition hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {resendDelay > 0 ? t('resendOtpWait', { seconds: resendDelay }) : t('resendOtp')}
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-3">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {t('verifying')}
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
