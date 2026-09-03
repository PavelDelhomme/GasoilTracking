import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import {
  compareVersions,
  fetchAppVersion,
  getLocalAppVersion,
  type AppVersionInfo,
} from '@/lib/api';
import { openExternalDownload, performSafeApkUpdate, performWebHardReload, type UpdateProgress } from '@/lib/appUpdate';

const SNOOZE_KEY = 'gasoil_update_snooze_v1';
const SNOOZE_MS = 2 * 60 * 60 * 1000; // 2 h

type Snooze = { version: string; until: number };

type AppUpdateContextType = {
  info: AppVersionInfo | null;
  visible: boolean;
  force: boolean;
  busy: boolean;
  progress: UpdateProgress | null;
  error: string | null;
  updateAvailable: boolean;
  checkNow: (opts?: { ignoreSnooze?: boolean }) => Promise<boolean>;
  startUpdate: () => Promise<void>;
  snoozeLater: () => Promise<void>;
  dismiss: () => void;
  openManualInstall: () => Promise<void>;
};

const AppUpdateContext = createContext<AppUpdateContextType | null>(null);

async function readSnooze(): Promise<Snooze | null> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_KEY);
    return raw ? (JSON.parse(raw) as Snooze) : null;
  } catch {
    return null;
  }
}

async function writeSnooze(s: Snooze | null) {
  if (!s) await AsyncStorage.removeItem(SNOOZE_KEY);
  else await AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify(s));
}

export function AppUpdateProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const [visible, setVisible] = useState(false);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const evaluate = useCallback(async (remote: AppVersionInfo, ignoreSnooze = false) => {
    const local = getLocalAppVersion();
    const newer = compareVersions(remote.version, local) > 0;
    setUpdateAvailable(newer);
    if (!newer) {
      setVisible(false);
      setForce(false);
      await writeSnooze(null);
      return false;
    }
    const must =
      remote.forceUpdate || compareVersions(local, remote.minVersion) < 0;
    setForce(must);
    if (must) {
      setVisible(true);
      return true;
    }
    if (!ignoreSnooze) {
      const snooze = await readSnooze();
      if (snooze && snooze.version === remote.version && snooze.until > Date.now()) {
        setVisible(false);
        return false;
      }
    }
    setVisible(true);
    return true;
  }, []);

  const checkNow = useCallback(
    async (opts?: { ignoreSnooze?: boolean }) => {
      try {
        const remote = await fetchAppVersion();
        setInfo(remote);
        return evaluate(remote, opts?.ignoreSnooze === true);
      } catch {
        return false;
      }
    },
    [evaluate]
  );

  useEffect(() => {
    void checkNow();
  }, [checkNow]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkNow();
    });
    return () => sub.remove();
  }, [checkNow]);

  const startUpdate = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const remote = (await fetchAppVersion().catch(() => null)) || info;
      if (!remote) {
        setError('Impossible de joindre le serveur de mise à jour.');
        return;
      }
      setInfo(remote);
      await writeSnooze(null);
      const local = getLocalAppVersion();
      const newer = compareVersions(remote.version, local) > 0;
      if (!newer) {
        setUpdateAvailable(false);
        setVisible(false);
        setProgress({
          phase: 'done',
          progress: 1,
          message: `Déjà à jour (v${local}).`,
        });
        return;
      }
      setUpdateAvailable(true);
      setVisible(true);
      if (Platform.OS === 'android') {
        await performSafeApkUpdate(remote, setProgress);
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        setProgress({
          phase: 'download',
          progress: 0.6,
          message: 'Vidage cache & rechargement…',
        });
        await performWebHardReload(remote.version);
      } else {
        await openExternalDownload(remote);
        setVisible(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setProgress({ phase: 'error', progress: 0, message: msg });
    } finally {
      setBusy(false);
    }
  }, [info]);

  const snoozeLater = useCallback(async () => {
    if (force || busy) return;
    const version = info?.version || getLocalAppVersion();
    await writeSnooze({ version, until: Date.now() + SNOOZE_MS });
    setVisible(false);
  }, [force, busy, info?.version]);

  const dismiss = useCallback(() => {
    if (force || busy) return;
    setVisible(false);
  }, [force, busy]);

  const openManualInstall = useCallback(async () => {
    const remote = info || (await fetchAppVersion().catch(() => null));
    if (remote) {
      setInfo(remote);
      await openExternalDownload(remote);
      return;
    }
    if (typeof window !== 'undefined') {
      /* fallback */
    }
  }, [info]);

  const value = useMemo(
    () => ({
      info,
      visible,
      force,
      busy,
      progress,
      error,
      updateAvailable,
      checkNow,
      startUpdate,
      snoozeLater,
      dismiss,
      openManualInstall,
    }),
    [
      info,
      visible,
      force,
      busy,
      progress,
      error,
      updateAvailable,
      checkNow,
      startUpdate,
      snoozeLater,
      dismiss,
      openManualInstall,
    ]
  );

  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}

export function useAppUpdate() {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) throw new Error('useAppUpdate must be used within AppUpdateProvider');
  return ctx;
}
