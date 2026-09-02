import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  /** Affiche une icône œil pour révéler le mot de passe */
  passwordToggle?: boolean;
}

export function Input({ label, error, style, passwordToggle, secureTextEntry, ...props }: InputProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const isPassword = Boolean(passwordToggle || secureTextEntry);
  const hide = isPassword && !visible;

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: colors.text }]}>{label}</Text>}
      <View style={styles.row}>
        <TextInput
          style={[
            styles.input,
            isPassword && styles.inputWithIcon,
            {
              backgroundColor: colors.card,
              borderColor: error ? colors.danger : colors.border,
              color: colors.text,
            },
            style,
          ]}
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={hide}
          autoCapitalize={isPassword ? 'none' : props.autoCapitalize}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            style={styles.eye}
            onPress={() => setVisible((v) => !v)}
            accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  row: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputWithIcon: {
    paddingRight: 48,
  },
  eye: {
    position: 'absolute',
    right: 14,
    height: '100%',
    justifyContent: 'center',
  },
  error: {
    fontSize: 12,
    marginTop: 4,
  },
});
