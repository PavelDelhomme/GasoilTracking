import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { useLocale } from '@/context/LocaleContext';
import { useTheme } from '@/hooks/useTheme';
import { SimpleFab } from '@/components/SpeedDialFab';
import { getFillUps } from '@/lib/database';
import {
  formatConsumption,
  formatDistance,
  formatEuro,
  getMonthFillStats,
} from '@/lib/calculations';
import { formatDateSlash, monthKeyFromDate, currentMonthKey, formatMonthChip, formatMonthLabel, formatRelativeDay } from '@/lib/dates';
import { ProgressBar } from '@/components/Card';
import { Button } from '@/components/Button';
import type { FillUp, MonthFillStats } from '@/types';

const PAGE = 25;

export default function FillUpsScreen() {
  const { activeVehicle, vehicles, budgetStatuses, refresh } = useApp();
  const { colors } = useTheme();
  const { formatPerLiter, locale } = useLocale();
  const [allFillUps, setAllFillUps] = useState<FillUp[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | 'all'>('all');
  const [filterVehicleId, setFilterVehicleId] = useState<number | 'all' | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [initialized, setInitialized] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');

  const effectiveVehicleFilter =
    filterVehicleId === null ? activeVehicle?.id ?? 'all' : filterVehicleId;

  const loadFillUps = useCallback(async () => {
    try {
      const data =
        effectiveVehicleFilter === 'all'
          ? await getFillUps()
          : await getFillUps(effectiveVehicleFilter);
      setAllFillUps(data);
      setListError('');
      return data;
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Impossible de charger les pleins.');
      return [] as FillUp[];
    }
  }, [effectiveVehicleFilter]);

  useEffect(() => {
    void (async () => {
      setLoadingList(true);
      try {
        const data = await loadFillUps();
        setVisibleCount(PAGE);
        if (!initialized && data.length > 0) {
          setSelectedMonth(monthKeyFromDate(data[0].date));
          setInitialized(true);
        } else if (!initialized) {
          setSelectedMonth('all');
          setInitialized(true);
        }
      } finally {
        setLoadingList(false);
      }
    })();
  }, [loadFillUps]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      void loadFillUps();
    }, [loadFillUps])
  );

  const monthKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of allFillUps) keys.add(monthKeyFromDate(f.date));
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [allFillUps]);

  const filtered = useMemo(() => {
    if (selectedMonth === 'all') return allFillUps;
    return allFillUps.filter((f) => monthKeyFromDate(f.date) === selectedMonth);
  }, [allFillUps, selectedMonth]);

  const periodStats = useMemo((): MonthFillStats => {
    if (selectedMonth !== 'all') return getMonthFillStats(allFillUps, selectedMonth);
    let totalCost = 0;
    let totalLiters = 0;
    let totalDistanceKm = 0;
    const consumptions: number[] = [];
    for (const f of filtered) {
      totalCost += f.totalCost;
      totalLiters += f.liters;
      if (f.distanceSinceLastKm && f.distanceSinceLastKm > 0 && f.liters > 0) {
        totalDistanceKm += f.distanceSinceLastKm;
        consumptions.push((f.liters / f.distanceSinceLastKm) * 100);
      }
    }
    return {
      monthKey: 'all',
      count: filtered.length,
      totalCost,
      totalLiters,
      avgPricePerLiter: totalLiters > 0 ? totalCost / totalLiters : 0,
      avgConsumption:
        consumptions.length > 0
          ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length
          : null,
      totalDistanceKm,
    };
  }, [allFillUps, filtered, selectedMonth]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  /** Budget mensuel vs dépenses du mois affiché (ou mois courant si « Tout »). */
  const monthBudgetHint = useMemo(() => {
    const month = selectedMonth === 'all' ? currentMonthKey() : selectedMonth;
    const monthly = budgetStatuses.find(
      (s) =>
        s.budget.period === 'monthly' &&
        (s.budget.vehicleId == null || s.budget.vehicleId === activeVehicle?.id)
    );
    if (!monthly) return null;
    // Si on filtre un autre mois, comparer au total de ce mois (pas le spent live du budget)
    const monthSpent =
      selectedMonth === 'all'
        ? monthly.spent
        : allFillUps
            .filter((f) => monthKeyFromDate(f.date) === selectedMonth)
            .reduce((s, f) => s + f.totalCost, 0);
    const amount = monthly.budget.amount;
    const pct = amount > 0 ? (monthSpent / amount) * 100 : 0;
    return { month, amount, spent: monthSpent, pct, name: monthly.budget.name };
  }, [budgetStatuses, selectedMonth, allFillUps, activeVehicle?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await loadFillUps();
    setRefreshing(false);
  };

  const pickMonth = (key: string | 'all') => {
    setSelectedMonth(key);
    setVisibleCount(PAGE);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {vehicles.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsRow}
        >
          <Pressable
            onPress={() => {
              setFilterVehicleId('all');
              setVisibleCount(PAGE);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: effectiveVehicleFilter === 'all' }}
            style={[
              styles.chip,
              {
                backgroundColor: effectiveVehicleFilter === 'all' ? colors.accent : colors.card,
                borderColor: effectiveVehicleFilter === 'all' ? colors.accent : colors.border,
              },
            ]}
          >
            <Text
              style={{
                color: effectiveVehicleFilter === 'all' ? '#fff' : colors.text,
                fontWeight: '800',
                fontSize: 14,
              }}
            >
              Tous véhicules
            </Text>
          </Pressable>
          {vehicles.map((v) => {
            const active = effectiveVehicleFilter === v.id;
            return (
              <Pressable
                key={v.id}
                onPress={() => {
                  setFilterVehicleId(v.id);
                  setVisibleCount(PAGE);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={v.name}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.accent : colors.card,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={{ color: active ? '#fff' : colors.text, fontWeight: '800', fontSize: 14 }}
                  numberOfLines={1}
                >
                  {v.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {monthKeys.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsRow}
        >
          <Pressable
            onPress={() => pickMonth('all')}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedMonth === 'all' }}
            style={[
              styles.chip,
              {
                backgroundColor: selectedMonth === 'all' ? colors.accent : colors.card,
                borderColor: selectedMonth === 'all' ? colors.accent : colors.border,
              },
            ]}
          >
            <Text
              style={{
                color: selectedMonth === 'all' ? '#fff' : colors.text,
                fontWeight: '800',
                fontSize: 15,
              }}
            >
              Tout
            </Text>
          </Pressable>
          {monthKeys.map((key) => {
            const active = selectedMonth === key;
            return (
              <Pressable
                key={key}
                onPress={() => pickMonth(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={formatMonthLabel(key)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.accent : colors.card,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={{ color: active ? '#fff' : colors.text, fontWeight: '800', fontSize: 14 }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {formatMonthChip(key)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {periodStats.count > 0 && (
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            {selectedMonth !== 'all' ? formatMonthLabel(selectedMonth) : 'Tous les pleins'}
          </Text>
          <Text
            style={[
              styles.summaryHero,
              {
                color:
                  monthBudgetHint && monthBudgetHint.pct > 100
                    ? colors.danger
                    : monthBudgetHint && monthBudgetHint.pct > 80
                      ? colors.warning
                      : colors.accent,
              },
            ]}
          >
            {formatEuro(periodStats.totalCost)}
          </Text>
          {monthBudgetHint && (
            <View style={{ marginTop: 8 }}>
              <Text
                style={{
                  color:
                    monthBudgetHint.pct > 100
                      ? colors.danger
                      : monthBudgetHint.pct > 80
                        ? colors.warning
                        : colors.textSecondary,
                  fontWeight: '700',
                  fontSize: 13,
                }}
              >
                {monthBudgetHint.pct > 100
                  ? `Budget « ${monthBudgetHint.name} » dépassé de ${formatEuro(
                      monthBudgetHint.spent - monthBudgetHint.amount
                    )}`
                  : `Budget « ${monthBudgetHint.name} » : ${formatEuro(monthBudgetHint.spent)} / ${formatEuro(
                      monthBudgetHint.amount
                    )} (${monthBudgetHint.pct.toFixed(0)} %)`}
              </Text>
              <ProgressBar
                percent={monthBudgetHint.pct}
                color={
                  monthBudgetHint.pct > 100
                    ? colors.danger
                    : monthBudgetHint.pct > 80
                      ? colors.warning
                      : colors.success
                }
                height={8}
              />
            </View>
          )}
          <Text style={[styles.summarySub, { color: colors.textSecondary }]}>
            {periodStats.count} plein{periodStats.count > 1 ? 's' : ''}
            {' · '}
            {periodStats.totalLiters.toFixed(1)} L
            {periodStats.avgPricePerLiter > 0
              ? ` · moy. ${formatPerLiter(periodStats.avgPricePerLiter)}`
              : ''}
          </Text>
          {(periodStats.avgConsumption != null || periodStats.totalDistanceKm > 0) && (
            <Text style={[styles.summarySub, { color: colors.textSecondary, marginTop: 4 }]}>
              {periodStats.avgConsumption != null && activeVehicle
                ? `Conso ${formatConsumption(periodStats.avgConsumption, activeVehicle.fuelType)}`
                : ''}
              {periodStats.avgConsumption != null && periodStats.totalDistanceKm > 0 ? ' · ' : ''}
              {periodStats.totalDistanceKm > 0 ? formatDistance(periodStats.totalDistanceKm) : ''}
            </Text>
          )}
        </View>
      )}

      {loadingList && allFillUps.length === 0 ? (
        <View style={{ paddingTop: 48, alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Chargement des pleins…</Text>
        </View>
      ) : null}

      <FlatList
        style={styles.listFlex}
        data={visible}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={() => {
          if (visibleCount < filtered.length) {
            setVisibleCount((c) => Math.min(c + PAGE, filtered.length));
          }
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="water-outline" size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {!activeVehicle
                ? 'Sélectionnez un véhicule pour voir les pleins'
                : listError
                  ? listError
                  : allFillUps.length === 0
                    ? 'Aucun plein enregistré'
                    : 'Aucun plein pour cette période'}
            </Text>
            {!activeVehicle && (
              <View style={{ marginTop: 12, alignSelf: 'stretch' }}>
                <Button
                  title="Voir les véhicules"
                  onPress={() => router.push('/(tabs)/vehicles' as never)}
                />
              </View>
            )}
            {!!listError && activeVehicle && (
              <Pressable onPress={() => void loadFillUps()} style={{ marginTop: 10 }}>
                <Text style={{ color: colors.accent, fontWeight: '700' }}>Réessayer</Text>
              </Pressable>
            )}
            {activeVehicle && allFillUps.length === 0 && !listError && (
              <Pressable
                onPress={() => router.push('/fillup/add' as never)}
                style={{
                  marginTop: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.accent,
                }}
              >
                <Text style={{ color: colors.accent, fontWeight: '700' }}>Nouveau plein</Text>
              </Pressable>
            )}
            {activeVehicle && allFillUps.length > 0 && selectedMonth !== 'all' && (
              <View style={{ marginTop: 8, alignItems: 'center', gap: 10 }}>
                <Pressable onPress={() => pickMonth('all')}>
                  <Text style={{ color: colors.accent, fontWeight: '700' }}>Voir tous les pleins</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/fillup/add' as never)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.accent,
                  }}
                >
                  <Text style={{ color: colors.accent, fontWeight: '700' }}>Ou enregistrer un plein</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        renderItem={({ item: fill }) => (
          <Pressable
            onPress={() => router.push(`/fillup/${fill.id}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`Plein du ${formatRelativeDay(fill.date)}, ${fill.liters.toFixed(1)} litres, ${formatEuro(fill.totalCost)}`}
            style={({ pressed }) => [
              styles.fillCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <View style={styles.fillHead}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.fillDate, { color: colors.text }]}>
                  {formatRelativeDay(fill.date)}
                </Text>
                {effectiveVehicleFilter === 'all' && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
                    {vehicles.find((v) => v.id === fill.vehicleId)?.name || `Véhicule #${fill.vehicleId}`}
                  </Text>
                )}
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: fill.isFull ? colors.accent + '22' : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: fill.isFull ? colors.accent : colors.textSecondary,
                      fontSize: 12,
                      fontWeight: '700',
                    }}
                  >
                    {fill.isFull ? 'Plein' : 'Partiel'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.fillCost, { color: colors.accent }]}>
                {formatEuro(fill.totalCost)}
              </Text>
            </View>

            <Text style={[styles.fillLine, { color: colors.text }]}>
              {fill.liters.toFixed(2)} L
              <Text style={{ color: colors.textSecondary }}> · </Text>
              {formatPerLiter(fill.pricePerLiter)}
              {(() => {
                const idx = allFillUps.findIndex((f) => f.id === fill.id);
                const prev = idx >= 0 ? allFillUps[idx + 1] : null;
                if (!prev || !(prev.pricePerLiter > 0) || !(fill.pricePerLiter > 0)) return null;
                const deltaCt = Math.round((fill.pricePerLiter - prev.pricePerLiter) * 1000) / 10;
                if (Math.abs(deltaCt) < 0.05) return null;
                const up = deltaCt > 0;
                return (
                  <Text
                    style={{
                      color: up ? colors.danger : colors.success,
                      fontWeight: '700',
                    }}
                  >
                    {' '}
                    ({up ? '+' : ''}
                    {deltaCt.toFixed(1)} ct/L)
                  </Text>
                );
              })()}
            </Text>

            <View style={styles.fillFoot}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }} numberOfLines={1}>
                {fill.odometer != null
                  ? `Compteur ${Math.round(fill.odometer).toLocaleString(locale)} km`
                  : fill.distanceSinceLastKm != null
                    ? `+${fill.distanceSinceLastKm.toFixed(0)} km depuis le dernier plein`
                    : fill.note || ' '}
                {fill.note && fill.odometer != null ? ` · ${fill.note}` : ''}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
          </Pressable>
        )}
      />

      <SimpleFab
        label="Nouveau plein"
        icon="gas-pump"
        onPress={() => {
          if (!activeVehicle) {
            router.push('/(tabs)/vehicles' as never);
            return;
          }
          router.push('/fillup/add');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chipsScroll: { flexGrow: 0, maxHeight: 64 },
  chipsRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
    flexGrow: 0,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  summaryHero: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  summarySub: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  listFlex: { flex: 1 },
  list: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 120 },
  empty: { alignItems: 'center', padding: 40, gap: 12 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  fillCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  fillHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  fillDate: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  fillCost: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  fillLine: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  fillFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
});
