import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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
  displayOdometerKm,
  getConsumptionStats,
  getSinceLastFillStats,
  estimateCost,
} from '@/lib/calculations';
import { estimateTripFuelLiters } from '@/lib/consumptionModel';
import { seedDemoData } from '@/lib/seedDemo';
import { seedTodayCommuteAndFillUp } from '@/lib/seedToday';
import { notify } from '@/lib/notify';
import { getPlaces, getMaintenances, getTrips, reconcileTrackedKmFromTrips } from '@/lib/database';
import { syncFailureMessage } from '@/lib/api';
import { computeBudgetOutlook } from '@/lib/budgetOutlook';
import { fuelRemainingTone, fuelToneColor, setFuelLiters } from '@/lib/fuelLevel';
import { FuelGaugeSlider } from '@/components/FuelGaugeSlider';
import type { ConsumptionStats, Place, SinceLastFillStats, Trip, VehicleMaintenance } from '@/types';
import { MAINTENANCE_KIND_LABELS, maintenanceIsUrgent } from '@/lib/vehicleMaintenance';
import { formatDateSlash, formatRelativeDay, toLocalYmd } from '@/lib/dates';

export default function HomeScreen() {
  const { activeVehicle, activeTrip, budgetStatuses, refresh, vehicles, selectVehicle, isLoading } = useApp();
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
  const [dueMaintenances, setDueMaintenances] = useState<VehicleMaintenance[]>([]);
  const [todayTrips, setTodayTrips] = useState<Trip[]>([]);
  const [homeFuelDraft, setHomeFuelDraft] = useState<number | null>(null);

  useEffect(() => {
    setHomeFuelDraft(activeVehicle?.estimatedFuelLiters ?? null);
  }, [activeVehicle?.id, activeVehicle?.estimatedFuelLiters]);

  const reloadStats = async (vehicleId: number) => {
    const [s, since, trips] = await Promise.all([
      getConsumptionStats(vehicleId),
      getSinceLastFillStats(vehicleId),
      getTrips(vehicleId, { omitRoutePoints: true }),
    ]);
    setStats(s);
    setSinceFill(since);
    const ymd = toLocalYmd(new Date());
    setTodayTrips(
      trips.filter((t) => {
        if (t.isActive || t.distanceKm < 0.05) return false;
        try {
          return toLocalYmd(new Date(t.startTime)) === ymd;
        } catch {
          return t.startTime.slice(0, 10) === ymd;
        }
      })
    );
  };

  const reloadDueMaintenances = async () => {
    try {
      const list = await getMaintenances();
      setDueMaintenances(
        list.filter((m) => {
          if (m.status === 'done' || m.status === 'cancelled') return false;
          if (m.dueDate || m.status === 'overdue') return true;
          const v = vehicles.find((x) => x.id === m.vehicleId);
          const odo = v ? displayOdometerKm(v) : null;
          return (
            (m.dueOdometer != null && m.dueOdometer > 0) ||
            maintenanceIsUrgent(m, 14, odo)
          );
        })
      );
    } catch {
      setDueMaintenances([]);
    }
  };

  useEffect(() => {
    void getPlaces().then(setPlaces).catch(() => setPlaces([]));
    void reloadDueMaintenances();
    if (activeVehicle) {
      void (async () => {
        try {
          await reconcileTrackedKmFromTrips(activeVehicle.id);
          await refresh();
        } catch {
          /* ignore */
        }
        await reloadStats(activeVehicle.id);
      })();
    } else {
      setStats(null);
      setSinceFill(null);
    }
  }, [activeVehicle?.id]);

  // Toujours rafraîchir « depuis le dernier plein » pour le véhicule sélectionné
  useFocusEffect(
    useCallback(() => {
      if (!activeVehicle) {
        setSinceFill(null);
        setStats(null);
        return;
      }
      void reloadStats(activeVehicle.id);
    }, [activeVehicle?.id])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    try {
      const result = await syncNow();
      await refresh();
      if (result === 'pulled') showToast('Cloud téléchargé');
      else if (result === 'pushed') showToast('Sauvegarde envoyée au cloud');
      else if (result === 'skipped') showToast('Sync reportée — terminez le trajet d’abord');
      else showToast('Synchronisation à jour');
    } catch (e) {
      const fail = syncFailureMessage(e);
      showToast(fail.message);
    }
    try {
      await checkNow();
    } catch {
      /* ignore */
    }
    if (activeVehicle) await reloadStats(activeVehicle.id);
    const p = await getPlaces().catch(() => [] as Place[]);
    setPlaces(p);
    await reloadDueMaintenances();
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
    const hasCoords = p.latitude != null && p.longitude != null;
    router.push({
      pathname: '/(tabs)/trip' as never,
      params: {
        mode: 'nav',
        dest,
        destLat: hasCoords ? String(p.latitude) : '',
        destLon: hasCoords ? String(p.longitude) : '',
        // Auto-start désactivé : on prépare la destination ; l’utilisateur choisit l’itinéraire.
        autoStart: '0',
        prepare: hasCoords ? '1' : '0',
      },
    } as never);
  };

  const mainBudget = budgetStatuses.find((s) => s.budget.vehicleId == null) || budgetStatuses[0];
  const homePlace = places.find((p) => p.kind === 'home');
  const workPlace = places.find((p) => p.kind === 'work');
  const favoritePlaces = places.filter((p) => p.kind === 'other' || p.kind === 'station');
  const budgetOutlook = mainBudget
    ? computeBudgetOutlook({
        allocation: mainBudget.budget.amount,
        spent: mainBudget.spent,
        startDate: mainBudget.budget.startDate,
        endDate: mainBudget.budget.endDate,
        vehicles: activeVehicle ? [activeVehicle] : [],
        plannedMonthSpend: 0,
      })
    : null;

  const todayKm = todayTrips.reduce((s, t) => s + t.distanceKm, 0);
  const todayFuel = todayTrips.reduce((s, t) => s + t.estimatedFuelUsed, 0);
  const todayCost = todayTrips.reduce((s, t) => s + t.estimatedCost, 0);

  /** Pendant un trajet actif, recalcule conso si pas encore persistée (évite 0,02 L fantômes). */
  const activeTripFuel =
    activeTrip && activeVehicle
      ? activeTrip.estimatedFuelUsed > 0.05
        ? activeTrip.estimatedFuelUsed
        : estimateTripFuelLiters(activeVehicle, activeTrip.distanceKm, {
            learnedFactor: activeVehicle.consumptionLearnFactor,
          })
      : 0;
  const activeTripCost =
    activeTrip && activeVehicle
      ? activeTrip.estimatedCost > 0.05
        ? activeTrip.estimatedCost
        : estimateCost(activeTripFuel, activeVehicle.defaultFuelPrice)
      : 0;

  const fuelTone = activeVehicle
    ? fuelRemainingTone({
        litersRemaining:
          activeVehicle.estimatedFuelLiters ?? sinceFill?.fuelRemainingEst ?? null,
        tankCapacity: activeVehicle.tankCapacity,
        lowLitersThreshold: activeVehicle.lowFuelThresholdLiters,
        rangeKm: sinceFill?.rangeKm,
      })
    : 'unknown';
  const fuelColor = fuelToneColor(fuelTone, colors);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 200 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <PendingAccountsBanner />
        <InstallAppHint />
        {isLoading && !activeVehicle && vehicles.length === 0 ? (
          <Card style={styles.emptyCard}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 16 }]}>
              Chargement…
            </Text>
          </Card>
        ) : !activeVehicle ? (
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
            {vehicles.length === 0 && __DEV__ && (
              <Button
                title="Charger un exemple (données de démo)"
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
                <Pressable
                  onPress={onRefresh}
                  hitSlop={10}
                  style={[styles.iconBtn, { borderColor: colors.border }]}
                  accessibilityLabel="Actualiser les données"
                >
                  <Ionicons name="refresh" size={20} color={colors.accent} />
                </Pressable>
              </View>
              <Text style={[styles.odometer, { color: colors.text }]}>
                {displayOdometerKm(activeVehicle).toLocaleString(locale)} km
              </Text>
              <View
                style={{ marginTop: 10 }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
              >
                <FuelGaugeSlider
                  requireConfirm
                  tankCapacity={activeVehicle.tankCapacity}
                  liters={homeFuelDraft}
                  accentColor={fuelColor}
                  onChange={setHomeFuelDraft}
                  onChangeEnd={async (L) => {
                    setHomeFuelDraft(L);
                    await setFuelLiters(activeVehicle, L);
                    await refresh();
                    await reloadStats(activeVehicle.id);
                    notify('Réservoir', `${L.toFixed(1)} L · autonomie mise à jour`);
                  }}
                />
              </View>
              {vehicles.length > 1 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {vehicles.map((v) => {
                    const selected = v.id === activeVehicle.id;
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => void selectVehicle(v.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Véhicule ${v.name}`}
                        style={[
                          styles.vehChip,
                          {
                            borderColor: selected ? colors.accent : colors.border,
                            backgroundColor: selected ? colors.accent + '22' : colors.background,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: selected ? colors.accent : colors.text,
                            fontWeight: '700',
                            fontSize: 13,
                          }}
                          numberOfLines={1}
                        >
                          {v.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Card>

            {(todayTrips.length > 0 || todayKm > 0) && (
              <Card style={{ marginTop: 12 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '800' }}>
                  AUJOURD’HUI
                </Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>
                      {formatDistance(todayKm)}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                      {todayTrips.length} trajet{todayTrips.length > 1 ? 's' : ''}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>
                      {todayFuel.toFixed(1)} L
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>estimé</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 18 }}>
                      {formatEuro(todayCost)}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>coût</Text>
                  </View>
                </View>
              </Card>
            )}

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
                    {activeTripFuel.toFixed(2)} L
                  </Text>
                  <Text style={[styles.tripStat, { color: colors.text }]}>
                    {formatEuro(activeTripCost)}
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
                color={fuelColor}
                subtitle={
                  sinceFill?.lastFill
                    ? `~${sinceFill.fuelRemainingEst.toFixed(1)} L restants`
                    : 'Après un plein + trajets'
                }
              />
            </View>

            {sinceFill?.lastFill && (
              <Card
                style={{
                  marginBottom: 16,
                  borderColor: fuelTone === 'ok' || fuelTone === 'unknown' ? colors.border : fuelColor,
                  borderWidth: fuelTone === 'ok' || fuelTone === 'unknown' ? 1 : 1.5,
                }}
              >
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Depuis le dernier plein · {activeVehicle.name}
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: '800',
                    fontSize: 22,
                    marginBottom: 6,
                  }}
                >
                  {formatDistance(sinceFill.tripKm)}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
                  {sinceFill.tripCount} trajet{sinceFill.tripCount > 1 ? 's' : ''} · ~
                  {formatEuro(sinceFill.costEst)} · ~{sinceFill.fuelUsedEst.toFixed(1)} L
                  {'\n'}
                  Plein du {formatRelativeDay(sinceFill.lastFill.date)} (
                  {formatEuro(sinceFill.lastFill.totalCost)})
                </Text>
                {fuelTone !== 'unknown' && (
                  <Text style={{ color: fuelColor, fontWeight: '700', fontSize: 13, marginTop: 8 }}>
                    {fuelTone === 'ok'
                      ? `Autonomie correcte · ~${formatDistance(sinceFill.rangeKm)}`
                      : fuelTone === 'warn'
                        ? `Autonomie basse · ~${formatDistance(sinceFill.rangeKm)} restants`
                        : `Réservoir critique · ~${formatDistance(sinceFill.rangeKm)} restants`}
                  </Text>
                )}
              </Card>
            )}

            {!sinceFill?.lastFill && (
              <Card style={{ marginBottom: 16 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Depuis le dernier plein
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>
                  Enregistrez un plein pour suivre km, litres et autonomie.
                </Text>
                <Button title="Nouveau plein" onPress={() => router.push('/fillup/add')} />
              </Card>
            )}

            {(fuelTone === 'warn' || fuelTone === 'critical') && (
              <Card
                style={{
                  marginBottom: 16,
                  borderColor: fuelColor,
                  borderWidth: 1.5,
                }}
              >
                <Text style={{ color: fuelColor, fontWeight: '800', fontSize: 15 }}>
                  {fuelTone === 'critical' ? 'Réservoir critique' : 'Carburant bas'}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 10 }}>
                  Pensez à faire le plein bientôt
                  {sinceFill?.rangeKm
                    ? ` · ~${formatDistance(sinceFill.rangeKm)} d’autonomie`
                    : ''}
                  .
                </Text>
                <Button title="Nouveau plein" onPress={() => router.push('/fillup/add')} />
              </Card>
            )}

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
              <Pressable
                onPress={() => router.push('/(tabs)/budget' as never)}
                accessibilityRole="button"
                accessibilityLabel={`Budget ${mainBudget.budget.name}, ouvrir le détail`}
                accessibilityHint="Ouvre l’onglet Budget"
              >
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
                      fontSize: 22,
                      marginBottom: 6,
                    }}
                  >
                    {mainBudget.percentUsed > 100
                      ? `Dépassé de ${formatEuro(mainBudget.spent - mainBudget.budget.amount)}`
                      : `Il reste ${formatEuro(mainBudget.remaining)}`}
                  </Text>
                  <ProgressBar
                    percent={Math.min(100, mainBudget.percentUsed)}
                    color={
                      mainBudget.percentUsed > 100
                        ? colors.danger
                        : mainBudget.percentUsed > 80
                          ? colors.warning
                          : colors.success
                    }
                    height={12}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>
                    {formatEuro(mainBudget.spent)} dépensés sur {formatEuro(mainBudget.budget.amount)}
                  </Text>
                  {budgetOutlook && budgetOutlook.rangeKm > 0 && (
                    <View
                      style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 12,
                        backgroundColor: colors.background,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
                        {budgetOutlook.adjustedRemaining >= 0
                          ? `Reste estimé ${formatEuro(budgetOutlook.adjustedRemaining)}`
                          : `Manque estimé ${formatEuro(Math.abs(budgetOutlook.adjustedRemaining))}`}
                      </Text>
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: 12,
                          marginTop: 4,
                          lineHeight: 17,
                        }}
                      >
                        Autonomie ~{formatDistance(budgetOutlook.rangeKm)}
                        {budgetOutlook.fuelStockValue > 0
                          ? ` · stock ${formatEuro(budgetOutlook.fuelStockValue)}`
                          : ''}
                        {' · '}
                        {Math.ceil(budgetOutlook.remainingDays)} j. restants dans le mois
                      </Text>
                    </View>
                  )}
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 8 }}>
                    Voir le budget →
                  </Text>
                </Card>
              </Pressable>
            )}

            {dueMaintenances.length > 0 && (
              <Card style={{ marginBottom: 16, borderColor: colors.warning, borderWidth: 1 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
                    Entretien à prévoir
                  </Text>
                  {dueMaintenances.length > 4 && (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/vehicle/maintenance' as never,
                          params: { id: String(activeVehicle.id) },
                        })
                      }
                    >
                      <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>
                        Voir tout
                      </Text>
                    </Pressable>
                  )}
                </View>
                {dueMaintenances.slice(0, 4).map((m) => {
                  const v = vehicles.find((x) => x.id === m.vehicleId);
                  const urgent =
                    maintenanceIsUrgent(m, 14, v ? displayOdometerKm(v) : null) ||
                    m.status === 'overdue';
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() =>
                        router.push({
                          pathname: '/vehicle/maintenance' as never,
                          params: { id: String(m.vehicleId) },
                        })
                      }
                      style={{ marginBottom: 10 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: urgent ? colors.danger : colors.warning,
                          }}
                        />
                        <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>
                          {v?.name || 'Véhicule'} · {m.title}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: urgent ? colors.danger : colors.warning,
                          fontSize: 13,
                          marginTop: 2,
                          marginLeft: 16,
                        }}
                      >
                        {urgent ? 'Urgent · ' : ''}
                        {MAINTENANCE_KIND_LABELS[m.kind]}
                        {m.dueDate ? ` · avant le ${formatDateSlash(m.dueDate)}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>
            )}

            {(homePlace || workPlace || favoritePlaces.length > 0) && (
              <Card style={{ marginBottom: 16 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Trajets rapides</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
                  Depuis votre position actuelle vers un lieu enregistré.
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

            {__DEV__ && (
              <Button
                title="Ajouter journée type (aujourd’hui)"
                variant="outline"
                loading={seedingToday}
                onPress={loadToday}
                style={{ marginTop: 4, marginBottom: 24 }}
              />
            )}
          </>
        )}
      </ScrollView>

      <SpeedDialFab
        dual
        actions={[
          {
            key: 'fillup',
            label: 'Nouveau plein',
            icon: 'gas-pump',
            onPress: () => {
              if (!activeVehicle) {
                router.push('/(tabs)/vehicles' as never);
                return;
              }
              router.push('/fillup/add');
            },
          },
          activeTrip
            ? {
                key: 'trip',
                label: 'Voir trajet',
                icon: 'navigate',
                onPress: () => router.push('/(tabs)/trip'),
              }
            : {
                key: 'trip',
                label: 'Démarrer trajet',
                icon: 'navigate',
                onPress: () => {
                  if (!activeVehicle) {
                    router.push('/(tabs)/vehicles' as never);
                    return;
                  }
                  router.push('/(tabs)/trip');
                },
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
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: '48%',
  },
  tripBanner: { marginBottom: 16, borderWidth: 2 },
  tripHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tripTitle: { fontSize: 16, fontWeight: '700' },
  tripStats: { flexDirection: 'row', justifyContent: 'space-around' },
  tripStat: { fontSize: 18, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  budgetCard: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  quickChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
