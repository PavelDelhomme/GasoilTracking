import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { createVehicle } from '@/lib/database';
import { PRESET_VEHICLES, FUEL_TYPE_LABELS } from '@/constants/Colors';
import type { FuelType } from '@/types';

export default function AddVehicleScreen() {
  const { refresh } = useApp();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [fuelType, setFuelType] = useState<FuelType>('diesel');
  const [consumption, setConsumption] = useState('6.0');
  const [tankCapacity, setTankCapacity] = useState('50');
  const [fuelPrice, setFuelPrice] = useState('1.75');
  const [odometer, setOdometer] = useState('0');
  const [loading, setLoading] = useState(false);

  const applyPreset = (preset: (typeof PRESET_VEHICLES)[0]) => {
    setBrand(preset.brand);
    setModel(preset.model);
    setYear(preset.year.toString());
    setFuelType(preset.fuel);
    setConsumption(preset.consumption.toString());
    setTankCapacity(preset.tank.toString());
    if (!name) setName(`${preset.brand} ${preset.model}`);
  };

  const handleSave = async () => {
    if (!name.trim() || !brand.trim() || !model.trim()) {
      Alert.alert('Erreur', 'Nom, marque et modèle sont requis.');
      return;
    }

    setLoading(true);
    try {
      await createVehicle({
        name: name.trim(),
        brand: brand.trim(),
        model: model.trim(),
        year: parseInt(year) || new Date().getFullYear(),
        fuelType,
        consumptionPer100: parseFloat(consumption) || 6,
        tankCapacity: parseFloat(tankCapacity) || 50,
        defaultFuelPrice: parseFloat(fuelPrice) || 1.75,
        currentOdometer: parseFloat(odometer) || 0,
        isActive: true,
      });
      await refresh();
      router.back();
    } catch {
      Alert.alert('Erreur', 'Impossible de créer le véhicule.');
    } finally {
      setLoading(false);
    }
  };

  const fuelTypes: FuelType[] = ['diesel', 'essence', 'gpl', 'electrique'];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Modèles prédéfinis
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presets}>
        {PRESET_VEHICLES.map((preset, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.presetCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => applyPreset(preset)}
          >
            <Text style={[styles.presetName, { color: colors.text }]}>
              {preset.brand} {preset.model}
            </Text>
            <Text style={[styles.presetDetail, { color: colors.textSecondary }]}>
              {preset.year} • {preset.consumption} L/100
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Input label="Nom du véhicule" placeholder="Ma Clio" value={name} onChangeText={setName} />
      <Input label="Marque" placeholder="Renault" value={brand} onChangeText={setBrand} />
      <Input label="Modèle" placeholder="Clio IV" value={model} onChangeText={setModel} />
      <Input
        label="Année"
        placeholder="2015"
        value={year}
        onChangeText={setYear}
        keyboardType="numeric"
      />

      <Text style={[styles.label, { color: colors.text }]}>Type de carburant</Text>
      <View style={styles.fuelTypes}>
        {fuelTypes.map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.fuelChip,
              {
                backgroundColor: fuelType === type ? colors.accent : colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setFuelType(type)}
          >
            <Text
              style={{
                color: fuelType === type ? '#fff' : colors.text,
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              {FUEL_TYPE_LABELS[type]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Input
        label="Consommation (L/100km ou kWh/100km)"
        value={consumption}
        onChangeText={setConsumption}
        keyboardType="decimal-pad"
      />
      <Input
        label="Capacité réservoir (L)"
        value={tankCapacity}
        onChangeText={setTankCapacity}
        keyboardType="decimal-pad"
      />
      <Input
        label="Prix carburant par défaut (€/L)"
        value={fuelPrice}
        onChangeText={setFuelPrice}
        keyboardType="decimal-pad"
      />
      <Input
        label="Kilométrage actuel"
        value={odometer}
        onChangeText={setOdometer}
        keyboardType="numeric"
      />

      <Button title="Enregistrer" onPress={handleSave} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  presets: { marginBottom: 24 },
  presetCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 10,
    minWidth: 140,
  },
  presetName: { fontSize: 14, fontWeight: '600' },
  presetDetail: { fontSize: 12, marginTop: 4 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  fuelTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  fuelChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
});
