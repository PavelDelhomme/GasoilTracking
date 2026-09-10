import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';

export type SpeedDialAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap | 'gas-pump';
  onPress: () => void;
};

type Props = {
  actions: SpeedDialAction[];
  disabled?: boolean;
  /** Mode Accueil : 2 FAB visibles (plein + trajet) sans menu « + » */
  dual?: boolean;
  /** Éventail (arc) au lieu d’une pile verticale */
  fan?: boolean;
  /** Décalage bas supplémentaire (ex. bouton sticky) */
  extraBottom?: number;
  /**
   * `screen` = compte la tab bar (~56).
   * `content` = déjà au-dessus des tabs (ex. page Trajet) — évite double décalage.
   */
  anchor?: 'screen' | 'content';
};

function ActionIcon({
  name,
  color,
  size = 22,
}: {
  name: SpeedDialAction['icon'];
  color: string;
  size?: number;
}) {
  if (name === 'gas-pump') {
    return <FontAwesome5 name="gas-pump" size={size - 2} color={color} />;
  }
  return <Ionicons name={name} size={size} color={color} />;
}

/**
 * FAB actions — dual (plein + trajet), éventail, ou speed-dial « + ».
 */
export function SpeedDialFab({
  actions,
  disabled,
  dual,
  fan,
  extraBottom = 0,
  anchor = 'screen',
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const tabLift = anchor === 'screen' ? 56 : 0;
  const bottom = Math.max(12, insets.bottom + (anchor === 'content' ? 4 : 8)) + tabLift + extraBottom;

  if (dual && actions.length >= 1) {
    const primary = actions[0];
    const secondary = actions[1];
    return (
      <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
        {secondary && (
          <Pressable
            disabled={disabled}
            onPress={secondary.onPress}
            accessibilityRole="button"
            accessibilityLabel={secondary.label}
            style={[
              styles.dualSecondary,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: disabled ? 0.45 : 1,
              },
            ]}
          >
            <ActionIcon name={secondary.icon} color={colors.accent} size={20} />
            <Text style={[styles.dualLabel, { color: colors.text }]} numberOfLines={1}>
              {secondary.label}
            </Text>
          </Pressable>
        )}
        <Pressable
          disabled={disabled}
          onPress={primary.onPress}
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          style={[
            styles.dualPrimary,
            {
              backgroundColor: disabled ? colors.border : colors.accent,
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          <ActionIcon name={primary.icon} color="#fff" size={20} />
          <Text style={styles.dualPrimaryLabel} numberOfLines={1}>
            {primary.label}
          </Text>
        </Pressable>
      </View>
    );
  }

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  /** Positions éventail : arc haut-gauche depuis le FAB (bas-droite). */
  const fanSlot = (i: number, n: number) => {
    const radius = 78;
    const start = Math.PI / 2 + 0.15; // un peu à gauche du haut
    const end = Math.PI - 0.12; // presque horizontal gauche
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const angle = start + t * (end - start);
    return {
      right: Math.max(0, -Math.cos(angle) * radius),
      bottom: Math.max(0, Math.sin(angle) * radius),
    };
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      {open && <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />}

      {open &&
        actions.map((a, i) => {
          const slot = fan ? fanSlot(i, actions.length) : null;
          return (
            <Pressable
              key={a.key}
              onPress={() => run(a.onPress)}
              style={[
                fan ? styles.fanItem : styles.actionRow,
                fan
                  ? {
                      right: slot!.right,
                      bottom: 58 + slot!.bottom,
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    }
                  : {
                      bottom: 72 + i * 58,
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
              ]}
            >
              {!fan && (
                <Text style={[styles.actionLabel, { color: colors.text }]}>{a.label}</Text>
              )}
              <View style={[styles.miniFab, { backgroundColor: colors.accent }]}>
                <ActionIcon name={a.icon} color="#fff" />
              </View>
              {fan && (
                <Text
                  style={[styles.fanLabel, { color: colors.text, backgroundColor: colors.card }]}
                  numberOfLines={1}
                >
                  {a.label}
                </Text>
              )}
            </Pressable>
          );
        })}

      <Pressable
        disabled={disabled}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Fermer' : 'Actions'}
        style={[
          styles.fab,
          {
            backgroundColor: disabled ? colors.border : colors.accent,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Ionicons name={open ? 'close' : 'add'} size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

/** FAB simple (ex. page Pleins). */
export function SimpleFab({
  label,
  icon = 'add',
  onPress,
  disabled,
}: {
  label: string;
  icon?: SpeedDialAction['icon'];
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(16, insets.bottom + 8) + 56;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.dualPrimary,
          {
            backgroundColor: disabled ? colors.border : colors.accent,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <ActionIcon name={icon} color="#fff" size={20} />
        <Text style={styles.dualPrimaryLabel} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    left: 16,
    top: 0,
    zIndex: 50,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 10,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  fab: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  dualPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  dualPrimaryLabel: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  dualSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 26,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  dualLabel: {
    fontWeight: '700',
    fontSize: 14,
  },
  actionRow: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingVertical: 6,
    paddingRight: 6,
    borderRadius: 28,
    borderWidth: 1,
  },
  fanItem: {
    position: 'absolute',
    alignItems: 'center',
    gap: 4,
    maxWidth: 110,
  },
  fanLabel: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    textAlign: 'center',
  },
  actionLabel: { fontSize: 14, fontWeight: '700' },
  miniFab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
