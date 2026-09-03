import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useAppUpdate } from '@/context/AppUpdateContext';
import { useToast } from '@/context/ToastContext';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { InlineBackBar } from '@/components/HeaderBackButton';
import {
  changePassword,
  deleteAccount,
  forgotPassword,
  getLocalAppVersion,
  resendVerificationEmail,
} from '@/lib/api';
import { notify, confirm } from '@/lib/notify';

export default function AccountScreen() {
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const { info, updateAvailable, checkNow, startUpdate } = useAppUpdate();
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background, padding: 16 }]}>
        <InlineBackBar />
        <Text style={{ color: colors.text, marginBottom: 12 }}>Connectez-vous pour gérer le compte.</Text>
        <Button title="Connexion" onPress={() => router.push('/auth' as never)} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <InlineBackBar />
      <Text style={[styles.title, { color: colors.text }]}>Mon compte</Text>
      <Text style={{ color: colors.textSecondary, marginBottom: 16, lineHeight: 20 }}>
        Informations, sécurité, mise à jour et droits RGPD.
      </Text>

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>Profil</Text>
        <Text style={{ color: colors.text, fontWeight: '700' }}>{user.name}</Text>
        <Text style={{ color: colors.accent, marginTop: 4 }}>{user.email}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>
          App locale v{getLocalAppVersion()}
          {info?.version ? ` · prod v${info.version}` : ''}
        </Text>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>Mise à jour</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 }}>
          {updateAvailable
            ? `Nouvelle version ${info?.version} disponible — installation dans l’app.`
            : `Vous êtes à jour (v${getLocalAppVersion()}). Le bouton vérifie le serveur puis installe dans l’app.`}
        </Text>
        <Button
          title={updateAvailable ? 'Installer maintenant' : 'Vérifier et installer'}
          onPress={async () => {
            const found = await checkNow({ ignoreSnooze: true });
            if (found) {
              await startUpdate();
              return;
            }
            showToast(`À jour — v${getLocalAppVersion()}`);
          }}
          style={{ marginBottom: 8 }}
        />
        <Button
          title="Revérifier une mise à jour"
          variant="outline"
          onPress={async () => {
            const found = await checkNow({ ignoreSnooze: true });
            showToast(found ? 'Mise à jour proposée' : 'Aucune nouvelle version');
          }}
          style={{ marginTop: 8 }}
        />
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>Mot de passe</Text>
        <Input
          label="Mot de passe actuel"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          passwordToggle
        />
        <Input
          label="Nouveau mot de passe"
          value={newPassword}
          onChangeText={setNewPassword}
          passwordToggle
        />
        <Input
          label="Confirmer"
          value={newPassword2}
          onChangeText={setNewPassword2}
          passwordToggle
        />
        <Button
          title="Changer le mot de passe"
          loading={busy}
          onPress={async () => {
            if (newPassword !== newPassword2) {
              notify('Mot de passe', 'Les deux saisies ne correspondent pas.');
              return;
            }
            setBusy(true);
            try {
              const r = await changePassword(currentPassword, newPassword);
              showToast(r.message);
              setCurrentPassword('');
              setNewPassword('');
              setNewPassword2('');
            } catch (e) {
              notify('Erreur', e instanceof Error ? e.message : 'Échec');
            } finally {
              setBusy(false);
            }
          }}
        />
        <Pressable
          onPress={async () => {
            setBusy(true);
            try {
              const r = await forgotPassword(user.email);
              notify('Email', r.message);
            } catch (e) {
              notify('Erreur', e instanceof Error ? e.message : 'Échec');
            } finally {
              setBusy(false);
            }
          }}
          style={{ marginTop: 12 }}
        >
          <Text style={{ color: colors.accent, fontWeight: '600' }}>
            Recevoir un lien de réinitialisation par email
          </Text>
        </Pressable>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>Email</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 }}>
          Si une inscription est encore en attente de validation pour cet email, renvoyez le mail.
        </Text>
        <Button
          title="Renvoyer l’email de validation"
          variant="secondary"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              const r = await resendVerificationEmail(user.email);
              notify('Email', r.message || 'OK');
            } catch (e) {
              notify('Email', e instanceof Error ? e.message : 'Échec');
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.danger }]}>RGPD — supprimer mon compte</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 }}>
          Supprime définitivement le compte cloud et les données synchronisées. Les données locales
          sur cet appareil restent jusqu’à désinstallation.
        </Text>
        <Input
          label="Mot de passe"
          value={deletePassword}
          onChangeText={setDeletePassword}
          passwordToggle
        />
        <Button
          title="Supprimer mon compte"
          variant="danger"
          loading={busy}
          onPress={() => {
            confirm(
              'Supprimer le compte ?',
              'Irréversible. Tapez SUPPRIMER dans la confirmation API — continuez seulement si vous êtes sûr.',
              async () => {
                setBusy(true);
                try {
                  const r = await deleteAccount(deletePassword, 'SUPPRIMER');
                  await logout();
                  notify('Compte', r.message);
                  router.replace('/' as never);
                } catch (e) {
                  notify('Erreur', e instanceof Error ? e.message : 'Échec');
                } finally {
                  setBusy(false);
                }
              },
              'Supprimer'
            );
          }}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
});
