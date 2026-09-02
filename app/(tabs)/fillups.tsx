import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { getFillUps } from '@/lib/database';
import { formatEuro } from '@/lib/calculations';
import type { FillUp } from '@/types';

export default function FillUpsScreen() {
  const { activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const [fillUps, setFillUps] = useState<FillUp[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadFillUps = async () => {
    const data = await getFillUps(activeVehicle?.id);
    setFillUps(data);
  };

  useEffect(() => {
    loadFillUps();
  }, [activeVehicle]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await loadFillUps();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={fillUps}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Card style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {activeVehicle
                ? 'Aucun plein enregistré pour ce véhicule'
                : 'Sélectionnez un véhicule pour voir les pleins'}
            </Text>
          </Card>
        }
        renderItem={({ item }) => (
          <Card style={styles.fillUpCard}>
            <View style={styles.fillUpHeader}>
              <Text style={[styles.date, { color: colors.text }]}>
                {new Date(item.date).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <Text style={[styles.cost, { color: colors.accent }]}>
                {formatEuro(item.totalCost)}
              </Text>
            </View>
            <View style={styles.fillUpDetails}>
              <Text style={[styles.detail, { color: colors.textSecondary }]}>
                {item.liters.toFixed(2)} L à {item.pricePerLiter.toFixed(3)} €/L
              </Text>
              <Text style={[styles.detail, { color: colors.textSecondary }]}>
                {item.odometer.toLocaleString('fr-FR')} km
                {item.isFull ? ' • Plein complet' : ' • Partiel'}
              </Text>
            </View>
            {item.note && (
              <Text style={[styles.note, { color: colors.textSecondary }]}>{item.note}</Text>
            )}
          </Card>
        )}
      />
      <View style={styles.footer}>
        <Button
          title="Nouveau plein"
          onPress={() => router.push('/fillup/add')}
          disabled={!activeVehicle}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 100 },
  empty: { alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  fillUpCard: { marginBottom: 12 },
  fillUpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: { fontSize: 16, fontWeight: '600' },
  cost: { fontSize: 18, fontWeight: '700' },
  fillUpDetails: { marginTop: 8 },
  detail: { fontSize: 14, marginTop: 2 },
  note: { fontSize: 13, marginTop: 8, fontStyle: 'italic' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
});
