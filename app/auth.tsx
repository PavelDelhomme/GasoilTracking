import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';

export default function AuthScreen() {
  const { login, register } = useAuth();
  const { colors } = useTheme();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(
    process.env.EXPO_PUBLIC_PERSONAL_MAIL || ''
  );
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
        router.replace('/' as never);
      } else {
        if (!inviteCode.trim()) throw new Error('Code d’invitation requis');
        if (password !== passwordConfirm) {
          throw new Error('Les mots de passe ne correspondent pas');
        }
        if (password.length < 8) {
          throw new Error('Mot de passe : au moins 8 caractères');
        }
        const res = await register(
          email.trim(),
          password,
          name.trim() || email.split('@')[0],
          inviteCode.trim()
        );
        setInfo(
          res?.message ||
            'Email envoyé ! Ouvrez-le, cliquez « Ouvrir la page de validation », puis « Confirmer mon email ». Ensuite connectez-vous ici.'
        );
        setMode('login');
        setPassword('');
        setPasswordConfirm('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          {mode === 'login' ? 'Connexion' : 'Créer un compte'}
        </Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          {mode === 'login'
            ? 'Même formulaire pour tous (y compris admin). Données privées par compte.'
            : 'Code d’invitation requis (fourni par l’admin). Confirmez le mot de passe deux fois. Un email activera le compte — pas admin.'}
        </Text>
        {mode === 'register' && (
          <>
            <Input label="Nom" value={name} onChangeText={setName} placeholder="Vous" />
            <Input
              label="Code d’invitation"
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="none"
              placeholder="Fourni par l’admin"
            />
          </>
        )}
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="vous@email.com"
        />
        <Input
          label="Mot de passe"
          value={password}
          onChangeText={setPassword}
          passwordToggle
          placeholder="••••••••"
        />
        {mode === 'register' && (
          <Input
            label="Confirmer le mot de passe"
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            passwordToggle
            placeholder="••••••••"
          />
        )}
        {!!error && <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text>}
        {!!info && <Text style={{ color: colors.success, marginBottom: 12 }}>{info}</Text>}
        <Button
          title={mode === 'login' ? 'Se connecter' : 'Recevoir l’email de validation'}
          onPress={submit}
          loading={loading}
        />
        <Button
          title={mode === 'login' ? 'Pas de compte ? S’inscrire' : 'Déjà un compte ? Connexion'}
          variant="outline"
          onPress={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
            setInfo('');
          }}
          style={{ marginTop: 12 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 32 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  sub: { fontSize: 14, marginBottom: 20, lineHeight: 20 },
});
