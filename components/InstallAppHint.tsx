import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { API_URL } from '@/lib/api';

type DeferredPrompt = {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

const DISMISS_KEY = 'gasoil_install_hint_dismissed';

/**
 * Invite à installer comme une vraie app (PWA) — Chrome/Android + guide Safari iOS.
 */
export function InstallAppHint() {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null);
  const ios = useMemo(() => Platform.OS === 'web' && isIosDevice(), []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (isStandaloneDisplay()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }

    setVisible(true);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as unknown as DeferredPrompt);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  if (Platform.OS !== 'web' || !visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      dismiss();
      return;
    }
    await Linking.openURL(`${API_URL}/download${ios ? '#ios' : ''}`);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name={ios ? 'phone-portrait-outline' : 'download-outline'} size={22} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>
          {ios ? 'Installer sur l’écran d’accueil' : 'Installer comme une app'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
          {ios
            ? 'Safari → Partager → Sur l’écran d’accueil. Ensuite ça s’ouvre comme l’APK Android.'
            : 'Ajoutez Gasoil Tracking à l’écran d’accueil pour une expérience plein écran.'}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={install} style={[styles.btn, { backgroundColor: colors.accent }]}>
          <Text style={styles.btnText}>{deferred ? 'Installer' : ios ? 'Guide' : 'Ouvrir'}</Text>
        </Pressable>
        <Pressable onPress={dismiss} hitSlop={8}>
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  title: { fontWeight: '700', fontSize: 14 },
  actions: { alignItems: 'center', gap: 8 },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
