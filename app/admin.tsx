import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Alert, Platform } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { fetchAdminOverview, type AdminOverview } from '@/lib/api';
import { router } from 'expo-router';

const ADMIN_EMAIL = 'admin@delhomme.ovh';

async function copyText(text: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  Alert.alert('Code d’invitation', text);
  return false;
}

export default function AdminScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await fetchAdminOverview());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setData(null);
    }
  }, []);

  useEffect(() => {
    if (user?.email?.toLowerCase() === ADMIN_EMAIL) load();
  }, [user, load]);

  if (!user || user.email.toLowerCase() !== ADMIN_EMAIL) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background, padding: 16 }]}>
        <Text style={{ color: colors.danger, fontSize: 16, textAlign: 'center' }}>
          Accès réservé à l’administrateur.
        </Text>
        <Button title="Retour" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      contentContainerStyle={{ padding: 16 }}
    >
      <Text style={[styles.title, { color: colors.text }]}>Administration</Text>
      <Text style={{ color: colors.textSecondary, marginBottom: 16, lineHeight: 20 }}>
        Connexion normale (Accueil → Connexion) avec ton email admin. Tu partages le code
        d’invitation pour autoriser de nouveaux comptes.
      </Text>

      {!!error && <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text>}

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>Code d’invitation</Text>
        <Pressable
          onPress={async () => {
            if (!data?.inviteCode) return;
            const ok = await copyText(data.inviteCode);
            if (ok) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }}
        >
          <Text style={[styles.code, { color: colors.accent }]}>
            {data?.inviteCode || '— non configuré —'}
          </Text>
        </Pressable>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
          {copied ? 'Copié !' : 'Appuie pour copier'}
        </Text>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>
          Comptes ({data?.userCount ?? 0})
        </Text>
        {(data?.users || []).map((u) => (
          <View key={u.id} style={styles.row}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{u.name}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{u.email}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              {u.email_verified ? 'email OK' : 'non vérifié'} · {u.created_at.slice(0, 10)}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={[styles.section, { color: colors.text }]}>
          Inscriptions en attente ({data?.pendingCount ?? 0})
        </Text>
        {(data?.pending || []).length === 0 ? (
          <Text style={{ color: colors.textSecondary }}>Aucune</Text>
        ) : (
          (data?.pending || []).map((p, i) => (
            <View key={`${p.email}-${i}`} style={styles.row}>
              <Text style={{ color: colors.text }}>{p.email}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {p.platform} · expire {p.expires_at.slice(0, 16)}
              </Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  code: { fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  row: { marginBottom: 12, gap: 2 },
});
