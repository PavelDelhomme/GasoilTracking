import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useLocale } from '@/context/LocaleContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { getVehicleById, updateVehicle } from '@/lib/database';
import { notify } from '@/lib/notify';
import { FUEL_TYPE_LABELS } from '@/constants/Colors';
import { searchVehicles, type VehiclePreset } from '@/constants/vehicles';
import type { FuelType } from '@/types';

/**
 * Modifier un véhicule existant.
 * Choisir un modèle catalogue remplit les specs → véhicule personnalisé utilisateur.
 */
export default function EditVehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicleId = Number(id);
  const { refresh } = useApp();
  const { colors } = useTheme();
  const { moneySymbol, country } = useLocale();

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [fuelType, setFuelType] = useState<FuelType>('diesel');
  const [consumption, setConsumption] = useState('6.0');
  const [tankCapacity, setTankCapacity] = useState('50');
  const [fuelPrice, setFuelPrice] = useState(String(country.defaultFuelPrice));
  const [odometer, setOdometer] = useState('0');
  const [hasOdometer, setHasOdometer] = useState(true);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(vehicleId) || vehicleId < 1) {
      notify('Erreur', 'Véhicule introuvable.');
      router.back();
      return;
    }
    getVehicleById(vehicleId).then((v) => {
      if (!v) {
        notify('Erreur', 'Véhicule introuvable.');
        router.back();
        return;
      }
      setName(v.name);
      setBrand(v.brand);
      setModel(v.model);
      setYear(String(v.year));
      setFuelType(v.fuelType);
      setConsumption(String(v.consumptionPer100));
      setTankCapacity(String(v.tankCapacity));
      setFuelPrice(String(v.defaultFuelPrice));
      setOdometer(String(v.currentOdometer));
      setHasOdometer(v.hasOdometer);
      setReady(true);
    });
  }, [vehicleId]);

  const results = useMemo(() => searchVehicles(search), [search]);

  const applyPreset = (preset: VehiclePreset) => {
    setBrand(preset.brand);
    setModel(preset.model);
    setYear(String(preset.year));
    setFuelType(preset.fuel);
    setConsumption(String(preset.consumption));
    setTankCapacity(String(preset.tank));
    setHasOdometer(!preset.odometerUnreliable);
    if (!name.trim() || name === `${brand} ${model}`) {
      setName(`${preset.brand} ${preset.model}`);
    }
    setStatus(
      `Base catalogue : ${preset.brand} ${preset.model} — ajustez puis enregistrez (personnalisé).`
    );
  };

  const handleSave = async () => {
    if (!name.trim() || !brand.trim() || !model.trim()) {
      notify('Erreur', 'Nom, marque et modèle sont requis.');
      return;
    }
    setLoading(true);
    try {
      await updateVehicle(vehicleId, {
        name: name.trim(),
        brand: brand.trim(),
        model: model.trim(),
        year: parseInt(year, 10) || new Date().getFullYear(),
        fuelType,
        consumptionPer100: parseFloat(consumption.replace(',', '.')) || 6,
        tankCapacity: parseFloat(tankCapacity.replace(',', '.')) || 50,
        defaultFuelPrice:
          parseFloat(fuelPrice.replace(',', '.')) || country.defaultFuelPrice,
        hasOdometer,
        currentOdometer: hasOdometer
          ? parseFloat(odometer.replace(',', '.')) || 0
          : 0,
      });
      await refresh();
      notify('Véhicule mis à jour', `${name.trim()} — fiche personnalisée enregistrée.`);
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setLoading(false);
    }
  };

  const fuelTypes: FuelType[] = ['diesel', 'essence', 'gpl', 'electrique'];

  if (!ready) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 16 }]}>
        <Text style={{ color: colors.textSecondary }}>Chargement…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="always"
      nestedScrollEnabled
    >
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Modifiez votre véhicule. Vous pouvez repartir d’un modèle catalogue : les valeurs
        deviennent votre fiche personnalisée (conso, réservoir, etc.).
      </Text>
      {!!status && <Text style={[styles.status, { color: colors.accent }]}>{status}</Text>}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Base catalogue (optionnel)</Text>
      <Input
        placeholder="Rechercher Clio, 806, Golf…"
        value={search}
        onChangeText={setSearch}
      />
      <View style={styles.searchList}>
        {results.slice(0, 8).map((preset, i) => (
          <Pressable
            key={`${preset.brand}-${preset.model}-${preset.year}-${i}`}
            onPress={() => applyPreset(preset)}
            style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                {preset.brand} {preset.model} ({preset.year})
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {preset.consumption} L/100 · {preset.tank} L
              </Text>
            </View>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>Utiliser</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Fiche personnalisée</Text>
      <Input label="Nom" value={name} onChangeText={setName} />
      <Input label="Marque" value={brand} onChangeText={setBrand} />
      <Input label="Modèle" value={model} onChangeText={setModel} />
      <Input label="Année" value={year} onChangeText={setYear} keyboardType="numeric" />

      <Text style={[styles.label, { color: colors.text }]}>Carburant</Text>
      <View style={styles.fuelTypes}>
        {fuelTypes.map((type) => (
          <Pressable
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
                fontWeight: '600',
                fontSize: 13,
              }}
            >
              {FUEL_TYPE_LABELS[type]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Input
        label="Consommation (L/100km)"
        value={consumption}
        onChangeText={setConsumption}
        keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
      />
      <Input
        label="Capacité réservoir (L)"
        value={tankCapacity}
        onChangeText={setTankCapacity}
        keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
      />
      <Input
        label={`Prix carburant (${moneySymbol}/L)`}
        value={fuelPrice}
        onChangeText={setFuelPrice}
        keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
      />

      <View style={styles.switchRow}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>Utiliser le compteur</Text>
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

      <Button title="Enregistrer les modifications" onPress={handleSave} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  status: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10, marginTop: 8 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  searchList: { marginBottom: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  fuelTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  fuelChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  switchLabel: { fontSize: 15, fontWeight: '600' },
});
