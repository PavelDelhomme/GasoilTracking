/**
 * Patch one-shot : aller domicile → Intermarché + jauge 1/4 + odomètre
 * sur le blob sync cloud (sans rebuild APK).
 */

export const HOME = { latitude: 48.1571969, longitude: -1.586983 };
export const WORK = { latitude: 47.9483893, longitude: -1.2237387 };
export const VIA = { latitude: 48.04867, longitude: -1.50282 };
/** Aire / bourg Forges-la-Forêt (35640), sur la route La Guerche → Nantes. */
export const FORGES = { latitude: 47.8619159, longitude: -1.2793479 };
/** Carrefour Nantes La Beaujoire — Route de Paris / av. Flora Tristan. */
export const CARREFOUR_BEAUJOIRE = { latitude: 47.257706, longitude: -1.50968 };
/** Parc des expositions de la Beaujoire. */
export const EXPO_BEAUJOIRE = { latitude: 47.2584968, longitude: -1.532388 };

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

export async function fetchOsrmRoute(points) {
  const path = (points || []).map((p) => `${p.longitude},${p.latitude}`).join(';');
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

/** Aller direct domicile → Intermarché (~49 km, sans le via Rennes). */
export async function fetchCommuteRoute() {
  return fetchOsrmRoute([HOME, WORK]);
}

export async function fetchAfternoonRoutes() {
  const [beaujoire, expo] = await Promise.all([
    fetchOsrmRoute([WORK, FORGES, CARREFOUR_BEAUJOIRE]),
    fetchOsrmRoute([CARREFOUR_BEAUJOIRE, EXPO_BEAUJOIRE]),
  ]);
  return { beaujoire, expo };
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
  if (opts.odometerKm != null) {
    const next = Number(opts.odometerKm);
    if (!(Number(vehicle.currentOdometer) > next)) {
      vehicle.currentOdometer = next;
    }
  }
  const vi = vehicles.findIndex((v) => v.id === vehicle.id);
  vehicles[vi] = vehicle;

  const { places, created: placesCreated } = ensurePlaces(data, opts);

  if (alreadyHasCommute(trips, vehicle.id, opts.day)) {
    const existingIdx = trips.findIndex(
      (t) =>
        Number(t.vehicleId) === Number(vehicle.id) &&
        String(t.startTime || '').slice(0, 10) === opts.day &&
        /guerche|inter/i.test(`${t.destinationName || ''}${t.originName || ''}`)
    );
    const existing = existingIdx >= 0 ? trips[existingIdx] : null;
    if (existing && opts.distanceKm != null && Math.abs(Number(existing.distanceKm) - Number(opts.distanceKm)) > 0.6) {
      trips[existingIdx] = { ...existing, distanceKm: Number(opts.distanceKm) };
    }
    return {
      ok: true,
      already: true,
      reason: 'trip-already-present',
      vehicleId: vehicle.id,
      tripId: existing?.id,
      odometerKm: vehicle.currentOdometer,
      estimatedFuelLiters: vehicle.estimatedFuelLiters,
      fuelFraction: opts.fuelFraction,
      placesCreated,
      snapshot: {
        ...data,
        vehicles,
        trips,
        places,
        exportedAt: new Date().toISOString(),
      },
    };
  }

  const startIso = localDayIso(opts.day, opts.startLocal);
  const durationMin = opts.durationMinutes || route?.durationMinutes || 44;
  const distanceKm = opts.distanceKm != null ? Number(opts.distanceKm) : route?.distanceKm || 49;
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

  const skipFuelReset = opts.skipFuelReset === true || Boolean(extra.fillUp);
  if (!skipFuelReset) {
    vehicle.estimatedFuelLiters = liters;
    vehicles[vi] = vehicle;
  }

  return {
    ok: true,
    already: false,
    vehicleId: vehicle.id,
    tripId: trip.id,
    distanceKm,
    durationMinutes: durationMin,
    odometerKm: vehicle.currentOdometer,
    estimatedFuelLiters: vehicle.estimatedFuelLiters,
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

function alreadyHasFillUp(fillUps, vehicleId, day, liters, totalCost) {
  return (fillUps || []).some((f) => {
    if (Number(f.vehicleId) !== Number(vehicleId)) return false;
    if (String(f.date || '').slice(0, 10) !== day) return false;
    const sameL = Math.abs(Number(f.liters) - Number(liters)) < 0.05;
    const sameEur = Math.abs(Number(f.totalCost) - Number(totalCost)) < 0.05;
    return sameL && sameEur;
  });
}

function lastFillForVehicle(fillUps, vehicleId) {
  return (
    (fillUps || [])
      .filter((f) => Number(f.vehicleId) === Number(vehicleId))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null
  );
}

function tripKmSince(trips, vehicleId, sinceIso) {
  return (trips || [])
    .filter((t) => Number(t.vehicleId) === Number(vehicleId))
    .filter((t) => t && t.isActive !== true && t.status !== 'rejected')
    .filter((t) => !sinceIso || String(t.startTime) >= sinceIso)
    .reduce((acc, t) => acc + (Number(t.distanceKm) || 0), 0);
}

function estimateTrip(vehicle, distanceKm) {
  const cons = Number(vehicle.consumptionPer100) > 0 ? Number(vehicle.consumptionPer100) : 5.2;
  const learn = Number(vehicle.consumptionLearnFactor) > 0 ? Number(vehicle.consumptionLearnFactor) : 1;
  const fuel = Math.round(cons * learn * (distanceKm / 100) * 100) / 100;
  const price = Number(vehicle.defaultFuelPrice) > 0 ? Number(vehicle.defaultFuelPrice) : 1.8;
  return { fuel, cost: Math.round(fuel * price * 100) / 100 };
}

function tripMatchesLeg(t, vehicleId, day, originRe, destRe) {
  if (Number(t.vehicleId) !== Number(vehicleId)) return false;
  if (String(t.startTime || '').slice(0, 10) !== day) return false;
  return originRe.test(`${t.originName || ''}`) && destRe.test(`${t.destinationName || ''}`);
}

function ensureNamedPlace(places, spec) {
  const re = spec.match instanceof RegExp ? spec.match : new RegExp(spec.match || spec.name, 'i');
  const idx = places.findIndex((p) => re.test(`${p.name || ''} ${p.address || ''}`));
  if (idx >= 0) {
    const cur = places[idx];
    places[idx] = {
      ...cur,
      latitude: cur.latitude ?? spec.latitude,
      longitude: cur.longitude ?? spec.longitude,
      address: cur.address || spec.address,
    };
    return places[idx];
  }
  const place = {
    id: nextId(places),
    name: spec.name,
    address: spec.address,
    kind: spec.kind || 'other',
    latitude: spec.latitude,
    longitude: spec.longitude,
    createdAt: new Date().toISOString(),
  };
  places.push(place);
  return place;
}

/**
 * Aller Intermarché → Carrefour Beaujoire (via Forges) + 3,5 km vers le parc expo.
 */
export function applyAfternoonTrips(snapshot, extra = {}) {
  const legs = Array.isArray(extra.afternoon) ? extra.afternoon : [];
  const data = snapshot && typeof snapshot === 'object' ? { ...snapshot } : {};
  if (!legs.length) {
    return { ok: true, added: 0, kmAdded: 0, snapshot: data };
  }
  const vehicles = Array.isArray(data.vehicles) ? data.vehicles.map((v) => ({ ...v })) : [];
  const trips = Array.isArray(data.trips) ? [...data.trips] : [];
  const places = Array.isArray(data.places) ? [...data.places] : [];
  const vehicle =
    vehicles.find((v) => is206(v) && v.isActive !== false) || vehicles.find(is206);
  if (!vehicle) {
    return { ok: false, reason: 'vehicle-206-missing', added: 0, kmAdded: 0, snapshot: data };
  }

  const day = extra.day || DEFAULT_OPTS.day;
  const routes = extra.afternoonRoutes || {};
  let added = 0;
  let kmAdded = 0;
  let fuelUsed = 0;

  ensureNamedPlace(places, {
    name: 'Aire de repos Forges-la-Forêt',
    address: 'Forges-la-Forêt, 35640',
    kind: 'other',
    latitude: FORGES.latitude,
    longitude: FORGES.longitude,
    match: /forges-la-for[eê]t/i,
  });
  ensureNamedPlace(places, {
    name: 'Carrefour Nantes La Beaujoire',
    address: 'Route de Paris, 44300 Nantes',
    kind: 'other',
    latitude: CARREFOUR_BEAUJOIRE.latitude,
    longitude: CARREFOUR_BEAUJOIRE.longitude,
    match: /carrefour/i,
  });
  ensureNamedPlace(places, {
    name: 'Parc des expositions de la Beaujoire',
    address: 'Route de Saint-Joseph de Porterie, 44300 Nantes',
    kind: 'other',
    latitude: EXPO_BEAUJOIRE.latitude,
    longitude: EXPO_BEAUJOIRE.longitude,
    match: /expo|exposition/i,
  });

  for (const leg of legs) {
    const originRe = new RegExp(leg.originRe || '.', 'i');
    const destRe = new RegExp(leg.destRe || '.', 'i');
    if (trips.some((t) => tripMatchesLeg(t, vehicle.id, day, originRe, destRe))) {
      continue;
    }
    const route = routes[leg.key] || {};
    const distanceKm = Number(leg.distanceKm) || route.distanceKm || 0;
    if (!(distanceKm > 0)) continue;
    const durationMin =
      Number(leg.durationMinutes) || route.durationMinutes || Math.max(1, Math.round(distanceKm * 1.1));
    const startIso = localDayIso(day, leg.startLocal || '13:00');
    const coords = route.coordinates?.length >= 2 ? route.coordinates : [];
    const stamped =
      coords.length >= 2 ? stampRoute(coords, new Date(startIso).getTime(), durationMin * 60_000) : [];
    const { fuel, cost } = estimateTrip(vehicle, distanceKm);
    trips.push({
      id: nextId(trips),
      vehicleId: vehicle.id,
      startTime: startIso,
      endTime: addMinutesIso(startIso, durationMin),
      distanceKm,
      estimatedFuelUsed: fuel,
      estimatedCost: cost,
      routePoints: JSON.stringify(stamped),
      originName: leg.originName,
      destinationName: leg.destinationName,
      isActive: false,
      isPaused: false,
      status: 'confirmed',
      source: 'manual',
      fillUpId: null,
      note: leg.note || 'Saisie cloud — 12 sept. 2026',
    });
    added += 1;
    kmAdded += distanceKm;
    fuelUsed += fuel;
  }

  if (added > 0) {
    const tank = Number(vehicle.tankCapacity) > 0 ? Number(vehicle.tankCapacity) : 50;
    vehicle.currentOdometer =
      Math.round((Number(vehicle.currentOdometer || 0) + kmAdded) * 10) / 10;
    vehicle.estimatedFuelLiters = Math.max(
      0,
      Math.round((Number(vehicle.estimatedFuelLiters || 0) - fuelUsed) * 10) / 10
    );
    if (vehicle.estimatedFuelLiters > tank) vehicle.estimatedFuelLiters = tank;
    const vi = vehicles.findIndex((v) => v.id === vehicle.id);
    vehicles[vi] = vehicle;
  }

  return {
    ok: true,
    added,
    kmAdded,
    snapshot: {
      ...data,
      schema: data.schema || 1,
      exportedAt: new Date().toISOString(),
      vehicles,
      trips,
      places,
      fillUps: data.fillUps,
    },
  };
}

function finishFillUp(result, extra) {
  const after = applyAfternoonTrips(result.snapshot, extra);
  if (!after.ok) return after;
  const v =
    (after.snapshot.vehicles || []).find((x) => is206(x) && x.isActive !== false) ||
    (after.snapshot.vehicles || []).find(is206);
  return {
    ...result,
    already: Boolean(result.already) && after.added === 0,
    afternoonAdded: after.added,
    afternoonKm: after.kmAdded,
    estimatedFuelLiters: v?.estimatedFuelLiters ?? result.estimatedFuelLiters,
    odometerKm: v?.currentOdometer ?? result.odometerKm,
    snapshot: after.snapshot,
  };
}

/**
 * Plein réel 206 + trajet domicile → Intermarché si absent.
 * Ne remet jamais la jauge à 1/4. Ajoute l’après-midi Nantes si `extra.afternoon`.
 */
export function applyPersonalFillUp(snapshot, route, extra = {}) {
  const fill = extra.fillUp && typeof extra.fillUp === 'object' ? extra.fillUp : extra;
  const liters = Number(fill.liters);
  const totalCost = Number(fill.totalCost);
  if (!(liters > 0) || !(totalCost > 0)) {
    return { ok: false, reason: 'fillup-invalid', snapshot };
  }
  const commute = applyPersonalCommute(snapshot, route, {
    ...extra,
    skipFuelReset: true,
  });
  if (!commute.ok) return commute;

  const data = commute.snapshot;
  const vehicles = Array.isArray(data.vehicles) ? data.vehicles.map((v) => ({ ...v })) : [];
  const trips = Array.isArray(data.trips) ? [...data.trips] : [];
  const fillUps = Array.isArray(data.fillUps) ? [...data.fillUps] : [];
  const vehicle =
    vehicles.find((v) => is206(v) && v.isActive !== false) || vehicles.find(is206);
  if (!vehicle) {
    return { ok: false, reason: 'vehicle-206-missing', snapshot: data };
  }

  const day = extra.day || DEFAULT_OPTS.day;
  const isFull = fill.isFull !== false;
  const pricePerLiter = Math.round((totalCost / liters) * 1000) / 1000;
  const stationName =
    fill.stationName || extra.destinationName || DEFAULT_OPTS.destinationName;
  const tank = Number(vehicle.tankCapacity) > 0 ? Number(vehicle.tankCapacity) : 50;
  const odometer =
    extra.odometerKm != null ? Number(extra.odometerKm) : vehicle.currentOdometer ?? null;

  const dayTrip =
    trips.find(
      (t) =>
        Number(t.vehicleId) === Number(vehicle.id) &&
        String(t.startTime || '').slice(0, 10) === day &&
        /guerche|inter/i.test(`${t.destinationName || ''}`)
    ) || null;

  if (alreadyHasFillUp(fillUps, vehicle.id, day, liters, totalCost)) {
    vehicle.defaultFuelPrice = pricePerLiter;
    const afternoonSpec = Array.isArray(extra.afternoon) && extra.afternoon.length;
    const afternoonAlready =
      afternoonSpec &&
      extra.afternoon.every((leg) =>
        trips.some((t) =>
          tripMatchesLeg(
            t,
            vehicle.id,
            day,
            new RegExp(leg.originRe || '.', 'i'),
            new RegExp(leg.destRe || '.', 'i')
          )
        )
      );
    if (isFull && (!afternoonSpec || !afternoonAlready)) {
      vehicle.estimatedFuelLiters = tank;
    }
    const vi = vehicles.findIndex((v) => v.id === vehicle.id);
    vehicles[vi] = vehicle;
    return finishFillUp(
      {
        ok: true,
        already: true,
        reason: 'fillup-already-present',
        vehicleId: vehicle.id,
        tripId: dayTrip?.id ?? commute.tripId,
        fillUpId: fillUps.find(
          (f) =>
            Number(f.vehicleId) === Number(vehicle.id) &&
            String(f.date || '').slice(0, 10) === day
        )?.id,
        liters,
        totalCost,
        pricePerLiter,
        estimatedFuelLiters: vehicle.estimatedFuelLiters,
        odometerKm: vehicle.currentOdometer,
        snapshot: {
          ...data,
          vehicles,
          fillUps,
          trips,
          exportedAt: new Date().toISOString(),
        },
      },
      extra
    );
  }

  const prevFill = lastFillForVehicle(fillUps, vehicle.id);
  const distanceSinceLastKm =
    Math.round(tripKmSince(trips, vehicle.id, prevFill?.date || null) * 10) / 10;

  const fillDate = extra.fillUpAt || `${day}T12:50:00+02:00`;
  const fillUp = {
    id: nextId(fillUps),
    vehicleId: vehicle.id,
    date: fillDate,
    liters,
    pricePerLiter,
    totalCost,
    odometer,
    distanceSinceLastKm: distanceSinceLastKm || dayTrip?.distanceKm || null,
    isFull,
    note: `Plein ${stationName} — ${liters.toFixed(2)} L · ${totalCost.toFixed(2)} €`,
    tripId: dayTrip?.id ?? null,
  };
  fillUps.push(fillUp);

  if (dayTrip && (dayTrip.fillUpId == null || dayTrip.fillUpId === null)) {
    const ti = trips.findIndex((t) => t.id === dayTrip.id);
    if (ti >= 0) trips[ti] = { ...trips[ti], fillUpId: fillUp.id };
  }

  vehicle.estimatedFuelLiters = isFull
    ? tank
    : Math.min(
        tank,
        Math.round(((Number(vehicle.estimatedFuelLiters) || 0) + liters) * 10) / 10
      );
  vehicle.defaultFuelPrice = pricePerLiter;
  if (odometer != null && !(Number(vehicle.currentOdometer) > Number(odometer))) {
    vehicle.currentOdometer = odometer;
    vehicle.trackedKm = 0;
  }
  const vi = vehicles.findIndex((v) => v.id === vehicle.id);
  vehicles[vi] = vehicle;

  return finishFillUp(
    {
      ok: true,
      already: false,
      reason: commute.already ? 'trip-already-present' : 'trip-and-fillup-added',
      vehicleId: vehicle.id,
      tripId: dayTrip?.id ?? commute.tripId,
      fillUpId: fillUp.id,
      liters,
      totalCost,
      pricePerLiter,
      distanceKm: dayTrip?.distanceKm ?? commute.distanceKm,
      estimatedFuelLiters: vehicle.estimatedFuelLiters,
      odometerKm: vehicle.currentOdometer,
      snapshot: {
        ...data,
        schema: data.schema || 1,
        exportedAt: new Date().toISOString(),
        vehicles,
        trips,
        fillUps,
        places: data.places,
      },
    },
    extra
  );
}
