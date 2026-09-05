import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { BACKGROUND_LOCATION_TASK } from '@/constants/Colors';
import {
  getActiveTrip,
  getVehicleById,
  updateTrip,
} from '@/lib/database';
import {
  appendRoutePoint,
  calculateRouteDistance,
  compactRoutePointsJson,
  estimateCost,
  parseRoutePoints,
} from '@/lib/calculations';
import { estimateTripFuelLiters } from '@/lib/consumptionModel';

interface LocationTaskData {
  locations: Location.LocationObject[];
}

/** Sérialise les mises à jour trajet (évite last-write-wins). */
let tripWriteChain: Promise<void> = Promise.resolve();
/** Empêche plusieurs startLocationUpdatesAsync en parallèle (crash LocationTaskService). */
let startInFlight: Promise<boolean> | null = null;

function enqueueTripUpdate(fn: () => Promise<void>): Promise<void> {
  tripWriteChain = tripWriteChain.then(fn, fn);
  return tripWriteChain;
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[gps-bg] task error', error);
    return;
  }

  const { locations } = (data || {}) as LocationTaskData;
  if (!locations || locations.length === 0) return;

  // Limite batch : évite pics mémoire si l’OS envoie un paquet énorme
  const batch = locations.length > 12 ? locations.slice(-12) : locations;

  await enqueueTripUpdate(async () => {
    try {
      const trip = await getActiveTrip();
      if (!trip || trip.isPaused || !trip.isActive) return;

      const vehicle = await getVehicleById(trip.vehicleId);
      if (!vehicle) return;

      let routePoints = trip.routePoints;
      let changed = false;
      for (const loc of batch) {
        const next = appendRoutePoint(routePoints, {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp || Date.now(),
          accuracy: loc.coords.accuracy ?? undefined,
          speed: loc.coords.speed ?? undefined,
        });
        if (next !== routePoints) {
          routePoints = next;
          changed = true;
        }
      }
      if (!changed) return;

      routePoints = compactRoutePointsJson(routePoints);
      const distanceKm = calculateRouteDistance(routePoints);
      const fuelUsed = estimateTripFuelLiters(vehicle, distanceKm, {
        learnedFactor: vehicle.consumptionLearnFactor,
      });
      const cost = estimateCost(fuelUsed, vehicle.defaultFuelPrice);

      await updateTrip(trip.id, {
        routePoints,
        distanceKm,
        estimatedFuelUsed: fuelUsed,
        estimatedCost: cost,
      });
    } catch (e) {
      console.warn('[gps-bg] update failed', e);
    }
  });
});

export async function requestLocationPermissions(): Promise<boolean> {
  const { status: foreground } = await Location.requestForegroundPermissionsAsync();
  if (foreground !== 'granted') return false;

  if (Platform.OS === 'web') return true;

  const { status: background } = await Location.requestBackgroundPermissionsAsync();
  return background === 'granted';
}

async function isTrackingAlreadyOn(): Promise<boolean> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
      return true;
    }
  } catch {
    /* older / web stub */
  }
  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Démarre le suivi arrière-plan (une seule instance FGS).
 * Profil « stable » : pas BestForNavigation (trop lourd → OOM/ANR Nothing).
 */
export async function startBackgroundTracking(): Promise<boolean> {
  if (startInFlight) return startInFlight;

  startInFlight = (async () => {
    try {
      const hasPermission = await requestLocationPermissions();
      if (!hasPermission) return false;

      if (await isTrackingAlreadyOn()) {
        return true;
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        // High suffit pour les km ; BestForNavigation + watch UI = double charge → crash
        accuracy: Location.Accuracy.High,
        timeInterval: 8000,
        distanceInterval: 25,
        deferredUpdatesInterval: 10000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Gasoil Tracking — trajet',
          notificationBody: 'Suivi GPS en arrière-plan',
          notificationColor: '#e94560',
        },
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
      });
      return true;
    } catch (e) {
      console.warn('[gps-bg] start failed', e);
      // Si déjà démarré côté OS, on considère OK
      try {
        if (await isTrackingAlreadyOn()) return true;
      } catch {
        /* ignore */
      }
      return false;
    } finally {
      startInFlight = null;
    }
  })();

  return startInFlight;
}

export async function stopBackgroundTracking(): Promise<void> {
  try {
    if (await isTrackingAlreadyOn()) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (e) {
    console.warn('[gps-bg] stop failed', e);
  }
}

export async function getCurrentLocation(opts?: {
  /** Pour démarrer un trajet : frais + précis, pas last-known lâche. */
  fresh?: boolean;
}): Promise<Location.LocationObject | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  if (!opts?.fresh) {
    try {
      const last = await Location.getLastKnownPositionAsync({
        maxAge: 45_000,
        requiredAccuracy: 80,
      });
      if (last && (last.coords.accuracy == null || last.coords.accuracy <= 80)) {
        return last;
      }
    } catch {
      /* ignore */
    }
  }

  return Location.getCurrentPositionAsync({
    accuracy: opts?.fresh ? Location.Accuracy.High : Location.Accuracy.Balanced,
    mayShowUserSettingsDialog: true,
  });
}

/** Ouvre Google Maps pour la navigation vers une destination */
export function openGoogleMapsNavigation(
  destinationLat: number,
  destinationLng: number,
  destinationName?: string
): string {
  const label = destinationName ? encodeURIComponent(destinationName) : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${destinationLat},${destinationLng}&travelmode=driving${label ? `&destination_place_id=${label}` : ''}`;
}

/** Ouvre Google Maps avec une recherche */
export function openGoogleMapsSearch(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Récupère l'itinéraire via Google Directions API (nécessite une clé API) */
export async function fetchRouteDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  apiKey: string
): Promise<{ distanceKm: number; durationMinutes: number; polyline: string } | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=driving&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.routes?.[0]) return null;

    const route = data.routes[0];
    const leg = route.legs[0];
    return {
      distanceKm: leg.distance.value / 1000,
      durationMinutes: leg.duration.value / 60,
      polyline: route.overview_polyline.points,
    };
  } catch {
    return null;
  }
}

/** Décode une polyline Google Maps en coordonnées */
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}
