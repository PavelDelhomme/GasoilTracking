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
import { formatDateSlash, monthKeyFromDate } from '@/lib/dates';
import type { FillUp, MonthFillStats } from '@/types';

const PAGE = 25;

const MONTH_SHORT_FR = [
  'Janv.',
  'Févr.',
  'Mars',
  'Avr.',
  'Mai',
  'Juin',
  'Juil.',
  'Août',
  'Sept.',
  'Oct.',
  'Nov.',
  'Déc.',
];

function monthChipLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const label = MONTH_SHORT_FR[(m || 1) - 1] || ym;
  return `${label} ${String(y).slice(2)}`;
}

function monthTitleFr(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const names = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ];
  return `${names[(m || 1) - 1] || ym} ${y}`;
}

export default function FillUpsScreen() {
  const { activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const { formatPerLiter, locale } = useLocale();
  const [allFillUps, setAllFillUps] = useState<FillUp[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | 'all'>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [initialized, setInitialized] = useState(false);

  const loadFillUps = useCallback(async () => {
    const data = await getFillUps(activeVehicle?.id);
    setAllFillUps(data);
    return data;
  }, [activeVehicle?.id]);

  useEffect(() => {
    void (async () => {
      const data = await loadFillUps();
      setVisibleCount(PAGE);
      if (!initialized && data.length > 0) {
        setSelectedMonth(monthKeyFromDate(data[0].date));
        setInitialized(true);
      } else if (!initialized) {
        setSelectedMonth('all');
        setInitialized(true);
      }
    })();
  }, [loadFillUps]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {monthKeys.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsRow}
        >
          <Pressable
            onPress={() => pickMonth('all')}
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
                  {monthChipLabel(key)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {periodStats.count > 0 && (
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            {selectedMonth !== 'all' ? monthTitleFr(selectedMonth) : 'Tous les pleins'}
          </Text>
          <Text style={[styles.summaryHero, { color: colors.accent }]}>
            {formatEuro(periodStats.totalCost)}
          </Text>
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
                : allFillUps.length === 0
                  ? 'Aucun plein enregistré'
                  : 'Aucun plein pour cette période'}
            </Text>
            {activeVehicle && allFillUps.length === 0 && (
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
              <Pressable onPress={() => pickMonth('all')} style={{ marginTop: 8 }}>
                <Text style={{ color: colors.accent, fontWeight: '700' }}>Voir tous les pleins</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item: fill }) => (
          <Pressable
            onPress={() => router.push(`/fillup/${fill.id}` as never)}
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
                  {formatDateSlash(fill.date)}
                </Text>
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
                    {fill.isFull ? 'Complet' : 'Partiel'}
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
        disabled={!activeVehicle}
        onPress={() => router.push('/fillup/add')}
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
