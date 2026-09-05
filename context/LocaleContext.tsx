import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_COUNTRY_CODE,
  EUROPE_COUNTRIES,
  getCountry,
  type EuropeCountry,
} from '@/constants/europe';
import {
  convertAmount,
  formatFuelPrice,
  formatMoney,
  getFxRates,
  getRatesUpdatedAt,
  loadCachedFxRates,
  refreshFxRates,
  type FxRates,
} from '@/lib/currency';
import {
  getBudgets,
  getFillUps,
  getTrips,
  getVehicles,
  updateBudget,
  updateFillUpMoney,
  updateTrip,
  updateVehicle,
} from '@/lib/database';
import { setMoneyFormatter } from '@/lib/calculations';
import { setAppDateLocale } from '@/lib/dates';
import { reverseCountryCode } from '@/lib/geocode';
import { getCurrentLocation } from '@/lib/locationService';
import { Platform } from 'react-native';

const COUNTRY_KEY = 'gasoil_country_code';
/** Si '1', le pays a été choisi manuellement — pas d’auto GPS. */
const COUNTRY_MANUAL_KEY = 'gasoil_country_manual';

type LocaleContextType = {
  country: EuropeCountry;
  countryCode: string;
  currency: string;
  locale: string;
  rates: FxRates;
  ratesDate: string | null;
  countries: typeof EUROPE_COUNTRIES;
  /** true si l’utilisateur a choisi le pays à la main */
  countryManual: boolean;
  setCountryCode: (code: string, convertExisting?: boolean) => Promise<void>;
  /** Détecte le pays via GPS (Nominatim) et applique la devise. */
  detectCountryFromLocation: (opts?: { force?: boolean }) => Promise<string | null>;
  refreshRates: () => Promise<void>;
  format: (amount: number) => string;
  formatPerLiter: (price: number) => string;
  moneySymbol: string;
};

const LocaleContext = createContext<LocaleContextType | null>(null);

