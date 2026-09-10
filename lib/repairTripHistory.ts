/**
 * Répare / complète l’historique trajet :
 * - crée l’aller manquant si un retour domicile existe le même jour
 * - remplit routePoints vides (via Châteaugiron pour le trajet travail)
 * - purge micro-trajets inutiles (0 km)
 */
import {
  addTrackedKm,
  createTrip,
  deleteTrip,
  getPlaces,
  getRecurringRoutes,
  getTrips,
  getVehicleById,
  updateRecurringRoute,
  updateTrip,
} from '@/lib/database';
import {
  computeRouteSpeedStats,
  estimateTripFuelLiters,
  fetchElevationProfile,
} from '@/lib/consumptionModel';
import { parseRoutePoints, haversineDistance } from '@/lib/calculations';
import { SIM_HOME, SIM_WORK } from '@/lib/gpsCarSimulator';
import { fetchDrivingRoute, VIA_CHATEAUGIRON } from '@/lib/roadDistance';
import {
  buildStoredRouteJson,
  resolveTripEndpoints,
} from '@/lib/routeGeometry';
import type { Place, Trip } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REPAIR_KEY = 'gasoil_route_repair_v4';
const TINY_PURGE_KEY = 'gasoil_tiny_purge_v1';
const SPEED_FIX_KEY = 'gasoil_speed_fix_v1';

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function isHomeLabel(s: string | null | undefined): boolean {
  return /maison|domicile|home|thorign/i.test(s || '');
}

function isWorkLabel(s: string | null | undefined): boolean {
  return /travail|bureau|inter|guerche|vitré|vitre|faubourg/i.test(s || '');
}

function isCommutePair(a: string | null | undefined, b: string | null | undefined): boolean {
  return (isHomeLabel(a) && isWorkLabel(b)) || (isWorkLabel(a) && isHomeLabel(b));
}

function localIsoOnDay(ymd: string, hour: number, minute: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d, hour, minute, 0, 0);
  return dt.toISOString();
}

/** Vitesse max brute (sans plafond) pour détecter timestamps absurdes. */
function rawMaxSpeedKmh(
  pts: Array<{ latitude: number; longitude: number; timestamp: number }>
): number {
  let max = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].timestamp - pts[i - 1].timestamp;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 180_000) continue;
    const dKm = haversineDistance(
      pts[i - 1].latitude,
      pts[i - 1].longitude,
      pts[i].latitude,
      pts[i].longitude
    );
    if (dKm > 0.4 && dt < 3000) continue;
    const kmh = dKm / (dt / 3_600_000);
    if (kmh > max) max = kmh;
  }
  return max;
}

function stampRouteAtSpeed(
  coords: Array<{ latitude: number; longitude: number }>,
  startTs: number,
  durationMinutes: number
): Array<{ latitude: number; longitude: number; timestamp: number }> {
  const n = coords.length;
  const durationMs = Math.max(10, durationMinutes) * 60_000;
  return coords.map((c, i) => ({
    latitude: c.latitude,
    longitude: c.longitude,
    timestamp: startTs + Math.round((i / Math.max(1, n - 1)) * durationMs),
  }));
}

