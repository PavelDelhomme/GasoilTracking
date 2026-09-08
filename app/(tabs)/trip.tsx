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
  AppState,
  RefreshControl,
  PanResponder,
  type AppStateStatus,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/context/ToastContext';
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
  getTripById,
} from '@/lib/database';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  flushTripUpdates,
  getCurrentLocation,
  openGoogleMapsSearch,
} from '@/lib/locationService';
import { launchGoogleMapsNavigation } from '@/lib/mapsNavigation';
import {
  appendRoutePoint,
  calculateRouteDistance,
  calculateTripStats,
  compactRoutePointsJson,
  estimateCost,
  formatEuro,
  formatDistance,
  getSinceLastFillStats,
  haversineDistance,
  parseRoutePoints,
} from '@/lib/calculations';
import {
  buildWorkCommuteRoundTrip,
  SIM_HOME,
  SIM_WORK,
} from '@/lib/gpsCarSimulator';
import { applyTripFuelBurn, fuelRemainingTone, fuelToneColor, setFuelLiters } from '@/lib/fuelLevel';
import { askFuelGaugeApprox } from '@/lib/fuelGaugePrompt';
import { FuelGaugeSlider } from '@/components/FuelGaugeSlider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  estimateTripFuelLiters,
  fetchElevationAscentM,
  averageMovingSpeedKmh,
  idleRatioFromPoints,
  accelAggressionFactor,
  stopAndGoFactor,
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
import { formatDateSlash, formatRelativeDay } from '@/lib/dates';
import { downsampleRoute } from '@/lib/routeGeometry';
import { preloadHistoryMaps } from '@/lib/tripMapCache';
import {
  getRecentDestinations,
  pushRecentDestination,
  type RecentDestination,
} from '@/lib/recentDestinations';
import { computeNavGuidance, headingFromTrail } from '@/lib/navGuidance';
import {
  computeDestinationHabitStats,
  type SimilarTripStats,
} from '@/lib/similarTrips';
import {
  commuteHintLabel,
  suggestTripsForNow,
  type SmartSuggestion,
} from '@/lib/smartSuggestions';
import type { SinceLastFillStats } from '@/types';
import type { RoutePoint } from '@/lib/calculations';

type TripTab = 'live' | 'history';
/** free = suivi GPS sans destination ; nav = avec destination */
type StartMode = 'free' | 'nav';

const START_MODE_KEY = 'gasoil_trip_start_mode';
const SMART_DISMISS_KEY = 'gasoil_smart_dismiss_window';

function smartWindowKey(): string {
  const d = new Date();
  const h = d.getHours();
  const slot = h < 12 ? 'am' : h < 17 ? 'mid' : 'pm';
  return `${d.toISOString().slice(0, 10)}-${slot}`;
}

type GeoCoords = { latitude: number; longitude: number };

/** Pas de waypoint Maps : un via géométrie créait un arrêt fantôme (et plantait éco). */
function mapsWaypointsForRoute(_route: DrivingRoute | null | undefined): GeoCoords[] {
  return [];
}

