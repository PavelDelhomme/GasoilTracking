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
import * as Location from 'expo-location';
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
  deleteTrip,
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
import { TripHistoryCard } from '@/components/TripHistoryCard';

export default function TripScreen() {
  const { activeVehicle, activeTrip, refresh } = useApp();
  const { colors } = useTheme();
  const mapRef = useRef<TripMapRef>(null);
  const [destination, setDestination] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [history, setHistory] = useState<Trip[]>([]);
  const [pending, setPending] = useState<Trip[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
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
    setHistory(trips.filter((t) => !t.isActive).slice(0, 50));
    setPending(pend);
  }, [activeVehicle]);

  useFocusEffect(
    useCallback(() => {
      loadLists();
      // Si on revient d’un plein pendant pause → reprendre le GPS
      if (activeTrip?.isPaused) {
        /* reste en pause jusqu’à « Reprendre » */
      } else if (activeTrip && !activeTrip.isPaused) {
        void startBackgroundTracking();
      }
    }, [loadLists, activeTrip?.id, activeTrip?.isPaused])
  );

  // GPS live dès l’ouverture de l’onglet
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      const loc = await getCurrentLocation();
      if (loc && !cancelled) {
        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setUserLocation(coords);
        setCurrentRegion({
          ...coords,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        });
      }

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 8,
        },
        (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
          setUserLocation(coords);
          setCurrentRegion((r) => ({
            ...r,
            ...coords,
          }));
        }
      );
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
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
        ? [
            {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              timestamp: Date.now(),
            },
          ]
        : [];

      if (loc) {
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }

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
        isPaused: false,
        status: 'confirmed',
        source: 'gps',
        fillUpId: null,
      });

      const trackingStarted = await startBackgroundTracking();
      if (!trackingStarted) {
        notify(
          'Permission requise',
          'Autorisez la localisation en arrière-plan pour suivre votre trajet.'
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

  const handlePause = async (withFillUp: boolean) => {
    if (!activeTrip) return;
    await stopBackgroundTracking();
    await updateTrip(activeTrip.id, { isPaused: true });
    await refresh();
    if (withFillUp) {
      router.push({
        pathname: '/fillup/add' as never,
        params: { tripId: String(activeTrip.id), fromTrip: '1' },
      });
    } else {
      notify('Pause', 'Suivi GPS en pause. Reprenez quand vous repartez.');
    }
  };

  const handleResume = async () => {
    if (!activeTrip) return;
    await updateTrip(activeTrip.id, { isPaused: false });
    const ok = await startBackgroundTracking();
    await refresh();
    if (!ok) {
      notify('GPS', 'Impossible de relancer le suivi — vérifiez les permissions.');
    } else {
      notify('Reprise', 'Suivi GPS relancé.');
    }
  };

  const handleStopTrip = async () => {
    if (!activeTrip) return;

    confirm('Terminer le trajet', 'Arrêter définitivement le suivi GPS ?', async () => {
      await stopBackgroundTracking();
      await updateTrip(activeTrip.id, {
        isActive: false,
        isPaused: false,
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
      const loc = userLocation || (await getCurrentLocation())?.coords;
      if (loc) {
        const url = openGoogleMapsNavigation(
          loc.latitude + 0.01,
          loc.longitude + 0.01,
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

  const handleDeleteTrip = (trip: Trip) => {
    confirm(
      'Supprimer le trajet',
      `${trip.originName || 'Départ'} → ${trip.destinationName || 'Arrivée'}\nCette action est définitive.`,
      async () => {
        try {
          await deleteTrip(trip.id);
          await refresh();
          await loadLists();
          notify('Supprimé', 'Trajet retiré de l’historique.');
        } catch (e) {
          notify('Erreur', e instanceof Error ? e.message : 'Impossible de supprimer');
        }
      },
      'Supprimer'
    );
  };

  const tripStats =
    activeTrip && activeVehicle
      ? calculateTripStats(activeVehicle, activeTrip.distanceKm, activeTrip.startTime)
      : null;

  const routePoints = activeTrip ? parseRoutePoints(activeTrip.routePoints) : [];
  const paused = Boolean(activeTrip?.isPaused);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.map}>
        <TripMap
          ref={mapRef}
          region={currentRegion}
          routePoints={routePoints}
          accentColor={colors.accent}
          userLocation={userLocation}
          paused={paused}
        />
        {!userLocation && (
          <View style={styles.mapHint} pointerEvents="none">
            <Text style={styles.mapHintText}>Localisation…</Text>
          </View>
        )}
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
            <Card style={{ ...styles.activeTrip, borderColor: paused ? colors.warning : colors.accent }}>
              <View style={styles.tripActiveHeader}>
                <Ionicons
                  name={paused ? 'pause-circle' : 'radio-button-on'}
                  size={16}
                  color={paused ? colors.warning : colors.accent}
                />
                <Text
                  style={[
                    styles.tripActiveTitle,
                    { color: paused ? colors.warning : colors.accent },
                  ]}
                >
                  {paused ? 'Trajet en pause' : 'Trajet en cours · GPS actif'}
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

            {paused ? (
              <>
                <Button title="Reprendre le trajet" onPress={handleResume} style={{ marginBottom: 8 }} />
                <Button
                  title="Faire un plein maintenant"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: '/fillup/add' as never,
                      params: { tripId: String(activeTrip.id), fromTrip: '1' },
                    })
                  }
                  style={{ marginBottom: 8 }}
                />
              </>
            ) : (
              <>
                <Button
                  title="Pause + plein (station)"
                  variant="secondary"
                  onPress={() => handlePause(true)}
                  style={{ marginBottom: 8 }}
                />
                <Button
                  title="Pause (sans plein)"
                  variant="outline"
                  onPress={() => handlePause(false)}
                  style={{ marginBottom: 8 }}
                />
              </>
            )}

            <Button
              title="Ouvrir navigation Google Maps"
              variant="outline"
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
                Véhicule : {activeVehicle.name} — carte OpenStreetMap + suivi dès le démarrage.
                Vous pourrez faire une pause station / plein en cours de route.
              </Text>
              <Input
                label="Destination (optionnel)"
                placeholder="Ex: Paris, Lyon, 12 rue…"
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
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Historique ({history.length})
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Mini-carte avec départ (vert) et arrivée (rouge) · corbeille pour supprimer.
            </Text>
            {history.map((t) => (
              <TripHistoryCard key={t.id} trip={t} onDelete={handleDeleteTrip} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { height: '40%', position: 'relative' },
  mapHint: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  mapHintText: { color: '#fff', fontSize: 12 },
  panel: { flex: 1 },
  panelContent: { padding: 16, paddingBottom: 40 },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  description: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  activeTrip: { marginBottom: 12, borderWidth: 2 },
  tripActiveHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripActiveTitle: { fontSize: 16, fontWeight: '700' },
  destination: { fontSize: 15, marginTop: 4 },
  hint: { fontSize: 13, textAlign: 'left', marginTop: 8, lineHeight: 18, marginBottom: 4 },
  warning: { fontSize: 15, textAlign: 'center' },
  pendingActions: { flexDirection: 'row', gap: 24, marginTop: 10 },
});
