/**
 * Répare / complète l’historique trajet :
 * - crée l’aller manquant si un retour domicile existe le même jour
 * - remplit routePoints vides quand on peut reconstruire le tracé
 */
import {
  addTrackedKm,
  createTrip,
  getPlaces,
  getTrips,
  getVehicleById,
  updateTrip,
} from '@/lib/database';
import { estimateTripFuelLiters } from '@/lib/consumptionModel';
import { parseRoutePoints } from '@/lib/calculations';
import { SIM_HOME, SIM_WORK } from '@/lib/gpsCarSimulator';
import { fetchDrivingRoute } from '@/lib/roadDistance';
import {
  buildStoredRouteJson,
  resolveTripEndpoints,
} from '@/lib/routeGeometry';
import type { Place, Trip } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REPAIR_KEY = 'gasoil_route_repair_v2';

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function isHomeLabel(s: string | null | undefined): boolean {
  return /maison|domicile|home|thorign/i.test(s || '');
}

function isWorkLabel(s: string | null | undefined): boolean {
  return /travail|bureau|inter|guerche|vitré|vitre|faubourg/i.test(s || '');
}

function localIsoOnDay(ymd: string, hour: number, minute: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d, hour, minute, 0, 0);
  return dt.toISOString();
}

async function fillEmptyRoute(trip: Trip, places: Place[]): Promise<boolean> {
  const pts = parseRoutePoints(trip.routePoints);
  if (pts.length >= 2) return false;
  const ends = resolveTripEndpoints(trip, places);
  if (!ends) return false;

  let coords = (await fetchDrivingRoute(ends.from, ends.to)).coordinates;
  if (coords.length < 2) {
    const built = buildStoredRouteJson(ends.from, ends.to, Date.parse(trip.startTime) || Date.now());
    await updateTrip(trip.id, { routePoints: built.json });
    return true;
  }
  const startTs = Date.parse(trip.startTime) || Date.now();
  const endTs = trip.endTime ? Date.parse(trip.endTime) : startTs + coords.length * 4000;
  const span = Math.max(endTs - startTs, coords.length * 1000);
  const routePoints = JSON.stringify(
    coords.map((c, i) => ({
      latitude: c.latitude,
      longitude: c.longitude,
      timestamp: Math.round(startTs + (span * i) / Math.max(1, coords.length - 1)),
    }))
  );
  await updateTrip(trip.id, { routePoints });
  return true;
}

/**
 * Si un retour travail→domicile existe un jour sans aller, crée l’aller avec tracé.
 * Cible notamment le 2026-09-05 demandé par l’utilisateur.
 */
async function ensureOutboundForDay(
  vehicleId: number,
  ymd: string,
  places: Place[],
  trips: Trip[]
): Promise<boolean> {
  const dayTrips = trips.filter(
    (t) => dayKey(t.startTime) === ymd && t.status !== 'rejected' && !t.isActive
  );
  const hasOut = dayTrips.some(
    (t) => isHomeLabel(t.originName) && isWorkLabel(t.destinationName)
  );
  const hasBack = dayTrips.some(
    (t) => isWorkLabel(t.originName) && isHomeLabel(t.destinationName)
  );
  if (hasOut || !hasBack) return false;

  const vehicle = await getVehicleById(vehicleId);
  if (!vehicle) return false;

  const home = places.find((p) => p.kind === 'home');
  const work = places.find((p) => p.kind === 'work');
  const from = {
    latitude: home?.latitude ?? SIM_HOME.latitude,
    longitude: home?.longitude ?? SIM_HOME.longitude,
  };
  const to = {
    latitude: work?.latitude ?? SIM_WORK.latitude,
    longitude: work?.longitude ?? SIM_WORK.longitude,
  };

  const start = localIsoOnDay(ymd, 7, 35);
  const startMs = Date.parse(start);
  let distanceKm = 44;
  let routeJson: string;
  try {
    const route = await fetchDrivingRoute(from, to);
    if (route.coordinates.length >= 2) {
      distanceKm = route.distanceKm || distanceKm;
      const endMs = startMs + (route.durationMinutes || 45) * 60_000;
      routeJson = JSON.stringify(
        route.coordinates.map((c, i) => ({
          latitude: c.latitude,
          longitude: c.longitude,
          timestamp: Math.round(
            startMs + ((endMs - startMs) * i) / Math.max(1, route.coordinates.length - 1)
          ),
        }))
      );
    } else {
      const built = buildStoredRouteJson(from, to, startMs);
      routeJson = built.json;
      distanceKm = built.distanceHintKm || distanceKm;
    }
  } catch {
    const built = buildStoredRouteJson(from, to, startMs);
    routeJson = built.json;
    distanceKm = built.distanceHintKm || distanceKm;
  }

  const fuel = estimateTripFuelLiters(vehicle, distanceKm);
  const price = vehicle.defaultFuelPrice || 1.7;
  const end = localIsoOnDay(ymd, 8, 25);

  await createTrip({
    vehicleId,
    startTime: start,
    endTime: end,
    distanceKm,
    estimatedFuelUsed: Math.round(fuel * 100) / 100,
    estimatedCost: Math.round(fuel * price * 100) / 100,
    routePoints: routeJson,
    originName: home?.name || 'Domicile',
    destinationName: work?.name || 'Travail (Intermarché)',
    isActive: false,
    status: 'confirmed',
    source: 'manual',
    fillUpId: null,
    note: 'Aller complété automatiquement (manquant le 05/09) — tracé reconstruit',
  });
  await addTrackedKm(vehicleId, distanceKm);
  return true;
}

/** À appeler au refresh app (idempotent via AsyncStorage). */
export async function repairTripHistory(vehicleId?: number): Promise<{
  routesFilled: number;
  outboundAdded: boolean;
}> {
  const flag = await AsyncStorage.getItem(REPAIR_KEY);
  const places = await getPlaces();
  const trips = await getTrips(vehicleId, { includeRejected: true });
  let routesFilled = 0;
  let outboundAdded = false;

  if (flag === '1') {
    return { routesFilled: 0, outboundAdded: false };
  }

  // Remplir tracés vides (limité pour perf / Nominatim-OSRM)
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
  return { routesFilled, outboundAdded };
}

/** Force une nouvelle passe (tests). */
export async function resetTripHistoryRepairFlag(): Promise<void> {
  await AsyncStorage.removeItem(REPAIR_KEY);
}