async function convertStoredAmounts(from: string, to: string, rates: FxRates) {
  if (from === to) return;

  const vehicles = await getVehicles();
  for (const v of vehicles) {
    await updateVehicle(v.id, {
      defaultFuelPrice: convertAmount(v.defaultFuelPrice, from, to, rates),
    });
  }

  const budgets = await getBudgets();
  for (const b of budgets) {
    await updateBudget(b.id, {
      amount: convertAmount(b.amount, from, to, rates),
      spent: convertAmount(b.spent, from, to, rates),
    });
  }

  const trips = await getTrips(undefined, { includeRejected: true });
  for (const t of trips) {
    await updateTrip(t.id, {
      estimatedCost: convertAmount(t.estimatedCost, from, to, rates),
    });
  }

  const fillUps = await getFillUps();
  for (const f of fillUps) {
    await updateFillUpMoney(
      f.id,
      convertAmount(f.pricePerLiter, from, to, rates),
      convertAmount(f.totalCost, from, to, rates)
    );
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [countryCode, setCountryCodeState] = useState(DEFAULT_COUNTRY_CODE);
  const [countryManual, setCountryManual] = useState(false);
  const [rates, setRates] = useState<FxRates>(getFxRates());
  const [ratesDate, setRatesDate] = useState<string | null>(getRatesUpdatedAt());

  const country = useMemo(() => getCountry(countryCode), [countryCode]);

  const applyFormatter = useCallback((c: EuropeCountry) => {
    setMoneyFormatter((amount: number) => formatMoney(amount, c.currency, c.locale, c.symbol));
    setAppDateLocale(c.locale);
  }, []);

  const detectCountryFromLocation = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!opts?.force) {
        const manual = await AsyncStorage.getItem(COUNTRY_MANUAL_KEY);
        if (manual === '1') return null;
        // Auto silencieux uniquement au premier lancement (pas de pays stocké)
        const already = await AsyncStorage.getItem(COUNTRY_KEY);
        if (already) return null;
      }
      try {
        const loc = await getCurrentLocation();
        if (!loc?.coords) return null;
        const cc = await reverseCountryCode(loc.coords.latitude, loc.coords.longitude);
        if (!cc) return null;
        const match = EUROPE_COUNTRIES.find((c) => c.code === cc);
        if (!match) return null;
        const prevStored = await AsyncStorage.getItem(COUNTRY_KEY);
        if (prevStored === match.code) return match.code;
        const convert = Boolean(opts?.force && prevStored && prevStored !== match.code);
        const prev = getCountry(prevStored || DEFAULT_COUNTRY_CODE);
        if (convert && prev.currency !== match.currency) {
          await convertStoredAmounts(prev.currency, match.currency, getFxRates());
        }
        setCountryCodeState(match.code);
        applyFormatter(match);
        await AsyncStorage.setItem(COUNTRY_KEY, match.code);
        if (opts?.force) {
          await AsyncStorage.removeItem(COUNTRY_MANUAL_KEY);
          setCountryManual(false);
        }
        return match.code;
      } catch {
        return null;
      }
    },
    [applyFormatter]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadCachedFxRates();
      if (cancelled) return;
      setRates(getFxRates());
      setRatesDate(getRatesUpdatedAt());
      const [stored, manual] = await Promise.all([
        AsyncStorage.getItem(COUNTRY_KEY),
        AsyncStorage.getItem(COUNTRY_MANUAL_KEY),
      ]);
      const isManual = manual === '1';
      if (!cancelled) setCountryManual(isManual);

      let code =
        stored && EUROPE_COUNTRIES.some((c) => c.code === stored)
          ? stored
          : DEFAULT_COUNTRY_CODE;

      // Locale appareil (ex. fr-FR → FR) si aucun pays stocké
      if (!stored && typeof Intl !== 'undefined') {
        try {
          const loc =
            Intl.DateTimeFormat().resolvedOptions().locale ||
            (Platform.OS === 'web' && typeof navigator !== 'undefined'
              ? navigator.language
              : '');
          const region = loc.split(/[-_]/)[1]?.toUpperCase();
          if (region && EUROPE_COUNTRIES.some((c) => c.code === region)) {
            code = region;
          }
        } catch {
          /* ignore */
        }
      }

      if (!cancelled) {
        setCountryCodeState(code);
        applyFormatter(getCountry(code));
        if (!stored) await AsyncStorage.setItem(COUNTRY_KEY, code);
      }
      try {
        await refreshFxRates();
        if (!cancelled) {
          setRates(getFxRates());
          setRatesDate(getRatesUpdatedAt());
        }
      } catch {
        /* offline */
      }
      // Auto GPS si pas de choix manuel (ne convertit que si pays différent)
      if (!cancelled && !isManual) {
        void detectCountryFromLocation({ force: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyFormatter, detectCountryFromLocation]);

  const setCountryCode = useCallback(
    async (code: string, convertExisting = true) => {
      const next = getCountry(code);
      const prev = getCountry(countryCode);
      if (convertExisting && prev.currency !== next.currency) {
        await convertStoredAmounts(prev.currency, next.currency, getFxRates());
      }
      setCountryCodeState(code);
      applyFormatter(next);
      await AsyncStorage.setItem(COUNTRY_KEY, code);
      await AsyncStorage.setItem(COUNTRY_MANUAL_KEY, '1');
      setCountryManual(true);
    },
    [countryCode, applyFormatter]
  );

  const refreshRates = useCallback(async () => {
    const r = await refreshFxRates();
    setRates(r);
    setRatesDate(getRatesUpdatedAt());
  }, []);

  const format = useCallback(
    (amount: number) => formatMoney(amount, country.currency, country.locale, country.symbol),
    [country]
  );

  const formatPerLiter = useCallback(
    (price: number) => formatFuelPrice(price, country.currency, country.locale, country.symbol),
    [country]
  );

  const value = useMemo(
    () => ({
      country,
      countryCode,
      currency: country.currency,
      locale: country.locale,
      rates,
      ratesDate,
      countries: EUROPE_COUNTRIES,
      countryManual,
      setCountryCode,
      detectCountryFromLocation,
      refreshRates,
      format,
      formatPerLiter,
      moneySymbol: country.symbol,
    }),
    [
      country,
      countryCode,
      rates,
      ratesDate,
      countryManual,
      setCountryCode,
      detectCountryFromLocation,
      refreshRates,
      format,
      formatPerLiter,
    ]
  );

  // Toujours fournir le contexte (formatteur € par défaut tant que non hydraté)
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
