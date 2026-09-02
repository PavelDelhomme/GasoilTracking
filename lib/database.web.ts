/**
 * Stockage web : AsyncStorage (localStorage) — pas d'ExpoSQLite.
 * Même API publique que database.ts (natif).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Budget, FillUp, Trip, Vehicle } from '@/types';

const STORAGE_KEY = 'gasoil_tracking_v1';

interface Store {
  seq: { vehicles: number; fillUps: number; budgets: number; trips: number };
  vehicles: Vehicle[];
  fillUps: FillUp[];
  budgets: Budget[];
  trips: Trip[];
}

const emptyStore = (): Store => ({
  seq: { vehicles: 1, fillUps: 1, budgets: 1, trips: 1 },
  vehicles: [],
  fillUps: [],
  budgets: [],
  trips: [],
});

let cache: Store | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = { ...emptyStore(), ...JSON.parse(raw) } as Store;
      // migrations soft
      parsed.trips = (parsed.trips || []).map((t) => ({
        ...t,
        status: t.status || 'confirmed',
        source: t.source || 'gps',
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

// --- Vehicles ---

export async function getVehicles(): Promise<Vehicle[]> {
  const s = await load();
  return [...s.vehicles].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
}

export async function getActiveVehicle(): Promise<Vehicle | null> {
  const s = await load();
  return s.vehicles.find((v) => v.isActive) ?? null;
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

export async function deleteVehicle(id: number): Promise<void> {
  const s = await load();
  s.vehicles = s.vehicles.filter((v) => v.id !== id);
  s.fillUps = s.fillUps.filter((f) => f.vehicleId !== id);
  s.trips = s.trips.filter((t) => t.vehicleId !== id);
  s.budgets = s.budgets.map((b) => (b.vehicleId === id ? { ...b, vehicleId: null } : b));
  await save(s);
}

export async function setActiveVehicle(id: number): Promise<void> {
  const s = await load();
  s.vehicles = s.vehicles.map((v) => ({ ...v, isActive: v.id === id }));
  await save(s);
}

// --- Fill-ups ---

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

export async function deleteFillUp(id: number): Promise<void> {
  const s = await load();
  s.fillUps = s.fillUps.filter((f) => f.id !== id);
  await save(s);
}

// --- Budgets ---

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

export async function deleteBudget(id: number): Promise<void> {
  const s = await load();
  s.budgets = s.budgets.filter((b) => b.id !== id);
  await save(s);
}

// --- Trips ---

export async function getTrips(vehicleId?: number, opts?: { includeRejected?: boolean }): Promise<Trip[]> {
  const s = await load();
  let list = vehicleId ? s.trips.filter((t) => t.vehicleId === vehicleId) : s.trips;
  if (!opts?.includeRejected) {
    list = list.filter((t) => t.status !== 'rejected');
  }
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

export async function stopActiveTrips(): Promise<void> {
  const s = await load();
  const end = nowIso();
  s.trips = s.trips.map((t) => (t.isActive ? { ...t, isActive: false, endTime: end } : t));
  await save(s);
}
