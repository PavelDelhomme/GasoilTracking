import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';

export default function AuthScreen() {
  const { colors } = useTheme();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.back();
    } catch (e: any) {
      setError(e.message || 'Échec de la connexion');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: colors.accentLight }]}>
            <Ionicons name="map" size={48} color={colors.accent} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Hubera Maps</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Connectez-vous avec votre compte Hubera Fuel
          </Text>
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: `${colors.error}20` }]}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Mot de passe"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          <Pressable
            style={[styles.loginButton, { backgroundColor: colors.accent }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.loginButtonText}>Se connecter</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Pas encore de compte ?
          </Text>
          <Text style={[styles.footerLink, { color: colors.accent }]}>
            Créez-en un dans Hubera Fuel
          </Text>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="information-circle" size={20} color={colors.accent} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Hubera Maps utilise le même compte que Hubera Fuel. Vos véhicules et trajets sont
            synchronisés entre les deux applications.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500' },
  form: { gap: 14 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  input: { flex: 1, fontSize: 16 },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
  },
  loginButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  footer: { alignItems: 'center', marginTop: 24, gap: 4 },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: '600' },
  infoCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 32,
    gap: 10,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
