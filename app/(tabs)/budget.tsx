import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useLocale } from '@/context/LocaleContext';
import { useTheme } from '@/hooks/useTheme';
import { Card, ProgressBar } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { formatEuro, getActiveMonthlyAllocation } from '@/lib/calculations';
import { currentMonthKey, formatMonthChip, formatMonthLabel, monthKeyFromDate } from '@/lib/dates';
import {
  deleteBudget,
  deletePlace,
  deleteRecurringRoute,
  getFillUps,
  getPlaces,
  getRecurringRoutes,
} from '@/lib/database';
import {
  fetchCheapestStations,
  fuelLabel,
  isFrenchFuelOpenDataAvailable,
  type FuelStationPrice,
} from '@/lib/fuelPrices';
import { forwardGeocode, reverseGeocode } from '@/lib/geocode';
import { getCurrentLocation } from '@/lib/locationService';
import { confirm } from '@/lib/notify';
import type { BudgetStatus, FillUp, Place, RecurringRoute } from '@/types';

const FUEL_ZONE_KEY = 'gasoil_fuel_zone';

type FuelZoneMode = 'gps' | 'custom';
type FuelZone = {
  mode: FuelZoneMode;
  latitude?: number;
  longitude?: number;
  label?: string;
  radiusKm?: number;
};

const KIND_LABEL: Record<string, string> = {
  home: 'Domicile',
  work: 'Travail',
  other: 'Autre',
  station: 'Station',
};

