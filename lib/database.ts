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
      odometer REAL NOT NULL,
      is_full INTEGER NOT NULL DEFAULT 1,
      note TEXT,
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
      destination_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );
  `);
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
    odometer: r.odometer as number,
    isFull: Boolean(r.is_full),
    note: r.note as string | undefined,
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
    destinationName: r.destination_name as string | undefined,
    isActive: Boolean(r.is_active),
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
    `INSERT INTO vehicles (name, brand, model, year, fuel_type, consumption_per_100, tank_capacity, default_fuel_price, current_odometer, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  if (vehicle.isActive !== undefined) { fields.push('is_active = ?'); values.push(vehicle.isActive ? 1 : 0); }

  if (fields.length === 0) return;
  values.push(id);
  await database.runAsync(`UPDATE vehicles SET ${fields.join(', ')} WHERE id = ?`, values);
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

// --- Fill-ups ---

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

export async function createFillUp(fillUp: Omit<FillUp, 'id'>): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO fill_ups (vehicle_id, date, liters, price_per_liter, total_cost, odometer, is_full, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fillUp.vehicleId,
      fillUp.date,
      fillUp.liters,
      fillUp.pricePerLiter,
      fillUp.totalCost,
      fillUp.odometer,
      fillUp.isFull ? 1 : 0,
      fillUp.note ?? null,
    ]
  );
  await database.runAsync('UPDATE vehicles SET current_odometer = ? WHERE id = ?', [
    fillUp.odometer,
    fillUp.vehicleId,
  ]);
  return result.lastInsertRowId;
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

export async function getTrips(vehicleId?: number): Promise<Trip[]> {
  const database = await getDatabase();
  if (vehicleId) {
    const rows = await database.getAllAsync(
      'SELECT * FROM trips WHERE vehicle_id = ? ORDER BY start_time DESC',
      [vehicleId]
    );
    return rows.map(mapTrip);
  }
  const rows = await database.getAllAsync('SELECT * FROM trips ORDER BY start_time DESC');
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
    `INSERT INTO trips (vehicle_id, start_time, end_time, distance_km, estimated_fuel_used, estimated_cost, route_points, destination_name, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trip.vehicleId,
      trip.startTime,
      trip.endTime,
      trip.distanceKm,
      trip.estimatedFuelUsed,
      trip.estimatedCost,
      trip.routePoints,
      trip.destinationName ?? null,
      trip.isActive ? 1 : 0,
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
  if (trip.isActive !== undefined) { fields.push('is_active = ?'); values.push(trip.isActive ? 1 : 0); }

  if (fields.length === 0) return;
  values.push(id);
  await database.runAsync(`UPDATE trips SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function stopActiveTrips(): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE trips SET is_active = 0, end_time = datetime('now') WHERE is_active = 1"
  );
}
