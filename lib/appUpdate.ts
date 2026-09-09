import { Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import type { AppVersionInfo } from '@/lib/api';
import { markUpdatePending, prepareDataForUpdate } from '@/lib/backup';

export type UpdateProgress = {
  phase: 'backup' | 'permission' | 'download' | 'install' | 'done' | 'error';
  progress: number;
  message: string;
};

const PKG = Constants.expoConfig?.android?.package || 'com.gasoiltracking.app';
/** FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK */
const INSTALL_FLAGS = 1 | 268435456;

function resolveApkUrl(info: AppVersionInfo): string {
  const url = info.apkUrl || '';
  if (!url) throw new Error('URL APK manquante sur le serveur');
  // Forcer HTTPS domaine prod
  if (url.startsWith('/')) {
    return `https://gasoil-tracking.delhomme.ovh${url}`;
  }
  return url;
}

async function openInstallPermissionSettings() {
  try {
    await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
      data: `package:${PKG}`,
    });
  } catch {
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        { data: `package:${PKG}` }
      );
    } catch {
      await Linking.openSettings();
    }
  }
}

async function launchApkInstaller(fileUri: string) {
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: INSTALL_FLAGS,
      type: 'application/vnd.android.package-archive',
    });
    return;
  } catch {
    /* fallback */
  }
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
      data: contentUri,
      flags: INSTALL_FLAGS,
      type: 'application/vnd.android.package-archive',
    });
    return;
  } catch (e) {
    await openInstallPermissionSettings();
    throw new Error(
      'Autorisez « Installer des apps inconnues » pour Gasoil Tracking, puis relancez la mise à jour.'
    );
  }
}

/**
 * OTA Android in-app depuis gasoil-tracking.delhomme.ovh :
 * backup (local + cloud) → télécharge l’APK → installateur système.
 * Même package → AsyncStorage / session JWT conservés (pas de désinstall).
 */
export async function performSafeApkUpdate(
  info: AppVersionInfo,
  onProgress?: (p: UpdateProgress) => void
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('Mise à jour APK disponible uniquement sur Android');
  }
  const apkUrl = resolveApkUrl(info);

  onProgress?.({
    phase: 'backup',
    progress: 0.02,
    message: 'Sauvegarde compte & données…',
  });
  const { cloudSynced } = await prepareDataForUpdate();
  await markUpdatePending(info.version, cloudSynced);
  onProgress?.({
    phase: 'backup',
    progress: 0.08,
    message: cloudSynced
      ? 'Session + cloud sauvegardés'
      : 'Session locale sauvegardée (cloud hors ligne)',
  });

  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) {
    throw new Error('Stockage local indisponible');
  }
  const dest = `${baseDir}gasoil-tracking-ota.apk`;
  try {
    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {
    /* ignore */
  }

  onProgress?.({
    phase: 'download',
    progress: 0.1,
    message: 'Téléchargement depuis le serveur…',
  });

  const download = FileSystem.createDownloadResumable(
    apkUrl,
    dest,
    {
      headers: {
        Accept: 'application/vnd.android.package-archive,*/*',
      },
    },
    (evt) => {
      const total = evt.totalBytesExpectedToWrite || 0;
      const written = evt.totalBytesWritten || 0;
      const pct = total > 0 ? written / total : 0;
      onProgress?.({
        phase: 'download',
        progress: 0.1 + pct * 0.75,
        message:
          total > 0
            ? `Téléchargement… ${Math.round(pct * 100)} %`
            : 'Téléchargement en cours…',
      });
    }
  );

  const result = await download.downloadAsync();
  if (!result?.uri) {
    throw new Error('Échec du téléchargement OTA');
  }

  const infoFile = await FileSystem.getInfoAsync(result.uri);
  if (!infoFile.exists || (infoFile.size != null && infoFile.size < 1_000_000)) {
    throw new Error('APK téléchargée invalide ou trop petite');
  }
  if (info.apkSize != null && infoFile.size != null) {
    const delta = Math.abs(infoFile.size - info.apkSize);
    if (delta > 64 * 1024) {
      throw new Error(
        `APK incomplète (${infoFile.size} o ≠ ${info.apkSize} o). Réessayez la mise à jour.`
      );
    }
  }

  // Magique ZIP (APK) — évite d’ouvrir un HTML d’erreur → « package non validé ».
  try {
    const head = await FileSystem.readAsStringAsync(result.uri, {
      encoding: 'base64' as FileSystem.EncodingType,
      length: 4,
      position: 0,
    });
    // "PK\x03\x04" in base64 starts with "UEsD"
    if (!head.startsWith('UEs')) {
      throw new Error('Fichier téléchargé n’est pas un APK (réseau / cache).');
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('APK')) throw e;
    /* lecture partielle non supportée sur certaines implémentations — ignore */
  }

  onProgress?.({
    phase: 'install',
    progress: 0.92,
    message: 'Ouverture de l’installateur…',
  });

  try {
    await launchApkInstaller(result.uri);
  } catch (e) {
    throw new Error(
      (e instanceof Error ? e.message : 'Installation impossible') +
        ' Si Android dit que le package n’a pas pu être validé : réessayez la mise à jour (APK incomplète) ou contactez le support si le versionCode est trop bas.'
    );
  }

  onProgress?.({
    phase: 'done',
    progress: 1,
    message: 'Validez l’installation Android — votre connexion sera conservée.',
  });
}

/** Ouvre la page / le lien de téléchargement (web, iOS PWA ou APK). */
export async function openExternalDownload(info: AppVersionInfo) {
  const url =
    Platform.OS === 'ios'
      ? info.iosInstallUrl || info.downloadPage || info.webUrl || info.apkUrl
      : info.apkUrl || info.downloadPage || info.webUrl;
  if (url) await Linking.openURL(url);
}

/**
 * Mise à jour web réelle : désinscrit le SW, vide les caches, force un reload
 * (sinon `location.reload()` recharge souvent le même shell en cache).
 */
export async function performWebHardReload(targetVersion?: string): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }

  const url = new URL(window.location.href);
  // Strip ancien bust pour éviter d’empiler ; force un nouveau fetch du shell
  url.searchParams.delete('_gt');
  url.searchParams.set('_gt', targetVersion || String(Date.now()));
  url.searchParams.set('_cb', String(Date.now()));
  window.location.replace(url.toString());
}

/** True si on a déjà tenté un hard-reload vers cette version (anti-boucle). */
export function webReloadAlreadyTried(targetVersion: string): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    const gt = new URL(window.location.href).searchParams.get('_gt');
    return gt === targetVersion;
  } catch {
    return false;
  }
}

/** Ouvre les réglages d’autorisation d’installation (Android). */
export async function openAndroidInstallSettings() {
  if (Platform.OS === 'android') await openInstallPermissionSettings();
}
