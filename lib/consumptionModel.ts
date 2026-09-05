/**
 * Modèle de consommation : âge véhicule, dénivelé, marge réaliste, vitesse en mouvement.
 */
import type { Vehicle } from '@/types';

export type PointLike = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function vehicleAgeFactor(year: number, nowYear = new Date().getFullYear()): number {
  if (!year || year < 1970) return 1.08;
  const age = Math.max(0, nowYear - year);
  if (age <= 3) return 1;
  if (age <= 8) return 1 + (age - 3) * 0.012;
  if (age <= 15) return 1.06 + (age - 8) * 0.018;
  return Math.min(1.35, 1.186 + (age - 15) * 0.015);
}

export function transmissionFactor(gears?: number | null): number {
  if (gears == null || gears <= 0) return 1;
  if (gears <= 4) return 1.06;
  if (gears === 5) return 1.02;
  return 1;
}

export function elevationFactor(ascentM: number, distanceKm: number): number {
  if (ascentM <= 0 || distanceKm <= 0) return 1;
  const per10km = (ascentM / Math.max(distanceKm, 1)) * 10;
  return Math.min(1.45, 1 + (per10km / 100) * 0.08);
}

export const REAL_WORLD_MARGIN = 1.18;

export type ConsumptionContext = {
  ascentM?: number;
  gears?: number | null;
  learnedFactor?: number;
};

export function estimateTripFuelLiters(
  vehicle: Vehicle,
  distanceKm: number,
  ctx: ConsumptionContext = {}
): number {
  if (distanceKm <= 0) return 0;
  const base = vehicle.consumptionPer100 > 0 ? vehicle.consumptionPer100 : 7.5;
  const age = vehicleAgeFactor(vehicle.year);
  const gear = transmissionFactor(ctx.gears ?? vehicle.transmissionGears);
  const learned =
    ctx.learnedFactor && ctx.learnedFactor > 0.5
      ? ctx.learnedFactor
      : vehicle.consumptionLearnFactor && vehicle.consumptionLearnFactor > 0.5
        ? vehicle.consumptionLearnFactor
        : 1;
  const elev = elevationFactor(ctx.ascentM ?? 0, distanceKm);
  const l100 = base * age * gear * REAL_WORLD_MARGIN * learned * elev;
  return Math.round(((distanceKm * l100) / 100) * 100) / 100;
}

export function movingDurationMinutes(points: PointLike[]): number {
  if (points.length < 2) return 0;
  let ms = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.timestamp - a.timestamp;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 180_000) continue;
    const dKm = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    const speedKmh = dKm / (dt / 3600000);
    if (speedKmh < 5) continue;
    ms += dt;
  }
  return ms / 60000;
}

export function averageMovingSpeedKmh(distanceKm: number, points: PointLike[]): number {
  const mins = movingDurationMinutes(points);
  if (mins <= 0 || distanceKm <= 0) return 0;
  return (distanceKm / mins) * 60;
}

export async function fetchElevationAscentM(points: PointLike[]): Promise<number> {
  if (points.length < 2) return 0;
  const step = Math.max(1, Math.ceil(points.length / 40));
  const sample = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const lats = sample.map((p) => p.latitude.toFixed(5)).join(',');
  const lons = sample.map((p) => p.longitude.toFixed(5)).join(',');
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'GasoilTracking/1.4' },
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { elevation?: number[] };
    const elev = data.elevation;
    if (!Array.isArray(elev) || elev.length < 2) return 0;
    let ascent = 0;
    for (let i = 1; i < elev.length; i++) {
      const d = elev[i] - elev[i - 1];
      if (d > 1) ascent += d;
    }
    return Math.round(ascent);
  } catch {
    return 0;
  }
}

export function learnedFactorFromGauge(
  estimatedLitersBurned: number,
  gaugeDropLiters: number
): number {
  if (estimatedLitersBurned <= 0.2 || gaugeDropLiters <= 0) return 1;
  const raw = gaugeDropLiters / estimatedLitersBurned;
  return Math.min(1.55, Math.max(0.85, raw));
}
