/**
 * Simulateur de trajet voiture (tests uniquement).
 * Injecte des positions GPS le long d’un parcours, sans mock OS.
 */
import type { RoutePoint } from '@/lib/calculations';

export type SimCoord = { latitude: number; longitude: number };

/** Domicile Thorigné → Intermarché La Guerche (~44 km route). */
export const SIM_HOME: SimCoord = { latitude: 48.1465, longitude: -1.579 };
export const SIM_WORK: SimCoord = { latitude: 47.9415, longitude: -1.2295 };
/** Via pour coller à ~44 km réels (pas vol d’oiseau). */
export const SIM_VIA: SimCoord = { latitude: 48.0, longitude: -1.55 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function waypointAlong(from: SimCoord, to: SimCoord, t: number): SimCoord {
  const bend = Math.sin(t * Math.PI) * 0.008;
  const jitter = (Math.random() - 0.5) * 0.00006;
  return {
    latitude: lerp(from.latitude, to.latitude, t) + bend * 0.25 + jitter,
    longitude: lerp(from.longitude, to.longitude, t) + bend + jitter * 0.7,
  };
}

export function haversineKmSim(a: SimCoord, b: SimCoord): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Génère des points GPS à ~`speedKmh` le long de from→via→to.
 */
export function buildDrivingPoints(
  from: SimCoord,
  to: SimCoord,
  opts?: { speedKmh?: number; stepMeters?: number; startTs?: number; via?: SimCoord }
): RoutePoint[] {
  const speedKmh = opts?.speedKmh ?? 72;
  const stepM = opts?.stepMeters ?? 90;
  const startTs = opts?.startTs ?? Date.now();
  const via = opts?.via ?? SIM_VIA;
  const legs = [
    { a: from, b: via },
    { a: via, b: to },
  ];
  const points: RoutePoint[] = [];
  let tCursor = startTs;

  for (const leg of legs) {
    const legKm = haversineKmSim(leg.a, leg.b) * 1.08;
    const steps = Math.max(6, Math.ceil((legKm * 1000) / stepM));
    const msPerStep = (stepM / 1000 / speedKmh) * 3600 * 1000;
    for (let i = 0; i <= steps; i++) {
      if (i === 0 && points.length > 0) continue; // éviter doublon au via
      const t = i / steps;
      const c = waypointAlong(leg.a, leg.b, t);
      const speedMps = speedKmh / 3.6;
      const factor = t < 0.08 || t > 0.92 ? 0.45 : t < 0.15 || t > 0.85 ? 0.7 : 1;
      points.push({
        latitude: c.latitude,
        longitude: c.longitude,
        timestamp: Math.round(tCursor + (points.length === 0 ? 0 : msPerStep)),
        accuracy: 6 + Math.random() * 5,
        speed: speedMps * factor,
      });
      if (points.length > 1) tCursor = points[points.length - 1].timestamp;
      else tCursor = startTs;
    }
  }
  // Recalcule timestamps linéaires (plus propre)
  const msPer = (stepM / 1000 / speedKmh) * 3600 * 1000;
  return points.map((p, i) => ({
    ...p,
    timestamp: Math.round(startTs + i * msPer),
  }));
}

export type CarSimProgress = {
  index: number;
  total: number;
  point: RoutePoint;
  done: boolean;
};

/**
 * Joue les points avec un délai accéléré (tests : 1 s réel ≈ N s trajet).
 * `timeScale` 20 = 20× plus rapide que le réel.
 */
export async function playCarSimulation(
  points: RoutePoint[],
  onPoint: (p: CarSimProgress) => Promise<void> | void,
  opts?: { timeScale?: number; signal?: { aborted: boolean } }
): Promise<void> {
  const scale = Math.max(1, opts?.timeScale ?? 25);
  for (let i = 0; i < points.length; i++) {
    if (opts?.signal?.aborted) return;
    await onPoint({
      index: i,
      total: points.length,
      point: points[i],
      done: i === points.length - 1,
    });
    if (i >= points.length - 1) break;
    const dt = points[i + 1].timestamp - points[i].timestamp;
    const wait = Math.max(40, Math.min(400, dt / scale));
    await new Promise((r) => setTimeout(r, wait));
  }
}
