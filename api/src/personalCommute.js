/**
 * Patch one-shot : aller domicile → Intermarché + jauge 1/4 + odomètre
 * sur le blob sync cloud (sans rebuild APK).
 */

export const HOME = { latitude: 48.1571969, longitude: -1.586983 };
export const WORK = { latitude: 47.9483893, longitude: -1.2237387 };
export const VIA = { latitude: 48.04867, longitude: -1.50282 };

export const DEFAULT_OPTS = {
  email: 'paveldelhomme@gmail.com',
  vehicleModel: '206',
  odometerKm: 121575,
  fuelFraction: 0.25,
  day: '2026-09-12',
  startLocal: '07:45',
  originName: 'Domicile — 1 Rue Camille Saint-Saëns, Thorigné-Fouillard',
  destinationName: 'Intermarché La Guerche de Bretagne',
  originAddress: '1 Rue Camille Saint-Saëns, 35235 Thorigné-Fouillard',
  destinationAddress: 'Intermarché, Faubourg de Vitré, 35130 La Guerche-de-Bretagne',
};

function nextId(rows) {
  const max = (rows || []).reduce((m, r) => Math.max(m, Number(r?.id) || 0), 0);
  return max + 1;
}

function is206(v) {
  const blob = `${v?.name || ''} ${v?.brand || ''} ${v?.model || ''}`;
  return /206/.test(blob) && /peugeot/i.test(blob);
}

function alreadyHasCommute(trips, vehicleId, day) {
  return (trips || []).some((t) => {
    if (Number(t.vehicleId) !== Number(vehicleId)) return false;
    if (String(t.startTime || '').slice(0, 10) !== day) return false;
    const o = `${t.originName || ''}`.toLowerCase();
    const d = `${t.destinationName || ''}`.toLowerCase();
    return /thorign|domicile|saint-sa[eë]ns|camille/i.test(o) && /guerche|inter/i.test(d);
  });
}

export function downsampleCoords(pts, max = 180) {
  if (!pts?.length) return [];
  if (pts.length <= max) return pts;
  const out = [];
  const step = (pts.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(pts[Math.round(i * step)]);
  }
  out[0] = pts[0];
  out[out.length - 1] = pts[pts.length - 1];
  return out;
}

export function stampRoute(coords, startMs, durationMs) {
  const n = coords.length;
  const dur = Math.max(60_000, durationMs);
  return coords.map((c, i) => ({
    latitude: c.latitude,
    longitude: c.longitude,
    timestamp: startMs + Math.round((i / Math.max(1, n - 1)) * dur),
  }));
}

/** 07:45 Europe/Paris en septembre = UTC+2. */
export function localDayIso(day, hm, offset = '+02:00') {
  return `${day}T${hm}:00${offset}`;
}

