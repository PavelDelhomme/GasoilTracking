/**
 * Injection de session labo (flavors non-prod).
 *
 * Préférer fichier (évite troncature URI JWT) :
 *   adb push session.json /sdcard/Android/data/<pkg>/files/lab-session.json
 *   adb shell am start -a android.intent.action.VIEW -d '<scheme>://lab-session'
 *
 * Fallback query : ?token=&refresh=&user= (URI courte uniquement).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '@/context/AuthContext';
import type { AuthUser } from '@/lib/api';

type SessionPayload = {
  token: string;
  refresh?: string | null;
  user: AuthUser;
};

function labSessionAllowed(): boolean {
  const extra = Constants.expoConfig?.extra as
    | { followsProdOta?: boolean; appFlavor?: string }
    | undefined;
  if (extra?.followsProdOta === true) return false;
  const flavor = String(extra?.appFlavor || '');
  return ['qa', 'admin', 'dev', 'feat', 'preprod'].includes(flavor);
}

function androidExternalSessionPath(): string | null {
  if (Platform.OS !== 'android') return null;
  const pkg =
    Constants.expoConfig?.android?.package ||
    (Constants.expoConfig?.extra as { androidPackage?: string } | undefined)?.androidPackage;
  if (!pkg) return null;
  return `file:///sdcard/Android/data/${pkg}/files/lab-session.json`;
}

async function readSessionFile(): Promise<SessionPayload | null> {
  const candidates = [
    androidExternalSessionPath(),
    FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}lab-session.json` : null,
    FileSystem.documentDirectory ? `${FileSystem.documentDirectory}lab-session.json` : null,
  ].filter(Boolean) as string[];

  for (const uri of candidates) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) continue;
      const raw = await FileSystem.readAsStringAsync(uri);
      const data = JSON.parse(raw) as SessionPayload;
      if (data?.token && data?.user?.id) {
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch {
          /* best-effort wipe */
        }
        return data;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function sessionFromParams(params: {
  token?: string;
  refresh?: string;
  user?: string;
}): SessionPayload | null {
  const token = String(params.token || '').trim();
  let user: AuthUser | null = null;
  try {
    user = params.user ? (JSON.parse(String(params.user)) as AuthUser) : null;
  } catch {
    user = null;
  }
  if (!token || !user?.id || !user?.email) return null;
  return { token, refresh: String(params.refresh || '').trim() || null, user };
}

export default function LabSessionScreen() {
  const { applySession, refreshCloudNow } = useAuth();
  const params = useLocalSearchParams<{ token?: string; refresh?: string; user?: string }>();
  const [status, setStatus] = useState('Préparation session labo…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!labSessionAllowed()) {
        setStatus('Refusé — flavor prod');
        setTimeout(() => router.replace('/'), 800);
        return;
      }
      try {
        setStatus('Lecture session…');
        const fromFile = await readSessionFile();
        const payload = fromFile || sessionFromParams(params);
        if (!payload) {
          setStatus('Session introuvable (fichier ou paramètres)');
          setTimeout(() => router.replace('/auth'), 1500);
          return;
        }
        if (cancelled) return;
        setStatus(`Connexion ${payload.user.email}…`);
        await applySession(payload.token, payload.user, payload.refresh);
        try {
          await refreshCloudNow();
        } catch {
          /* sync best-effort */
        }
        if (!cancelled) {
          setStatus('OK');
          router.replace('/');
        }
      } catch (e) {
        if (!cancelled) {
          setStatus(e instanceof Error ? e.message : 'Échec session');
          setTimeout(() => router.replace('/auth'), 1500);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession, refreshCloudNow, params.token, params.refresh, params.user]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color="#c73a52" />
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  text: { fontSize: 15, color: '#334155', textAlign: 'center' },
});
