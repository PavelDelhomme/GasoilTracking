/**
 * Réduit le snapshot cloud : les tracés GPS font exploser le JSON
 * (erreur 413 / « hors ligne » à tort).
 */
import { compactRoutePoints, parseRoutePoints, type RoutePoint } from '@/lib/calculations';
import type { AppDataSnapshot } from '@/lib/dataSnapshot';
import type { Trip } from '@/types';

const SYNC_SOFT_MAX_BYTES = 900_000;
const SYNC_HARD_MAX_BYTES = 1_600_000;

function stripPoint(p: RoutePoint): RoutePoint {
  const out: RoutePoint = {
    latitude: Math.round(p.latitude * 1e5) / 1e5,
    longitude: Math.round(p.longitude * 1e5) / 1e5,
    timestamp: p.timestamp,
  };
  if (p.speed != null && Number.isFinite(p.speed)) {
    out.speed = Math.round(p.speed * 10) / 10;
  }
  return out;
}

function downsamplePoints(points: RoutePoint[], max: number): RoutePoint[] {
  if (points.length <= max) return points.map(stripPoint);
  const out: RoutePoint[] = [stripPoint(points[0])];
  const step = (points.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) {
    out.push(stripPoint(points[Math.round(i * step)]));
  }
  out.push(stripPoint(points[points.length - 1]));
  return out;
}

export function slimRoutePointsJson(routePoints: string, maxPoints: number): string {
  const pts = compactRoutePoints(parseRoutePoints(routePoints || '[]'));
  return JSON.stringify(downsamplePoints(pts, maxPoints));
}

function slimTrip(trip: Trip, maxPoints: number): Trip {
  return {
    ...trip,
    routePoints: slimRoutePointsJson(trip.routePoints || '[]', maxPoints),
  };
}

/** Compacte les tracés : trajet actif plus dense, historique allégé. */
export function slimSnapshotForSync(snap: AppDataSnapshot): AppDataSnapshot {
  return {
    ...snap,
    trips: (snap.trips || []).map((t) => slimTrip(t, t.isActive ? 180 : 72)),
  };
}

/**
 * Filet si le JSON dépasse encore la limite proxy (~1 Mo).
 * Garde le détail des trajets récents, réduit le reste à départ+arrivée.
 */
export function slimSnapshotAggressive(snap: AppDataSnapshot): AppDataSnapshot {
  const trips = [...(snap.trips || [])].sort((a, b) =>
    String(b.startTime || '').localeCompare(String(a.startTime || ''))
  );
  return {
    ...snap,
    trips: trips.map((t, i) => {
      if (t.isActive) return slimTrip(t, 120);
      if (i < 24) return slimTrip(t, 36);
      const pts = parseRoutePoints(t.routePoints || '[]');
      const keep =
        pts.length <= 2 ? pts.map(stripPoint) : [stripPoint(pts[0]), stripPoint(pts[pts.length - 1])];
      return { ...t, routePoints: JSON.stringify(keep) };
    }),
  };
}

export function snapshotJsonSize(snap: AppDataSnapshot): number {
  try {
    return JSON.stringify({ data: snap }).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Choisit le niveau de compression pour rester sous les limites HTTP. */
export function prepareSnapshotForPush(snap: AppDataSnapshot): AppDataSnapshot {
  const soft = slimSnapshotForSync(snap);
  if (snapshotJsonSize(soft) <= SYNC_SOFT_MAX_BYTES) return soft;
  const hard = slimSnapshotAggressive(snap);
  if (snapshotJsonSize(hard) <= SYNC_HARD_MAX_BYTES) return hard;
  return hard;
}

export function isPayloadTooLargeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /413|volumineux|too large|payload/i.test(msg);
}
