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
  if (!year || year < 1970) return 1.04;
  const age = Math.max(0, nowYear - year);
  if (age <= 8) return 1;
  if (age <= 15) return 1 + (age - 8) * 0.005;
  if (age <= 25) return 1.035 + (age - 15) * 0.004;
  return Math.min(1.08, 1.075 + (age - 25) * 0.002);
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

export const REAL_WORLD_MARGIN = 1.04;

export type ConsumptionContext = {
  ascentM?: number;
  gears?: number | null;
  learnedFactor?: number;
  /** Vitesse moyenne en mouvement (km/h) — impact conso */
  avgSpeedKmh?: number;
  /** Part du temps quasi à l’arrêt (0–1) — embouteillage / feux */
  idleRatio?: number;
  /** Facteur accélérations / freinages (1 = neutre) */
  accelFactor?: number;
  /** Facteur stop-and-go (1 = neutre) */
  stopGoFactor?: number;
};

/** Surconso vs vitesse : ville lente / autoroute rapide. */
export function speedConsumptionFactor(avgKmh: number): number {
  if (!Number.isFinite(avgKmh) || avgKmh <= 0) return 1;
  if (avgKmh < 15) return 1.14;
  if (avgKmh < 35) return 1.08;
  if (avgKmh < 55) return 1.04;
  if (avgKmh < 95) return 1;
  if (avgKmh < 115) return 1.06;
  if (avgKmh < 130) return 1.12;
  return 1.16;
}

/** Surconso moteur tournant à l’arrêt / très lent (bouchons). */
export function trafficIdleFactor(idleRatio: number): number {
  if (!Number.isFinite(idleRatio) || idleRatio <= 0) return 1;
  const r = Math.max(0, Math.min(0.85, idleRatio));
  return 1 + r * 0.12;
}

/**
 * Style de conduite (accélérations / freinages) à partir des vitesses segment.
 * Compte les |Δv| élevés → jusqu’à +12 %.
 */
export function accelAggressionFactor(points: PointLike[]): number {
  if (points.length < 3) return 1;
  let samples = 0;
  let harsh = 0;
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 2];
    const b = points[i - 1];
    const c = points[i];
    const dt1 = b.timestamp - a.timestamp;
    const dt2 = c.timestamp - b.timestamp;
    if (dt1 <= 0 || dt1 > 30_000 || dt2 <= 0 || dt2 > 30_000) continue;
    const d1 = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    const d2 = haversineKm(b.latitude, b.longitude, c.latitude, c.longitude);
    const v1 = d1 / (dt1 / 3_600_000);
    const v2 = d2 / (dt2 / 3_600_000);
    if (v1 > 130 || v2 > 130) continue;
    samples += 1;
    const dv = Math.abs(v2 - v1);
    // ~+15 km/h en < 4 s ≈ agressif
    if (dv >= 15 && Math.min(dt1, dt2) < 4000) harsh += 1;
  }
  if (samples < 8) return 1;
  const ratio = Math.min(0.45, harsh / samples);
  return 1 + ratio * 0.14;
}

/**
 * Stop-and-go : transitions arrêt → mouvement (feux / bouchon).
 * Jusqu’à +10 %.
 */
export function stopAndGoFactor(points: PointLike[]): number {
  if (points.length < 4) return 1;
  let transitions = 0;
  let wasIdle = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.timestamp - a.timestamp;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 180_000) continue;
    const dKm = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    const speedKmh = dKm / (dt / 3600000);
    const idle = speedKmh < 5;
    if (wasIdle && !idle) transitions += 1;
    wasIdle = idle;
  }
  const per10kmProxy = Math.min(25, transitions); // borne
  return 1 + (per10kmProxy / 25) * 0.1;
}

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
  const speed = speedConsumptionFactor(ctx.avgSpeedKmh ?? 0);
  const traffic = trafficIdleFactor(ctx.idleRatio ?? 0);
  const accel = ctx.accelFactor && ctx.accelFactor > 0.9 ? ctx.accelFactor : 1;
  const stopGo = ctx.stopGoFactor && ctx.stopGoFactor > 0.9 ? ctx.stopGoFactor : 1;
  // Évite l’empilement agressif — l’estimation reste proche de la conso véhicule
  // (recalibrée à chaque plein). Les facteurs ne font qu’un léger ajustement trajet.
  const situational = Math.min(1.1, speed * traffic * accel * stopGo);
  const l100 = base * age * gear * REAL_WORLD_MARGIN * learned * elev * situational;
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

