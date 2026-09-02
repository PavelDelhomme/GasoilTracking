import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useLocale } from '@/context/LocaleContext';
import { useTheme } from '@/hooks/useTheme';
import { Card, ProgressBar } from '@/components/Card';
import { Button } from '@/components/Button';
import { formatEuro } from '@/lib/calculations';
import {
  deleteBudget,
  deletePlace,
  deleteRecurringRoute,
  getFillUps,
  getMonthlySpend,
  getPlaces,
  getRecurringRoutes,
  updateRecurringRoute,
} from '@/lib/database';
import {
  fetchCheapestStations,
  fuelLabel,
  isFrenchFuelOpenDataAvailable,
  type FuelStationPrice,
} from '@/lib/fuelPrices';
import { getCurrentLocation } from '@/lib/locationService';
import { confirm } from '@/lib/notify';
import type { BudgetStatus, FillUp, Place, RecurringRoute } from '@/types';

const KIND_LABEL: Record<string, string> = {
  home: 'Domicile',
  work: 'Travail',
  other: 'Autre',
  station: 'Station',
};

export default function BudgetScreen() {
  const { budgetStatuses, activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const { countryCode, formatPerLiter, locale } = useLocale();
  const [refreshing, setRefreshing] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<RecurringRoute[]>([]);
  const [monthly, setMonthly] = useState<{ month: string; spent: number }[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthFillUps, setMonthFillUps] = useState<FillUp[]>([]);
  const [stations, setStations] = useState<FuelStationPrice[]>([]);
  const [fuelLoading, setFuelLoading] = useState(false);
  const [fuelError, setFuelError] = useState('');

  const loadExtra = useCallback(async () => {
    const [p, r, m] = await Promise.all([
      getPlaces(),
      getRecurringRoutes(activeVehicle?.id),
      getMonthlySpend(12),
    ]);
    setPlaces(p);
    setRoutes(r);
    setMonthly(m);
    const current = new Date().toISOString().slice(0, 7);
    setSelectedMonth((prev) => {
      if (prev && m.some((x) => x.month === prev)) return prev;
      return m.find((x) => x.month === current)?.month || m[m.length - 1]?.month || null;
    });
    const pick =
      (selectedMonth && m.some((x) => x.month === selectedMonth) && selectedMonth) ||
      m.find((x) => x.month === current)?.month ||
      m[m.length - 1]?.month;
    if (pick) {
      const fills = await getFillUps(activeVehicle?.id);
      setMonthFillUps(fills.filter((f) => f.date.slice(0, 7) === pick));
    }
  }, [activeVehicle?.id]); // eslint-ok: selectedMonth lu au moment du load

  const selectMonth = async (month: string) => {
    setSelectedMonth(month);
    const fills = await getFillUps(activeVehicle?.id);
    setMonthFillUps(fills.filter((f) => f.date.slice(0, 7) === month));
  };

  useFocusEffect(
    useCallback(() => {
      loadExtra();
    }, [loadExtra])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await loadExtra();
    setRefreshing(false);
  };

  const estimateMonthlyFromRoutes = () => {
    if (!activeVehicle) return 0;
    const today = new Date().toISOString().slice(0, 10);
    let kmWeek = 0;
    for (const r of routes) {
      const onVac =
        r.isOnVacation && (!r.vacationUntil || r.vacationUntil >= today);
      if (onVac) continue;
      const days = r.workDaysPerWeek || r.timesPerWeek || 0;
      kmWeek += r.distanceKm * days;
    }
    const kmMonth = kmWeek * 4.33;
    const liters = (kmMonth * activeVehicle.consumptionPer100) / 100;
    return liters * activeVehicle.defaultFuelPrice;
  };

  const loadFuelPrices = async () => {
    setFuelLoading(true);
    setFuelError('');
    setStations([]);
    if (!isFrenchFuelOpenDataAvailable(countryCode)) {
      setFuelError(
        'Prix stations open data : France uniquement. Ailleurs en Europe, saisissez vos pleins manuellement (devise du pays).'
      );
      setFuelLoading(false);
      return;
    }
    try {
      let lat = 50.6292;
      let lon = 3.0573; // Lille défaut
      const loc = await getCurrentLocation();
      if (loc) {
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;
      } else {
        const home = places.find((p) => p.kind === 'home' && p.latitude != null);
        if (home?.latitude != null && home.longitude != null) {
          lat = home.latitude;
          lon = home.longitude;
        }
      }
      const list = await fetchCheapestStations({
        latitude: lat,
        longitude: lon,
        radiusKm: 12,
        fuel: activeVehicle?.fuelType || 'diesel',
        limit: 8,
        countryCode,
      });
      setStations(list);
      if (!list.length) setFuelError('Aucune station trouvée dans ce rayon.');
    } catch (e) {
      setFuelError(e instanceof Error ? e.message : 'Erreur API prix');
    } finally {
      setFuelLoading(false);
    }
  };

  const maxMonth = Math.max(...monthly.map((m) => m.spent), 1);
  const projected = estimateMonthlyFromRoutes();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={styles.infoCard}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>Budget & planification</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Budgets, lieux réguliers (domicile / travail), estimation mensuelle et stations les moins
            chères autour de vous.
            {activeVehicle ? ` Véhicule : ${activeVehicle.name}` : ''}
          </Text>
        </Card>

        {/* Visu mensuelle */}
        <Text style={[styles.section, { color: colors.text }]}>Dépenses par mois</Text>
        <Card>
          {monthly.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>
              Aucun plein enregistré — les barres apparaîtront après vos pleins.
            </Text>
          ) : (
            monthly.map((m) => (
              <Pressable key={m.month} onPress={() => selectMonth(m.month)} style={styles.barRow}>
                <Text
                  style={{
                    color: selectedMonth === m.month ? colors.accent : colors.textSecondary,
                    width: 64,
                    fontSize: 12,
                    fontWeight: selectedMonth === m.month ? '700' : '400',
                  }}
                >
                  {m.month.slice(5)}/{m.month.slice(2, 4)}
                </Text>
                <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        backgroundColor:
                          selectedMonth === m.month ? colors.accent : colors.primary,
                        width: `${Math.max(4, (m.spent / maxMonth) * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={{ color: colors.text, width: 64, textAlign: 'right', fontSize: 12 }}>
                  {formatEuro(m.spent)}
                </Text>
              </Pressable>
            ))
          )}
          {selectedMonth && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>
                Détail {selectedMonth} — {formatEuro(
                  monthly.find((x) => x.month === selectedMonth)?.spent || 0
                )}
              </Text>
              {monthFillUps.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Aucun plein ce mois.</Text>
              ) : (
                monthFillUps.map((f) => (
                  <View
                    key={f.id}
                    style={{
                      paddingVertical: 8,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '600' }}>
                      {new Date(f.date).toLocaleDateString(locale)} · {f.liters.toFixed(1)} L ·{' '}
                      {formatEuro(f.totalCost)}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {formatPerLiter(f.pricePerLiter)}
                      {f.note ? ` · ${f.note}` : ''}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </Card>

        {/* Lieux */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, { color: colors.text, marginBottom: 0 }]}>Lieux</Text>
          <Button
            title="+ Lieu"
            variant="outline"
            onPress={() => router.push('/place/add' as never)}
            style={{ paddingVertical: 8, paddingHorizontal: 12 }}
          />
        </View>
        <Card>
          {places.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>
              Ajoutez Domicile, Travail, ou d&apos;autres lieux récurrents.
            </Text>
          ) : (
            places.map((p) => (
              <Pressable
                key={p.id}
                onLongPress={() =>
                  confirm('Supprimer', `Supprimer « ${p.name} » ?`, async () => {
                    await deletePlace(p.id);
                    await loadExtra();
                  }, 'Supprimer')
                }
                style={[styles.placeRow, { borderBottomColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    {KIND_LABEL[p.kind] || p.kind} — {p.name}
                  </Text>
                  {!!p.address && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{p.address}</Text>
                  )}
                </View>
              </Pressable>
            ))
          )}
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 8 }}>
            Appui long pour supprimer un lieu.
          </Text>
        </Card>

        {/* Trajets réguliers */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, { color: colors.text, marginBottom: 0 }]}>
            Trajets réguliers
          </Text>
          <Button
            title="+ Trajet"
            variant="outline"
            onPress={() => router.push('/place/route' as never)}
            style={{ paddingVertical: 8, paddingHorizontal: 12 }}
          />
        </View>
        <Card>
          {routes.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>
              Ex. Domicile → Travail, jours / semaine, vacances. Tap = vacances, long = supprimer.
            </Text>
          ) : (
            routes.map((r) => {
              const from = places.find((p) => p.id === r.fromPlaceId);
              const to = places.find((p) => p.id === r.toPlaceId);
              const today = new Date().toISOString().slice(0, 10);
              const onVac =
                r.isOnVacation && (!r.vacationUntil || r.vacationUntil >= today);
              const days = r.workDaysPerWeek || r.timesPerWeek;
              return (
                <Pressable
                  key={r.id}
                  onLongPress={() =>
                    confirm('Supprimer', `Supprimer « ${r.name} » ?`, async () => {
                      await deleteRecurringRoute(r.id);
                      await loadExtra();
                    }, 'Supprimer')
                  }
                  onPress={() =>
                    confirm(
                      onVac ? 'Reprendre ?' : 'Mettre en vacances ?',
                      onVac
                        ? 'Réactiver l’estimation pour ce trajet ?'
                        : 'Pause estimation (congés) jusqu’à nouvel ordre ?',
                      async () => {
                        await updateRecurringRoute(r.id, {
                          isOnVacation: !onVac,
                          vacationUntil: !onVac
                            ? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
                            : null,
                        });
                        await loadExtra();
                      },
                      onVac ? 'Reprendre' : 'Vacances'
                    )
                  }
                  style={[styles.placeRow, { borderBottomColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      {r.name}
                      {onVac ? ' · en vacances' : ''}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {from?.name || '?'} → {to?.name || '?'} · {r.distanceKm} km · {days}{' '}
                      j/sem.
                      {onVac && r.vacationUntil ? ` · reprise ${r.vacationUntil}` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
          {activeVehicle && routes.length > 0 && (
            <Text style={{ color: colors.accent, marginTop: 10, fontWeight: '600' }}>
              Estimation mensuelle trajets réguliers : ~{formatEuro(projected)}
            </Text>
          )}
        </Card>

        {/* Prix carburant */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, { color: colors.text, marginBottom: 0 }]}>
            Prix carburant (zone)
          </Text>
          <Button
            title="Actualiser"
            variant="secondary"
            loading={fuelLoading}
            onPress={loadFuelPrices}
            style={{ paddingVertical: 8, paddingHorizontal: 12 }}
          />
        </View>
        <Card>
          {!!fuelError && <Text style={{ color: colors.danger, marginBottom: 8 }}>{fuelError}</Text>}
          {!stations.length && !fuelError && (
            <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>
              Chargez les stations les moins chères près de vous (open data gouvernemental).
            </Text>
          )}
          {stations.map((s) => {
            const fuelKey =
              activeVehicle?.fuelType === 'diesel'
                ? 'gazole'
                : activeVehicle?.fuelType === 'gpl'
                  ? 'gplc'
                  : 'e10';
            const price = s.prices[fuelKey];
            return (
              <Pressable
                key={s.id}
                style={[styles.placeRow, { borderBottomColor: colors.border }]}
                onPress={() =>
                  router.push({
                    pathname: '/fillup/station' as never,
                    params: {
                      name: s.name,
                      address: `${s.address} ${s.city}`.trim(),
                      lat: String(s.latitude),
                      lon: String(s.longitude),
                      price: String(price ?? ''),
                      fuelKey,
                    },
                  } as never)
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{s.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    {s.address} {s.city} · {s.distanceKm} km
                  </Text>
                </View>
                <Text style={{ color: colors.accent, fontWeight: '700' }}>
                  {price != null ? formatPerLiter(price) : '—'}
                </Text>
              </Pressable>
            );
          })}
          {stations.length > 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 8 }}>
              Tap = trajet vers la station (plein optionnel). Tri par {fuelLabel(
                activeVehicle?.fuelType === 'diesel'
                  ? 'gazole'
                  : activeVehicle?.fuelType === 'gpl'
                    ? 'gplc'
                    : 'e10'
              )}
              .
            </Text>
          )}
        </Card>

        {/* Budgets */}
        <Text style={[styles.section, { color: colors.text }]}>Budgets</Text>
        {budgetStatuses.length === 0 ? (
          <Card>
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
              Aucun budget. Créez-en un pour suivre vos dépenses.
            </Text>
          </Card>
        ) : (
          budgetStatuses.map((item: BudgetStatus) => {
            const isOver = item.percentUsed > 100;
            const statusColor = isOver
              ? colors.danger
              : item.percentUsed > 80
                ? colors.warning
                : colors.success;
            return (
              <Card key={item.budget.id} style={{ marginBottom: 12 }}>
                <View style={styles.budgetHeader}>
                  <Text style={[styles.budgetName, { color: colors.text }]}>
                    {item.budget.name}
                  </Text>
                  <Text style={{ color: statusColor, fontWeight: '700', fontSize: 20 }}>
                    {item.percentUsed.toFixed(0)}%
                  </Text>
                </View>
                <ProgressBar percent={item.percentUsed} color={statusColor} height={10} />
                <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
                  {formatEuro(item.spent)} / {formatEuro(item.budget.amount)} — reste{' '}
                  {formatEuro(item.remaining)}
                </Text>
                <Button
                  title="Supprimer"
                  variant="outline"
                  onPress={() =>
                    confirm(
                      'Supprimer',
                      `Supprimer « ${item.budget.name} » ?`,
                      async () => {
                        await deleteBudget(item.budget.id);
                        await refresh();
                      },
                      'Supprimer'
                    )
                  }
                  style={{ marginTop: 10 }}
                />
              </Card>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background }]}>
        <Button title="Nouveau budget" onPress={() => router.push('/budget/add')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 120 },
  infoCard: { marginBottom: 16 },
  infoTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  infoText: { fontSize: 14, lineHeight: 20 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  barTrack: { flex: 1, height: 10, borderRadius: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  budgetName: { fontSize: 17, fontWeight: '700' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
});
