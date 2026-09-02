import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { createVehicle } from '@/lib/database';
import { notify } from '@/lib/notify';
import { FUEL_TYPE_LABELS } from '@/constants/Colors';
import { PRESET_VEHICLES, searchVehicles, type VehiclePreset } from '@/constants/vehicles';
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
  const [hasOdometer, setHasOdometer] = useState(true);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const results = useMemo(() => searchVehicles(search), [search]);

  const applyPreset = (preset: VehiclePreset) => {
    setBrand(preset.brand);
    setModel(preset.model);
    setYear(preset.year.toString());
    setFuelType(preset.fuel);
    setConsumption(preset.consumption.toString());
    setTankCapacity(preset.tank.toString());
    setHasOdometer(!preset.odometerUnreliable);
    if (!name) setName(`${preset.brand} ${preset.model}`);
  };

  const handleSave = async () => {
    if (!name.trim() || !brand.trim() || !model.trim()) {
      notify('Erreur', 'Nom, marque et modèle sont requis.');
      return;
    }
    setLoading(true);
    try {
      const id = await createVehicle({
        name: name.trim(),
        brand: brand.trim(),
        model: model.trim(),
        year: parseInt(year) || new Date().getFullYear(),
        fuelType,
        consumptionPer100: parseFloat(consumption) || 6,
        tankCapacity: parseFloat(tankCapacity) || 50,
        defaultFuelPrice: parseFloat(fuelPrice) || 1.75,
        currentOdometer: hasOdometer ? parseFloat(odometer) || 0 : 0,
        hasOdometer,
        trackedKm: 0,
        isActive: true,
      });
      if (!id) throw new Error('Création sans id');
      await refresh();
      notify('Véhicule ajouté', `${name.trim()} est maintenant actif.`);
      router.back();
    } catch (e) {
      console.error('createVehicle', e);
      notify(
        'Erreur',
        e instanceof Error
          ? `Impossible de créer le véhicule : ${e.message}`
          : 'Impossible de créer le véhicule.'
      );
    } finally {
      setLoading(false);
    }
  };

  const fuelTypes: FuelType[] = ['diesel', 'essence', 'gpl', 'electrique'];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Favoris</Text>
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
              {preset.year} • {preset.consumption} L/100 • {preset.tank} L
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Rechercher un modèle</Text>
      <Input
        placeholder="Ex: 806, Clio, Golf, Berlingo..."
        value={search}
        onChangeText={setSearch}
      />
      <View style={styles.searchList}>
        {results.slice(0, 12).map((preset, i) => (
          <TouchableOpacity
            key={`${preset.brand}-${preset.model}-${preset.year}-${i}`}
            style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => applyPreset(preset)}
          >
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {preset.brand} {preset.model} ({preset.year})
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {preset.consumption} L/100 · réservoir {preset.tank} L
              {preset.odometerUnreliable ? ' · compteur souvent HS' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Input label="Nom du véhicule" placeholder="Mon 806" value={name} onChangeText={setName} />
      <Input label="Marque" value={brand} onChangeText={setBrand} />
      <Input label="Modèle" value={model} onChangeText={setModel} />
      <Input label="Année" value={year} onChangeText={setYear} keyboardType="numeric" />

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
            <Text style={{ color: fuelType === type ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>
              {FUEL_TYPE_LABELS[type]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Input
        label="Consommation (L/100km)"
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

      <View style={styles.switchRow}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>Compteur kilométrique OK</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Désactive si le compteur est HS (ex. vieux 806) — les km viendront du GPS / saisie manuelle.
          </Text>
        </View>
        <Switch
          value={hasOdometer}
          onValueChange={setHasOdometer}
          trackColor={{ false: colors.border, true: colors.accent }}
        />
      </View>

      {hasOdometer && (
        <Input
          label="Kilométrage actuel"
          value={odometer}
          onChangeText={setOdometer}
          keyboardType="numeric"
        />
      )}

      <Button title="Enregistrer" onPress={handleSave} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  presets: { marginBottom: 20 },
  presetCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 10,
    minWidth: 150,
  },
  presetName: { fontSize: 14, fontWeight: '600' },
  presetDetail: { fontSize: 12, marginTop: 4 },
  searchList: { marginBottom: 16, gap: 8 },
  searchRow: { padding: 12, borderRadius: 12, borderWidth: 1 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  fuelTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  fuelChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchLabel: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
});
