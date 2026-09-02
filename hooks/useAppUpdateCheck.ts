import { useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import {
  compareVersions,
  fetchAppVersion,
  getLocalAppVersion,
  type AppVersionInfo,
} from '@/lib/api';

/** Vérifie au démarrage s'il existe une nouvelle version APK */
export function useAppUpdateCheck() {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);

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
          const open = () => Linking.openURL(remote.apkUrl || remote.downloadPage);
          if (remote.forceUpdate || compareVersions(local, remote.minVersion) < 0) {
            Alert.alert(
              'Mise à jour obligatoire',
              `Version ${remote.version} disponible.\n${remote.releaseNotes || ''}`.trim(),
              [{ text: 'Télécharger', onPress: open }]
            );
          } else {
            Alert.alert(
              'Nouvelle version',
              `Gasoil Tracking ${remote.version} est disponible.\n${remote.releaseNotes || ''}`.trim(),
              [
                { text: 'Plus tard', style: 'cancel' },
                { text: 'Télécharger', onPress: open },
              ]
            );
          }
        }
      } catch {
        /* offline : pas de blocage */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
