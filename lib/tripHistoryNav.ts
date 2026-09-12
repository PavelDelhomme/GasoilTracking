import { toLocalYmd } from '@/lib/dates';

export type TripHistoryFilter = 'all' | 'today' | 'sinceFill';

export type TripHistoryNavParams = {
  tab: 'history';
  filter: TripHistoryFilter;
  vehicleId?: string;
};

/** Href expo-router vers l’historique trajets (filtres + véhicule). */
export function tripHistoryNav(opts?: {
  filter?: TripHistoryFilter;
  vehicleId?: number | null;
}): { pathname: '/(tabs)/trip'; params: TripHistoryNavParams } {
  const params: TripHistoryNavParams = {
    tab: 'history',
    filter: opts?.filter ?? 'all',
  };
  if (opts?.vehicleId != null && Number.isFinite(opts.vehicleId) && opts.vehicleId > 0) {
    params.vehicleId = String(opts.vehicleId);
  }
  return { pathname: '/(tabs)/trip', params };
}

export function tripStartedOnYmd(startTime: string, ymd: string): boolean {
  try {
    return toLocalYmd(new Date(startTime)) === ymd;
  } catch {
    return String(startTime || '').slice(0, 10) === ymd;
  }
}

export function tripIsToday(startTime: string, now = new Date()): boolean {
  return tripStartedOnYmd(startTime, toLocalYmd(now));
}

export function parseHistoryFilter(raw: unknown): TripHistoryFilter | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s === 'today' || s === 'sinceFill' || s === 'all') return s;
  return null;
}

export function parseVehicleIdParam(raw: unknown): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}
