import * as SQLite from 'expo-sqlite';
import type { Budget, FillUp, Place, PlaceKind, RecurringRoute, Trip, Vehicle } from '@/types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('gasoil_tracking.db');
    await initDatabase(db);
  }
  return db;
}

async function initDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      fuel_type TEXT NOT NULL DEFAULT 'diesel',
      consumption_per_100 REAL NOT NULL DEFAULT 6.0,
      tank_capacity REAL NOT NULL DEFAULT 50,
      default_fuel_price REAL NOT NULL DEFAULT 1.75,
      current_odometer REAL NOT NULL DEFAULT 0,
      has_odometer INTEGER NOT NULL DEFAULT 1,
      tracked_km REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fill_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      liters REAL NOT NULL,
      price_per_liter REAL NOT NULL,
      total_cost REAL NOT NULL,
      odometer REAL,
      distance_since_last_km REAL,
      is_full INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      trip_id INTEGER,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      spent REAL NOT NULL DEFAULT 0,
      period TEXT NOT NULL DEFAULT 'monthly',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      distance_km REAL NOT NULL DEFAULT 0,
      estimated_fuel_used REAL NOT NULL DEFAULT 0,
      estimated_cost REAL NOT NULL DEFAULT 0,
      route_points TEXT NOT NULL DEFAULT '[]',
      origin_name TEXT,
      destination_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'confirmed',
      source TEXT NOT NULL DEFAULT 'gps',
      fill_up_id INTEGER,
      note TEXT,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'other',
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recurring_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER,
      name TEXT NOT NULL,
      from_place_id INTEGER NOT NULL,
      to_place_id INTEGER NOT NULL,
      distance_km REAL NOT NULL DEFAULT 0,
      times_per_week REAL NOT NULL DEFAULT 5,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (from_place_id) REFERENCES places(id) ON DELETE CASCADE,
      FOREIGN KEY (to_place_id) REFERENCES places(id) ON DELETE CASCADE
    );
  `);

  // Migrations douces (anciennes bases)
  const alterSafe = async (sql: string) => {
    try {
      await database.execAsync(sql);
    } catch {
      /* colonne déjà présente */
    }
  };
  await alterSafe('ALTER TABLE vehicles ADD COLUMN has_odometer INTEGER NOT NULL DEFAULT 1');
  await alterSafe('ALTER TABLE vehicles ADD COLUMN tracked_km REAL NOT NULL DEFAULT 0');
  await alterSafe('ALTER TABLE fill_ups ADD COLUMN distance_since_last_km REAL');
  await alterSafe('ALTER TABLE fill_ups ADD COLUMN trip_id INTEGER');
  await alterSafe('ALTER TABLE trips ADD COLUMN origin_name TEXT');
  await alterSafe("ALTER TABLE trips ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'");
  await alterSafe("ALTER TABLE trips ADD COLUMN source TEXT NOT NULL DEFAULT 'gps'");
  await alterSafe('ALTER TABLE trips ADD COLUMN fill_up_id INTEGER');
  await alterSafe('ALTER TABLE trips ADD COLUMN note TEXT');
  await alterSafe('ALTER TABLE trips ADD COLUMN is_paused INTEGER NOT NULL DEFAULT 0');
}

function mapVehicle(row: unknown): Vehicle {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as number,
    name: r.name as string,
    brand: r.brand as string,
    model: r.model as string,
    year: r.year as number,
    fuelType: r.fuel_type as Vehicle['fuelType'],
    consumptionPer100: r.consumption_per_100 as number,
    tankCapacity: r.tank_capacity as number,
    defaultFuelPrice: r.default_fuel_price as number,
    currentOdometer: r.current_odometer as number,
    hasOdometer: r.has_odometer === undefined ? true : Boolean(r.has_odometer),
    trackedKm: (r.tracked_km as number) ?? 0,
    isActive: Boolean(r.is_active),
    createdAt: r.created_at as string,
  };
}

function mapFillUp(row: unknown): FillUp {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as number,
    vehicleId: r.vehicle_id as number,
    date: r.date as string,
    liters: r.liters as number,
    pricePerLiter: r.price_per_liter as number,
    totalCost: r.total_cost as number,
    odometer: r.odometer === null || r.odometer === undefined ? null : (r.odometer as number),
    distanceSinceLastKm:
      r.distance_since_last_km === null || r.distance_since_last_km === undefined
        ? null
        : (r.distance_since_last_km as number),
    isFull: Boolean(r.is_full),
    note: r.note as string | undefined,
    tripId: r.trip_id === null || r.trip_id === undefined ? null : (r.trip_id as number),
  };
}

function mapBudget(row: unknown): Budget {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as number,
    vehicleId: r.vehicle_id as number | null,
    name: r.name as string,
    amount: r.amount as number,
    spent: r.spent as number,
    period: r.period as Budget['period'],
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    isActive: Boolean(r.is_active),
  };
}

function mapTrip(row: unknown): Trip {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as number,
    vehicleId: r.vehicle_id as number,
    startTime: r.start_time as string,
    endTime: r.end_time as string | null,
    distanceKm: r.distance_km as number,
    estimatedFuelUsed: r.estimated_fuel_used as number,
    estimatedCost: r.estimated_cost as number,
    routePoints: r.route_points as string,
    originName: (r.origin_name as string) || undefined,
    destinationName: r.destination_name as string | undefined,
    isActive: Boolean(r.is_active),
    isPaused: Boolean(r.is_paused),
    status: ((r.status as string) || 'confirmed') as Trip['status'],
    source: ((r.source as string) || 'gps') as Trip['source'],
    fillUpId: r.fill_up_id === null || r.fill_up_id === undefined ? null : (r.fill_up_id as number),
    note: (r.note as string) || undefined,
  };
}

// --- Vehicles ---

export async function getVehicles(): Promise<Vehicle[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync('SELECT * FROM vehicles ORDER BY is_active DESC, name ASC');
  return rows.map(mapVehicle);
}

export async function getActiveVehicle(): Promise<Vehicle | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync('SELECT * FROM vehicles WHERE is_active = 1 LIMIT 1');
  return row ? mapVehicle(row) : null;
}

export async function getVehicleById(id: number): Promise<Vehicle | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync('SELECT * FROM vehicles WHERE id = ?', [id]);
  return row ? mapVehicle(row) : null;
}

export async function createVehicle(vehicle: Omit<Vehicle, 'id' | 'createdAt'>): Promise<number> {
  const database = await getDatabase();
  try {
    if (vehicle.isActive) {
      await database.runAsync('UPDATE vehicles SET is_active = 0');
    }
    const result = await database.runAsync(
      `INSERT INTO vehicles (name, brand, model, year, fuel_type, consumption_per_100, tank_capacity, default_fuel_price, current_odometer, has_odometer, tracked_km, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle.name,
        vehicle.brand,
        vehicle.model,
        vehicle.year,
        vehicle.fuelType,
        vehicle.consumptionPer100,
        vehicle.tankCapacity,
        vehicle.defaultFuelPrice,
        vehicle.currentOdometer,
        vehicle.hasOdometer ? 1 : 0,
        vehicle.trackedKm ?? 0,
        vehicle.isActive ? 1 : 0,
      ]
    );
    const id = Number(result.lastInsertRowId);
    if (!id) {
      // Fallback : relire le dernier véhicule
      const row = await database.getFirstAsync<{ id: number }>(
        'SELECT id FROM vehicles ORDER BY id DESC LIMIT 1'
      );
      if (!row?.id) throw new Error('INSERT OK mais id introuvable');
      return row.id;
    }
    return id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`SQLite createVehicle: ${msg}`);
  }
}

