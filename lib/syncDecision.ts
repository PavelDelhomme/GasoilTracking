/**
 * Décision push / pull / skip — pur (testable), basé hash + horloge serveur.
 */

export type SyncAction = 'pull' | 'push' | 'skip';

export type SyncDecisionInput = {
  localHash: string;
  remoteHash: string;
  /** updated_at serveur (ms), 0 si inconnu */
  remoteServerAt: number;
  /** Dernier push réussi depuis cet appareil (ms) */
  lastPushedAt: number;
  /** Dernier pull réussi (ms serveur remote.updatedAt) */
  lastPulledServerAt: number;
  localW: number;
  remoteW: number;
  localKm: number;
  remoteKm: number;
  localTripCount: number;
  remoteTripCount: number;
  /** Activité métier locale (max endTime/fill) — sans exportedAt tamponné */
  localActivityAt: number;
  remoteActivityAt: number;
};

/**
 * Règles :
 * 1. Hash égal → skip
 * 2. Local vide + cloud riche → pull
 * 3. Cloud modifié après notre dernier push (hash ≠) et pas plus de km/trajets locaux → pull
 *    (évite d’écraser une correction serveur / autre appareil)
 * 4. Local nettement plus « vécu » (km / trajets) → push
 * 5. Cloud clairement plus récent / plus riche → pull
 * 6. Sinon push
 */
export function decideSyncAction(i: SyncDecisionInput): SyncAction {
  if (i.remoteHash && i.localHash && i.localHash === i.remoteHash) {
    return 'skip';
  }

  const localEmptyish = i.localW < 5;
  const remoteHasData = i.remoteW >= 5;

  if (localEmptyish && remoteHasData) return 'pull';
  if (localEmptyish) return 'skip';

  const localMoreTrips = i.localTripCount > i.remoteTripCount;
  const localMoreKm = i.localKm > i.remoteKm + 5;
  const localStrictlyAhead = localMoreTrips || localMoreKm;

  // Correction cloud / autre appareil après notre dernier push : tirer sauf si on a vraiment plus de données.
  const cloudChangedSincePush =
    !!i.remoteHash &&
    i.localHash !== i.remoteHash &&
    i.remoteServerAt > 0 &&
    i.remoteServerAt > i.lastPushedAt + 1500;

  if (cloudChangedSincePush && !localStrictlyAhead) {
    return 'pull';
  }

  // Même squelette (nb trajets + km ~égaux) mais hash différent → confiance horloge serveur
  const sameSkeleton =
    i.localTripCount === i.remoteTripCount &&
    Math.abs(i.localKm - i.remoteKm) < 0.75 &&
    Math.abs(i.localW - i.remoteW) <= 8;
  if (sameSkeleton && i.remoteServerAt > i.lastPushedAt + 1500) {
    return 'pull';
  }
  if (sameSkeleton && i.remoteServerAt > i.localActivityAt + 2000) {
    return 'pull';
  }

  const remoteClearlyPoorer =
    i.localW > i.remoteW + 8 || i.localTripCount > i.remoteTripCount + 1;

  const localMoreLived =
    localMoreKm ||
    (i.localActivityAt > i.remoteActivityAt + 60_000 &&
      i.localW + 3 >= i.remoteW &&
      i.localTripCount >= i.remoteTripCount);

  if (remoteClearlyPoorer || (localMoreLived && !cloudChangedSincePush)) {
    return 'push';
  }

  const remoteClearlyNewer = i.remoteServerAt > i.localActivityAt + 2000 ||
    i.remoteActivityAt > i.localActivityAt + 2000;
  const remoteRicherAndNotOlder =
    (i.remoteW > i.localW + 5 || i.remoteTripCount > i.localTripCount + 1) &&
    Math.max(i.remoteServerAt, i.remoteActivityAt) >= i.localActivityAt - 2000;

  if ((remoteClearlyNewer || remoteRicherAndNotOlder) && !localMoreLived) {
    return 'pull';
  }

  if (i.remoteTripCount > i.localTripCount) {
    return 'pull';
  }

  return 'push';
}