export function addMinutesIso(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export async function fetchCommuteRoute() {
  const path = `${HOME.longitude},${HOME.latitude};${VIA.longitude},${VIA.latitude};${WORK.longitude},${WORK.latitude}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const json = await res.json();
  const route = json?.routes?.[0];
  if (!route?.geometry?.coordinates?.length) throw new Error('OSRM sans géométrie');
  const coordinates = route.geometry.coordinates.map(([lon, lat]) => ({
    latitude: lat,
    longitude: lon,
  }));
  return {
    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    coordinates: downsampleCoords(coordinates, 180),
  };
}

function ensurePlaces(snapshot, opts) {
  const places = Array.isArray(snapshot.places) ? [...snapshot.places] : [];
  let home = places.find((p) => p.kind === 'home');
  let work = places.find((p) => p.kind === 'work' || /inter|guerche/i.test(`${p.name} ${p.address}`));
  const created = [];
  if (!home) {
    home = {
      id: nextId(places),
      name: 'Domicile',
      address: opts.originAddress,
      kind: 'home',
      latitude: HOME.latitude,
      longitude: HOME.longitude,
      createdAt: new Date().toISOString(),
    };
    places.push(home);
    created.push('home');
  } else {
    home = {
      ...home,
      address: home.address || opts.originAddress,
      latitude: home.latitude ?? HOME.latitude,
      longitude: home.longitude ?? HOME.longitude,
    };
    const i = places.findIndex((p) => p.id === home.id);
    if (i >= 0) places[i] = home;
  }
  if (!work) {
    work = {
      id: nextId(places),
      name: 'Intermarché La Guerche',
      address: opts.destinationAddress,
      kind: 'work',
      latitude: WORK.latitude,
      longitude: WORK.longitude,
      createdAt: new Date().toISOString(),
    };
    places.push(work);
    created.push('work');
  } else {
    work = {
      ...work,
      address: work.address || opts.destinationAddress,
      latitude: work.latitude ?? WORK.latitude,
      longitude: work.longitude ?? WORK.longitude,
    };
    const i = places.findIndex((p) => p.id === work.id);
    if (i >= 0) places[i] = work;
  }
  return { places, created };
}

/**
 * Mutates a copy of the sync snapshot.
 */
export function applyPersonalCommute(snapshot, route, extra = {}) {
  const opts = { ...DEFAULT_OPTS, ...extra };
  const data = snapshot && typeof snapshot === 'object' ? { ...snapshot } : {};
  const vehicles = Array.isArray(data.vehicles) ? data.vehicles.map((v) => ({ ...v })) : [];
  const trips = Array.isArray(data.trips) ? [...data.trips] : [];
  const vehicle =
    vehicles.find((v) => is206(v) && v.isActive !== false) || vehicles.find(is206);
  if (!vehicle) {
    return { ok: false, reason: 'vehicle-206-missing', snapshot: data };
  }

  const tank = Number(vehicle.tankCapacity) > 0 ? Number(vehicle.tankCapacity) : 50;
  const liters = Math.round(tank * opts.fuelFraction * 10) / 10;
  vehicle.estimatedFuelLiters = liters;
  vehicle.currentOdometer = opts.odometerKm;
  const vi = vehicles.findIndex((v) => v.id === vehicle.id);
  vehicles[vi] = vehicle;

  const { places, created: placesCreated } = ensurePlaces(data, opts);

  if (alreadyHasCommute(trips, vehicle.id, opts.day)) {
    return {
      ok: true,
      already: true,
      reason: 'trip-already-present',
      vehicleId: vehicle.id,
      odometerKm: vehicle.currentOdometer,
      estimatedFuelLiters: liters,
      fuelFraction: opts.fuelFraction,
      placesCreated,
      snapshot: {
        ...data,
        vehicles,
        places,
        exportedAt: new Date().toISOString(),
      },
    };
  }

  const startIso = localDayIso(opts.day, opts.startLocal);
  const durationMin = route?.durationMinutes || 53;
  const distanceKm = route?.distanceKm || 44.7;
  const startMs = new Date(startIso).getTime();
  const coords = route?.coordinates?.length >= 2 ? route.coordinates : [HOME, WORK];
  const stamped = stampRoute(coords, startMs, durationMin * 60_000);
  const cons = Number(vehicle.consumptionPer100) > 0 ? Number(vehicle.consumptionPer100) : 5.2;
  const learn = Number(vehicle.consumptionLearnFactor) > 0 ? Number(vehicle.consumptionLearnFactor) : 1;
  const fuel = Math.round(cons * learn * (distanceKm / 100) * 100) / 100;
  const price = Number(vehicle.defaultFuelPrice) > 0 ? Number(vehicle.defaultFuelPrice) : 1.8;
  const trip = {
    id: nextId(trips),
    vehicleId: vehicle.id,
    startTime: startIso,
    endTime: addMinutesIso(startIso, durationMin),
    distanceKm,
    estimatedFuelUsed: fuel,
    estimatedCost: Math.round(fuel * price * 100) / 100,
    routePoints: JSON.stringify(stamped),
    originName: opts.originName,
    destinationName: opts.destinationName,
    isActive: false,
    isPaused: false,
    status: 'confirmed',
    source: 'manual',
    fillUpId: null,
    note: 'Saisie cloud — aller domicile → Intermarché (12 sept. 2026)',
  };
  trips.push(trip);

  return {
    ok: true,
    already: false,
    vehicleId: vehicle.id,
    tripId: trip.id,
    distanceKm,
    durationMinutes: durationMin,
    odometerKm: vehicle.currentOdometer,
    estimatedFuelLiters: liters,
    fuelFraction: opts.fuelFraction,
    placesCreated,
    snapshot: {
      ...data,
      schema: data.schema || 1,
      exportedAt: new Date().toISOString(),
      vehicles,
      trips,
      places,
    },
  };
}
