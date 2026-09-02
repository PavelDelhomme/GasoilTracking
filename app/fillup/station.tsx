import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, Switch } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useLocale } from '@/context/LocaleContext';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { createFillUp, createTrip, addTrackedKm } from '@/lib/database';
import { refreshBudgets } from '@/lib/calculations';
import { notify } from '@/lib/notify';
import { openGoogleMapsNavigation } from '@/lib/locationService';
import { fuelLabel } from '@/lib/fuelPrices';

/**
 * Trajet vers une station : navigation Maps + option enregistrer un plein (ou pas).
 */
export default function StationTripScreen() {
  const params = useLocalSearchParams<{
    name?: string;
    address?: string;
    lat?: string;
    lon?: string;
    price?: string;
    fuelKey?: string;
  }>();
  const { activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const { moneySymbol, formatPerLiter } = useLocale();
  const [doFillUp, setDoFillUp] = useState(true);
  const [isFull, setIsFull] = useState(true);
  const [liters, setLiters] = useState('');
  const [price, setPrice] = useState(params.price || activeVehicle?.defaultFuelPrice.toString() || '1.75');
  const [distanceKm, setDistanceKm] = useState('5');
  const [loading, setLoading] = useState(false);

  const lat = parseFloat(params.lat || '');
  const lon = parseFloat(params.lon || '');
  const stationName = params.name || 'Station';

  const openMaps = async () => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      notify('Erreur', 'Coordonnées station manquantes.');
      return;
    }
    const url = openGoogleMapsNavigation(lat, lon, stationName);
    await Linking.openURL(url);
  };

  const save = async () => {
    if (!activeVehicle) {
      notify('Erreur', 'Sélectionnez un véhicule.');
      return;
    }
    setLoading(true);
    try {
      const km = parseFloat(distanceKm.replace(',', '.')) || 0;
      const fuelEst = (km * activeVehicle.consumptionPer100) / 100;
      const tripId = await createTrip({
        vehicleId: activeVehicle.id,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        distanceKm: km,
        estimatedFuelUsed: Math.round(fuelEst * 100) / 100,
        estimatedCost: Math.round(fuelEst * activeVehicle.defaultFuelPrice * 100) / 100,
        routePoints: '[]',
        originName: 'Position',
        destinationName: stationName,
        isActive: false,
        status: 'confirmed',
        source: 'manual',
        fillUpId: null,
        note: `Station ${params.address || ''}`.trim(),
      });
      if (km > 0) await addTrackedKm(activeVehicle.id, km);

      if (doFillUp) {
        const L = parseFloat(liters.replace(',', '.'));
        const ppl = parseFloat(price.replace(',', '.'));
        if (!L || L <= 0 || !ppl || ppl <= 0) {
          notify('Plein', 'Indiquez litres et prix, ou désactivez « Faire un plein ».');
          setLoading(false);
          return;
        }
        await createFillUp({
          vehicleId: activeVehicle.id,
          date: new Date().toISOString(),
          liters: L,
          pricePerLiter: ppl,
          totalCost: L * ppl,
          odometer: activeVehicle.hasOdometer ? activeVehicle.currentOdometer : null,
          distanceSinceLastKm: km || null,
          isFull,
          note: `${stationName} · ${fuelLabel(params.fuelKey || 'gazole')}`,
          tripId,
        });
        await refreshBudgets(activeVehicle.id);
      }

      await refresh();
      notify(
        'Enregistré',
        doFillUp ? 'Trajet station + plein.' : 'Trajet station sans plein.'
      );
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.text }]}>{stationName}</Text>
      <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>
        {params.address || 'Station essence'}
        {params.price ? ` · ${formatPerLiter(parseFloat(params.price))}` : ''}
      </Text>

      {!activeVehicle && (
        <Text style={{ color: colors.danger, marginBottom: 12 }}>
          Sélectionnez un véhicule avant d&apos;enregistrer.
        </Text>
      )}

      <Button title="Ouvrir dans Google Maps" variant="secondary" onPress={openMaps} />

      <Input
        label="Distance estimée aller (km)"
        value={distanceKm}
        onChangeText={setDistanceKm}
        keyboardType="numeric"
      />

      <View style={styles.switchRow}>
        <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>Faire un plein</Text>
        <Switch
          value={doFillUp}
          onValueChange={setDoFillUp}
          trackColor={{ false: colors.border, true: colors.accent }}
        />
      </View>

      {doFillUp && (
        <>
          <Input
            label="Litres"
            value={liters}
            onChangeText={setLiters}
            keyboardType="numeric"
            placeholder="45"
          />
          <Input
            label={`Prix au litre (${moneySymbol})`}
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
          />
          <View style={styles.switchRow}>
            <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>Plein complet</Text>
            <Switch
              value={isFull}
              onValueChange={setIsFull}
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
        </>
      )}

      <Button
        title={doFillUp ? 'Enregistrer trajet + plein' : 'Enregistrer trajet sans plein'}
        onPress={save}
        loading={loading}
        style={{ marginTop: 8 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
});
