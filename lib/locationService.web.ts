/**
 * GPS web / iOS PWA : suivi au premier plan (onglet ouvert).
 * Pas d’arrière-plan navigateur — garde l’app ouverte pendant le trajet.
 */
import type * as Location from 'expo-location';
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

let watchId: number | null = null;
let applying = false;

function toLocationObject(pos: GeolocationPosition): Location.LocationObject {
  return {
    coords: {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      altitude: pos.coords.altitude,
      accuracy: pos.coords.accuracy,
      altitudeAccuracy: pos.coords.altitudeAccuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
    },
    timestamp: pos.timestamp,
  } as Location.LocationObject;
}

async function applyPosition(pos: GeolocationPosition) {
  if (applying) return;
  applying = true;
  try {
    const trip = await getActiveTrip();
    if (!trip || trip.isPaused) return;

    const vehicle = await getVehicleById(trip.vehicleId);
    if (!vehicle) return;

    const routePoints = appendRoutePoint(trip.routePoints, {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      timestamp: pos.timestamp,
    });
    const distanceKm = calculateRouteDistance(routePoints);
    const fuelUsed = estimateFuelUsed(distanceKm, vehicle.consumptionPer100);
    const cost = estimateCost(fuelUsed, vehicle.defaultFuelPrice);

    await updateTrip(trip.id, {
      routePoints,
      distanceKm,
      estimatedFuelUsed: fuelUsed,
      estimatedCost: cost,
    });
  } catch (e) {
    console.warn('[web-gps] apply', e);
  } finally {
    applying = false;
  }
}

export async function requestLocationPermissions(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
  // Permission via un getCurrentPosition (prompt navigateur / Safari)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

export async function startBackgroundTracking(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
  const ok = await requestLocationPermissions();
  if (!ok) return false;

  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      void applyPosition(pos);
    },
    (err) => {
      console.warn('[web-gps]', err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 20000,
    }
  );

  return true;
}

export async function stopBackgroundTracking(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.geolocation && watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toLocationObject(pos)),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 }
    );
  });
}

export function openGoogleMapsNavigation(
  destinationLat: number,
  destinationLng: number,
  destinationName?: string
): string {
  const label = destinationName ? encodeURIComponent(destinationName) : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${destinationLat},${destinationLng}&travelmode=driving${label ? `&destination_place_id=${label}` : ''}`;
}

export function openGoogleMapsSearch(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

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
