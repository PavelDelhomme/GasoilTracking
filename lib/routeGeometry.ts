/**
 * Géométrie de tracé pour cartes (historique / détail).
 * Complète les trajets sans GPS stocké via OSRM ou simulation domicile↔travail.
 */
import { parseRoutePoints, type RoutePoint } from '@/lib/calculations';
import { buildDrivingPoints, SIM_HOME, SIM_WORK, SIM_VIA } from '@/lib/gpsCarSimulator';
import { fetchDrivingRoute } from '@/lib/roadDistance';
import type { Place, Trip } from '@/types';

export type LatLng = { latitude: number; longitude: number };

/** Downsample en gardant début/fin (forme du trajet). */
export function downsampleRoute(pts: LatLng[], max = 160): LatLng[] {
  if (pts.length <= max) return pts;
  const out: LatLng[] = [pts[0]];
  const step = (pts.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) {
    out.push(pts[Math.round(i * step)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function matchPlace(places: Place[], name: string | null | undefined): Place | null {
  if (!name) return null;
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const scored = places
    .map((p) => {
      const pn = `${p.name} ${p.address || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let s = 0;
      if (pn.includes(n.slice(0, 12)) || n.includes(pn.slice(0, 8))) s += 3;
      if (/maison|domicile|home|thorign/.test(n) && p.kind === 'home') s += 5;
      if (/travail|bureau|inter|guerche|work/.test(n) && p.kind === 'work') s += 5;
      return { p, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored[0]?.p ?? null;
}

export function resolveTripEndpoints(
  trip: Trip,
  places: Place[]
): { from: LatLng; to: LatLng } | null {
  const pts = parseRoutePoints(trip.routePoints);
  if (pts.length >= 2) {
    return {
      from: { latitude: pts[0].latitude, longitude: pts[0].longitude },
      to: {
        latitude: pts[pts.length - 1].latitude,
        longitude: pts[pts.length - 1].longitude,
      },
    };
  }
  if (pts.length === 1) {
    const fromPlace = matchPlace(places, trip.originName);
    const toPlace = matchPlace(places, trip.destinationName);
    if (toPlace?.latitude != null && toPlace?.longitude != null) {
      return {
        from: { latitude: pts[0].latitude, longitude: pts[0].longitude },
        to: { latitude: toPlace.latitude, longitude: toPlace.longitude },
      };
    }
    if (fromPlace?.latitude != null && fromPlace?.longitude != null) {
      return {
        from: { latitude: fromPlace.latitude, longitude: fromPlace.longitude },
        to: { latitude: pts[0].latitude, longitude: pts[0].longitude },
      };
    }
  }
  const fromPlace = matchPlace(places, trip.originName);
  const toPlace = matchPlace(places, trip.destinationName);
  if (
    fromPlace?.latitude != null &&
    fromPlace?.longitude != null &&
    toPlace?.latitude != null &&
    toPlace?.longitude != null
  ) {
    return {
      from: { latitude: fromPlace.latitude, longitude: fromPlace.longitude },
      to: { latitude: toPlace.latitude, longitude: toPlace.longitude },
    };
  }
  // Fallback sim Brittany commute if labels look like home/work
  const o = (trip.originName || '').toLowerCase();
  const d = (trip.destinationName || '').toLowerCase();
  const oHome = /maison|domicile|home|thorign/.test(o);
  const dHome = /maison|domicile|home|thorign/.test(d);
  const oWork = /travail|bureau|inter|guerche|vitré|vitre/.test(o);
  const dWork = /travail|bureau|inter|guerche|vitré|vitre/.test(d);
  if (oHome && dWork) return { from: SIM_HOME, to: SIM_WORK };
  if (oWork && dHome) return { from: SIM_WORK, to: SIM_HOME };
  return null;
}

/**
 * Points à afficher sur la mini-carte : GPS stockés, sinon itinéraire OSRM/estimé.
 */
export async function getTripDisplayRoute(
  trip: Trip,
  places: Place[]
): Promise<LatLng[]> {
  const stored = parseRoutePoints(trip.routePoints);
  if (stored.length >= 2) {
    return downsampleRoute(
      stored.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
      180
    );
  }
  const ends = resolveTripEndpoints(trip, places);
  if (!ends) return stored.length === 1 ? [stored[0]] : [];

  try {
    const route = await fetchDrivingRoute(ends.from, ends.to);
    if (route.coordinates.length >= 2) {
      return downsampleRoute(route.coordinates, 180);
    }
  } catch {
    /* fallback sim */
  }
  const sim = buildDrivingPoints(ends.from, ends.to, {
    via: SIM_VIA,
    speedKmh: 70,
    stepMeters: 250,
  });
  return downsampleRoute(
    sim.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
    180
  );
}

/** Construit un JSON routePoints dense pour stockage (création trajet). */
export function buildStoredRouteJson(
  from: LatLng,
  to: LatLng,
  startTs: number,
  opts?: { speedKmh?: number }
): { json: string; points: RoutePoint[]; distanceHintKm: number } {
  const points = buildDrivingPoints(from, to, {
    speedKmh: opts?.speedKmh ?? 70,
    stepMeters: 120,
    startTs,
    via: SIM_VIA,
  });
  const json = JSON.stringify(
    points.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: p.timestamp,
    }))
  );
  const distanceHintKm =
    Math.round(
      points.reduce((acc, p, i) => {
        if (i === 0) return 0;
        const a = points[i - 1];
        const R = 6371;
        const dLat = ((p.latitude - a.latitude) * Math.PI) / 180;
        const dLon = ((p.longitude - a.longitude) * Math.PI) / 180;
        const x =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((a.latitude * Math.PI) / 180) *
            Math.cos((p.latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        return acc + R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
      }, 0) * 10
    ) / 10;
  return { json, points, distanceHintKm };
}
