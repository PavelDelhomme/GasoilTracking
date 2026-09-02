import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { isManagerEmail } from '@/lib/api';
import { notify } from '@/lib/notify';

/** Bannière manager : comptes en attente de validation. */
export function PendingAccountsBanner() {
  const { user, pendingRegistrationsCount, pendingRegistrations, refreshMe } = useAuth();
  const { colors } = useTheme();
  const alertedRef = useRef<string>('');

  const isMgr = isManagerEmail(user?.email, user?.isManager);

  useEffect(() => {
    if (!isMgr || !user) return;
    void refreshMe();
  }, [isMgr, user?.id, refreshMe]);

  useEffect(() => {
    if (!isMgr || pendingRegistrationsCount <= 0) return;
    const key = pendingRegistrations.map((p) => p.email).join('|') || String(pendingRegistrationsCount);
    if (alertedRef.current === key) return;
    alertedRef.current = key;
    const emails =
      pendingRegistrations.length > 0
        ? pendingRegistrations.map((p) => p.email).join(', ')
        : `${pendingRegistrationsCount} compte(s)`;
    notify(
      'Compte(s) à valider',
      `À valider : ${emails}. Ouvrez Administration.`
    );
  }, [isMgr, pendingRegistrationsCount, pendingRegistrations]);

  if (!isMgr || pendingRegistrationsCount <= 0) return null;

  const emailsPreview =
    pendingRegistrations.length > 0
      ? pendingRegistrations
          .slice(0, 3)
          .map((p) => p.email)
          .join(', ') + (pendingRegistrations.length > 3 ? '…' : '')
      : `${pendingRegistrationsCount} inscription(s)`;

  return (
    <Pressable
      onPress={() => router.push('/admin' as never)}
      style={[styles.banner, { backgroundColor: colors.accent + '22', borderColor: colors.accent }]}
      accessibilityRole="button"
      accessibilityLabel="Ouvrir l’administration pour valider les comptes"
    >
      <Ionicons name="alert-circle" size={22} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>
          {pendingRegistrationsCount} compte
          {pendingRegistrationsCount > 1 ? 's' : ''} à valider
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
          {emailsPreview}
        </Text>
      </View>
      <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>Valider</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  title: { fontWeight: '700', fontSize: 14 },
});
