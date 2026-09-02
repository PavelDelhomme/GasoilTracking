import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAccountDrawer } from '@/context/AccountDrawerContext';
import { useApp } from '@/context/AppContext';
import { useLocale } from '@/context/LocaleContext';
import { useTheme } from '@/hooks/useTheme';
import { useAppUpdate } from '@/context/AppUpdateContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/Button';
import { CountryPickerCard } from '@/components/CountryPickerCard';
import { isManagerEmail, API_URL, getLocalAppVersion } from '@/lib/api';
import { notify } from '@/lib/notify';

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
};

function DrawerRow({ icon, label, subtitle, onPress, danger }: RowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.background }]}>
        <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? colors.danger : colors.text, fontWeight: '700', fontSize: 15 }}>
          {label}
        </Text>
        {!!subtitle && (
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

/** Menu profil : compte, MAJ, admin, préférences (sync = icône header). */
export function AccountDrawer() {
  const { open, closeDrawer } = useAccountDrawer();
  const { colors } = useTheme();
  const { user, logout, refreshCloudNow, pendingRegistrationsCount } = useAuth();
  const { refresh, activeVehicle } = useApp();
  const { country } = useLocale();
  const { updateAvailable, info, checkNow, startUpdate } = useAppUpdate();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(340, Math.max(280, width * 0.82));
  const [busy, setBusy] = useState(false);
  const isMgr = isManagerEmail(user?.email, user?.isManager);

  const go = (path: string) => {
    closeDrawer();
    setTimeout(() => router.push(path as never), 80);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={closeDrawer}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
        <View
          style={[
            styles.panel,
            {
              width: drawerWidth,
              backgroundColor: colors.card,
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 12,
              borderRightColor: colors.border,
            },
          ]}
        >
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headTitle, { color: colors.text }]}>Profil</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                {user ? `${user.name} · ${user.email}` : 'Non connecté — données locales'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
                v{getLocalAppVersion()}
                {info?.version ? ` · prod ${info.version}` : ''}
              </Text>
            </View>
            <Pressable onPress={closeDrawer} hitSlop={10} accessibilityLabel="Fermer le menu">
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {user ? (
              <>
                <Text style={[styles.section, { color: colors.textSecondary }]}>Compte</Text>
                <DrawerRow
                  icon="person-circle-outline"
                  label="Mon compte"
                  subtitle="Mot de passe, email, RGPD…"
                  onPress={() => go('/account')}
                />
                <DrawerRow
                  icon="cloud-download-outline"
                  label="Actualiser depuis le cloud"
                  subtitle="Remplace le local par le snapshot cloud"
                  onPress={async () => {
                    setBusy(true);
                    try {
                      const res = await refreshCloudNow();
                      await refresh();
                      if (res.ok) {
                        showToast('Cloud appliqué');
                      } else if (res.reason === 'empty') {
                        showToast('Aucune donnée cloud');
                      } else {
                        showToast('Connexion requise');
                      }
                      closeDrawer();
                    } catch (e) {
                      notify('Cloud', e instanceof Error ? e.message : 'Échec');
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                {isMgr && (
                  <DrawerRow
                    icon="shield-checkmark-outline"
                    label="Administration"
                    subtitle={
                      pendingRegistrationsCount > 0
                        ? `${pendingRegistrationsCount} compte(s) à valider`
                        : 'Invitations, APK, validations…'
                    }
                    onPress={() => go('/admin')}
                  />
                )}
              </>
            ) : (
              <>
                <Text style={[styles.section, { color: colors.textSecondary }]}>Connexion</Text>
                <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                  <Button
                    title="Connexion / Inscription"
                    onPress={() => go('/auth')}
                    disabled={busy}
                  />
                </View>
              </>
            )}

            <Text style={[styles.section, { color: colors.textSecondary }]}>Application</Text>
            <DrawerRow
              icon="download-outline"
              label={updateAvailable ? 'Installer la mise à jour' : 'Installation / téléchargement'}
              subtitle={
                updateAvailable
                  ? `v${info?.version} disponible — ou plus tard depuis ici`
                  : 'APK, web, iPhone (écran d’accueil)'
              }
              onPress={async () => {
                closeDrawer();
                if (updateAvailable) {
                  await checkNow({ ignoreSnooze: true });
                  await startUpdate();
                  return;
                }
                void Linking.openURL(`${API_URL}/download`);
              }}
            />
            <DrawerRow
              icon="phone-portrait-outline"
              label="Guide web / iPhone"
              subtitle="Page d’installation multi-supports"
              onPress={() => {
                closeDrawer();
                void Linking.openURL(`${API_URL}/download`);
              }}
            />

            <Text style={[styles.section, { color: colors.textSecondary }]}>Préférences</Text>
            <View style={{ paddingHorizontal: 12 }}>
              <CountryPickerCard />
            </View>
            <DrawerRow
              icon="car-outline"
              label="Véhicule actif"
              subtitle={activeVehicle?.name || 'Aucun'}
              onPress={() => go('/(tabs)/vehicles')}
            />

            {user && (
              <>
                <Text style={[styles.section, { color: colors.textSecondary }]}>Session</Text>
                <DrawerRow
                  icon="log-out-outline"
                  label="Déconnexion"
                  danger
                  onPress={async () => {
                    await logout();
                    closeDrawer();
                    showToast('Déconnecté — données locales conservées');
                  }}
                />
              </>
            )}
          </ScrollView>

          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 11,
              textAlign: 'center',
              paddingHorizontal: 16,
            }}
          >
            {country.nameNative} · {country.currency}
            {busy ? ' · …' : ''}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    height: '100%',
    borderRightWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 4, height: 0 },
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  headTitle: { fontSize: 20, fontWeight: '800' },
  section: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
