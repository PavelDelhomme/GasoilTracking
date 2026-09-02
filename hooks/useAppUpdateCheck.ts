import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  compareVersions,
  fetchAppVersion,
  getLocalAppVersion,
  type AppVersionInfo,
} from '@/lib/api';
import { openExternalDownload, performSafeApkUpdate, type UpdateProgress } from '@/lib/appUpdate';

/** Vérifie s’il y a une nouvelle APK et pilote la modal de mise à jour. */
export function useAppUpdateCheck() {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const [visible, setVisible] = useState(false);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;

    (async () => {
      try {
        const remote = await fetchAppVersion();
        if (cancelled) return;
        setInfo(remote);
        const local = getLocalAppVersion();
        if (compareVersions(remote.version, local) > 0) {
          const must =
            remote.forceUpdate || compareVersions(local, remote.minVersion) < 0;
          setForce(must);
          setVisible(true);
        }
      } catch {
        /* offline */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const startUpdate = useCallback(async () => {
    if (!info) return;
    setError(null);
    setBusy(true);
    try {
      if (Platform.OS === 'android') {
        await performSafeApkUpdate(info, setProgress);
      } else {
        await openExternalDownload(info);
        setVisible(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      try {
        await openExternalDownload(info);
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  }, [info]);

  const dismiss = useCallback(() => {
    if (force || busy) return;
    setVisible(false);
  }, [force, busy]);

  return {
    info,
    visible,
    force,
    busy,
    progress,
    error,
    startUpdate,
    dismiss,
  };
}
