/**
 * Filtrage GPS trajet : rejette précision pourrie, micro-mouvements et sauts impossibles.
 */
export type RoutePointLike = {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number;
};

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

/** Précision max acceptée (m). */
export const MAX_ACCURACY_M = 45;
export const MAX_ACCURACY_FIRST_M = 80;
/** Distance min entre 2 points (km). */
export const MIN_STEP_KM = 0.008;
/** Vitesse max ~200 km/h + marge. */
export const MAX_SPEED_MPS = 55;
export const MIN_DT_MS = 800;

export type GpsSample = {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number | null;
  speed?: number | null;
};

export type GpsFilterReason =
  | 'ok'
  | 'bad_coords'
  | 'bad_accuracy'
  | 'too_close'
  | 'too_fast'
  | 'too_soon';

export type GpsFilterResult = {
  accept: boolean;
  reason: GpsFilterReason;
  distanceKm?: number;
  speedMps?: number;
};

export function isValidCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

export function evaluateGpsSample(
  previous: RoutePointLike | null,
  sample: GpsSample,
  opts?: { isFirst?: boolean }
): GpsFilterResult {
  if (!isValidCoord(sample.latitude, sample.longitude)) {
    return { accept: false, reason: 'bad_coords' };
  }

  const acc = sample.accuracy;
  const maxAcc = opts?.isFirst || !previous ? MAX_ACCURACY_FIRST_M : MAX_ACCURACY_M;
  if (acc != null && Number.isFinite(acc) && acc > maxAcc) {
    return { accept: false, reason: 'bad_accuracy' };
  }

  if (!previous) {
    return { accept: true, reason: 'ok' };
  }

  const dt = sample.timestamp - previous.timestamp;
  if (Number.isFinite(dt) && dt >= 0 && dt < MIN_DT_MS) {
    return { accept: false, reason: 'too_soon' };
  }

  const distanceKm = haversineKm(
    previous.latitude,
    previous.longitude,
    sample.latitude,
    sample.longitude
  );

  if (distanceKm < MIN_STEP_KM) {
    return { accept: false, reason: 'too_close' };
  }

  if (dt > 0) {
    const speedMps = (distanceKm * 1000) / (dt / 1000);
    if (speedMps > MAX_SPEED_MPS) {
      return { accept: false, reason: 'too_fast', distanceKm, speedMps };
    }
    if (sample.speed != null && sample.speed > MAX_SPEED_MPS + 10) {
      return { accept: false, reason: 'too_fast', distanceKm, speedMps: sample.speed };
    }
    return { accept: true, reason: 'ok', distanceKm, speedMps };
  }

  if (distanceKm > 2) {
    return { accept: false, reason: 'too_fast', distanceKm };
  }

  return { accept: true, reason: 'ok', distanceKm };
}

/** Distance en ignorant les sauts impossibles (réparation a posteriori). */
export function calculateFilteredRouteDistance(points: RoutePointLike[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  let last = points[0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const r = evaluateGpsSample(last, {
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: p.timestamp,
      accuracy: p.accuracy,
    });
    if (!r.accept && (r.reason === 'too_fast' || r.reason === 'bad_accuracy' || r.reason === 'bad_coords')) {
      continue;
    }
    if (!r.accept && (r.reason === 'too_close' || r.reason === 'too_soon')) {
      continue;
    }
    const d = haversineKm(last.latitude, last.longitude, p.latitude, p.longitude);
    if (d >= MIN_STEP_KM) {
      total += d;
      last = p;
    }
  }
  return Math.round(total * 1000) / 1000;
}
