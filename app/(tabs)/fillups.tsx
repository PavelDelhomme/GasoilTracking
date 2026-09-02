import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { getFillUps } from '@/lib/database';
import { formatEuro } from '@/lib/calculations';
import {
  formatDateSlash,
  formatMonthLabel,
  monthKeyFromDate,
} from '@/lib/dates';
import type { FillUp } from '@/types';

type ListRow =
  | { type: 'month'; key: string; label: string; total: number; count: number }
  | { type: 'fill'; key: string; fill: FillUp };

const PAGE = 12;

export default function FillUpsScreen() {
  const { activeVehicle, refresh } = useApp();
  const { colors } = useTheme();
  const [allFillUps, setAllFillUps] = useState<FillUp[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string | 'all'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string | 'all'>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const listRef = useRef<FlatList<ListRow>>(null);

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
    const map = new Map<string, { count: number; total: number }>();
    for (const f of allFillUps) {
      const y = String(new Date(f.date).getFullYear());
      if (selectedYear !== 'all' && y !== selectedYear) continue;
      const mk = monthKeyFromDate(f.date);
      const cur = map.get(mk) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += f.totalCost;
      map.set(mk, cur);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, v]) => ({ key, ...v, label: formatMonthLabel(key) }));
  }, [allFillUps, selectedYear]);

  const filtered = useMemo(() => {
    return allFillUps.filter((f) => {
      const d = new Date(f.date);
      const y = String(d.getFullYear());
      const mk = monthKeyFromDate(f.date);
      if (selectedYear !== 'all' && y !== selectedYear) return false;
      if (selectedMonth !== 'all' && mk !== selectedMonth) return false;
      return true;
    });
  }, [allFillUps, selectedYear, selectedMonth]);

  const rows = useMemo(() => {
    const slice = filtered.slice(0, visibleCount);
    const out: ListRow[] = [];
    let lastMonth = '';
    for (const fill of slice) {
      const mk = monthKeyFromDate(fill.date);
      if (mk !== lastMonth) {
        lastMonth = mk;
        const monthFills = filtered.filter((f) => monthKeyFromDate(f.date) === mk);
        out.push({
          type: 'month',
          key: `m-${mk}`,
          label: formatMonthLabel(mk),
          total: monthFills.reduce((s, f) => s + f.totalCost, 0),
          count: monthFills.length,
        });
      }
      out.push({ type: 'fill', key: `f-${fill.id}`, fill });
    }
    return out;
  }, [filtered, visibleCount]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await loadFillUps();
    setRefreshing(false);
  };

  const loadMore = () => {
    if (visibleCount < filtered.length) {
      setVisibleCount((c) => Math.min(c + PAGE, filtered.length));
    }
  };

  const pickYear = (y: string | 'all') => {
    setSelectedYear(y);
    setSelectedMonth('all');
    setVisibleCount(PAGE);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const pickMonth = (m: string | 'all') => {
    setSelectedMonth(m);
    setVisibleCount(PAGE);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const showYearRail = years.length > 1;
  const showMonthRail = months.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        {(showYearRail || showMonthRail) && (
          <ScrollView
            style={[styles.rail, { borderRightColor: colors.border }]}
            contentContainerStyle={styles.railContent}
            showsVerticalScrollIndicator={false}
          >
            {showYearRail && (
              <>
                <Text style={[styles.railTitle, { color: colors.textSecondary }]}>Années</Text>
                <Pressable
                  onPress={() => pickYear('all')}
                  style={[
                    styles.railChip,
                    {
                      backgroundColor: selectedYear === 'all' ? colors.accent : colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selectedYear === 'all' ? '#fff' : colors.text,
                      fontSize: 12,
                      fontWeight: '700',
                      textAlign: 'center',
                    }}
                  >
                    Toutes
                  </Text>
                </Pressable>
                {years.map((y) => (
                  <Pressable
                    key={y}
                    onPress={() => pickYear(y)}
                    style={[
                      styles.railChip,
                      {
                        backgroundColor: selectedYear === y ? colors.accent : colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selectedYear === y ? '#fff' : colors.text,
                        fontSize: 12,
                        fontWeight: '700',
                        textAlign: 'center',
                      }}
                    >
                      {y}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}

            {showMonthRail && (
              <>
                <Text
                  style={[
                    styles.railTitle,
                    { color: colors.textSecondary, marginTop: showYearRail ? 12 : 0 },
                  ]}
                >
                  Mois
                </Text>
                <Pressable
                  onPress={() => pickMonth('all')}
                  style={[
                    styles.railChip,
                    {
                      backgroundColor: selectedMonth === 'all' ? colors.accent : colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selectedMonth === 'all' ? '#fff' : colors.text,
                      fontSize: 11,
                      fontWeight: '700',
                      textAlign: 'center',
                    }}
                  >
                    Tous
                  </Text>
                </Pressable>
                {months.map((m) => {
                  const short = m.label.replace(/\s+\d{4}$/, '');
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => pickMonth(m.key)}
                      style={[
                        styles.railChip,
                        {
                          backgroundColor: selectedMonth === m.key ? colors.accent : colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selectedMonth === m.key ? '#fff' : colors.text,
                          fontSize: 11,
                          fontWeight: '700',
                          textAlign: 'center',
                        }}
                        numberOfLines={2}
                      >
                        {short}
                      </Text>
                      <Text
                        style={{
                          color:
                            selectedMonth === m.key
                              ? 'rgba(255,255,255,0.85)'
                              : colors.textSecondary,
                          fontSize: 10,
                          textAlign: 'center',
                          marginTop: 2,
                        }}
                      >
                        {m.count}
                      </Text>
                    </Pressable>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}

        <FlatList
          ref={listRef}
          style={styles.listFlex}
          data={rows}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
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
          ListFooterComponent={
            visibleCount < filtered.length ? (
              <Text style={{ textAlign: 'center', color: colors.textSecondary, padding: 12 }}>
                Chargement… {visibleCount}/{filtered.length}
              </Text>
            ) : filtered.length > PAGE ? (
              <Text style={{ textAlign: 'center', color: colors.textSecondary, padding: 8, fontSize: 12 }}>
                {filtered.length} plein(s)
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            if (item.type === 'month') {
              return (
                <View style={styles.monthBlock}>
                  <View style={[styles.monthBar, { backgroundColor: colors.border }]} />
                  <View style={styles.monthHeader}>
                    <Text style={[styles.monthTitle, { color: colors.text }]}>{item.label}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {item.count} · {formatEuro(item.total)}
                    </Text>
                  </View>
                  <View style={[styles.monthBar, { backgroundColor: colors.accent, height: 3 }]} />
                </View>
              );
            }
            const fill = item.fill;
            return (
              <Card style={styles.fillUpCard}>
                <View style={styles.fillUpHeader}>
                  <Text style={[styles.date, { color: colors.text }]}>
                    {formatDateSlash(fill.date)}
                  </Text>
                  <Text style={[styles.cost, { color: colors.accent }]}>
                    {formatEuro(fill.totalCost)}
                  </Text>
                </View>
                <View style={styles.fillUpDetails}>
                  <Text style={[styles.detail, { color: colors.textSecondary }]}>
                    {fill.liters.toFixed(2)} L à {fill.pricePerLiter.toFixed(3)} €/L
                  </Text>
                  <Text style={[styles.detail, { color: colors.textSecondary }]}>
                    {fill.odometer != null
                      ? `${fill.odometer.toLocaleString('fr-FR')} km`
                      : fill.distanceSinceLastKm != null
                        ? `+${fill.distanceSinceLastKm.toFixed(0)} km`
                        : 'km N/D'}
                    {fill.isFull ? ' • Plein complet' : ' • Partiel'}
                  </Text>
                </View>
                {fill.note && (
                  <Text style={[styles.note, { color: colors.textSecondary }]}>{fill.note}</Text>
                )}
              </Card>
            );
          }}
        />
      </View>

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
  container: { flex: 1 },
  body: { flex: 1, flexDirection: 'row', paddingBottom: 88 },
  rail: {
    width: 78,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  railContent: { paddingHorizontal: 6, paddingBottom: 12, gap: 6 },
  railTitle: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
    textAlign: 'center',
  },
  railChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  listFlex: { flex: 1 },
  list: { padding: 12, paddingBottom: 24 },
  empty: { alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  monthBlock: { marginTop: 8, marginBottom: 10 },
  monthBar: { height: 1, borderRadius: 1 },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  monthTitle: { fontSize: 15, fontWeight: '800' },
  fillUpCard: { marginBottom: 10 },
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
