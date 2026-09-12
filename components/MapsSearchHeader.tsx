/**
 * Barre de recherche Maps isolée : l’état du texte reste local.
 * Le parent n’est notifié qu’après debounce — évite de recréer le header à chaque lettre.
 */
import React, { useRef, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, Platform, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { DrawerMenuButton } from '@/components/DrawerMenuButton';
import { HeaderActions } from '@/components/HeaderActions';
import { PLACE_SEARCH_DEBOUNCE_MS } from '@/lib/placeSearch';

type Props = {
  insetsTop: number;
  onDebouncedQuery: (q: string) => void;
  onSubmit: (q: string) => void;
  onFocusChange?: (focused: boolean) => void;
};

export function MapsSearchHeader({
  insetsTop,
  onDebouncedQuery,
  onSubmit,
  onFocusChange,
}: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (t: string) => {
    setText(t);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onDebouncedQuery(t);
    }, PLACE_SEARCH_DEBOUNCE_MS);
  };

  return (
    <View
      style={{
        paddingTop: insetsTop,
        backgroundColor: colors.background,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <View style={styles.row}>
        <DrawerMenuButton />
        <View
          style={[
            styles.field,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <Ionicons name="search" size={14} color={colors.textSecondary} />
          <TextInput
            value={text}
            onChangeText={handleChange}
            onFocus={() => onFocusChange?.(true)}
            onBlur={() => setTimeout(() => onFocusChange?.(false), 180)}
            placeholder="Adresse, lieu, parc expo…"
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              { color: colors.text },
              Platform.OS === 'android' ? { includeFontPadding: false } : null,
            ]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              onDebouncedQuery(text);
              Keyboard.dismiss();
              onSubmit(text);
            }}
          />
          {text.trim().length >= 2 ? (
            <Pressable
              onPress={() => {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                onDebouncedQuery(text);
                Keyboard.dismiss();
                onSubmit(text);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Valider la recherche"
            >
              <Ionicons name="arrow-forward-circle" size={20} color={colors.accent} />
            </Pressable>
          ) : null}
        </View>
        <HeaderActions />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingLeft: 2,
    paddingRight: 4,
    gap: 4,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    paddingHorizontal: 6,
    fontSize: 13,
    height: 30,
  },
});
