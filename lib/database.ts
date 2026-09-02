import * as SQLite from 'expo-sqlite';
import type { Budget, FillUp, Trip, Vehicle } from '@/types';

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
  return result.lastInsertRowId;
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

export async function createTrip(trip: Omit<Trip, 'id'>): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO trips (vehicle_id, start_time, end_time, distance_km, estimated_fuel_used, estimated_cost, route_points, origin_name, destination_name, is_active, status, source, fill_up_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
