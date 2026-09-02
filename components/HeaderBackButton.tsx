import React from 'react';
import { Pressable, Text, StyleSheet, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

/** Bouton retour header — fiable sur web (router.back ou Accueil). */
export function HeaderBackButton({ fallbackHref = '/' }: { fallbackHref?: string }) {
  const { colors } = useTheme();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref as never);
  };

  return (
    <Pressable
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel="Retour"
      hitSlop={10}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons
        name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
        size={22}
        color={colors.text}
      />
      <Text style={[styles.label, { color: colors.text }]}>Retour</Text>
    </Pressable>
  );
}

/** Bandeau retour dans le contenu (filet si le header web est masqué). */
export function InlineBackBar({ label = 'Retour à l’accueil' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.inlineWrap}>
      <Pressable
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/' as never);
        }}
        style={({ pressed }) => [
          styles.inlineBtn,
          { borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name="arrow-back" size={18} color={colors.accent} />
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 14 }}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: Platform.OS === 'web' ? 8 : 0,
    paddingVertical: 6,
    paddingRight: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  inlineWrap: {
    marginBottom: 8,
  },
  inlineBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
