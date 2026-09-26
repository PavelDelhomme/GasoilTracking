import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';

type Theme = {
  scheme: 'light' | 'dark';
  colors: {
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    border: string;
    accent: string;
    accentLight: string;
    success: string;
    warning: string;
    error: string;
  };
};

const lightColors = {
  background: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  accent: '#3b82f6',
  accentLight: '#dbeafe',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};

const darkColors = {
  background: '#0f172a',
  card: '#1e293b',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  border: '#334155',
  accent: '#3b82f6',
  accentLight: '#1e3a5f',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [scheme, setScheme] = useState<'light' | 'dark'>(systemScheme || 'dark');

  useEffect(() => {
    if (systemScheme) setScheme(systemScheme);
  }, [systemScheme]);

  const theme: Theme = {
    scheme,
    colors: scheme === 'dark' ? darkColors : lightColors,
  };

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
