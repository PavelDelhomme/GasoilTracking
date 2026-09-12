/**
 * Démarrage / pause GPS depuis Maps — sans passer par l’onglet Trajet
 * (onglet masqué : router.push n’affiche souvent que la notif FGS).
 */
import { Platform } from 'react-native';
import type { Vehicle } from '@/types';
import {
  addTrackedKm,
  createTrip,
  getActiveTripLite,
  stopActiveTrips,
  updateTrip,
} from '@/lib/database';
import { reverseGeocode } from '@/lib/geocode';
import { clearLiveTripBuffer, seedLiveTripBuffer } from '@/lib/liveTripBuffer';
import {
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

export async function startGpsTrip(opts: {
  vehicle: Vehicle;
  refresh?: () => Promise<void>;
  destinationName?: string;
}): Promise<GpsTripStartResult> {
  if (inFlight) return { ok: false, error: 'Démarrage déjà en cours' };
  inFlight = true;
  try {
    const live = await getActiveTripLite();
    if (live?.isActive) {
      return { ok: false, error: 'Un trajet est déjà en cours' };
    }

    await stopBackgroundTracking();
    await clearLiveTripBuffer();
    await stopActiveTrips();

    const loc = await getCurrentLocation({ fresh: false });
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
    await opts.refresh?.();

    return { ok: true, tripId, trackingStarted };
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
    await stopBackgroundTracking();
  } catch {
    /* déjà arrêté */
  }
  try {
    await persistLiveRoute(opts.tripId);
  } catch {
    /* ignore */
  }
  await updateTrip(opts.tripId, {
    isActive: false,
    isPaused: false,
    endTime: new Date().toISOString(),
    status: 'confirmed',
  });
  if (opts.distanceKm > 0) {
    await addTrackedKm(opts.vehicleId, opts.distanceKm).catch(() => undefined);
  }
  await clearLiveTripBuffer();
  clearLivePointsAfterFinish();
  await opts.refresh?.();
}

/** Tests / reset interne. */
export function resetGpsTripInFlight(): void {
  inFlight = false;
}

export function resetFreeTripInFlight(): void {
  resetGpsTripInFlight();
}
