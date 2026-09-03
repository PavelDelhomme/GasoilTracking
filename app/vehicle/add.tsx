import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useLocale } from '@/context/LocaleContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { createVehicle, getVehicles } from '@/lib/database';
import { confirm, notify } from '@/lib/notify';
import { FUEL_TYPE_LABELS } from '@/constants/Colors';
import { PRESET_VEHICLES, searchVehicles, type VehiclePreset } from '@/constants/vehicles';
import type { FuelType } from '@/types';

export default function AddVehicleScreen() {
  const { refresh, vehicles, selectVehicle } = useApp();
  const { colors } = useTheme();
  const { country, moneySymbol } = useLocale();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [fuelType, setFuelType] = useState<FuelType>('diesel');
  const [consumption, setConsumption] = useState('6.0');
  const [tankCapacity, setTankCapacity] = useState('50');
  const [fuelPrice, setFuelPrice] = useState(String(country.defaultFuelPrice));
  const [odometer, setOdometer] = useState('0');
  const [hasOdometer, setHasOdometer] = useState(true);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const results = useMemo(() => searchVehicles(search), [search]);

  const saveVehicle = async (payload: {
    name: string;
    brand: string;
    model: string;
    year: number;
    fuelType: FuelType;
    consumptionPer100: number;
    tankCapacity: number;
    defaultFuelPrice: number;
    currentOdometer: number;
    hasOdometer: boolean;
    trackedKm?: number;
    estimatedFuelLiters?: number | null;
    consumptionAutoAdapt?: boolean;
    isActive?: boolean;
  }) => {
    // Anti-doublons : si le même modèle existe déjà, on propose de le sélectionner
    // au lieu d’en créer un autre (évite d’avoir 2× le même 806 dans la liste).
    const list = vehicles.length ? vehicles : await getVehicles();
    const duplicate = list.find(
      (v) =>
        v.brand === payload.brand &&
        v.model === payload.model &&
        v.year === payload.year &&
        v.fuelType === payload.fuelType
    );

    if (duplicate) {
      confirm(
        'Véhicule déjà présent',
        `Le véhicule "${duplicate.name}" existe déjà. Voulez-vous le sélectionner au lieu d’en créer un nouveau ?`,
        () => {
          void (async () => {
            await selectVehicle(duplicate.id);
            await refresh();
            notify('Véhicule sélectionné', duplicate.name);
            if (router.canGoBack()) router.back();
            router.replace('/(tabs)/vehicles' as never);
          })();
        },
        'Sélectionner'
      );
      return;
    }

    setLoading(true);
    setStatus('Enregistrement…');
    try {
      const id = await createVehicle({
        ...payload,
        trackedKm: payload.trackedKm ?? 0,
        estimatedFuelLiters: payload.estimatedFuelLiters ?? null,
        consumptionAutoAdapt: payload.consumptionAutoAdapt !== false,
        isActive: payload.isActive ?? true,
      });
      if (!id && id !== 0) {
        // lastInsertRowId peut être 1+ ; 0 serait bizarre mais on vérifie falsy non-number
      }
      if (id == null || Number(id) < 1) {
        throw new Error(`ID invalide (${String(id)}) — base locale inaccessible`);
      }
      await refresh();
      setStatus(`OK — ${payload.name} (#${id})`);
      notify('Véhicule ajouté', `${payload.name} est actif.`);
      // Remplace l’écran modal par la liste véhicules
      if (router.canGoBack()) {
        router.back();
      }
      router.replace('/(tabs)/vehicles' as never);
    } catch (e) {
      console.error('createVehicle', e);
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Erreur : ${msg}`);
      notify('Erreur création véhicule', msg);
    } finally {
      setLoading(false);
    }
  };

  /** Un tap = ajout immédiat (favoris / recherche) */
  const addPresetNow = async (preset: VehiclePreset) => {
    if (loading) return;
    const vehicleName = `${preset.brand} ${preset.model}`;
    await saveVehicle({
      name: vehicleName,
      brand: preset.brand,
      model: preset.model,
      year: preset.year,
      fuelType: preset.fuel,
      consumptionPer100: preset.consumption,
      tankCapacity: preset.tank,
      defaultFuelPrice: parseFloat(fuelPrice) || country.defaultFuelPrice,
      currentOdometer: 0,
      hasOdometer: !preset.odometerUnreliable,
      trackedKm: 0,
      estimatedFuelLiters: null,
      consumptionAutoAdapt: true,
      isActive: true,
    });
  };

  const applyPresetToForm = (preset: VehiclePreset) => {
    setBrand(preset.brand);
    setModel(preset.model);
    setYear(String(preset.year));
    setFuelType(preset.fuel);
    setConsumption(String(preset.consumption));
    setTankCapacity(String(preset.tank));
    setHasOdometer(!preset.odometerUnreliable);
    setName(`${preset.brand} ${preset.model}`);
    setStatus(`Formulaire rempli : ${preset.brand} ${preset.model} — cliquez Enregistrer`);
  };

  const handleSave = async () => {
    if (!name.trim() || !brand.trim() || !model.trim()) {
      notify('Erreur', 'Nom, marque et modèle sont requis.');
      setStatus('Remplissez nom, marque et modèle.');
      return;
    }
    await saveVehicle({
      name: name.trim(),
      brand: brand.trim(),
      model: model.trim(),
      year: parseInt(year, 10) || new Date().getFullYear(),
      fuelType,
      consumptionPer100: parseFloat(consumption.replace(',', '.')) || 6,
      tankCapacity: parseFloat(tankCapacity.replace(',', '.')) || 50,
      defaultFuelPrice: parseFloat(fuelPrice.replace(',', '.')) || country.defaultFuelPrice,
      currentOdometer: hasOdometer ? parseFloat(odometer.replace(',', '.')) || 0 : 0,
      hasOdometer,
      trackedKm: 0,
      estimatedFuelLiters: null,
      consumptionAutoAdapt: true,
      isActive: true,
    });
  };

  const fuelTypes: FuelType[] = ['diesel', 'essence', 'gpl', 'electrique'];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="always"
      nestedScrollEnabled
    >
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Favoris = modèles rapides. Un tap ajoute le véhicule tout de suite.
      </Text>

      {!!status && (
        <Text style={[styles.status, { color: colors.accent }]}>{status}</Text>
      )}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Favoris (ajout en 1 tap)</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="always"
        style={styles.presets}
      >
        {PRESET_VEHICLES.map((preset, i) => (
          <Pressable
            key={i}
            disabled={loading}
            onPress={() => addPresetNow(preset)}
            onLongPress={() => applyPresetToForm(preset)}
            style={({ pressed }) => [
              styles.presetCard,
              {
                backgroundColor: colors.card,
                borderColor: pressed ? colors.accent : colors.border,
                opacity: loading ? 0.5 : 1,
              },
            ]}
          >
            <Text style={[styles.presetName, { color: colors.text }]}>
              {preset.brand} {preset.model}
            </Text>
            <Text style={[styles.presetDetail, { color: colors.textSecondary }]}>
              {preset.year} • {preset.consumption} L/100 • {preset.tank} L
            </Text>
            <Text style={{ color: colors.accent, fontSize: 12, marginTop: 8, fontWeight: '700' }}>
              + Ajouter
            </Text>
          </Pressable>
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
          <Pressable
            key={`${preset.brand}-${preset.model}-${preset.year}-${i}`}
            disabled={loading}
            onPress={() => addPresetNow(preset)}
            onLongPress={() => applyPresetToForm(preset)}
            style={({ pressed }) => [
              styles.searchRow,
              {
                borderColor: pressed ? colors.accent : colors.border,
                backgroundColor: colors.card,
                opacity: loading ? 0.5 : 1,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                {preset.brand} {preset.model} ({preset.year})
              </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {preset.consumption} L/100 · réservoir {preset.tank} L
            </Text>
            </View>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>+ Ajouter</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Saisie manuelle</Text>
      <Input label="Nom du véhicule" placeholder="Mon 806" value={name} onChangeText={setName} />
      <Input label="Marque" value={brand} onChangeText={setBrand} />
      <Input label="Modèle" value={model} onChangeText={setModel} />
      <Input label="Année" value={year} onChangeText={setYear} keyboardType="numeric" />

      <Text style={[styles.label, { color: colors.text }]}>Type de carburant</Text>
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
            <Text style={{ color: fuelType === type ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>
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
        label={`Prix carburant par défaut (${moneySymbol}/L)`}
        value={fuelPrice}
        onChangeText={setFuelPrice}
        keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
      />

      <View style={styles.switchRow}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>Utiliser le compteur</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Sinon les kilomètres viennent du GPS ou d’une saisie manuelle.
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

      <Button title="Enregistrer le véhicule" onPress={handleSave} loading={loading} />
      <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 12 }]}>
        Astuce : appui long sur un favori pour seulement remplir le formulaire.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  status: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  presets: { marginBottom: 20 },
  presetCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    marginRight: 10,
    minWidth: 150,
  },
  presetName: { fontSize: 14, fontWeight: '600' },
  presetDetail: { fontSize: 12, marginTop: 4 },
  searchList: { marginBottom: 16, gap: 8 },
  searchRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
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
