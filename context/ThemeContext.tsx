import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';

type Scheme = 'light' | 'dark';

type ThemeContextType = {
  scheme: Scheme;
  colors: (typeof Colors)['light'];
  toggleScheme: () => void;
  setScheme: (s: Scheme) => void;
  hydrated: boolean;
};

const STORAGE_KEY = 'gasoil_theme_scheme';
const ThemeContext = createContext<ThemeContextType | null>(null);

/** Toujours 'light' au 1er rendu (SSR + client) → évite React #418/#422 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setSchemeState] = useState<Scheme>('light');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark') {
          setSchemeState(stored);
        } else {
          const sys = Appearance.getColorScheme();
          setSchemeState(sys === 'dark' ? 'dark' : 'light');
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setScheme = useCallback((s: Scheme) => {
    setSchemeState(s);
    void AsyncStorage.setItem(STORAGE_KEY, s);
  }, []);

  const toggleScheme = useCallback(() => {
    setSchemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      void AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      scheme,
      colors: Colors[scheme],
      toggleScheme,
      setScheme,
      hydrated,
    }),
    [scheme, toggleScheme, setScheme, hydrated]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      scheme: 'light' as Scheme,
      colors: Colors.light,
      toggleScheme: () => {},
      setScheme: (_s: Scheme) => {},
      hydrated: false,
    };
  }
  return ctx;
}
