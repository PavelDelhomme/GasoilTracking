/** Stats HUD live (Maps / Trajet) — colonnes numériques, pas de parse GPS. */

export type LiveTripHudStats = {
  distanceKm: number;
  durationMinutes: number;
  avgKmh: number;
};

export function liveTripHudStats(
  trip: { distanceKm: number; startTime: string } | null | undefined,
  nowMs = Date.now()
): LiveTripHudStats | null {
  if (!trip) return null;
  const startMs = Date.parse(trip.startTime);
  const durationMinutes = Number.isFinite(startMs)
    ? Math.max(0, (nowMs - startMs) / 60000)
    : 0;
  const avgKmh =
    durationMinutes > 0.05 && trip.distanceKm > 0
      ? (trip.distanceKm / durationMinutes) * 60
      : 0;
  return {
    distanceKm: trip.distanceKm,
    durationMinutes,
    avgKmh,
  };
}

export function formatDurationMin(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
