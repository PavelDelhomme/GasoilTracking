/**
 * Destinations récentes (AsyncStorage) pour démarrage rapide de trajet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'gasoil_recent_destinations_v1';
const MAX = 8;

export type RecentDestination = {
  label: string;
  latitude?: number | null;
  longitude?: number | null;
  at: number;
};

export async function getRecentDestinations(limit = 6): Promise<RecentDestination[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentDestination[];
    if (!Array.isArray(list)) return [];
    return list.slice(0, limit);
  } catch {
    return [];
  }
}

export async function pushRecentDestination(entry: {
  label: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<void> {
  const label = (entry.label || '').trim();
  if (label.length < 2) return;
  try {
    const prev = await getRecentDestinations(MAX);
    const key = label.toLowerCase();
    const filtered = prev.filter((x) => x.label.toLowerCase() !== key);
    const next: RecentDestination[] = [
      {
        label,
        latitude: entry.latitude ?? null,
        longitude: entry.longitude ?? null,
        at: Date.now(),
      },
      ...filtered,
    ].slice(0, MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
