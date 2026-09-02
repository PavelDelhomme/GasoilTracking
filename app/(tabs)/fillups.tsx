import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useLocale } from '@/context/LocaleContext';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { getFillUps } from '@/lib/database';
import {
  formatConsumption,
  formatDistance,
  formatEuro,
  getMonthFillStats,
} from '@/lib/calculations';
import {
  formatDateSlash,
  formatMonthLabel,
  monthKeyFromDate,
} from '@/lib/dates';
import type { FillUp, MonthFillStats } from '@/types';

type ListRow =
  | { type: 'month'; key: string; stats: MonthFillStats; label: string }
  | { type: 'fill'; key: string; fill: FillUp };

const PAGE = 20;

export default function FillUpsScreen() {
  const { activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const { formatPerLiter, locale } = useLocale();
  const [allFillUps, setAllFillUps] = useState<FillUp[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string | 'all'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string | 'all'>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE);

  const loadFillUps = useCallback(async () => {
    const data = await getFillUps(activeVehicle?.id);
    setAllFillUps(data);
  }, [activeVehicle?.id]);

  useEffect(() => {
    void loadFillUps();
    setVisibleCount(PAGE);
    setSelectedYear('all');
    setSelectedMonth('all');
  }, [loadFillUps]);

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const f of allFillUps) set.add(String(new Date(f.date).getFullYear()));
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [allFillUps]);

  const months = useMemo(() => {
    const keys = new Set<string>();
    for (const f of allFillUps) {
      const y = String(new Date(f.date).getFullYear());
      if (selectedYear !== 'all' && y !== selectedYear) continue;
      keys.add(monthKeyFromDate(f.date));
    }
    return [...keys]
      .sort((a, b) => b.localeCompare(a))
      .map((key) => ({
        key,
        label: formatMonthLabel(key),
        stats: getMonthFillStats(allFillUps, key),
      }));
  }, [allFillUps, selectedYear]);

  const filtered = useMemo(() => {
    return allFillUps.filter((f) => {
      const y = String(new Date(f.date).getFullYear());
      const mk = monthKeyFromDate(f.date);
      if (selectedYear !== 'all' && y !== selectedYear) return false;
      if (selectedMonth !== 'all' && mk !== selectedMonth) return false;
      return true;
    });
  }, [allFillUps, selectedYear, selectedMonth]);

  const periodStats = useMemo(() => {
    if (selectedMonth !== 'all') return getMonthFillStats(allFillUps, selectedMonth);
    const keys = new Set(filtered.map((f) => monthKeyFromDate(f.date)));
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
      monthKey: selectedYear === 'all' ? 'all' : selectedYear,
      count: filtered.length,
      totalCost,
      totalLiters,
      avgPricePerLiter: totalLiters > 0 ? totalCost / totalLiters : 0,
      avgConsumption:
        consumptions.length > 0
          ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length
          : null,
      totalDistanceKm,
    } satisfies MonthFillStats;
  }, [allFillUps, filtered, selectedMonth, selectedYear]);

  const rows = useMemo(() => {
    const slice = filtered.slice(0, visibleCount);
    const out: ListRow[] = [];
    let lastMonth = '';
    for (const fill of slice) {
      const mk = monthKeyFromDate(fill.date);
      if (mk !== lastMonth) {
        lastMonth = mk;
        out.push({
          type: 'month',
          key: `m-${mk}`,
          label: formatMonthLabel(mk),
          stats: getMonthFillStats(allFillUps, mk),
        });
      }
      out.push({ type: 'fill', key: `f-${fill.id}`, fill });
    }
    return out;
  }, [filtered, visibleCount, allFillUps]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await loadFillUps();
    setRefreshing(false);
  };

  const chip = (
    active: boolean,
    label: string,
    sub: string | undefined,
    onPress: () => void
  ) => (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.card,
          borderColor: active ? colors.accent : colors.border,
        },
      ]}
    >
      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 13 }}>
        {label}
      </Text>
      {!!sub && (
        <Text
          style={{
            color: active ? 'rgba(255,255,255,0.85)' : colors.textSecondary,
            fontSize: 11,
            marginTop: 2,
          }}
        >
          {sub}
        </Text>
      )}
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filtersBar}
      >
        {years.length > 1 &&
          chip(selectedYear === 'all', 'Toutes années', undefined, () => {
            setSelectedYear('all');
            setSelectedMonth('all');
            setVisibleCount(PAGE);
          })}
        {years.map((y) =>
          chip(selectedYear === y, y, undefined, () => {
            setSelectedYear(y);
            setSelectedMonth('all');
            setVisibleCount(PAGE);
          })
        )}
      </ScrollView>

      {months.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          style={styles.filtersBar}
        >
          {chip(selectedMonth === 'all', 'Tous mois', `${filtered.length}`, () => {
            setSelectedMonth('all');
            setVisibleCount(PAGE);
          })}
          {months.map((m) => {
            const short = m.label.replace(/\s+\d{4}$/, '');
            return chip(
              selectedMonth === m.key,
              short,
              formatEuro(m.stats.totalCost),
              () => {
                setSelectedMonth(m.key);
                setVisibleCount(PAGE);
              }
            );
          })}
        </ScrollView>
      )}

      {periodStats.count > 0 && (
        <Card style={styles.summary}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            {selectedMonth !== 'all'
              ? formatMonthLabel(selectedMonth)
              : selectedYear !== 'all'
                ? `Année ${selectedYear}`
                : 'Tous les pleins'}
          </Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryValue, { color: colors.accent }]}>
                {formatEuro(periodStats.totalCost)}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                Dépensé · {periodStats.count} plein{periodStats.count > 1 ? 's' : ''}
              </Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {periodStats.totalLiters.toFixed(1)} L
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                Volume
              </Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {periodStats.avgPricePerLiter > 0
                  ? formatPerLiter(periodStats.avgPricePerLiter)
                  : '—'}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                Prix moyen
              </Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {periodStats.avgConsumption != null && activeVehicle
                  ? formatConsumption(periodStats.avgConsumption, activeVehicle.fuelType)
                  : periodStats.totalDistanceKm > 0
                    ? formatDistance(periodStats.totalDistanceKm)
                    : '—'}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                {periodStats.avgConsumption != null ? 'Conso. moy.' : 'Km saisis'}
              </Text>
            </View>
          </View>
        </Card>
      )}

      <FlatList
        style={styles.listFlex}
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={() => {
          if (visibleCount < filtered.length) {
            setVisibleCount((c) => Math.min(c + PAGE, filtered.length));
          }
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <Card style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {activeVehicle
                ? 'Aucun plein pour cette période'
                : 'Sélectionnez un véhicule pour voir les pleins'}
            </Text>
          </Card>
        }
        renderItem={({ item }) => {
          if (item.type === 'month') {
            if (selectedMonth !== 'all') return null;
            return (
              <View style={styles.monthHead}>
                <Text style={[styles.monthTitle, { color: colors.text }]}>{item.label}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  {formatEuro(item.stats.totalCost)}
                </Text>
              </View>
            );
          }
          const fill = item.fill;
          return (
            <View
              style={[
                styles.fillRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.fillTop}>
                <View>
                  <Text style={[styles.fillDate, { color: colors.text }]}>
                    {formatDateSlash(fill.date)}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {fill.isFull ? 'Plein complet' : 'Plein partiel'}
                  </Text>
                </View>
                <Text style={[styles.fillCost, { color: colors.accent }]}>
                  {formatEuro(fill.totalCost)}
                </Text>
              </View>
              <View style={[styles.fillMeta, { borderTopColor: colors.border }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  {fill.liters.toFixed(2)} L
                </Text>
                <Text style={{ color: colors.textSecondary }}>·</Text>
                <Text style={{ color: colors.textSecondary }}>
                  {formatPerLiter(fill.pricePerLiter)}
                </Text>
                <Text style={{ color: colors.textSecondary }}>·</Text>
                <Text style={{ color: colors.textSecondary }}>
                  {fill.odometer != null
                    ? `${fill.odometer.toLocaleString(locale)} km`
                    : fill.distanceSinceLastKm != null
                      ? `+${fill.distanceSinceLastKm.toFixed(0)} km`
                      : 'km N/D'}
                </Text>
              </View>
              {!!fill.note && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8 }}>
                  {fill.note}
                </Text>
              )}
            </View>
          );
        }}
      />

      <View style={[styles.footer, { backgroundColor: colors.background }]}>
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
  container: { flex: 1, paddingBottom: 88 },
  filtersBar: { maxHeight: 56, flexGrow: 0 },
  filters: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' },
  chip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 72,
  },
  summary: { marginHorizontal: 12, marginBottom: 4, paddingVertical: 12 },
  summaryTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  summaryCell: { width: '50%', paddingVertical: 6, paddingRight: 8 },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  summaryLabel: { fontSize: 11, marginTop: 2 },
  listFlex: { flex: 1 },
  list: { padding: 12, paddingBottom: 24 },
  empty: { alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  monthHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  monthTitle: { fontSize: 16, fontWeight: '800' },
  fillRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  fillTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  fillDate: { fontSize: 16, fontWeight: '700' },
  fillCost: { fontSize: 18, fontWeight: '800' },
  fillMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
});
