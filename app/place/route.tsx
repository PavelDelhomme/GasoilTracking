import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { DatePickerField } from '@/components/DatePickerField';
import {
  createRecurringRoute,
  getPlaces,
  getRecurringRoutes,
  updateRecurringRoute,
} from '@/lib/database';
import { notify } from '@/lib/notify';
import { toLocalYmd } from '@/lib/dates';
import type { Place } from '@/types';

export default function RouteScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : null;
  const isEdit = Number.isFinite(editId) && (editId as number) > 0;
  const { activeVehicle } = useApp();
  const { colors } = useTheme();
  const [places, setPlaces] = useState<Place[]>([]);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [distanceKm, setDistanceKm] = useState('20');
  const [workDays, setWorkDays] = useState('5');
  const [onVacation, setOnVacation] = useState(false);
  const [vacationUntil, setVacationUntil] = useState(toLocalYmd(new Date()));
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(!isEdit);

  useEffect(() => {
    (async () => {
      const p = await getPlaces();
      setPlaces(p);
      if (isEdit && editId) {
        const routes = await getRecurringRoutes();
        const r = routes.find((x) => x.id === editId);
        if (!r) {
          notify('Erreur', 'Trajet introuvable.');
          router.back();
          return;
        }
        setName(r.name);
        setFromId(r.fromPlaceId);
        setToId(r.toPlaceId);
        setDistanceKm(String(r.distanceKm));
        setWorkDays(String(r.workDaysPerWeek || r.timesPerWeek || 5));
        setOnVacation(!!r.isOnVacation);
        if (r.vacationUntil) setVacationUntil(r.vacationUntil);
        setReady(true);
        return;
      }
      const home = p.find((x) => x.kind === 'home');
      const work = p.find((x) => x.kind === 'work');
      if (home) setFromId(home.id);
      if (work) setToId(work.id);
      if (home && work) setName('Domicile → Travail');
      setReady(true);
    })();
  }, [editId, isEdit]);

  const save = async () => {
    if (!fromId || !toId) {
      notify('Erreur', 'Choisissez départ et arrivée (créez des lieux avant).');
      return;
    }
    const km = parseFloat(distanceKm.replace(',', '.'));
    const days = parseFloat(workDays.replace(',', '.'));
    if (!km || km <= 0 || !days || days <= 0 || days > 7) {
      notify('Erreur', 'Distance et jours travaillés / semaine (1–7) requis.');
      return;
    }
    setLoading(true);
    try {
      const from = places.find((p) => p.id === fromId);
      const to = places.find((p) => p.id === toId);
      const payload = {
        name: name.trim() || `${from?.name} → ${to?.name}`,
        fromPlaceId: fromId,
        toPlaceId: toId,
        distanceKm: km,
        timesPerWeek: days,
        workDaysPerWeek: days,
        isOnVacation: onVacation,
        vacationUntil: onVacation ? vacationUntil : null,
      };
      if (isEdit && editId) {
        await updateRecurringRoute(editId, payload);
        notify('Trajet régulier', 'Modifié.');
      } else {
        await createRecurringRoute({
          ...payload,
          vehicleId: activeVehicle?.id ?? null,
          isActive: true,
        });
        notify('Trajet régulier', 'Ajouté pour l’estimation budget.');
      }
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setLoading(false);
    }
  };

  const PlacePicker = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number | null;
    onChange: (id: number) => void;
  }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6 }}>{label}</Text>
      {places.length === 0 ? (
        <Text style={{ color: colors.danger }}>Aucun lieu — créez-en dans Budget.</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {places.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => onChange(p.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: value === p.id ? colors.accent : colors.card,
              }}
            >
              <Text style={{ color: value === p.id ? '#fff' : colors.text, fontSize: 13 }}>
                {p.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        <Text style={{ color: colors.textSecondary }}>Chargement…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
        {isEdit
          ? 'Modifier le trajet régulier (jours, vacances, distance, lieux).'
          : 'Trajet récurrent pour estimer le budget. Indiquez jours travaillés ; vacances = pause estimation.'}
      </Text>
      <Input label="Nom" value={name} onChangeText={setName} placeholder="Domicile → Travail" />
      <PlacePicker label="Départ" value={fromId} onChange={setFromId} />
      <PlacePicker label="Arrivée" value={toId} onChange={setToId} />
      <Input
        label="Distance aller (km)"
        value={distanceKm}
        onChangeText={setDistanceKm}
        keyboardType="numeric"
      />
      <Input
        label="Jours travaillés / semaine"
        value={workDays}
        onChangeText={setWorkDays}
        keyboardType="numeric"
        placeholder="5 = lun–ven"
      />

      <View style={styles.switchRow}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>En vacances / congés</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Pause l’estimation budget jusqu’à la date de reprise.
          </Text>
        </View>
        <Switch
          value={onVacation}
          onValueChange={setOnVacation}
          trackColor={{ false: colors.border, true: colors.accent }}
        />
      </View>
      {onVacation && (
        <DatePickerField label="Reprise le" value={vacationUntil} onChange={setVacationUntil} />
      )}

      <Button title={isEdit ? 'Enregistrer' : 'Ajouter'} onPress={save} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
});
