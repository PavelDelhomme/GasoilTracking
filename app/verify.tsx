import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';

/**
 * Page ouverte après clic sur le lien email (web) ou deep link mobile.
 * Query: ok, msg, session (JWT optionnel)
 */
export default function VerifyScreen() {
  const { colors } = useTheme();
  const { applySession } = useAuth();
  const params = useLocalSearchParams<{ ok?: string; msg?: string; session?: string }>();
  const [done, setDone] = useState(false);
  const ok = params.ok === '1' || params.ok === 'true';
  const msg =
    typeof params.msg === 'string'
      ? decodeURIComponent(params.msg)
      : ok
        ? 'Email vérifié.'
        : 'Vérification impossible.';

  useEffect(() => {
    (async () => {
      const session = typeof params.session === 'string' ? params.session : '';
      if (ok && session) {
        try {
          const mid = session.split('.')[1];
          if (mid) {
            const json = JSON.parse(atob(mid.replace(/-/g, '+').replace(/_/g, '/')));
            await applySession(session, {
              id: json.sub,
              email: json.email || '',
              name: (json.email && String(json.email).split('@')[0]) || 'Utilisateur',
            });
          }
        } catch {
          /* ignore */
        }
      }
      setDone(true);
    })();
  }, [ok, params.session, applySession]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: ok ? colors.success : colors.danger }]}>
        {ok ? 'Email confirmé' : 'Échec de vérification'}
      </Text>
      <Text style={[styles.msg, { color: colors.textSecondary }]}>{msg}</Text>
      {done && (
        <Button
          title={ok ? 'Continuer' : 'Retour à la connexion'}
          onPress={() => router.replace((ok ? '/' : '/auth') as never)}
          style={{ marginTop: 20 }}
        />
      )}
      {Platform.OS === 'web' && ok && (
        <Text style={{ color: colors.textSecondary, marginTop: 16, fontSize: 13, textAlign: 'center' }}>
          Sur mobile, ouvrez l’app puis connectez-vous avec le même email si besoin.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  msg: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
