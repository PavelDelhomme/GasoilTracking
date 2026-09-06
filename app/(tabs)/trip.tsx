import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  ScrollView,
  FlatList,
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
import {
  fetchDrivingRoute,
  fetchDrivingRouteAlternatives,
  type DrivingRoute,
} from '@/lib/roadDistance';
import { forwardGeocode } from '@/lib/geocode';
import { notify, confirm } from '@/lib/notify';
import { TripHistoryCard } from '@/components/TripHistoryCard';
import { reverseGeocode, tripPlaceLabel } from '@/lib/geocode';
import { evaluateGpsSample } from '@/lib/gpsTracking';
import { formatDateSlash } from '@/lib/dates';
import { preloadHistoryMaps } from '@/lib/tripMapCache';
import {
  getRecentDestinations,
  pushRecentDestination,
  type RecentDestination,
} from '@/lib/recentDestinations';
import { computeNavGuidance, headingFromTrail } from '@/lib/navGuidance';
import type { SinceLastFillStats } from '@/types';
import type { RoutePoint } from '@/lib/calculations';

type TripTab = 'live' | 'history';
/** free = suivi GPS sans destination ; nav = avec destination */
type StartMode = 'free' | 'nav';

type GeoCoords = { latitude: number; longitude: number };

/** Waypoints pour biaiser Google Maps vers l’itinéraire choisi. */
function mapsWaypointsForRoute(route: DrivingRoute | null | undefined): GeoCoords[] {
  if (!route) return [];
  if (route.via?.length) return route.via;
  const coords = route.coordinates;
  if (coords.length < 5) return [];
  const mid = coords[Math.floor(coords.length / 2)];
  return [{ latitude: mid.latitude, longitude: mid.longitude }];
}

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
  const [routeOptions, setRouteOptions] = useState<DrivingRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routesLoading, setRoutesLoading] = useState(false);
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
  const [recentDests, setRecentDests] = useState<RecentDestination[]>([]);
  const [mapVisibleIds, setMapVisibleIds] = useState<Set<number>>(() => new Set());
  const onHistoryViewable = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: Trip; index: number | null }> }) => {
      const ids = new Set<number>();
      for (const v of viewableItems) {
        if (v.item?.id != null) ids.add(v.item.id);
      }
      // Toujours garder les 2 premiers (au-dessus du fold)
      setMapVisibleIds(ids);
    }
  ).current;
  const historyViewConfig = useRef({
    itemVisiblePercentThreshold: 12,
    minimumViewTime: 60,
  }).current;
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
  const filteredHistory = useMemo(() => {
    const fillDate = sinceFill?.lastFill?.date;
    if (historyFilter === 'sinceFill' && fillDate) {
      return history.filter((t) => t.startTime >= fillDate);
    }
    return history;
  }, [history, historyFilter, sinceFill?.lastFill?.date]);

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
    const hist = trips.filter((t) => !t.isActive).slice(0, 50);
    setHistory(hist);
    setPending(pend);
    setSinceFill(since);
    setPlaces(pl);
    // Précharge géométrie + images mini-cartes (ne bloque pas l’UI)
    void preloadHistoryMaps(hist.slice(0, 8), pl, colors.accent);
    void (async () => {
      const stored = await getRecentDestinations(6);
      if (stored.length) {
        setRecentDests(stored);
        return;
      }
      // Amorçage depuis l’historique si rien en cache
      const fromHist: RecentDestination[] = [];
      const seen = new Set<string>();
      for (const t of hist) {
        const label = (t.destinationName || '').trim();
        if (label.length < 2) continue;
        const k = label.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        fromHist.push({ label, at: Date.now() });
        if (fromHist.length >= 6) break;
      }
      setRecentDests(fromHist);
    })();
  }, [activeVehicle, colors.accent]);

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

  const selectedRoute = useMemo(
    () => routeOptions.find((r) => r.id === selectedRouteId) || routeOptions[0] || null,
    [routeOptions, selectedRouteId]
  );

  const alternateMapRoutes = useMemo(() => {
    if (!routeOptions.length) return [];
    return routeOptions
      .filter((r) => r.id !== selectedRoute?.id)
      .map((r) => r.coordinates);
  }, [routeOptions, selectedRoute?.id]);

  const applyRouteSelection = useCallback((route: DrivingRoute) => {
    setSelectedRouteId(route.id);
    setPlannedRoute(route.coordinates);
    if (route.coordinates.length >= 2) {
      const lats = route.coordinates.map((p) => p.latitude);
      const lons = route.coordinates.map((p) => p.longitude);
      setCurrentRegion({
        latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
        longitude: (Math.min(...lons) + Math.max(...lons)) / 2,
        latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.35, 0.04),
        longitudeDelta: Math.max((Math.max(...lons) - Math.min(...lons)) * 1.35, 0.04),
      });
    }
  }, []);

  const loadRouteAlternatives = useCallback(
    async (from: GeoCoords, to: GeoCoords) => {
      setRoutesLoading(true);
      try {
        const alts = await fetchDrivingRouteAlternatives(from, to);
        setRouteOptions(alts);
        const prefer =
          alts.find((a) => a.kind === 'eco') ||
          alts.find((a) => a.kind === 'alternate' && /château|chateau/i.test(a.label)) ||
          alts[0];
        if (prefer) applyRouteSelection(prefer);
        else {
          setSelectedRouteId(null);
          setPlannedRoute([from, to]);
        }
      } catch {
        setRouteOptions([]);
        setSelectedRouteId(null);
        try {
          const r = await fetchDrivingRoute(from, to);
          setPlannedRoute(r.coordinates);
        } catch {
          setPlannedRoute([from, to]);
        }
      } finally {
        setRoutesLoading(false);
      }
    },
    [applyRouteSelection]
  );

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
          if (selectedRoute && selectedRoute.coordinates.length >= 2) {
            setPlannedRoute(selectedRoute.coordinates);
          } else {
            await loadRouteAlternatives(
              { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
              resolvedDest
            );
          }
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
      }
      // Pas d’alerte « Suivi démarré » : l’UI live suffit

      if (startMode === 'nav' && destName) {
        void pushRecentDestination({
          label: destName,
          latitude: resolvedDest?.latitude,
          longitude: resolvedDest?.longitude,
        }).then(() => getRecentDestinations(6).then(setRecentDests));
        try {
          if (resolvedDest) {
            const origin = loc
              ? { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
              : userLocation || undefined;
            await Linking.openURL(
              openGoogleMapsNavigation(
                resolvedDest.latitude,
                resolvedDest.longitude,
                destName,
                {
                  origin: origin || undefined,
                  waypoints: mapsWaypointsForRoute(selectedRoute),
                }
              )
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
    if (!ok) {
      notify('GPS', 'Vérifiez les permissions localisation.');
    }
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
            setRouteOptions([]);
            setSelectedRouteId(null);
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
    const label =
      destination.trim() ||
      activeTrip?.destinationName?.trim() ||
      liveDestLabel?.trim() ||
      '';
    if (destCoords) {
      await Linking.openURL(
        openGoogleMapsNavigation(
          destCoords.latitude,
          destCoords.longitude,
          label || 'Destination',
          {
            origin: userLocation || undefined,
            waypoints: mapsWaypointsForRoute(selectedRoute),
          }
        )
      );
      return;
    }
    if (label) {
      await Linking.openURL(openGoogleMapsSearch(label));
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

  const liveHeading = useMemo(
    () => headingFromTrail(routePoints.length ? routePoints : userLocation ? [userLocation] : []),
    [routePoints, userLocation]
  );

  const navGuidance = useMemo(() => {
    if (!activeTrip) return null;
    return computeNavGuidance({
      user: userLocation,
      destination: destCoords,
      destinationLabel: activeTrip.destinationName || liveDestLabel,
      route: plannedRoute.length > 1 ? plannedRoute : mapRoute,
      headingDeg: liveHeading,
    });
  }, [
    activeTrip,
    userLocation,
    destCoords,
    liveDestLabel,
    plannedRoute,
    mapRoute,
    liveHeading,
  ]);

  const quickPlaces = useMemo(() => {
    const home = places.find((p) => p.kind === 'home');
    const work = places.find((p) => p.kind === 'work');
    return [home, work].filter(Boolean) as Place[];
  }, [places]);

  const applyDestination = useCallback(
    (label: string, lat?: number | null, lon?: number | null) => {
      setStartMode('nav');
      setDestination(label);
      if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
        const coords = { latitude: lat, longitude: lon };
        setDestCoords(coords);
        if (userLocation) {
          void loadRouteAlternatives(userLocation, coords);
        } else {
          setPlannedRoute([]);
          setRouteOptions([]);
        }
      } else {
        setDestCoords(null);
        setRouteOptions([]);
        void forwardGeocode(label).then((g) => {
          if (!g) return;
          const coords = { latitude: g.latitude, longitude: g.longitude };
          setDestCoords(coords);
          if (userLocation) void loadRouteAlternatives(userLocation, coords);
        });
      }
    },
    [userLocation, loadRouteAlternatives]
  );

  // Quand la position arrive après le choix d’une destination
  useEffect(() => {
    if (activeTrip || !destCoords || !userLocation) return;
    if (routeOptions.length > 0 || routesLoading) return;
    void loadRouteAlternatives(userLocation, destCoords);
  }, [
    activeTrip,
    destCoords,
    userLocation,
    routeOptions.length,
    routesLoading,
    loadRouteAlternatives,
  ]);

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
              alternateRoutes={
                activeTrip && routePoints.length > 1 ? [] : alternateMapRoutes
              }
              destination={destCoords}
            />
            {!userLocation && (
              <View style={styles.mapHint} pointerEvents="none">
                <Text style={styles.mapHintText}>Localisation…</Text>
              </View>
            )}
            {!activeTrip && routeOptions.length > 0 && (
              <View style={styles.routePicker} pointerEvents="box-none">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.routePickerInner}
                >
                  {routeOptions.map((r) => {
                    const selected = r.id === selectedRoute?.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => applyRouteSelection(r)}
                        style={[
                          styles.routeChip,
                          {
                            borderColor: selected ? colors.accent : 'rgba(255,255,255,0.35)',
                            backgroundColor: selected
                              ? colors.accent
                              : 'rgba(15,23,42,0.88)',
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: selected ? '#fff' : '#e2e8f0',
                            fontWeight: '800',
                            fontSize: 12,
                          }}
                        >
                          {r.label}
                        </Text>
                        <Text
                          style={{
                            color: selected ? 'rgba(255,255,255,0.9)' : '#94a3b8',
                            fontSize: 11,
                            marginTop: 2,
                          }}
                        >
                          {r.distanceKm.toFixed(1)} km
                          {r.durationMinutes != null ? ` · ${r.durationMinutes} min` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {routesLoading ? (
                  <Text style={styles.routePickerHint}>Calcul des itinéraires…</Text>
                ) : (
                  <Text style={styles.routePickerHint}>
                    Choisissez un trajet — Maps s’ouvrira dessus au démarrage
                  </Text>
                )}
              </View>
            )}
          </View>

          <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
            {activeTrip && navGuidance ? (
              <Pressable
                onPress={() => {
                  if (activeTrip.destinationName) {
                    void handleOpenGoogleMaps();
                  }
                }}
                style={[
                  styles.navBar,
                  {
                    backgroundColor: colors.card,
                    borderColor: paused ? colors.warning : colors.accent,
                  },
                ]}
              >
                <View
                  style={[
                    styles.navArrowWrap,
                    { backgroundColor: (paused ? colors.warning : colors.accent) + '22' },
                  ]}
                >
                  <Ionicons
                    name="navigate"
                    size={28}
                    color={paused ? colors.warning : colors.accent}
                    style={{ transform: [{ rotate: `${navGuidance.arrowRotateDeg}deg` }] }}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}
                    numberOfLines={1}
                  >
                    {navGuidance.title}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                    {navGuidance.subtitle}
                  </Text>
                </View>
                <Text
                  style={{
                    color: paused ? colors.warning : colors.accent,
                    fontWeight: '800',
                    fontSize: 15,
                  }}
                >
                  {navGuidance.distanceLabel}
                </Text>
              </Pressable>
            ) : (
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
            )}

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
                          setRouteOptions([]);
                          setSelectedRouteId(null);
                          setPlannedRoute([]);
                        }}
                        places={places}
                        onPickPlace={(p) => {
                          if (p.latitude != null && p.longitude != null) {
                            setDestCoords({ latitude: p.latitude, longitude: p.longitude });
                            if (userLocation) {
                              void loadRouteAlternatives(userLocation, {
                                latitude: p.latitude,
                                longitude: p.longitude,
                              });
                            }
                          }
                        }}
                        onPickCoords={(c) => {
                          if (Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
                            setDestCoords({ latitude: c.latitude, longitude: c.longitude });
                            if (userLocation) {
                              void loadRouteAlternatives(userLocation, {
                                latitude: c.latitude,
                                longitude: c.longitude,
                              });
                            }
                          } else if (c.label) {
                            setDestination(c.label);
                            void forwardGeocode(c.label).then((g) => {
                              if (!g) return;
                              setDestCoords({ latitude: g.latitude, longitude: g.longitude });
                              if (userLocation) {
                                void loadRouteAlternatives(userLocation, {
                                  latitude: g.latitude,
                                  longitude: g.longitude,
                                });
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

                {(quickPlaces.length > 0 || recentDests.length > 0) && (
                  <Card style={{ marginTop: 4, marginBottom: 8 }}>
                    <Text style={{ color: colors.text, fontWeight: '800', marginBottom: 8 }}>
                      Destinations rapides
                    </Text>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 12,
                        marginBottom: 10,
                        lineHeight: 17,
                      }}
                    >
                      Touchez une destination pour préparer la navigation (sous le suivi libre).
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {quickPlaces.map((p) => (
                        <Pressable
                          key={`place-${p.id}`}
                          onPress={() =>
                            applyDestination(p.address?.trim() || p.name, p.latitude, p.longitude)
                          }
                          style={[
                            styles.destChip,
                            {
                              borderColor: colors.accent,
                              backgroundColor: colors.accent + '18',
                            },
                          ]}
                        >
                          <Ionicons
                            name={p.kind === 'home' ? 'home' : 'briefcase'}
                            size={14}
                            color={colors.accent}
                          />
                          <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>
                            {p.kind === 'home' ? 'Domicile' : p.kind === 'work' ? 'Travail' : p.name}
                          </Text>
                        </Pressable>
                      ))}
                      {recentDests.map((r) => (
                        <Pressable
                          key={`recent-${r.label}-${r.at}`}
                          onPress={() => applyDestination(r.label, r.latitude, r.longitude)}
                          style={[
                            styles.destChip,
                            { borderColor: colors.border, backgroundColor: colors.background },
                          ]}
                        >
                          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                          <Text
                            style={{ color: colors.text, fontWeight: '600', fontSize: 13, maxWidth: 160 }}
                            numberOfLines={1}
                          >
                            {r.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </Card>
                )}

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
      ) : !activeVehicle ? (
        <View style={[styles.panel, styles.panelContent]}>
          <Card>
            <Text style={[styles.warning, { color: colors.warning }]}>
              Sélectionnez un véhicule pour l’historique.
            </Text>
          </Card>
        </View>
      ) : (
        <FlatList
          style={styles.panel}
          contentContainerStyle={styles.panelContent}
          data={filteredHistory}
          keyExtractor={(t) => String(t.id)}
          initialNumToRender={3}
          maxToRenderPerBatch={2}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          onViewableItemsChanged={onHistoryViewable}
          viewabilityConfig={historyViewConfig}
          ListHeaderComponent={
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
                    Depuis le dernier plein · {activeVehicle.name}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                    {formatDateSlash(sinceFill.lastFill.date)} ·{' '}
                    {formatEuro(sinceFill.lastFill.totalCost)}
                    {sinceFill.lastFill.isFull ? ' · quasi-plein' : ''}
                  </Text>
                  {(() => {
                    const tank = activeVehicle?.tankCapacity || 50;
                    const rem = sinceFill.fuelRemainingEst;
                    const tone =
                      rem <= tank * 0.12
                        ? 'critical'
                        : rem <= tank * 0.28
                          ? 'warn'
                          : 'ok';
                    const toneColor =
                      tone === 'critical'
                        ? colors.danger
                        : tone === 'warn'
                          ? colors.warning
                          : colors.success;
                    const pct = Math.min(100, Math.max(0, (rem / tank) * 100));
                    return (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ color: toneColor, fontWeight: '800', fontSize: 20 }}>
                          ~{rem.toFixed(1)} L restants
                          {sinceFill.rangeKm > 0 ? ` · ~${Math.round(sinceFill.rangeKm)} km` : ''}
                        </Text>
                        <View
                          style={{
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: colors.border,
                            marginTop: 8,
                            overflow: 'hidden',
                          }}
                        >
                          <View
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              backgroundColor: toneColor,
                              borderRadius: 5,
                            }}
                          />
                        </View>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
                          {tone === 'critical'
                            ? 'Réservoir bas — pensez à faire le plein'
                            : tone === 'warn'
                              ? 'Niveau moyen — surveillez l’autonomie'
                              : 'Niveau confortable'}
                        </Text>
                      </View>
                    );
                  })()}
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
                      ~{sinceFill.fuelUsedEst.toFixed(1)} L consommés
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
                Adresses · durée · touchez pour le détail (carte + vitesses).
              </Text>
              {filteredHistory.length === 0 && (
                <Card style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
                    {historyFilter === 'sinceFill'
                      ? 'Aucun trajet depuis le dernier plein.'
                      : 'Aucun trajet terminé.'}
                  </Text>
                </Card>
              )}
            </>
          }
          renderItem={({ item: t, index }) => (
            <TripHistoryCard
              trip={t}
              onPress={openDetail}
              onDelete={handleDeleteTrip}
              showMap={mapVisibleIds.has(t.id) || index < 2}
            />
          )}
        />
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
  routePicker: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    paddingHorizontal: 8,
  },
  routePickerInner: {
    gap: 8,
    paddingHorizontal: 4,
    alignItems: 'stretch',
  },
  routeChip: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 108,
  },
  routePickerHint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  panel: { flex: 1 },
  panelContent: { padding: 16, paddingBottom: 40 },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  navArrowWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
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
