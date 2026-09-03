import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchSync, getToken, pushSync } from '@/lib/api';
import {
  applySnapshot,
  collectSnapshot,
  hasLocalUserData,
  normalizeSnapshot,
  type AppDataSnapshot,
} from '@/lib/dataSnapshot';

const BACKUP_KEY = 'gasoil_local_backup_v1';
const PENDING_UPDATE_KEY = 'gasoil_pending_update_v1';

export type PendingUpdateMeta = {
  targetVersion: string;
  savedAt: string;
  cloudSynced: boolean;
};

/** Sauvegarde locale AsyncStorage (survit à une MAJ APK ; filet si wipe). */
export async function saveLocalBackup(snapshot?: AppDataSnapshot): Promise<AppDataSnapshot> {
  const snap = snapshot || (await collectSnapshot());
  await AsyncStorage.setItem(BACKUP_KEY, JSON.stringify(snap));
  return snap;
}

export async function loadLocalBackup(): Promise<AppDataSnapshot | null> {
  const raw = await AsyncStorage.getItem(BACKUP_KEY);
  if (!raw) return null;
  try {
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Avant install : backup local + push cloud si compte connecté. */
export async function prepareDataForUpdate(): Promise<{
  snapshot: AppDataSnapshot;
  cloudSynced: boolean;
}> {
  const snapshot = await saveLocalBackup();
  let cloudSynced = false;
  const token = await getToken();
  if (token) {
    try {
      await pushSync(snapshot);
      cloudSynced = true;
    } catch {
      cloudSynced = false;
    }
  }
  return { snapshot, cloudSynced };
}

export async function markUpdatePending(targetVersion: string, cloudSynced: boolean) {
  const meta: PendingUpdateMeta = {
    targetVersion,
    savedAt: new Date().toISOString(),
    cloudSynced,
  };
  await AsyncStorage.setItem(PENDING_UPDATE_KEY, JSON.stringify(meta));
}

export async function clearUpdatePending() {
  await AsyncStorage.removeItem(PENDING_UPDATE_KEY);
}

export async function getUpdatePending(): Promise<PendingUpdateMeta | null> {
  const raw = await AsyncStorage.getItem(PENDING_UPDATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingUpdateMeta;
  } catch {
    return null;
  }
}

/**
 * Après démarrage / MAJ : si la base est vide, restaure backup local puis cloud.
 * Si la base est intacte (cas normal d’une MAJ APK), ne touche à rien.
 */
export async function recoverDataAfterUpdateIfNeeded(): Promise<'ok' | 'restored-local' | 'restored-cloud' | 'empty'> {
  const pending = await getUpdatePending();
  const hasData = await hasLocalUserData();

  if (hasData) {
    if (pending) await clearUpdatePending();
    // Compte connecté : privilégier le cloud s’il est plus récent (évite d’écraser une correction serveur)
    const token = await getToken();
    if (token) {
      try {
        await syncPreferNewer();
      } catch {
        /* offline */
      }
    }
    return 'ok';
  }

  const local = await loadLocalBackup();
  if (local) {
    await applySnapshot(local, 'replace');
    if (pending) await clearUpdatePending();
    return 'restored-local';
  }

  const token = await getToken();
  if (token) {
    try {
      const remote = await fetchSync();
      const snap = normalizeSnapshot(remote?.data);
      if (snap) {
        await applySnapshot(snap, 'replace');
        await saveLocalBackup(snap);
        if (pending) await clearUpdatePending();
        return 'restored-cloud';
      }
    } catch {
      /* offline */
    }
  }

  if (pending) await clearUpdatePending();
  return 'empty';
}

/** Sync cloud complète (tous les objets) + backup local. */
export async function syncFullBackup(): Promise<boolean> {
  const token = await getToken();
  const snap = await saveLocalBackup();
  if (!token) return false;
  await pushSync(snap);
  return true;
}

/**
 * Tire les données cloud du compte connecté et remplace le local.
 * Utile après une correction côté serveur / autre appareil.
 */
export async function refreshFromCloud(): Promise<{
  ok: boolean;
  reason: 'no-auth' | 'empty' | 'applied';
  updatedAt?: string | null;
}> {
  const token = await getToken();
  if (!token) return { ok: false, reason: 'no-auth' };
  const remote = await fetchSync();
  const snap = normalizeSnapshot(remote?.data);
  if (!snap) return { ok: false, reason: 'empty', updatedAt: remote?.updatedAt ?? null };
  await applySnapshot(snap, 'replace');
  await saveLocalBackup(snap);
  return { ok: true, reason: 'applied', updatedAt: remote?.updatedAt ?? null };
}

function snapshotWeight(snap: {
  vehicles: unknown[];
  fillUps: unknown[];
  trips: unknown[];
  places: unknown[];
  budgets: unknown[];
  recurringRoutes: unknown[];
} | null): number {
  if (!snap) return 0;
  return (
    snap.vehicles.length * 10 +
    snap.fillUps.length * 5 +
    snap.trips.length * 2 +
    snap.places.length * 3 +
    snap.budgets.length +
    snap.recurringRoutes.length * 4
  );
}

/**
 * Si le cloud est plus récent ou nettement plus riche, tire ; sinon pousse.
 * Évite d’écraser un snapshot cloud complet avec un local quasi vide après login.
 */
export async function syncPreferNewer(): Promise<'pulled' | 'pushed' | 'skipped'> {
  const token = await getToken();
  if (!token) return 'skipped';
  const remote = await fetchSync();
  const remoteSnap = normalizeSnapshot(remote?.data);
  const local = await collectSnapshot();
  const remoteAt = remote?.updatedAt ? Date.parse(remote.updatedAt) : 0;
  const localAt = local.exportedAt ? Date.parse(local.exportedAt) : 0;
  const remoteW = snapshotWeight(remoteSnap);
  const localW = snapshotWeight(local);

  if (remoteSnap && (remoteAt > localAt + 2000 || remoteW > localW + 5)) {
    await applySnapshot(remoteSnap, 'replace');
    await saveLocalBackup(remoteSnap);
    return 'pulled';
  }
  await pushSync(local);
  await saveLocalBackup(local);
  return 'pushed';
}
