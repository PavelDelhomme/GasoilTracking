import React from 'react';
import { Pressable, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

/** Toggle clair / sombre — barre du haut à droite (séparé du bouton sync). */
export function ThemeToggleButton() {
  const { scheme, colors, toggleScheme } = useTheme();
  return (
    <Pressable
      onPress={toggleScheme}
      accessibilityRole="button"
      accessibilityLabel={scheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
      accessibilityHint="Change l’apparence de l’application"
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
      style={[
        styles.btn,
        {
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
      ]}
    >
      <Ionicons
        name={scheme === 'dark' ? 'sunny-outline' : 'moon-outline'}
        size={20}
        color={colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Platform.OS === 'web' ? 12 : 8,
  },
});
