/**
 * Swipe gauche → droite : action secondaire (modifier).
 * Swipe droite → gauche : action destructive (supprimer) avec confirm côté parent.
 */
import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

const ACTION_W = 84;
const THRESH = 56;

type Props = {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function SwipeableRow({ children, onEdit, onDelete, style }: Props) {
  const { colors } = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const open = useRef(0);

  const clamp = (v: number) => {
    const min = onDelete ? -ACTION_W : 0;
    const max = onEdit ? ACTION_W : 0;
    return Math.max(min, Math.min(max, v));
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderMove: (_, g) => {
        x.setValue(clamp(open.current + g.dx));
      },
      onPanResponderRelease: (_, g) => {
        const next = clamp(open.current + g.dx);
        let target = 0;
        if (next <= -THRESH && onDelete) target = -ACTION_W;
        else if (next >= THRESH && onEdit) target = ACTION_W;
        open.current = target;
        Animated.spring(x, {
          toValue: target,
          useNativeDriver: true,
          bounciness: 0,
          speed: 20,
        }).start();
      },
    })
  ).current;

  const close = () => {
    open.current = 0;
    Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  };

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.actions} pointerEvents="box-none">
        {onEdit ? (
          <Pressable
            onPress={() => {
              close();
              onEdit();
            }}
            style={[styles.action, styles.left, { backgroundColor: colors.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Modifier"
          >
            <Ionicons name="create-outline" size={22} color="#fff" />
            <Text style={styles.actionLabel}>Modifier</Text>
          </Pressable>
        ) : (
          <View style={{ width: ACTION_W }} />
        )}
        {onDelete ? (
          <Pressable
            onPress={() => {
              close();
              onDelete();
            }}
            style={[styles.action, styles.right, { backgroundColor: colors.danger }]}
            accessibilityRole="button"
            accessibilityLabel="Supprimer"
          >
            <Ionicons name="trash-outline" size={22} color="#fff" />
            <Text style={styles.actionLabel}>Supprimer</Text>
          </Pressable>
        ) : (
          <View style={{ width: ACTION_W }} />
        )}
      </View>
      <Animated.View
        style={{ transform: [{ translateX: x }], backgroundColor: colors.card }}
        {...pan.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderRadius: 10,
  },
  actions: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  action: {
    width: ACTION_W,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  left: { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  right: { borderTopRightRadius: 10, borderBottomRightRadius: 10 },
  actionLabel: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
