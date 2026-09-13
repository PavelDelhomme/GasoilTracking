/**
 * Démarrage / pause GPS depuis Maps — sans passer par l’onglet Trajet
 * (onglet masqué : router.push n’affiche souvent que la notif FGS).
 */
import { Platform } from 'react-native';
import type { Vehicle } from '@/types';
import {
  addTrackedKm,
  createTrip,
  getActiveTrip,
  getActiveTripLite,
  getTripById,
  getVehicleById,
  updateTrip,
} from '@/lib/database';
import { reverseGeocode } from '@/lib/geocode';
import { clearLiveTripBuffer, seedLiveTripBuffer } from '@/lib/liveTripBuffer';
import {
  calculateRouteDistance,
  estimateCost,
  parseRoutePoints,
} from '@/lib/calculations';
import { estimateTripFuelLiters } from '@/lib/consumptionModel';
import { applyTripFuelBurn } from '@/lib/fuelLevel';
import {
  flushTripUpdates,
  getCurrentLocation,
  persistLiveRoute,
  seedLivePointsCache,
  startBackgroundTracking,
  stopBackgroundTracking,
  clearLivePointsAfterFinish,
} from '@/lib/locationService';
import { freeTripNote } from '@/lib/startFreeTripNote';

export type GpsTripStartResult =
  | { ok: true; tripId: number; trackingStarted: boolean }
  | { ok: false; error: string };

let inFlight = false;
/** Anti multi-tap : un 2ᵉ démarrage à chaud tuait le 1ᵉr trajet → 0 km. */
let lastStartAt = 0;
const START_COOLDOWN_MS = 4000;

/**
 * Clôture propre d’un trajet actif avant un nouveau départ
 * (persist GPS + distance + conso — jamais un wipe silencieux via stopActiveTrips).
 */
async function closeActiveTripSafely(tripId: number): Promise<void> {
  try {
    await flushTripUpdates();
  } catch {
    /* ignore */
  }
  try {
    await stopBackgroundTracking();
  } catch {
    /* ignore */
  }
  try {
    await persistLiveRoute(tripId);
  } catch {
    /* ignore */
  }

  const trip = await getTripById(tripId);
  if (!trip) return;

  const routeJson = trip.routePoints || '[]';
  const pts = parseRoutePoints(routeJson);
  const distanceKm =
    pts.length >= 2
      ? Math.round(calculateRouteDistance(routeJson) * 1000) / 1000
      : Number(trip.distanceKm) || 0;

  let estimatedFuelUsed = Number(trip.estimatedFuelUsed) || 0;
  let estimatedCostVal = Number(trip.estimatedCost) || 0;
  try {
    const vehicle = await getVehicleById(trip.vehicleId);
    if (vehicle && distanceKm > 0) {
      estimatedFuelUsed = estimateTripFuelLiters(vehicle, distanceKm, { points: pts });
      estimatedCostVal = estimateCost(estimatedFuelUsed, vehicle.defaultFuelPrice);
      await applyTripFuelBurn(vehicle, distanceKm);
    }
  } catch {
    /* ignore conso */
  }

  const tiny = distanceKm < 0.25;
  await updateTrip(tripId, {
    isActive: false,
    isPaused: false,
    endTime: new Date().toISOString(),
    distanceKm,
    estimatedFuelUsed,
    estimatedCost: estimatedCostVal,
    status: tiny ? 'rejected' : 'confirmed',
    note: tiny
      ? [trip.note?.trim(), '[clôturé: redémarrage trop tôt / 0 km]'].filter(Boolean).join(' ')
      : trip.note,
  });
  if (!tiny && distanceKm > 0) {
    await addTrackedKm(trip.vehicleId, distanceKm).catch(() => undefined);
  }
  await clearLiveTripBuffer();
  clearLivePointsAfterFinish();
}