export async function updateVehicle(id: number, vehicle: Partial<Vehicle>): Promise<void> {
  const database = await getDatabase();
  if (vehicle.isActive) {
    await database.runAsync('UPDATE vehicles SET is_active = 0');
  }
  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (vehicle.name !== undefined) { fields.push('name = ?'); values.push(vehicle.name); }
  if (vehicle.brand !== undefined) { fields.push('brand = ?'); values.push(vehicle.brand); }
  if (vehicle.model !== undefined) { fields.push('model = ?'); values.push(vehicle.model); }
  if (vehicle.year !== undefined) { fields.push('year = ?'); values.push(vehicle.year); }
  if (vehicle.fuelType !== undefined) { fields.push('fuel_type = ?'); values.push(vehicle.fuelType); }
  if (vehicle.consumptionPer100 !== undefined) { fields.push('consumption_per_100 = ?'); values.push(vehicle.consumptionPer100); }
  if (vehicle.tankCapacity !== undefined) { fields.push('tank_capacity = ?'); values.push(vehicle.tankCapacity); }
  if (vehicle.defaultFuelPrice !== undefined) { fields.push('default_fuel_price = ?'); values.push(vehicle.defaultFuelPrice); }
  if (vehicle.currentOdometer !== undefined) { fields.push('current_odometer = ?'); values.push(vehicle.currentOdometer); }
  if (vehicle.hasOdometer !== undefined) { fields.push('has_odometer = ?'); values.push(vehicle.hasOdometer ? 1 : 0); }
  if (vehicle.trackedKm !== undefined) { fields.push('tracked_km = ?'); values.push(vehicle.trackedKm); }
  if (vehicle.isActive !== undefined) { fields.push('is_active = ?'); values.push(vehicle.isActive ? 1 : 0); }

  if (fields.length === 0) return;
  values.push(id);
  await database.runAsync(`UPDATE vehicles SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function addTrackedKm(vehicleId: number, km: number): Promise<void> {
  if (km <= 0) return;
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE vehicles SET tracked_km = tracked_km + ? WHERE id = ?',
    [km, vehicleId]
  );
}

export async function createFillUp(fillUp: Omit<FillUp, 'id'>): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO fill_ups (vehicle_id, date, liters, price_per_liter, total_cost, odometer, distance_since_last_km, is_full, note, trip_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fillUp.vehicleId,
      fillUp.date,
      fillUp.liters,
      fillUp.pricePerLiter,
      fillUp.totalCost,
      fillUp.odometer,
      fillUp.distanceSinceLastKm,
      fillUp.isFull ? 1 : 0,
      fillUp.note ?? null,
      fillUp.tripId ?? null,
    ]
  );
  if (fillUp.odometer != null) {
    await database.runAsync('UPDATE vehicles SET current_odometer = ? WHERE id = ?', [
      fillUp.odometer,
      fillUp.vehicleId,
    ]);
  }
  if (fillUp.tripId) {
    await database.runAsync('UPDATE trips SET fill_up_id = ? WHERE id = ?', [
      result.lastInsertRowId,
      fillUp.tripId,
    ]);
  }
  return result.lastInsertRowId;
}

export async function deleteVehicle(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM vehicles WHERE id = ?', [id]);
}

export async function setActiveVehicle(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE vehicles SET is_active = 0');
  await database.runAsync('UPDATE vehicles SET is_active = 1 WHERE id = ?', [id]);
}

export async function getFillUps(vehicleId?: number): Promise<FillUp[]> {
  const database = await getDatabase();
  if (vehicleId) {
    const rows = await database.getAllAsync(
      'SELECT * FROM fill_ups WHERE vehicle_id = ? ORDER BY date DESC',
      [vehicleId]
    );
    return rows.map(mapFillUp);
  }
  const rows = await database.getAllAsync('SELECT * FROM fill_ups ORDER BY date DESC');
  return rows.map(mapFillUp);
}

export async function deleteFillUp(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM fill_ups WHERE id = ?', [id]);
}

// --- Budgets ---

export async function getBudgets(vehicleId?: number): Promise<Budget[]> {
  const database = await getDatabase();
  let rows;
  if (vehicleId) {
    rows = await database.getAllAsync(
      'SELECT * FROM budgets WHERE (vehicle_id = ? OR vehicle_id IS NULL) AND is_active = 1 ORDER BY start_date DESC',
      [vehicleId]
    );
  } else {
    rows = await database.getAllAsync('SELECT * FROM budgets WHERE is_active = 1 ORDER BY start_date DESC');
  }
  return rows.map(mapBudget);
}

export async function createBudget(budget: Omit<Budget, 'id' | 'spent'>): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO budgets (vehicle_id, name, amount, period, start_date, end_date, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      budget.vehicleId,
      budget.name,
      budget.amount,
      budget.period,
      budget.startDate,
      budget.endDate,
      budget.isActive ? 1 : 0,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateBudgetSpent(id: number, spent: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE budgets SET spent = ? WHERE id = ?', [spent, id]);
}

export async function updateBudget(
  id: number,
  patch: { amount?: number; name?: string; spent?: number }
): Promise<void> {
  const database = await getDatabase();
  const fields: string[] = [];
  const values: (string | number)[] = [];
  if (patch.amount !== undefined) {
    fields.push('amount = ?');
    values.push(patch.amount);
  }
  if (patch.name !== undefined) {
    fields.push('name = ?');
    values.push(patch.name);
  }
  if (patch.spent !== undefined) {
    fields.push('spent = ?');
    values.push(patch.spent);
  }
  if (!fields.length) return;
  values.push(id);
  await database.runAsync(`UPDATE budgets SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function updateFillUpMoney(
  id: number,
  pricePerLiter: number,
  totalCost: number
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE fill_ups SET price_per_liter = ?, total_cost = ? WHERE id = ?',
    [pricePerLiter, totalCost, id]
  );
}

export async function deleteBudget(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM budgets WHERE id = ?', [id]);
}

// --- Trips ---

export async function getTrips(vehicleId?: number, opts?: { includeRejected?: boolean }): Promise<Trip[]> {
  const database = await getDatabase();
  const includeRejected = opts?.includeRejected === true;
  if (vehicleId) {
    const rows = includeRejected
      ? await database.getAllAsync(
          'SELECT * FROM trips WHERE vehicle_id = ? ORDER BY start_time DESC',
          [vehicleId]
        )
      : await database.getAllAsync(
          "SELECT * FROM trips WHERE vehicle_id = ? AND status != 'rejected' ORDER BY start_time DESC",
          [vehicleId]
        );
    return rows.map(mapTrip);
  }
  const rows = includeRejected
    ? await database.getAllAsync('SELECT * FROM trips ORDER BY start_time DESC')
    : await database.getAllAsync("SELECT * FROM trips WHERE status != 'rejected' ORDER BY start_time DESC");
  return rows.map(mapTrip);
}

export async function getPendingTrips(vehicleId?: number): Promise<Trip[]> {
  const database = await getDatabase();
  if (vehicleId) {
    const rows = await database.getAllAsync(
      "SELECT * FROM trips WHERE vehicle_id = ? AND status = 'pending' ORDER BY start_time DESC",
      [vehicleId]
    );
    return rows.map(mapTrip);
  }
  const rows = await database.getAllAsync(
    "SELECT * FROM trips WHERE status = 'pending' ORDER BY start_time DESC"
  );
  return rows.map(mapTrip);
}

export async function getActiveTrip(): Promise<Trip | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync('SELECT * FROM trips WHERE is_active = 1 LIMIT 1');
  return row ? mapTrip(row) : null;
}

