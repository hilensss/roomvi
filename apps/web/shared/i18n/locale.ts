export const SUPPORTED_LOCALES = ['ru', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_STORAGE_KEY = 'roomvi-locale';

const parsedRubPerUsd = Number(process.env.NEXT_PUBLIC_RUB_PER_USD ?? 90);
const parsedUsdBudgetStep = Number(
  process.env.NEXT_PUBLIC_USD_BUDGET_STEP ?? 50,
);

export const RUB_PER_USD =
  Number.isFinite(parsedRubPerUsd) && parsedRubPerUsd > 0
    ? parsedRubPerUsd
    : 90;

export const USD_BUDGET_STEP =
  Number.isFinite(parsedUsdBudgetStep) && parsedUsdBudgetStep > 0
    ? Math.round(parsedUsdBudgetStep)
    : 50;

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

export function getDisplayCurrencyAmount(
  valueInRubles: number,
  locale: Locale,
) {
  return Math.round(locale === 'en' ? valueInRubles / RUB_PER_USD : valueInRubles);
}

export function getRublesFromDisplayCurrency(
  value: number,
  locale: Locale,
) {
  return Math.round(locale === 'en' ? value * RUB_PER_USD : value);
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
