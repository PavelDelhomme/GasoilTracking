/**
 * Tampon GPS hors SQLite (AsyncStorage).
 * La task Expo arrière-plan n’a pas toujours accès à expo-sqlite (headless /
 * new arch) : sans ce tampon, la notif FGS tourne et aucun point n’est sauvé.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'gasoil_live_trip_buffer_v1';

export type LiveTripBuffer = {
  tripId: number;
  vehicleId: number;
  routePoints: string;
  distanceKm: number;
  estimatedFuelUsed?: number;
  estimatedCost?: number;
  updatedAt: number;
  lastFixAt?: number;
  acceptedFixes?: number;
};

export async function readLiveTripBuffer(): Promise<LiveTripBuffer | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveTripBuffer;
    if (!parsed || typeof parsed.tripId !== 'number') return null;
    if (typeof parsed.routePoints !== 'string') parsed.routePoints = '[]';
    return parsed;
  } catch {
    return null;
  }
}

export async function writeLiveTripBuffer(buf: LiveTripBuffer): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(buf));
}

export async function seedLiveTripBuffer(opts: {
  tripId: number;
  vehicleId: number;
  routePoints: string;
}): Promise<void> {
  await writeLiveTripBuffer({
    tripId: opts.tripId,
    vehicleId: opts.vehicleId,
    routePoints: opts.routePoints || '[]',
    distanceKm: 0,
    updatedAt: Date.now(),
    acceptedFixes: 0,
  });
}

export async function clearLiveTripBuffer(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Garde le tracé le plus long (évite last-write-wins SQLite vs tampon). */
export function pickRicherRoutePoints(a?: string | null, b?: string | null): string {
  const left = a || '[]';
  const right = b || '[]';
  const len = (raw: string): number => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  };
  return len(right) > len(left) ? right : left;
}
