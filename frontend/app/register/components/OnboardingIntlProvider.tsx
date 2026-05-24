'use client';

import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

interface OnboardingIntlProviderProps {
  locale: string;
  messages: Record<string, string>;
  children: ReactNode;
}

export default function OnboardingIntlProvider({ locale, messages, children }: OnboardingIntlProviderProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
