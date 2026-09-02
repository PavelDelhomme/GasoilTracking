import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { InlineBackBar } from '@/components/HeaderBackButton';
import { resetPassword } from '@/lib/api';
import { notify } from '@/lib/notify';

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = useMemo(() => String(params.token || '').trim(), [params.token]);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!token) {
      notify('Lien', 'Token manquant — rouvrez le lien reçu par email.');
      return;
    }
    if (password !== password2) {
      notify('Mot de passe', 'Les deux saisies ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      const r = await resetPassword(token, password);
      notify('OK', r.message);
      router.replace('/auth' as never);
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <InlineBackBar label="Retour connexion" />
        <Text style={[styles.title, { color: colors.text }]}>Nouveau mot de passe</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: 16, lineHeight: 20 }}>
          Choisissez un mot de passe d’au moins 8 caractères.
        </Text>
        <Input label="Nouveau mot de passe" value={password} onChangeText={setPassword} passwordToggle />
        <Input label="Confirmer" value={password2} onChangeText={setPassword2} passwordToggle />
        <Button title="Enregistrer" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
});
