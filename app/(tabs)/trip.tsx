import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Platform,
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
  averageSpeedKmh,
  calculateTripStats,
  formatEuro,
  formatDistance,
  parseRoutePoints,
} from '@/lib/calculations';
import { applyTripFuelBurn } from '@/lib/fuelLevel';
import { notify, confirm } from '@/lib/notify';
import { TripHistoryCard } from '@/components/TripHistoryCard';
import { reverseGeocode, tripPlaceLabel } from '@/lib/geocode';

type TripTab = 'live' | 'history';
/** free = suivi GPS sans destination ; nav = avec destination */
type StartMode = 'free' | 'nav';

type GeoCoords = { latitude: number; longitude: number };

export default function TripScreen() {
  const { activeVehicle, activeTrip, refresh } = useApp();
  const { colors } = useTheme();
  const mapRef = useRef<TripMapRef>(null);
  const [tab, setTab] = useState<TripTab>('live');
  const [startMode, setStartMode] = useState<StartMode>('free');
  const [destination, setDestination] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [history, setHistory] = useState<Trip[]>([]);
  const [pending, setPending] = useState<Trip[]>([]);
  const [userLocation, setUserLocation] = useState<GeoCoords | null>(null);
  const [currentRegion, setCurrentRegion] = useState({
    latitude: 48.8566,
    longitude: 2.3522,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const [liveOriginLabel, setLiveOriginLabel] = useState('');
  const [liveDestLabel, setLiveDestLabel] = useState('');
  const isWeb = Platform.OS === 'web';

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
      if (activeTrip && !activeTrip.isPaused) {
        void startBackgroundTracking();
      }
    }, [loadLists, activeTrip?.id, activeTrip?.isPaused])
  );

  useEffect(() => {
    let cancelled = false;
    let nativeSub: { remove: () => void } | null = null;
    let webWatch: number | null = null;

    (async () => {
      const loc = await getCurrentLocation();
      if (loc && !cancelled) {
        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setUserLocation(coords);
        setCurrentRegion({ ...coords, latitudeDelta: 0.04, longitudeDelta: 0.04 });
      }

      if (isWeb) {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        webWatch = navigator.geolocation.watchPosition(
          (pos) => {
            const coords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            setUserLocation(coords);
            setCurrentRegion((r) => ({ ...r, ...coords }));
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 3000 }
        );
        return;
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        nativeSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 8 },
          (pos) => {
            const coords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            setUserLocation(coords);
            setCurrentRegion((r) => ({ ...r, ...coords }));
          }
        );
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      nativeSub?.remove();
      if (webWatch != null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(webWatch);
      }
    };
  }, [isWeb]);

  useEffect(() => {
    if (activeTrip) {
      const points = parseRoutePoints(activeTrip.routePoints);
      if (points.length > 0) {
        mapRef.current?.fitToCoordinates(
          points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
          { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
        );
      }
    }
  }, [activeTrip?.routePoints]);

  useEffect(() => {
    if (!activeTrip) {
      setLiveOriginLabel('');
      setLiveDestLabel('');
      return;
    }
    const pts = parseRoutePoints(activeTrip.routePoints);
    setLiveOriginLabel(tripPlaceLabel(activeTrip.originName, pts[0] || null, 'origin'));
    setLiveDestLabel(
      tripPlaceLabel(
        activeTrip.destinationName || destination,
        pts.length > 1 ? pts[pts.length - 1] : userLocation,
        'destination'
      )
    );
  }, [activeTrip, destination, userLocation]);

  const handleStartTrip = async () => {
    if (!activeVehicle) {
      notify('Erreur', 'Sélectionnez un véhicule avant de démarrer un trajet.');
      return;
    }
    if (startMode === 'nav' && !destination.trim()) {
      notify('Destination', 'Indiquez une destination, ou choisissez « Suivi libre ».');
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

      const originName = loc
        ? (await reverseGeocode(loc.coords.latitude, loc.coords.longitude).catch(() => null)) ||
          'Position de départ'
        : undefined;

      const destName =
        startMode === 'nav' ? destination.trim() : undefined;

      await createTrip({
        vehicleId: activeVehicle.id,
        startTime: new Date().toISOString(),
        endTime: null,
        distanceKm: 0,
        estimatedFuelUsed: 0,
        estimatedCost: 0,
        routePoints: JSON.stringify(startPoint),
        originName,
        destinationName: destName,
        isActive: true,
        isPaused: false,
        status: 'confirmed',
        source: 'gps',
        fillUpId: null,
        note: startMode === 'free'
          ? isWeb
            ? 'Suivi GPS web (onglet ouvert)'
            : 'Suivi GPS libre (arrière-plan)'
          : undefined,
      });

      if (originName) setLiveOriginLabel(originName);
      if (destName) setLiveDestLabel(destName);

      const trackingStarted = await startBackgroundTracking();
      if (!trackingStarted) {
        notify(
          'Permission requise',
          isWeb
            ? 'Autorisez la localisation dans le navigateur (Safari / Chrome) pour enregistrer le trajet.'
            : 'Autorisez la localisation « toujours » / arrière-plan pour tracer même hors premier plan.'
        );
      } else {
        notify(
          'Suivi démarré',
          isWeb
            ? startMode === 'free'
              ? 'GPS actif — gardez l’onglet / l’app ouverte pendant le trajet.'
              : `Direction : ${destName} — gardez l’app ouverte pour le suivi.`
            : startMode === 'free'
              ? 'GPS actif en arrière-plan — km & vitesse enregistrés sans destination.'
              : `Direction : ${destName}`
        );
      }

      if (startMode === 'nav' && destName) {
        try {
          await Linking.openURL(openGoogleMapsSearch(destName));
        } catch {
          /* ignore */
        }
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
    notify(
      ok ? 'Reprise' : 'GPS',
      ok
        ? isWeb
          ? 'Suivi GPS relancé — gardez l’app ouverte.'
          : 'Suivi GPS relancé (y compris en arrière-plan).'
        : 'Vérifiez les permissions localisation.'
    );
  };

  const handleStopTrip = async () => {
    if (!activeTrip) return;

    confirm('Terminer le trajet', 'Arrêter le suivi GPS ?', async () => {
      await stopBackgroundTracking();
      const pts = parseRoutePoints(activeTrip.routePoints);
      const last = pts.length > 0 ? pts[pts.length - 1] : userLocation;

      let destName = activeTrip.destinationName?.trim();
      if (!destName && last) {
        destName =
          (await reverseGeocode(last.latitude, last.longitude).catch(() => null)) ||
          'Lieu d’arrivée';
      }
      if (!destName) destName = 'Lieu d’arrivée';

      let originName = activeTrip.originName?.trim();
      if (!originName && pts[0]) {
        originName =
          (await reverseGeocode(pts[0].latitude, pts[0].longitude).catch(() => null)) ||
          'Lieu de départ';
      }

      const durationMin =
        (Date.now() - new Date(activeTrip.startTime).getTime()) / 60000;
      const speed = averageSpeedKmh(activeTrip.distanceKm, durationMin);
      const noteParts = [
        activeTrip.note,
        speed > 0 ? `Vitesse moy. ${speed.toFixed(0)} km/h` : null,
      ].filter(Boolean);

      await updateTrip(activeTrip.id, {
        isActive: false,
        isPaused: false,
        endTime: new Date().toISOString(),
        status: 'confirmed',
        originName: originName || activeTrip.originName,
        destinationName: destName,
        note: noteParts.join(' · ') || undefined,
      });
      if (activeVehicle && activeTrip.distanceKm > 0) {
        await applyTripFuelBurn(activeVehicle, activeTrip.distanceKm);
      }
      if (activeTrip.distanceKm > 0) {
        await addTrackedKm(activeTrip.vehicleId, activeTrip.distanceKm);
      }
      setLiveOriginLabel('');
      setLiveDestLabel('');
      setDestination('');
      await refresh();
      await loadLists();
      setTab('history');
      notify(
        'Trajet terminé',
        `${originName || 'Départ'} → ${destName} · ${formatDistance(activeTrip.distanceKm)}`
      );
    }, 'Terminer');
  };

  const handleOpenGoogleMaps = async () => {
    if (destination.trim()) {
      await Linking.openURL(openGoogleMapsSearch(destination));
      return;
    }
    const loc = userLocation || (await getCurrentLocation())?.coords;
    if (loc) {
      await Linking.openURL(
        openGoogleMapsNavigation(loc.latitude + 0.01, loc.longitude + 0.01, 'Destination')
      );
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
    const pts = parseRoutePoints(trip.routePoints);
    const o = tripPlaceLabel(trip.originName, pts[0], 'origin');
    const d = tripPlaceLabel(
      trip.destinationName,
      pts.length > 1 ? pts[pts.length - 1] : null,
      'destination'
    );
    confirm(
      'Supprimer le trajet',
      `${o} → ${d}`,
      async () => {
        await deleteTrip(trip.id);
        await refresh();
        await loadLists();
        notify('Supprimé', 'Trajet retiré.');
      },
      'Supprimer'
    );
  };

  const openDetail = (trip: Trip) => router.push(`/trip/${trip.id}` as never);

  const tripStats =
    activeTrip && activeVehicle
      ? calculateTripStats(activeVehicle, activeTrip.distanceKm, activeTrip.startTime)
      : null;
  const avgSpeed =
    activeTrip && tripStats
      ? averageSpeedKmh(activeTrip.distanceKm, tripStats.durationMinutes)
      : 0;

  const routePoints = activeTrip ? parseRoutePoints(activeTrip.routePoints) : [];
  const paused = Boolean(activeTrip?.isPaused);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.segments, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setTab('live')}
          style={[
            styles.segment,
            tab === 'live' && { borderBottomColor: colors.accent, borderBottomWidth: 3 },
          ]}
        >
          <Text style={{ color: tab === 'live' ? colors.accent : colors.textSecondary, fontWeight: '700' }}>
            Trajet
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('history')}
          style={[
            styles.segment,
            tab === 'history' && { borderBottomColor: colors.accent, borderBottomWidth: 3 },
          ]}
        >
          <Text
            style={{
              color: tab === 'history' ? colors.accent : colors.textSecondary,
              fontWeight: '700',
            }}
          >
            Historique{history.length ? ` (${history.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'live' ? (
        <>
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
                title="Manuel"
                variant="outline"
                onPress={() => router.push('/trip/add' as never)}
                style={{ flex: 1 }}
              />
              <Button
                title="Import"
                variant="secondary"
                onPress={() => router.push('/trip/import' as never)}
                style={{ flex: 1 }}
              />
            </View>

            {!activeVehicle ? (
              <Card>
                <Text style={[styles.warning, { color: colors.warning }]}>
                  Sélectionnez un véhicule pour démarrer un trajet.
                </Text>
              </Card>
            ) : activeTrip ? (
              <>
                <Card
                  style={{
                    ...styles.activeTrip,
                    borderColor: paused ? colors.warning : colors.accent,
                  }}
                >
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
                      {paused ? 'Pause' : 'GPS actif (arrière-plan OK)'}
                    </Text>
                  </View>
                  <Text style={[styles.placeLine, { color: colors.success }]}>
                    Départ : {liveOriginLabel || '…'}
                  </Text>
                  <Text style={[styles.placeLine, { color: colors.accent }]}>
                    Arrivée :{' '}
                    {activeTrip.destinationName
                      ? liveDestLabel
                      : 'Suivi libre (sans destination fixe)'}
                  </Text>
                </Card>

                <View style={styles.statsRow}>
                  <StatCard label="Distance" value={formatDistance(activeTrip.distanceKm)} />
                  <StatCard
                    label="Vitesse moy."
                    value={avgSpeed > 0 ? `${avgSpeed.toFixed(0)} km/h` : '—'}
                  />
                </View>
                <View style={styles.statsRow}>
                  <StatCard
                    label="Carburant est."
                    value={`${activeTrip.estimatedFuelUsed.toFixed(2)} L`}
                  />
                  <StatCard
                    label="Durée"
                    value={`${Math.floor(tripStats?.durationMinutes ?? 0)} min`}
                  />
                </View>

                {paused ? (
                  <>
                    <Button title="Reprendre" onPress={handleResume} style={{ marginBottom: 8 }} />
                    <Button
                      title="Faire un plein"
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
                      title="Pause + plein"
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
                <Button title="Terminer le trajet" variant="danger" onPress={handleStopTrip} />
              </>
            ) : (
              <>
                <Card>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Mode de démarrage
                  </Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    Véhicule : {activeVehicle.name}. Le suivi GPS continue en arrière-plan (notification).
                  </Text>

                  <Pressable
                    onPress={() => setStartMode('free')}
                    style={[
                      styles.modeCard,
                      {
                        borderColor: startMode === 'free' ? colors.accent : colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '800' }}>
                      Suivi libre (recommandé)
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                      Pas de destination obligatoire — trace km, vitesse moyenne et conso estimée
                      même hors premier plan.
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setStartMode('nav')}
                    style={[
                      styles.modeCard,
                      {
                        borderColor: startMode === 'nav' ? colors.accent : colors.border,
                        backgroundColor: colors.card,
                        marginTop: 10,
                      },
                    ]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '800' }}>
                      Avec destination / navigation
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                      Indiquez une arrivée ; ouvre Maps pour naviguer + suit le GPS dans l’app.
                    </Text>
                  </Pressable>

                  {startMode === 'nav' && (
                    <View style={{ marginTop: 12 }}>
                      <Input
                        label="Destination"
                        placeholder="Bureau, adresse…"
                        value={destination}
                        onChangeText={setDestination}
                      />
                    </View>
                  )}
                </Card>

                <Button
                  title={
                    startMode === 'free'
                      ? 'Démarrer le suivi GPS libre'
                      : 'Démarrer + ouvrir navigation'
                  }
                  onPress={handleStartTrip}
                  loading={isStarting}
                  style={{ marginBottom: 8 }}
                />
                {startMode === 'nav' && (
                  <Button
                    title="Ouvrir Google Maps seulement"
                    variant="outline"
                    onPress={handleOpenGoogleMaps}
                  />
                )}
              </>
            )}
          </ScrollView>
        </>
      ) : (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          {!activeVehicle ? (
            <Card>
              <Text style={[styles.warning, { color: colors.warning }]}>
                Sélectionnez un véhicule pour l’historique.
              </Text>
            </Card>
          ) : (
            <>
              {pending.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    À valider ({pending.length})
                  </Text>
                  {pending.map((t) => {
                    const pts = parseRoutePoints(t.routePoints);
                    const o = tripPlaceLabel(t.originName, pts[0], 'origin');
                    const d = tripPlaceLabel(
                      t.destinationName,
                      pts.length > 1 ? pts[pts.length - 1] : null,
                      'destination'
                    );
                    return (
                      <Card key={t.id} style={{ marginTop: 10 }}>
                        <TouchableOpacity onPress={() => openDetail(t)}>
                          <Text style={{ color: colors.text, fontWeight: '700' }}>
                            {o} → {d}
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.pendingActions}>
                          <TouchableOpacity onPress={() => validateTrip(t, 'confirmed')}>
                            <Text style={{ color: colors.success, fontWeight: '700' }}>Valider</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => validateTrip(t, 'rejected')}>
                            <Text style={{ color: colors.danger, fontWeight: '700' }}>Ignorer</Text>
                          </TouchableOpacity>
                        </View>
                      </Card>
                    );
                  })}
                </View>
              )}

              <Text style={[styles.sectionTitle, { color: colors.text }]}>Trajets réalisés</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                Adresses départ / arrivée · touchez pour le détail carte.
              </Text>
              {history.length === 0 ? (
                <Card style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
                    Aucun trajet terminé.
                  </Text>
                </Card>
              ) : (
                history.map((t) => (
                  <TripHistoryCard
                    key={t.id}
                    trip={t}
                    onPress={openDetail}
                    onDelete={handleDeleteTrip}
                  />
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segments: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  map: { height: '36%', position: 'relative' },
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
  description: { fontSize: 14, marginBottom: 12, lineHeight: 20 },
  modeCard: { borderWidth: 2, borderRadius: 14, padding: 14 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  activeTrip: { marginBottom: 12, borderWidth: 2 },
  tripActiveHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tripActiveTitle: { fontSize: 16, fontWeight: '700' },
  placeLine: { fontSize: 14, fontWeight: '600', marginTop: 4, lineHeight: 20 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  warning: { fontSize: 15, textAlign: 'center' },
  pendingActions: { flexDirection: 'row', gap: 24, marginTop: 10 },
});
