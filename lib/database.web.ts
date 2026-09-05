/**
 * Stockage web : AsyncStorage — même API que database.ts
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Budget, FillUp, Place, RecurringRoute, Trip, Vehicle, VehicleMaintenance } from '@/types';
import { refreshMaintenanceStatus } from '@/lib/vehicleMaintenance';

const STORAGE_KEY = 'gasoil_tracking_v1';

interface Store {
  seq: {
    vehicles: number;
    fillUps: number;
    budgets: number;
    trips: number;
    places: number;
    routes: number;
    maintenances: number;
  };
  vehicles: Vehicle[];
  fillUps: FillUp[];
  budgets: Budget[];
  trips: Trip[];
  places: Place[];
  routes: RecurringRoute[];
  maintenances: VehicleMaintenance[];
}

const emptyStore = (): Store => ({
  seq: { vehicles: 1, fillUps: 1, budgets: 1, trips: 1, places: 1, routes: 1, maintenances: 1 },
  vehicles: [],
  fillUps: [],
  budgets: [],
  trips: [],
  places: [],
  routes: [],
  maintenances: [],
});

let cache: Store | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = { ...emptyStore(), ...JSON.parse(raw) } as Store;
      parsed.seq = { ...emptyStore().seq, ...parsed.seq };
      parsed.places = parsed.places || [];
      parsed.routes = parsed.routes || [];
      parsed.maintenances = parsed.maintenances || [];
      parsed.trips = (parsed.trips || []).map((t) => ({
        ...t,
        status: t.status || 'confirmed',
        source: t.source || 'gps',
      }));
      parsed.routes = (parsed.routes || []).map((r) => ({
        ...r,
        workDaysPerWeek: r.workDaysPerWeek ?? r.timesPerWeek ?? 5,
        isOnVacation: r.isOnVacation ?? false,
        vacationUntil: r.vacationUntil ?? null,
      }));
      parsed.vehicles = (parsed.vehicles || []).map((v) => ({
        ...v,
        estimatedFuelLiters:
          v.estimatedFuelLiters === undefined ? null : v.estimatedFuelLiters,
        notifyMaintenance: v.notifyMaintenance !== false,
        notifyLowFuel: !!v.notifyLowFuel,
        lowFuelThresholdLiters: v.lowFuelThresholdLiters ?? null,
        consumptionLearnFactor: v.consumptionLearnFactor ?? 1,
        transmissionGears: v.transmissionGears ?? null,
      }));
      cache = parsed;
      return cache;
    }
  } catch (e) {
    console.warn('Lecture stockage web échouée', e);
  }
  cache = emptyStore();
  return cache;
}

async function save(store: Store): Promise<void> {
  cache = store;
  writeChain = writeChain.then(async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  });
  await writeChain;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function getVehicles(): Promise<Vehicle[]> {
  const s = await load();
  return [...s.vehicles].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)
  );
}

export async function getActiveVehicle(): Promise<Vehicle | null> {
  const s = await load();
  const active = s.vehicles.find((v) => v.isActive);
  if (active) return active;
  try {
    const last = await AsyncStorage.getItem('gasoil_last_vehicle_id');
    if (last) {
      const id = Number(last);
      const v = s.vehicles.find((x) => x.id === id);
      if (v) {
        s.vehicles = s.vehicles.map((x) => ({ ...x, isActive: x.id === id }));
        await save(s);
        return { ...v, isActive: true };
      }
    }
  } catch {
    /* ignore */
  }
  if (s.vehicles[0]) {
    const id = s.vehicles[0].id;
    s.vehicles = s.vehicles.map((x) => ({ ...x, isActive: x.id === id }));
    await save(s);
    return { ...s.vehicles[0], isActive: true };
  }
  return null;
}

export async function getVehicleById(id: number): Promise<Vehicle | null> {
  const s = await load();
  return s.vehicles.find((v) => v.id === id) ?? null;
}

