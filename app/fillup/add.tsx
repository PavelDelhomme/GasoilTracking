import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Switch,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DatePickerField } from '@/components/DatePickerField';
import { createFillUp, updateVehicle } from '@/lib/database';
import { adaptVehicleConsumption, formatEuro, refreshBudgets } from '@/lib/calculations';
import { fetchCheapestStations, fuelLabel, type FuelStationPrice } from '@/lib/fuelPrices';
import { getCurrentLocation } from '@/lib/locationService';
import { notify } from '@/lib/notify';
import { toLocalYmd } from '@/lib/dates';

function parseNum(v: string): number {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function AddFillUpScreen() {
  const { activeVehicle, budgetStatuses, refresh } = useApp();
  const { colors } = useTheme();
  const [liters, setLiters] = useState('');
  const [totalPaid, setTotalPaid] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState(
    activeVehicle?.defaultFuelPrice.toString() ?? '1.75'
  );
  /** Qui a été modifié en dernier pour recalculer le 3e champ */
  const [lastEdited, setLastEdited] = useState<'liters' | 'total' | 'ppl'>('liters');
  const [odometer, setOdometer] = useState(
    activeVehicle?.hasOdometer ? String(activeVehicle.currentOdometer || '') : ''
  );
  const [distanceKm, setDistanceKm] = useState('');
  const [dateLocal, setDateLocal] = useState(() => toLocalYmd(new Date()));
  const [isFull, setIsFull] = useState(true);
  const [note, setNote] = useState('');
  const [station, setStation] = useState<FuelStationPrice | null>(null);
  const [nearby, setNearby] = useState<FuelStationPrice[]>([]);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);

  const hasOdo = activeVehicle?.hasOdometer !== false;
  const fuelKey =
    activeVehicle?.fuelType === 'diesel'
      ? 'gazole'
      : activeVehicle?.fuelType === 'gpl'
        ? 'gplc'
        : 'e10';

  const derived = useMemo(() => {
    const L = parseNum(liters);
    const T = parseNum(totalPaid);
    const P = parseNum(pricePerLiter);
    if (lastEdited === 'liters' || lastEdited === 'total') {
      if (L > 0 && T > 0) return { liters: L, total: T, ppl: T / L };
      if (L > 0 && P > 0) return { liters: L, total: L * P, ppl: P };
      if (T > 0 && P > 0) return { liters: T / P, total: T, ppl: P };
    }
    if (lastEdited === 'ppl') {
      if (L > 0 && P > 0) return { liters: L, total: L * P, ppl: P };
      if (T > 0 && P > 0) return { liters: T / P, total: T, ppl: P };
    }
    return { liters: L, total: T || L * P, ppl: P || (L > 0 && T > 0 ? T / L : 0) };
  }, [liters, totalPaid, pricePerLiter, lastEdited]);

  const onLiters = (v: string) => {
    setLiters(v);
    setLastEdited('liters');
    const L = parseNum(v);
    const T = parseNum(totalPaid);
    if (L > 0 && T > 0) setPricePerLiter((T / L).toFixed(3));
    else if (L > 0 && parseNum(pricePerLiter) > 0) {
      setTotalPaid((L * parseNum(pricePerLiter)).toFixed(2));
    }
  };

  const onTotal = (v: string) => {
    setTotalPaid(v);
    setLastEdited('total');
    const T = parseNum(v);
    const L = parseNum(liters);
    if (L > 0 && T > 0) setPricePerLiter((T / L).toFixed(3));
    else if (T > 0 && parseNum(pricePerLiter) > 0) {
      setLiters((T / parseNum(pricePerLiter)).toFixed(2));
    }
  };

  const onPpl = (v: string) => {
    setPricePerLiter(v);
    setLastEdited('ppl');
    const P = parseNum(v);
    const L = parseNum(liters);
    if (L > 0 && P > 0) setTotalPaid((L * P).toFixed(2));
  };

  const findStations = async () => {
    setLocating(true);
    setStation(null);
    setNearby([]);
    try {
      const loc = await getCurrentLocation();
      if (!loc) {
        notify('GPS', 'Activez la localisation pour trouver la station.');
        return;
      }
      const list = await fetchCheapestStations({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        radiusKm: 3,
        fuel: activeVehicle?.fuelType || 'diesel',
        limit: 10,
      });
      list.sort((a, b) => (a.distanceKm || 99) - (b.distanceKm || 99));
      setNearby(list);
      if (!list.length) notify('Stations', 'Aucune station dans un rayon de 3 km.');
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'API stations');
    } finally {
      setLocating(false);
    }
  };

  const pickStation = (s: FuelStationPrice) => {
    // Remplace entièrement la sélection précédente (pas d’empilement)
    setStation(s);
    setNearby([]);
    const apiPrice = s.prices[fuelKey];
    if (apiPrice != null) {
      setPricePerLiter(apiPrice.toFixed(3));
      setLastEdited('ppl');
      const L = parseNum(liters);
      if (L > 0) setTotalPaid((L * apiPrice).toFixed(2));
    }
    setNote(`${s.name} — ${s.address} ${s.city}`.trim());
  };

  const clearStation = () => {
    setStation(null);
  };

  const envelopePreview = useMemo(() => {
    const main = budgetStatuses[0];
    if (!main) return null;
    const nextSpent = main.spent + (derived.total || 0);
    return {
      name: main.budget.name,
      amount: main.budget.amount,
      spent: main.spent,
      nextSpent,
      remaining: Math.max(0, main.budget.amount - nextSpent),
      percent: main.budget.amount > 0 ? (nextSpent / main.budget.amount) * 100 : 0,
    };
  }, [budgetStatuses, derived.total]);

  const handleSave = async () => {
    if (!activeVehicle) {
      notify('Erreur', 'Aucun véhicule actif.');
      return;
    }
    if (derived.liters <= 0) {
      notify('Erreur', 'Indiquez les litres (ou montant + prix/L).');
      return;
    }
    if (derived.ppl <= 0 || derived.total <= 0) {
      notify('Erreur', 'Indiquez le montant payé (ou litres + prix/L).');
      return;
    }
    if (hasOdo && !odometer) {
      notify('Erreur', 'Kilométrage compteur requis.');
      return;
    }
    if (!hasOdo && !distanceKm) {
      notify('Distance', 'Sans compteur, indiquez les km depuis le dernier plein.');
      return;
    }

    setLoading(true);
    try {
      const dateIso = new Date(`${dateLocal}T12:00:00`).toISOString();
      await createFillUp({
        vehicleId: activeVehicle.id,
        date: dateIso,
        liters: Math.round(derived.liters * 100) / 100,
        pricePerLiter: Math.round(derived.ppl * 1000) / 1000,
        totalCost: Math.round(derived.total * 100) / 100,
        odometer: hasOdo ? parseNum(odometer) : null,
        distanceSinceLastKm: distanceKm ? parseNum(distanceKm) : null,
        isFull,
        note: note.trim() || undefined,
        tripId: null,
      });

      // Mémorise le prix station comme défaut véhicule
      if (derived.ppl > 0) {
        await updateVehicle(activeVehicle.id, { defaultFuelPrice: derived.ppl });
      }

      await adaptVehicleConsumption(activeVehicle.id);
      await refreshBudgets(activeVehicle.id);
      await refresh();
      notify(
        'Plein enregistré',
        `${derived.liters.toFixed(2)} L · ${formatEuro(derived.total)}` +
          (station ? ` · ${station.name}` : '')
      );
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Impossible d’enregistrer le plein.');
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
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.vehicle, { color: colors.textSecondary }]}>
        Véhicule : {activeVehicle.name}
        {!hasOdo ? ' · suivi sans compteur' : ''}
      </Text>

      <DatePickerField
        label="Date du plein"
        value={dateLocal}
        onChange={setDateLocal}
        maximumDate={new Date()}
      />

      <Text style={[styles.section, { color: colors.text }]}>Station</Text>
      <Button
        title={
          locating
            ? 'Recherche…'
            : station
              ? 'Changer de station (GPS)'
              : 'Trouver la station (GPS)'
        }
        variant="secondary"
        onPress={findStations}
        loading={locating}
      />
      {station && (
        <Card style={{ marginTop: 10, marginBottom: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{station.name}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {station.address} {station.city}
            {station.prices[fuelKey] != null
              ? ` · ${fuelLabel(fuelKey)} ${station.prices[fuelKey]!.toFixed(3)} €/L`
              : ''}
          </Text>
          <Pressable onPress={clearStation} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 13 }}>
              Retirer la station
            </Text>
          </Pressable>
        </Card>
      )}
      {!station &&
        nearby.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => pickStation(s)}
            style={[
              styles.stationRow,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{s.name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {s.distanceKm} km · {s.address} {s.city}
              </Text>
            </View>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>
              {s.prices[fuelKey] != null ? `${s.prices[fuelKey]!.toFixed(3)}€` : '—'}
            </Text>
          </Pressable>
        ))}
      {!station && nearby.length > 0 && (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6, marginBottom: 4 }}>
          Tapez une station pour la sélectionner (remplace le choix précédent).
        </Text>
      )}

      <Text style={[styles.section, { color: colors.text }]}>Quantité & montant</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
        Entrez litres + montant payé → le prix/L se calcule tout seul (ou l’inverse).
      </Text>
      <Input
        label="Litres"
        placeholder="45.00"
        value={liters}
        onChangeText={onLiters}
        keyboardType="decimal-pad"
      />
      <Input
        label="Montant payé (€)"
        placeholder="78.50"
        value={totalPaid}
        onChangeText={onTotal}
        keyboardType="decimal-pad"
      />
      <Input
        label="Prix au litre (€) — auto"
        value={pricePerLiter}
        onChangeText={onPpl}
        keyboardType="decimal-pad"
      />

      {derived.total > 0 && derived.liters > 0 && (
        <Text style={[styles.total, { color: colors.accent }]}>
          {derived.liters.toFixed(2)} L × {derived.ppl.toFixed(3)} €/L ={' '}
          {formatEuro(derived.total)}
        </Text>
      )}

      {hasOdo ? (
        <Input
          label="Kilométrage compteur"
          value={odometer}
          onChangeText={setOdometer}
          keyboardType="numeric"
        />
      ) : (
        <Input
          label="Km depuis le dernier plein"
          value={distanceKm}
          onChangeText={setDistanceKm}
          keyboardType="decimal-pad"
          placeholder="ex: 420"
        />
      )}

      {hasOdo && (
        <Input
          label="Km depuis dernier plein (optionnel)"
          value={distanceKm}
          onChangeText={setDistanceKm}
          keyboardType="decimal-pad"
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
        label="Note / station"
        placeholder="Rempli auto si station détectée"
        value={note}
        onChangeText={setNote}
      />

      {envelopePreview && (
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>
            Enveloppe : {envelopePreview.name}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Déjà dépensé {formatEuro(envelopePreview.spent)} / {formatEuro(envelopePreview.amount)}
          </Text>
          <Text style={{ color: colors.accent, fontWeight: '600', marginTop: 4 }}>
            Après ce plein : {formatEuro(envelopePreview.nextSpent)} (
            {envelopePreview.percent.toFixed(0)}%) — reste {formatEuro(envelopePreview.remaining)}
          </Text>
        </Card>
      )}

      <Button title="Enregistrer le plein" onPress={handleSave} loading={loading} />
      {locating && <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  vehicle: { fontSize: 14, marginBottom: 16 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    gap: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchLabel: { fontSize: 14, fontWeight: '600' },
  total: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  error: { fontSize: 16, textAlign: 'center', padding: 32 },
});
