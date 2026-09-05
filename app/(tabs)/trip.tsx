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
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Card, StatCard } from '@/components/Card';
import { Button } from '@/components/Button';
import TripMap from '@/components/TripMap';
import type { TripMapRef } from '@/components/TripMap.types';
import { PlaceSuggestField } from '@/components/PlaceSuggestField';
import type { Place, Trip } from '@/types';
import {
  createTrip,
  stopActiveTrips,
  updateTrip,
  addTrackedKm,
  getTrips,
  getPendingTrips,
  deleteTrip,
  getPlaces,
  getFillUps,
  updateVehicle,
  getVehicleById,
  purgeSimulatorTrips,
} from '@/lib/database';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  getCurrentLocation,
  openGoogleMapsNavigation,
  openGoogleMapsSearch,
} from '@/lib/locationService';
import {
  appendRoutePoint,
  calculateRouteDistance,
  calculateTripStats,
  compactRoutePointsJson,
  estimateCost,
  formatEuro,
  formatDistance,
  getSinceLastFillStats,
  parseRoutePoints,
} from '@/lib/calculations';
import {
  buildDrivingPoints,
  SIM_HOME,
  SIM_WORK,
} from '@/lib/gpsCarSimulator';
import { applyTripFuelBurn, blendConsumptionLearnFactor } from '@/lib/fuelLevel';
import { askFuelGaugeApprox } from '@/lib/fuelGaugePrompt';
import {
  estimateTripFuelLiters,
  fetchElevationAscentM,
  learnedFactorFromGauge,
} from '@/lib/consumptionModel';
import { fetchDrivingRoute } from '@/lib/roadDistance';
import { forwardGeocode } from '@/lib/geocode';
import { notify, confirm } from '@/lib/notify';
import { TripHistoryCard } from '@/components/TripHistoryCard';
import { reverseGeocode, tripPlaceLabel } from '@/lib/geocode';
import { evaluateGpsSample } from '@/lib/gpsTracking';
import { formatDateSlash } from '@/lib/dates';
import type { SinceLastFillStats } from '@/types';
import type { RoutePoint } from '@/lib/calculations';

type TripTab = 'live' | 'history';
/** free = suivi GPS sans destination ; nav = avec destination */
type StartMode = 'free' | 'nav';

type GeoCoords = { latitude: number; longitude: number };

