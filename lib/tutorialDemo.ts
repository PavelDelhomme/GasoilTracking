/**
 * Données d’exemple pour le tutoriel interactif — marquées et nettoyables.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addTrackedKm,
  createBudget,
  createFillUp,
  createPlace,
  createTrip,
  createVehicle,
  deleteBudget,
  deletePlace,
  deleteVehicle,
  getBudgets,
  getPlaces,
  getVehicles,
  setActiveVehicle,
} from '@/lib/database';
import { setFuelLiters } from '@/lib/fuelLevel';
import { refreshBudgets } from '@/lib/calculations';
import { SIM_HOME, SIM_WORK } from '@/lib/gpsCarSimulator';

const IDS_KEY = 'gasoil_tutorial_demo_ids_v1';

export const TUTORIAL_VEHICLE_NAME = 'Démo · Peugeot 208';

export type TutorialDemoIds = {
  vehicleId: number;
  placeIds: number[];
  budgetIds: number[];
};

function daysAgo(n: number, hour = 8, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function saveIds(ids: TutorialDemoIds): Promise<void> {
  await AsyncStorage.setItem(IDS_KEY, JSON.stringify(ids));
}

export async function getTutorialDemoIds(): Promise<TutorialDemoIds | null> {
  try {
    const raw = await AsyncStorage.getItem(IDS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TutorialDemoIds;
  } catch {
    return null;
  }
}

export function isTutorialDemoVehicleName(name: string): boolean {
  return /^Démo\s*·/i.test(name.trim()) || name.includes('Démo ·');
}

/** Crée un jeu de données d’exemple (véhicule, lieux, trajets, pleins, budget). */
export async function seedTutorialDemo(): Promise<TutorialDemoIds> {
  await cleanupTutorialDemo();

  const vehicleId = await createVehicle({
    name: TUTORIAL_VEHICLE_NAME,
    brand: 'Peugeot',
    model: '208',
    year: 2019,
    fuelType: 'essence',
    consumptionPer100: 5.4,
    tankCapacity: 50,
    defaultFuelPrice: 1.72,
    currentOdometer: 68420,
    hasOdometer: true,
    trackedKm: 0,
    estimatedFuelLiters: 28,
    consumptionAutoAdapt: true,
    isActive: true,
    curbWeightKg: 1180,
    dragAreaScx: 0.65,
    vehicleSegment: 'city',
  });
  await setActiveVehicle(vehicleId);
  try {
    const v = (await getVehicles()).find((x) => x.id === vehicleId);
    if (v) await setFuelLiters(v, 28);
  } catch {
    /* ignore */
  }

  const placeIds: number[] = [];
  const places = await getPlaces();
  let home = places.find((p) => p.kind === 'home');
  let work = places.find((p) => p.kind === 'work');
  if (!home) {
    const id = await createPlace({
      name: 'Domicile (démo)',
      address: 'Thorigné-Fouillard',
      kind: 'home',
      latitude: SIM_HOME.latitude,
      longitude: SIM_HOME.longitude,
    });
    placeIds.push(id);
  }
  if (!work) {
    const id = await createPlace({
      name: 'Travail (démo)',
      address: 'Intermarché La Guerche-de-Bretagne',
      kind: 'work',
      latitude: SIM_WORK.latitude,
      longitude: SIM_WORK.longitude,
    });
    placeIds.push(id);
  }

  const price = 1.72;
  const conso = 5.4;
  const tripDefs = [
    { days: 5, h0: 7, h1: 8, km: 44, o: 'Domicile (démo)', d: 'Travail (démo)' },
    { days: 5, h0: 17, h1: 18, km: 44, o: 'Travail (démo)', d: 'Domicile (démo)' },
    { days: 3, h0: 10, h1: 11, km: 18, o: 'Domicile (démo)', d: 'Courses' },
    { days: 1, h0: 8, h1: 9, km: 44, o: 'Domicile (démo)', d: 'Travail (démo)' },
  ];
  let tracked = 0;
  for (const t of tripDefs) {
    const fuel = (t.km * conso) / 100;
    await createTrip({
      vehicleId,
      startTime: daysAgo(t.days, t.h0, 10),
      endTime: daysAgo(t.days, t.h1, 5),
      distanceKm: t.km,
      estimatedFuelUsed: Math.round(fuel * 100) / 100,
      estimatedCost: Math.round(fuel * price * 100) / 100,
      routePoints: '[]',
      originName: t.o,
      destinationName: t.d,
      isActive: false,
      status: 'confirmed',
      source: 'manual',
      fillUpId: null,
      note: 'Tutoriel démo',
    });
    tracked += t.km;
  }
  await addTrackedKm(vehicleId, tracked);

  await createFillUp({
    vehicleId,
    date: daysAgo(6, 12),
    liters: 38,
    pricePerLiter: 1.69,
    totalCost: 38 * 1.69,
    odometer: 68240,
    distanceSinceLastKm: 420,
    isFull: true,
    note: 'Tutoriel démo — plein complet',
    tripId: null,
  });
  await createFillUp({
    vehicleId,
    date: daysAgo(2, 18),
    liters: 22,
    pricePerLiter: price,
    totalCost: 22 * price,
    odometer: 68400,
    distanceSinceLastKm: 160,
    isFull: false,
    note: 'Tutoriel démo — demi-plein',
    tripId: null,
  });

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(0);

  const budgetId = await createBudget({
    vehicleId,
    name: 'Budget démo — carburant',
    amount: 180,
    period: 'monthly',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    isActive: true,
  });
  await refreshBudgets(vehicleId);

  const ids: TutorialDemoIds = { vehicleId, placeIds, budgetIds: [budgetId] };
  await saveIds(ids);
  return ids;
}

/** Supprime uniquement les données créées par le tutoriel. */
export async function cleanupTutorialDemo(): Promise<void> {
  const ids = await getTutorialDemoIds();
  const vehicles = await getVehicles();
  const demoVehicles = vehicles.filter(
    (v) =>
      (ids && v.id === ids.vehicleId) || isTutorialDemoVehicleName(v.name)
  );

  for (const v of demoVehicles) {
    try {
      await deleteVehicle(v.id);
    } catch {
      /* ignore */
    }
  }

  if (ids?.budgetIds?.length) {
    for (const bid of ids.budgetIds) {
      try {
        await deleteBudget(bid);
      } catch {
        /* ignore */
      }
    }
  } else {
    const budgets = await getBudgets();
    for (const b of budgets) {
      if (/démo|demo/i.test(b.name)) {
        try {
          await deleteBudget(b.id);
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (ids?.placeIds?.length) {
    for (const pid of ids.placeIds) {
      try {
        await deletePlace(pid);
      } catch {
        /* ignore */
      }
    }
  } else {
    const places = await getPlaces();
    for (const p of places) {
      if (/\(démo\)|demo/i.test(p.name)) {
        try {
          await deletePlace(p.id);
        } catch {
          /* ignore */
        }
      }
    }
  }

  await AsyncStorage.removeItem(IDS_KEY);
}