export async function getTripById(id: number): Promise<Trip | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync('SELECT * FROM trips WHERE id = ?', [id]);
  return row ? mapTrip(row) : null;
}

export async function createTrip(trip: Omit<Trip, 'id'>): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO trips (vehicle_id, start_time, end_time, distance_km, estimated_fuel_used, estimated_cost, route_points, origin_name, destination_name, is_active, status, source, fill_up_id, note, is_paused)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trip.vehicleId,
      trip.startTime,
      trip.endTime,
      trip.distanceKm,
      trip.estimatedFuelUsed,
      trip.estimatedCost,
      trip.routePoints,
      trip.originName ?? null,
      trip.destinationName ?? null,
      trip.isActive ? 1 : 0,
      trip.status || 'confirmed',
      trip.source || 'gps',
      trip.fillUpId ?? null,
      trip.note ?? null,
      trip.isPaused ? 1 : 0,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateTrip(id: number, trip: Partial<Trip>): Promise<void> {
  const database = await getDatabase();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (trip.endTime !== undefined) { fields.push('end_time = ?'); values.push(trip.endTime); }
  if (trip.distanceKm !== undefined) { fields.push('distance_km = ?'); values.push(trip.distanceKm); }
  if (trip.estimatedFuelUsed !== undefined) { fields.push('estimated_fuel_used = ?'); values.push(trip.estimatedFuelUsed); }
  if (trip.estimatedCost !== undefined) { fields.push('estimated_cost = ?'); values.push(trip.estimatedCost); }
  if (trip.routePoints !== undefined) { fields.push('route_points = ?'); values.push(trip.routePoints); }
  if (trip.originName !== undefined) { fields.push('origin_name = ?'); values.push(trip.originName); }
  if (trip.destinationName !== undefined) { fields.push('destination_name = ?'); values.push(trip.destinationName); }
  if (trip.isActive !== undefined) { fields.push('is_active = ?'); values.push(trip.isActive ? 1 : 0); }
  if (trip.isPaused !== undefined) { fields.push('is_paused = ?'); values.push(trip.isPaused ? 1 : 0); }
  if (trip.status !== undefined) { fields.push('status = ?'); values.push(trip.status); }
  if (trip.source !== undefined) { fields.push('source = ?'); values.push(trip.source); }
  if (trip.fillUpId !== undefined) { fields.push('fill_up_id = ?'); values.push(trip.fillUpId); }
  if (trip.note !== undefined) { fields.push('note = ?'); values.push(trip.note); }

  if (fields.length === 0) return;
  values.push(id);
  await database.runAsync(`UPDATE trips SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteTrip(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM trips WHERE id = ?', [id]);
}

export async function stopActiveTrips(): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE trips SET is_active = 0, end_time = datetime('now') WHERE is_active = 1"
  );
}

// --- Places & trajets réguliers ---

function mapPlace(row: unknown): Place {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as number,
    name: r.name as string,
    address: (r.address as string) || '',
    kind: (r.kind as PlaceKind) || 'other',
    latitude: r.latitude == null ? null : (r.latitude as number),
    longitude: r.longitude == null ? null : (r.longitude as number),
    createdAt: r.created_at as string,
  };
}

function mapRoute(row: unknown): RecurringRoute {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as number,
    vehicleId: r.vehicle_id == null ? null : (r.vehicle_id as number),
    name: r.name as string,
    fromPlaceId: r.from_place_id as number,
    toPlaceId: r.to_place_id as number,
    distanceKm: r.distance_km as number,
    timesPerWeek: r.times_per_week as number,
    isActive: Boolean(r.is_active),
  };
}

export async function getPlaces(): Promise<Place[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync('SELECT * FROM places ORDER BY kind ASC, name ASC');
  return rows.map(mapPlace);
}

export async function createPlace(place: Omit<Place, 'id' | 'createdAt'>): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO places (name, address, kind, latitude, longitude) VALUES (?, ?, ?, ?, ?)`,
    [place.name, place.address || '', place.kind, place.latitude, place.longitude]
  );
  return Number(result.lastInsertRowId);
}

