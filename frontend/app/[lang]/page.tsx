import { getLocaleLabel, LOCALES } from '../../lib/i18n';
import Link from 'next/link';

interface Props {
  params: { lang: string };
}

export default function LocalizedPage({ params }: Props) {
  const lang = LOCALES.includes(params.lang as any) ? params.lang : 'en';

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">{getLocaleLabel(lang)} | KisanDirect</h1>
        <p className="mt-3 text-slate-600">Localized farmer-first onboarding for low-bandwidth India.</p>
        <div className="mt-6 space-y-3">
          <Link href="/" className="rounded-xl bg-slate-900 px-4 py-3 text-white hover:bg-slate-800">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
