/**
 * Jauge carburant demi-cercle — E → F.
 * Avec requireConfirm : brouillon local jusqu’à OK ; Annuler restaure sans sauver.
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
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import {
  gaugeArcPath,
  gaugeFractionFromArcTouch,
  gaugeMarkLabel,
  gaugePolar,
} from '@/lib/fuelGaugeMath';
import { fuelRemainingTone, fuelToneColor } from '@/lib/fuelLevel';

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
  /** Ignoré pour la couleur d’arc : vert/orange/rouge suivent le niveau affiché. */
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
  disabled,
  compact,
  requireConfirm = true,
}: Props) {
  const { colors } = useTheme();
  const capacity = Math.max(1, tankCapacity || 50);
  const known = liters != null && Number.isFinite(liters);
  const savedL = known ? Math.max(0, Math.min(capacity, liters!)) : capacity * 0.5;

  const [editing, setEditing] = useState(!requireConfirm);
  const [draft, setDraft] = useState(savedL);
  /** Valeur au moment où on a ouvert « Modifier » — pour Annuler. */
  const baselineRef = useRef(savedL);

  const locked = requireConfirm && !editing;
  const interactive = !disabled && !locked;
  const displayL = requireConfirm && editing ? draft : savedL;
  const fraction = Math.max(0, Math.min(1, displayL / capacity));

  const tone = fuelRemainingTone({
    litersRemaining: displayL,
    tankCapacity: capacity,
  });
  const fillColor = fuelToneColor(tone, colors);

  const size = compact ? 200 : 260;
  const stroke = compact ? 14 : 18;
  const pad = stroke / 2 + 6;
  const cx = size / 2;
  const cy = size / 2 - 2;
  const r = size / 2 - pad;
  const svgH = cy + stroke / 2 + 22;

  const [dragging, setDragging] = useState(false);
  const centerPageRef = useRef({ x: 0, y: 0 });
  const dialRef = useRef<View>(null);
  const liveRef = useRef(displayL);
  liveRef.current = displayL;

  // Sync brouillon depuis props seulement hors édition
  useEffect(() => {
    if (!editing) {
      setDraft(savedL);
      baselineRef.current = savedL;
    }
  }, [savedL, editing]);

  const setLive = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(capacity, next));
      liveRef.current = clamped;
      if (requireConfirm) {
        // Brouillon local uniquement — ne touche pas le parent tant que OK
        setDraft(clamped);
      } else {
        onChange(clamped);
      }
    },
    [capacity, onChange, requireConfirm]
  );

  const applyPage = useCallback(
    (pageX: number, pageY: number, commit: boolean) => {
      if (!interactive) return;
      const f = gaugeFractionFromArcTouch(
        pageX,
        pageY,
        centerPageRef.current.x,
        centerPageRef.current.y
      );
      const next = Math.round(capacity * f * 10) / 10;
      setLive(next);
      if (commit && !requireConfirm) onChangeEnd?.(next);
    },
    [capacity, interactive, onChangeEnd, requireConfirm, setLive]
  );

  const measureCenter = useCallback(() => {
    dialRef.current?.measureInWindow((x, y, width) => {
      const scale = width > 0 ? width / size : 1;
      centerPageRef.current = {
        x: x + cx * scale,
        y: y + cy * scale,
      };
    });
  }, [cx, cy, size]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => interactive,
        onMoveShouldSetPanResponder: () => interactive,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          setDragging(true);
          measureCenter();
          applyPage(evt.nativeEvent.pageX, evt.nativeEvent.pageY, false);
        },
        onPanResponderMove: (evt) =>
          applyPage(evt.nativeEvent.pageX, evt.nativeEvent.pageY, false),
        onPanResponderRelease: (evt) => {
          applyPage(evt.nativeEvent.pageX, evt.nativeEvent.pageY, true);
          setDragging(false);
        },
        onPanResponderTerminate: () => {
          if (!requireConfirm) onChangeEnd?.(liveRef.current);
          setDragging(false);
        },
      }),
    [applyPage, interactive, measureCenter, onChangeEnd, requireConfirm]
  );

  const onLayout = (_e: LayoutChangeEvent) => {
    measureCenter();
  };

  const startEdit = () => {
    baselineRef.current = savedL;
    setDraft(savedL);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(baselineRef.current);
    liveRef.current = baselineRef.current;
    setEditing(false);
    // Pas d’onChange : le parent n’a jamais reçu le brouillon
  };

  const confirmEdit = () => {
    const next = Math.round(draft * 10) / 10;
    onChange(next);
    onChangeEnd?.(next);
    setEditing(false);
  };

  const mark = gaugeMarkLabel(fraction);
  const pct = Math.round(fraction * 100);
  const needleTip = gaugePolar(cx, cy, r - stroke * 0.15, fraction);
  const trackPath = gaugeArcPath(cx, cy, r, 0, 1);
  const dangerPath = gaugeArcPath(cx, cy, r, 0, 0.12);
  const fillPath = fraction > 0.002 ? gaugeArcPath(cx, cy, r, 0, fraction) : '';

  return (
    <View
      style={styles.wrap}
      pointerEvents={disabled ? 'none' : 'auto'}
      accessibilityRole="adjustable"
      accessibilityLabel="Niveau de carburant"
      accessibilityHint="Modifier puis tourner E vers F"
      accessibilityValue={{
        min: 0,
        max: Math.round(capacity),
        now: Math.round(displayL),
        text: known ? `${pct} % · ${displayL.toFixed(1)} L` : 'Niveau inconnu',
      }}
    >
      <View
        style={[
          styles.panel,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            opacity: disabled ? 0.55 : 1,
            paddingVertical: compact ? 8 : 10,
          },
        ]}
      >
        <View
          ref={dialRef}
          collapsable={false}
          style={[styles.dial, { width: size, height: svgH, opacity: locked ? 0.95 : 1 }]}
          onLayout={onLayout}
          {...(interactive ? pan.panHandlers : {})}
        >
          <Svg width={size} height={svgH}>
            <Path
              d={trackPath}
              stroke={colors.border}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="butt"
            />
            {dangerPath ? (
              <Path
                d={dangerPath}
                stroke={colors.danger}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="butt"
                opacity={0.55}
              />
            ) : null}
            {fillPath ? (
              <Path
                d={fillPath}
                stroke={fillColor}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="butt"
              />
            ) : null}

            {MARKS.map((m) => {
              const outer = gaugePolar(cx, cy, r + stroke * 0.12, m.f);
              const inner = gaugePolar(cx, cy, r - stroke * 0.5, m.f);
              const labelPos = gaugePolar(cx, cy, r - stroke - (compact ? 12 : 14), m.f);
              const active = Math.abs(fraction - m.f) < 0.06;
              return (
                <G key={m.label}>
                  <Line
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                    stroke={active ? fillColor : colors.textSecondary}
                    strokeWidth={active ? 2.5 : 1.5}
                    strokeLinecap="round"
                    opacity={active ? 1 : 0.45}
                  />
                  <SvgText
                    x={labelPos.x}
                    y={labelPos.y + 4}
                    fill={active ? fillColor : colors.textSecondary}
                    fontSize={compact ? 12 : 14}
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {m.label}
                  </SvgText>
                </G>
              );
            })}

            <Line
              x1={cx}
              y1={cy}
              x2={needleTip.x}
              y2={needleTip.y}
              stroke={fillColor}
              strokeWidth={compact ? 3 : 4}
              strokeLinecap="round"
            />
            <Circle cx={cx} cy={cy} r={compact ? 7 : 9} fill={fillColor} />
            <Circle cx={cx} cy={cy} r={compact ? 3 : 4} fill="#fff" />

            <SvgText
              x={cx}
              y={cy - (compact ? 26 : 32)}
              fill={tone === 'critical' || tone === 'warn' ? fillColor : colors.text}
              fontSize={compact ? 26 : 34}
              fontWeight="900"
              textAnchor="middle"
            >
              {known || editing ? `${pct}` : '—'}
            </SvgText>
            <SvgText
              x={cx}
              y={cy - (compact ? 8 : 10)}
              fill={colors.textSecondary}
              fontSize={11}
              fontWeight="700"
              textAnchor="middle"
            >
              %
            </SvgText>
          </Svg>
        </View>

        <Text style={[styles.litersLine, { color: colors.textSecondary }]}>
          {known || editing
            ? `${displayL.toFixed(1)} L / ${capacity.toFixed(0)} L · ${mark}`
            : 'Régler le niveau'}
        </Text>

        {interactive ? (
          <View style={styles.marks}>
            {MARKS.map((m) => {
              const active = Math.abs(fraction - m.f) < 0.06;
              return (
                <Pressable
                  key={m.label}
                  onPress={() => {
                    const next = Math.round(capacity * m.f * 10) / 10;
                    setLive(next);
                    if (!requireConfirm) onChangeEnd?.(next);
                  }}
                  hitSlop={8}
                  style={[
                    styles.markBtn,
                    {
                      borderColor: active ? fillColor : colors.border,
                      backgroundColor: active ? fillColor + '22' : 'transparent',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Régler à ${m.a11y}`}
                >
                  <Text
                    style={{
                      color: active ? fillColor : colors.textSecondary,
                      fontWeight: '800',
                      fontSize: 13,
                    }}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {requireConfirm ? (
        <View style={styles.confirmRow}>
          {locked ? (
            <Pressable
              onPress={startEdit}
              style={[
                styles.confirmBtn,
                styles.confirmBtnWide,
                { borderColor: colors.border, backgroundColor: colors.background },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Modifier le niveau de carburant"
            >
              <Ionicons name="create-outline" size={15} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>
                Modifier
              </Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={cancelEdit}
                style={[styles.confirmBtn, { borderColor: colors.border, flex: 1 }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13 }}>
                  Annuler
                </Text>
              </Pressable>
              <Pressable
                onPress={confirmEdit}
                style={[
                  styles.confirmBtn,
                  { borderColor: fillColor, backgroundColor: fillColor, flex: 1.3 },
                ]}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                  OK · {pct} %
                </Text>
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
            textAlign: 'center',
          }}
        >
          {dragging ? `${pct} %` : 'Glisser E → F'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  panel: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  dial: {
    alignSelf: 'center',
  },
  litersLine: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 4,
    textAlign: 'center',
  },
  marks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 6,
    gap: 4,
    paddingHorizontal: 2,
  },
  markBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  confirmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  confirmBtnWide: {
    width: '100%',
  },
});