export async function updatePlace(id: number, place: Partial<Place>): Promise<void> {
  const database = await getDatabase();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (place.name !== undefined) { fields.push('name = ?'); values.push(place.name); }
  if (place.address !== undefined) { fields.push('address = ?'); values.push(place.address); }
  if (place.kind !== undefined) { fields.push('kind = ?'); values.push(place.kind); }
  if (place.latitude !== undefined) { fields.push('latitude = ?'); values.push(place.latitude); }
  if (place.longitude !== undefined) { fields.push('longitude = ?'); values.push(place.longitude); }
  if (!fields.length) return;
  values.push(id);
  await database.runAsync(`UPDATE places SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deletePlace(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM recurring_routes WHERE from_place_id = ? OR to_place_id = ?', [id, id]);
  await database.runAsync('DELETE FROM places WHERE id = ?', [id]);
}

export async function getRecurringRoutes(vehicleId?: number): Promise<RecurringRoute[]> {
  const database = await getDatabase();
  if (vehicleId) {
    const rows = await database.getAllAsync(
      'SELECT * FROM recurring_routes WHERE is_active = 1 AND (vehicle_id = ? OR vehicle_id IS NULL) ORDER BY name',
      [vehicleId]
    );
    return rows.map(mapRoute);
  }
  const rows = await database.getAllAsync(
    'SELECT * FROM recurring_routes WHERE is_active = 1 ORDER BY name'
  );
  return rows.map(mapRoute);
}

export async function createRecurringRoute(
  route: Omit<RecurringRoute, 'id'>
): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO recurring_routes (vehicle_id, name, from_place_id, to_place_id, distance_km, times_per_week, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      route.vehicleId,
      route.name,
      route.fromPlaceId,
      route.toPlaceId,
      route.distanceKm,
      route.timesPerWeek,
      route.isActive ? 1 : 0,
    ]
  );
  return Number(result.lastInsertRowId);
}

export async function deleteRecurringRoute(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM recurring_routes WHERE id = ?', [id]);
}

export async function getMonthlySpend(months = 6): Promise<{ month: string; spent: number }[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ month: string; spent: number }>(
    `SELECT substr(date, 1, 7) AS month, SUM(total_cost) AS spent
     FROM fill_ups
     GROUP BY substr(date, 1, 7)
     ORDER BY month DESC
     LIMIT ?`,
    [months]
  );
  return rows.map((r) => ({ month: r.month, spent: Number(r.spent) || 0 })).reverse();
}

/** Remplace tout le contenu local (préserve les ids) — utilisé backup / sync. */
export async function replaceAllData(data: {
  vehicles: Vehicle[];
  fillUps: FillUp[];
  budgets: Budget[];
  trips: Trip[];
  places: Place[];
  recurringRoutes: RecurringRoute[];
}): Promise<void> {
  const database = await getDatabase();
  await database.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await database.withTransactionAsync(async () => {
      await database.execAsync(`
        DELETE FROM recurring_routes;
        DELETE FROM places;
        DELETE FROM fill_ups;
        DELETE FROM trips;
        DELETE FROM budgets;
        DELETE FROM vehicles;
      `);

      for (const v of data.vehicles || []) {
        await database.runAsync(
          `INSERT INTO vehicles (id, name, brand, model, year, fuel_type, consumption_per_100, tank_capacity, default_fuel_price, current_odometer, has_odometer, tracked_km, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            v.id,
            v.name,
            v.brand,
            v.model,
            v.year,
            v.fuelType,
            v.consumptionPer100,
            v.tankCapacity,
            v.defaultFuelPrice,
            v.currentOdometer,
            v.hasOdometer ? 1 : 0,
            v.trackedKm ?? 0,
            v.isActive ? 1 : 0,
            v.createdAt || new Date().toISOString(),
          ]
        );
      }

      for (const t of data.trips || []) {
        await database.runAsync(
          `INSERT INTO trips (id, vehicle_id, start_time, end_time, distance_km, estimated_fuel_used, estimated_cost, route_points, origin_name, destination_name, is_active, status, source, fill_up_id, note, is_paused)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.id,
            t.vehicleId,
            t.startTime,
            t.endTime,
            t.distanceKm,
            t.estimatedFuelUsed,
            t.estimatedCost,
            t.routePoints || '[]',
            t.originName || null,
            t.destinationName || null,
            t.isActive ? 1 : 0,
            t.status || 'confirmed',
            t.source || 'gps',
            t.fillUpId ?? null,
            t.note || null,
            t.isPaused ? 1 : 0,
          ]
        );
      }

      for (const f of data.fillUps || []) {
        await database.runAsync(
          `INSERT INTO fill_ups (id, vehicle_id, date, liters, price_per_liter, total_cost, odometer, distance_since_last_km, is_full, note, trip_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            f.id,
            f.vehicleId,
            f.date,
            f.liters,
            f.pricePerLiter,
            f.totalCost,
            f.odometer,
            f.distanceSinceLastKm,
            f.isFull ? 1 : 0,
            f.note || null,
            f.tripId ?? null,
          ]
        );
      }

      for (const b of data.budgets || []) {
        await database.runAsync(
          `INSERT INTO budgets (id, vehicle_id, name, amount, spent, period, start_date, end_date, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            b.id,
            b.vehicleId,
            b.name,
            b.amount,
            b.spent,
            b.period,
            b.startDate,
            b.endDate,
            b.isActive ? 1 : 0,
          ]
        );
      }

      for (const p of data.places || []) {
        await database.runAsync(
          `INSERT INTO places (id, name, address, kind, latitude, longitude, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            p.name,
            p.address || '',
            p.kind || 'other',
            p.latitude,
            p.longitude,
            p.createdAt || new Date().toISOString(),
          ]
        );
      }

      for (const r of data.recurringRoutes || []) {
        await database.runAsync(
          `INSERT INTO recurring_routes (id, vehicle_id, name, from_place_id, to_place_id, distance_km, times_per_week, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.id,
            r.vehicleId,
            r.name,
            r.fromPlaceId,
            r.toPlaceId,
            r.distanceKm,
            r.timesPerWeek,
            r.isActive ? 1 : 0,
          ]
        );
      }
    });
  } finally {
    await database.execAsync('PRAGMA foreign_keys = ON;');
  }
}

export async function hasLocalUserData(): Promise<boolean> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ n: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM vehicles) +
       (SELECT COUNT(*) FROM fill_ups) +
       (SELECT COUNT(*) FROM trips) +
       (SELECT COUNT(*) FROM budgets) +
       (SELECT COUNT(*) FROM places)
     ) AS n`
  );
  return (row?.n || 0) > 0;
}
