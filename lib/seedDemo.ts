import {
  addTrackedKm,
  createBudget,
  createFillUp,
  createTrip,
  createVehicle,
  getVehicles,
} from '@/lib/database';
import { refreshBudgets } from '@/lib/calculations';
import { seedTodayCommuteAndFillUp } from '@/lib/seedToday';

function daysAgo(n: number, hour = 8, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Jeu de données réaliste : 1 véhicule, trajets datés, pleins liés, budget.
 * Utile pour tester Accueil / Véhicules / Trajets / Pleins / Budget.
 */
export async function seedDemoData(): Promise<{ vehicleId: number; trips: number; fillUps: number }> {
  const existing = await getVehicles();
  if (existing.length > 0) {
    throw new Error('Des véhicules existent déjà. Videz-les ou utilisez un appareil vide.');
  }

  const vehicleId = await createVehicle({
    name: '806 famille',
    brand: 'Peugeot',
    model: '806',
    year: 2001,
    fuelType: 'diesel',
    consumptionPer100: 7.8,
    tankCapacity: 80,
    defaultFuelPrice: 1.72,
    currentOdometer: 248500,
    hasOdometer: false,
    trackedKm: 0,
    estimatedFuelLiters: null,
    consumptionAutoAdapt: true,
    isActive: true,
  });

  const price = 1.72;
  const conso = 7.8;

  const tripDefs = [
    {
      days: 28,
      startH: 7,
      endH: 8,
      km: 42,
      origin: 'Domicile — Lille',
      dest: 'Bureau — Euralille',
      source: 'manual' as const,
      status: 'confirmed' as const,
    },
    {
      days: 27,
      startH: 18,
      endH: 19,
      km: 41,
      origin: 'Bureau — Euralille',
      dest: 'Domicile — Lille',
      source: 'manual' as const,
      status: 'confirmed' as const,
    },
    {
      days: 21,
      startH: 9,
      endH: 11,
      km: 118,
      origin: 'Lille',
      dest: 'Bruxelles — Grand-Place',
      source: 'maps_import' as const,
      status: 'confirmed' as const,
    },
    {
      days: 14,
      startH: 14,
      endH: 15,
      km: 28,
      origin: 'Auchan Englos',
      dest: 'Domicile — Lille',
      source: 'detected' as const,
      status: 'confirmed' as const,
    },
    {
      days: 10,
      startH: 8,
      endH: 12,
      km: 225,
      origin: 'Lille',
      dest: 'Paris — Gare du Nord',
      source: 'maps_import' as const,
      status: 'confirmed' as const,
    },
    {
      days: 5,
      startH: 16,
      endH: 17,
      km: 12,
      origin: 'Marché Wazemmes',
      dest: 'Domicile — Lille',
      source: 'detected' as const,
      status: 'confirmed' as const,
    },
    {
      days: 2,
      startH: 10,
      endH: 11,
      km: 35,
      origin: 'Domicile — Lille',
      dest: 'IKEA Lomme',
      source: 'detected' as const,
      status: 'pending' as const,
      note: 'Détecté voiture — à valider',
    },
    {
      days: 1,
      startH: 19,
      endH: 20,
      km: 3.2,
      origin: 'Parking centre',
      dest: 'Domicile — Lille',
      source: 'detected' as const,
      status: 'pending' as const,
      note: 'Mode indéfini — à classer',
    },
  ];

  let tracked = 0;
  for (const t of tripDefs) {
    const fuel = (t.km * conso) / 100;
    const cost = fuel * price;
    await createTrip({
      vehicleId,
      startTime: daysAgo(t.days, t.startH, 15),
      endTime: daysAgo(t.days, t.endH, 5),
      distanceKm: t.km,
      estimatedFuelUsed: Math.round(fuel * 100) / 100,
      estimatedCost: Math.round(cost * 100) / 100,
      routePoints: '[]',
      originName: t.origin,
      destinationName: t.dest,
      isActive: false,
      status: t.status,
      source: t.source,
      fillUpId: null,
      note: t.note,
    });
    if (t.status === 'confirmed') tracked += t.km;
  }
  await addTrackedKm(vehicleId, tracked);

  const fill1 = await createFillUp({
    vehicleId,
    date: daysAgo(26, 12),
    liters: 55,
    pricePerLiter: 1.69,
    totalCost: 55 * 1.69,
    odometer: null,
    distanceSinceLastKm: 480,
    isFull: true,
    note: 'Station Total Englos',
    tripId: null,
  });

  await createFillUp({
    vehicleId,
    date: daysAgo(9, 11),
    liters: 48,
    pricePerLiter: 1.74,
    totalCost: 48 * 1.74,
    odometer: null,
    distanceSinceLastKm: 390,
    isFull: true,
    note: 'Autoroute A1 — aire de repose',
    tripId: null,
  });

  await createFillUp({
    vehicleId,
    date: daysAgo(3, 17),
    liters: 22,
    pricePerLiter: price,
    totalCost: 22 * price,
    odometer: null,
    distanceSinceLastKm: 160,
    isFull: false,
    note: 'Demi-plein Intermarché',
    tripId: null,
  });

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(0);

  await createBudget({
    vehicleId,
    name: 'Carburant du mois',
    amount: 250,
    period: 'monthly',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    isActive: true,
  });

  await refreshBudgets(vehicleId);

  // Journée d’aujourd’hui : domicile↔travail + plein
  const today = await seedTodayCommuteAndFillUp(vehicleId);

  return {
    vehicleId,
    trips: tripDefs.length + today.tripsAdded,
    fillUps: 3 + (today.fillUpAdded ? 1 : 0),
  };
}
