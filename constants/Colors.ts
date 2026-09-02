export const Colors = {
  light: {
    text: '#1a1a2e',
    textSecondary: '#6b7280',
    background: '#f8fafc',
    card: '#ffffff',
    tint: '#e94560',
    tabIconDefault: '#9ca3af',
    tabIconSelected: '#e94560',
    border: '#e5e7eb',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    primary: '#16213e',
    accent: '#e94560',
  },
  dark: {
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    background: '#0f0f1a',
    card: '#1a1a2e',
    tint: '#e94560',
    tabIconDefault: '#64748b',
    tabIconSelected: '#e94560',
    border: '#2d2d44',
    success: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
    primary: '#16213e',
    accent: '#e94560',
  },
};

export const FUEL_TYPE_LABELS: Record<string, string> = {
  diesel: 'Diesel / Gasoil',
  essence: 'Essence',
  gpl: 'GPL',
  electrique: 'Électrique',
};

export const PRESET_VEHICLES = [
  { brand: 'Renault', model: 'Clio IV', year: 2015, consumption: 4.5, fuel: 'diesel' as const, tank: 45 },
  { brand: 'Peugeot', model: '206', year: 2003, consumption: 6.2, fuel: 'essence' as const, tank: 50 },
  { brand: 'Citroën', model: '2CV', year: 1985, consumption: 7.5, fuel: 'essence' as const, tank: 38 },
  { brand: 'Volkswagen', model: 'Golf VII', year: 2018, consumption: 4.8, fuel: 'diesel' as const, tank: 50 },
  { brand: 'Toyota', model: 'Yaris Hybrid', year: 2022, consumption: 3.8, fuel: 'essence' as const, tank: 36 },
  { brand: 'Mercedes', model: 'W123', year: 1982, consumption: 9.5, fuel: 'diesel' as const, tank: 65 },
  { brand: 'Fiat', model: 'Panda', year: 2010, consumption: 5.1, fuel: 'essence' as const, tank: 35 },
  { brand: 'BMW', model: 'E30', year: 1989, consumption: 8.8, fuel: 'essence' as const, tank: 55 },
];

export const BACKGROUND_LOCATION_TASK = 'GASOIL_BACKGROUND_LOCATION';
