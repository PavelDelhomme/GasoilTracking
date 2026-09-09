/**
 * Jauge type tableau de bord — barre E → F + molette.
 * Verrouillée par défaut : « Modifier la jauge » puis glisser / repères, puis Confirmer.
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
  { f: 0.25, label: '¼', a11y: 'Un quart' },
  { f: 0.5, label: '½', a11y: 'Moitié' },
  { f: 0.75, label: '¾', a11y: 'Trois quarts' },
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

  const trackH = compact ? 22 : 32;
  const thumb = compact ? 20 : 26;

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
  const thumbLeft = Math.max(0, Math.min(trackW - thumb, fraction * trackW - thumb / 2));
  const pct = Math.round(fraction * 100);

  return (
    <View
      style={styles.wrap}
      pointerEvents={disabled ? 'none' : 'auto'}
      accessibilityRole="adjustable"
      accessibilityLabel="Niveau de carburant"
      accessibilityHint="Comme sur le tableau de bord — Modifier puis glisser E vers F"
      accessibilityValue={{
        min: 0,
        max: Math.round(capacity),
        now: Math.round(displayL),
        text: known ? `${pct} % · ${displayL.toFixed(1)} L` : 'Niveau inconnu',
      }}
    >
      <View style={[styles.valueRow, compact && { marginBottom: 4 }]}>
        <Text style={[styles.valueMain, { color: colors.text, fontSize: compact ? 15 : 22 }]}>
          {known || editing ? `${pct} %` : 'Régler…'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: compact ? 11 : 13 }}>
          {known || editing ? `${displayL.toFixed(1)} L / ${capacity.toFixed(0)} L` : mark}
        </Text>
      </View>

      <View
        ref={trackRef}
        collapsable={false}
        style={[
          styles.track,
          {
            backgroundColor: colors.border,
            height: trackH,
            borderRadius: trackH / 2,
            opacity: locked ? 0.88 : disabled ? 0.5 : 1,
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
              width: `${Math.min(100, Math.round(fraction * 1000) / 10)}%`,
              backgroundColor: fillColor,
              borderRadius: trackH / 2,
            },
          ]}
        />
        {MARKS.filter((m) => m.f > 0 && m.f < 1).map((m) => (
          <View
            key={m.label}
            pointerEvents="none"
            style={[
              styles.tick,
              {
                left: `${m.f * 100}%`,
                backgroundColor: colors.background,
                opacity: 0.5,
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
                marginTop: -(thumb / 2),
                borderColor: '#fff',
                backgroundColor: fillColor,
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
            hitSlop={8}
            style={styles.markBtn}
            accessibilityRole="button"
            accessibilityLabel={`Régler à ${m.a11y}`}
          >
            <Text
              style={{
                color: Math.abs(fraction - m.f) < 0.06 ? fillColor : colors.textSecondary,
                fontWeight: Math.abs(fraction - m.f) < 0.06 ? '800' : '700',
                fontSize: compact ? 12 : 14,
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
            marginTop: 6,
          }}
        >
          {dragging ? `${pct} % · ${displayL.toFixed(1)} L` : 'Glisser E → F comme sur la voiture'}
        </Text>
      )}
      {locked ? (
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6, lineHeight: 16 }}>
          Verrouillée pour éviter un réglage accidentel.
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
    top: 4,
    bottom: 4,
    borderRadius: 1,
  },
  thumb: {
    position: 'absolute',
    borderWidth: 2,
    top: '50%',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  marks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  markBtn: { minWidth: 28, alignItems: 'center', paddingVertical: 2 },
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