export default function TripScreen() {
  const params = useLocalSearchParams<{
    mode?: string;
    dest?: string;
    destLat?: string;
    destLon?: string;
    autoStart?: string;
    runSim?: string;
    runSimNonce?: string;
    purgeSim?: string;
    purgeFirst?: string;
  }>();
  const { activeVehicle, activeTrip, refresh } = useApp();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const mapRef = useRef<TripMapRef>(null);
  const autoStartDone = useRef(false);
  const [tab, setTab] = useState<TripTab>('live');
  const [startMode, setStartMode] = useState<StartMode>('nav');
  const [destination, setDestination] = useState('');
  const [destCoords, setDestCoords] = useState<GeoCoords | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [plannedRoute, setPlannedRoute] = useState<GeoCoords[]>([]);
  const [routeOptions, setRouteOptions] = useState<DrivingRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [nearDestination, setNearDestination] = useState(false);
  const [smartDismissed, setSmartDismissed] = useState(false);
  const arrivalPromptedRef = useRef(false);
  const startingRef = useRef(false);
  const fittedTripIdRef = useRef<number | null>(null);
  /** Queue carte live (max ~80 pts) — ne jamais garder le JSON GPS complet en state React. */
  const [liveMapTail, setLiveMapTail] = useState<RoutePoint[]>([]);
  const [isStopping, setIsStopping] = useState(false);
  const [stopConfirm, setStopConfirm] = useState(false);
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
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
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    try {
    const [trips, pend, since, pl] = await Promise.all([
      getTrips(activeVehicle.id),
      getPendingTrips(activeVehicle.id),
      getSinceLastFillStats(activeVehicle.id),
      getPlaces(),
    ]);
    const hist = trips.filter((t) => !t.isActive).slice(0, 80);
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
    } finally {
      setHistoryLoading(false);
    }
  }, [activeVehicle, colors.accent]);

  useEffect(() => {
    void (async () => {
      try {
        const mode = await AsyncStorage.getItem(START_MODE_KEY);
        if (mode === 'free' || mode === 'nav') setStartMode(mode);
        const dismissed = await AsyncStorage.getItem(SMART_DISMISS_KEY);
        setSmartDismissed(dismissed === smartWindowKey());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const persistStartMode = useCallback((mode: StartMode) => {
    setStartMode(mode);
    void AsyncStorage.setItem(START_MODE_KEY, mode);
    if (mode === 'free') {
      setDestination('');
      setDestCoords(null);
      setPlannedRoute([]);
      setRouteOptions([]);
      setSelectedRouteId(null);
      setNearDestination(false);
    }
  }, []);

  const dismissSmartSuggestions = useCallback(() => {
    setSmartDismissed(true);
    void AsyncStorage.setItem(SMART_DISMISS_KEY, smartWindowKey());
  }, []);

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
    // Position UI = dernier point du tail local (chargé hors Context).
    if (trackingLive) {
      const last = liveMapTail.length > 0 ? liveMapTail[liveMapTail.length - 1] : null;
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
  }, [isWeb, activeTrip?.id, activeTrip?.isPaused, liveMapTail]);

  // Charge un tail court depuis la DB (pas via Context) pour la carte pendant le live.
  useEffect(() => {
    if (!activeTrip?.isActive || activeTrip.isPaused) {
      if (!activeTrip?.isActive) setLiveMapTail([]);
      return;
    }
    let cancelled = false;
    const pull = async () => {
      try {
        const full = await getTripById(activeTrip.id);
        if (cancelled || !full) return;
        const pts = parseRoutePoints(full.routePoints || '[]');
        const tail = pts.length > 80 ? pts.slice(-80) : pts;
        setLiveMapTail(tail);
        const last = tail[tail.length - 1];
        if (last) {
          setUserLocation({ latitude: last.latitude, longitude: last.longitude });
        }
      } catch {
        /* ignore */
      }
    };
    void pull();
    const t = setInterval(() => void pull(), 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [activeTrip?.id, activeTrip?.isActive, activeTrip?.isPaused]);

  useEffect(() => {
    if (!activeTrip) {
      fittedTripIdRef.current = null;
      return;
    }
    // Fit une seule fois par trajet (évite caméra qui saute à chaque poll GPS).
    if (fittedTripIdRef.current === activeTrip.id) return;
    if (liveMapTail.length < 2) return;
    fittedTripIdRef.current = activeTrip.id;
    const fitPts = liveMapTail.length > 60 ? liveMapTail.slice(-60) : liveMapTail;
    mapRef.current?.fitToCoordinates(
      fitPts.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
      { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
    );
  }, [activeTrip?.id, liveMapTail]);

  useEffect(() => {
    if (!activeTrip) {
      setLiveOriginLabel('');
      setLiveDestLabel('');
      return;
    }
    const first = liveMapTail[0] || null;
    const last = liveMapTail.length > 1 ? liveMapTail[liveMapTail.length - 1] : userLocation;
    setLiveOriginLabel(tripPlaceLabel(activeTrip.originName, first, 'origin'));
    setLiveDestLabel(
      tripPlaceLabel(activeTrip.destinationName || destination, last, 'destination')
    );
  }, [
    activeTrip?.id,
    activeTrip?.originName,
    activeTrip?.destinationName,
    destination,
    liveMapTail,
    userLocation?.latitude,
    userLocation?.longitude,
  ]);

  const selectedRoute = useMemo(
    () => routeOptions.find((r) => r.id === selectedRouteId) || routeOptions[0] || null,
    [routeOptions, selectedRouteId]
  );

  const alternateMapRoutes = useMemo(() => {
    if (!routeOptions.length) return [];
    // Toutes les alternatives (hors sélection) — tracés visibles pour comparer.
    return routeOptions
      .filter((r) => r.id !== selectedRoute?.id)
      .map((r) => downsampleRoute(r.coordinates, 72));
  }, [routeOptions, selectedRoute?.id]);

  const applyRouteSelection = useCallback((route: DrivingRoute) => {
    try {
      setSelectedRouteId(route.id);
      const coords = downsampleRoute(route.coordinates, 120);
      const valid = coords.filter(
        (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
      );
      if (valid.length < 2) {
        setPlannedRoute(coords);
        return;
      }
      setPlannedRoute(valid);
      const lats = valid.map((p) => p.latitude);
      const lons = valid.map((p) => p.longitude);
      const latMin = Math.min(...lats);
      const latMax = Math.max(...lats);
      const lonMin = Math.min(...lons);
      const lonMax = Math.max(...lons);
      if (![latMin, latMax, lonMin, lonMax].every(Number.isFinite)) return;
      setCurrentRegion({
        latitude: (latMin + latMax) / 2,
        longitude: (lonMin + lonMax) / 2,
        latitudeDelta: Math.max((latMax - latMin) * 1.35, 0.04),
        longitudeDelta: Math.max((lonMax - lonMin) * 1.35, 0.04),
      });
    } catch {
      /* sélection invalide — ignore */
    }
  }, []);

  const loadRouteAlternatives = useCallback(
    async (from: GeoCoords, to: GeoCoords) => {
      setRoutesLoading(true);
      try {
        const alts = await fetchDrivingRouteAlternatives(from, to);
        setRouteOptions(alts);
        const prefer =
          alts.find((a) => a.kind === 'fastest') ||
          alts.find((a) => a.kind === 'eco') ||
          alts[0];
        // Ne force plus l’éco : laisse l’utilisateur choisir ; fastest = défaut neutre.
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

  const handleStartTrip = async (override?: {
    destinationLabel?: string;
    dest?: GeoCoords | null;
    mode?: StartMode;
  }) => {
    if (startingRef.current || isStarting) return;
    if (activeTrip?.isActive) {
      notify('Trajet', 'Un trajet est déjà en cours.');
      return;
    }
    if (!activeVehicle) {
      notify('Erreur', 'Sélectionnez un véhicule avant de démarrer un trajet.');
      return;
    }
    const mode = override?.mode ?? startMode;
    const destLabel =
      override?.destinationLabel?.trim() || destination.trim();
    const coordsOverride =
      override && 'dest' in override ? override.dest : destCoords;

    if (mode === 'nav' && !destLabel) {
      notify('Destination', 'Indiquez une destination, ou choisissez « Suivi libre ».');
      return;
    }

    if (mode === 'nav') persistStartMode('nav');

    startingRef.current = true;
    setIsStarting(true);
    // Capturer l’itinéraire choisi avant les await (évite state stale)
    let routeForNav: DrivingRoute | null =
      routeOptions.find((r) => r.id === selectedRouteId) || routeOptions[0] || null;
    let mapsDest: GeoCoords | null = coordsOverride ?? null;
    let mapsOrigin: GeoCoords | null = null;
    let mapsLabel = destLabel;

    try {
      // Suivi libre : pas de modal jauge au démarrage (crash Android avec GPS).
      let startFuel = activeVehicle.estimatedFuelLiters;
      if (mode === 'nav') {
        const gauge = await askFuelGaugeApprox(
          activeVehicle,
          'Niveau d’essence au départ',
          'Indiquez approximativement la jauge pour affiner la conso (passable).',
          { softSkip: true }
        );
        startFuel = gauge.skipped ? activeVehicle.estimatedFuelLiters : gauge.liters;
      }
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
        mapsOrigin = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setUserLocation(mapsOrigin);
      }

      let resolvedDest: GeoCoords | null = null;
      if (mode === 'nav') {
        resolvedDest = coordsOverride ?? null;
        if (!resolvedDest && destLabel) {
          const geo = await forwardGeocode(destLabel).catch(() => null);
          if (geo) {
            resolvedDest = { latitude: geo.latitude, longitude: geo.longitude };
          }
        }
        if (destLabel) setDestination(destLabel);
        if (resolvedDest) {
          setDestCoords(resolvedDest);
          mapsDest = resolvedDest;
        }
        mapsLabel = destLabel;

        if (loc && resolvedDest) {
          try {
            if (routeForNav && routeForNav.coordinates.length >= 2) {
              setPlannedRoute(downsampleRoute(routeForNav.coordinates, 120));
            } else {
              const alts = await fetchDrivingRouteAlternatives(
                { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
                resolvedDest
              );
              setRouteOptions(alts);
              routeForNav =
                alts.find((a) => a.id === selectedRouteId) ||
                alts.find((a) => a.kind === 'fastest') ||
                alts.find((a) => a.kind === 'eco') ||
                alts[0] ||
                null;
              if (routeForNav) {
                setSelectedRouteId(routeForNav.id);
                setPlannedRoute(downsampleRoute(routeForNav.coordinates, 120));
              } else {
                setPlannedRoute([
                  { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
                  resolvedDest,
                ]);
              }
            }
          } catch {
            setPlannedRoute([
              { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
              resolvedDest,
            ]);
          }
        }
      } else {
        // Suivi libre : nettoyer toute destination / itinéraire résiduel
        setDestination('');
        setDestCoords(null);
        setPlannedRoute([]);
        setRouteOptions([]);
        setSelectedRouteId(null);
        mapsDest = null;
        mapsLabel = '';
      }

      const originName = loc
        ? (await reverseGeocode(loc.coords.latitude, loc.coords.longitude).catch(() => null)) ||
          'Position de départ'
        : undefined;

      const destName = mode === 'nav' ? destLabel : undefined;

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
        note: mode === 'free'
          ? isWeb
            ? 'Suivi GPS web (onglet ouvert)'
            : 'Suivi GPS libre (arrière-plan)'
          : [
              startFuel != null ? `Jauge départ ~${startFuel.toFixed(1)} L` : null,
              routeForNav ? `Itinéraire ${routeForNav.label}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || undefined,
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

      await refresh();
      await loadLists();
    } catch {
      notify('Erreur', 'Impossible de démarrer le trajet.');
      startingRef.current = false;
      setIsStarting(false);
      return;
    }

    // Maps APRÈS le suivi — hors du try principal (un échec Maps ne doit pas
    // faire croire que le trajet a échoué, ni tuer le GPS). Destination seule
    // : pas d’arrêt intermédiaire. Petit délai pour laisser l’UI se stabiliser.
    try {
      if (mode === 'nav' && mapsLabel && mapsDest) {
        void pushRecentDestination({
          label: mapsLabel,
          latitude: mapsDest.latitude,
          longitude: mapsDest.longitude,
        }).then(() => getRecentDestinations(6).then(setRecentDests));

        await new Promise((r) => setTimeout(r, 400));
        const opened = await launchGoogleMapsNavigation({
          destination: mapsDest,
          origin: mapsOrigin,
          waypoints: [],
          label: mapsLabel,
        });
        if (!opened) {
          notify(
            'Google Maps',
            'Impossible d’ouvrir la navigation. Le suivi GPS continue dans l’app.'
          );
        }
      }
    } catch {
      notify(
        'Google Maps',
        'Maps n’a pas pu s’ouvrir. Le suivi GPS continue dans l’app.'
      );
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (params.autoStart !== '1' || autoStartDone.current) return;
    if (!activeVehicle || activeTrip) return;
    if (!destination.trim()) return;
    const lat = params.destLat ? Number(params.destLat) : NaN;
    const lon = params.destLon ? Number(params.destLon) : NaN;
    const hasParamCoords = Number.isFinite(lat) && Number.isFinite(lon);
    // Attendre les coords lieu (évite un géocode Google vers un POI fantôme).
    if (hasParamCoords && !destCoords) return;
    if (!hasParamCoords && !destCoords) {
      // Pas de GPS stocké : démarrer quand même en nav (géocode contrôlé), une seule fois.
    }
    autoStartDone.current = true;
    void handleStartTrip({
      destinationLabel: destination.trim(),
      dest: destCoords,
      mode: 'nav',
    });
  }, [params.autoStart, params.destLat, params.destLon, destination, destCoords, activeVehicle?.id, activeTrip?.id]);

  const simAutoKey = useRef<string | null>(null);
  useEffect(() => {
    if (!gpsSimEnabled) return;
    if (params.runSim !== '1') return;
    if (!activeVehicle || simRunning) return;
    const nonce = typeof params.runSimNonce === 'string' ? params.runSimNonce : '';
    const key = nonce || '__once__';
    if (simAutoKey.current === key) return;
    simAutoKey.current = key;
    setTab('live');
    const t = setTimeout(() => {
      void (async () => {
        try {
          if (params.purgeSim === '1' || params.purgeFirst === '1') {
            await stopActiveTrips();
            await purgeSimulatorTrips(activeVehicle.id);
            await refresh();
            await loadLists();
          }
          await handleRunCarSimulator();
        } catch (e) {
          showToast(e instanceof Error ? e.message : 'Échec sim auto');
        }
      })();
    }, 700);
    return () => clearTimeout(t);
  }, [
    params.runSim,
    params.runSimNonce,
    params.purgeSim,
    params.purgeFirst,
    activeVehicle?.id,
    gpsSimEnabled,
  ]);

  const purgeAutoDone = useRef(false);
  useEffect(() => {
    // Si runSim est aussi demandé, la purge est faite dans l’effet sim (évite Alert/race)
    if (params.runSim === '1') return;
    if (params.purgeSim !== '1' || purgeAutoDone.current) return;
    purgeAutoDone.current = true;
    void (async () => {
      await stopActiveTrips();
      const n = await purgeSimulatorTrips(activeVehicle?.id);
      await refresh();
      await loadLists();
      showToast(
        n > 0 ? `${n} trajet(s) simulateur purgé(s)` : 'Aucun trajet simulateur'
      );
    })();
  }, [params.purgeSim, params.runSim, activeVehicle?.id]);

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

  const finishTripCore = useCallback(
    async (opts?: { openRecap?: boolean; skipGauge?: boolean }) => {
      if (!activeTrip) return;
      const finishedId = activeTrip.id;
      const vehicleSnapshot = activeVehicle;

      try {
        await stopBackgroundTracking();
      } catch {
        /* GPS déjà arrêté */
      }
      try {
        await flushTripUpdates();
      } catch {
        /* ignore */
      }

      // Toujours lire la DB après drain GPS — le state React peut être en retard.
      const fresh = await getTripById(finishedId).catch(() => null);
      const trip = fresh || activeTrip;

      const pts = parseRoutePoints(compactRoutePointsJson(trip.routePoints || '[]'));
      const last = pts.length > 0 ? pts[pts.length - 1] : userLocation;

      let destName = trip.destinationName?.trim();
      if (!destName && last) {
        destName =
          (await reverseGeocode(last.latitude, last.longitude).catch(() => null)) ||
          'Lieu d’arrivée';
      }
      if (!destName) destName = 'Lieu d’arrivée';

      let originName = trip.originName?.trim();
      if (!originName && pts[0]) {
        originName =
          (await reverseGeocode(pts[0].latitude, pts[0].longitude).catch(() => null)) ||
          'Lieu de départ';
      }

      const vehicle =
        (vehicleSnapshot && (await getVehicleById(vehicleSnapshot.id).catch(() => null))) ||
        vehicleSnapshot;
      const ascentM = await fetchElevationAscentM(pts).catch(() => 0);
      const avgSpeedKmh = averageMovingSpeedKmh(trip.distanceKm, pts);
      const idleRatio = idleRatioFromPoints(pts);
      const accelFactor = accelAggressionFactor(pts);
      const stopGoFactor = stopAndGoFactor(pts);
      const fuelUsed = vehicle
        ? estimateTripFuelLiters(vehicle, trip.distanceKm, {
            ascentM,
            learnedFactor: vehicle.consumptionLearnFactor,
            avgSpeedKmh,
            idleRatio,
            accelFactor,
            stopGoFactor,
          })
        : trip.estimatedFuelUsed;
      const fills = vehicle ? await getFillUps(vehicle.id).catch(() => []) : [];
      const lastFill = [...fills].sort((a, b) => b.date.localeCompare(a.date))[0];
      const priceAtTrip =
        lastFill?.pricePerLiter && lastFill.pricePerLiter > 0
          ? lastFill.pricePerLiter
          : vehicle?.defaultFuelPrice || 0;
      const cost = estimateCost(fuelUsed, priceAtTrip);

      const liveStats = vehicle
        ? calculateTripStats(
            vehicle,
            trip.distanceKm,
            trip.startTime,
            new Date().toISOString(),
            trip.routePoints
          )
        : null;
      const speed =
        liveStats && liveStats.movingSpeedKmh > 0
          ? liveStats.movingSpeedKmh
          : liveStats
            ? (trip.distanceKm / Math.max(liveStats.durationMinutes, 0.01)) * 60
            : 0;

      if (vehicle && trip.distanceKm > 0) {
        // Jamais de modal jauge pendant Terminer (Alert/Modal + GPS/WebView = crash Android).
        await applyTripFuelBurn(vehicle, trip.distanceKm, ascentM, {
          avgSpeedKmh,
          idleRatio,
        }).catch(() => null);
      }

      const noteParts = [
        trip.note,
        speed > 0 ? `Vitesse moy. ${speed.toFixed(0)} km/h` : null,
        ascentM > 20 ? `D+ ${ascentM} m` : null,
        priceAtTrip > 0
          ? `${
              vehicleSnapshot?.fuelType === 'diesel'
                ? 'Gasoil'
                : vehicleSnapshot?.fuelType === 'gpl'
                  ? 'GPL'
                  : 'Essence'
            } ~${priceAtTrip.toFixed(3)} €/L · ${formatEuro(cost)}`
          : null,
      ].filter(Boolean);

      await updateTrip(finishedId, {
        isActive: false,
        isPaused: false,
        endTime: new Date().toISOString(),
        status: 'confirmed',
        originName: originName || trip.originName,
        destinationName: destName,
        estimatedFuelUsed: fuelUsed,
        estimatedCost: cost,
        routePoints: compactRoutePointsJson(trip.routePoints || '[]'),
        note: noteParts.join(' · ') || undefined,
      });
      if (trip.distanceKm > 0) {
        await addTrackedKm(trip.vehicleId, trip.distanceKm).catch(() => undefined);
      }
      setLiveOriginLabel('');
      setLiveDestLabel('');
      setDestination('');
      setDestCoords(null);
      setPlannedRoute([]);
      setRouteOptions([]);
      setSelectedRouteId(null);
      setTripStartFuelLiters(null);
      setNearDestination(false);
      setStopConfirm(false);
      arrivalPromptedRef.current = false;
      await refresh();
      await loadLists();

      if (opts?.openRecap !== false) {
        setTimeout(() => {
          router.push(`/trip/${finishedId}` as never);
        }, 80);
      } else {
        setTab('history');
        showToast(
          `Trajet terminé · ${formatDistance(trip.distanceKm)} · ~${fuelUsed.toFixed(1)} L`
        );
      }
    },
    [
      activeTrip,
      activeVehicle,
      userLocation,
      tripStartFuelLiters,
      refresh,
      loadLists,
      showToast,
    ]
  );

  const handleStopTrip = async (opts?: { fromArrival?: boolean }) => {
    if (!activeTrip) return;
    if (isStopping) return;

    setIsStopping(true);

    // Arrivée : 1 geste → récap (sans double confirm / jauge)
    if (opts?.fromArrival) {
      try {
        await finishTripCore({ openRecap: true, skipGauge: true });
      } catch (e) {
        notify('Erreur', e instanceof Error ? e.message : 'Impossible de terminer le trajet.');
      } finally {
        setIsStopping(false);
        setStopConfirm(false);
      }
      return;
    }

    // Confirmation in-app (pas d’Alert Android : elle plante avec la jauge / le GPS).
    setStopConfirm(true);
    setIsStopping(false);
  };

  const confirmStopTrip = async () => {
    if (!activeTrip || isStopping) return;
    setIsStopping(true);
    setStopConfirm(false);
    try {
      await finishTripCore({ openRecap: true, skipGauge: true });
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Impossible de terminer le trajet.');
    } finally {
      setIsStopping(false);
    }
  };

  /** Proximité destination pendant un trajet avec nav. */
  const checkArrivalProximity = useCallback(async () => {
    if (!activeTrip || activeTrip.isPaused || isStopping) return;
    // Suivi libre / pas de destination réelle → ne jamais auto-terminer.
    if (!activeTrip.destinationName?.trim()) return;
    let target = destCoords;
    if (!target && plannedRoute.length > 1) {
      const last = plannedRoute[plannedRoute.length - 1];
      target = { latitude: last.latitude, longitude: last.longitude };
    }
    if (!target) return;

    let loc = userLocation;
    // Préférer le dernier point du trajet (FGS) plutôt qu’un GPS High frais toutes les 20 s.
    const lastPt = liveMapTail.length > 0 ? liveMapTail[liveMapTail.length - 1] : null;
    if (lastPt) {
      loc = { latitude: lastPt.latitude, longitude: lastPt.longitude };
    } else if (!loc) {
      try {
        const fresh = await getCurrentLocation({ fresh: true });
        if (fresh?.coords) {
          loc = { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude };
          setUserLocation(loc);
        }
      } catch {
        /* keep */
      }
    }
    if (!loc) return;

    const distKm = haversineDistance(
      loc.latitude,
      loc.longitude,
      target.latitude,
      target.longitude
    );
    const near = distKm < 0.22;
    setNearDestination(near);

    if (near && activeTrip.distanceKm >= 0.8 && !arrivalPromptedRef.current) {
      arrivalPromptedRef.current = true;
      setIsStopping(true);
      void (async () => {
        try {
          await finishTripCore({ openRecap: true, skipGauge: true });
        } catch (e) {
          notify(
            'Erreur',
            e instanceof Error ? e.message : 'Impossible de terminer le trajet.'
          );
          arrivalPromptedRef.current = false;
        } finally {
          setIsStopping(false);
        }
      })();
    }
  }, [
    activeTrip?.id,
    activeTrip?.isPaused,
    activeTrip?.distanceKm,
    activeTrip?.destinationName,
    destCoords,
    plannedRoute,
    userLocation?.latitude,
    userLocation?.longitude,
    liveMapTail,
    isStopping,
    finishTripCore,
  ]);

  useEffect(() => {
    if (!activeTrip?.id) {
      arrivalPromptedRef.current = false;
      setNearDestination(false);
      return;
    }
    const onChange = (state: AppStateStatus) => {
      if (state === 'active' && activeTrip && !activeTrip.isPaused) {
        // Reprend le FGS si l’OS l’a coupé (Freecess Samsung / doze) — critique aussi Nothing
        void startBackgroundTracking();
        void checkArrivalProximity();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [activeTrip?.id, activeTrip?.isPaused, checkArrivalProximity]);

  // Pendant trajet : vérifier proximité périodiquement
  useEffect(() => {
    if (!activeTrip || activeTrip.isPaused || !destCoords) return;
    const t = setInterval(() => {
      void checkArrivalProximity();
    }, 20000);
    return () => clearInterval(t);
  }, [activeTrip?.id, activeTrip?.isPaused, destCoords, checkArrivalProximity]);

  const handleOpenGoogleMaps = async () => {
    const label =
      destination.trim() ||
      activeTrip?.destinationName?.trim() ||
      liveDestLabel?.trim() ||
      '';
    let opened = false;
    try {
      if (destCoords) {
        opened = await launchGoogleMapsNavigation({
          destination: destCoords,
          origin: userLocation,
          waypoints: mapsWaypointsForRoute(selectedRoute),
          label: label || 'Destination',
        });
      } else if (label) {
        await Linking.openURL(openGoogleMapsSearch(label));
        opened = true;
      } else {
        const loc = userLocation || (await getCurrentLocation())?.coords;
        if (loc) {
          opened = await launchGoogleMapsNavigation({
            destination: { latitude: loc.latitude + 0.01, longitude: loc.longitude + 0.01 },
            origin: loc,
            label: 'Destination',
          });
        }
      }
    } catch {
      opened = false;
    }
    if (!opened) {
      notify('Google Maps', 'Impossible d’ouvrir Maps. Vérifiez qu’il est installé.');
    }
  };

  /** Simulateur voiture (tests) — aller/retour domicile↔travail + feux + pause.
   * Injection synchrone (rapide) : évite les trajets zombies si Samsung Freecess
   * gèle le JS en arrière-plan pendant une sim lente. */
  const handleRunCarSimulator = async () => {
    if (!activeVehicle || simRunning) return;
    simAbort.current.aborted = false;
    setSimRunning(true);
    setSimProgress('Démarrage sim commute…');
    let tripId: number | null = null;
    try {
      await stopBackgroundTracking();
      await purgeSimulatorTrips(activeVehicle.id);
      await stopActiveTrips();

      const points = buildWorkCommuteRoundTrip({
        stepMeters: 120,
        trafficLightsEveryKm: 6.5,
        workPauseMs: 6 * 60 * 1000,
      });
      setDestCoords(SIM_WORK);
      setDestination('Travail puis retour domicile (sim)');
      setPlannedRoute(
        points
          .filter((_, i) => i % 8 === 0 || i === points.length - 1)
          .map((p) => ({ latitude: p.latitude, longitude: p.longitude }))
      );
      setUserLocation(SIM_HOME);
      setCurrentRegion({
        latitude: SIM_HOME.latitude,
        longitude: SIM_HOME.longitude,
        latitudeDelta: 0.45,
        longitudeDelta: 0.45,
      });

      const first = points[0];
      tripId = await createTrip({
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
        destinationName: 'Travail A/R (sim)',
        isActive: true,
        isPaused: false,
        status: 'confirmed',
        source: 'gps',
        fillUpId: null,
        note: 'SIMULATEUR — ne pas compter comme trajet réel',
      });
      await refresh();

      let routeJson = JSON.stringify([
        {
          latitude: first.latitude,
          longitude: first.longitude,
          timestamp: first.timestamp,
        },
      ]);
      setSimProgress(`Injection GPS 0/${points.length}…`);

      const persistPartial = async (idx: number) => {
        const dist = calculateRouteDistance(routeJson);
        const fuel = estimateTripFuelLiters(activeVehicle, dist, {
          learnedFactor: activeVehicle.consumptionLearnFactor,
        });
        const cost = estimateCost(fuel, activeVehicle.defaultFuelPrice);
        await updateTrip(tripId!, {
          routePoints: routeJson,
          distanceKm: dist,
          estimatedFuelUsed: fuel,
          estimatedCost: cost,
          isActive: true,
        });
        setUserLocation({
          latitude: points[idx].latitude,
          longitude: points[idx].longitude,
        });
        setSimProgress(`Sim ${idx + 1}/${points.length} · ${formatDistance(dist)}`);
        await refresh();
      };

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
        // Yield UI régulièrement sans ralentir au point de se faire freezer
        if (i % 80 === 0 || i === points.length - 1) {
          await persistPartial(i);
          await new Promise((r) => setTimeout(r, 16));
        }
      }

      routeJson = compactRoutePointsJson(routeJson);
      const distanceKm = calculateRouteDistance(routeJson);
      const pts = JSON.parse(routeJson) as {
        latitude: number;
        longitude: number;
        timestamp: number;
      }[];
      const idleRatio = idleRatioFromPoints(pts);
      const accelFactor = accelAggressionFactor(pts);
      const stopGoFactor = stopAndGoFactor(pts);
      const fuelUsed = estimateTripFuelLiters(activeVehicle, distanceKm, {
        idleRatio,
        accelFactor,
        stopGoFactor,
        learnedFactor: activeVehicle.consumptionLearnFactor,
      });
      const cost = estimateCost(fuelUsed, activeVehicle.defaultFuelPrice);
      const stats = calculateTripStats(
        activeVehicle,
        distanceKm,
        new Date(first.timestamp).toISOString(),
        new Date().toISOString(),
        routeJson
      );

      // Toujours finaliser (même si abort partiel) — jamais de zombie 0 L
      await updateTrip(tripId, {
        routePoints: routeJson,
        distanceKm,
        estimatedFuelUsed: fuelUsed,
        estimatedCost: cost,
        isActive: false,
        isPaused: false,
        endTime: new Date().toISOString(),
        originName: 'Domicile (sim)',
        destinationName: 'Travail A/R (sim)',
        note: simAbort.current.aborted
          ? `SIMULATEUR (interrompu) · ${formatDistance(distanceKm)} · ~${fuelUsed.toFixed(1)} L`
          : `SIMULATEUR commute · ${formatDistance(distanceKm)} · ${stats.movingSpeedKmh.toFixed(0)} km/h moy. · idle ${(idleRatio * 100).toFixed(0)}% · ~${fuelUsed.toFixed(1)} L`,
      });
      setUserLocation({
        latitude: points[points.length - 1].latitude,
        longitude: points[points.length - 1].longitude,
      });
      setSimProgress('');
      await refresh();
      await loadLists();
      setTab('history');
      if (simAbort.current.aborted) {
        showToast(
          `Sim interrompue · ${formatDistance(distanceKm)} · ~${fuelUsed.toFixed(1)} L`
        );
      } else {
        showToast(
          `Sim OK · ${formatDistance(distanceKm)} · ~${fuelUsed.toFixed(1)} L · ${formatEuro(cost)}`
        );
      }
    } catch (e) {
      if (tripId != null) {
        try {
          await updateTrip(tripId, {
            isActive: false,
            isPaused: false,
            endTime: new Date().toISOString(),
            note: 'SIMULATEUR — erreur / finalisé auto',
          });
        } catch {
          /* ignore */
        }
      }
      showToast(e instanceof Error ? e.message : 'Échec simulateur');
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

  // Stats live : colonnes numériques déjà à jour par le FGS — pas de parse JSON O(n).
  const tripStats = useMemo(() => {
    if (!activeTrip || !activeVehicle) return null;
    const startMs = Date.parse(activeTrip.startTime);
    const durationMinutes = Number.isFinite(startMs)
      ? Math.max(0, (Date.now() - startMs) / 60000)
      : 0;
    const movingSpeedKmh =
      durationMinutes > 0.5 ? (activeTrip.distanceKm / durationMinutes) * 60 : 0;
    return {
      fuelUsed: activeTrip.estimatedFuelUsed,
      cost: activeTrip.estimatedCost,
      durationMinutes,
      movingSpeedKmh,
    };
  }, [
    activeTrip?.id,
    activeTrip?.distanceKm,
    activeTrip?.estimatedFuelUsed,
    activeTrip?.estimatedCost,
    activeTrip?.startTime,
    activeVehicle?.id,
  ]);
  const avgSpeed =
    activeTrip && tripStats
      ? tripStats.movingSpeedKmh > 0
        ? tripStats.movingSpeedKmh
        : (activeTrip.distanceKm / Math.max(tripStats.durationMinutes, 0.01)) * 60
      : 0;

  const liveActiveFuel =
    activeTrip && activeVehicle
      ? activeTrip.estimatedFuelUsed > 0.05
        ? activeTrip.estimatedFuelUsed
        : estimateTripFuelLiters(activeVehicle, activeTrip.distanceKm, {
            learnedFactor: activeVehicle.consumptionLearnFactor,
          })
      : 0;
  const liveActiveCost =
    activeTrip && activeVehicle
      ? activeTrip.estimatedCost > 0.05
        ? activeTrip.estimatedCost
        : estimateCost(liveActiveFuel, activeVehicle.defaultFuelPrice)
      : 0;

  const routePoints = liveMapTail;
  const paused = Boolean(activeTrip?.isPaused);
  /** Pendant trajet : derniers points GPS ; sinon itinéraire prévu */
  const mapRoute =
    routePoints.length > 1
      ? routePoints
      : plannedRoute.length > 0
        ? plannedRoute
        : routePoints;

  const liveHeading = useMemo(
    () => headingFromTrail(routePoints.length ? routePoints : userLocation ? [userLocation] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveMapTail, userLocation?.latitude, userLocation?.longitude]
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
      persistStartMode('nav');
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
    [userLocation, loadRouteAlternatives, persistStartMode]
  );

  const destinationHabit = useMemo((): SimilarTripStats | null => {
    if (!destination.trim() || history.length < 1) return null;
    return computeDestinationHabitStats(history, destination.trim(), destCoords);
  }, [destination, destCoords, history]);

  const smartSuggestions = useMemo((): SmartSuggestion[] => {
    if (activeTrip || smartDismissed) return [];
    return suggestTripsForNow({
      places,
      trips: history,
      userLocation,
    });
  }, [activeTrip, smartDismissed, places, history, userLocation]);

  const smartHint = useMemo(() => commuteHintLabel(), [tab, activeTrip?.id]);

  const tabRef = useRef(tab);
  tabRef.current = tab;
  const tabSwipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (
          _e: GestureResponderEvent,
          g: PanResponderGestureState
        ) => Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) < 56) return;
          if (g.dx < 0 && tabRef.current === 'live') setTab('history');
          else if (g.dx > 0 && tabRef.current === 'history') setTab('live');
        },
      }),
    []
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
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'live' }}
          accessibilityLabel="Trajet en cours"
          style={[
            styles.segment,
            tab === 'live' && { borderBottomColor: colors.accent, borderBottomWidth: 3 },
          ]}
        >
          <Text style={{ color: tab === 'live' ? colors.accent : colors.textSecondary, fontWeight: '700' }}>
            En cours
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('history')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'history' }}
          accessibilityLabel="Historique des trajets"
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
              plannedRoute={activeTrip && routePoints.length > 1 ? [] : plannedRoute}
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

          <ScrollView
            style={styles.panel}
            contentContainerStyle={styles.panelContent}
            {...tabSwipe.panHandlers}
          >
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
                  title="Saisie manuelle"
                  variant="outline"
                  onPress={() => router.push('/trip/add' as never)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Importer"
                  variant="secondary"
                  onPress={() => router.push('/trip/import' as never)}
                  style={{ flex: 1 }}
                />
              </View>
            )}

            {activeTrip && nearDestination && (
              <Pressable
                onPress={() => void handleStopTrip({ fromArrival: true })}
                style={[
                  styles.arrivalBanner,
                  { backgroundColor: colors.success + '22', borderColor: colors.success },
                ]}
              >
                <Ionicons name="flag" size={20} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '800' }}>Arrivé ?</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Terminer maintenant et voir le récap
                  </Text>
                </View>
                <Text style={{ color: colors.success, fontWeight: '800' }}>Terminer</Text>
              </Pressable>
            )}

            {!activeVehicle ? (
              <Card>
                <Text style={[styles.warning, { color: colors.warning }]}>
                  Sélectionnez un véhicule pour démarrer un trajet.
                </Text>
                <Button
                  title="Aller aux véhicules"
                  onPress={() => router.push('/(tabs)/vehicles' as never)}
                  style={{ marginTop: 12 }}
                />
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
                    value={`${liveActiveFuel.toFixed(2)} L`}
                  />
                  <StatCard label="Coût est." value={formatEuro(liveActiveCost)} />
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
                {stopConfirm ? (
                  <Card
                    style={{
                      marginBottom: 8,
                      borderColor: colors.danger,
                      borderWidth: 1,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '800', marginBottom: 6 }}>
                      Terminer ce trajet ?
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>
                      Le suivi GPS s’arrête et le récap s’affiche. Fonctionne aussi en suivi libre.
                    </Text>
                    <Button
                      title={isStopping ? 'Arrêt…' : 'Oui, terminer'}
                      variant="danger"
                      onPress={() => void confirmStopTrip()}
                      disabled={isStopping}
                      style={{ marginBottom: 8 }}
                    />
                    <Button
                      title="Continuer le suivi"
                      variant="outline"
                      onPress={() => setStopConfirm(false)}
                      disabled={isStopping}
                    />
                  </Card>
                ) : (
                  <Button
                    title="Terminer le trajet"
                    variant="danger"
                    onPress={() => void handleStopTrip()}
                    disabled={isStopping}
                  />
                )}
              </>
            ) : (
              <>
                {smartSuggestions.length > 0 && (
                  <Card style={{ marginBottom: 10 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
                        {smartHint || 'Suggestion du moment'}
                      </Text>
                      <Pressable onPress={dismissSmartSuggestions} hitSlop={10}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Plus tard</Text>
                      </Pressable>
                    </View>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 12,
                        marginBottom: 10,
                        lineHeight: 17,
                      }}
                    >
                      Selon l’heure et vos trajets réguliers — un tap pour démarrer + Maps.
                    </Text>
                    {smartSuggestions.map((s) => (
                      <View
                        key={s.id}
                        style={[
                          styles.smartRow,
                          {
                            borderColor: colors.accent,
                            backgroundColor: colors.accent + '14',
                          },
                        ]}
                      >
                        <Ionicons
                          name={
                            s.kind === 'commute_to_home'
                              ? 'home'
                              : s.kind === 'commute_to_work'
                                ? 'briefcase'
                                : 'navigate'
                          }
                          size={20}
                          color={colors.accent}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: colors.text, fontWeight: '800' }} numberOfLines={1}>
                            {s.title}
                          </Text>
                          <Text
                            style={{ color: colors.textSecondary, fontSize: 12 }}
                            numberOfLines={1}
                          >
                            {s.subtitle}
                            {s.habitCount > 0 ? ` · ${s.habitCount} trajets` : ''}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            dismissSmartSuggestions();
                            applyDestination(s.label, s.latitude, s.longitude);
                          }}
                          style={{ paddingHorizontal: 6, paddingVertical: 4 }}
                        >
                          <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 11 }}>
                            Voir
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            dismissSmartSuggestions();
                            void handleStartTrip({
                              mode: 'nav',
                              destinationLabel: s.label,
                              dest: { latitude: s.latitude, longitude: s.longitude },
                            });
                          }}
                          style={{
                            backgroundColor: colors.accent,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            borderRadius: 10,
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                            Démarrer
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </Card>
                )}

                <Card>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Mode de démarrage
                  </Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    Véhicule : {activeVehicle.name}. Le suivi GPS continue en arrière-plan (notification).
                  </Text>

                  <Pressable
                    onPress={() => persistStartMode('free')}
                    style={[
                      styles.modeCard,
                      {
                        borderColor: startMode === 'free' ? colors.accent : colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '800' }}>
                      Suivi libre
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                      Pas de destination obligatoire — trace km, vitesse moyenne et conso estimée
                      même hors premier plan.
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => persistStartMode('nav')}
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
                      : selectedRoute
                        ? `Démarrer · ${selectedRoute.label} + Maps`
                        : 'Démarrer + navigation Maps'
                  }
                  onPress={handleStartTrip}
                  loading={isStarting}
                  style={{ marginBottom: 8 }}
                />

                {startMode === 'nav' && destinationHabit && destinationHabit.count >= 1 && (
                  <Card style={{ marginBottom: 10 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' }}>
                      HABITUDE
                      {selectedRoute ? ` · ${selectedRoute.label}` : ' SUR CE TRAJET'}
                      {' · '}
                      {destinationHabit.count}×
                    </Text>
                    <View style={styles.habitStatsRow}>
                      <View style={styles.habitStat}>
                        <Text style={[styles.habitStatVal, { color: colors.text }]}>
                          {destinationHabit.avgDistanceKm.toFixed(1)}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>km</Text>
                      </View>
                      <View style={styles.habitStat}>
                        <Text style={[styles.habitStatVal, { color: colors.text }]}>
                          {destinationHabit.avgFuelL.toFixed(1)}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>L</Text>
                      </View>
                      <View style={styles.habitStat}>
                        <Text style={[styles.habitStatVal, { color: colors.text }]}>
                          {formatEuro(destinationHabit.avgCost)}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>coût</Text>
                      </View>
                      {destinationHabit.avgDurationMin > 0 && (
                        <View style={styles.habitStat}>
                          <Text style={[styles.habitStatVal, { color: colors.text }]}>
                            {destinationHabit.avgDurationMin}
                          </Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 10 }}>min</Text>
                        </View>
                      )}
                      {destinationHabit.avgL100 > 0 && (
                        <View style={styles.habitStat}>
                          <Text style={[styles.habitStatVal, { color: colors.accent }]}>
                            {destinationHabit.avgL100.toFixed(1)}
                          </Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 10 }}>L/100</Text>
                        </View>
                      )}
                    </View>
                    {destinationHabit.avgL100 > 0 && (
                      <View
                        style={[
                          styles.habitBadge,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.background,
                            marginTop: 8,
                          },
                        ]}
                      >
                        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                          Référence conso : {destinationHabit.avgL100.toFixed(1)} L/100 km sur ce
                          parcours
                        </Text>
                      </View>
                    )}
                  </Card>
                )}

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
            <Button
              title="Aller aux véhicules"
              onPress={() => router.push('/(tabs)/vehicles' as never)}
              style={{ marginTop: 12 }}
            />
          </Card>
        </View>
      ) : (
        <FlatList
          style={styles.panel}
          contentContainerStyle={styles.panelContent}
          {...tabSwipe.panHandlers}
          data={filteredHistory}
          keyExtractor={(t) => String(t.id)}
          initialNumToRender={3}
          maxToRenderPerBatch={2}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          onViewableItemsChanged={onHistoryViewable}
          viewabilityConfig={historyViewConfig}
          refreshControl={
            <RefreshControl
              refreshing={historyRefreshing}
              onRefresh={() => {
                void (async () => {
                  setHistoryRefreshing(true);
                  try {
                    await loadLists();
                  } finally {
                    setHistoryRefreshing(false);
                  }
                })();
              }}
              tintColor={colors.accent}
            />
          }
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
                      when = `${formatRelativeDay(t.startTime)} · ${dt.toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`;
                    } catch {
                      when = formatRelativeDay(t.startTime);
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
                    const rem =
                      activeVehicle?.estimatedFuelLiters != null
                        ? activeVehicle.estimatedFuelLiters
                        : sinceFill.fuelRemainingEst;
                    const tone = fuelRemainingTone({
                      litersRemaining: rem,
                      tankCapacity: tank,
                      lowLitersThreshold: activeVehicle?.lowFuelThresholdLiters,
                      rangeKm: sinceFill.rangeKm,
                    });
                    const toneColor = fuelToneColor(tone, colors);
                    return (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ color: toneColor, fontWeight: '800', fontSize: 18, marginBottom: 6 }}>
                          ~{rem.toFixed(1)} L restants
                          {sinceFill.rangeKm > 0 ? ` · ~${Math.round(sinceFill.rangeKm)} km` : ''}
                        </Text>
                        <FuelGaugeSlider
                          compact
                          requireConfirm
                          tankCapacity={tank}
                          liters={rem}
                          accentColor={toneColor}
                          onChange={() => undefined}
                          onChangeEnd={async (L) => {
                            if (!activeVehicle) return;
                            await setFuelLiters(activeVehicle, L);
                            await refresh();
                            notify('Réservoir', `${L.toFixed(1)} L enregistrés`);
                          }}
                        />
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
              {historyLoading && filteredHistory.length === 0 && (
                <Card style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
                    Chargement de l’historique…
                  </Text>
                </Card>
              )}
              {!historyLoading && filteredHistory.length === 0 && (
                <Card style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 12 }}>
                    {historyFilter === 'sinceFill'
                      ? 'Aucun trajet depuis le dernier plein.'
                      : 'Aucun trajet terminé.'}
                  </Text>
                  <Button title="Démarrer un trajet" onPress={() => setTab('live')} />
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
              allTrips={history}
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
  map: { height: '46%', minHeight: 260, position: 'relative' },
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
  arrivalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  habitBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  habitStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  habitStat: { minWidth: 52, alignItems: 'center' },
  habitStatVal: { fontSize: 15, fontWeight: '800' },
  smartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
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
