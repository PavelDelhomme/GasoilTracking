import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { Card, StatCard, ProgressBar } from '@/components/Card';
import { Button } from '@/components/Button';
import {
  formatEuro,
  formatConsumption,
  formatDistance,
  getConsumptionStats,
  estimateRange,
} from '@/lib/calculations';
import type { ConsumptionStats } from '@/types';

export default function HomeScreen() {
  const { activeVehicle, activeTrip, budgetStatuses, refresh } = useApp();
  const { user, logout, syncNow } = useAuth();
  const { colors } = useTheme();
  const [stats, setStats] = useState<ConsumptionStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (activeVehicle) {
      getConsumptionStats(activeVehicle.id).then(setStats);
    }
  }, [activeVehicle]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    try {
      await syncNow();
    } catch {
      /* offline */
    }
    if (activeVehicle) {
      const s = await getConsumptionStats(activeVehicle.id);
      setStats(s);
    }
    setRefreshing(false);
  };

  const mainBudget = budgetStatuses[0];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Card style={{ marginBottom: 12 }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {user ? `Bonjour, ${user.name}` : 'Compte cloud'}
        </Text>
        <Text style={{ color: colors.textSecondary, marginBottom: 10, fontSize: 13 }}>
          {user
            ? 'Vos données peuvent être synchronisées sur le serveur.'
            : 'Connectez-vous pour sauvegarder et retrouver vos données.'}
        </Text>
        {user ? (
          <View style={styles.actions}>
            <Button title="Synchroniser" variant="secondary" onPress={() => syncNow()} style={{ flex: 1 }} />
            <Button title="Déconnexion" variant="outline" onPress={() => logout()} style={{ flex: 1 }} />
          </View>
        ) : (
          <Button title="Connexion / Inscription" onPress={() => router.push('/auth' as never)} />
        )}
      </Card>

      {!activeVehicle ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="car-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Aucun véhicule actif
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Ajoutez un véhicule pour commencer à suivre votre consommation.
          </Text>
          <Button
            title="Ajouter un véhicule"
            onPress={() => router.push('/vehicle/add')}
            style={{ marginTop: 16 }}
          />
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
              {activeVehicle.currentOdometer.toLocaleString('fr-FR')} km
            </Text>
          </Card>

          {activeTrip && (
            <Card style={{ ...styles.tripBanner, borderColor: colors.accent }}>
              <View style={styles.tripHeader}>
                <Ionicons name="navigate-circle" size={24} color={colors.accent} />
                <Text style={[styles.tripTitle, { color: colors.accent }]}>
                  Trajet en cours
                </Text>
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
              subtitle="Mesurée entre pleins"
            />
            <StatCard
              label="Autonomie est."
              value={formatDistance(estimateRange(activeVehicle))}
              subtitle={`Réservoir ${activeVehicle.tankCapacity} L`}
            />
          </View>

          <View style={styles.statsRow}>
            <StatCard
              label="Total dépensé"
              value={formatEuro(stats?.totalCost ?? 0)}
              subtitle={`${stats?.fillUpCount ?? 0} plein(s)`}
            />
            <StatCard
              label="Distance"
              value={formatDistance(stats?.totalDistance ?? 0)}
              subtitle="Entre pleins complets"
            />
          </View>

          {mainBudget && (
            <Card style={styles.budgetCard}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Budget : {mainBudget.budget.name}
              </Text>
              <View style={styles.budgetRow}>
                <Text style={[styles.budgetAmount, { color: colors.text }]}>
                  {formatEuro(mainBudget.spent)} / {formatEuro(mainBudget.budget.amount)}
                </Text>
                <Text
                  style={{
                    color:
                      mainBudget.percentUsed > 90
                        ? colors.danger
                        : mainBudget.percentUsed > 70
                          ? colors.warning
                          : colors.success,
                    fontWeight: '600',
                  }}
                >
                  {mainBudget.percentUsed.toFixed(0)}%
                </Text>
              </View>
              <ProgressBar percent={mainBudget.percentUsed} />
              <Text style={[styles.budgetRemaining, { color: colors.textSecondary }]}>
                Reste : {formatEuro(mainBudget.remaining)}
              </Text>
            </Card>
          )}

          <View style={styles.actions}>
            <Button
              title="Nouveau plein"
              onPress={() => router.push('/fillup/add')}
              style={{ flex: 1 }}
            />
            <Button
              title="Démarrer trajet"
              variant="secondary"
              onPress={() => router.push('/(tabs)/trip')}
              style={{ flex: 1 }}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  actions: { flexDirection: 'row', gap: 12, marginBottom: 32 },
});
