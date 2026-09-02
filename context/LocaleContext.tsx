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

const COUNTRY_KEY = 'gasoil_country_code';

type LocaleContextType = {
  country: EuropeCountry;
  countryCode: string;
  currency: string;
  locale: string;
  rates: FxRates;
  ratesDate: string | null;
  countries: typeof EUROPE_COUNTRIES;
  setCountryCode: (code: string, convertExisting?: boolean) => Promise<void>;
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
  const [rates, setRates] = useState<FxRates>(getFxRates());
  const [ratesDate, setRatesDate] = useState<string | null>(getRatesUpdatedAt());

  const country = useMemo(() => getCountry(countryCode), [countryCode]);

  const applyFormatter = useCallback((c: EuropeCountry) => {
    setMoneyFormatter((amount: number) => formatMoney(amount, c.currency, c.locale, c.symbol));
    setAppDateLocale(c.locale);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadCachedFxRates();
      if (cancelled) return;
      setRates(getFxRates());
      setRatesDate(getRatesUpdatedAt());
      const stored = await AsyncStorage.getItem(COUNTRY_KEY);
      const code =
        stored && EUROPE_COUNTRIES.some((c) => c.code === stored)
          ? stored
          : DEFAULT_COUNTRY_CODE;
      if (!cancelled) {
        setCountryCodeState(code);
        applyFormatter(getCountry(code));
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
    })();
    return () => {
      cancelled = true;
    };
  }, [applyFormatter]);

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
      setCountryCode,
      refreshRates,
      format,
      formatPerLiter,
      moneySymbol: country.symbol,
    }),
    [country, countryCode, rates, ratesDate, setCountryCode, refreshRates, format, formatPerLiter]
  );

  // Toujours fournir le contexte (formatteur € par défaut tant que non hydraté)
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
