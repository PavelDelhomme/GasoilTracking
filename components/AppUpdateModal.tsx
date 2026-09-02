import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import type { AppVersionInfo } from '@/lib/api';
import { getLocalAppVersion } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import type { UpdateProgress } from '@/lib/appUpdate';

type Props = {
  visible: boolean;
  info: AppVersionInfo | null;
  force: boolean;
  busy: boolean;
  progress: UpdateProgress | null;
  error: string | null;
  onUpdate: () => void;
  onLater: () => void;
};

export function AppUpdateModal({
  visible,
  info,
  force,
  busy,
  progress,
  error,
  onUpdate,
  onLater,
}: Props) {
  const { colors } = useTheme();
  if (!info) return null;
  const local = getLocalAppVersion();
  const pct = Math.round((progress?.progress || 0) * 100);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={force ? undefined : onLater}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card || colors.background, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            {force ? 'Mise à jour obligatoire' : 'Nouvelle version disponible'}
          </Text>
          <Text style={[styles.versions, { color: colors.textSecondary }]}>
            {local} → {info.version}
          </Text>
          {!!info.releaseNotes && (
            <Text style={[styles.notes, { color: colors.text }]}>{info.releaseNotes}</Text>
          )}
          <Text style={[styles.safe, { color: colors.textSecondary }]}>
            Vos données locales sont conservées (mise à jour du même package, sans désinstallation).
            Une sauvegarde est faite avant l’installation ; avec un compte, le cloud est aussi
            synchronisé.
          </Text>

          {busy && (
            <View style={styles.progressBlock}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.progressText, { color: colors.text }]}>
                {progress?.message || 'Préparation…'}
              </Text>
              <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.accent }]}
                />
              </View>
            </View>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          {!busy && (
            <View style={styles.actions}>
              {!force && (
                <Pressable onPress={onLater} style={styles.secondaryBtn}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Plus tard</Text>
                </Pressable>
              )}
              <Pressable
                onPress={onUpdate}
                style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
              >
                <Text style={styles.primaryText}>
                  {Platform.OS === 'android' ? 'Mettre à jour' : 'Télécharger'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 10,
  },
  title: { fontSize: 20, fontWeight: '800' },
  versions: { fontSize: 14, fontWeight: '600' },
  notes: { fontSize: 14, lineHeight: 20 },
  safe: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  progressBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  progressText: { fontSize: 13, textAlign: 'center' },
  barTrack: { height: 8, borderRadius: 4, width: '100%', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  error: { color: '#e94560', fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: 14 },
  primaryBtn: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10 },
  primaryText: { color: '#fff', fontWeight: '700' },
});
