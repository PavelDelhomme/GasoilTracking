import React from 'react';
import { Pressable, StyleSheet, Platform, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccountDrawer } from '@/context/AccountDrawerContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { isManagerEmail } from '@/lib/api';

/** Bouton hamburger — ouvre le drawer compte / admin. */
export function DrawerMenuButton() {
  const { openDrawer } = useAccountDrawer();
  const { colors } = useTheme();
  const { user, pendingRegistrationsCount } = useAuth();
  const showBadge =
    isManagerEmail(user?.email, user?.isManager) && pendingRegistrationsCount > 0;

  return (
    <Pressable
      onPress={openDrawer}
      accessibilityRole="button"
      accessibilityLabel={
        showBadge
          ? `Menu compte, ${pendingRegistrationsCount} compte(s) à valider`
          : 'Ouvrir le menu compte'
      }
      hitSlop={10}
      style={styles.btn}
    >
      <Ionicons name="menu" size={24} color={colors.text} />
      {showBadge && (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={styles.badgeText}>
            {pendingRegistrationsCount > 9 ? '9+' : pendingRegistrationsCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginLeft: Platform.OS === 'web' ? 16 : 12,
    padding: 6,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
});
