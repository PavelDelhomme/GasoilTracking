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
import { FuelGaugeSlider } from '@/components/FuelGaugeSlider';
import {
  calculateRealConsumption,
  consumptionFromLitersAndDistance,
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
import { reapplyFillUpFuelEstimate } from '@/lib/fuelLevel';
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
  const { formatPerLiter, countryCode, moneySymbol } = useLocale();
  const { refresh, vehicles } = useApp();

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
  const [vehicleIdDraft, setVehicleIdDraft] = useState<number | null>(null);
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
    setVehicleIdDraft(f.vehicleId);

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
    if (!fill) return null;
    if (prevFill) {
      const between = calculateRealConsumption(prevFill, fill, vehicle?.fuelType);
      if (between != null) return between;
    }
    return consumptionFromLitersAndDistance(
      fill.liters,
      fill.distanceSinceLastKm,
      vehicle?.fuelType
    );
  }, [fill, prevFill, vehicle?.fuelType]);

  const rawImpliedL100 =
    fill && fill.distanceSinceLastKm && fill.distanceSinceLastKm > 0
      ? (fill.liters / fill.distanceSinceLastKm) * 100
      : null;
  const distanceUnreliable =
    rawImpliedL100 != null &&
    consumption == null &&
    fill != null &&
    fill.distanceSinceLastKm != null &&
    fill.distanceSinceLastKm > 0;

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
        ...(vehicleIdDraft != null ? { vehicleId: vehicleIdDraft } : {}),
      });
      if (vehicle) {
        await reapplyFillUpFuelEstimate(
          vehicle,
          { liters: fill.liters, isFull: fill.isFull },
          { liters: Math.round(L * 100) / 100, isFull: isFullDraft }
        );
      }
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
            label={fill.odometer != null ? 'Compteur' : distanceUnreliable ? 'Km GPS' : 'Distance'}
            value={
              fill.odometer != null
                ? `${Math.round(fill.odometer).toLocaleString('fr-FR')} km`
                : fill.distanceSinceLastKm != null
                  ? formatDistance(fill.distanceSinceLastKm)
                  : '—'
            }
            subtitle={distanceUnreliable ? 'trajets enregistrés (partiel)' : undefined}
          />
          <StatCard
            label="Conso. estimée"
            value={
              consumption != null && vehicle
                ? formatConsumption(consumption, vehicle.fuelType)
                : '—'
            }
            subtitle={
              consumption != null
                ? 'depuis le plein précédent'
                : distanceUnreliable
                  ? 'km GPS incomplets'
                  : fill.distanceSinceLastKm
                    ? 'distance insuffisante'
                    : undefined
            }
          />
        </View>

        {distanceUnreliable ? (
          <Card style={{ marginBottom: 8, borderColor: colors.warning, borderWidth: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>
              Conso non calculable sur ce plein
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
              {fill.liters.toFixed(1)} L pour seulement {formatDistance(fill.distanceSinceLastKm!)}{' '}
              de trajets GPS → ~{rawImpliedL100!.toFixed(0)} L/100 (irréaliste). Il manque des
              trajets entre les deux pleins (ou le compteur). Saisissez le compteur au prochain
              plein pour une vraie conso.
            </Text>
          </Card>
        ) : null}

        {/* Jauge avant / après (plein complet) */}
        {vehicle && fill.isFull && (
          <Card style={{ marginTop: 4, marginBottom: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 4 }]}>
              Réservoir avant → après
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 2 }}>
                  Avant
                </Text>
                <FuelGaugeSlider
                  mini
                  compact
                  requireConfirm={false}
                  disabled
                  tankCapacity={vehicle.tankCapacity}
                  liters={Math.max(0, vehicle.tankCapacity - fill.liters)}
                  onChange={() => {}}
                />
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 2 }}>
                  Après
                </Text>
                <FuelGaugeSlider
                  mini
                  compact
                  requireConfirm={false}
                  disabled
                  tankCapacity={vehicle.tankCapacity}
                  liters={vehicle.tankCapacity}
                  onChange={() => {}}
                />
              </View>
            </View>
          </Card>
        )}

        {/* Note / édition */}
        <Card style={{ marginTop: 4 }}>
          {editing ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 10 }]}>
                Modifier le plein
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>
                Véhicule
              </Text>
              <View style={styles.vehicleRow}>
                {vehicles.map((v) => {
                  const active = vehicleIdDraft === v.id;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => setVehicleIdDraft(v.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.vehicleChip,
                        {
                          backgroundColor: active ? colors.accent : colors.background,
                          borderColor: active ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? '#fff' : colors.text,
                          fontWeight: '700',
                          fontSize: 12,
                        }}
                        numberOfLines={1}
                      >
                        {v.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
                label={`Prix au litre (${moneySymbol})`}
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
                label={`Montant ticket (${moneySymbol})`}
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
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    Plein jusqu’au bouchon
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                    Oui = capacité du réservoir. Non = ajoute les litres au reste.
                  </Text>
                </View>
                <Switch
                  value={isFullDraft}
                  onValueChange={setIsFullDraft}
                  trackColor={{ false: colors.border, true: colors.accent }}
                />
              </View>
              <Button title="Enregistrer" onPress={saveEdits} loading={saving} />
              <Button
                title="Annuler"
                variant="outline"
                onPress={() => setEditing(false)}
                style={{ marginTop: 8 }}
              />
            </>
          ) : (
            <>
              {fill.note?.trim() ? (
                <Text style={{ color: colors.text, lineHeight: 20, fontWeight: '600' }}>
                  {fill.note.trim()}
                </Text>
              ) : (
                <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
                  Aucune note de station.
                </Text>
              )}
            </>
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

        {!editing && (
          <View style={styles.bottomActions}>
            <Pressable
              onPress={() => setEditing(true)}
              style={[styles.bottomBtn, { borderColor: colors.accent, backgroundColor: colors.accent + '14' }]}
              accessibilityRole="button"
              accessibilityLabel="Modifier le plein"
            >
              <Ionicons name="create-outline" size={20} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 15 }}>Modifier</Text>
            </Pressable>
            <Pressable
              onPress={onDelete}
              style={[styles.bottomBtn, { borderColor: colors.danger, backgroundColor: colors.danger + '12' }]}
              accessibilityRole="button"
              accessibilityLabel="Supprimer le plein"
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 15 }}>Supprimer</Text>
            </Pressable>
          </View>
        )}
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
  vehicleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  vehicleChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  prevRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
});
