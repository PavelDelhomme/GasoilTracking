/**
 * Cache catalogue véhicules (phase C) :
 * seed APK → AsyncStorage → refresh GET /api/vehicle-catalog (7 j).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  VEHICLE_CATALOG,
  VEHICLE_CATALOG_SEED_VERSION,
  setRuntimeCatalog,
  type VehiclePreset,
} from '@/constants/vehicles';
import { API_URL } from '@/lib/api';

const CACHE_KEY = 'gasoil_vehicle_catalog_v1';
const META_KEY = 'gasoil_vehicle_catalog_meta_v1';
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export type VehicleCatalogPayload = {
  schema: string;
  versionCatalog: string;
  updatedAt: string;
  entries: VehiclePreset[];
};

type CatalogMeta = {
  versionCatalog: string;
  fetchedAt: number;
  etag?: string;
};

async function readMeta(): Promise<CatalogMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as CatalogMeta) : null;
  } catch {
    return null;
  }
}

async function writeCache(payload: VehicleCatalogPayload, etag?: string): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  await AsyncStorage.setItem(
    META_KEY,
    JSON.stringify({
      versionCatalog: payload.versionCatalog,
      fetchedAt: Date.now(),
      etag: etag || undefined,
    } satisfies CatalogMeta)
  );
  setRuntimeCatalog(payload.entries);
}

/** Applique le cache local (ou seed) au démarrage, sans réseau. */
export async function hydrateVehicleCatalogFromCache(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) {
      setRuntimeCatalog(null);
      return;
    }
    const payload = JSON.parse(raw) as VehicleCatalogPayload;
    if (Array.isArray(payload?.entries) && payload.entries.length > 0) {
      setRuntimeCatalog(payload.entries);
    }
  } catch {
    setRuntimeCatalog(null);
  }
}

/**
 * Rafraîchit depuis l’API si cache > 7 j (ou force).
 * Ne plante jamais : seed embarqué reste le filet.
 */
export async function refreshVehicleCatalog(opts?: { force?: boolean }): Promise<{
  ok: boolean;
  source: 'api' | 'cache' | 'seed' | 'skip';
  versionCatalog?: string;
}> {
  await hydrateVehicleCatalogFromCache();
  const meta = await readMeta();
  const age = meta ? Date.now() - meta.fetchedAt : Infinity;
  if (!opts?.force && meta && age < REFRESH_MS) {
    return { ok: true, source: 'skip', versionCatalog: meta.versionCatalog };
  }

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (meta?.etag) headers['If-None-Match'] = meta.etag;
    const res = await fetch(`${API_URL}/api/vehicle-catalog`, { headers });
    if (res.status === 304 && meta) {
      await AsyncStorage.setItem(
        META_KEY,
        JSON.stringify({ ...meta, fetchedAt: Date.now() } satisfies CatalogMeta)
      );
      return { ok: true, source: 'cache', versionCatalog: meta.versionCatalog };
    }
    if (!res.ok) {
      return {
        ok: false,
        source: meta ? 'cache' : 'seed',
        versionCatalog: meta?.versionCatalog || VEHICLE_CATALOG_SEED_VERSION,
      };
    }
    const payload = (await res.json()) as VehicleCatalogPayload;
    if (!Array.isArray(payload?.entries) || payload.entries.length === 0) {
      return { ok: false, source: 'seed', versionCatalog: VEHICLE_CATALOG_SEED_VERSION };
    }
    const etag = res.headers.get('etag') || undefined;
    await writeCache(payload, etag);
    return { ok: true, source: 'api', versionCatalog: payload.versionCatalog };
  } catch {
    return {
      ok: false,
      source: meta ? 'cache' : 'seed',
      versionCatalog: meta?.versionCatalog || VEHICLE_CATALOG_SEED_VERSION,
    };
  }
}

/** Snapshot seed pour scripts / API (même forme que la réponse HTTP). */
export function seedCatalogPayload(): VehicleCatalogPayload {
  return {
    schema: 'gasoil.vehicle-catalog.v1',
    versionCatalog: VEHICLE_CATALOG_SEED_VERSION,
    updatedAt: new Date().toISOString(),
    entries: VEHICLE_CATALOG,
  };
}