export async function createVehicle(vehicle: Omit<Vehicle, 'id' | 'createdAt'>): Promise<number> {
  const s = await load();
  if (vehicle.isActive) {
    s.vehicles = s.vehicles.map((v) => ({ ...v, isActive: false }));
  }
  const id = s.seq.vehicles++;
  s.vehicles.push({
    ...vehicle,
    id,
    trackedKm: vehicle.trackedKm ?? 0,
    estimatedFuelLiters: vehicle.estimatedFuelLiters ?? null,
    consumptionAutoAdapt: vehicle.consumptionAutoAdapt !== false,
    notifyMaintenance: vehicle.notifyMaintenance !== false,
    notifyLowFuel: !!vehicle.notifyLowFuel,
    lowFuelThresholdLiters: vehicle.lowFuelThresholdLiters ?? null,
    consumptionLearnFactor: vehicle.consumptionLearnFactor ?? 1,
    transmissionGears: vehicle.transmissionGears ?? null,
    createdAt: nowIso(),
  });
  await save(s);
  return id;
}

export async function updateVehicle(id: number, vehicle: Partial<Vehicle>): Promise<void> {
  const s = await load();
  if (vehicle.isActive) {
    s.vehicles = s.vehicles.map((v) => ({ ...v, isActive: false }));
  }
  s.vehicles = s.vehicles.map((v) => (v.id === id ? { ...v, ...vehicle, id } : v));
  await save(s);
}

export async function addTrackedKm(vehicleId: number, km: number): Promise<void> {
  if (km <= 0) return;
  const s = await load();
  s.vehicles = s.vehicles.map((v) =>
    v.id === vehicleId ? { ...v, trackedKm: (v.trackedKm ?? 0) + km } : v
  );
  await save(s);
}

/** Aligne trackedKm sur la somme des trajets confirmés. */
export async function reconcileTrackedKmFromTrips(vehicleId: number): Promise<number> {
  const s = await load();
  const sum = s.trips
    .filter((t) => t.vehicleId === vehicleId && !t.isActive && t.status !== 'rejected')
    .reduce((acc, t) => acc + (Number(t.distanceKm) || 0), 0);
  const rounded = Math.round(sum * 10) / 10;
  s.vehicles = s.vehicles.map((v) =>
    v.id === vehicleId ? { ...v, trackedKm: rounded } : v
  );
  await save(s);
  return rounded;
}

export async function deleteVehicle(id: number): Promise<void> {
  const s = await load();
  s.vehicles = s.vehicles.filter((v) => v.id !== id);
  s.fillUps = s.fillUps.filter((f) => f.vehicleId !== id);
  s.trips = s.trips.filter((t) => t.vehicleId !== id);
  s.budgets = s.budgets.map((b) => (b.vehicleId === id ? { ...b, vehicleId: null } : b));
  s.routes = s.routes.map((r) => (r.vehicleId === id ? { ...r, vehicleId: null } : r));
  await save(s);
}

export async function setActiveVehicle(id: number): Promise<void> {
  const s = await load();
  s.vehicles = s.vehicles.map((v) => ({ ...v, isActive: v.id === id }));
  await save(s);
  try {
    await AsyncStorage.setItem('gasoil_last_vehicle_id', String(id));
  } catch {
    /* ignore */
  }
}

export async function createFillUp(fillUp: Omit<FillUp, 'id'>): Promise<number> {
  const s = await load();
  const id = s.seq.fillUps++;
  s.fillUps.push({ ...fillUp, id });
  if (fillUp.odometer != null) {
    s.vehicles = s.vehicles.map((v) =>
      v.id === fillUp.vehicleId ? { ...v, currentOdometer: fillUp.odometer! } : v
    );
  }
  if (fillUp.tripId) {
    s.trips = s.trips.map((t) => (t.id === fillUp.tripId ? { ...t, fillUpId: id } : t));
  }
  await save(s);
  return id;
}

