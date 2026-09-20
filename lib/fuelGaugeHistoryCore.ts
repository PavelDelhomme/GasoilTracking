import type { FuelGaugeReading, FuelGaugeSource } from '@/types';

export const FUEL_GAUGE_SOURCE_LABELS: Record<FuelGaugeSource, string> = {
  trip_start: 'Départ trajet',
  trip_end: 'Arrivée trajet',
  fill_up: 'Plein',
  manual: 'Saisie',
  model_burn: 'Conso estimée',
  recompute: 'Recalcul',
};

const DEDUP_WINDOW_MS = 20_000;
const DEDUP_LITERS_EPS = 0.05;

export function sameTripId(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  const na = a == null ? null : a;
  const nb = b == null ? null : b;
  return na === nb;
}

export function shouldSkipDuplicateReading(
  last: Pick<FuelGaugeReading, 'source' | 'tripId' | 'liters' | 'recordedAt'> | null | undefined,
  next: { source: FuelGaugeSource; tripId?: number | null; liters: number; recordedAt: string }
): boolean {
  if (!last) return false;
  if (last.source !== next.source) return false;
  if (!sameTripId(last.tripId, next.tripId)) return false;
  const lastAt = Date.parse(last.recordedAt);
  const nextAt = Date.parse(next.recordedAt);
  if (!Number.isFinite(lastAt) || !Number.isFinite(nextAt)) return false;
  if (Math.abs(nextAt - lastAt) > DEDUP_WINDOW_MS) return false;
  return Math.abs(last.liters - next.liters) < DEDUP_LITERS_EPS;
}
