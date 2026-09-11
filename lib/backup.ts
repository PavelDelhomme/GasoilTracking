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
import { prepareSnapshotForPush, slimSnapshotAggressive, snapshotContentHash } from '@/lib/syncPayload';
import { getActiveTripLite, stopActiveTrips } from '@/lib/database';
import { finalizeStaleActiveTrip } from '@/lib/finalizeStaleTrip';
import { decideSyncAction } from '@/lib/syncDecision';

const BACKUP_KEY = 'gasoil_local_backup_v1';
const PENDING_UPDATE_KEY = 'gasoil_pending_update_v1';
const SYNC_META_KEY = 'gasoil_sync_meta_v1';

type SyncMeta = {
  lastPushedAt: number;
  lastPulledServerAt: number;
  lastRemoteHash: string;
};

async function readSyncMeta(): Promise<SyncMeta> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_META_KEY);
    if (!raw) return { lastPushedAt: 0, lastPulledServerAt: 0, lastRemoteHash: '' };
    const p = JSON.parse(raw) as Partial<SyncMeta>;
    return {
      lastPushedAt: Number(p.lastPushedAt) || 0,
      lastPulledServerAt: Number(p.lastPulledServerAt) || 0,
      lastRemoteHash: typeof p.lastRemoteHash === 'string' ? p.lastRemoteHash : '',
    };
  } catch {
    return { lastPushedAt: 0, lastPulledServerAt: 0, lastRemoteHash: '' };
  }
}

async function writeSyncMeta(patch: Partial<SyncMeta>): Promise<void> {
  const cur = await readSyncMeta();
  await AsyncStorage.setItem(SYNC_META_KEY, JSON.stringify({ ...cur, ...patch }));
}

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
    // Zombies (crash / Freecess) : ne pas bloquer la MAJ — on clôture puis on sauvegarde.
    await finalizeStaleActiveTrip();
    const live = await getActiveTripLite();
    if (live?.isActive) {
      const tiny = (live.distanceKm || 0) < 0.5;
      if (tiny) {
        await stopActiveTrips();
      } else {
        throw new Error(
          'Terminez le trajet en cours avant la mise à jour (ou reportez la MAJ).'
        );
      }
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
  await writeSyncMeta({
    lastPushedAt: Date.now(),
    lastRemoteHash: snapshotContentHash(snapshot),
  });
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
    // Clôture d’abord les zombies (crash / Freecess) — un faux « trajet actif »
    // ne doit pas bloquer un pull explicite qui remplace tout le local.
    await finalizeStaleActiveTrip();
    const live = await getActiveTripLite();
    if (live?.isActive) {
      await stopActiveTrips();
    }
  } catch {
    /* continue */
  }
  const remote = await fetchSync();
  const snap = normalizeSnapshot(remote?.data);
  if (!snap) return { ok: false, reason: 'empty', updatedAt: remote?.updatedAt ?? null };
  await applySnapshot(snap, 'replace');
  await saveLocalBackup(snap);
  const serverAt = remote?.updatedAt ? Date.parse(remote.updatedAt) || Date.now() : Date.now();
  await writeSyncMeta({
    lastPulledServerAt: serverAt,
    lastRemoteHash: snapshotContentHash(snap),
    // Pull explicite : cloud = source — évite un re-push immédiat de l’ancien local.
    lastPushedAt: serverAt,
  });
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
 * Activité métier (trajets / pleins) — ignore `exportedAt` (souvent tamponné à now
 * par collectSnapshot → fausse « nouveauté » locale).
 */
function snapshotActivityAt(snap: {
  exportedAt?: string;
  trips?: { startTime?: string; endTime?: string | null }[];
  fillUps?: { date?: string }[];
  vehicles?: { estimatedFuelLiters?: number | null; currentOdometer?: number | null; trackedKm?: number | null }[];
} | null): number {
  if (!snap) return 0;
  let max = 0;
  for (const t of snap.trips || []) {
    const a = Date.parse(t.endTime || t.startTime || '') || 0;
    if (a > max) max = a;
  }
  for (const f of snap.fillUps || []) {
    const a = Date.parse(f.date || '') || 0;
    if (a > max) max = a;
  }
  return max;
}

