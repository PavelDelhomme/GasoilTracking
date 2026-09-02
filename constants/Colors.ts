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

export { PRESET_VEHICLES, VEHICLE_CATALOG, searchVehicles } from './vehicles';
export type { VehiclePreset } from './vehicles';

export const BACKGROUND_LOCATION_TASK = 'GASOIL_BACKGROUND_LOCATION';
