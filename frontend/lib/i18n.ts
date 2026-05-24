export const LOCALES = ['en', 'hi', 'kn', 'te', 'ta', 'mr', 'gu', 'bn', 'or', 'pa', 'ml', 'as'] as const;
export type Locale = (typeof LOCALES)[number];

const labels: Record<Locale, string> = {
  en: 'English',
  hi: 'हिंदी',
  kn: 'ಕನ್ನಡ',
  te: 'తెలుగు',
  ta: 'தமிழ்',
  mr: 'मराठी',
  gu: 'ગુજરાતી',
  bn: 'বাংলা',
  or: 'ଓଡ଼ିଆ',
  pa: 'ਪੰਜਾਬੀ',
  ml: 'മലയാളം',
  as: 'অসমীয়া'
};

export function getLocaleLabel(locale: Locale | string) {
  return labels[locale as Locale] ?? locale;
}
