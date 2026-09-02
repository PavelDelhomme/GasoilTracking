import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Platform,
  Linking,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import {
  createDownloadLink,
  fetchAdminOverview,
  isManagerEmail,
  revokeDownloadLink,
  sendDownloadLinkEmail,
  type AdminOverview,
} from '@/lib/api';
import { notify } from '@/lib/notify';
import { router } from 'expo-router';

async function copyText(text: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  notify('Copier', text);
  return false;
}

export default function AdminScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [lastLink, setLastLink] = useState('');
  const [busy, setBusy] = useState(false);

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
    if (isManagerEmail(user?.email)) load();
  }, [user, load]);

  if (!user || !isManagerEmail(user.email)) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background, padding: 16 }]}>
        <Text style={{ color: colors.danger, fontSize: 16, textAlign: 'center' }}>
          Accès réservé à l’admin ou au compte gestionnaire (PERSONAL_MAIL).
        </Text>
        <Button title="Retour" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const makeLink = async () => {
    setBusy(true);
    try {
      const link = await createDownloadLink({ days: 14, maxUses: 50, label: 'Partage live' });
      setLastLink(link.url);
      await copyText(link.url);
      setCopied(true);
      notify('Lien créé', 'Copié dans le presse-papiers (valide 14 j).');
      await load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setBusy(false);
    }
  };

  const sendMail = async () => {
    if (!shareEmail.trim()) {
      notify('Email', 'Indiquez l’adresse du destinataire.');
      return;
    }
    setBusy(true);
    try {
      const res = await sendDownloadLinkEmail(shareEmail.trim(), { days: 14, maxUses: 10 });
      setLastLink(res.url);
      notify(res.mailed ? 'Email envoyé' : 'Lien créé', res.message);
      setShareEmail('');
      await load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setBusy(false);
    }
  };

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
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.text }]}>Administration</Text>
      <Text style={{ color: colors.textSecondary, marginBottom: 16, lineHeight: 20 }}>
        Gestion invitations, comptes, et liens sécurisés de téléchargement APK.
        {data?.apkAvailable
          ? ` APK live : v${data.apkVersion}`
          : ' Aucune APK publiée pour l’instant.'}
      </Text>

      {!!error && <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text>}

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>Téléchargement APK (lien sécurisé)</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 }}>
          Crée un lien à durée limitée (jeton). Les destinataires installent l’APK sans accès admin.
        </Text>
        <Button title="Créer un lien & copier" onPress={makeLink} loading={busy} />
        <Input
          label="Envoyer le lien par email"
          value={shareEmail}
          onChangeText={setShareEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="ami@example.com"
        />
        <Button title="Envoyer le lien" variant="secondary" onPress={sendMail} loading={busy} />
        {!!lastLink && (
          <Pressable
            onPress={async () => {
              await copyText(lastLink);
              setCopied(true);
            }}
            style={{ marginTop: 12 }}
          >
            <Text style={{ color: colors.accent, fontSize: 12 }} numberOfLines={3}>
              {lastLink}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
              {copied ? 'Copié' : 'Appuyer pour copier'} ·{' '}
              <Text
                style={{ color: colors.accent }}
                onPress={() => Linking.openURL(lastLink)}
              >
                Ouvrir
              </Text>
            </Text>
          </Pressable>
        )}
        {(data?.downloadLinks || []).length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>
              Derniers liens
            </Text>
            {(data?.downloadLinks || []).slice(0, 8).map((l) => (
              <View key={l.id} style={styles.row}>
                <Text style={{ color: colors.text, fontSize: 13 }}>
                  {l.label || 'Lien'} · {l.use_count}/{l.max_uses} DL
                  {l.revoked_at ? ' · révoqué' : ''}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                  expire {l.expires_at.slice(0, 10)} · {l.created_by}
                </Text>
                {!l.revoked_at && (
                  <Pressable
                    onPress={async () => {
                      await revokeDownloadLink(l.id);
                      await load();
                      notify('Révoqué', 'Le lien ne fonctionne plus.');
                    }}
                  >
                    <Text style={{ color: colors.danger, fontSize: 12, marginTop: 2 }}>Révoquer</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </Card>

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
