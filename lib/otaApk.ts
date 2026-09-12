/**
 * Fichiers OTA internes (pas le dossier Téléchargements Android).
 */

export function otaApkFileName(version: string, versionCode: number): string {
  const v = String(version || '0').replace(/[^\w.\-]/g, '');
  const vc = Number.isFinite(versionCode) ? Math.trunc(versionCode) : 0;
  return `gasoil-${v}-vc${vc}.apk`;
}

/** Taille cohérente avec le serveur — 64 Kio de marge (headers / FS). */
export function isOtaFileComplete(
  actualSize?: number | null,
  expectedSize?: number | null
): boolean {
  if (actualSize == null || !Number.isFinite(actualSize) || actualSize < 1_000_000) {
    return false;
  }
  if (expectedSize == null || !Number.isFinite(expectedSize) || expectedSize <= 0) {
    return actualSize >= 5_000_000;
  }
  return Math.abs(actualSize - expectedSize) <= 64 * 1024;
}

export function shouldReuseOtaFile(opts: {
  exists: boolean;
  actualSize?: number | null;
  expectedSize?: number | null;
  fileVersionCode?: number | null;
  remoteVersionCode?: number | null;
}): boolean {
  if (!opts.exists) return false;
  if (
    opts.fileVersionCode != null &&
    opts.remoteVersionCode != null &&
    opts.fileVersionCode !== opts.remoteVersionCode
  ) {
    return false;
  }
  return isOtaFileComplete(opts.actualSize, opts.expectedSize);
}

/** Après install réussie : on peut jeter le cache si l’app a au moins ce versionCode. */
export function shouldDeleteOtaAfterInstall(
  localVersionCode: number,
  cachedVersionCode: number
): boolean {
  if (!Number.isFinite(localVersionCode) || !Number.isFinite(cachedVersionCode)) return false;
  return localVersionCode >= cachedVersionCode && cachedVersionCode > 0;
}
