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
      await syncNow();
      await refresh();
      showToast('Synchronisation manuelle réussie');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Échec de synchronisation');
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
          accessibilityLabel="Synchroniser manuellement"
          hitSlop={10}
          style={styles.syncBtn}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons
              name="sync-outline"
              size={22}
              color={busy ? colors.accent : colors.text}
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
