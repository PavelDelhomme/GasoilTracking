/**
 * Jauge type tableau de bord (arc + aiguille).
 * Verrouillée par défaut (requireConfirm) : « Modifier » puis molette / glisser, puis Confirmer.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  Pressable,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { gaugeFractionFromTouch, gaugeMarkLabel } from '@/lib/fuelGaugeMath';

const MARKS = [
  { f: 0, label: 'E', a11y: 'Vide' },
  { f: 0.25, label: '1/4', a11y: 'Un quart' },
  { f: 0.5, label: '1/2', a11y: 'Moitié' },
  { f: 0.75, label: '3/4', a11y: 'Trois quarts' },
  { f: 1, label: 'F', a11y: 'Plein' },
] as const;

type Props = {
  tankCapacity: number;
  liters: number | null;
  onChange: (liters: number) => void;
  onChangeEnd?: (liters: number) => void;
  accentColor?: string;
  disabled?: boolean;
  compact?: boolean;
  /** Verrouille la jauge ; bouton Modifier / Confirmer / Annuler. */
  requireConfirm?: boolean;
};

export function FuelGaugeSlider({
  tankCapacity,
  liters,
  onChange,
  onChangeEnd,
  accentColor,
  disabled,
  compact,
  requireConfirm = true,
}: Props) {
  const { colors } = useTheme();
  const fillColor = accentColor || colors.accent;
  const capacity = Math.max(1, tankCapacity || 50);
  const known = liters != null && Number.isFinite(liters);
  const savedL = known ? Math.max(0, Math.min(capacity, liters!)) : capacity * 0.5;

  const [editing, setEditing] = useState(!requireConfirm);
  const [draft, setDraft] = useState(savedL);
  const locked = requireConfirm && !editing;
  const interactive = !disabled && !locked;
  const displayL = requireConfirm && editing ? draft : savedL;
  const fraction = displayL / capacity;

  const size = compact ? 140 : 200;
  const stroke = compact ? 10 : 14;

  const [trackW, setTrackW] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackWRef = useRef(0);
  const trackPageXRef = useRef(0);
  const trackRef = useRef<View>(null);
  const liveRef = useRef(displayL);
  liveRef.current = displayL;

  useEffect(() => {
    if (!editing) setDraft(savedL);
  }, [savedL, editing]);

  const setLive = useCallback(
    (next: number) => {
      liveRef.current = next;
      if (requireConfirm) {
        setDraft(next);
        onChange(next);
      } else {
        onChange(next);
      }
    },
    [onChange, requireConfirm]
  );

  const applyPageX = useCallback(
    (pageX: number, commit: boolean) => {
      if (!interactive || trackWRef.current <= 0) return;
      const f = gaugeFractionFromTouch(pageX, trackPageXRef.current, trackWRef.current);
      const next = Math.round(capacity * f * 10) / 10;
      setLive(next);
      if (commit && !requireConfirm) onChangeEnd?.(next);
    },
    [capacity, interactive, onChangeEnd, requireConfirm, setLive]
  );

  const measureTrack = useCallback(() => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      if (width > 0) {
        trackPageXRef.current = x;
        trackWRef.current = width;
      }
    });
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => interactive,
        onMoveShouldSetPanResponder: () => interactive,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          setDragging(true);
          measureTrack();
          applyPageX(evt.nativeEvent.pageX, false);
        },
        onPanResponderMove: (evt) => applyPageX(evt.nativeEvent.pageX, false),
        onPanResponderRelease: (evt) => {
          applyPageX(evt.nativeEvent.pageX, true);
          setDragging(false);
        },
        onPanResponderTerminate: () => {
          if (!requireConfirm) onChangeEnd?.(liveRef.current);
          setDragging(false);
        },
      }),
    [applyPageX, interactive, measureTrack, onChangeEnd, requireConfirm]
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWRef.current = w;
    setTrackW(w);
    measureTrack();
  };

  const mark = gaugeMarkLabel(fraction);
  // Arc 180° : E à gauche (−90°) → F à droite (+90°)
  const needleDeg = -90 + fraction * 180;

  return (
    <View
      style={styles.wrap}
      pointerEvents={disabled ? 'none' : 'auto'}
      accessibilityRole="adjustable"
      accessibilityLabel="Niveau de carburant"
      accessibilityHint="Jauge tableau de bord — appuyez sur Modifier pour régler"
      accessibilityValue={{
        min: 0,
        max: Math.round(capacity),
        now: Math.round(displayL),
        text: known
          ? `${mark} · ${displayL.toFixed(1)} litres sur ${capacity.toFixed(0)}`
          : 'Niveau inconnu',
      }}
    >
      <View style={[styles.valueRow, compact && { marginBottom: 4 }]}>
        <Text style={[styles.valueMain, { color: colors.text, fontSize: compact ? 14 : 22 }]}>
          {known || editing ? `${displayL.toFixed(1)} L` : 'Régler…'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: compact ? 11 : 12 }}>
          {mark} · / {capacity.toFixed(0)} L
        </Text>
      </View>

      {/* Arc jauge */}
      <View style={[styles.dialWrap, { height: size / 2 + 16, opacity: locked ? 0.9 : 1 }]}>
        <View
          style={[
            styles.arcOuter,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: colors.border,
              borderBottomColor: 'transparent',
              borderLeftColor: colors.border,
              borderRightColor: colors.border,
              borderTopColor: fillColor,
              transform: [{ rotate: `${-90 + fraction * 180}deg` }],
            },
          ]}
        />
        <View
          style={[
            styles.arcMask,
            {
              width: size - stroke * 2,
              height: size - stroke * 2,
              borderRadius: (size - stroke * 2) / 2,
              backgroundColor: colors.card || colors.background,
              marginTop: stroke,
            },
          ]}
        />
        <View
          style={[
            styles.needlePivot,
            {
              width: size,
              height: size,
            },
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.needle,
              {
                backgroundColor: fillColor,
                height: size / 2 - stroke - 8,
                transform: [{ rotate: `${needleDeg}deg` }],
              },
            ]}
          />
          <View
            style={[
              styles.hub,
              { backgroundColor: fillColor, borderColor: colors.background },
            ]}
          />
        </View>
        <View style={[styles.arcLabels, { width: size }]} pointerEvents="none">
          <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 12 }}>E</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 11 }}>1/2</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 12 }}>F</Text>
        </View>
      </View>

      {/* Molette horizontale (réglage précis) — active seulement en édition */}
      <View
        ref={trackRef}
        collapsable={false}
        style={[
          styles.track,
          {
            backgroundColor: colors.border,
            height: compact ? 16 : 22,
            borderRadius: 11,
            opacity: interactive ? 1 : 0.45,
          },
        ]}
        onLayout={onLayout}
        {...(interactive ? pan.panHandlers : {})}
      >
        <View
          pointerEvents="none"
          style={[
            styles.fill,
            {
              width: `${Math.round(fraction * 1000) / 10}%`,
              backgroundColor: fillColor,
              borderRadius: 11,
            },
          ]}
        />
        {trackW > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                left: Math.max(0, Math.min(trackW - 18, fraction * trackW - 9)),
                backgroundColor: fillColor,
                borderColor: '#fff',
              },
            ]}
          />
        )}
      </View>

      <View style={[styles.marks, compact && { marginTop: 4 }]}>
        {MARKS.map((m) => (
          <Pressable
            key={m.label}
            disabled={!interactive}
            onPress={() => {
              const next = Math.round(capacity * m.f * 10) / 10;
              setLive(next);
              if (!requireConfirm) onChangeEnd?.(next);
            }}
            hitSlop={compact ? 4 : 6}
            style={styles.markBtn}
            accessibilityRole="button"
            accessibilityLabel={`Régler à ${m.a11y}`}
          >
            <Text
              style={{
                color: Math.abs(fraction - m.f) < 0.06 ? fillColor : colors.textSecondary,
                fontWeight: Math.abs(fraction - m.f) < 0.06 ? '800' : '700',
                fontSize: compact ? 10 : 12,
              }}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {requireConfirm ? (
        <View style={styles.confirmRow}>
          {locked ? (
            <Pressable
              onPress={() => {
                setDraft(savedL);
                setEditing(true);
              }}
              style={[
                styles.confirmBtn,
                { borderColor: colors.accent, backgroundColor: colors.accent + '18' },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Modifier le niveau de carburant"
            >
              <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>
                Modifier la jauge
              </Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={() => {
                  setDraft(savedL);
                  onChange(savedL);
                  setEditing(false);
                }}
                style={[styles.confirmBtn, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13 }}>
                  Annuler
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onChangeEnd?.(draft);
                  setEditing(false);
                }}
                style={[
                  styles.confirmBtn,
                  { borderColor: colors.accent, backgroundColor: colors.accent },
                ]}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Confirmer</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <Text
          style={{
            color: dragging ? fillColor : colors.textSecondary,
            fontSize: 11,
            marginTop: 4,
            fontWeight: dragging ? '700' : '400',
          }}
        >
          {dragging
            ? `Niveau : ${mark} · ${displayL.toFixed(1)} L`
            : 'Tournez la molette comme sur le tableau de bord'}
        </Text>
      )}
      {locked ? (
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6 }}>
          Verrouillée — appuyez sur « Modifier la jauge » pour éviter un réglage accidentel.
        </Text>
      ) : null}
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
  dialWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 10,
    overflow: 'hidden',
  },
  arcOuter: {
    position: 'absolute',
    top: 0,
    borderStyle: 'solid',
  },
  arcMask: {
    position: 'absolute',
    top: 0,
  },
  needlePivot: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  needle: {
    position: 'absolute',
    top: 18,
    width: 3,
    borderRadius: 2,
    transformOrigin: 'bottom',
  },
  hub: {
    position: 'absolute',
    top: '48%',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    marginTop: -7,
  },
  arcLabels: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
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
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    top: '50%',
    marginTop: -9,
    elevation: 3,
  },
  marks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  markBtn: { paddingVertical: 1, paddingHorizontal: 1 },
  confirmRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  confirmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
});
