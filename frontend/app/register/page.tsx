'use client';

import { useRouter } from 'next/navigation';
import { getLocaleLabel } from '../../lib/i18n';
import { useState } from 'react';

const languages = [
  { code: 'hi', native: 'हिंदी', english: 'Hindi' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
  { code: 'mr', native: 'मराठी', english: 'Marathi' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali' },
  { code: 'or', native: 'ଓଡ଼ିଆ', english: 'Odia' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam' },
  { code: 'as', native: 'অসমীয়া', english: 'Assamese' },
  { code: 'en', native: 'English', english: 'English' }
];

export default function RegisterLanguagePage() {
  const router = useRouter();
  const [selected, setSelected] = useState('');

  const handleLanguageSelect = (code: string) => {
    setSelected(code);
    window.localStorage.setItem('kd_lang', code);
    const secure = window.location.protocol === 'https:';
    document.cookie = `kd_lang=${code}; path=/; max-age=${31536000}; sameSite=lax${secure ? '; secure' : ''}`;
    router.push('/register/mobile');
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-5xl flex-col justify-center gap-10">
        <div className="text-center">
          <div className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 shadow-sm">
            KD
          </div>
          <p className="text-sm text-slate-500">KisanDirect</p>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Choose your language <span className="block text-slate-500">/ अपनी भाषा चुनें</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
            Select the language you want to use during farmer onboarding.
          </p>
        </div>

        <div className="mx-auto grid w-full max-w-3xl gap-4 sm:grid-cols-3">
          {languages.map((language) => {
            const isActive = selected === language.code;
            return (
              <button
                key={language.code}
                type="button"
                onClick={() => handleLanguageSelect(language.code)}
                className={`min-h-[100px] rounded-2xl border px-4 py-5 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  isActive ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-400'
                }`}
              >
                <span className="block text-2xl font-semibold leading-tight text-slate-900">{language.native}</span>
                <span className="mt-3 block text-sm text-slate-500">{language.english}</span>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
