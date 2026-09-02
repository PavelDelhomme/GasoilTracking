import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { createTrip, addTrackedKm } from '@/lib/database';
import { notify } from '@/lib/notify';

export default function AddTripScreen() {
  const { activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [dateLocal, setDateLocal] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [startTime, setStartTime] = useState('08:30');
  const [endTime, setEndTime] = useState('09:15');
  const [distanceKm, setDistanceKm] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!activeVehicle) {
      notify('Erreur', 'Sélectionnez un véhicule actif.');
      return;
    }
    if (!destination.trim()) {
      notify('Erreur', 'Indiquez une destination.');
      return;
    }
    const km = parseFloat(distanceKm);
    if (!km || km <= 0) {
      notify('Erreur', 'Distance (km) requise.');
      return;
    }

    setLoading(true);
    try {
      const start = new Date(`${dateLocal}T${startTime}:00`);
      const end = new Date(`${dateLocal}T${endTime}:00`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error('Date / heure invalide (AAAA-MM-JJ et HH:MM).');
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
        Véhicule : {activeVehicle.name} — saisie manuelle avec date & lieux.
      </Text>
      <Input label="Départ (adresse / lieu)" value={origin} onChangeText={setOrigin} placeholder="Domicile, 12 rue…" />
      <Input
        label="Arrivée"
        value={destination}
        onChangeText={setDestination}
        placeholder="Bureau, Paris…"
      />
      <Input label="Date (AAAA-MM-JJ)" value={dateLocal} onChangeText={setDateLocal} />
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sub: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
});
