import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import {
  createMaintenance,
  deleteMaintenance,
  getMaintenances,
  updateMaintenance,
} from '@/lib/database';
import { formatEuro } from '@/lib/calculations';
import { formatDateSlash } from '@/lib/dates';
import { confirm, notify } from '@/lib/notify';
import { refreshVehicleReminders } from '@/lib/reminders';
import {
  contreVisiteDueFromCt,
  MAINTENANCE_KIND_LABELS,
  maintenanceIsUrgent,
} from '@/lib/vehicleMaintenance';
import type { MaintenanceKind, VehicleMaintenance } from '@/types';

const KINDS: MaintenanceKind[] = [
  'controle_technique',
  'contre_visite',
  'controle_pollution',
  'entretien',
  'assurance',
  'amende',
  'autre',
];

export default function VehicleMaintenanceScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const vehicleId = Number(id);
  const { vehicles, refresh } = useApp();
  const { colors } = useTheme();
  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const [items, setItems] = useState<VehicleMaintenance[]>([]);
  const [kind, setKind] = useState<MaintenanceKind>('controle_technique');
  const [title, setTitle] = useState('Contrôle technique');
  const [amount, setAmount] = useState('');
  const [doneAt, setDoneAt] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!Number.isFinite(vehicleId)) return;
    setItems(await getMaintenances(vehicleId));
  }, [vehicleId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  if (!vehicle) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background, padding: 16 }]}>
        <Text style={{ color: colors.danger }}>Véhicule introuvable.</Text>
        <Button title="Retour" onPress={() => router.back()} style={{ marginTop: 12 }} />
      </View>
    );
  }

  const save = async () => {
    if (!title.trim()) {
      notify('Titre', 'Indiquez un titre.');
      return;
    }
    setLoading(true);
    try {
      const amt = amount.trim() ? parseFloat(amount.replace(',', '.')) : null;
      let due = dueDate.trim() || null;
      const done = doneAt.trim() || null;
      if (kind === 'controle_technique' && done && !due) {
        // Ne force pas la contre-visite ici ; l’utilisateur peut l’ajouter à part
      }
      if (kind === 'contre_visite' && !due && done) {
        due = null;
      }
      await createMaintenance({
        vehicleId,
        kind,
        title: title.trim(),
        amount: Number.isFinite(amt as number) ? amt : null,
        doneAt: done,
        dueDate: due,
        status: done ? 'done' : 'pending',
        note: note.trim() || undefined,
      });
      await refresh();
      await reload();
      void refreshVehicleReminders();
      setAmount('');
      setNote('');
      notify('Enregistré', title.trim());
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setLoading(false);
    }
  };

  const addCtWithContreVisite = async () => {
    setLoading(true);
    try {
      const done = doneAt.trim() || '2026-08-05';
      const amt = amount.trim() ? parseFloat(amount.replace(',', '.')) : 63;
      await createMaintenance({
        vehicleId,
        kind: 'controle_technique',
        title: 'Contrôle technique',
        amount: amt,
        doneAt: done,
        dueDate: null,
        status: 'done',
        note: note.trim() || 'CT réalisé',
      });
      const cvDue = contreVisiteDueFromCt(done);
      await createMaintenance({
        vehicleId,
        kind: 'contre_visite',
        title: 'Contre-visite à passer',
        amount: null,
        doneAt: null,
        dueDate: cvDue,
        status: 'pending',
        note: 'Délai légal usuel : 2 mois après le CT (défauts majeurs).',
      });
      await refresh();
      await reload();
      void refreshVehicleReminders();
      notify('CT + rappel', `Contre-visite à faire avant le ${cvDue}`);
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setLoading(false);
    }
  };

  const markDone = async (m: VehicleMaintenance) => {
    await updateMaintenance(m.id, {
      status: 'done',
      doneAt: new Date().toISOString().slice(0, 10),
    });
    await reload();
    void refreshVehicleReminders();
    notify('Fait', m.title);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.text }]}>{vehicle.name}</Text>
      <Text style={{ color: colors.textSecondary, marginBottom: 16, lineHeight: 18 }}>
        CT, contre-visite, contrôle pollution, assurance, entretien… L’app rappelle les échéances
        (notifications si activées sur le véhicule).
      </Text>

      <Text style={[styles.section, { color: colors.text }]}>À faire / historique</Text>
      {items.length === 0 ? (
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>Aucun événement.</Text>
      ) : (
        items.map((m) => {
          const urgent = maintenanceIsUrgent(m);
          return (
            <Card
              key={m.id}
              style={{
                marginBottom: 10,
                borderColor: m.status === 'overdue' || urgent ? colors.danger : colors.border,
                borderWidth: 1,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>{m.title}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {MAINTENANCE_KIND_LABELS[m.kind]} · {m.status}
                {m.amount != null ? ` · ${formatEuro(m.amount)}` : ''}
              </Text>
              {m.doneAt ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Fait le {formatDateSlash(m.doneAt)}
                </Text>
              ) : null}
              {m.dueDate ? (
                <Text
                  style={{
                    color: m.status === 'overdue' || urgent ? colors.danger : colors.accent,
                    fontWeight: '700',
                    marginTop: 4,
                  }}
                >
                  Échéance {formatDateSlash(m.dueDate)}
                </Text>
              ) : null}
              {m.note ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{m.note}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {m.status !== 'done' && (
                  <Button title="Marquer fait" variant="secondary" onPress={() => markDone(m)} />
                )}
                <Button
                  title="Suppr."
                  variant="secondary"
                  onPress={() =>
                    confirm('Supprimer', m.title, async () => {
                      await deleteMaintenance(m.id);
                      await reload();
                    })
                  }
                />
              </View>
            </Card>
          );
        })
      )}

      <Text style={[styles.section, { color: colors.text }]}>Ajouter</Text>
      <View style={styles.chips}>
        {KINDS.map((k) => (
          <Pressable
            key={k}
            onPress={() => {
              setKind(k);
              setTitle(MAINTENANCE_KIND_LABELS[k]);
            }}
            style={[
              styles.chip,
              {
                borderColor: colors.border,
                backgroundColor: kind === k ? colors.accent + '22' : colors.card,
              },
            ]}
          >
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
              {MAINTENANCE_KIND_LABELS[k]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Input label="Titre" value={title} onChangeText={setTitle} />
      <Input
        label="Montant (€) — optionnel"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="63"
      />
      <Input
        label="Date réalisée (AAAA-MM-JJ)"
        value={doneAt}
        onChangeText={setDoneAt}
        placeholder="2026-08-05"
      />
      <Input
        label="Échéance rappel (AAAA-MM-JJ)"
        value={dueDate}
        onChangeText={setDueDate}
        placeholder="2026-10-05"
      />
      <Input label="Note" value={note} onChangeText={setNote} />
      <Button title="Enregistrer" onPress={save} loading={loading} />
      <Button
        title="CT fait + créer contre-visite (+2 mois)"
        variant="secondary"
        onPress={addCtWithContreVisite}
        loading={loading}
        style={{ marginTop: 8 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
});
