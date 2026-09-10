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
  /** Champ verrouillé : non éditable jusqu’au crayon */
  locked?: boolean;
  /** Bascule verrou / édition (crayon) */
  onRequestEdit?: () => void;
  /** Texte d’aide sous le champ */
  hint?: string;
}

export function Input({
  label,
  error,
  style,
  passwordToggle,
  secureTextEntry,
  locked,
  onRequestEdit,
  hint,
  ...props
}: InputProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const isPassword = Boolean(passwordToggle || secureTextEntry);
  const hide = isPassword && !visible;
  const showPencil = locked != null && onRequestEdit;

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: colors.text }]}>{label}</Text>}
      <View style={styles.row}>
        <TextInput
          {...props}
          editable={locked ? false : props.editable !== false}
          style={[
            styles.input,
            (isPassword || showPencil) && styles.inputWithIcon,
            {
              backgroundColor: locked ? colors.border + '55' : colors.card,
              borderColor: error ? colors.danger : colors.border,
              color: colors.text,
              opacity: locked ? 0.85 : 1,
            },
            style,
          ]}
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={hide}
          autoCapitalize={isPassword ? 'none' : props.autoCapitalize}
          accessibilityLabel={props.accessibilityLabel ?? label}
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
        {showPencil && (
          <TouchableOpacity
            style={styles.eye}
            onPress={onRequestEdit}
            accessibilityLabel={locked ? 'Modifier ce champ' : 'Verrouiller ce champ'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={locked ? 'pencil' : 'lock-closed-outline'}
              size={20}
              color={locked ? colors.accent : colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      {hint ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text>
      ) : null}
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
  hint: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
});
