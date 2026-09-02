import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { useLocale } from '@/context/LocaleContext';
import { useTheme } from '@/hooks/useTheme';
import { Card, StatCard } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { TripMiniMap } from '@/components/TripMiniMap';
import {
  calculateRealConsumption,
  formatConsumption,
  formatDistance,
  formatEuro,
  parseRoutePoints,
} from '@/lib/calculations';
import {
  deleteFillUp,
  getFillUpById,
  getFillUps,
  getTripById,
  getVehicleById,
  updateFillUp,
} from '@/lib/database';
import {
  fetchCheapestStations,
  isFrenchFuelOpenDataAvailable,
  isSaneFuelPricePerLiter,
  litersFromTicket,
} from '@/lib/fuelPrices';
import { getCurrentLocation } from '@/lib/locationService';
import { formatDateSlash } from '@/lib/dates';
import { confirm, notify } from '@/lib/notify';
import type { FillUp, Trip, Vehicle } from '@/types';

/** Détail d’un plein : chiffres clairs, note/station, trajet lié, édition légère. */
export default function FillUpDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fillId = Number(id);
  const { colors } = useTheme();
  const { formatPerLiter, countryCode } = useLocale();
  const { refresh } = useApp();

  const [fill, setFill] = useState<FillUp | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [prevFill, setPrevFill] = useState<FillUp | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [isFullDraft, setIsFullDraft] = useState(true);
  const [litersDraft, setLitersDraft] = useState('');
  const [pplDraft, setPplDraft] = useState('');
  const [totalDraft, setTotalDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [livePriceLoading, setLivePriceLoading] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(fillId) || fillId <= 0) {
      setLoading(false);
      return;
    }
    const f = await getFillUpById(fillId);
    setFill(f);
    if (!f) {
      setLoading(false);
      return;
    }
    setNoteDraft(f.note || '');
    setIsFullDraft(f.isFull);
    setLitersDraft(String(f.liters));
    setPplDraft(String(f.pricePerLiter));
    setTotalDraft(String(f.totalCost));

    const [v, all] = await Promise.all([getVehicleById(f.vehicleId), getFillUps(f.vehicleId)]);
    setVehicle(v);

    // Plein précédent chronologique (date plus ancienne)
    const older = all
      .filter((x) => x.id !== f.id && new Date(x.date).getTime() <= new Date(f.date).getTime())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setPrevFill(older[0] || null);

    if (f.tripId) {
      const t = await getTripById(f.tripId);
      setTrip(t);
    } else {
      setTrip(null);
    }
    setLoading(false);
  }, [fillId]);

  useEffect(() => {
    void load();
  }, [load]);

  const consumption = useMemo(() => {
    if (!fill || !prevFill) return null;
    return calculateRealConsumption(prevFill, fill);
  }, [fill, prevFill]);

  const tripPoints = useMemo(
    () => (trip ? parseRoutePoints(trip.routePoints) : []),
    [trip]
  );

  const saveEdits = async () => {
    if (!fill) return;
    const L = parseFloat(litersDraft.replace(',', '.'));
    const P = parseFloat(pplDraft.replace(',', '.'));
    const T = parseFloat(totalDraft.replace(',', '.'));
    if (!Number.isFinite(L) || L <= 0 || !Number.isFinite(P) || P <= 0 || !Number.isFinite(T) || T <= 0) {
      notify('Erreur', 'Litres, prix/L et total doivent être > 0.');
      return;
    }
    if (!isSaneFuelPricePerLiter(P, countryCode)) {
      notify(
        'Prix / L incohérent',
        `${P.toFixed(3)} €/L n’est pas réaliste pour du carburant. Vérifiez le prix à la pompe (~1,5–2,5 €/L).`
      );
      return;
    }
    setSaving(true);
    try {
      await updateFillUp(fill.id, {
        note: noteDraft.trim() || undefined,
        isFull: isFullDraft,
        liters: Math.round(L * 100) / 100,
        pricePerLiter: Math.round(P * 1000) / 1000,
        totalCost: Math.round(T * 100) / 100,
      });
      notify('Plein', 'Modifications enregistrées.');
      setEditing(false);
      await load();
      await refresh();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Échec');
    } finally {
      setSaving(false);
    }
  };

  const applyLiveStationPrice = async () => {
    if (!isFrenchFuelOpenDataAvailable(countryCode)) {
      notify('Prix live', 'Open data stations disponible en France uniquement.');
      return;
    }
    setLivePriceLoading(true);
    try {
      const loc = await getCurrentLocation();
      const lat = loc?.coords.latitude ?? 48.156;
      const lon = loc?.coords.longitude ?? -1.587;
      const list = await fetchCheapestStations({
        latitude: lat,
        longitude: lon,
        radiusKm: 15,
        fuel: vehicle?.fuelType || 'diesel',
        limit: 12,
        countryCode,
      });
      const note = (fill?.note || '').toLowerCase();
      const match =
        list.find((s) => {
          const hay = `${s.name} ${s.address} ${s.city}`.toLowerCase();
          return (
            hay.includes('portail') ||
            hay.includes('thorigné') ||
            hay.includes('thorigne') ||
            (note && hay.includes(note.slice(0, 12)))
          );
        }) || list[0];
      const fuelKey =
        vehicle?.fuelType === 'diesel' ? 'gazole' : vehicle?.fuelType === 'gpl' ? 'gplc' : 'e10';
      const live = match?.prices[fuelKey];
      if (live == null) {
        notify('Prix live', 'Aucun prix gazole trouvé autour de vous.');
        return;
      }
      const total = parseFloat(totalDraft.replace(',', '.')) || fill?.totalCost || 0;
      setPplDraft(live.toFixed(3));
      if (total > 0) setLitersDraft(String(litersFromTicket(total, live)));
      notify(
        'Prix station',
        `${match!.name} · ${live.toFixed(3)} €/L` +
          (total > 0 ? ` → ${litersFromTicket(total, live)} L pour ${formatEuro(total)}` : '')
      );
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Prix live indisponible');
    } finally {
      setLivePriceLoading(false);
    }
  };

  const onDelete = () => {
    if (!fill) return;
    confirm(
      'Supprimer le plein',
      `${formatDateSlash(fill.date)} · ${formatEuro(fill.totalCost)}`,
      async () => {
        await deleteFillUp(fill.id);
        await refresh();
        notify('Supprimé', 'Plein retiré.');
        router.back();
      },
      'Supprimer'
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!fill) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.danger }}>Plein introuvable.</Text>
        <Button title="Retour" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Détail du plein' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.heroDate, { color: colors.textSecondary }]}>
            {formatDateSlash(fill.date)}
            {vehicle ? ` · ${vehicle.name}` : ''}
          </Text>
          <Text style={[styles.heroCost, { color: colors.accent }]}>
            {formatEuro(fill.totalCost)}
          </Text>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: fill.isFull ? colors.success + '22' : colors.warning + '22',
                  borderColor: fill.isFull ? colors.success : colors.warning,
                },
              ]}
            >
              <Text
                style={{
                  color: fill.isFull ? colors.success : colors.warning,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                {fill.isFull ? 'Plein complet' : 'Plein partiel'}
              </Text>
            </View>
          </View>
        </View>

        {/* Chiffres */}
        <View style={styles.statsGrid}>
          <StatCard label="Volume" value={`${fill.liters.toFixed(2)} L`} />
          <StatCard label="Prix / L" value={formatPerLiter(fill.pricePerLiter)} />
          <StatCard
            label={fill.odometer != null ? 'Compteur' : 'Distance'}
            value={
              fill.odometer != null
                ? `${Math.round(fill.odometer).toLocaleString('fr-FR')} km`
                : fill.distanceSinceLastKm != null
                  ? formatDistance(fill.distanceSinceLastKm)
                  : '—'
            }
          />
          <StatCard
            label="Conso. estimée"
            value={
              consumption != null && vehicle
                ? formatConsumption(consumption, vehicle.fuelType)
                : fill.distanceSinceLastKm && fill.distanceSinceLastKm > 0
                  ? formatConsumption(
                      (fill.liters / fill.distanceSinceLastKm) * 100,
                      vehicle?.fuelType || 'diesel'
                    )
                  : '—'
            }
            subtitle={
              consumption != null
                ? 'depuis le plein précédent'
                : fill.distanceSinceLastKm
                  ? 'sur la distance saisie'
                  : undefined
            }
          />
        </View>

        {/* Note / chiffres éditables */}
        <Card style={{ marginTop: 4 }}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Corriger le plein</Text>
            <Pressable onPress={() => setEditing((e) => !e)} hitSlop={8}>
              <Text style={{ color: colors.accent, fontWeight: '700' }}>
                {editing ? 'Annuler' : 'Modifier'}
              </Text>
            </Pressable>
          </View>
          {editing ? (
            <>
              <Input
                label="Litres"
                value={litersDraft}
                onChangeText={(v) => {
                  setLitersDraft(v);
                  const L = parseFloat(v.replace(',', '.'));
                  const P = parseFloat(pplDraft.replace(',', '.'));
                  if (L > 0 && P > 0) setTotalDraft((L * P).toFixed(2));
                }}
                keyboardType="numeric"
              />
              <Input
                label="Prix au litre (€)"
                value={pplDraft}
                onChangeText={(v) => {
                  setPplDraft(v);
                  const P = parseFloat(v.replace(',', '.'));
                  const T = parseFloat(totalDraft.replace(',', '.'));
                  if (P > 0 && T > 0) setLitersDraft((T / P).toFixed(2));
                }}
                keyboardType="numeric"
              />
              <Input
                label="Montant ticket (€)"
                value={totalDraft}
                onChangeText={(v) => {
                  setTotalDraft(v);
                  const T = parseFloat(v.replace(',', '.'));
                  const P = parseFloat(pplDraft.replace(',', '.'));
                  if (T > 0 && P > 0) setLitersDraft((T / P).toFixed(2));
                }}
                keyboardType="numeric"
              />
              <Button
                title="Prix live à la station"
                variant="secondary"
                loading={livePriceLoading}
                onPress={applyLiveStationPrice}
                style={{ marginBottom: 10 }}
              />
              <Input
                label="Note (station, ticket…)"
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="Ex. Total Energies Thorigné"
              />
              <View style={styles.switchRow}>
                <Text style={{ color: colors.text, flex: 1, fontWeight: '600' }}>
                  Plein complet
                </Text>
                <Switch
                  value={isFullDraft}
                  onValueChange={setIsFullDraft}
                  trackColor={{ false: colors.border, true: colors.accent }}
                />
              </View>
              <Button title="Enregistrer" onPress={saveEdits} loading={saving} />
            </>
          ) : (
            <Text style={{ color: fill.note ? colors.text : colors.textSecondary, lineHeight: 20 }}>
              {fill.note?.trim() || 'Aucune note — tapez Modifier pour corriger litres / prix / station.'}
            </Text>
          )}
        </Card>

        {/* Trajet lié */}
        {trip && (
          <Card style={{ marginTop: 12, overflow: 'hidden', padding: 0 }}>
            <Pressable
              onPress={() => router.push(`/trip/${trip.id}` as never)}
              style={{ padding: 14 }}
            >
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Trajet lié</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </View>
              <Text style={{ color: colors.textSecondary, marginBottom: 10, lineHeight: 18 }}>
                {(trip.originName || 'Départ') + ' → ' + (trip.destinationName || 'Arrivée')}
                {' · '}
                {formatDistance(trip.distanceKm)}
              </Text>
              <TripMiniMap
                routePoints={tripPoints}
                originName={trip.originName}
                destinationName={trip.destinationName}
                accentColor={colors.accent}
                height={140}
              />
            </Pressable>
          </Card>
        )}

        {prevFill && (
          <Card style={{ marginTop: 12 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>
              Plein précédent
            </Text>
            <Pressable
              onPress={() => router.push(`/fillup/${prevFill.id}` as never)}
              style={styles.prevRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  {formatDateSlash(prevFill.date)}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {prevFill.liters.toFixed(1)} L · {formatEuro(prevFill.totalCost)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          </Card>
        )}

        <Button
          title="Supprimer ce plein"
          variant="outline"
          onPress={onDelete}
          style={{ marginTop: 20, borderColor: colors.danger }}
        />
        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 40 },
  hero: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  heroDate: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  heroCost: { fontSize: 36, fontWeight: '800', letterSpacing: -0.5 },
  badgeRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  // StatCard has minWidth 140 — force 2-col feel on phone
  // (flex:1 on StatCard already)
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  prevRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