export default function TripScreen() {
  const params = useLocalSearchParams<{
    mode?: string;
    dest?: string;
    destLat?: string;
    destLon?: string;
    autoStart?: string;
    runSim?: string;
    purgeSim?: string;
  }>();
  const { activeVehicle, activeTrip, refresh } = useApp();
  const { colors } = useTheme();
  const mapRef = useRef<TripMapRef>(null);
  const autoStartDone = useRef(false);
  const [tab, setTab] = useState<TripTab>('live');
  const [startMode, setStartMode] = useState<StartMode>('free');
  const [destination, setDestination] = useState('');
  const [destCoords, setDestCoords] = useState<GeoCoords | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [plannedRoute, setPlannedRoute] = useState<GeoCoords[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [tripStartFuelLiters, setTripStartFuelLiters] = useState<number | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simProgress, setSimProgress] = useState('');
  const simAbort = useRef({ aborted: false });

  const gpsSimEnabled =
    __DEV__ ||
    Constants.expoConfig?.extra?.enableGpsSimulator === true ||
    (Constants.easConfig as { enableGpsSimulator?: boolean } | undefined)?.enableGpsSimulator ===
      true;
  const [history, setHistory] = useState<Trip[]>([]);
  const [pending, setPending] = useState<Trip[]>([]);
  const [sinceFill, setSinceFill] = useState<SinceLastFillStats | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sinceFill'>('all');
  const [userLocation, setUserLocation] = useState<GeoCoords | null>(null);
  const [currentRegion, setCurrentRegion] = useState({
    latitude: 48.8566,
    longitude: 2.3522,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const [liveOriginLabel, setLiveOriginLabel] = useState('');
  const [liveDestLabel, setLiveDestLabel] = useState('');
  const lastMapGps = useRef<RoutePoint | null>(null);
  const isWeb = Platform.OS === 'web';

  const loadLists = useCallback(async () => {
    if (!activeVehicle) {
      setHistory([]);
      setPending([]);
      setSinceFill(null);
      return;
    }
    const [trips, pend, since, pl] = await Promise.all([
      getTrips(activeVehicle.id),
      getPendingTrips(activeVehicle.id),
      getSinceLastFillStats(activeVehicle.id),
      getPlaces(),
    ]);
    setHistory(trips.filter((t) => !t.isActive).slice(0, 50));
    setPending(pend);
    setSinceFill(since);
    setPlaces(pl);
  }, [activeVehicle]);

  useFocusEffect(
    useCallback(() => {
      loadLists();
      if (activeTrip && !activeTrip.isPaused) {
        void startBackgroundTracking();
      }
      const dest = typeof params.dest === 'string' ? params.dest.trim() : '';
      if (dest) {
        setDestination(dest);
        setStartMode('nav');
        setTab('live');
        const lat = params.destLat ? Number(params.destLat) : NaN;
        const lon = params.destLon ? Number(params.destLon) : NaN;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          setDestCoords({ latitude: lat, longitude: lon });
        }
      }
      if (params.mode === 'nav') setStartMode('nav');
    }, [loadLists, activeTrip?.id, activeTrip?.isPaused, params.dest, params.mode, params.destLat, params.destLon])
  );

  useEffect(() => {
    let cancelled = false;
    let nativeSub: { remove: () => void } | null = null;
    let webWatch: number | null = null;

    const trackingLive = !!activeTrip && !activeTrip.isPaused;

    // Pendant un trajet : pas de 2e flux GPS (le FGS suffit). Sinon OOM/ANR.
    if (trackingLive) {
      const pts = parseRoutePoints(activeTrip.routePoints);
      const last = pts.length > 0 ? pts[pts.length - 1] : null;
      if (last) {
        const coords = { latitude: last.latitude, longitude: last.longitude };
        setUserLocation(coords);
        setCurrentRegion((r) => ({ ...r, ...coords }));
      }
      return () => {
        cancelled = true;
      };
    }

    const acceptMapFix = (
      latitude: number,
      longitude: number,
      timestamp: number,
      accuracy?: number | null
    ) => {
      const sample = { latitude, longitude, timestamp, accuracy };
      const verdict = evaluateGpsSample(lastMapGps.current, sample, {
        isFirst: !lastMapGps.current,
      });
      if (!verdict.accept && verdict.reason === 'too_fast') return null;
      if (!verdict.accept && verdict.reason === 'bad_coords') return null;
      if (accuracy != null && accuracy > 80 && lastMapGps.current) {
        return null;
      }
      if (verdict.accept || verdict.reason === 'too_close' || verdict.reason === 'too_soon') {
        if (verdict.accept) {
          lastMapGps.current = {
            latitude,
            longitude,
            timestamp,
            ...(accuracy != null ? { accuracy } : {}),
          };
        }
        return { latitude, longitude };
      }
      if (verdict.reason === 'bad_accuracy' && !lastMapGps.current) {
        lastMapGps.current = { latitude, longitude, timestamp };
        return { latitude, longitude };
      }
      return null;
    };

    (async () => {
      const loc = await getCurrentLocation();
      if (loc && !cancelled) {
        const coords = acceptMapFix(
          loc.coords.latitude,
          loc.coords.longitude,
          loc.timestamp || Date.now(),
          loc.coords.accuracy
        );
        if (coords) {
          setUserLocation(coords);
          setCurrentRegion({ ...coords, latitudeDelta: 0.04, longitudeDelta: 0.04 });
        }
      }

      if (isWeb) {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        webWatch = navigator.geolocation.watchPosition(
          (pos) => {
            const coords = acceptMapFix(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.timestamp || Date.now(),
              pos.coords.accuracy
            );
            if (!coords) return;
            setUserLocation(coords);
            setCurrentRegion((r) => ({ ...r, ...coords }));
          },
          () => {},
          {
            enableHighAccuracy: false,
            maximumAge: 15000,
            timeout: 15000,
          }
        );
        return;
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        nativeSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 15000,
            distanceInterval: 40,
          },
          (pos) => {
            const coords = acceptMapFix(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.timestamp || Date.now(),
              pos.coords.accuracy
            );
            if (!coords) return;
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
  }, [isWeb, activeTrip?.id, activeTrip?.isPaused, activeTrip?.routePoints]);

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
      const gauge = await askFuelGaugeApprox(
        activeVehicle,
        'Niveau d’essence au départ',
        'Indiquez approximativement la jauge pour affiner la conso (passable).'
      );
      const startFuel = gauge.skipped
        ? activeVehicle.estimatedFuelLiters
        : gauge.liters;
      setTripStartFuelLiters(startFuel);

      await stopActiveTrips();
      const loc = await getCurrentLocation({ fresh: true });
      const startPoint = loc
        ? [
            {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              timestamp: Date.now(),
              accuracy: loc.coords.accuracy ?? undefined,
            },
          ]
        : [];

      if (loc) {
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }

      let resolvedDest = destCoords;
      if (startMode === 'nav' && !resolvedDest && destination.trim()) {
        const geo = await forwardGeocode(destination.trim()).catch(() => null);
        if (geo) {
          resolvedDest = { latitude: geo.latitude, longitude: geo.longitude };
          setDestCoords(resolvedDest);
        }
      }

      if (loc && resolvedDest) {
        try {
          const route = await fetchDrivingRoute(
            { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
            resolvedDest
          );
          setPlannedRoute(route.coordinates);
        } catch {
          setPlannedRoute([
            { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
            resolvedDest,
          ]);
        }
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
          : startFuel != null
            ? `Jauge départ ~${startFuel.toFixed(1)} L`
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
              ? 'Suivi en cours — gardez l’onglet ouvert pendant le trajet.'
              : `Direction : ${destName} — gardez l’app ouverte pour le suivi.`
            : startMode === 'free'
              ? 'Suivi en cours (arrière-plan) — km & vitesse enregistrés.'
              : `Direction : ${destName}`
        );
      }

      if (startMode === 'nav' && destName) {
        try {
          if (resolvedDest) {
            await Linking.openURL(
              openGoogleMapsNavigation(resolvedDest.latitude, resolvedDest.longitude, destName)
            );
          } else {
            await Linking.openURL(openGoogleMapsSearch(destName));
          }
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

  useEffect(() => {
    if (params.autoStart !== '1' || autoStartDone.current) return;
    if (!activeVehicle || activeTrip) return;
    if (!destination.trim()) return;
    autoStartDone.current = true;
    void handleStartTrip();
  }, [params.autoStart, destination, activeVehicle?.id, activeTrip?.id]);

  const simAutoDone = useRef(false);
  useEffect(() => {
    if (!gpsSimEnabled) return;
    if (params.runSim !== '1' || simAutoDone.current) return;
    if (!activeVehicle || simRunning) return;
    simAutoDone.current = true;
    setTab('live');
    const t = setTimeout(() => {
      void handleRunCarSimulator();
    }, 600);
    return () => clearTimeout(t);
  }, [params.runSim, activeVehicle?.id, gpsSimEnabled]);

  const purgeAutoDone = useRef(false);
  useEffect(() => {
    if (params.purgeSim !== '1' || purgeAutoDone.current) return;
    purgeAutoDone.current = true;
    void (async () => {
      const n = await purgeSimulatorTrips(activeVehicle?.id);
      await refresh();
      await loadLists();
      notify('Purge test', n > 0 ? `${n} trajet(s) simulateur supprimé(s).` : 'Aucun trajet simulateur.');
    })();
  }, [params.purgeSim, activeVehicle?.id]);

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
    if (isStopping) return;

    setIsStopping(true);
    confirm(
      'Terminer le trajet',
      'Arrêter le suivi GPS ?',
      () => {
        void (async () => {
          try {
            await stopBackgroundTracking();
            await stopActiveTrips();

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

            const vehicle =
              (activeVehicle && (await getVehicleById(activeVehicle.id))) || activeVehicle;
            const ascentM = await fetchElevationAscentM(pts);
            const fuelUsed = vehicle
              ? estimateTripFuelLiters(vehicle, activeTrip.distanceKm, {
                  ascentM,
                  learnedFactor: vehicle.consumptionLearnFactor,
                })
              : activeTrip.estimatedFuelUsed;
            const fills = vehicle ? await getFillUps(vehicle.id) : [];
            const lastFill = [...fills].sort((a, b) => b.date.localeCompare(a.date))[0];
            const priceAtTrip =
              lastFill?.pricePerLiter && lastFill.pricePerLiter > 0
                ? lastFill.pricePerLiter
                : vehicle?.defaultFuelPrice || 0;
            const cost = estimateCost(fuelUsed, priceAtTrip);

            const liveStats = vehicle
              ? calculateTripStats(
                  vehicle,
                  activeTrip.distanceKm,
                  activeTrip.startTime,
                  new Date().toISOString(),
                  activeTrip.routePoints
                )
              : null;
            const speed =
              liveStats && liveStats.movingSpeedKmh > 0
                ? liveStats.movingSpeedKmh
                : liveStats
                  ? (activeTrip.distanceKm / Math.max(liveStats.durationMinutes, 0.01)) * 60
                  : 0;

            let endFuel: number | null = null;
            if (vehicle) {
              const gauge = await askFuelGaugeApprox(
                vehicle,
                'Niveau d’essence à l’arrivée',
                'Comparez avec la jauge pour corriger les prochaines estimations.'
              );
              if (!gauge.skipped) {
                endFuel = gauge.liters;
                const startFuel =
                  tripStartFuelLiters ??
                  (vehicle.estimatedFuelLiters != null
                    ? vehicle.estimatedFuelLiters + fuelUsed
                    : null);
                if (startFuel != null && endFuel != null && startFuel > endFuel) {
                  const drop = startFuel - endFuel;
                  const sample = learnedFactorFromGauge(fuelUsed, drop);
                  await blendConsumptionLearnFactor(vehicle, sample);
                }
                await updateVehicle(vehicle.id, { estimatedFuelLiters: endFuel });
              } else if (activeTrip.distanceKm > 0) {
                await applyTripFuelBurn(vehicle, activeTrip.distanceKm, ascentM);
              }
            }

            const noteParts = [
              activeTrip.note,
              speed > 0 ? `Vitesse moy. ${speed.toFixed(0)} km/h` : null,
              ascentM > 20 ? `D+ ${ascentM} m` : null,
              priceAtTrip > 0
                ? `Essence ~${priceAtTrip.toFixed(3)} €/L · ${formatEuro(cost)}`
                : null,
              endFuel != null ? `Jauge arrivée ~${endFuel.toFixed(1)} L` : null,
            ].filter(Boolean);

            await updateTrip(activeTrip.id, {
              isActive: false,
              isPaused: false,
              endTime: new Date().toISOString(),
              status: 'confirmed',
              originName: originName || activeTrip.originName,
              destinationName: destName,
              estimatedFuelUsed: fuelUsed,
              estimatedCost: cost,
              note: noteParts.join(' · ') || undefined,
            });
            if (activeTrip.distanceKm > 0) {
              await addTrackedKm(activeTrip.vehicleId, activeTrip.distanceKm);
            }
            setLiveOriginLabel('');
            setLiveDestLabel('');
            setDestination('');
            setDestCoords(null);
            setPlannedRoute([]);
            setTripStartFuelLiters(null);
            await refresh();
            await loadLists();
            setTab('history');
            notify(
              'Trajet terminé',
              `${originName || 'Départ'} → ${destName} · ${formatDistance(activeTrip.distanceKm)} · ~${fuelUsed.toFixed(1)} L`
            );
          } catch (e) {
            notify('Erreur', e instanceof Error ? e.message : 'Impossible de terminer le trajet.');
          } finally {
            setIsStopping(false);
          }
        })();
      },
      'Terminer',
      () => setIsStopping(false)
    );
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

  /** Simulateur voiture (tests) — injecte un trajet domicile→Inter à ~72 km/h. */
  const handleRunCarSimulator = async () => {
    if (!activeVehicle || simRunning) return;
    simAbort.current.aborted = false;
    setSimRunning(true);
    setSimProgress('Démarrage sim…');
    try {
      await stopBackgroundTracking();
      await stopActiveTrips();

      const points = buildDrivingPoints(SIM_HOME, SIM_WORK, {
        speedKmh: 72,
        stepMeters: 110,
      });
      setDestCoords(SIM_WORK);
      setDestination('Intermarché La Guerche (sim)');
      setPlannedRoute(points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })));
      setUserLocation(SIM_HOME);
      setCurrentRegion({
        latitude: SIM_HOME.latitude,
        longitude: SIM_HOME.longitude,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35,
      });

      const first = points[0];
      const tripId = await createTrip({
        vehicleId: activeVehicle.id,
        startTime: new Date(first.timestamp).toISOString(),
        endTime: null,
        distanceKm: 0,
        estimatedFuelUsed: 0,
        estimatedCost: 0,
        routePoints: JSON.stringify([
          {
            latitude: first.latitude,
            longitude: first.longitude,
            timestamp: first.timestamp,
          },
        ]),
        originName: 'Domicile (sim)',
        destinationName: 'Intermarché La Guerche (sim)',
        isActive: true,
        isPaused: false,
        status: 'confirmed',
        source: 'gps',
        fillUpId: null,
        note: 'SIMULATEUR — ne pas compter comme trajet réel',
      });
      await refresh();

      // Mode rapide : injecte tout le trajet d’un coup (fiable pour tests Samsung)
      let routeJson = JSON.stringify(
        points.map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          timestamp: p.timestamp,
        }))
      );
      // Repasse par le filtre GPS point à point pour coller au vrai pipeline
      routeJson = JSON.stringify([
        {
          latitude: first.latitude,
          longitude: first.longitude,
          timestamp: first.timestamp,
        },
      ]);
      setSimProgress('Injection GPS…');
      for (let i = 1; i < points.length; i++) {
        if (simAbort.current.aborted) break;
        const point = points[i];
        routeJson = appendRoutePoint(routeJson, {
          latitude: point.latitude,
          longitude: point.longitude,
          timestamp: point.timestamp,
          accuracy: point.accuracy ?? 8,
          speed: point.speed ?? 20,
        });
        if (i % 40 === 0) {
          setSimProgress(`Sim ${i}/${points.length}`);
          setUserLocation({ latitude: point.latitude, longitude: point.longitude });
        }
      }

      if (simAbort.current.aborted) {
        notify('Sim annulée', 'Trajet sim laissé actif — terminez-le ou supprimez-le.');
        return;
      }

      routeJson = compactRoutePointsJson(routeJson);
      const distanceKm = calculateRouteDistance(routeJson);
      const fuelUsed = estimateTripFuelLiters(activeVehicle, distanceKm);
      const cost = estimateCost(fuelUsed, activeVehicle.defaultFuelPrice);
      const stats = calculateTripStats(
        activeVehicle,
        distanceKm,
        new Date(first.timestamp).toISOString(),
        new Date().toISOString(),
        routeJson
      );
      await updateTrip(tripId, {
        routePoints: routeJson,
        distanceKm,
        estimatedFuelUsed: fuelUsed,
        estimatedCost: cost,
        isActive: false,
        isPaused: false,
        endTime: new Date().toISOString(),
        originName: 'Domicile (sim)',
        destinationName: 'Intermarché La Guerche (sim)',
        note: `SIMULATEUR · ${formatDistance(distanceKm)} · ${stats.movingSpeedKmh.toFixed(0)} km/h moy. · ~${fuelUsed.toFixed(1)} L`,
      });
      setUserLocation({
        latitude: points[points.length - 1].latitude,
        longitude: points[points.length - 1].longitude,
      });
      setSimProgress('');
      await refresh();
      await loadLists();
      setTab('history');
      notify(
        'Sim OK',
        `${formatDistance(distanceKm)} · ~${fuelUsed.toFixed(1)} L · ${formatEuro(cost)} · ${stats.movingSpeedKmh.toFixed(0)} km/h — vérifiez l’historique.`
      );
    } catch (e) {
      notify('Sim erreur', e instanceof Error ? e.message : 'Échec simulateur');
    } finally {
      setSimRunning(false);
      setSimProgress('');
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
      ? calculateTripStats(
          activeVehicle,
          activeTrip.distanceKm,
          activeTrip.startTime,
          undefined,
          activeTrip.routePoints
        )
      : null;
  const avgSpeed =
    activeTrip && tripStats
      ? tripStats.movingSpeedKmh > 0
        ? tripStats.movingSpeedKmh
        : (activeTrip.distanceKm / Math.max(tripStats.durationMinutes, 0.01)) * 60
      : 0;

  const routePoints = activeTrip ? parseRoutePoints(activeTrip.routePoints) : [];
  const paused = Boolean(activeTrip?.isPaused);
  /** Pendant trajet : derniers points GPS ; sinon itinéraire prévu */
  const mapRoute =
    routePoints.length > 1
      ? routePoints.slice(-120)
      : plannedRoute.length > 0
        ? plannedRoute
        : routePoints;

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
            Historique
            {pending.length > 0
              ? ` (${pending.length} à valider)`
              : history.length
                ? ` (${history.length})`
                : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'live' ? (
        <>
          <View style={styles.map}>
            <TripMap
              ref={mapRef}
              region={currentRegion}
              routePoints={mapRoute}
              accentColor={colors.accent}
              userLocation={userLocation}
              paused={paused}
              plannedRoute={
                activeTrip && routePoints.length > 1 ? plannedRoute : plannedRoute
              }
              destination={destCoords}
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
                      {paused ? 'En pause' : 'Suivi en cours'}
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
                  <StatCard label="Coût est." value={formatEuro(activeTrip.estimatedCost)} />
                </View>
                <Text style={{ color: colors.textSecondary, marginBottom: 12, fontSize: 13 }}>
                  Durée : {Math.floor(tripStats?.durationMinutes ?? 0)} min
                </Text>

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
                <Button
                  title="Terminer le trajet"
                  variant="danger"
                  onPress={handleStopTrip}
                  disabled={isStopping}
                />
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
                      <PlaceSuggestField
                        label="Destination"
                        placeholder="Maison, adresse, contact…"
                        value={destination}
                        onChangeText={(t) => {
                          setDestination(t);
                          setDestCoords(null);
                        }}
                        places={places}
                        onPickPlace={(p) => {
                          if (p.latitude != null && p.longitude != null) {
                            setDestCoords({ latitude: p.latitude, longitude: p.longitude });
                            if (userLocation) {
                              void fetchDrivingRoute(userLocation, {
                                latitude: p.latitude,
                                longitude: p.longitude,
                              }).then((r) => setPlannedRoute(r.coordinates));
                            }
                          }
                        }}
                        onPickCoords={(c) => {
                          if (Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
                            setDestCoords({ latitude: c.latitude, longitude: c.longitude });
                            if (userLocation) {
                              void fetchDrivingRoute(userLocation, {
                                latitude: c.latitude,
                                longitude: c.longitude,
                              }).then((r) => setPlannedRoute(r.coordinates));
                            }
                          } else if (c.label) {
                            setDestination(c.label);
                            void forwardGeocode(c.label).then((g) => {
                              if (!g) return;
                              setDestCoords({ latitude: g.latitude, longitude: g.longitude });
                              if (userLocation) {
                                void fetchDrivingRoute(userLocation, {
                                  latitude: g.latitude,
                                  longitude: g.longitude,
                                }).then((r) => setPlannedRoute(r.coordinates));
                              }
                            });
                          }
                        }}
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
                {gpsSimEnabled && (
                  <Button
                    title={
                      simRunning
                        ? simProgress || 'Simulation en cours…'
                        : 'Simuler trajet voiture (test)'
                    }
                    variant="outline"
                    onPress={handleRunCarSimulator}
                    loading={simRunning}
                    disabled={simRunning || isStarting}
                    style={{ marginTop: 12 }}
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
                    let when = '';
                    try {
                      const dt = new Date(t.startTime);
                      when = `${formatDateSlash(t.startTime)} · ${dt.toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`;
                    } catch {
                      when = formatDateSlash(t.startTime);
                    }
                    return (
                      <Card key={t.id} style={{ marginTop: 10 }}>
                        <TouchableOpacity onPress={() => openDetail(t)}>
                          <Text style={{ color: colors.text, fontWeight: '700' }}>
                            {o} → {d}
                          </Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                            {when}
                          </Text>
                          <Text style={{ color: colors.accent, fontWeight: '700', marginTop: 6 }}>
                            {formatDistance(t.distanceKm)} · {formatEuro(t.estimatedCost)}
                            {t.estimatedFuelUsed > 0
                              ? ` · ${t.estimatedFuelUsed.toFixed(1)} L`
                              : ''}
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.pendingActions}>
                          <Button
                            title="Valider"
                            onPress={() => validateTrip(t, 'confirmed')}
                            style={{ flex: 1, paddingVertical: 10 }}
                          />
                          <Button
                            title="Ignorer"
                            variant="outline"
                            onPress={() => validateTrip(t, 'rejected')}
                            style={{ flex: 1, paddingVertical: 10 }}
                          />
                        </View>
                      </Card>
                    );
                  })}
                </View>
              )}

              {sinceFill?.lastFill && (
                <Card
                  style={{
                    marginBottom: 14,
                    borderColor: colors.border,
                    borderWidth: 1,
                  }}
                >
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 4 }]}>
                    Depuis le dernier plein
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                    {formatDateSlash(sinceFill.lastFill.date)} ·{' '}
                    {formatEuro(sinceFill.lastFill.totalCost)}
                    {sinceFill.lastFill.isFull ? ' · quasi-plein' : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      {formatDistance(sinceFill.tripKm)}
                    </Text>
                    <Text style={{ color: colors.textSecondary }}>
                      {sinceFill.tripCount} trajet{sinceFill.tripCount > 1 ? 's' : ''}
                    </Text>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      ~{formatEuro(sinceFill.costEst)}
                    </Text>
                    <Text style={{ color: colors.textSecondary }}>
                      ~{sinceFill.fuelUsedEst.toFixed(1)} L
                    </Text>
                  </View>
                </Card>
              )}

              <Text style={[styles.sectionTitle, { color: colors.text }]}>Trajets réalisés</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <Pressable
                  onPress={() => setHistoryFilter('all')}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: historyFilter === 'all' ? colors.accent : colors.border,
                      backgroundColor:
                        historyFilter === 'all' ? colors.accent + '22' : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: historyFilter === 'all' ? colors.accent : colors.text,
                      fontWeight: '700',
                      fontSize: 13,
                    }}
                  >
                    Tout
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setHistoryFilter('sinceFill')}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: historyFilter === 'sinceFill' ? colors.accent : colors.border,
                      backgroundColor:
                        historyFilter === 'sinceFill' ? colors.accent + '22' : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: historyFilter === 'sinceFill' ? colors.accent : colors.text,
                      fontWeight: '700',
                      fontSize: 13,
                    }}
                  >
                    Depuis le dernier plein
                  </Text>
                </Pressable>
              </View>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                Adresses départ / arrivée · touchez pour le détail carte.
              </Text>
              {(() => {
                const fillDate = sinceFill?.lastFill?.date;
                const list =
                  historyFilter === 'sinceFill' && fillDate
                    ? history.filter((t) => t.startTime >= fillDate)
                    : history;
                if (list.length === 0) {
                  return (
                    <Card style={{ marginTop: 12 }}>
                      <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
                        {historyFilter === 'sinceFill'
                          ? 'Aucun trajet depuis le dernier plein.'
                          : 'Aucun trajet terminé.'}
                      </Text>
                    </Card>
                  );
                }
                return list.map((t) => (
                  <TripHistoryCard
                    key={t.id}
                    trip={t}
                    onPress={openDetail}
                    onDelete={handleDeleteTrip}
                  />
                ));
              })()}
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
  pendingActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
});