/** Somme des km de trajets confirmés — signal fort que le local a « vécu » plus que le cloud. */
function snapshotTripKm(snap: { trips?: { distanceKm?: number; isActive?: boolean; status?: string }[] } | null): number {
  if (!snap?.trips) return 0;
  return snap.trips
    .filter((t) => !t.isActive && t.status !== 'rejected')
    .reduce((acc, t) => acc + (Number(t.distanceKm) || 0), 0);
}

/**
 * Si le cloud est plus récent, tire ; sinon pousse.
 * Ne tire jamais un cloud « pauvre » (ex. 1 véhicule fantôme) par-dessus un local riche.
 * Privilégie le téléphone s’il a plus d’activité trajet / km (source de vérité terrain).
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
  const localHash = snapshotContentHash(local);
  const remoteHash = snapshotContentHash(remoteSnap);
  const meta = await readSyncMeta();
  const remoteServerAt = remote?.updatedAt ? Date.parse(remote.updatedAt) || 0 : 0;

  // Identiques (hors exportedAt / tracés GPS) → pas de push cosmétique.
  if (remoteSnap && localHash && localHash === remoteHash) {
    await writeSyncMeta({
      lastRemoteHash: remoteHash,
      lastPulledServerAt: Math.max(meta.lastPulledServerAt, remoteServerAt),
    });
    return 'skipped';
  }

  const remoteW = snapshotWeight(remoteSnap);
  const action = decideSyncAction({
    localHash,
    remoteHash,
    remoteServerAt,
    lastPushedAt: meta.lastPushedAt,
    lastPulledServerAt: meta.lastPulledServerAt,
    localW: (local.vehicles?.length || 0) === 0 ? 0 : snapshotWeight(local),
    remoteW: remoteSnap && (remoteSnap.vehicles?.length || 0) > 0 ? remoteW : 0,
    localKm: snapshotTripKm(local),
    remoteKm: snapshotTripKm(remoteSnap),
    localTripCount: local.trips?.length || 0,
    remoteTripCount: remoteSnap?.trips?.length || 0,
    localActivityAt: snapshotActivityAt(local),
    remoteActivityAt: snapshotActivityAt(remoteSnap),
  });

  if (action === 'skip' || !remoteSnap) {
    if (action === 'skip') return 'skipped';
    // Pas de remote → pousser si on a du local
    if ((local.vehicles?.length || 0) > 0) {
      await pushSyncSafe(local);
      await saveLocalBackup(local);
      return 'pushed';
    }
    return 'skipped';
  }

  if (action === 'pull') {
    await applySnapshot(remoteSnap, 'replace');
    try {
      await repairFillUpVehiclesAndBudgets();
    } catch {
      /* ignore */
    }
    await saveLocalBackup(await collectSnapshot());
    await writeSyncMeta({
      lastPulledServerAt: remoteServerAt || Date.now(),
      lastRemoteHash: remoteHash,
      lastPushedAt: remoteServerAt || Date.now(),
    });
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
  // Garde-fou : ne jamais écraser un cloud riche avec un local vide/pauvre
  try {
    const remote = await fetchSync();
    const remoteSnap = normalizeSnapshot(remote?.data);
    const localW = snapshotWeight(local);
    const remoteW = snapshotWeight(remoteSnap);
    const localEmptyish = localW < 5 || (local.vehicles?.length || 0) === 0;
    const remoteHasData = !!remoteSnap && remoteW >= 5 && (remoteSnap.vehicles?.length || 0) > 0;
    if (localEmptyish && remoteHasData) {
      return { ok: false, reason: 'local-empty' };
    }
    if (remoteSnap && remoteW > localW + 15 && (remoteSnap.trips?.length || 0) > (local.trips?.length || 0) + 3) {
      return { ok: false, reason: 'cloud-richer' };
    }
  } catch {
    /* offline : on pousse quand même si on a du local */
  }
  local.exportedAt = new Date().toISOString();
  await pushSyncSafe(local);
  await saveLocalBackup(local);
  return { ok: true, reason: 'pushed' };
}
