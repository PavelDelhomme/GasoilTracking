import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Switch, Text } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { createFillUp } from '@/lib/database';
import { adaptVehicleConsumption, refreshBudgets } from '@/lib/calculations';

export default function AddFillUpScreen() {
  const { activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const [liters, setLiters] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState(
    activeVehicle?.defaultFuelPrice.toString() ?? '1.75'
  );
  const [odometer, setOdometer] = useState(
    activeVehicle?.hasOdometer ? String(activeVehicle.currentOdometer || '') : ''
  );
  const [distanceKm, setDistanceKm] = useState('');
  const [dateLocal, setDateLocal] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [isFull, setIsFull] = useState(true);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const totalCost = (parseFloat(liters) || 0) * (parseFloat(pricePerLiter) || 0);
  const hasOdo = activeVehicle?.hasOdometer !== false;

  const handleSave = async () => {
    if (!activeVehicle) {
      Alert.alert('Erreur', 'Aucun véhicule actif.');
      return;
    }
    if (!liters) {
      Alert.alert('Erreur', 'Indiquez les litres.');
      return;
    }
    if (hasOdo && !odometer) {
      Alert.alert('Erreur', 'Kilométrage compteur requis (ou désactivez le compteur sur le véhicule).');
      return;
    }
    if (!hasOdo && !distanceKm) {
      Alert.alert(
        'Distance',
        'Sans compteur, indiquez les km parcourus depuis le dernier plein (trajets GPS ou estimation).'
      );
      return;
    }

    setLoading(true);
    try {
      const dateIso = new Date(`${dateLocal}T12:00:00`).toISOString();
      await createFillUp({
        vehicleId: activeVehicle.id,
        date: dateIso,
        liters: parseFloat(liters),
        pricePerLiter: parseFloat(pricePerLiter),
        totalCost,
        odometer: hasOdo ? parseFloat(odometer) : null,
        distanceSinceLastKm: distanceKm ? parseFloat(distanceKm) : null,
        isFull,
        note: note.trim() || undefined,
      });

      await adaptVehicleConsumption(activeVehicle.id);
      await refreshBudgets(activeVehicle.id);
      await refresh();
      router.back();
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer le plein.");
    } finally {
      setLoading(false);
    }
  };

  if (!activeVehicle) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.error, { color: colors.danger }]}>
          Sélectionnez un véhicule actif avant d&apos;ajouter un plein.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.vehicle, { color: colors.textSecondary }]}>
        Véhicule : {activeVehicle.name}
        {!hasOdo ? ' · suivi sans compteur' : ''}
      </Text>

      <Input
        label="Date du plein (AAAA-MM-JJ)"
        value={dateLocal}
        onChangeText={setDateLocal}
        placeholder="2024-06-15"
      />
      <Input
        label="Litres"
        placeholder="45.00"
        value={liters}
        onChangeText={setLiters}
        keyboardType="decimal-pad"
      />
      <Input
        label="Prix au litre (€)"
        value={pricePerLiter}
        onChangeText={setPricePerLiter}
        keyboardType="decimal-pad"
      />

      {hasOdo ? (
        <Input
          label="Kilométrage compteur"
          value={odometer}
          onChangeText={setOdometer}
          keyboardType="numeric"
        />
      ) : (
        <Input
          label="Km depuis le dernier plein (GPS / estimation)"
          value={distanceKm}
          onChangeText={setDistanceKm}
          keyboardType="decimal-pad"
          placeholder="ex: 420"
        />
      )}

      {hasOdo && (
        <Input
          label="Km depuis dernier plein (optionnel, si date différée)"
          value={distanceKm}
          onChangeText={setDistanceKm}
          keyboardType="decimal-pad"
          placeholder="Laisse vide si le compteur suffit"
        />
      )}

      <View style={styles.switchRow}>
        <Text style={[styles.switchLabel, { color: colors.text }]}>Plein complet</Text>
        <Switch
          value={isFull}
          onValueChange={setIsFull}
          trackColor={{ false: colors.border, true: colors.accent }}
        />
      </View>

      <Input
        label="Note (optionnel)"
        placeholder="Station, autoroute, plein en retard..."
        value={note}
        onChangeText={setNote}
      />

      {totalCost > 0 && (
        <Text style={[styles.total, { color: colors.accent }]}>
          Total : {totalCost.toFixed(2)} €
        </Text>
      )}

      <Button title="Enregistrer le plein" onPress={handleSave} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  vehicle: { fontSize: 14, marginBottom: 16 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchLabel: { fontSize: 14, fontWeight: '600' },
  total: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  error: { fontSize: 16, textAlign: 'center', padding: 32 },
});
