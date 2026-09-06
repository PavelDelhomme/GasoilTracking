/**
 * Jauge visuelle réglable (glisser / taper) — niveau essence.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  Pressable,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';

const MARKS = [
  { f: 0, label: 'Vide' },
  { f: 0.25, label: '1/4' },
  { f: 0.5, label: '1/2' },
  { f: 0.75, label: '3/4' },
  { f: 1, label: 'Plein' },
] as const;

type Props = {
  tankCapacity: number;
  /** null = inconnu → démarre à 50 % pour le geste */
  liters: number | null;
  onChange: (liters: number) => void;
  /** Appelé en fin de glissement (sauver en base) */
  onChangeEnd?: (liters: number) => void;
  accentColor?: string;
  disabled?: boolean;
  /** Compact / bas de carte véhicule / accueil */
  compact?: boolean;
};

export function FuelGaugeSlider({
  tankCapacity,
  liters,
  onChange,
  onChangeEnd,
  accentColor,
  disabled,
  compact,
}: Props) {
  const { colors } = useTheme();
  const fillColor = accentColor || colors.accent;
  const capacity = Math.max(1, tankCapacity || 50);
  const known = liters != null && Number.isFinite(liters);
  const valueL = known ? Math.max(0, Math.min(capacity, liters!)) : capacity * 0.5;
  const fraction = valueL / capacity;

  const trackH = compact ? 18 : 36;
  const thumb = compact ? 16 : 22;
  const radius = compact ? 9 : 14;

  const [trackW, setTrackW] = useState(0);
  const trackWRef = useRef(0);
  const liveRef = useRef(valueL);
  liveRef.current = valueL;

  const applyX = useCallback(
    (x: number, commit: boolean) => {
      if (disabled || trackWRef.current <= 0) return;
      const f = Math.max(0, Math.min(1, x / trackWRef.current));
      const next = Math.round(capacity * f * 10) / 10;
      liveRef.current = next;
      onChange(next);
      if (commit) onChangeEnd?.(next);
    },
    [capacity, disabled, onChange, onChangeEnd]
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          applyX(evt.nativeEvent.locationX, false);
        },
        onPanResponderMove: (evt) => {
          applyX(evt.nativeEvent.locationX, false);
        },
        onPanResponderRelease: (evt) => {
          applyX(evt.nativeEvent.locationX, true);
        },
        onPanResponderTerminate: () => {
          onChangeEnd?.(liveRef.current);
        },
      }),
    [applyX, disabled, onChangeEnd]
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWRef.current = w;
    setTrackW(w);
  };

  const thumbLeft = Math.max(0, Math.min(trackW - thumb, fraction * trackW - thumb / 2));

  return (
    <View
      style={styles.wrap}
      pointerEvents={disabled ? 'none' : 'auto'}
      accessibilityRole="adjustable"
      accessibilityLabel="Niveau de carburant"
      accessibilityValue={{
        min: 0,
        max: Math.round(capacity),
        now: Math.round(valueL),
        text: known ? `${valueL.toFixed(1)} litres sur ${capacity.toFixed(0)}` : 'Niveau inconnu',
      }}
    >
      <View style={[styles.valueRow, compact && { marginBottom: 4 }]}>
        <Text
          style={[
            styles.valueMain,
            { color: colors.text, fontSize: compact ? 14 : 22 },
          ]}
        >
          {known ? `${valueL.toFixed(1)} L` : 'Régler…'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: compact ? 11 : 12 }}>
          / {capacity.toFixed(0)} L
        </Text>
      </View>

      <View
        style={[
          styles.track,
          {
            backgroundColor: colors.border,
            height: trackH,
            borderRadius: radius,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
        onLayout={onLayout}
        {...pan.panHandlers}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(fraction * 1000) / 10}%`,
              backgroundColor: fillColor,
              borderRadius: radius,
            },
          ]}
        />
        {MARKS.map((m) => (
          <View
            key={m.label}
            pointerEvents="none"
            style={[
              styles.tick,
              {
                left: `${m.f * 100}%`,
                top: compact ? 3 : 4,
                bottom: compact ? 3 : 4,
                backgroundColor: colors.background,
                opacity: m.f === 0 || m.f === 1 ? 0 : 0.55,
              },
            ]}
          />
        ))}
        {trackW > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                left: thumbLeft,
                width: thumb,
                height: thumb,
                borderRadius: thumb / 2,
                marginTop: -thumb / 2,
                borderColor: '#fff',
                backgroundColor: fillColor,
                shadowColor: '#000',
              },
            ]}
          />
        )}
      </View>

      <View style={[styles.marks, compact && { marginTop: 4 }]}>
        {MARKS.map((m) => (
          <Pressable
            key={m.label}
            disabled={disabled}
            onPress={() => {
              const next = Math.round(capacity * m.f * 10) / 10;
              onChange(next);
              onChangeEnd?.(next);
            }}
            hitSlop={compact ? 4 : 6}
            style={styles.markBtn}
          >
            <Text
              style={{
                color:
                  Math.abs(fraction - m.f) < 0.06 ? fillColor : colors.textSecondary,
                fontWeight: Math.abs(fraction - m.f) < 0.06 ? '800' : '600',
                fontSize: compact ? 9 : 11,
              }}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {!compact && (
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
          Glissez la barre ou touchez Vide → Plein
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  valueMain: { fontWeight: '800' },
  track: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  tick: {
    position: 'absolute',
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  thumb: {
    position: 'absolute',
    borderWidth: 2,
    top: '50%',
    elevation: 3,
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  marks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  markBtn: { paddingVertical: 1, paddingHorizontal: 1 },
});
