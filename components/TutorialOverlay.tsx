/**
 * Overlay coach compact : position haut/bas selon l’étape, boutons petits, trou limité.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useTutorial } from '@/context/TutorialContext';

const DIM = 'rgba(15, 23, 42, 0.55)';
const PAD = 4;
const MAX_HOLE_H = 110;

export function TutorialOverlay() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { active, step, stepIndex, highlight, busy, next, prev, skip, steps } = useTutorial();

  if (!active || !step) return null;

  const total = steps.length;
  const coachTop = step.coachPosition !== 'bottom';
  const h = highlight;
  let hole: { top: number; left: number; width: number; height: number } | null = null;
  if (h && h.width > 8 && h.height > 8) {
    const height = Math.min(MAX_HOLE_H, h.height + PAD * 2);
    hole = {
      top: Math.max(insets.top + 4, h.y - PAD),
      left: Math.max(8, h.x - PAD),
      width: Math.min(W - 16, h.width + PAD * 2),
      height,
    };
    // Si le trou est trop bas et coach en bas → remonter le coach en haut automatiquement
  }

  const cardStyle = coachTop
    ? { top: insets.top + 8, bottom: undefined as number | undefined }
    : { bottom: Math.max(insets.bottom, 8), top: undefined as number | undefined };

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
      {hole ? (
        <>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: hole.top, backgroundColor: DIM }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: hole.top + hole.height,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: DIM,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: hole.top,
              left: 0,
              width: hole.left,
              height: hole.height,
              backgroundColor: DIM,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: hole.top,
              left: hole.left + hole.width,
              right: 0,
              height: hole.height,
              backgroundColor: DIM,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: colors.accent,
            }}
          />
        </>
      ) : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} />
      )}

      <View
        pointerEvents="box-none"
        style={[styles.cardWrap, cardStyle, { paddingHorizontal: 10 }]}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800' }}>
            Guide {stepIndex + 1}/{total}
            {step.demoTag ? ' · démo' : ''}
          </Text>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 }}>
            {step.title}
          </Text>
          <ScrollView style={{ maxHeight: coachTop ? Math.min(160, H * 0.22) : Math.min(140, H * 0.2) }} nestedScrollEnabled>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
              {step.body}
            </Text>
          </ScrollView>

          {busy ? (
            <ActivityIndicator style={{ marginTop: 8 }} color={colors.accent} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
              {stepIndex > 0 ? (
                <Pressable
                  onPress={prev}
                  style={[styles.smBtn, { borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Retour"
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>Retour</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => void skip()}
                  style={[styles.smBtn, { borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Passer"
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 12 }}>Passer</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => void next()}
                style={[styles.smBtn, styles.smBtnPrimary, { backgroundColor: colors.accent, borderColor: colors.accent, flex: 1.4 }]}
                accessibilityRole="button"
                accessibilityLabel={step.id === 'finish' ? 'Terminer' : 'Suivant'}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                  {step.id === 'finish' ? 'Terminer & nettoyer' : 'Suivant'}
                </Text>
              </Pressable>
            </View>
          )}

          {stepIndex > 0 && step.id !== 'finish' ? (
            <Pressable onPress={() => void skip()} style={{ marginTop: 8, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                Quitter (supprime seulement la démo)
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  smBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smBtnPrimary: {},
});