export default function BudgetScreen() {
  const { budgetStatuses, activeVehicle, vehicles, refresh } = useApp();
  const { colors } = useTheme();
  const { countryCode, formatPerLiter, locale } = useLocale();
  const [refreshing, setRefreshing] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<RecurringRoute[]>([]);
  const [monthly, setMonthly] = useState<{ month: string; spent: number }[]>([]);
  const [monthlyByVehicle, setMonthlyByVehicle] = useState<
    { month: string; vehicleId: number; spent: number }[]
  >([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthFillUps, setMonthFillUps] = useState<FillUp[]>([]);
  const [stations, setStations] = useState<FuelStationPrice[]>([]);
  const [fuelLoading, setFuelLoading] = useState(false);
  const [fuelError, setFuelError] = useState('');
  const [fuelZone, setFuelZone] = useState<FuelZone>({ mode: 'gps', radiusKm: 12 });
  const [zoneQuery, setZoneQuery] = useState('');
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [zoneHint, setZoneHint] = useState('Autour de votre position GPS');

  const persistFuelZone = async (z: FuelZone) => {
    setFuelZone(z);
    await AsyncStorage.setItem(FUEL_ZONE_KEY, JSON.stringify(z));
  };

  const loadExtra = useCallback(async () => {
    const [p, r, allFills] = await Promise.all([
      getPlaces(),
      getRecurringRoutes(activeVehicle?.id),
      getFillUps(),
    ]);
    setPlaces(p);
    setRoutes(r);

    const monthMap = new Map<string, number>();
    const byVehicle: { month: string; vehicleId: number; spent: number }[] = [];
    const vehMap = new Map<string, number>();
    for (const f of allFills) {
      const month = monthKeyFromDate(f.date);
      monthMap.set(month, (monthMap.get(month) || 0) + f.totalCost);
      const vk = `${month}:${f.vehicleId}`;
      vehMap.set(vk, (vehMap.get(vk) || 0) + f.totalCost);
    }
    const m = [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, spent]) => ({ month, spent }));
    const mv = [...vehMap.entries()].map(([k, spent]) => {
      const [month, vid] = k.split(':');
      return { month, vehicleId: Number(vid), spent };
    });
    setMonthly(m);
    setMonthlyByVehicle(mv);

    const current = currentMonthKey();
    setSelectedMonth((prev) => {
      if (prev && m.some((x) => x.month === prev)) return prev;
      if (m.some((x) => x.month === current)) return current;
      return m[m.length - 1]?.month || current;
    });
    const pick =
      (selectedMonth && m.some((x) => x.month === selectedMonth) && selectedMonth) ||
      (m.some((x) => x.month === current) ? current : null) ||
      m[m.length - 1]?.month;
    if (pick) {
      const fills = await getFillUps(activeVehicle?.id);
      setMonthFillUps(fills.filter((f) => monthKeyFromDate(f.date) === pick));
    }
  }, [activeVehicle?.id]);

  const selectMonth = async (month: string) => {
    setSelectedMonth(month);
    const fills = await getFillUps(activeVehicle?.id);
    setMonthFillUps(fills.filter((f) => monthKeyFromDate(f.date) === month));
  };

  useFocusEffect(
    useCallback(() => {
      loadExtra();
      // Prix stations = position GPS réelle (ou zone choisie), pas les trajets
      void (async () => {
        try {
          const raw = await AsyncStorage.getItem(FUEL_ZONE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as FuelZone;
            if (parsed?.mode === 'gps' || parsed?.mode === 'custom') {
              setFuelZone({
                mode: parsed.mode,
                latitude: parsed.latitude,
                longitude: parsed.longitude,
                label: parsed.label,
                radiusKm: parsed.radiusKm ?? 12,
              });
              await loadFuelPrices(parsed);
              return;
            }
          }
        } catch {
          /* ignore */
        }
        await loadFuelPrices({ mode: 'gps', radiusKm: 12 });
      })();
    }, [loadExtra])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await loadExtra();
    await loadFuelPrices(fuelZone);
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

  const loadFuelPrices = async (zoneOverride?: FuelZone) => {
    const zone = zoneOverride ?? fuelZone;
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
      let lat: number | null = null;
      let lon: number | null = null;
      let hint = '';

      if (zone.mode === 'custom' && zone.latitude != null && zone.longitude != null) {
        lat = zone.latitude;
        lon = zone.longitude;
        hint = `Zone choisie : ${zone.label || 'point personnalisé'}`;
      } else {
        const loc = await getCurrentLocation();
        if (!loc) {
          setFuelError(
            'Impossible d’obtenir votre position GPS. Activez la localisation, ou choisissez une zone spécifique ci‑dessous.'
          );
          setZoneHint('Position GPS indisponible');
          setFuelLoading(false);
          return;
        }
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;
        const placeName = await reverseGeocode(lat, lon);
        hint = placeName
          ? `Autour de vous · ${placeName}`
          : `Autour de vous · GPS ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        // garde le mode GPS mémorisé (sans coords figées)
        if (zone.mode !== 'gps') {
          await persistFuelZone({ mode: 'gps', radiusKm: zone.radiusKm ?? 12 });
        }
      }

      setZoneHint(hint);
      const radiusKm = zone.radiusKm ?? 12;
      const list = await fetchCheapestStations({
        latitude: lat,
        longitude: lon,
        radiusKm,
        fuel: activeVehicle?.fuelType || 'diesel',
        limit: 8,
        countryCode,
      });
      setStations(list);
      if (!list.length) {
        setFuelError(`Aucune station dans un rayon de ${radiusKm} km autour de cette zone.`);
      }
    } catch (e) {
      setFuelError(e instanceof Error ? e.message : 'Erreur API prix');
    } finally {
      setFuelLoading(false);
    }
  };

  const useGpsZone = async () => {
    const next: FuelZone = { mode: 'gps', radiusKm: fuelZone.radiusKm ?? 12 };
    await persistFuelZone(next);
    setShowZonePicker(false);
    await loadFuelPrices(next);
  };

  const useCustomCoords = async (lat: number, lon: number, label: string) => {
    const next: FuelZone = {
      mode: 'custom',
      latitude: lat,
      longitude: lon,
      label,
      radiusKm: fuelZone.radiusKm ?? 12,
    };
    await persistFuelZone(next);
    setShowZonePicker(false);
    setZoneQuery('');
    await loadFuelPrices(next);
  };

  const searchCustomZone = async () => {
    const q = zoneQuery.trim();
    if (q.length < 2) {
      setFuelError('Saisissez une ville ou une adresse (ex. Rennes, Thorigné-Fouillard).');
      return;
    }
    setFuelLoading(true);
    setFuelError('');
    try {
      const hit = await forwardGeocode(q);
      if (!hit) {
        setFuelError('Zone introuvable. Essayez une autre ville ou adresse.');
        setFuelLoading(false);
        return;
      }
      await useCustomCoords(hit.latitude, hit.longitude, hit.label);
    } catch (e) {
      setFuelError(e instanceof Error ? e.message : 'Recherche zone impossible');
      setFuelLoading(false);
    }
  };

  const setRadius = async (km: number) => {
    const next = { ...fuelZone, radiusKm: km };
    await persistFuelZone(next);
    await loadFuelPrices(next);
  };

  const maxMonth = Math.max(...monthly.map((m) => m.spent), 1);
  const projected = estimateMonthlyFromRoutes();
  const monthlyAllocation = getActiveMonthlyAllocation(budgetStatuses, activeVehicle?.id);
  const globalStatus = budgetStatuses.find((s) => s.budget.vehicleId == null);
  const calendarMonth = currentMonthKey();
  const currentMonthSpent = monthly.find((m) => m.month === calendarMonth)?.spent ?? 0;
  const lastSpendMonth =
    [...monthly].reverse().find((m) => m.spent > 0)?.month || calendarMonth;
  const currentRemaining = Math.max(0, monthlyAllocation - currentMonthSpent);
  const overBudget = monthlyAllocation > 0 && currentMonthSpent > monthlyAllocation;
  const statusColor = overBudget
    ? colors.danger
    : currentMonthSpent > monthlyAllocation * 0.8 && monthlyAllocation > 0
      ? colors.warning
      : colors.success;

  const vehicleName = (id: number) => vehicles.find((v) => v.id === id)?.name || `Véhicule #${id}`;

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
        {monthlyAllocation > 0 && (
          <Card style={{ marginBottom: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
              {formatMonthLabel(calendarMonth)}
              {globalStatus ? ` · ${globalStatus.budget.name}` : ''}
            </Text>
            <Text style={{ color: statusColor, fontWeight: '800', fontSize: 28, marginTop: 4, letterSpacing: -0.5 }}>
              {overBudget
                ? `Dépassé de ${formatEuro(currentMonthSpent - monthlyAllocation)}`
                : `Il reste ${formatEuro(currentRemaining)}`}
            </Text>
            <Text style={{ color: colors.text, marginTop: 4, fontSize: 14 }}>
              {formatEuro(currentMonthSpent)} dépensés sur {formatEuro(monthlyAllocation)}
            </Text>
            <ProgressBar
              percent={monthlyAllocation > 0 ? (currentMonthSpent / monthlyAllocation) * 100 : 0}
              color={statusColor}
              height={12}
            />
            {currentMonthSpent <= 0 && lastSpendMonth !== calendarMonth && (
              <Text style={{ color: colors.textSecondary, marginTop: 8, fontSize: 13 }}>
                Pas encore de plein en {formatMonthLabel(calendarMonth).toLowerCase()}. Dernier mois
                actif : {formatMonthLabel(lastSpendMonth)} (
                {formatEuro(monthly.find((x) => x.month === lastSpendMonth)?.spent || 0)}).
              </Text>
            )}
            {vehicles.length > 0 && (
              <View style={{ marginTop: 12, gap: 6 }}>
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
                  Répartition ce mois
                </Text>
                {vehicles.map((v) => {
                  const vSpent =
                    monthlyByVehicle.find(
                      (x) => x.month === calendarMonth && x.vehicleId === v.id
                    )?.spent ?? 0;
                  const share =
                    currentMonthSpent > 0 ? Math.round((vSpent / currentMonthSpent) * 100) : 0;
                  return (
                    <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: colors.textSecondary, width: 90, fontSize: 12 }} numberOfLines={1}>
                        {v.name}
                      </Text>
                      <View style={[styles.barTrack, { backgroundColor: colors.border, flex: 1 }]}>
                        <View
                          style={{
                            height: '100%',
                            borderRadius: 6,
                            backgroundColor: v.id === activeVehicle?.id ? colors.accent : colors.primary,
                            width: `${Math.min(100, monthlyAllocation > 0 ? (vSpent / monthlyAllocation) * 100 : 0)}%`,
                          }}
                        />
                      </View>
                      <Text style={{ color: colors.text, width: 88, textAlign: 'right', fontSize: 11 }}>
                        {formatEuro(vSpent)}
                        {share > 0 ? ` (${share}%)` : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        )}
        <Card>
          {monthly.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>
              Aucun plein enregistré — les barres apparaîtront après vos pleins.
            </Text>
          ) : (
            monthly.map((m) => {
              const alloc = monthlyAllocation || maxMonth;
              const pct = alloc > 0 ? Math.min(100, (m.spent / alloc) * 100) : 0;
              const over = m.spent > alloc && alloc > 0;
              const left = Math.max(0, alloc - m.spent);
              return (
                <Pressable key={m.month} onPress={() => selectMonth(m.month)} style={styles.barRow}>
                  <Text
                    style={{
                      color: selectedMonth === m.month ? colors.accent : colors.textSecondary,
                      width: 64,
                      fontSize: 11,
                      fontWeight: selectedMonth === m.month ? '700' : '400',
                    }}
                    numberOfLines={1}
                  >
                    {formatMonthChip(m.month)}
                  </Text>
                  <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          backgroundColor: over
                            ? colors.danger
                            : selectedMonth === m.month
                              ? colors.accent
                              : colors.primary,
                          width: `${Math.max(4, monthlyAllocation > 0 ? pct : (m.spent / maxMonth) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={{ color: colors.text, width: 92, textAlign: 'right', fontSize: 11 }}>
                    {monthlyAllocation > 0
                      ? `reste ${formatEuro(left)}`
                      : formatEuro(m.spent)}
                  </Text>
                </Pressable>
              );
            })
          )}
          {selectedMonth && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>
                {formatMonthLabel(selectedMonth)} —{' '}
                {formatEuro(monthly.find((x) => x.month === selectedMonth)?.spent || 0)}{' '}
                dépensés
                {monthlyAllocation > 0
                  ? ` · reste ${formatEuro(
                      Math.max(
                        0,
                        monthlyAllocation -
                          (monthly.find((x) => x.month === selectedMonth)?.spent || 0)
                      )
                    )}`
                  : ''}
              </Text>
              {vehicles.length > 1 && (
                <View style={{ marginBottom: 8, gap: 4 }}>
                  {vehicles.map((v) => {
                    const vSpent =
                      monthlyByVehicle.find(
                        (x) => x.month === selectedMonth && x.vehicleId === v.id
                      )?.spent ?? 0;
                    if (vSpent <= 0) return null;
                    return (
                      <Text key={v.id} style={{ color: colors.textSecondary, fontSize: 12 }}>
                        {vehicleName(v.id)} : {formatEuro(vSpent)}
                      </Text>
                    );
                  })}
                </View>
              )}
              {monthFillUps.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Aucun plein ce mois.</Text>
              ) : (
                monthFillUps.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={() => router.push(`/fillup/${f.id}` as never)}
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
                      {' · détails ›'}
                    </Text>
                  </Pressable>
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
              <View
                key={p.id}
                style={[styles.placeRow, { borderBottomColor: colors.border }]}
              >
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/place/edit' as never,
                      params: { id: String(p.id) },
                    } as never)
                  }
                  onLongPress={() =>
                    confirm('Supprimer', `Supprimer « ${p.name} » ?`, async () => {
                      await deletePlace(p.id);
                      await loadExtra();
                    }, 'Supprimer')
                  }
                  style={{ flex: 1 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                        backgroundColor: colors.accent + '22',
                      }}
                    >
                      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>
                        {KIND_LABEL[p.kind] || p.kind}
                      </Text>
                    </View>
                    <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={2}>
                    {p.address?.trim()
                      ? p.address
                      : p.latitude != null
                        ? `${p.latitude.toFixed(5)}, ${p.longitude?.toFixed(5)}`
                        : 'Aucune adresse — taper pour modifier'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
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
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.accent,
                    marginRight: 6,
                  }}
                >
                  <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>Trajet</Text>
                </Pressable>
                <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 12 }}>Édit.</Text>
              </View>
            ))
          )}
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 8 }}>
            Trajet = navigation depuis ta position. Tap le nom = modifier. Appui long = supprimer.
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
              Ex. Domicile → Travail. Tap = modifier. Long = supprimer.
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
                  onPress={() =>
                    router.push({
                      pathname: '/place/route' as never,
                      params: { id: String(r.id) },
                    } as never)
                  }
                  onLongPress={() =>
                    confirm('Supprimer', `Supprimer « ${r.name} » ?`, async () => {
                      await deleteRecurringRoute(r.id);
                      await loadExtra();
                    }, 'Supprimer')
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
                  <Text style={{ color: colors.accent, fontWeight: '700' }}>Édit.</Text>
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

        {/* Prix carburant — GPS réel ou zone choisie (pas les trajets) */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, { color: colors.text, marginBottom: 0 }]}>
            Prix carburant (zone)
          </Text>
          <Button
            title="Actualiser"
            variant="secondary"
            loading={fuelLoading}
            onPress={() => loadFuelPrices()}
            style={{ paddingVertical: 8, paddingHorizontal: 12 }}
          />
        </View>
        <Card>
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 4 }}>
            {zoneHint}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10, lineHeight: 17 }}>
            Les prix sont basés sur votre position GPS réelle à l’ouverture — pas sur vos trajets.
            Vous pouvez aussi cibler une zone précise (ville, adresse ou lieu enregistré).
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <Pressable
              onPress={useGpsZone}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: fuelZone.mode === 'gps' ? colors.accent : colors.card,
              }}
            >
              <Text
                style={{
                  color: fuelZone.mode === 'gps' ? '#fff' : colors.text,
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                Ma position
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowZonePicker((v) => !v)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: fuelZone.mode === 'custom' ? colors.accent : colors.card,
              }}
            >
              <Text
                style={{
                  color: fuelZone.mode === 'custom' ? '#fff' : colors.text,
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                Zone spécifique
              </Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {[5, 10, 12, 20].map((km) => {
              const active = (fuelZone.radiusKm ?? 12) === km;
              return (
                <Pressable
                  key={km}
                  onPress={() => setRadius(km)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: active ? colors.accent : colors.background,
                  }}
                >
                  <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 12 }}>
                    {km} km
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {showZonePicker && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                Choisissez un lieu enregistré ou saisissez une ville / adresse :
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {places
                  .filter((p) => p.latitude != null && p.longitude != null)
                  .map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() =>
                        useCustomCoords(
                          p.latitude!,
                          p.longitude!,
                          p.address?.trim() || p.name || KIND_LABEL[p.kind] || 'Lieu'
                        )
                      }
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 13 }}>
                        {KIND_LABEL[p.kind] || p.kind} · {p.name}
                      </Text>
                    </Pressable>
                  ))}
              </View>
              <Input
                label="Ville ou adresse"
                value={zoneQuery}
                onChangeText={setZoneQuery}
                placeholder="Ex. La Guerche de Bretagne"
              />
              <Button
                title="Utiliser cette zone"
                variant="secondary"
                loading={fuelLoading}
                onPress={searchCustomZone}
              />
            </View>
          )}

          {!!fuelError && <Text style={{ color: colors.danger, marginBottom: 8 }}>{fuelError}</Text>}
          {!stations.length && !fuelError && (
            <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>
              Chargement des stations les moins chères autour de la zone…
            </Text>
          )}
          {stations.map((s, idx) => {
            const fuelKey =
              activeVehicle?.fuelType === 'diesel'
                ? 'gazole'
                : activeVehicle?.fuelType === 'gpl'
                  ? 'gplc'
                  : 'e10';
            const price = s.prices[fuelKey];
            const cheapest = idx === 0;
            return (
              <Pressable
                key={s.id}
                style={[
                  styles.stationRow,
                  {
                    borderColor: cheapest ? colors.accent : colors.border,
                    backgroundColor: cheapest ? colors.accent + '14' : colors.background,
                  },
                ]}
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
                <View
                  style={[
                    styles.rankBadge,
                    { backgroundColor: cheapest ? colors.accent : colors.border },
                  ]}
                >
                  <Text style={{ color: cheapest ? '#fff' : colors.text, fontWeight: '800', fontSize: 12 }}>
                    {idx + 1}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                    {s.name}
                    {cheapest ? ' · moins chère' : ''}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                    {s.city || s.address} · {s.distanceKm != null ? `${s.distanceKm.toFixed(1)} km` : '—'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 16 }}>
                    {price != null ? formatPerLiter(price) : '—'}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Y aller ›</Text>
                </View>
              </Pressable>
            );
          })}
          {stations.length > 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 8 }}>
              Tap = trajet vers la station (plein optionnel). Tri par{' '}
              {fuelLabel(
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
            const vehicleLabel = item.budget.vehicleId
              ? vehicleName(item.budget.vehicleId)
              : 'Tous véhicules';
            return (
              <Card key={item.budget.id} style={{ marginBottom: 12 }}>
                <View style={styles.budgetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.budgetName, { color: colors.text }]}>
                      {item.budget.name}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {vehicleLabel} · {item.budget.period === 'monthly' ? 'Mensuel' : item.budget.period}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: statusColor, fontWeight: '800', fontSize: 24, marginBottom: 4 }}>
                  {item.percentUsed > 100
                    ? `Dépassé de ${formatEuro(item.spent - item.budget.amount)}`
                    : `Il reste ${formatEuro(item.remaining)}`}
                </Text>
                <ProgressBar percent={item.percentUsed} color={statusColor} height={10} />
                <Text style={{ color: colors.textSecondary, marginTop: 8, fontSize: 13 }}>
                  {formatEuro(item.spent)} dépensés sur {formatEuro(item.budget.amount)} (
                  {item.percentUsed.toFixed(0)} %)
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
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  barTrack: { flex: 1, height: 10, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  barFill: { height: '100%', borderRadius: 6 },
  quotaMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    borderLeftWidth: 1,
    opacity: 0.4,
    zIndex: 1,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
