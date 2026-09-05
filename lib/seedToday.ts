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

function todayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Ajoute manuellement pour aujourd’hui :
 * - lieux domicile / travail si absents
 * - trajet domicile → travail
 * - trajet travail → domicile
 * - un plein du jour
 * Idempotent si les trajets « aujourd’hui domicile↔travail » existent déjà.
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
      latitude: 50.6292,
      longitude: 3.0573,
    });
  }
  if (!work) {
    await createPlace({
      name: 'Travail',
      address: 'Bureau',
      kind: 'work',
      latitude: 50.6372,
      longitude: 3.0633,
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
      /domicile/i.test(t.originName || '') && /travail|bureau/i.test(t.destinationName || '')
  );
  const hasWorkHome = already.some(
    (t) =>
      /travail|bureau/i.test(t.originName || '') && /domicile/i.test(t.destinationName || '')
  );

  const price = vehicle.defaultFuelPrice;
  const oneWayKm = 44;
  let tripsAdded = 0;
  let tracked = 0;

  const addTrip = async (
    startH: number,
    endH: number,
    origin: string,
    dest: string,
    km: number
  ) => {
    const fuel = estimateTripFuelLiters(vehicle, km);
    await createTrip({
      vehicleId: vId,
      startTime: todayAt(startH, 15),
      endTime: todayAt(endH, 5),
      distanceKm: km,
      estimatedFuelUsed: Math.round(fuel * 100) / 100,
      estimatedCost: Math.round(fuel * price * 100) / 100,
      routePoints: '[]',
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
      oneWayKm
    );
  }
  if (!hasWorkHome) {
    await addTrip(
      17,
      18,
      work?.name || 'Travail (Intermarché)',
      home?.name || 'Domicile',
      oneWayKm
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
      distanceSinceLastKm: oneWayKm * 2,
      isFull: true,
      note: 'Plein du jour (après trajet travail → domicile)',
      tripId: null,
    });
    fillUpAdded = true;
  }

  await refreshBudgets(vId);
  return { vehicleId: vId, tripsAdded, fillUpAdded };
}
