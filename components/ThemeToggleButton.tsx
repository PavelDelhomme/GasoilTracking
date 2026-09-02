import React from 'react';
import { Pressable, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

/** Toggle clair / sombre — barre du haut à droite */
export function ThemeToggleButton() {
  const { scheme, colors, toggleScheme } = useTheme();
  return (
    <Pressable
      onPress={toggleScheme}
      accessibilityRole="button"
      accessibilityLabel={scheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
      hitSlop={10}
      style={styles.btn}
    >
      <Ionicons
        name={scheme === 'dark' ? 'sunny-outline' : 'moon-outline'}
        size={22}
        color={colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginRight: Platform.OS === 'web' ? 16 : 12,
    padding: 6,
  },
});
