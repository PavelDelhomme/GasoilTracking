import type {
  Budget,
  FillUp,
  Place,
  RecurringRoute,
  Trip,
  Vehicle,
  VehicleMaintenance,
} from '@/types';
import {
  getBudgets,
  getFillUps,
  getMaintenances,
  getPlaces,
  getRecurringRoutes,
  getTrips,
  getVehicles,
  hasLocalUserData,
  replaceAllData,
} from '@/lib/database';
import { getLocalAppVersion } from '@/lib/api';

export const SNAPSHOT_SCHEMA = 1;

export type AppDataSnapshot = {
  schema: number;
  exportedAt: string;
  appVersion: string;
  vehicles: Vehicle[];
  fillUps: FillUp[];
  budgets: Budget[];
  trips: Trip[];
  places: Place[];
  recurringRoutes: RecurringRoute[];
  maintenances: VehicleMaintenance[];
};

export async function collectSnapshot(): Promise<AppDataSnapshot> {
  const [vehicles, fillUps, budgets, trips, places, recurringRoutes, maintenances] =
    await Promise.all([
      getVehicles(),
      getFillUps(),
      getBudgets(),
      getTrips(undefined, { includeRejected: true }),
      getPlaces(),
      getRecurringRoutes(),
      getMaintenances(),
    ]);
  return {
    schema: SNAPSHOT_SCHEMA,
    exportedAt: new Date().toISOString(),
    appVersion: getLocalAppVersion(),
    vehicles,
    fillUps,
    budgets,
    trips,
    places,
    recurringRoutes,
    maintenances,
  };
}

export function normalizeSnapshot(raw: unknown): AppDataSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const vehicles = Array.isArray(d.vehicles) ? (d.vehicles as Vehicle[]) : [];
  const fillUps = Array.isArray(d.fillUps) ? (d.fillUps as FillUp[]) : [];
  const budgets = Array.isArray(d.budgets) ? (d.budgets as Budget[]) : [];
  const trips = Array.isArray(d.trips) ? (d.trips as Trip[]) : [];
  const places = Array.isArray(d.places) ? (d.places as Place[]) : [];
  const recurringRoutes = Array.isArray(d.recurringRoutes)
    ? (d.recurringRoutes as RecurringRoute[])
    : Array.isArray(d.routes)
      ? (d.routes as RecurringRoute[])
      : [];
  const maintenances = Array.isArray(d.maintenances)
    ? (d.maintenances as VehicleMaintenance[])
    : [];
  if (
    vehicles.length +
      fillUps.length +
      budgets.length +
      trips.length +
      places.length +
      maintenances.length ===
      0 &&
    recurringRoutes.length === 0
  ) {
    return null;
  }
  return {
    schema: typeof d.schema === 'number' ? d.schema : SNAPSHOT_SCHEMA,
    exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : new Date().toISOString(),
    appVersion: typeof d.appVersion === 'string' ? d.appVersion : '0.0.0',
    vehicles,
    fillUps,
    budgets,
    trips,
    places,
    recurringRoutes,
    maintenances,
  };
}

export async function applySnapshot(
  snap: AppDataSnapshot,
  mode: 'replace' | 'replace-if-empty' = 'replace-if-empty'
): Promise<boolean> {
  if (mode === 'replace-if-empty' && (await hasLocalUserData())) {
    return false;
  }
  await replaceAllData({
    vehicles: snap.vehicles,
    fillUps: snap.fillUps,
    budgets: snap.budgets,
    trips: snap.trips,
    places: snap.places,
    recurringRoutes: snap.recurringRoutes,
    maintenances: snap.maintenances || [],
  });
  return true;
}

export { hasLocalUserData };
