/**
 * Trajets programmés (réguliers) — gestion dédiée hors Budget.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router, useFocusEffect, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/context/AppContext';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { SwipeableRow } from '@/components/SwipeableRow';
import {
  deleteRecurringRoute,
  getPlaces,
  getRecurringRoutes,
} from '@/lib/database';
import { confirm } from '@/lib/notify';
import { toLocalYmd } from '@/lib/dates';
import type { Place, RecurringRoute } from '@/types';

export default function ScheduledTripsScreen() {
  const { colors } = useTheme();
  const { activeVehicle } = useApp();
  const insets = useSafeAreaInsets();
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<RecurringRoute[]>([]);

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      getPlaces(),
      getRecurringRoutes(activeVehicle?.id),
    ]);
    setPlaces(p);
    setRoutes(r);
  }, [activeVehicle?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const openEdit = (id?: number) => {
    if (id != null) {
      router.push({ pathname: '/place/route' as never, params: { id: String(id) } } as never);
    } else {
      router.push('/place/route' as never);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Trajets programmés' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom, gap: 12 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
          Définissez vos trajets récurrents (ex. Domicile → Travail). Ils alimentent les estimations
          budget et les suggestions de démarrage.
        </Text>
        <Button title="Ajouter un trajet programmé" onPress={() => openEdit()} />
        <Card>
          {routes.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>
              Aucun trajet programmé. Ajoutez Domicile / Travail dans Budget → Lieux, puis créez un
              trajet ici.
            </Text>
          ) : (
            routes.map((r) => {
              const from = places.find((p) => p.id === r.fromPlaceId);
              const to = places.find((p) => p.id === r.toPlaceId);
              const today = toLocalYmd(new Date());
              const onVac = r.isOnVacation && (!r.vacationUntil || r.vacationUntil >= today);
              const days = r.workDaysPerWeek || r.timesPerWeek;
              return (
                <SwipeableRow
                  key={r.id}
                  style={{ marginBottom: 8 }}
                  onEdit={() => openEdit(r.id)}
                  onDelete={() =>
                    confirm('Supprimer', `Supprimer « ${r.name} » ?`, async () => {
                      await deleteRecurringRoute(r.id);
                      await load();
                    }, 'Supprimer')
                  }
                >
                  <Pressable
                    onPress={() => openEdit(r.id)}
                    style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.card }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>
                        {r.name}
                        {onVac ? ' · vacances' : ''}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                        {from?.name || '?'} → {to?.name || '?'} · {r.distanceKm} km · {days} j/sem
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
                        ← Modifier · Supprimer →
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </Pressable>
                </SwipeableRow>
              );
            })
          )}
        </Card>
        <Pressable onPress={() => router.push('/(tabs)/budget' as never)}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>
            Aussi visible dans Budget · Trajets réguliers
          </Text>
        </Pressable>
        {activeVehicle ? (
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Véhicule actif : {activeVehicle.name}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
});