async function fillEmptyRoute(trip: Trip, places: Place[]): Promise<boolean> {
  const pts = parseRoutePoints(trip.routePoints);
  if (pts.length >= 2) return false;
  const ends = resolveTripEndpoints(trip, places);
  if (!ends) return false;

  const commute = isCommutePair(trip.originName, trip.destinationName);
  let distanceKm = trip.distanceKm;
  let routeJson = trip.routePoints;
  try {
    const route = await fetchDrivingRoute(ends.from, ends.to, {
      via: commute ? VIA_CHATEAUGIRON : undefined,
    });
    if (route.coordinates.length >= 2) {
      const startTs = new Date(trip.startTime).getTime() || Date.now();
      const built = buildStoredRouteJson(ends.from, ends.to, startTs, { speedKmh: 68 });
      // Préférer géométrie OSRM réelle + timestamps réalistes
      const n = route.coordinates.length;
      const durationMs = (route.durationMinutes ?? Math.max(30, distanceKm * 1.1)) * 60_000;
      const stamped = route.coordinates.map((c, i) => ({
        latitude: c.latitude,
        longitude: c.longitude,
        timestamp: startTs + Math.round((i / Math.max(1, n - 1)) * durationMs),
      }));
      routeJson = JSON.stringify(stamped);
      distanceKm = route.distanceKm || built.distanceHintKm;
    }
  } catch {
    const startTs = new Date(trip.startTime).getTime() || Date.now();
    const built = buildStoredRouteJson(ends.from, ends.to, startTs, { speedKmh: 68 });
    routeJson = built.json;
    distanceKm = built.distanceHintKm;
  }

  const vehicle = await getVehicleById(trip.vehicleId);
  const elevPts = parseRoutePoints(routeJson);
  const altitudes = await fetchElevationProfile(elevPts);
  let ascent = 0;
  for (let i = 1; i < altitudes.length; i++) {
    const d = altitudes[i] - altitudes[i - 1];
    if (d > 1) ascent += d;
  }
  ascent = Math.round(ascent);
  const speeds = computeRouteSpeedStats(elevPts);
  const fuel = vehicle
    ? estimateTripFuelLiters(vehicle, distanceKm, {
        ascentM: ascent,
        altitudes: altitudes.length >= 2 ? altitudes : undefined,
        points: elevPts,
        learnedFactor: vehicle.consumptionLearnFactor,
        avgSpeedKmh: speeds.avgKmh || 68,
      })
    : trip.estimatedFuelUsed;
  const cost = vehicle ? Math.round(fuel * vehicle.defaultFuelPrice * 100) / 100 : trip.estimatedCost;

  await updateTrip(trip.id, {
    routePoints: routeJson,
    distanceKm,
    estimatedFuelUsed: Math.round(fuel * 100) / 100,
    estimatedCost: cost,
  });
  return true;
}

async function ensureOutboundForDay(
  vehicleId: number,
  ymd: string,
  places: Place[],
  trips: Trip[]
): Promise<boolean> {
  const dayTrips = trips.filter((t) => dayKey(t.startTime) === ymd);
  const hasOutbound = dayTrips.some(
    (t) => isHomeLabel(t.originName) && isWorkLabel(t.destinationName)
  );
  const hasReturn = dayTrips.some(
    (t) => isWorkLabel(t.originName) && isHomeLabel(t.destinationName)
  );
  if (hasOutbound || !hasReturn) return false;

  const vehicle = await getVehicleById(vehicleId);
  if (!vehicle) return false;

  const home = places.find((p) => p.kind === 'home') || {
    latitude: SIM_HOME.latitude,
    longitude: SIM_HOME.longitude,
    name: 'Domicile',
  };
  const work = places.find((p) => p.kind === 'work') || {
    latitude: SIM_WORK.latitude,
    longitude: SIM_WORK.longitude,
    name: 'Travail',
  };
  const from = {
    latitude: home.latitude ?? SIM_HOME.latitude,
    longitude: home.longitude ?? SIM_HOME.longitude,
  };
  const to = {
    latitude: work.latitude ?? SIM_WORK.latitude,
    longitude: work.longitude ?? SIM_WORK.longitude,
  };
  const startTime = localIsoOnDay(ymd, 7, 25);
  const startTs = new Date(startTime).getTime();
  const route = await fetchDrivingRoute(from, to, { via: VIA_CHATEAUGIRON });
  const durationMin = route.durationMinutes ?? 50;
  const endTime = new Date(startTs + durationMin * 60_000).toISOString();
  const n = route.coordinates.length;
  const stamped = route.coordinates.map((c, i) => ({
    latitude: c.latitude,
    longitude: c.longitude,
    timestamp: startTs + Math.round((i / Math.max(1, n - 1)) * durationMin * 60_000),
  }));
  const distanceKm = route.distanceKm;
  const elevProfile = await fetchElevationProfile(stamped);
  let elev = 0;
  for (let i = 1; i < elevProfile.length; i++) {
    const d = elevProfile[i] - elevProfile[i - 1];
    if (d > 1) elev += d;
  }
  elev = Math.round(elev);
  const speeds = computeRouteSpeedStats(stamped);
  const fuel = estimateTripFuelLiters(vehicle, distanceKm, {
    ascentM: elev,
    altitudes: elevProfile.length >= 2 ? elevProfile : undefined,
    points: stamped,
    learnedFactor: vehicle.consumptionLearnFactor,
    avgSpeedKmh: speeds.avgKmh || 68,
  });
  const cost = Math.round(fuel * vehicle.defaultFuelPrice * 100) / 100;

  await createTrip({
    vehicleId,
    startTime,
    endTime,
    distanceKm,
    estimatedFuelUsed: Math.round(fuel * 100) / 100,
    estimatedCost: cost,
    isActive: false,
    isPaused: false,
    originName: 'Domicile — Thorigné-Fouillard',
    destinationName: 'Intermarché La Guerche de Bretagne',
    routePoints: JSON.stringify(stamped),
    status: 'confirmed',
    source: 'manual',
    fillUpId: null,
    note: 'Aller complété (via Châteaugiron) — tracé reconstruit',
  });
  await addTrackedKm(vehicleId, distanceKm);
  return true;
}

