import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchSync, getToken, isPayloadTooLargeError, pushSync } from '@/lib/api';
import {
  applySnapshot,
  collectSnapshot,
  hasLocalUserData,
  normalizeSnapshot,
  type AppDataSnapshot,
} from '@/lib/dataSnapshot';
import { repairFillUpVehiclesAndBudgets } from '@/lib/repairFillUpVehicles';
import { prepareSnapshotForPush, slimSnapshotAggressive } from '@/lib/syncPayload';
import { getActiveTripLite } from '@/lib/database';

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
  try {
    const live = await getActiveTripLite();
    if (live?.isActive) {
      throw new Error('Terminez le trajet en cours avant la mise à jour.');
    }
  } catch (e) {
    if (e instanceof Error && /Terminez le trajet/.test(e.message)) throw e;
  }
  const snapshot = await saveLocalBackup();
  let cloudSynced = false;
  const token = await getToken();
  if (token) {
    try {
      await pushSyncSafe(snapshot);
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

/** Pousse le snapshot en compactant les tracés GPS (évite HTTP 413). */
async function pushSyncSafe(snapshot: AppDataSnapshot): Promise<void> {
  const prepared = prepareSnapshotForPush(snapshot);
  try {
    await pushSync(prepared);
  } catch (e) {
    if (!isPayloadTooLargeError(e)) throw e;
    await pushSync(slimSnapshotAggressive(prepared));
  }
}

/** Sync cloud complète (tous les objets) + backup local. */
export async function syncFullBackup(): Promise<boolean> {
  const token = await getToken();
  const snap = await saveLocalBackup();
  if (!token) return false;
  await pushSyncSafe(snap);
  return true;
}

/**
 * Tire les données cloud du compte connecté et remplace le local.
 * Utile après une correction côté serveur / autre appareil.
 */
export async function refreshFromCloud(): Promise<{
  ok: boolean;
  reason: 'no-auth' | 'empty' | 'applied' | 'active-trip';
  updatedAt?: string | null;
}> {
  const token = await getToken();
  if (!token) return { ok: false, reason: 'no-auth' };
  try {
    const live = await getActiveTripLite();
    if (live?.isActive) return { ok: false, reason: 'active-trip' };
  } catch {
    /* continue */
  }
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
 * Si le cloud est plus récent, tire ; sinon pousse.
 * Ne tire jamais un cloud « pauvre » (ex. 1 véhicule fantôme) par-dessus un local riche.
 */
export async function syncPreferNewer(): Promise<'pulled' | 'pushed' | 'skipped'> {
  const token = await getToken();
  if (!token) return 'skipped';
  try {
    const live = await getActiveTripLite();
    if (live?.isActive) return 'skipped';
  } catch {
    /* continue */
  }
  try {
    await repairFillUpVehiclesAndBudgets();
  } catch {
    /* ignore */
  }
  const remote = await fetchSync();
  const remoteSnap = normalizeSnapshot(remote?.data);
  const local = await collectSnapshot();
  const remoteAt = remote?.updatedAt ? Date.parse(remote.updatedAt) : 0;
  const localAt = local.exportedAt ? Date.parse(local.exportedAt) : 0;
  const remoteW = snapshotWeight(remoteSnap);
  const localW = snapshotWeight(local);

  // Local quasi vide + cloud riche → toujours tirer (jamais pousser un wipe).
  const localEmptyish = localW < 5 || (local.vehicles?.length || 0) === 0;
  const remoteHasData = !!remoteSnap && remoteW >= 5 && (remoteSnap.vehicles?.length || 0) > 0;
  if (localEmptyish && remoteHasData) {
    await applySnapshot(remoteSnap!, 'replace');
    try {
      await repairFillUpVehiclesAndBudgets();
    } catch {
      /* ignore */
    }
    await saveLocalBackup(await collectSnapshot());
    return 'pulled';
  }

  const remoteClearlyNewer = remoteAt > localAt + 2000;
  const remoteRicherAndNotOlder =
    remoteW > localW + 5 && remoteAt >= localAt - 2000;
  // Cloud nettement plus pauvre (même si même nb de véhicules) → pousser le local.
  const remoteClearlyPoorer = !!remoteSnap && localW > remoteW + 8;

  // Ne jamais pousser un local vide/pauvre par-dessus un cloud non vide.
  if (localEmptyish && remoteSnap) {
    return 'skipped';
  }

  // Ne jamais tirer un cloud plus léger juste parce qu’il est « plus récent ».
  if (remoteSnap && remoteClearlyPoorer) {
    await pushSyncSafe(local);
    await saveLocalBackup(local);
    return 'pushed';
  }

  if (remoteSnap && (remoteClearlyNewer || remoteRicherAndNotOlder)) {
    await applySnapshot(remoteSnap, 'replace');
    try {
      await repairFillUpVehiclesAndBudgets();
    } catch {
      /* ignore */
    }
    await saveLocalBackup(await collectSnapshot());
    return 'pulled';
  }
  await pushSyncSafe(local);
  await saveLocalBackup(local);
  return 'pushed';
}

/** Pousse le local vers le cloud sans jamais tirer (Nothing / appareil source de vérité). */
export async function forcePushLocalToCloud(): Promise<{ ok: boolean; reason: string }> {
  const token = await getToken();
  if (!token) return { ok: false, reason: 'no-auth' };
  try {
    const live = await getActiveTripLite();
    if (live?.isActive) return { ok: false, reason: 'active-trip' };
  } catch {
    /* continue */
  }
  try {
    await repairFillUpVehiclesAndBudgets();
  } catch {
    /* ignore */
  }
  const local = await collectSnapshot();
  local.exportedAt = new Date().toISOString();
  await pushSyncSafe(local);
  await saveLocalBackup(local);
  return { ok: true, reason: 'pushed' };
}
