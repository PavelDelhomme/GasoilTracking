import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Card, StatCard } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import TripMap from '@/components/TripMap';
import type { TripMapRef } from '@/components/TripMap.types';
import type { Trip } from '@/types';
import {
  createTrip,
  stopActiveTrips,
  updateTrip,
  addTrackedKm,
  getTrips,
  getPendingTrips,
} from '@/lib/database';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  getCurrentLocation,
  openGoogleMapsNavigation,
  openGoogleMapsSearch,
} from '@/lib/locationService';
import {
  calculateTripStats,
  formatEuro,
  formatDistance,
  parseRoutePoints,
} from '@/lib/calculations';
import { notify, confirm } from '@/lib/notify';

export default function TripScreen() {
  const { activeVehicle, activeTrip, refresh } = useApp();
  const { colors } = useTheme();
  const mapRef = useRef<TripMapRef>(null);
  const [destination, setDestination] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [history, setHistory] = useState<Trip[]>([]);
  const [pending, setPending] = useState<Trip[]>([]);
  const [currentRegion, setCurrentRegion] = useState({
    latitude: 48.8566,
    longitude: 2.3522,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const loadLists = useCallback(async () => {
    if (!activeVehicle) {
      setHistory([]);
      setPending([]);
      return;
    }
    const [trips, pend] = await Promise.all([
      getTrips(activeVehicle.id),
      getPendingTrips(activeVehicle.id),
    ]);
    setHistory(trips.filter((t) => !t.isActive).slice(0, 30));
    setPending(pend);
  }, [activeVehicle]);

  useFocusEffect(
    useCallback(() => {
      loadLists();
    }, [loadLists])
  );

  useEffect(() => {
    getCurrentLocation().then((loc) => {
      if (loc) {
        setCurrentRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      }
    });
  }, []);

  useEffect(() => {
    if (activeTrip) {
      const points = parseRoutePoints(activeTrip.routePoints);
      if (points.length > 0 && mapRef.current) {
        mapRef.current.fitToCoordinates(
          points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
          { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
        );
      }
    }
  }, [activeTrip?.routePoints]);

  const handleStartTrip = async () => {
    if (!activeVehicle) {
      notify('Erreur', 'Sélectionnez un véhicule avant de démarrer un trajet.');
      return;
    }

    setIsStarting(true);
    try {
      await stopActiveTrips();
      const loc = await getCurrentLocation();
      const startPoint = loc
        ? [{ latitude: loc.coords.latitude, longitude: loc.coords.longitude, timestamp: Date.now() }]
        : [];

      await createTrip({
        vehicleId: activeVehicle.id,
        startTime: new Date().toISOString(),
        endTime: null,
        distanceKm: 0,
        estimatedFuelUsed: 0,
        estimatedCost: 0,
        routePoints: JSON.stringify(startPoint),
        destinationName: destination || undefined,
        isActive: true,
        status: 'confirmed',
        source: 'gps',
        fillUpId: null,
      });

      const trackingStarted = await startBackgroundTracking();
      if (!trackingStarted) {
        notify(
          'Permission requise',
          'Autorisez la localisation en arrière-plan pour suivre votre trajet pendant la navigation.'
        );
      }

      await refresh();
      await loadLists();
    } catch {
      notify('Erreur', 'Impossible de démarrer le trajet.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopTrip = async () => {
    if (!activeTrip) return;

    confirm('Terminer le trajet', 'Arrêter le suivi GPS ?', async () => {
      await stopBackgroundTracking();
      await updateTrip(activeTrip.id, {
        isActive: false,
        endTime: new Date().toISOString(),
        status: 'confirmed',
      });
      if (activeTrip.distanceKm > 0) {
        await addTrackedKm(activeTrip.vehicleId, activeTrip.distanceKm);
      }
      await refresh();
      await loadLists();
    }, 'Terminer');
  };

  const handleOpenGoogleMaps = async () => {
    if (destination.trim()) {
      const url = openGoogleMapsSearch(destination);
      await Linking.openURL(url);
    } else {
      const loc = await getCurrentLocation();
      if (loc) {
        const url = openGoogleMapsNavigation(
          loc.coords.latitude + 0.01,
          loc.coords.longitude + 0.01,
          destination || 'Destination'
        );
        await Linking.openURL(url);
      }
    }
  };

  const validateTrip = async (trip: Trip, status: 'confirmed' | 'rejected') => {
    await updateTrip(trip.id, { status });
    if (status === 'confirmed' && trip.distanceKm > 0) {
      await addTrackedKm(trip.vehicleId, trip.distanceKm);
    }
    await refresh();
    await loadLists();
  };

  const tripStats =
    activeTrip && activeVehicle
      ? calculateTripStats(activeVehicle, activeTrip.distanceKm, activeTrip.startTime)
      : null;

  const routePoints = activeTrip ? parseRoutePoints(activeTrip.routePoints) : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.map}>
        <TripMap
          ref={mapRef}
          region={currentRegion}
          routePoints={routePoints}
          accentColor={colors.accent}
        />
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <View style={styles.toolbar}>
          <Button
            title="Saisie manuelle"
            variant="outline"
            onPress={() => router.push('/trip/add' as never)}
            style={{ flex: 1 }}
          />
          <Button
            title="Import Maps"
            variant="secondary"
            onPress={() => router.push('/trip/import' as never)}
            style={{ flex: 1 }}
          />
        </View>

        {!activeVehicle ? (
          <Card>
            <Text style={[styles.warning, { color: colors.warning }]}>
              Sélectionnez un véhicule dans l&apos;onglet Véhicules pour démarrer un trajet.
            </Text>
          </Card>
        ) : activeTrip ? (
          <>
            <Card style={{ ...styles.activeTrip, borderColor: colors.accent }}>
              <View style={styles.tripActiveHeader}>
                <Ionicons name="radio-button-on" size={16} color={colors.accent} />
                <Text style={[styles.tripActiveTitle, { color: colors.accent }]}>
                  Trajet en cours
                </Text>
              </View>
              {(activeTrip.originName || activeTrip.destinationName) && (
                <Text style={[styles.destination, { color: colors.text }]}>
                  {activeTrip.originName ? `${activeTrip.originName} → ` : '→ '}
                  {activeTrip.destinationName || '…'}
                </Text>
              )}
            </Card>

            <View style={styles.statsRow}>
              <StatCard label="Distance" value={formatDistance(activeTrip.distanceKm)} />
              <StatCard
                label="Carburant est."
                value={`${activeTrip.estimatedFuelUsed.toFixed(2)} L`}
              />
            </View>
            <View style={styles.statsRow}>
              <StatCard label="Coût est." value={formatEuro(activeTrip.estimatedCost)} />
              <StatCard
                label="Durée"
                value={`${Math.floor(tripStats?.durationMinutes ?? 0)} min`}
              />
            </View>

            <Button
              title="Ouvrir Google Maps"
              variant="secondary"
              onPress={handleOpenGoogleMaps}
              style={{ marginBottom: 8 }}
            />
            <Button title="Terminer le trajet" variant="danger" onPress={handleStopTrip} />
          </>
        ) : (
          <>
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Démarrer un trajet GPS
              </Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>
                Véhicule : {activeVehicle.name} ({activeVehicle.consumptionPer100} L/100km)
              </Text>
              <Input
                label="Destination (optionnel)"
                placeholder="Ex: Paris, Lyon, 12 rue de la Paix..."
                value={destination}
                onChangeText={setDestination}
              />
            </Card>

            <Button
              title="Démarrer le suivi GPS"
              onPress={handleStartTrip}
              loading={isStarting}
              style={{ marginBottom: 8 }}
            />
            <Button
              title="Naviguer avec Google Maps"
              variant="outline"
              onPress={handleOpenGoogleMaps}
            />
          </>
        )}

        {pending.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              À valider ({pending.length})
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>
              Trajets importés / détectés — validez les trajets voiture, ignorez les autres.
            </Text>
            {pending.map((t) => (
              <Card key={t.id} style={{ marginTop: 10 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {t.originName || '?'} → {t.destinationName || '?'}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                  {new Date(t.startTime).toLocaleString('fr-FR')} · {formatDistance(t.distanceKm)} ·{' '}
                  {t.source}
                </Text>
                {!!t.note && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t.note}</Text>
                )}
                <View style={styles.pendingActions}>
                  <TouchableOpacity onPress={() => validateTrip(t, 'confirmed')}>
                    <Text style={{ color: colors.success, fontWeight: '700' }}>Valider</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => validateTrip(t, 'rejected')}>
                    <Text style={{ color: colors.danger, fontWeight: '700' }}>Ignorer</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
          </View>
        )}

        {history.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Historique</Text>
            {history.map((t) => (
              <View
                key={t.id}
                style={[styles.histRow, { borderBottomColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                    {t.originName || 'Départ'} → {t.destinationName || 'Arrivée'}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    {new Date(t.startTime).toLocaleDateString('fr-FR')} ·{' '}
                    {formatDistance(t.distanceKm)} · {formatEuro(t.estimatedCost)}
                    {t.status === 'pending' ? ' · en attente' : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { height: '38%' },
  panel: { flex: 1 },
  panelContent: { padding: 16, paddingBottom: 40 },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  description: { fontSize: 14, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  activeTrip: { marginBottom: 12, borderWidth: 2 },
  tripActiveHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripActiveTitle: { fontSize: 16, fontWeight: '700' },
  destination: { fontSize: 15, marginTop: 4 },
  hint: { fontSize: 13, textAlign: 'left', marginTop: 8, lineHeight: 18, marginBottom: 4 },
  warning: { fontSize: 15, textAlign: 'center' },
  pendingActions: { flexDirection: 'row', gap: 24, marginTop: 10 },
  histRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