/** Supprime les micro-trajets (0 km / quelques mètres) inutiles. */
export async function purgeTinyTrips(vehicleId?: number): Promise<number> {
  const trips = await getTrips(vehicleId, { includeRejected: true });
  let n = 0;
  for (const t of trips) {
    if (t.isActive) continue;
    const mins =
      t.endTime && t.startTime
        ? (new Date(t.endTime).getTime() - new Date(t.startTime).getTime()) / 60000
        : 99;
    if (t.distanceKm < 0.25 && mins < 8) {
      await deleteTrip(t.id);
      n += 1;
    }
  }
  return n;
}

/** Aligne les trajets réguliers domicile↔travail sur ~44 km (via Châteaugiron). */
export async function alignCommuteRecurringRoutes(): Promise<number> {
  const places = await getPlaces();
  const home = places.find((p) => p.kind === 'home');
  const work = places.find((p) => p.kind === 'work');
  if (!home?.latitude || !work?.latitude) return 0;
  const routes = await getRecurringRoutes();
  let n = 0;
  for (const r of routes) {
    const isHw =
      (r.fromPlaceId === home.id && r.toPlaceId === work.id) ||
      (r.fromPlaceId === work.id && r.toPlaceId === home.id);
    if (!isHw) continue;
    if (r.distanceKm > 42 && r.distanceKm < 46) continue;
    const from =
      r.fromPlaceId === home.id
        ? { latitude: home.latitude!, longitude: home.longitude! }
        : { latitude: work.latitude!, longitude: work.longitude! };
    const to =
      r.fromPlaceId === home.id
        ? { latitude: work.latitude!, longitude: work.longitude! }
        : { latitude: home.latitude!, longitude: home.longitude! };
    try {
      const route = await fetchDrivingRoute(from, to, { via: VIA_CHATEAUGIRON });
      await updateRecurringRoute(r.id, { distanceKm: route.distanceKm });
      n += 1;
    } catch {
      await updateRecurringRoute(r.id, { distanceKm: 43.7 });
      n += 1;
    }
  }
  return n;
}

/**
 * Corrige timestamps / conso des trajets reconstruits avec vitesses absurdes,
 * et ré-aligne les trajets domicile↔travail trop longs (route rapide ~49 km).
 */
