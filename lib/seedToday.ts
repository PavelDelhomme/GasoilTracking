import {
  addTrackedKm,
  createFillUp,
  createPlace,
  createTrip,
  getFillUps,
  getPlaces,
  getTrips,
  getVehicleById,
  getVehicles,
} from '@/lib/database';
import { refreshBudgets } from '@/lib/calculations';
import { estimateTripFuelLiters } from '@/lib/consumptionModel';
import { toLocalYmd } from '@/lib/dates';
import { buildStoredRouteJson } from '@/lib/routeGeometry';
import { SIM_HOME, SIM_WORK } from '@/lib/gpsCarSimulator';

function todayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Ajoute manuellement pour aujourd’hui :
 * - lieux domicile / travail si absents
 * - trajet domicile → travail (avec tracé)
 * - trajet travail → domicile (avec tracé)
 * - un plein du jour
 */
export async function seedTodayCommuteAndFillUp(vehicleId?: number): Promise<{
  vehicleId: number;
  tripsAdded: number;
  fillUpAdded: boolean;
}> {
  const vehicles = await getVehicles();
  const vId = vehicleId ?? vehicles.find((x) => x.isActive)?.id ?? vehicles[0]?.id;
  if (!vId) throw new Error('Aucun véhicule — ajoutez-en un d’abord.');
  const vehicle = await getVehicleById(vId);
  if (!vehicle) throw new Error('Véhicule introuvable.');

  let places = await getPlaces();
  let home = places.find((p) => p.kind === 'home');
  let work = places.find((p) => p.kind === 'work');
  if (!home) {
    await createPlace({
      name: 'Domicile',
      address: 'Domicile',
      kind: 'home',
      latitude: SIM_HOME.latitude,
      longitude: SIM_HOME.longitude,
    });
  }
  if (!work) {
    await createPlace({
      name: 'Travail (Intermarché)',
      address: 'La Guerche-de-Bretagne',
      kind: 'work',
      latitude: SIM_WORK.latitude,
      longitude: SIM_WORK.longitude,
    });
  }
  places = await getPlaces();
  home = places.find((p) => p.kind === 'home');
  work = places.find((p) => p.kind === 'work');

  const day = toLocalYmd(new Date());
  const trips = await getTrips(vId, { includeRejected: true });
  const already = trips.filter((t) => t.startTime.slice(0, 10) === day);
  const hasHomeWork = already.some(
    (t) =>
      /domicile|maison/i.test(t.originName || '') &&
      /travail|bureau|inter/i.test(t.destinationName || '')
  );
  const hasWorkHome = already.some(
    (t) =>
      /travail|bureau|inter/i.test(t.originName || '') &&
      /domicile|maison/i.test(t.destinationName || '')
  );

  const price = vehicle.defaultFuelPrice;
  const fromHome = {
    latitude: home?.latitude ?? SIM_HOME.latitude,
    longitude: home?.longitude ?? SIM_HOME.longitude,
  };
  const toWork = {
    latitude: work?.latitude ?? SIM_WORK.latitude,
    longitude: work?.longitude ?? SIM_WORK.longitude,
  };
  let tripsAdded = 0;
  let tracked = 0;

  const addTrip = async (
    startH: number,
    endH: number,
    origin: string,
    dest: string,
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number }
  ) => {
    const startIso = todayAt(startH, 15);
    const built = buildStoredRouteJson(from, to, Date.parse(startIso));
    const km = built.distanceHintKm || 44;
    const fuel = estimateTripFuelLiters(vehicle, km);
    await createTrip({
      vehicleId: vId,
      startTime: startIso,
      endTime: todayAt(endH, 5),
      distanceKm: km,
      estimatedFuelUsed: Math.round(fuel * 100) / 100,
      estimatedCost: Math.round(fuel * price * 100) / 100,
      routePoints: built.json,
      originName: origin,
      destinationName: dest,
      isActive: false,
      status: 'confirmed',
      source: 'manual',
      fillUpId: null,
      note: 'Saisie manuelle — A/R travail (Intermarché)',
    });
    tripsAdded += 1;
    tracked += km;
  };

  if (!hasHomeWork) {
    await addTrip(
      7,
      8,
      home?.name || 'Domicile',
      work?.name || 'Travail (Intermarché)',
      fromHome,
      toWork
    );
  }
  if (!hasWorkHome) {
    await addTrip(
      17,
      18,
      work?.name || 'Travail (Intermarché)',
      home?.name || 'Domicile',
      toWork,
      fromHome
    );
  }
  if (tracked > 0) await addTrackedKm(vId, tracked);

  const fills = await getFillUps(vId);
  const fillToday = fills.some((f) => f.date.slice(0, 10) === day);
  let fillUpAdded = false;
  if (!fillToday) {
    const liters = 48;
    await createFillUp({
      vehicleId: vId,
      date: todayAt(18, 40),
      liters,
      pricePerLiter: price,
      totalCost: Math.round(liters * price * 100) / 100,
      odometer: vehicle.hasOdometer ? vehicle.currentOdometer : null,
      distanceSinceLastKm: tracked || 88,
      isFull: true,
      note: 'Plein du jour (après trajet travail → domicile)',
      tripId: null,
    });
    fillUpAdded = true;
  }

  await refreshBudgets(vId);
  return { vehicleId: vId, tripsAdded, fillUpAdded };
}
