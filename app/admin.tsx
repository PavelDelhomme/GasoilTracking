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
  approvePendingRegistration,
  createDownloadLink,
  fetchAdminOverview,
  isManagerEmail,
  rejectPendingRegistration,
  resendPendingVerification,
  revokeDownloadLink,
  sendDownloadLinkEmail,
  type AdminOverview,
} from '@/lib/api';
import { notify } from '@/lib/notify';
import { router } from 'expo-router';
import { InlineBackBar } from '@/components/HeaderBackButton';

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
  const { user, refreshMe } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [lastLink, setLastLink] = useState('');
  const [lastWeb, setLastWeb] = useState('');
  const [lastHub, setLastHub] = useState('');
  const [busy, setBusy] = useState(false);

  const isMgr = isManagerEmail(user?.email, user?.isManager);
  const webUrl = data?.webUrl || 'https://gasoil-tracking.delhomme.ovh';
  const hubUrl = data?.downloadPage || `${webUrl}/download`;
  const iosUrl = data?.iosInstallUrl || `${hubUrl}#ios`;

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await fetchAdminOverview());
      await refreshMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setData(null);
    }
  }, [refreshMe]);

  useEffect(() => {
    if (isMgr) void load();
  }, [isMgr, load]);

  if (!user || !isMgr) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background, padding: 16 }]}>
        <Text style={{ color: colors.danger, fontSize: 16, textAlign: 'center' }}>
          Accès réservé aux comptes gestionnaires (admin@delhomme.ovh et
          paveldelhomme@gmail.com).
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
      setLastWeb(res.webUrl || webUrl);
      setLastHub(res.downloadPage || hubUrl);
      const codeHint = res.inviteCode ? `\nCode : ${res.inviteCode}` : '';
      notify(
        res.mailed ? 'Email envoyé' : 'Liens prêts',
        `${res.message}${codeHint}`
      );
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
      <InlineBackBar label="Retour à l’accueil" />
      <Text style={[styles.title, { color: colors.text }]}>Administration</Text>
      <Text style={{ color: colors.textSecondary, marginBottom: 16, lineHeight: 20 }}>
        Gestionnaire : {user.email}. Invitations multi-plateformes, validation de comptes, versions.
      </Text>

      {!!error && <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text>}

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>Versions & canaux</Text>
        <Text style={{ color: colors.text, marginBottom: 6 }}>
          Android APK :{' '}
          {data?.apkAvailable ? `v${data.apkVersion} disponible` : 'pas encore publiée'}
        </Text>
        <Text style={{ color: colors.text, marginBottom: 6 }}>
          Web / iPhone (PWA) : live sur {webUrl.replace(/^https?:\/\//, '')}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 10 }}>
          Sur iPhone il n’y a pas d’App Store pour l’instant : ton pote ouvre le lien web dans Safari
          puis « Partager → Sur l’écran d’accueil ». Même compte cloud qu’Android.
        </Text>
        <Button
          title="Copier lien web (iPhone / navigateur)"
          variant="secondary"
          onPress={async () => {
            await copyText(webUrl);
            setCopied(true);
            notify('Copié', webUrl);
          }}
        />
        <Button
          title="Copier page d’installation (tous supports)"
          variant="secondary"
          onPress={async () => {
            const withCode = data?.inviteCode
              ? `${hubUrl}?code=${encodeURIComponent(data.inviteCode)}`
              : hubUrl;
            await copyText(withCode);
            setCopied(true);
            notify('Copié', withCode);
          }}
          style={{ marginTop: 8 }}
        />
        <Button
          title="Ouvrir page d’installation"
          variant="outline"
          onPress={() => Linking.openURL(iosUrl)}
          style={{ marginTop: 8 }}
        />
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>
          Comptes à valider ({data?.pendingCount ?? 0})
        </Text>
        {(data?.pending || []).length === 0 ? (
          <Text style={{ color: colors.textSecondary }}>Aucun compte en attente.</Text>
        ) : (
          (data?.pending || []).map((p, i) => (
            <View
              key={`${p.email}-${i}`}
              style={[styles.pendingBox, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>{p.name || '—'}</Text>
              <Text style={{ color: colors.accent, fontWeight: '600', marginTop: 2 }}>{p.email}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                {p.platform} · expire {p.expires_at.slice(0, 16).replace('T', ' ')}
              </Text>
              <View style={styles.pendingActions}>
                <Button
                  title="Valider"
                  onPress={async () => {
                    setBusy(true);
                    try {
                      const r = await approvePendingRegistration(p.email);
                      notify('Validé', r.message);
                      await load();
                    } catch (e) {
                      notify('Erreur', e instanceof Error ? e.message : 'Échec');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  loading={busy}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Renvoyer mail"
                  variant="secondary"
                  onPress={async () => {
                    setBusy(true);
                    try {
                      const r = await resendPendingVerification(p.email);
                      notify('Email', r.message);
                    } catch (e) {
                      notify('Erreur', e instanceof Error ? e.message : 'Échec');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  loading={busy}
                  style={{ flex: 1 }}
                />
              </View>
              <Pressable
                onPress={async () => {
                  setBusy(true);
                  try {
                    const r = await rejectPendingRegistration(p.email);
                    notify('Annulé', r.message);
                    await load();
                  } catch (e) {
                    notify('Erreur', e instanceof Error ? e.message : 'Échec');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Text style={{ color: colors.danger, fontSize: 13, marginTop: 8 }}>
                  Refuser / supprimer la demande
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>
          Invitation (iPhone + Android + web + code)
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 }}>
          Un seul email : lien web pour iPhone, APK Android (si publiée), page d’installation, et
          code d’invitation.
        </Text>
        <Input
          label="Email du destinataire"
          value={shareEmail}
          onChangeText={setShareEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="ami@example.com"
        />
        <Button
          title="Envoyer invitation complète"
          onPress={sendMail}
          loading={busy}
        />
        <Button
          title="Créer lien APK sécurisé & copier"
          variant="secondary"
          onPress={makeLink}
          loading={busy}
          style={{ marginTop: 10 }}
        />
        {(!!lastLink || !!lastWeb || !!lastHub) && (
          <View style={{ marginTop: 12, gap: 6 }}>
            {!!lastWeb && (
              <Pressable onPress={() => copyText(lastWeb)}>
                <Text style={{ color: colors.accent, fontSize: 12 }}>Web / iPhone : {lastWeb}</Text>
              </Pressable>
            )}
            {!!lastHub && (
              <Pressable onPress={() => copyText(lastHub)}>
                <Text style={{ color: colors.accent, fontSize: 12 }}>Hub install : {lastHub}</Text>
              </Pressable>
            )}
            {!!lastLink && (
              <Pressable
                onPress={async () => {
                  await copyText(lastLink);
                  setCopied(true);
                }}
              >
                <Text style={{ color: colors.accent, fontSize: 12 }} numberOfLines={3}>
                  APK : {lastLink}
                </Text>
              </Pressable>
            )}
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              {copied ? 'Copié' : 'Appuyer pour copier'}
            </Text>
          </View>
        )}
        {(data?.downloadLinks || []).length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>
              Derniers liens APK
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

      <Card style={{ marginBottom: 24 }}>
        <Text style={[styles.section, { color: colors.text }]}>
          Comptes actifs ({data?.userCount ?? 0})
        </Text>
        {(data?.users || []).map((u) => (
          <View key={u.id} style={styles.row}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{u.name}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{u.email}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              {u.email_verified ? 'email OK' : 'non vérifié'} · {u.created_at.slice(0, 10)}
              {isManagerEmail(u.email) ? ' · gestionnaire' : ''}
            </Text>
          </View>
        ))}
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
  pendingBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  pendingActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
});
