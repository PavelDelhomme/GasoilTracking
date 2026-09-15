/**
 * Catalogue véhicules runtime : seed APK + cache cloud (/api/vehicle-catalog).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  VEHICLE_CATALOG,
  VEHICLE_CATALOG_VERSION,
  searchVehicles as searchInCatalog,
  type VehiclePreset,
} from '@/constants/vehicles';
import { API_URL } from '@/lib/api';

const CACHE_KEY = 'gasoil_vehicle_catalog_v1';
const CACHE_META_KEY = 'gasoil_vehicle_catalog_meta_v1';
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

type CatalogPayload = {
  version: string;
  updatedAt: string;
  vehicles: VehiclePreset[];
};

let runtime: VehiclePreset[] | null = null;
let runtimeVersion = VEHICLE_CATALOG_VERSION;
let bootstrapped = false;

export function getVehicleCatalogVersion(): string {
  return runtimeVersion;
}

export function getVehicleCatalog(): VehiclePreset[] {
  return runtime?.length ? runtime : VEHICLE_CATALOG;
}

export function searchVehiclesLive(query: string): VehiclePreset[] {
  return searchInCatalog(query, getVehicleCatalog());
}

async function loadCache(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CatalogPayload;
    if (Array.isArray(parsed.vehicles) && parsed.vehicles.length > 50) {
      runtime = parsed.vehicles;
      runtimeVersion = parsed.version || runtimeVersion;
    }
  } catch {
    /* ignore */
  }
}

async function saveCache(payload: CatalogPayload): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  await AsyncStorage.setItem(
    CACHE_META_KEY,
    JSON.stringify({ fetchedAt: Date.now(), version: payload.version })
  );
}

/** Charge le cache local une fois (appelé au démarrage écran Garage / Add). */
export async function bootstrapVehicleCatalog(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  await loadCache();
}

/**
 * Tire le catalogue serveur si plus récent / cache trop vieux.
 * Ne plante jamais l’UI — garde le seed APK.
 */
export async function refreshVehicleCatalogFromApi(opts?: {
  force?: boolean;
}): Promise<{ ok: boolean; version: string; count: number; source: string }> {
  await bootstrapVehicleCatalog();
  try {
    const metaRaw = await AsyncStorage.getItem(CACHE_META_KEY);
    const meta = metaRaw ? (JSON.parse(metaRaw) as { fetchedAt?: number }) : {};
    const age = Date.now() - (meta.fetchedAt || 0);
    if (!opts?.force && runtime?.length && age < REFRESH_INTERVAL_MS) {
      return {
        ok: true,
        version: runtimeVersion,
        count: getVehicleCatalog().length,
        source: 'cache',
      };
    }

    const base = API_URL.replace(/\/$/, '');
    const res = await fetch(`${base}/api/vehicle-catalog`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return {
        ok: false,
        version: runtimeVersion,
        count: getVehicleCatalog().length,
        source: 'seed',
      };
    }
    const data = (await res.json()) as CatalogPayload;
    if (!Array.isArray(data.vehicles) || data.vehicles.length < 50) {
      return {
        ok: false,
        version: runtimeVersion,
        count: getVehicleCatalog().length,
        source: 'seed',
      };
    }
    runtime = data.vehicles;
    runtimeVersion = data.version || runtimeVersion;
    await saveCache({
      version: runtimeVersion,
      updatedAt: data.updatedAt || new Date().toISOString(),
      vehicles: data.vehicles,
    });
    return {
      ok: true,
      version: runtimeVersion,
      count: data.vehicles.length,
      source: 'api',
    };
  } catch {
    return {
      ok: false,
      version: runtimeVersion,
      count: getVehicleCatalog().length,
      source: 'seed',
    };
  }
}
