import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/Button';
import { DatePickerField } from '@/components/DatePickerField';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import {
  createMaintenance,
  deleteMaintenance,
  getMaintenances,
  updateMaintenance,
  updateVehicle,
} from '@/lib/database';
import { formatEuro } from '@/lib/calculations';
import { formatDateSlash, toLocalYmd } from '@/lib/dates';
import { confirm, notify } from '@/lib/notify';
import { refreshVehicleReminders } from '@/lib/reminders';
import {
  contreVisiteDueFromCt,
  MAINTENANCE_KIND_LABELS,
  MAINTENANCE_STATUS_LABELS,
  maintenanceIsUrgent,
  nextPeriodicCtDue,
} from '@/lib/vehicleMaintenance';
import { MaintenanceStatusPanel } from '@/components/MaintenanceStatusPanel';
import * as ImagePicker from 'expo-image-picker';
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
  const [doneAt, setDoneAt] = useState(toLocalYmd(new Date()));
  const [dueDate, setDueDate] = useState('');
  const [dueOdometer, setDueOdometer] = useState('');
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notify('Caméra', 'Autorisez la caméra pour photographier le CT / la carte grise.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });
    if (!shot.canceled && shot.assets?.[0]?.uri) {
      setPhotoUri(shot.assets[0].uri);
      notify('Photo', 'Jointe à l’entrée (sauvegarde locale)');
    }
  };

  const pickRegistration = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notify('Caméra', 'Autorisez la caméra.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.75 });
    if (shot.canceled || !shot.assets?.[0]?.uri) return;
    await updateVehicle(vehicleId, { registrationPhotoUri: shot.assets[0].uri });
    await refresh();
    notify(
      'Carte grise',
      'Photo enregistrée. Saisissez l’immat. dans Modifier véhicule (OCR auto à venir).'
    );
  };

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
      const dueOdoRaw = dueOdometer.trim() ? parseFloat(dueOdometer.replace(',', '.')) : null;
      const dueOdo =
        dueOdoRaw != null && Number.isFinite(dueOdoRaw) && dueOdoRaw > 0 ? dueOdoRaw : null;
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
        dueOdometer: dueOdo,
        status: done ? 'done' : 'pending',
        note: note.trim() || undefined,
        photoUri,
      });
      if (kind === 'controle_technique' && done) {
        // Propose prochain CT +2 ans si pas d’échéance
        if (!due) {
          await createMaintenance({
            vehicleId,
            kind: 'controle_technique',
            title: 'Prochain contrôle technique',
            amount: null,
            doneAt: null,
            dueDate: nextPeriodicCtDue(done),
            status: 'pending',
            note: 'Généré après CT favorable',
          });
        }
      }
      await refresh();
      await reload();
      void refreshVehicleReminders();
      setAmount('');
      setNote('');
      setDueOdometer('');
      setPhotoUri(null);
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

      <MaintenanceStatusPanel
        upToDate={vehicle.maintenanceUpToDate}
        checklist={vehicle.maintenanceChecklist}
        onChangeUpToDate={async (v) => {
          await updateVehicle(vehicleId, { maintenanceUpToDate: v });
          await refresh();
        }}
        onChangeChecklist={async (next) => {
          await updateVehicle(vehicleId, { maintenanceChecklist: next });
          await refresh();
        }}
      />

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <Button title="Photo CT / facture" variant="secondary" onPress={pickPhoto} style={{ flex: 1 }} />
        <Button
          title="Photo carte grise"
          variant="secondary"
          onPress={pickRegistration}
          style={{ flex: 1 }}
        />
      </View>
      {photoUri ? (
        <Text style={{ color: colors.success, marginBottom: 8, fontSize: 12 }}>
          Photo prête à joindre à la prochaine entrée.
        </Text>
      ) : null}
      {vehicle.registrationPhotoUri ? (
        <Text style={{ color: colors.textSecondary, marginBottom: 8, fontSize: 12 }}>
          Carte grise : photo enregistrée sur le véhicule.
        </Text>
      ) : null}

      <Text style={[styles.section, { color: colors.text }]}>À faire / historique</Text>
      {items.length === 0 ? (
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
          Aucun événement. Ajoutez un CT, une assurance ou un rappel ci-dessous.
        </Text>
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
                {MAINTENANCE_KIND_LABELS[m.kind]} · {MAINTENANCE_STATUS_LABELS[m.status]}
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
              {m.dueOdometer != null && m.dueOdometer > 0 ? (
                <Text
                  style={{
                    color:
                      vehicle.currentOdometer >= m.dueOdometer
                        ? colors.danger
                        : colors.accent,
                    fontWeight: '700',
                    marginTop: 2,
                  }}
                >
                  Échéance {Math.round(m.dueOdometer).toLocaleString('fr-FR')} km
                  {vehicle.currentOdometer > 0
                    ? ` (compteur ${Math.round(vehicle.currentOdometer).toLocaleString('fr-FR')})`
                    : ''}
                </Text>
              ) : null}
              {m.note ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{m.note}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                {m.status !== 'done' && (
                  <Button
                    title="Marquer fait"
                    variant="secondary"
                    onPress={() => markDone(m)}
                    style={{ flex: 1 }}
                  />
                )}
                <Pressable
                  onPress={() =>
                    confirm('Supprimer', m.title, async () => {
                      await deleteMaintenance(m.id);
                      await reload();
                      void refreshVehicleReminders();
                    }, 'Supprimer')
                  }
                  hitSlop={10}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.danger,
                    borderRadius: 10,
                    padding: 10,
                  }}
                  accessibilityLabel="Supprimer"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
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
      <DatePickerField label="Date réalisée" value={doneAt} onChange={setDoneAt} />
      {dueDate ? (
        <>
          <DatePickerField label="Échéance rappel" value={dueDate} onChange={setDueDate} />
          <Pressable onPress={() => setDueDate('')} style={{ marginBottom: 12 }}>
            <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Effacer l’échéance</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          onPress={() => setDueDate(toLocalYmd(new Date()))}
          style={{ marginBottom: 16 }}
        >
          <Text style={{ color: colors.accent, fontWeight: '700' }}>+ Ajouter une échéance</Text>
        </Pressable>
      )}
      <Input
        label="Échéance km (optionnel)"
        value={dueOdometer}
        onChangeText={setDueOdometer}
        keyboardType="numeric"
        placeholder={
          vehicle.currentOdometer > 0
            ? String(Math.round(vehicle.currentOdometer + 10000))
            : 'ex. 120000'
        }
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
