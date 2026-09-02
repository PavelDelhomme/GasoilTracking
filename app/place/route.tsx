import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, ActivityIndicator } from 'react-native';
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
  updatePlace,
  updateRecurringRoute,
} from '@/lib/database';
import {
  buildSuggestedItineraries,
  fetchDrivingDistanceKm,
  resolvePlaceCoords,
  type SuggestedItinerary,
} from '@/lib/roadDistance';
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
  const [distanceKm, setDistanceKm] = useState('');
  const [workDays, setWorkDays] = useState('5');
  const [onVacation, setOnVacation] = useState(false);
  const [vacationUntil, setVacationUntil] = useState(toLocalYmd(new Date()));
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(!isEdit);
  const [distLoading, setDistLoading] = useState(false);
  const [distHint, setDistHint] = useState('');
  const [durationMin, setDurationMin] = useState<number | null>(null);

  const suggestions = useMemo(() => buildSuggestedItineraries(places), [places]);

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

  const calcDistance = useCallback(
    async (fId: number | null, tId: number | null, opts?: { silent?: boolean }) => {
      if (!fId || !tId || fId === tId) return;
      const from = places.find((p) => p.id === fId);
      const to = places.find((p) => p.id === tId);
      if (!from || !to) return;

      setDistLoading(true);
      setDistHint('');
      setDurationMin(null);
      try {
        const [a, b] = await Promise.all([resolvePlaceCoords(from), resolvePlaceCoords(to)]);
        if (!a || !b) {
          const missing = !a ? from.name : to.name;
          setDistHint(
            `Impossible de localiser « ${missing} ». Ajoutez une adresse exacte au lieu (Budget → lieu).`
          );
          if (!opts?.silent) {
            notify(
              'Distance',
              `Adresse manquante pour « ${missing} ». Modifiez le lieu avec une adresse complète.`
            );
          }
          return;
        }

        // Mémorise les coords si le lieu n’en avait pas
        if (from.latitude == null || from.longitude == null) {
          await updatePlace(from.id, { latitude: a.latitude, longitude: a.longitude });
        }
        if (to.latitude == null || to.longitude == null) {
          await updatePlace(to.id, { latitude: b.latitude, longitude: b.longitude });
        }

        const road = await fetchDrivingDistanceKm(a, b);
        setDistanceKm(String(road.distanceKm));
        setDurationMin(road.durationMinutes);
        setDistHint(
          road.source === 'osrm'
            ? `Distance routière réelle (aller) · ~${road.durationMinutes ?? '?'} min`
            : `Estimation route (~+30 % vs vol d’oiseau) — vérifiez si besoin`
        );
        if (!opts?.silent) {
          notify(
            'Distance aller',
            `${road.distanceKm} km` +
              (road.durationMinutes != null ? ` · ~${road.durationMinutes} min` : '')
          );
        }
      } catch (e) {
        setDistHint(e instanceof Error ? e.message : 'Calcul distance impossible');
      } finally {
        setDistLoading(false);
      }
    },
    [places]
  );

  // Auto-calcul quand départ/arrivée changent (création ou édition)
  useEffect(() => {
    if (!ready || !fromId || !toId || fromId === toId) return;
    // En édition, ne recalcule pas auto si une distance est déjà saisie (sauf si vide)
    if (isEdit && distanceKm.trim()) return;
    void calcDistance(fromId, toId, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seulement quand from/to prêts
  }, [ready, fromId, toId]);

  const applySuggestion = async (s: SuggestedItinerary) => {
    setFromId(s.fromId);
    setToId(s.toId);
    setName(s.label);
    setDistanceKm('');
    await calcDistance(s.fromId, s.toId);
  };

  const onPickFrom = (id: number) => {
    setFromId(id);
    const from = places.find((p) => p.id === id);
    const to = places.find((p) => p.id === toId);
    if (from && to) setName(`${from.name} → ${to.name}`);
  };

  const onPickTo = (id: number) => {
    setToId(id);
    const from = places.find((p) => p.id === fromId);
    const to = places.find((p) => p.id === id);
    if (from && to) setName(`${from.name} → ${to.name}`);
  };

  const save = async () => {
    if (!fromId || !toId) {
      notify('Erreur', 'Choisissez départ et arrivée (créez des lieux avant).');
      return;
    }
    if (fromId === toId) {
      notify('Erreur', 'Départ et arrivée doivent être différents.');
      return;
    }
    let km = parseFloat(distanceKm.replace(',', '.'));
    if (!km || km <= 0) {
      await calcDistance(fromId, toId);
      km = parseFloat(distanceKm.replace(',', '.'));
    }
    // Relire après calc async — state peut être stale ; recalcul direct
    if (!km || km <= 0) {
      const from = places.find((p) => p.id === fromId);
      const to = places.find((p) => p.id === toId);
      if (from && to) {
        const [a, b] = await Promise.all([resolvePlaceCoords(from), resolvePlaceCoords(to)]);
        if (a && b) {
          const road = await fetchDrivingDistanceKm(a, b);
          km = road.distanceKm;
          setDistanceKm(String(km));
        }
      }
    }
    const days = parseFloat(workDays.replace(',', '.'));
    if (!km || km <= 0 || !days || days <= 0 || days > 7) {
      notify('Erreur', 'Distance aller (km) et jours travaillés / semaine (1–7) requis.');
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
        notify('Trajet régulier', `Modifié · aller ${km} km.`);
      } else {
        await createRecurringRoute({
          ...payload,
          vehicleId: activeVehicle?.id ?? null,
          isActive: true,
        });
        notify('Trajet régulier', `Ajouté · aller ${km} km.`);
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
        Choisissez un itinéraire proposé : la distance aller est calculée sur la route réelle
        (OpenStreetMap). Les lieux doivent avoir une adresse ou des coordonnées.
      </Text>

      {suggestions.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>
            Itinéraires suggérés
          </Text>
          {suggestions.slice(0, 8).map((s) => {
            const active = fromId === s.fromId && toId === s.toId;
            return (
              <Pressable
                key={s.key}
                onPress={() => void applySuggestion(s)}
                style={[
                  styles.suggest,
                  {
                    backgroundColor: active ? colors.accent : colors.card,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? '#fff' : colors.text,
                    fontWeight: '700',
                    fontSize: 14,
                  }}
                >
                  {s.label}
                </Text>
                <Text
                  style={{
                    color: active ? 'rgba(255,255,255,0.85)' : colors.textSecondary,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {s.subtitle} · tap = distance réelle
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Input label="Nom" value={name} onChangeText={setName} placeholder="Domicile → Travail" />
      <PlacePicker label="Départ" value={fromId} onChange={onPickFrom} />
      <PlacePicker label="Arrivée" value={toId} onChange={onPickTo} />

      <View style={styles.distRow}>
        <View style={{ flex: 1 }}>
          <Input
            label="Distance aller (km)"
            value={distanceKm}
            onChangeText={setDistanceKm}
            keyboardType="numeric"
            placeholder="Calcul auto…"
          />
        </View>
      </View>
      <Button
        title={distLoading ? 'Calcul…' : 'Recalculer distance réelle'}
        variant="secondary"
        loading={distLoading}
        onPress={() => void calcDistance(fromId, toId)}
        disabled={!fromId || !toId || distLoading}
        style={{ marginBottom: 8 }}
      />
      {(distHint || durationMin != null || distLoading) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          {distLoading && <ActivityIndicator color={colors.accent} />}
          <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 }}>
            {distHint ||
              (durationMin != null ? `Durée estimée ~${durationMin} min` : '')}
          </Text>
        </View>
      )}

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
  suggest: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  distRow: { marginBottom: 0 },
});
