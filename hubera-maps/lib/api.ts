import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.fuelApiUrl || 'https://fuel.hubera.cloud';

const TOKEN_KEY = 'hubera_maps_token';
const REFRESH_TOKEN_KEY = 'hubera_maps_refresh_token';
const USER_KEY = 'hubera_maps_user';

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  isManager?: boolean;
};

export type Vehicle = {
  id: number;
  name: string;
  brand?: string;
  model?: string;
  year?: number;
  fuelType?: string;
  tankCapacity?: number;
  lastKnownKm?: number;
  avgConsumption?: number;
  licensePlate?: string;
  isDefault?: boolean;
};

export type TransportMode = 'driving' | 'walking' | 'transit' | 'cycling';

export type Trip = {
  id: number;
  mode: TransportMode;
  startTime: string;
  endTime?: string;
  startLocation?: string;
  endLocation?: string;
  distance?: number;
  duration?: number;
  fuelUsed?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  vehicleId?: number;
  vehicleName?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  consumption?: string;
  hasRoute?: boolean;
  routePointCount?: number;
  status?: 'active' | 'paused' | 'completed';
};

export type Place = {
  id: number;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  type?: 'home' | 'work' | 'favorite' | 'recent';
  visitCount?: number;
  lastVisit?: string;
};

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function setSession(
  token: string,
  user: AuthUser,
  refreshToken?: string | null
): Promise<void> {
  cachedToken = token;
  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export async function clearSession(): Promise<void> {
  cachedToken = null;
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
}

export async function getStoredUser(): Promise<AuthUser | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers.Authorization = `Bearer ${await getToken()}`;
      const retry = await fetch(`${API_URL}${path}`, { ...options, headers });
      if (!retry.ok) throw new Error(`API error: ${retry.status}`);
      return retry.json();
    }
    await clearSession();
    throw new Error('Session expirée');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

async function tryRefreshToken(): Promise<boolean> {
  const refresh = await getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.token) {
      cachedToken = data.token;
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      if (data.refreshToken) {
        await AsyncStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      }
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string
): Promise<{ user: AuthUser; token: string; refreshToken?: string }> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Échec connexion');
  }
  const data = await res.json();
  await setSession(data.token, data.user, data.refreshToken);
  return data;
}

export async function logout(): Promise<void> {
  const token = await getToken();
  if (token) {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore
    }
  }
  await clearSession();
}

export async function fetchMe(): Promise<{ user: AuthUser }> {
  return apiFetch('/api/auth/me');
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicles
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchVehicles(): Promise<{ vehicles: Vehicle[] }> {
  return apiFetch('/api/maps/vehicles');
}

// ─────────────────────────────────────────────────────────────────────────────
// Trips
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchTrips(options?: {
  mode?: TransportMode;
  limit?: number;
  offset?: number;
}): Promise<{
  trips: Trip[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}> {
  const params = new URLSearchParams();
  if (options?.mode) params.set('mode', options.mode);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const qs = params.toString();
  return apiFetch(`/api/maps/trips${qs ? `?${qs}` : ''}`);
}

export async function fetchTrip(id: number | string): Promise<Trip & { vehicle?: Vehicle; route?: Array<{ lat: number; lon: number; ts: number; speed?: number }> }> {
  return apiFetch(`/api/maps/trips/${id}`);
}

export async function startTrip(options: {
  mode: TransportMode;
  vehicleId?: number;
  startLocation?: string;
  destination?: string;
  destinationCoords?: { latitude: number; longitude: number };
}): Promise<{
  ok: boolean;
  tripId: number;
  trip: Trip;
  fuelDeepLink: string;
}> {
  return apiFetch('/api/maps/trips/start', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function updateTrip(
  id: number | string,
  update: {
    action?: 'pause' | 'resume' | 'stop';
    position?: { latitude: number; longitude: number; speed?: number };
    endLocation?: string;
    fuelUsed?: number;
  }
): Promise<{ ok: boolean; trip: Trip }> {
  return apiFetch(`/api/maps/trips/${id}`, {
    method: 'PUT',
    body: JSON.stringify(update),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Places
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchPlaces(): Promise<{ places: Place[] }> {
  return apiFetch('/api/maps/places');
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

export type TripStats = {
  totalTrips: number;
  totalDistance: number;
  totalDuration: number;
  totalFuelUsed: number;
  byMode: {
    driving: { count: number; distance: number; duration: number; fuelUsed: number };
    walking: { count: number; distance: number; duration: number; fuelUsed: number };
    transit: { count: number; distance: number; duration: number; fuelUsed: number };
    cycling: { count: number; distance: number; duration: number; fuelUsed: number };
  };
};

export async function fetchStats(
  period?: 'week' | 'month' | 'year' | 'all'
): Promise<{ stats: TripStats; period: string }> {
  const qs = period ? `?period=${period}` : '';
  return apiFetch(`/api/maps/stats${qs}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Geocoding (Nominatim)
// ─────────────────────────────────────────────────────────────────────────────

export type GeocodingResult = {
  placeId: string;
  displayName: string;
  lat: number;
  lon: number;
  type: string;
};

export async function searchAddress(query: string): Promise<GeocodingResult[]> {
  if (!query.trim()) return [];
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=8`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HuberaMaps/1.0' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((r: any) => ({
    placeId: String(r.place_id),
    displayName: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
    type: r.type,
  }));
}

export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HuberaMaps/1.0' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.display_name || null;
}
