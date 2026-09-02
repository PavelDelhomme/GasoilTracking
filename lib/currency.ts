import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CurrencyCode } from '@/constants/europe';
import { API_URL } from '@/lib/api';

const RATES_KEY = 'gasoil_fx_rates_v1';
const RATES_AT_KEY = 'gasoil_fx_rates_at';

export type FxRates = Record<string, number>; // 1 EUR = rate[currency]

/** Taux de change vs EUR (Frankfurter / BCE). Fallback offline. */
const FALLBACK_RATES: FxRates = {
  EUR: 1,
  GBP: 0.86,
  CHF: 0.94,
  NOK: 11.5,
  SEK: 11.2,
  DKK: 7.46,
  ISK: 150,
  PLN: 4.3,
  CZK: 25.2,
  HUF: 395,
  RON: 4.97,
  BGN: 1.96,
  HRK: 7.53,
  TRY: 36,
  UAH: 43,
  RSD: 117,
  BAM: 1.96,
  ALL: 100,
  MKD: 61.5,
  MDL: 19.5,
};

let cachedRates: FxRates = { ...FALLBACK_RATES };
let ratesUpdatedAt: string | null = null;

export function getFxRates(): FxRates {
  return cachedRates;
}

export function getRatesUpdatedAt(): string | null {
  return ratesUpdatedAt;
}

export async function loadCachedFxRates(): Promise<void> {
  try {
    const [raw, at] = await Promise.all([
      AsyncStorage.getItem(RATES_KEY),
      AsyncStorage.getItem(RATES_AT_KEY),
    ]);
    if (raw) {
      const parsed = JSON.parse(raw) as FxRates;
      cachedRates = { ...FALLBACK_RATES, ...parsed, EUR: 1 };
    }
    ratesUpdatedAt = at;
  } catch {
    /* ignore */
  }
}

async function fetchFxJson(url: string): Promise<{ rates?: FxRates; date?: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as { rates?: FxRates; date?: string };
  } catch {
    return null;
  }
}

/**
 * Rafraîchit les taux.
 * Web prod : via notre API (même origine → pas de CORS).
 * Fallback : Frankfurter.dev (l’ancien .app renvoie un 301 sans CORS).
 */
export async function refreshFxRates(): Promise<FxRates> {
  try {
    const data =
      (await fetchFxJson(`${API_URL}/api/fx/latest`)) ||
      (await fetchFxJson('https://api.frankfurter.dev/v1/latest?base=EUR'));
    if (!data) throw new Error('FX unavailable');
    const rates = { ...FALLBACK_RATES, ...(data.rates || {}), EUR: 1 };
    cachedRates = rates;
    ratesUpdatedAt = data.date || new Date().toISOString().slice(0, 10);
    await AsyncStorage.setItem(RATES_KEY, JSON.stringify(rates));
    await AsyncStorage.setItem(RATES_AT_KEY, ratesUpdatedAt);
    return rates;
  } catch {
    cachedRates = { ...FALLBACK_RATES, ...cachedRates, EUR: 1 };
    return cachedRates;
  }
}

/** Convertit un montant d’une devise vers une autre (via EUR). */
export function convertAmount(
  amount: number,
  from: CurrencyCode | string,
  to: CurrencyCode | string,
  rates: FxRates = cachedRates
): number {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;
  const fromRate = rates[from] ?? FALLBACK_RATES[from] ?? 1;
  const toRate = rates[to] ?? FALLBACK_RATES[to] ?? 1;
  const inEur = amount / fromRate;
  return Math.round(inEur * toRate * 1000) / 1000;
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode | string,
  locale: string,
  symbolFallback?: string
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'ISK' || currency === 'HUF' ? 0 : 2,
    }).format(amount);
  } catch {
    const sym = symbolFallback || currency;
    const digits = currency === 'ISK' || currency === 'HUF' ? 0 : 2;
    return `${amount.toFixed(digits)} ${sym}`;
  }
}

export function formatFuelPrice(
  pricePerLiter: number,
  currency: CurrencyCode | string,
  locale: string,
  symbolFallback?: string
): string {
  try {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 3,
      minimumFractionDigits: 2,
    }).format(pricePerLiter)} ${symbolFallback || currency}/L`;
  } catch {
    return `${pricePerLiter.toFixed(3)} ${symbolFallback || currency}/L`;
  }
}