export async function startGpsTrip(opts: {
  vehicle: Vehicle;
  refresh?: () => Promise<void>;
  destinationName?: string;
}): Promise<GpsTripStartResult> {
  if (inFlight) return { ok: false, error: 'Démarrage déjà en cours' };
  if (Date.now() - lastStartAt < START_COOLDOWN_MS) {
    return { ok: false, error: 'Attendez 2–3 s — un suivi vient d’être lancé' };
  }
  inFlight = true;
  try {
    const live = await getActiveTripLite();
    if (live?.isActive) {
      const ageMs = Date.now() - (Date.parse(live.startTime) || 0);
      // Trajet tout juste créé (< 2 min, quasi 0 km) → reprendre le FGS, ne pas créer un 2ᵉ
      if ((live.distanceKm || 0) < 0.3 && ageMs < 120_000) {
        const trackingStarted = await startBackgroundTracking({ forceRestart: true });
        const ok =
          trackingStarted || (await startBackgroundTracking({ forceRestart: true }));
        lastStartAt = Date.now();
        await opts.refresh?.();
        return { ok: true, tripId: live.id, trackingStarted: ok };
      }
      return { ok: false, error: 'Un trajet est déjà en cours — terminez-le d’abord' };
    }

    // Zombie actif non vu par lite : clôture propre (jamais stopActiveTrips nu)
    try {
      const full = await getActiveTrip();
      if (full?.isActive) {
        await closeActiveTripSafely(full.id);
      }
    } catch {
      /* ignore */
    }

    await stopBackgroundTracking();
    await clearLiveTripBuffer();

    const loc = await getCurrentLocation({ fresh: true });
    const startPoint = loc
      ? [
          {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            timestamp: Date.now(),
            accuracy: loc.coords.accuracy ?? undefined,
          },
        ]
      : [];

    const originName = loc
      ? (await reverseGeocode(loc.coords.latitude, loc.coords.longitude).catch(() => null)) ||
        'Position de départ'
      : 'Position de départ';

    const isWeb = Platform.OS === 'web';
    const destName = opts.destinationName?.trim() || undefined;
    const tripId = await createTrip({
      vehicleId: opts.vehicle.id,
      startTime: new Date().toISOString(),
      endTime: null,
      distanceKm: 0,
      estimatedFuelUsed: 0,
      estimatedCost: 0,
      routePoints: JSON.stringify(startPoint),
      originName,
      destinationName: destName,
      isActive: true,
      isPaused: false,
      status: 'confirmed',
      source: 'gps',
      fillUpId: null,
      note: destName ? undefined : freeTripNote(isWeb),
    });

    seedLivePointsCache(tripId, opts.vehicle.id, startPoint);
    await seedLiveTripBuffer({
      tripId,
      vehicleId: opts.vehicle.id,
      routePoints: JSON.stringify(startPoint),
    });

    const trackingStarted = await startBackgroundTracking({ forceRestart: true });
    const ok =
      trackingStarted || (await startBackgroundTracking({ forceRestart: true }));
    lastStartAt = Date.now();
    await opts.refresh?.();

    return { ok: true, tripId, trackingStarted: ok };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Impossible de démarrer le trajet',
    };
  } finally {
    inFlight = false;
  }
}

/** Alias historique (suivi libre sans destination). */
export function startFreeGpsTrip(opts: {
  vehicle: Vehicle;
  refresh?: () => Promise<void>;
}): Promise<GpsTripStartResult> {
  return startGpsTrip(opts);
}

export async function pauseGpsTrip(
  tripId: number,
  refresh?: () => Promise<void>
): Promise<void> {
  await stopBackgroundTracking();
  await updateTrip(tripId, { isPaused: true });
  await refresh?.();
}

export async function resumeGpsTrip(
  tripId: number,
  refresh?: () => Promise<void>
): Promise<boolean> {
  await updateTrip(tripId, { isPaused: false });
  const ok = await startBackgroundTracking({ forceRestart: true });
  await refresh?.();
  return ok;
}

/** Clôture légère depuis Maps (sans écran récap Trajet). */
export async function stopGpsTripLite(opts: {
  tripId: number;
  vehicleId: number;
  distanceKm: number;
  refresh?: () => Promise<void>;
}): Promise<void> {
  try {
    await flushTripUpdates();
  } catch {
    /* ignore */
  }
  try {
    await stopBackgroundTracking();
  } catch {
    /* déjà arrêté */
  }
  try {
    await persistLiveRoute(opts.tripId);
  } catch {
    /* ignore */
  }

  const trip = await getTripById(opts.tripId);
  const routeJson = trip?.routePoints || '[]';
  const pts = parseRoutePoints(routeJson);
  const fromPts =
    pts.length >= 2 ? Math.round(calculateRouteDistance(routeJson) * 1000) / 1000 : 0;
  const distanceKm = Math.max(Number(opts.distanceKm) || 0, fromPts);

  let estimatedFuelUsed = Number(trip?.estimatedFuelUsed) || 0;
  let estimatedCostVal = Number(trip?.estimatedCost) || 0;
  try {
    const vehicle = await getVehicleById(opts.vehicleId);
    if (vehicle && distanceKm > 0) {
      estimatedFuelUsed = estimateTripFuelLiters(vehicle, distanceKm, { points: pts });
      estimatedCostVal = estimateCost(estimatedFuelUsed, vehicle.defaultFuelPrice);
      await applyTripFuelBurn(vehicle, distanceKm);
    }
  } catch {
    /* ignore */
  }

  const tiny = distanceKm < 0.25;
  await updateTrip(opts.tripId, {
    isActive: false,
    isPaused: false,
    endTime: new Date().toISOString(),
    distanceKm,
    estimatedFuelUsed,
    estimatedCost: estimatedCostVal,
    status: tiny ? 'rejected' : 'confirmed',
  });
  if (!tiny && distanceKm > 0) {
    await addTrackedKm(opts.vehicleId, distanceKm).catch(() => undefined);
  }
  await clearLiveTripBuffer();
  clearLivePointsAfterFinish();
  await opts.refresh?.();
}

/** Tests / reset interne. */
export function resetGpsTripInFlight(): void {
  inFlight = false;
  lastStartAt = 0;
}

export function resetFreeTripInFlight(): void {
  resetGpsTripInFlight();
}
