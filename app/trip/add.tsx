import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { DatePickerField } from '@/components/DatePickerField';
import { PlaceSuggestField } from '@/components/PlaceSuggestField';
import {
  createTrip,
  addTrackedKm,
  getPlaces,
  getRecurringRoutes,
} from '@/lib/database';
import { notify } from '@/lib/notify';
import { toLocalYmd } from '@/lib/dates';
import type { Place, RecurringRoute } from '@/types';

export default function AddTripScreen() {
  const { activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<RecurringRoute[]>([]);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toPlace, setToPlace] = useState<Place | null>(null);
  const [dateLocal, setDateLocal] = useState(() => toLocalYmd(new Date()));
  const [startTime, setStartTime] = useState('08:30');
  const [endTime, setEndTime] = useState('09:15');
  const [distanceKm, setDistanceKm] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [p, r] = await Promise.all([
        getPlaces(),
        getRecurringRoutes(activeVehicle?.id),
      ]);
      if (cancelled) return;
      setPlaces(p);
      setRoutes(r);
      setOrigin((prev) => {
        if (prev) return prev;
        const home = p.find((x) => x.kind === 'home');
        if (!home) return prev;
        setFromPlace(home);
        return home.address ? `${home.name} — ${home.address}` : home.name;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeVehicle?.id]);

  // Préremplit la distance si un trajet régulier correspond
  useEffect(() => {
    if (!fromPlace || !toPlace) return;
    const match = routes.find(
      (r) =>
        (r.fromPlaceId === fromPlace.id && r.toPlaceId === toPlace.id) ||
        (r.fromPlaceId === toPlace.id && r.toPlaceId === fromPlace.id)
    );
    if (match?.distanceKm) {
      setDistanceKm(String(match.distanceKm));
    }
  }, [fromPlace, toPlace, routes]);

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
    setFromPlace(toPlace);
    setToPlace(fromPlace);
  };

  const applyCommute = (dir: 'toWork' | 'toHome') => {
    const home = places.find((p) => p.kind === 'home');
    const work = places.find((p) => p.kind === 'work');
    if (!home || !work) {
      notify('Lieux', 'Ajoutez d’abord un Domicile et un Travail (onglet Budget).');
      return;
    }
    const label = (p: Place) => (p.address ? `${p.name} — ${p.address}` : p.name);
    if (dir === 'toWork') {
      setOrigin(label(home));
      setDestination(label(work));
      setFromPlace(home);
      setToPlace(work);
    } else {
      setOrigin(label(work));
      setDestination(label(home));
      setFromPlace(work);
      setToPlace(home);
    }
  };

  const handleSave = async () => {
    if (!activeVehicle) {
      notify('Erreur', 'Sélectionnez un véhicule actif.');
      return;
    }
    if (!destination.trim()) {
      notify('Erreur', 'Indiquez une destination.');
      return;
    }
    const km = parseFloat(distanceKm.replace(',', '.'));
    if (!km || km <= 0) {
      notify('Erreur', 'Distance (km) requise.');
      return;
    }

    setLoading(true);
    try {
      const start = new Date(`${dateLocal}T${startTime}:00`);
      const end = new Date(`${dateLocal}T${endTime}:00`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error('Date / heure invalide.');
      }
      const fuel = (km * activeVehicle.consumptionPer100) / 100;
      const cost = fuel * activeVehicle.defaultFuelPrice;

      await createTrip({
        vehicleId: activeVehicle.id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        distanceKm: km,
        estimatedFuelUsed: Math.round(fuel * 100) / 100,
        estimatedCost: Math.round(cost * 100) / 100,
        routePoints: '[]',
        originName: origin.trim() || undefined,
        destinationName: destination.trim(),
        isActive: false,
        status: 'confirmed',
        source: 'manual',
        fillUpId: null,
        note: note.trim() || undefined,
      });
      await addTrackedKm(activeVehicle.id, km);
      await refresh();
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Impossible d’enregistrer le trajet.');
    } finally {
      setLoading(false);
    }
  };

  if (!activeVehicle) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.danger, padding: 24, textAlign: 'center' }}>
          Ajoutez / sélectionnez un véhicule avant de saisir un trajet.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Véhicule : {activeVehicle.name} — suggestions depuis vos lieux (domicile, travail…).
      </Text>

      <View style={styles.quickRow}>
        <Pressable
          onPress={() => applyCommute('toWork')}
          style={[styles.quickBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
            Domicile → Travail
          </Text>
        </Pressable>
        <Pressable
          onPress={() => applyCommute('toHome')}
          style={[styles.quickBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
            Travail → Domicile
          </Text>
        </Pressable>
      </View>

      <PlaceSuggestField
        label="Départ (adresse / lieu)"
        value={origin}
        onChangeText={(t) => {
          setOrigin(t);
          setFromPlace(null);
        }}
        onPickPlace={setFromPlace}
        places={places}
        placeholder="Domicile, 12 rue…"
        preferKinds={['home', 'work']}
      />

      <Pressable onPress={swap} style={{ alignSelf: 'center', marginBottom: 8 }}>
        <Text style={{ color: colors.accent, fontWeight: '700' }}>↕ Inverser</Text>
      </Pressable>

      <PlaceSuggestField
        label="Arrivée"
        value={destination}
        onChangeText={(t) => {
          setDestination(t);
          setToPlace(null);
        }}
        onPickPlace={setToPlace}
        places={places}
        placeholder="Bureau, Paris…"
        preferKinds={['work', 'home']}
      />

      <DatePickerField label="Date du trajet" value={dateLocal} onChange={setDateLocal} />
      <Input label="Heure départ (HH:MM)" value={startTime} onChangeText={setStartTime} />
      <Input label="Heure arrivée (HH:MM)" value={endTime} onChangeText={setEndTime} />
      <Input
        label="Distance (km)"
        value={distanceKm}
        onChangeText={setDistanceKm}
        keyboardType="decimal-pad"
        placeholder="42.5"
      />
      <Input label="Note (optionnel)" value={note} onChangeText={setNote} />
      <Button title="Enregistrer le trajet" onPress={handleSave} loading={loading} />
      <Button
        title="Importer Timeline Google"
        variant="outline"
        onPress={() => router.push('/trip/import' as never)}
        style={{ marginTop: 10 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sub: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quickBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
});
