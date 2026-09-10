/**
 * Badge carburant restant — draggable, position mémorisée en fractions (rotation / petits écrans).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { fuelRemainingTone, fuelToneColor } from '@/lib/fuelLevel';

const POS_KEY = 'gasoil_fuel_badge_pos_v2';
const BADGE_W = 88;
const BADGE_H = 52;

type Props = {
  liters: number;
  tankCapacity: number;
  /** Marge basse (tabs / sticky / FAB) */
  bottomInset?: number;
  /** Marge haute (chip véhicule / route picker) */
  topInset?: number;
};

type FracPos = { fx: number; fy: number };

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function FloatingFuelBadge({
  liters,
  tankCapacity,
  bottomInset = 120,
  topInset = 56,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const capacity = Math.max(1, tankCapacity || 50);
  const L = Math.max(0, Math.min(capacity, liters));
  const pct = Math.round((L / capacity) * 100);
  const tone = fuelRemainingTone({ litersRemaining: L, tankCapacity: capacity });
  const toneColor = fuelToneColor(tone, colors);

  const topMin = Math.max(topInset, insets.top + 8);
  const bottomMaxPad = Math.max(bottomInset, insets.bottom + 80);

  const rangeX = Math.max(1, winW - BADGE_W - 16);
  const rangeY = Math.max(1, winH - BADGE_H - topMin - bottomMaxPad);

  const fracToPx = useCallback(
    (f: FracPos) => ({
      x: 8 + clamp01(f.fx) * rangeX,
      y: topMin + clamp01(f.fy) * rangeY,
    }),
    [rangeX, rangeY, topMin]
  );

  const pxToFrac = useCallback(
    (x: number, y: number): FracPos => ({
      fx: clamp01((x - 8) / rangeX),
      fy: clamp01((y - topMin) / rangeY),
    }),
    [rangeX, rangeY, topMin]
  );

  const [frac, setFrac] = useState<FracPos>({ fx: 0.02, fy: 0.12 });
  const fracRef = useRef(frac);
  fracRef.current = frac;
  const dragOrigin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(POS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<FracPos> & { x?: number; y?: number };
        if (Number.isFinite(parsed.fx) && Number.isFinite(parsed.fy)) {
          setFrac({ fx: clamp01(parsed.fx!), fy: clamp01(parsed.fy!) });
        } else if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          // Migration v1 (pixels) → fractions
          setFrac(pxToFrac(parsed.x!, parsed.y!));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [pxToFrac]);

  const pos = fracToPx(frac);

  const persist = (f: FracPos) => {
    void AsyncStorage.setItem(POS_KEY, JSON.stringify(f)).catch(() => undefined);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          const p = fracToPx(fracRef.current);
          dragOrigin.current = { x: p.x, y: p.y };
        },
        onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          const next = pxToFrac(dragOrigin.current.x + g.dx, dragOrigin.current.y + g.dy);
          setFrac(next);
        },
        onPanResponderRelease: () => {
          const f = fracRef.current;
          setFrac(f);
          persist(f);
        },
        onPanResponderTerminate: () => {
          const f = fracRef.current;
          setFrac(f);
          persist(f);
        },
      }),
    [fracToPx, pxToFrac]
  );

  return (
    <View
      {...pan.panHandlers}
      style={[
        styles.badge,
        {
          left: pos.x,
          top: pos.y,
          backgroundColor: colors.card,
          borderColor: toneColor,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Carburant restant ${L.toFixed(1)} litres, ${pct} pour cent`}
    >
      <View style={styles.rowInline}>
        <Text style={[styles.liters, { color: toneColor }]}>{L.toFixed(1)} L</Text>
        <Text style={[styles.pct, { color: colors.textSecondary }]}>{pct} %</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    zIndex: 40,
    minWidth: BADGE_W,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  liters: { fontWeight: '900', fontSize: 15 },
  pct: { fontWeight: '700', fontSize: 12, marginLeft: 4 },
  rowInline: { flexDirection: 'row', alignItems: 'baseline' },
});
