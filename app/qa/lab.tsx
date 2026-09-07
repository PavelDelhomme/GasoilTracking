/**
 * Labo QA — visible uniquement sur appareils allowlistés (Nothing / BV9700 / SM-G990B2).
 * Checklist + smoke tests + résultats locaux pour vérification terrain.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { InlineBackBar } from '@/components/HeaderBackButton';
import { notify, confirm } from '@/lib/notify';
import {
  fetchAppVersion,
  getLocalAppVersion,
  pingApiHealth,
  manageQaLab,
  fetchQaLabStatus,
  isManagerEmail,
} from '@/lib/api';
import {
  QA_CHECKLIST,
  QA_TEST_ACCOUNT_EMAIL,
  getDeviceIdentity,
  isQaLabDevice,
} from '@/lib/qaLabAccess';
import { useAuth } from '@/context/AuthContext';

const CHECK_KEY = 'gasoil_qa_checklist_v1';
const RUNS_KEY = 'gasoil_qa_runs_v1';

type CheckMap = Record<string, boolean>;
type SmokeRun = {
  at: string;
  ok: boolean;
  lines: string[];
};

export default function QaLabScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const device = useMemo(() => getDeviceIdentity(), []);
  const allowed = useMemo(() => isQaLabDevice(device), [device]);
  const isManager = isManagerEmail(user?.email, user?.isManager);
  const [checks, setChecks] = useState<CheckMap>({});
  const [runs, setRuns] = useState<SmokeRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [qaStatus, setQaStatus] = useState<string>('');
  const [revealedPass, setRevealedPass] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(CHECK_KEY);
        if (raw) setChecks(JSON.parse(raw) as CheckMap);
        const r = await AsyncStorage.getItem(RUNS_KEY);
        if (r) setRuns(JSON.parse(r) as SmokeRun[]);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const persistChecks = useCallback(async (next: CheckMap) => {
    setChecks(next);
    await AsyncStorage.setItem(CHECK_KEY, JSON.stringify(next));
  }, []);

  const toggle = (id: string) => {
    void persistChecks({ ...checks, [id]: !checks[id] });
  };

  const runSmoke = async () => {
    setBusy(true);
    const lines: string[] = [];
    let ok = true;
    try {
      const local = getLocalAppVersion();
      lines.push(`App locale : ${local}`);
      const health = await pingApiHealth();
      lines.push(health ? 'API /health : OK' : 'API /health : KO');
      if (!health) ok = false;
      const ver = await fetchAppVersion();
      lines.push(`Serveur : ${ver.version} · force=${Boolean(ver.forceUpdate)}`);
      if (ver.version && local !== ver.version) {
        lines.push(`⚠️ Local ≠ serveur (${local} vs ${ver.version})`);
      }
      lines.push(
        `Appareil : ${device.manufacturer || device.brand} · ${device.model || '?'}`
      );
      lines.push(`Compte : ${user?.email || 'non connecté'}`);
      lines.push(
        user?.email === QA_TEST_ACCOUNT_EMAIL
          ? 'Compte QA lab actif'
          : `Compte QA attendu : ${QA_TEST_ACCOUNT_EMAIL}`
      );
    } catch (e) {
      ok = false;
      lines.push(e instanceof Error ? e.message : 'Erreur smoke');
    }
    const run: SmokeRun = { at: new Date().toISOString(), ok, lines };
    const next = [run, ...runs].slice(0, 12);
    setRuns(next);
    await AsyncStorage.setItem(RUNS_KEY, JSON.stringify(next));
    setBusy(false);
    notify(ok ? 'Smoke OK' : 'Smoke KO', lines[0] || 'Terminé');
  };

  const resetLocalQa = () => {
    confirm(
      'Effacer résultats QA locaux',
      'Supprime checklist et historiques smoke sur CET appareil seulement (pas le cloud).',
      async () => {
        setChecks({});
        setRuns([]);
        await AsyncStorage.multiRemove([CHECK_KEY, RUNS_KEY]);
        notify('QA', 'Résultats locaux effacés');
      }
    );
  };

  if (!allowed) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Introuvable' }} />
        <InlineBackBar />
        <Text style={{ color: colors.textSecondary, marginTop: 24, textAlign: 'center' }}>
          Cette section n’est pas disponible sur cet appareil.
        </Text>
        <Button title="Retour" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const done = QA_CHECKLIST.filter((c) => checks[c.id]).length;

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
    >
      <Stack.Screen options={{ title: 'Labo QA' }} />
      <InlineBackBar />
      <Text style={[styles.title, { color: colors.text }]}>Labo QA (appareils labo)</Text>
      <Text style={{ color: colors.textSecondary, marginBottom: 12, lineHeight: 20 }}>
        Visible uniquement sur Nothing, Blackview BV9700 et Samsung SM-G990B2. Les autres
        utilisateurs n’ont pas accès à cet écran.
      </Text>

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>Appareil</Text>
        <Text style={{ color: colors.text }}>
          {device.manufacturer || device.brand} · {device.model || 'modèle ?'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
          {device.product || '—'} · {Platform.OS} · app {getLocalAppVersion()}
        </Text>
        <Text style={{ color: colors.accent, marginTop: 8, fontWeight: '700' }}>
          Accès labo : autorisé
        </Text>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>Compte de test</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
          Compte dédié <Text style={{ fontWeight: '700', color: colors.text }}>{QA_TEST_ACCOUNT_EMAIL}</Text>
          . Mot de passe dans <Text style={{ fontWeight: '700' }}>.env → QA_LAB_PASSWORD</Text> (ou
          régénéré ci‑dessous si manager). Données jetables : on les efface après ta validation.
        </Text>
        {user?.email === QA_TEST_ACCOUNT_EMAIL ? (
          <Text style={{ color: colors.success || colors.accent, marginTop: 8, fontWeight: '700' }}>
            Connecté en compte QA
          </Text>
        ) : (
          <Text style={{ color: colors.warning || colors.textSecondary, marginTop: 8 }}>
            Connecté : {user?.email || 'aucun'} — pour tester le cloud, reconnecte avec qa.lab.
          </Text>
        )}
        {isManager && (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Gestion manager (créer / reset MDP / supprimer)
            </Text>
            <Button
              title="Statut compte QA"
              variant="secondary"
              onPress={async () => {
                try {
                  const s = await fetchQaLabStatus();
                  setQaStatus(
                    s.exists
                      ? `Existe · ${s.user?.name || ''} · sync ${s.sync?.updated_at || 'vide'}`
                      : 'Absent — créer pour tester'
                  );
                } catch (e) {
                  notify('QA', e instanceof Error ? e.message : 'Erreur statut');
                }
              }}
            />
            <Button
              title="Créer / reset MDP (aléatoire)"
              onPress={() => {
                confirm(
                  'Reset compte QA ?',
                  'Génère un nouveau mot de passe (affiché une fois). Mets-le aussi dans .env QA_LAB_PASSWORD.',
                  async () => {
                    try {
                      const r = await manageQaLab('reset');
                      if (r.password) setRevealedPass(r.password);
                      setQaStatus(r.message || 'OK');
                      notify('QA', r.message || 'Mot de passe régénéré');
                    } catch (e) {
                      notify('Erreur', e instanceof Error ? e.message : 'Échec');
                    }
                  }
                );
              }}
            />
            <Button
              title="Supprimer compte QA + sync"
              variant="secondary"
              onPress={() => {
                confirm(
                  'Supprimer qa.lab ?',
                  'Efface le compte cloud et ses données sync. Irréversible.',
                  async () => {
                    try {
                      const r = await manageQaLab('delete');
                      setRevealedPass(null);
                      setQaStatus(r.deleted ? 'Supprimé' : 'Déjà absent');
                      notify('QA', r.deleted ? 'Compte QA supprimé' : 'Déjà absent');
                    } catch (e) {
                      notify('Erreur', e instanceof Error ? e.message : 'Échec');
                    }
                  },
                  'Supprimer'
                );
              }}
            />
            {qaStatus ? (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{qaStatus}</Text>
            ) : null}
            {revealedPass ? (
              <View
                style={{
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.accent,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Mot de passe (une fois)</Text>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 4 }}>
                  {revealedPass}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6 }}>
                  Copie-le dans .env → QA_LAB_PASSWORD puis reconnecte-toi.
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <View style={styles.rowBetween}>
          <Text style={[styles.section, { color: colors.text, marginBottom: 0 }]}>
            Checklist terrain
          </Text>
          <Text style={{ color: colors.accent, fontWeight: '800' }}>
            {done}/{QA_CHECKLIST.length}
          </Text>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginVertical: 8 }}>
          Coche au fur et à mesure. Les résultats restent sur l’appareil.
        </Text>
        {QA_CHECKLIST.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => toggle(item.id)}
            style={[styles.checkRow, { borderBottomColor: colors.border }]}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {item.hint}
              </Text>
            </View>
            <Switch
              value={Boolean(checks[item.id])}
              onValueChange={() => toggle(item.id)}
              trackColor={{ true: colors.accent }}
            />
          </Pressable>
        ))}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.section, { color: colors.text }]}>Smoke auto</Text>
        <Button title="Lancer smoke (API + version)" onPress={() => void runSmoke()} loading={busy} />
        {runs[0] && (
          <View style={{ marginTop: 12 }}>
            <Text
              style={{
                color: runs[0].ok ? colors.accent : colors.danger,
                fontWeight: '800',
                marginBottom: 6,
              }}
            >
              Dernier run · {new Date(runs[0].at).toLocaleString('fr-FR')} ·{' '}
              {runs[0].ok ? 'OK' : 'KO'}
            </Text>
            {runs[0].lines.map((l) => (
              <Text key={l} style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                • {l}
              </Text>
            ))}
          </View>
        )}
      </Card>

      <Button title="Effacer résultats QA locaux" variant="secondary" onPress={resetLocalQa} />
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 10, lineHeight: 16 }}>
        La suppression du compte QA cloud + données de test se fera après ta validation
        complète (demande explicite).
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  section: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
