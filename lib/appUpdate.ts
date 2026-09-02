import { Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import type { AppVersionInfo } from '@/lib/api';
import { markUpdatePending, prepareDataForUpdate } from '@/lib/backup';

export type UpdateProgress = {
  phase: 'backup' | 'download' | 'install' | 'done' | 'error';
  progress: number;
  message: string;
};

/**
 * MAJ Android in-app : sauvegarde → télécharge l’APK → ouvre l’installateur système.
 * Android conserve SQLite/AsyncStorage tant que c’est une mise à jour du même package
 * (pas une désinstallation).
 */
export async function performSafeApkUpdate(
  info: AppVersionInfo,
  onProgress?: (p: UpdateProgress) => void
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('Mise à jour APK disponible uniquement sur Android');
  }
  const apkUrl = info.apkUrl;
  if (!apkUrl) {
    throw new Error('URL APK manquante');
  }

  onProgress?.({
    phase: 'backup',
    progress: 0,
    message: 'Sauvegarde de vos données…',
  });
  const { cloudSynced } = await prepareDataForUpdate();
  await markUpdatePending(info.version, cloudSynced);
  onProgress?.({
    phase: 'backup',
    progress: 0.08,
    message: cloudSynced
      ? 'Sauvegarde locale + cloud OK'
      : 'Sauvegarde locale OK (cloud hors ligne)',
  });

  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) {
    throw new Error('Stockage local indisponible');
  }
  const dest = `${baseDir}gasoil-tracking-update.apk`;
  try {
    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {
    /* ignore */
  }

  onProgress?.({ phase: 'download', progress: 0.1, message: 'Téléchargement de la mise à jour…' });

  const download = FileSystem.createDownloadResumable(
    apkUrl,
    dest,
    {},
    (evt) => {
      const total = evt.totalBytesExpectedToWrite || 0;
      const written = evt.totalBytesWritten || 0;
      const pct = total > 0 ? written / total : 0;
      onProgress?.({
        phase: 'download',
        progress: 0.1 + pct * 0.8,
        message: total > 0 ? `Téléchargement… ${Math.round(pct * 100)} %` : 'Téléchargement…',
      });
    }
  );

  const result = await download.downloadAsync();
  if (!result?.uri) {
    throw new Error('Échec du téléchargement');
  }

  onProgress?.({
    phase: 'install',
    progress: 0.95,
    message: 'Ouverture de l’installateur Android…',
  });

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1,
      type: 'application/vnd.android.package-archive',
    });
  } catch {
    // Fallback INSTALL_PACKAGE
    await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
      data: contentUri,
      flags: 1,
    });
  }

  onProgress?.({
    phase: 'done',
    progress: 1,
    message: 'Confirmez l’installation — vos données sont conservées.',
  });
}

/** Ouvre la page / le lien de téléchargement (web ou fallback). */
export async function openExternalDownload(info: AppVersionInfo) {
  const url = info.apkUrl || info.downloadPage;
  if (url) await Linking.openURL(url);
}
