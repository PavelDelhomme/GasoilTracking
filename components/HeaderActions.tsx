import React, { useRef } from 'react';
import { Pressable, View, StyleSheet, Platform, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/context/ToastContext';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';

/** Sync manuelle (icône animée) + toggle thème — header droite. */
export function HeaderActions() {
  const { colors } = useTheme();
  const { user, syncNow } = useAuth();
  const { refresh } = useApp();
  const { showToast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [offline, setOffline] = React.useState(false);
  const spin = useRef(new Animated.Value(0)).current;
  const loop = useRef<Animated.CompositeAnimation | null>(null);

  const startSpin = () => {
    spin.setValue(0);
    loop.current = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    loop.current.start();
  };

  const stopSpin = () => {
    loop.current?.stop();
    loop.current = null;
    spin.setValue(0);
  };

  const onSync = async () => {
    if (!user || busy) return;
    setBusy(true);
    startSpin();
    try {
      const result = await syncNow();
      await refresh();
      setOffline(false);
      const hhmm = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      if (result === 'pulled') showToast(`Cloud téléchargé · ${hhmm}`);
      else if (result === 'pushed') showToast(`Sauvegarde envoyée · ${hhmm}`);
      else showToast(`Synchronisation à jour · ${hhmm}`);
    } catch (e) {
      setOffline(true);
      showToast(e instanceof Error ? e.message : 'Hors ligne — sync impossible');
    } finally {
      stopSpin();
      setBusy(false);
    }
  };

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.row}>
      {!!user && (
        <Pressable
          onPress={onSync}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ busy }}
          accessibilityLabel={busy ? 'Synchronisation en cours…' : 'Synchroniser manuellement'}
          accessibilityHint={
            offline ? 'Hors ligne — dernière synchronisation échouée' : 'Synchroniser avec le cloud'
          }
          hitSlop={10}
          style={styles.syncBtn}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons
              name={offline ? 'cloud-offline-outline' : 'sync-outline'}
              size={22}
              color={busy ? colors.accent : offline ? colors.warning : colors.text}
            />
          </Animated.View>
        </Pressable>
      )}
      <ThemeToggleButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Platform.OS === 'web' ? 4 : 0,
  },
  syncBtn: {
    padding: 6,
    marginRight: 2,
  },
});