export async function fixImplausibleTripSpeeds(vehicleId?: number): Promise<number> {
  const done = await AsyncStorage.getItem(SPEED_FIX_KEY);
  if (done === '1') return 0;

  const places = await getPlaces();
  const trips = await getTrips(vehicleId, { includeRejected: true });
  let n = 0;

  for (const t of trips) {
    if (t.isActive) continue;
    // Ne pas écraser un vrai tracé GPS
    if (t.source === 'gps') continue;

    const pts = parseRoutePoints(t.routePoints);
    const commute = isCommutePair(t.originName, t.destinationName);
    const crazy = pts.length >= 2 && rawMaxSpeedKmh(pts) >= 145;
    const wrongHwy = commute && t.distanceKm > 46.5;
    if (!crazy && !wrongHwy) continue;

    const ends = resolveTripEndpoints(t, places);
    if (!ends) continue;

    try {
      const route = await fetchDrivingRoute(ends.from, ends.to, {
        via: commute ? VIA_CHATEAUGIRON : undefined,
      });
      if (route.coordinates.length < 2) continue;
      const startTs = new Date(t.startTime).getTime() || Date.now();
      const mins =
        route.durationMinutes ??
        Math.max(35, Math.round((route.distanceKm / 68) * 60));
      const stamped = stampRouteAtSpeed(route.coordinates, startTs, mins);
      const distanceKm = route.distanceKm;
      const vehicle = await getVehicleById(t.vehicleId);
      const ascentProfile = await fetchElevationProfile(stamped);
      let ascent = 0;
      for (let i = 1; i < ascentProfile.length; i++) {
        const d = ascentProfile[i] - ascentProfile[i - 1];
        if (d > 1) ascent += d;
      }
      ascent = Math.round(ascent);
      const speeds = computeRouteSpeedStats(stamped);
      const fuel = vehicle
        ? estimateTripFuelLiters(vehicle, distanceKm, {
            ascentM: ascent,
            altitudes: ascentProfile.length >= 2 ? ascentProfile : undefined,
            points: stamped,
            learnedFactor: vehicle.consumptionLearnFactor,
            avgSpeedKmh: speeds.avgKmh || 68,
          })
        : t.estimatedFuelUsed;
      const cost = vehicle
        ? Math.round(fuel * vehicle.defaultFuelPrice * 100) / 100
        : t.estimatedCost;
      const endTs = stamped[stamped.length - 1]?.timestamp;
      await updateTrip(t.id, {
        routePoints: JSON.stringify(stamped),
        distanceKm,
        estimatedFuelUsed: Math.round(fuel * 100) / 100,
        estimatedCost: cost,
        endTime: t.endTime || (endTs ? new Date(endTs).toISOString() : t.endTime),
        note: commute
          ? `${t.note || ''} · via Châteaugiron (corrigé)`.trim()
          : t.note,
      });
      n += 1;
    } catch {
      /* ignore one */
    }
  }

  await AsyncStorage.setItem(SPEED_FIX_KEY, '1');
  return n;
}

/** À appeler au refresh app. */
export async function repairTripHistory(vehicleId?: number): Promise<{
  routesFilled: number;
  outboundAdded: boolean;
  tinyPurged: number;
  routesAligned: number;
  speedsFixed: number;
}> {
  const places = await getPlaces();
  const trips = await getTrips(vehicleId, { includeRejected: true });
  let routesFilled = 0;
  let outboundAdded = false;

  const tinyPurged = await purgeTinyTrips(vehicleId);
  if (tinyPurged) await AsyncStorage.setItem(TINY_PURGE_KEY, '1');

  let routesAligned = 0;
  try {
    routesAligned = await alignCommuteRecurringRoutes();
  } catch {
    /* ignore */
  }

  let speedsFixed = 0;
  try {
    speedsFixed = await fixImplausibleTripSpeeds(vehicleId);
  } catch {
    /* ignore */
  }

  const flag = await AsyncStorage.getItem(REPAIR_KEY);
  if (flag === '1') {
    return { routesFilled: 0, outboundAdded: false, tinyPurged, routesAligned, speedsFixed };
  }

  const empty = trips.filter((t) => parseRoutePoints(t.routePoints).length < 2).slice(0, 30);
  for (const t of empty) {
    try {
      if (await fillEmptyRoute(t, places)) routesFilled += 1;
    } catch {
      /* ignore one */
    }
  }

  if (vehicleId) {
    const days = new Set<string>(['2026-09-05']);
    for (const t of trips) {
      if (isWorkLabel(t.originName) && isHomeLabel(t.destinationName)) {
        days.add(dayKey(t.startTime));
      }
    }
    for (const ymd of days) {
      try {
        if (await ensureOutboundForDay(vehicleId, ymd, places, trips)) {
          outboundAdded = true;
        }
      } catch {
        /* ignore */
      }
    }
  }

  await AsyncStorage.setItem(REPAIR_KEY, '1');
  return { routesFilled, outboundAdded, tinyPurged, routesAligned, speedsFixed };
}

export async function resetTripHistoryRepairFlag(): Promise<void> {
  await AsyncStorage.multiRemove([REPAIR_KEY, SPEED_FIX_KEY]);
}
