/**
 * Démarrage suivi GPS libre — appelable depuis Maps sans passer par l’onglet Trajet
 * (onglet masqué : router.push ne montre parfois que la notif FGS).
 */
import { Platform } from 'react-native';
import type { Vehicle } from '@/types';
import { createTrip, getActiveTripLite, stopActiveTrips } from '@/lib/database';
import { reverseGeocode } from '@/lib/geocode';
import {
  clearLiveTripBuffer,
  seedLiveTripBuffer,
} from '@/lib/liveTripBuffer';
import {
  getCurrentLocation,
  seedLivePointsCache,
  startBackgroundTracking,
  stopBackgroundTracking,
} from '@/lib/locationService';
import { freeTripNote } from '@/lib/startFreeTripNote';

export type FreeTripStartResult =
  | { ok: true; tripId: number; trackingStarted: boolean }
  | { ok: false; error: string };

let inFlight = false;

export async function startFreeGpsTrip(opts: {
  vehicle: Vehicle;
  refresh?: () => Promise<void>;
}): Promise<FreeTripStartResult> {
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

    const loc = await getCurrentLocation({ fresh: false, timeoutMs: 4000 });
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
    const tripId = await createTrip({
      vehicleId: opts.vehicle.id,
      startTime: new Date().toISOString(),
      endTime: null,
      distanceKm: 0,
      estimatedFuelUsed: 0,
      estimatedCost: 0,
      routePoints: JSON.stringify(startPoint),
      originName,
      destinationName: undefined,
      isActive: true,
      isPaused: false,
      status: 'confirmed',
      source: 'gps',
      fillUpId: null,
      note: freeTripNote(isWeb),
    });

    seedLivePointsCache(tripId, opts.vehicle.id, startPoint);
    await seedLiveTripBuffer({
      tripId,
      vehicleId: opts.vehicle.id,
      routePoints: JSON.stringify(startPoint),
    });

    const trackingStarted = await startBackgroundTracking({ forceRestart: true });
    await opts.refresh?.();

    if (!trackingStarted) {
      return {
        ok: true,
        tripId,
        trackingStarted: false,
      };
    }
    return { ok: true, tripId, trackingStarted: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Impossible de démarrer le trajet',
    };
  } finally {
    inFlight = false;
  }
}

/** Tests / reset interne. */
export function resetFreeTripInFlight(): void {
  inFlight = false;
}
