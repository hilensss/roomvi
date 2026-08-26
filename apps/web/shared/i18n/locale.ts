export const SUPPORTED_LOCALES = ['ru', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_STORAGE_KEY = 'roomvi-locale';

const parsedRubPerUsd = Number(process.env.NEXT_PUBLIC_RUB_PER_USD ?? 90);

export const RUB_PER_USD =
  Number.isFinite(parsedRubPerUsd) && parsedRubPerUsd > 0
    ? parsedRubPerUsd
    : 90;

export function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'en';
}

export function formatCurrency(valueInRubles: number, locale: Locale) {
  if (locale === 'en') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(valueInRubles / RUB_PER_USD);
  }

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(valueInRubles);
}

export function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'ru-RU').format(
    value,
  );
}

export function formatDate(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