export async function getFillUps(vehicleId?: number): Promise<FillUp[]> {
  const s = await load();
  const list = vehicleId ? s.fillUps.filter((f) => f.vehicleId === vehicleId) : s.fillUps;
  return [...list].sort((a, b) => b.date.localeCompare(a.date));
}

export async function getFillUpById(id: number): Promise<FillUp | null> {
  const s = await load();
  return s.fillUps.find((f) => f.id === id) || null;
}

export async function updateFillUp(
  id: number,
  patch: Partial<
    Pick<
      FillUp,
      | 'date'
      | 'liters'
      | 'pricePerLiter'
      | 'totalCost'
      | 'odometer'
      | 'distanceSinceLastKm'
      | 'isFull'
      | 'note'
    >
  >
): Promise<void> {
  const s = await load();
  s.fillUps = s.fillUps.map((f) => (f.id === id ? { ...f, ...patch, id } : f));
  await save(s);
}

export async function deleteFillUp(id: number): Promise<void> {
  const s = await load();
  s.fillUps = s.fillUps.filter((f) => f.id !== id);
  await save(s);
}

export async function getBudgets(vehicleId?: number): Promise<Budget[]> {
  const s = await load();
  let list = s.budgets.filter((b) => b.isActive);
  if (vehicleId) {
    list = list.filter((b) => b.vehicleId === vehicleId || b.vehicleId == null);
  }
  return [...list].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export async function createBudget(budget: Omit<Budget, 'id' | 'spent'>): Promise<number> {
  const s = await load();
  const id = s.seq.budgets++;
  s.budgets.push({ ...budget, id, spent: 0 });
  await save(s);
  return id;
}

export async function updateBudgetSpent(id: number, spent: number): Promise<void> {
  const s = await load();
  s.budgets = s.budgets.map((b) => (b.id === id ? { ...b, spent } : b));
  await save(s);
}

export async function updateBudget(
  id: number,
  patch: { amount?: number; name?: string; spent?: number }
): Promise<void> {
  const s = await load();
  s.budgets = s.budgets.map((b) => (b.id === id ? { ...b, ...patch, id } : b));
  await save(s);
}

export async function updateFillUpMoney(
  id: number,
  pricePerLiter: number,
  totalCost: number
): Promise<void> {
  const s = await load();
  s.fillUps = s.fillUps.map((f) =>
    f.id === id ? { ...f, pricePerLiter, totalCost } : f
  );
  await save(s);
}

export async function deleteBudget(id: number): Promise<void> {
  const s = await load();
  s.budgets = s.budgets.filter((b) => b.id !== id);
  await save(s);
}

export async function getTrips(
  vehicleId?: number,
  opts?: { includeRejected?: boolean }
): Promise<Trip[]> {
  const s = await load();
  let list = vehicleId ? s.trips.filter((t) => t.vehicleId === vehicleId) : s.trips;
  if (!opts?.includeRejected) list = list.filter((t) => t.status !== 'rejected');
  return [...list].sort((a, b) => b.startTime.localeCompare(a.startTime));
}

export async function getPendingTrips(vehicleId?: number): Promise<Trip[]> {
  const s = await load();
  let list = s.trips.filter((t) => t.status === 'pending');
  if (vehicleId) list = list.filter((t) => t.vehicleId === vehicleId);
  return [...list].sort((a, b) => b.startTime.localeCompare(a.startTime));
}

export async function getActiveTrip(): Promise<Trip | null> {
  const s = await load();
  return s.trips.find((t) => t.isActive) ?? null;
}

export async function getTripById(id: number): Promise<Trip | null> {
  const s = await load();
  return s.trips.find((t) => t.id === id) ?? null;
}

export async function createTrip(trip: Omit<Trip, 'id'>): Promise<number> {
  const s = await load();
  const id = s.seq.trips++;
  s.trips.push({
    ...trip,
    id,
    status: trip.status || 'confirmed',
    source: trip.source || 'gps',
  });
  await save(s);
  return id;
}

export async function updateTrip(id: number, trip: Partial<Trip>): Promise<void> {
  const s = await load();
  s.trips = s.trips.map((t) => (t.id === id ? { ...t, ...trip, id } : t));
  await save(s);
}

export async function deleteTrip(id: number): Promise<void> {
  const s = await load();
  s.trips = s.trips.filter((t) => t.id !== id);
  await save(s);
}

/** Supprime les trajets de test (simulateur). */
export async function purgeSimulatorTrips(vehicleId?: number): Promise<number> {
  const s = await load();
  const before = s.trips.length;
  s.trips = s.trips.filter((t) => {
    if (vehicleId != null && t.vehicleId !== vehicleId) return true;
    const sim =
      /SIMULATEUR/i.test(t.note || '') ||
      /\(sim\)/i.test(t.originName || '') ||
      /\(sim\)/i.test(t.destinationName || '');
    return !sim;
  });
  const removed = before - s.trips.length;
  if (removed > 0) await save(s);
  return removed;
}

export async function stopActiveTrips(): Promise<void> {
  const s = await load();
  const end = nowIso();
  s.trips = s.trips.map((t) => (t.isActive ? { ...t, isActive: false, endTime: end } : t));
  await save(s);
}

export async function getPlaces(): Promise<Place[]> {
  const s = await load();
  return [...s.places].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

export async function createPlace(place: Omit<Place, 'id' | 'createdAt'>): Promise<number> {
  const s = await load();
  const id = s.seq.places++;
  s.places.push({ ...place, id, createdAt: nowIso() });
  await save(s);
  return id;
}

export async function updatePlace(id: number, place: Partial<Place>): Promise<void> {
  const s = await load();
  s.places = s.places.map((p) => (p.id === id ? { ...p, ...place, id } : p));
  await save(s);
}

export async function deletePlace(id: number): Promise<void> {
  const s = await load();
  s.routes = s.routes.filter((r) => r.fromPlaceId !== id && r.toPlaceId !== id);
  s.places = s.places.filter((p) => p.id !== id);
  await save(s);
}

export async function getRecurringRoutes(vehicleId?: number): Promise<RecurringRoute[]> {
  const s = await load();
  let list = s.routes.filter((r) => r.isActive);
  if (vehicleId) list = list.filter((r) => r.vehicleId === vehicleId || r.vehicleId == null);
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createRecurringRoute(route: Omit<RecurringRoute, 'id'>): Promise<number> {
  const s = await load();
  const id = s.seq.routes++;
  const workDays = route.workDaysPerWeek ?? route.timesPerWeek ?? 5;
  s.routes.push({
    ...route,
    id,
    workDaysPerWeek: workDays,
    timesPerWeek: route.timesPerWeek ?? workDays,
    isOnVacation: route.isOnVacation ?? false,
    vacationUntil: route.vacationUntil ?? null,
  });
  await save(s);
  return id;
}

export async function updateRecurringRoute(
  id: number,
  patch: Partial<Omit<RecurringRoute, 'id'>>
): Promise<void> {
  const s = await load();
  s.routes = s.routes.map((r) => (r.id === id ? { ...r, ...patch, id } : r));
  await save(s);
}

export async function deleteRecurringRoute(id: number): Promise<void> {
  const s = await load();
  s.routes = s.routes.filter((r) => r.id !== id);
  await save(s);
}

/** Remplace tout le contenu local (préserve les ids) — utilisé backup / sync. */
export async function replaceAllData(data: {
  vehicles: Vehicle[];
  fillUps: FillUp[];
  budgets: Budget[];
  trips: Trip[];
  places: Place[];
  recurringRoutes: RecurringRoute[];
  maintenances?: VehicleMaintenance[];
}): Promise<void> {
  const vehicles = data.vehicles || [];
  const fillUps = data.fillUps || [];
  const budgets = data.budgets || [];
  const trips = data.trips || [];
  const places = data.places || [];
  const routes = data.recurringRoutes || [];
  const maintenances = data.maintenances || [];
  const max = (arr: { id: number }[]) => arr.reduce((m, x) => Math.max(m, x.id || 0), 0);
  const store: Store = {
    seq: {
      vehicles: max(vehicles) + 1,
      fillUps: max(fillUps) + 1,
      budgets: max(budgets) + 1,
      trips: max(trips) + 1,
      places: max(places) + 1,
      routes: max(routes) + 1,
      maintenances: max(maintenances) + 1,
    },
    vehicles: [...vehicles],
    fillUps: [...fillUps],
    budgets: [...budgets],
    trips: [...trips],
    places: [...places],
    routes: [...routes],
    maintenances: [...maintenances],
  };
  cache = store;
  await save(store);
}

export async function getMaintenances(vehicleId?: number): Promise<VehicleMaintenance[]> {
  const s = await load();
  const list = (s.maintenances || []).map((m) => ({
    ...m,
    status: refreshMaintenanceStatus(m),
  }));
  return (vehicleId ? list.filter((m) => m.vehicleId === vehicleId) : list).sort((a, b) =>
    String(b.dueDate || b.doneAt || b.createdAt).localeCompare(
      String(a.dueDate || a.doneAt || a.createdAt)
    )
  );
}

export async function createMaintenance(
  m: Omit<VehicleMaintenance, 'id' | 'createdAt'>
): Promise<number> {
  const s = await load();
  if (!s.seq.maintenances) s.seq.maintenances = 1;
  const id = s.seq.maintenances++;
  const createdAt = nowIso();
  const row: VehicleMaintenance = {
    ...m,
    id,
    createdAt,
    status: refreshMaintenanceStatus({ ...m, id, createdAt }),
  };
  s.maintenances = [...(s.maintenances || []), row];
  await save(s);
  return id;
}

export async function updateMaintenance(
  id: number,
  patch: Partial<VehicleMaintenance>
): Promise<void> {
  const s = await load();
  s.maintenances = (s.maintenances || []).map((m) => {
    if (m.id !== id) return m;
    const next = { ...m, ...patch, id };
    return { ...next, status: refreshMaintenanceStatus(next) };
  });
  await save(s);
}

export async function deleteMaintenance(id: number): Promise<void> {
  const s = await load();
  s.maintenances = (s.maintenances || []).filter((m) => m.id !== id);
  await save(s);
}

export async function hasLocalUserData(): Promise<boolean> {
  const s = await load();
  return (
    s.vehicles.length + s.fillUps.length + s.trips.length + s.budgets.length + s.places.length > 0
  );
}

export async function getMonthlySpend(
  months = 6,
  vehicleId?: number
): Promise<{ month: string; spent: number }[]> {
  const s = await load();
  const map = new Map<string, number>();
  for (const f of s.fillUps) {
    if (vehicleId != null && f.vehicleId !== vehicleId) continue;
    const m = f.date.slice(0, 7);
    map.set(m, (map.get(m) || 0) + f.totalCost);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-months)
    .map(([month, spent]) => ({ month, spent }));
}

export async function getMonthlySpendByVehicle(
  months = 6
): Promise<{ month: string; vehicleId: number; spent: number }[]> {
  const s = await load();
  const map = new Map<string, number>();
  for (const f of s.fillUps) {
    const key = `${f.date.slice(0, 7)}:${f.vehicleId}`;
    map.set(key, (map.get(key) || 0) + f.totalCost);
  }
  const monthSet = new Set<string>();
  for (const k of map.keys()) monthSet.add(k.split(':')[0]!);
  const sortedMonths = [...monthSet].sort((a, b) => b.localeCompare(a)).slice(0, months);
  const allowed = new Set(sortedMonths);
  const out: { month: string; vehicleId: number; spent: number }[] = [];
  for (const [key, spent] of map) {
    const [month, vid] = key.split(':');
    if (!allowed.has(month!)) continue;
    out.push({ month: month!, vehicleId: Number(vid), spent });
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
}