/** Ratio de temps passé quasi à l’arrêt (< 5 km/h) sur la durée totale du tracé. */
export function idleRatioFromPoints(points: PointLike[]): number {
  if (points.length < 2) return 0;
  let totalMs = 0;
  let idleMs = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.timestamp - a.timestamp;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 180_000) continue;
    totalMs += dt;
    const dKm = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    const speedKmh = dKm / (dt / 3600000);
    if (speedKmh < 5) idleMs += dt;
  }
  if (totalMs <= 0) return 0;
  return Math.min(0.9, idleMs / totalMs);
}

export type RouteSpeedStats = {
  avgKmh: number;
  maxKmh: number;
  minKmh: number;
  /** Vitesse estimée au point i (0 au départ) */
  pointSpeedsKmh: number[];
};

/** Plafond réaliste FR (hors erreur GPS). */
export const MAX_PLAUSIBLE_SPEED_KMH = 130;

/**
 * Vitesses segment par segment (device `speed` ou haversine/dt).
 * Ignore arrêt / outliers / sauts GPS.
 */
export function computeRouteSpeedStats(
  points: Array<PointLike & { speed?: number }>
): RouteSpeedStats {
  const pointSpeedsKmh = points.map(() => 0);
  const samples: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    let kmh = 0;
    if (b.speed != null && Number.isFinite(b.speed) && b.speed >= 0) {
      kmh = b.speed * 3.6;
    } else {
      const dt = b.timestamp - a.timestamp;
      if (!Number.isFinite(dt) || dt <= 0 || dt > 180_000) continue;
      const dKm = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
      // Saut GPS : > 400 m en < 3 s → ignorer
      if (dKm > 0.4 && dt < 3000) continue;
      kmh = dKm / (dt / 3_600_000);
    }
    if (kmh < 3 || kmh > MAX_PLAUSIBLE_SPEED_KMH) continue;
    pointSpeedsKmh[i] = Math.round(kmh * 10) / 10;
    samples.push(kmh);
  }
  if (!samples.length) {
    return { avgKmh: 0, maxKmh: 0, minKmh: 0, pointSpeedsKmh };
  }
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    avgKmh: Math.round((sum / samples.length) * 10) / 10,
    maxKmh: Math.round(Math.max(...samples) * 10) / 10,
    minKmh: Math.round(Math.min(...samples) * 10) / 10,
    pointSpeedsKmh,
  };
}

/** Affichage durée trajet (minutes → « 42 min » / « 1 h 05 »). */
export function formatDurationMinutes(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

export async function fetchElevationAscentM(points: PointLike[]): Promise<number> {
  if (points.length < 2) return 0;
  const step = Math.max(1, Math.ceil(points.length / 40));
  const sample = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const lats = sample.map((p) => p.latitude.toFixed(5)).join(',');
  const lons = sample.map((p) => p.longitude.toFixed(5)).join(',');
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), 4000);
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'GasoilTracking/1.4' },
      signal: ctrl?.signal,
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
  } finally {
    clearTimeout(timer);
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

/**
 * Calibration conso à partir des pleins complets (L/100 réelle vs catalogue).
 * Retourne un facteur ~0.85–1.55 ou null si pas assez d’échantillons.
 */
export function learnFactorFromFullFillUps(
  fillUps: Array<{ liters: number; distanceSinceLastKm: number | null; isFull: boolean }>,
  catalogueL100: number
): number | null {
  const base = catalogueL100 > 0 ? catalogueL100 : 7.5;
  const ratios: number[] = [];
  for (const f of fillUps) {
    if (!f.isFull) continue;
    const d = f.distanceSinceLastKm;
    if (d == null || d < 40 || f.liters < 5) continue;
    const real = (f.liters / d) * 100;
    if (!Number.isFinite(real) || real < 2 || real > 25) continue;
    ratios.push(real / base);
  }
  if (ratios.length < 2) return null;
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return Math.round(Math.min(1.55, Math.max(0.85, avg)) * 1000) / 1000;
}
