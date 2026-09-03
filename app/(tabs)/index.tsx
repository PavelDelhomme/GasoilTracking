import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useTheme } from '@/hooks/useTheme';
import { useAppUpdate } from '@/context/AppUpdateContext';
import { useToast } from '@/context/ToastContext';
import { Card, StatCard, ProgressBar } from '@/components/Card';
import { Button } from '@/components/Button';
import { SpeedDialFab } from '@/components/SpeedDialFab';
import { PendingAccountsBanner } from '@/components/PendingAccountsBanner';
import { InstallAppHint } from '@/components/InstallAppHint';
import {
  formatEuro,
  formatConsumption,
  formatDistance,
  getConsumptionStats,
  getSinceLastFillStats,
} from '@/lib/calculations';
import { seedDemoData } from '@/lib/seedDemo';
import { seedTodayCommuteAndFillUp } from '@/lib/seedToday';
import { notify } from '@/lib/notify';
import { getPlaces } from '@/lib/database';
import type { ConsumptionStats, Place, SinceLastFillStats } from '@/types';

export default function HomeScreen() {
  const { activeVehicle, activeTrip, budgetStatuses, refresh, vehicles } = useApp();
  const { syncNow } = useAuth();
  const { colors } = useTheme();
  const { locale } = useLocale();
  const { checkNow } = useAppUpdate();
  const { showToast } = useToast();
  const [stats, setStats] = useState<ConsumptionStats | null>(null);
  const [sinceFill, setSinceFill] = useState<SinceLastFillStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedingToday, setSeedingToday] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);

  const reloadStats = async (vehicleId: number) => {
    const [s, since] = await Promise.all([
      getConsumptionStats(vehicleId),
      getSinceLastFillStats(vehicleId),
    ]);
    setStats(s);
    setSinceFill(since);
  };

  useEffect(() => {
    void getPlaces().then(setPlaces).catch(() => setPlaces([]));
    if (activeVehicle) {
      void reloadStats(activeVehicle.id);
    } else {
      setStats(null);
      setSinceFill(null);
    }
  }, [activeVehicle]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    try {
      await syncNow();
      showToast('Synchronisation manuelle réussie');
    } catch {
      /* offline */
    }
    try {
      await checkNow();
    } catch {
      /* ignore */
    }
    if (activeVehicle) await reloadStats(activeVehicle.id);
    const p = await getPlaces().catch(() => [] as Place[]);
    setPlaces(p);
    setRefreshing(false);
  };

  const loadDemo = async () => {
    setSeeding(true);
    try {
      const res = await seedDemoData();
      await refresh();
      notify(
        'Données démo chargées',
        `${res.trips} trajets + pleins + budget sur le véhicule #${res.vehicleId}.`
      );
    } catch (e) {
      notify('Démo', e instanceof Error ? e.message : 'Échec');
    } finally {
      setSeeding(false);
    }
  };

  const loadToday = async () => {
    if (!activeVehicle) {
      notify('Véhicule', 'Sélectionnez un véhicule d’abord.');
      return;
    }
    setSeedingToday(true);
    try {
      const res = await seedTodayCommuteAndFillUp(activeVehicle.id);
      await refresh();
      await reloadStats(activeVehicle.id);
      notify(
        'Journée ajoutée',
        `${res.tripsAdded} trajet(s) domicile↔travail` +
          (res.fillUpAdded ? ' + plein du jour' : ' (plein déjà présent)') +
          '.'
      );
    } catch (e) {
      notify('Aujourd’hui', e instanceof Error ? e.message : 'Échec');
    } finally {
      setSeedingToday(false);
    }
  };

  const startNavToPlace = (p: Place) => {
    const dest = p.address?.trim() || p.name;
    router.push({
      pathname: '/(tabs)/trip' as never,
      params: {
        mode: 'nav',
        dest,
        destLat: p.latitude != null ? String(p.latitude) : '',
        destLon: p.longitude != null ? String(p.longitude) : '',
        autoStart: '1',
      },
    } as never);
  };

  const mainBudget = budgetStatuses.find((s) => s.budget.vehicleId == null) || budgetStatuses[0];
  const homePlace = places.find((p) => p.kind === 'home');
  const workPlace = places.find((p) => p.kind === 'work');
  const favoritePlaces = places.filter((p) => p.kind === 'other' || p.kind === 'station');

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <PendingAccountsBanner />
        <InstallAppHint />
        {!activeVehicle ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="car-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Aucun véhicule actif</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Ajoutez un véhicule pour commencer à suivre votre consommation. Compte et admin : menu
              ☰ en haut à gauche.
            </Text>
            <Button
              title="Ajouter un véhicule"
              onPress={() => router.push('/vehicle/add')}
              style={{ marginTop: 16 }}
            />
            {vehicles.length === 0 && (
              <Button
                title="Charger un exemple (trajets + pleins)"
                variant="outline"
                loading={seeding}
                onPress={loadDemo}
                style={{ marginTop: 10 }}
              />
            )}
          </Card>
        ) : (
          <>
            <Card style={styles.vehicleHeader}>
              <View style={styles.vehicleRow}>
                <Ionicons name="car-sport" size={32} color={colors.accent} />
                <View style={styles.vehicleInfo}>
                  <Text style={[styles.vehicleName, { color: colors.text }]}>
                    {activeVehicle.name}
                  </Text>
                  <Text style={[styles.vehicleDetail, { color: colors.textSecondary }]}>
                    {activeVehicle.brand} {activeVehicle.model} • {activeVehicle.year}
                  </Text>
                </View>
              </View>
              <Text style={[styles.odometer, { color: colors.textSecondary }]}>
                {activeVehicle.currentOdometer.toLocaleString(locale)} km
              </Text>
            </Card>

            {activeTrip && (
              <Card style={{ ...styles.tripBanner, borderColor: colors.accent }}>
                <View style={styles.tripHeader}>
                  <Ionicons name="navigate-circle" size={24} color={colors.accent} />
                  <Text style={[styles.tripTitle, { color: colors.accent }]}>Trajet en cours</Text>
                </View>
                <View style={styles.tripStats}>
                  <Text style={[styles.tripStat, { color: colors.text }]}>
                    {formatDistance(activeTrip.distanceKm)}
                  </Text>
                  <Text style={[styles.tripStat, { color: colors.text }]}>
                    {activeTrip.estimatedFuelUsed.toFixed(2)} L
                  </Text>
                  <Text style={[styles.tripStat, { color: colors.text }]}>
                    {formatEuro(activeTrip.estimatedCost)}
                  </Text>
                </View>
                <Button
                  title="Voir le trajet"
                  variant="outline"
                  onPress={() => router.push('/(tabs)/trip')}
                  style={{ marginTop: 8 }}
                />
              </Card>
            )}

            <View style={styles.statsRow}>
              <StatCard
                label="Conso. moyenne"
                value={
                  stats && stats.averageConsumption > 0
                    ? formatConsumption(stats.averageConsumption, activeVehicle.fuelType)
                    : formatConsumption(activeVehicle.consumptionPer100, activeVehicle.fuelType)
                }
                subtitle={
                  stats && stats.averageConsumption > 0
                    ? activeVehicle.consumptionAutoAdapt !== false
                      ? `Adaptée à vos pleins (~${stats.averageConsumption.toFixed(1)} mesurée)`
                      : 'Valeur manuelle (auto off)'
                    : 'Catalogue / saisie — s’adapte aux pleins'
                }
              />
              <StatCard
                label="Autonomie rest."
                value={formatDistance(sinceFill?.rangeKm ?? 0)}
                subtitle={
                  sinceFill?.lastFill
                    ? `${formatDistance(sinceFill.tripKm)} depuis dernier plein · ~${sinceFill.fuelRemainingEst.toFixed(1)} L`
                    : 'Après un plein + trajets'
                }
              />
            </View>

            <View style={styles.statsRow}>
              <StatCard
                label="Total dépensé"
                value={formatEuro(stats?.totalCost ?? 0)}
                subtitle={`${stats?.fillUpCount ?? 0} plein(s) enregistré(s)`}
              />
              <StatCard
                label="Distance"
                value={formatDistance(stats?.totalDistance ?? 0)}
                subtitle="Pleins + trajets GPS"
              />
            </View>

            {mainBudget && (
              <Card style={styles.budgetCard}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {mainBudget.budget.name}
                </Text>
                <Text
                  style={{
                    color:
                      mainBudget.percentUsed > 100
                        ? colors.danger
                        : mainBudget.percentUsed > 80
                          ? colors.warning
                          : colors.success,
                    fontWeight: '800',
                    fontSize: 26,
                    letterSpacing: -0.4,
                  }}
                >
                  {mainBudget.percentUsed > 100
                    ? `Dépassé de ${formatEuro(mainBudget.spent - mainBudget.budget.amount)}`
                    : `Il reste ${formatEuro(mainBudget.remaining)}`}
                </Text>
                <Text style={[styles.budgetRemaining, { color: colors.textSecondary, marginTop: 4 }]}>
                  {formatEuro(mainBudget.spent)} dépensés sur {formatEuro(mainBudget.budget.amount)}
                </Text>
                <ProgressBar percent={mainBudget.percentUsed} />
              </Card>
            )}

            {activeVehicle && (
              <Card style={{ marginBottom: 16 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Carburant réservoir</Text>
                {activeVehicle.estimatedFuelLiters == null ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    Niveau inconnu — saisissez un plein pour initialiser la jauge.
                  </Text>
                ) : (
                  <>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: '800',
                        fontSize: 22,
                        marginBottom: 6,
                      }}
                    >
                      {activeVehicle.estimatedFuelLiters.toFixed(1)} L restants
                    </Text>
                    <ProgressBar
                      percent={
                        activeVehicle.tankCapacity > 0
                          ? (activeVehicle.estimatedFuelLiters / activeVehicle.tankCapacity) * 100
                          : 0
                      }
                      color={
                        (activeVehicle.estimatedFuelLiters / Math.max(activeVehicle.tankCapacity, 1)) *
                          100 <
                        20
                          ? colors.danger
                          : (activeVehicle.estimatedFuelLiters /
                                Math.max(activeVehicle.tankCapacity, 1)) *
                                100 <
                              40
                            ? colors.warning
                            : colors.success
                      }
                      height={12}
                    />
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>
                      Sur {activeVehicle.tankCapacity} L
                      {sinceFill && sinceFill.rangeKm > 0
                        ? ` · ~${formatDistance(sinceFill.rangeKm)} d’autonomie`
                        : ''}
                    </Text>
                  </>
                )}
              </Card>
            )}

            {(homePlace || workPlace || favoritePlaces.length > 0) && (
              <Card style={{ marginBottom: 16 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Trajets rapides</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
                  Depuis ta position actuelle vers un lieu enregistré.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {homePlace && (
                    <Pressable
                      onPress={() => startNavToPlace(homePlace)}
                      style={[styles.quickChip, { borderColor: colors.accent, backgroundColor: colors.card }]}
                    >
                      <Text style={{ color: colors.accent, fontWeight: '800' }}>Maison</Text>
                    </Pressable>
                  )}
                  {workPlace && (
                    <Pressable
                      onPress={() => startNavToPlace(workPlace)}
                      style={[styles.quickChip, { borderColor: colors.accent, backgroundColor: colors.card }]}
                    >
                      <Text style={{ color: colors.accent, fontWeight: '800' }}>Travail</Text>
                    </Pressable>
                  )}
                  {favoritePlaces.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => startNavToPlace(p)}
                      style={[styles.quickChip, { borderColor: colors.border, backgroundColor: colors.card }]}
                    >
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{p.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            )}

            <Button
              title="Ajouter journée type (aujourd’hui)"
              variant="outline"
              loading={seedingToday}
              onPress={loadToday}
              style={{ marginTop: 4, marginBottom: 24 }}
            />
          </>
        )}
      </ScrollView>

      <SpeedDialFab
        dual
        disabled={!activeVehicle}
        actions={[
          {
            key: 'fillup',
            label: 'Nouveau plein',
            icon: 'gas-pump',
            onPress: () => router.push('/fillup/add'),
          },
          {
            key: 'trip',
            label: 'Démarrer trajet',
            icon: 'navigate',
            onPress: () => router.push('/(tabs)/trip'),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, padding: 16 },
  emptyCard: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 8 },
  vehicleHeader: { marginBottom: 16 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleInfo: { flex: 1 },
  vehicleName: { fontSize: 20, fontWeight: '700' },
  vehicleDetail: { fontSize: 14, marginTop: 2 },
  odometer: { fontSize: 13, marginTop: 8 },
  tripBanner: { marginBottom: 16, borderWidth: 2 },
  tripHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tripTitle: { fontSize: 16, fontWeight: '700' },
  tripStats: { flexDirection: 'row', justifyContent: 'space-around' },
  tripStat: { fontSize: 18, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  budgetCard: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  budgetAmount: { fontSize: 15, fontWeight: '600' },
  budgetRemaining: { fontSize: 13, marginTop: 8 },
  quickChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
