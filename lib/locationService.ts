import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { BACKGROUND_LOCATION_TASK } from '@/constants/Colors';
import {
  getActiveTrip,
  getVehicleById,
  updateTrip,
} from '@/lib/database';
import {
  appendRoutePoint,
  calculateRouteDistance,
  estimateCost,
  estimateFuelUsed,
} from '@/lib/calculations';

interface LocationTaskData {
  locations: Location.LocationObject[];
}

/** Sérialise les mises à jour trajet pour éviter last-write-wins (perte de points). */
let tripWriteChain: Promise<void> = Promise.resolve();

function enqueueTripUpdate(fn: () => Promise<void>): Promise<void> {
  tripWriteChain = tripWriteChain.then(fn, fn);
  return tripWriteChain;
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Erreur suivi GPS:', error);
    return;
  }

  const { locations } = data as LocationTaskData;
  if (!locations || locations.length === 0) return;

  await enqueueTripUpdate(async () => {
    const trip = await getActiveTrip();
    if (!trip || trip.isPaused || !trip.isActive) return;

    const vehicle = await getVehicleById(trip.vehicleId);
    if (!vehicle) return;

    let routePoints = trip.routePoints;
    for (const loc of locations) {
      routePoints = appendRoutePoint(routePoints, {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: loc.timestamp || Date.now(),
        accuracy: loc.coords.accuracy ?? undefined,
        speed: loc.coords.speed ?? undefined,
      });
    }

    const distanceKm = calculateRouteDistance(routePoints);
    const fuelUsed = estimateFuelUsed(distanceKm, vehicle.consumptionPer100);
    const cost = estimateCost(fuelUsed, vehicle.defaultFuelPrice);

    await updateTrip(trip.id, {
      routePoints,
      distanceKm,
      estimatedFuelUsed: fuelUsed,
      estimatedCost: cost,
    });
  });
});

export async function requestLocationPermissions(): Promise<boolean> {
  const { status: foreground } = await Location.requestForegroundPermissionsAsync();
  if (foreground !== 'granted') return false;

  const { status: background } = await Location.requestBackgroundPermissionsAsync();
  return background === 'granted';
}

export async function startBackgroundTracking(): Promise<boolean> {
  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) return false;

  // Ne pas stop/restart si déjà actif — ça coupait le trajet et perdait des updates OS.
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isRegistered) {
    return true;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    // BestForNavigation = meilleure précision trajet voiture (Android / iOS)
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2500,
    distanceInterval: 8,
    deferredUpdatesInterval: 3000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Gasoil Tracking — trajet en cours',
      notificationBody: 'Suivi GPS précis actif (arrière-plan)',
      notificationColor: '#e94560',
    },
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
  });

  return true;
}

export async function stopBackgroundTracking(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
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
        requiredAccuracy: 50,
      });
      if (last && (last.coords.accuracy == null || last.coords.accuracy <= 50)) {
        return last;
      }
    } catch {
      /* ignore */
    }
  }

  return Location.getCurrentPositionAsync({
    accuracy: opts?.fresh ? Location.Accuracy.BestForNavigation : Location.Accuracy.High,
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
