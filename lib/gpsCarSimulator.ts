/**
 * Simulateur de trajet voiture (tests uniquement).
 * Injecte des positions GPS le long d’un parcours, sans mock OS.
 */
import type { RoutePoint } from '@/lib/calculations';

export type SimCoord = { latitude: number; longitude: number };

/** Domicile Thorigné → Intermarché La Guerche (~44 km route). */
export const SIM_HOME: SimCoord = { latitude: 48.1572, longitude: -1.587 };
export const SIM_WORK: SimCoord = { latitude: 47.9475, longitude: -1.2238 };
/** Via Châteaugiron — trajet quotidien habituel (~44 km). */
export const SIM_VIA: SimCoord = { latitude: 48.04867, longitude: -1.50282 };

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

/** Profil vitesse selon progression 0–1 (ville → route → ville). */
export function speedLimitKmhForProgress(t: number): number {
  if (t < 0.08) return 30; // sortie quartier
  if (t < 0.18) return 50; // agglomération
  if (t < 0.35) return 80; // départementale
  if (t < 0.7) return 90; // voie rapide
  if (t < 0.88) return 70;
  if (t < 0.95) return 50;
  return 30; // arrivée
}

/**
 * Génère des points GPS à ~`speedKmh` le long de from→via→to.
 */
export function buildDrivingPoints(
  from: SimCoord,
  to: SimCoord,
  opts?: {
    speedKmh?: number;
    stepMeters?: number;
    startTs?: number;
    via?: SimCoord;
    /** Respecte les limitations variables (30/50/80/90). */
    respectSpeedLimits?: boolean;
    /** Insert des feux (arrêt ~12–18 s) tous les ~N km. */
    trafficLightsEveryKm?: number;
  }
): RoutePoint[] {
  const baseSpeed = opts?.speedKmh ?? 72;
  const stepM = opts?.stepMeters ?? 90;
  const startTs = opts?.startTs ?? Date.now();
  const via = opts?.via ?? SIM_VIA;
  const respect = opts?.respectSpeedLimits === true;
  const lightEvery = opts?.trafficLightsEveryKm ?? 0;
  const legs = [
    { a: from, b: via },
    { a: via, b: to },
  ];
  const points: RoutePoint[] = [];
  let tCursor = startTs;
  let kmSinceLight = 0;

  const pushPoint = (c: SimCoord, speedKmh: number, idleMs = 0) => {
    const speedMps = idleMs > 0 ? 0 : speedKmh / 3.6;
    if (points.length === 0) {
      points.push({
        latitude: c.latitude,
        longitude: c.longitude,
        timestamp: startTs,
        accuracy: 6 + Math.random() * 5,
        speed: speedMps,
      });
      tCursor = startTs;
      return;
    }
    const prev = points[points.length - 1];
    const dKm = haversineKmSim(
      { latitude: prev.latitude, longitude: prev.longitude },
      c
    );
    const ms =
      idleMs > 0
        ? idleMs
        : Math.max(800, (dKm / Math.max(speedKmh, 8)) * 3600 * 1000);
    tCursor = Math.round(tCursor + ms);
    points.push({
      latitude: c.latitude,
      longitude: c.longitude,
      timestamp: tCursor,
      accuracy: 6 + Math.random() * 5,
      speed: speedMps,
    });
    if (idleMs <= 0) kmSinceLight += dKm;
  };

  for (const leg of legs) {
    const legKm = haversineKmSim(leg.a, leg.b) * 1.08;
    const steps = Math.max(6, Math.ceil((legKm * 1000) / stepM));
    for (let i = 0; i <= steps; i++) {
      if (i === 0 && points.length > 0) continue;
      const t = i / steps;
      const c = waypointAlong(leg.a, leg.b, t);
      const speedKmh = respect ? speedLimitKmhForProgress(t) : baseSpeed;
      const factor = t < 0.08 || t > 0.92 ? 0.55 : t < 0.15 || t > 0.85 ? 0.75 : 1;
      pushPoint(c, speedKmh * factor);

      // Feu rouge : 3 points quasi immobiles
      if (lightEvery > 0 && kmSinceLight >= lightEvery && i > 2 && i < steps - 2) {
        kmSinceLight = 0;
        const stop = points[points.length - 1];
        for (let s = 0; s < 3; s++) {
          pushPoint(
            { latitude: stop.latitude, longitude: stop.longitude },
            0,
            5000 + Math.round(Math.random() * 4000)
          );
        }
      }
    }
  }

  return points;
}

/** Aller domicile→travail + pause + retour, avec limitations + feux. */
export function buildWorkCommuteRoundTrip(opts?: {
  startTs?: number;
  stepMeters?: number;
  /** Pause au travail (ms simulées, compressées). Défaut ~8 min. */
  workPauseMs?: number;
  trafficLightsEveryKm?: number;
}): RoutePoint[] {
  const startTs = opts?.startTs ?? Date.now();
  const stepMeters = opts?.stepMeters ?? 100;
  const lights = opts?.trafficLightsEveryKm ?? 7;
  const outbound = buildDrivingPoints(SIM_HOME, SIM_WORK, {
    startTs,
    stepMeters,
    respectSpeedLimits: true,
    trafficLightsEveryKm: lights,
  });
  const last = outbound[outbound.length - 1];
  const pauseMs = opts?.workPauseMs ?? 8 * 60 * 1000;
  const pausePoints: RoutePoint[] = [];
  let t = last.timestamp;
  const chunks = 4;
  for (let i = 1; i <= chunks; i++) {
    t = Math.round(last.timestamp + (pauseMs * i) / chunks);
    pausePoints.push({
      latitude: last.latitude,
      longitude: last.longitude,
      timestamp: t,
      accuracy: 8,
      speed: 0,
    });
  }
  const inbound = buildDrivingPoints(SIM_WORK, SIM_HOME, {
    startTs: t + 2000,
    stepMeters,
    respectSpeedLimits: true,
    trafficLightsEveryKm: lights,
  });
  return [...outbound, ...pausePoints, ...inbound];
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
