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

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Erreur suivi GPS:', error);
    return;
  }

  const { locations } = data as LocationTaskData;
  if (!locations || locations.length === 0) return;

  const trip = await getActiveTrip();
  if (!trip || trip.isPaused) return;

  const vehicle = await getVehicleById(trip.vehicleId);
  if (!vehicle) return;

  let routePoints = trip.routePoints;
  for (const loc of locations) {
    routePoints = appendRoutePoint(routePoints, {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      timestamp: loc.timestamp,
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

export async function requestLocationPermissions(): Promise<boolean> {
  const { status: foreground } = await Location.requestForegroundPermissionsAsync();
  if (foreground !== 'granted') return false;

  const { status: background } = await Location.requestBackgroundPermissionsAsync();
  return background === 'granted';
}

export async function startBackgroundTracking(): Promise<boolean> {
  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) return false;

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    // Balanced : bien assez pour le km trajet, beaucoup moins gourmand que BestForNavigation
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 10000,
    distanceInterval: 25,
    deferredUpdatesInterval: 15000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Gasoil Tracking — trajet en cours',
      notificationBody: 'Suivi GPS actif même en arrière-plan (km & conso estimée)',
      notificationColor: '#e94560',
    },
    // Pause auto à l’arrêt (économie batterie) — le suivi reprend au mouvement
    pausesUpdatesAutomatically: true,
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

export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  // Balanced + cache court : assez précis pour départ trajet / stations, moins de drain
  return Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
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
