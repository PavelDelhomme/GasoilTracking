/**
 * Vérifie si le niveau restant permet d’atteindre au moins la station la plus proche
 * (et propose aussi la plus intéressante prix+détour).
 */
import type { Vehicle } from '@/types';
import {
  fetchCheapestStations,
  isFrenchFuelOpenDataAvailable,
  type FuelStationPrice,
} from '@/lib/fuelPrices';
import { rankStationsForDetour } from '@/lib/stationDetour';

export type NearestStationReach = {
  nearest: FuelStationPrice;
  fuelToNearestL: number;
  canReachNearest: boolean;
  /** Meilleure station (prix + détour) atteignable, si différente. */
  best?: {
    name: string;
    distanceKm: number;
    pricePerL: number;
    fuelToReachL: number;
    canReach: boolean;
  };
  litersRemaining: number;
  message: string;
};

export async function checkNearestStationReach(opts: {
  vehicle: Vehicle;
  litersRemaining: number;
  latitude: number;
  longitude: number;
  countryCode: string;
}): Promise<NearestStationReach | null> {
  if (!isFrenchFuelOpenDataAvailable(opts.countryCode)) return null;
  const liters = Math.max(0, opts.litersRemaining);
  const l100 = Math.max(3, opts.vehicle.consumptionPer100 || 7);

  const stations = await fetchCheapestStations({
    latitude: opts.latitude,
    longitude: opts.longitude,
    radiusKm: 18,
    fuel: opts.vehicle.fuelType,
    limit: 20,
    countryCode: opts.countryCode,
  });
  if (!stations.length) return null;

  const byDist = [...stations].sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
  const nearest = byDist[0];
  const distKm = nearest.distanceKm ?? 99;
  const fuelToNearestL = Math.round((distKm / 100) * l100 * 100) / 100;
  // Marge ~15 % (dénivelé / embouteillage)
  const canReachNearest = fuelToNearestL * 1.15 <= liters;

  const ranked = rankStationsForDetour({
    stations,
    vehicle: opts.vehicle,
    litersRemaining: liters,
    limit: 1,
  });
  const top = ranked[0];
  let best: NearestStationReach['best'];
  if (top && (top.id !== nearest.id || Math.abs((top.distanceKm ?? 0) - distKm) > 0.3)) {
    best = {
      name: top.name,
      distanceKm: top.detourKm,
      pricePerL: top.pricePerL,
      fuelToReachL: top.fuelToReachL,
      canReach: top.fuelToReachL * 1.15 <= liters,
    };
  }

  const city = nearest.city ? ` (${nearest.city})` : '';
  const message = canReachNearest
    ? `OK pour la plus proche : ${nearest.name}${city} · ${distKm.toFixed(1)} km (~${fuelToNearestL.toFixed(1)} L).`
    : `Risque : station la plus proche ${nearest.name}${city} à ${distKm.toFixed(1)} km (~${fuelToNearestL.toFixed(1)} L) — il reste ~${liters.toFixed(1)} L.`;

  return {
    nearest,
    fuelToNearestL,
    canReachNearest,
    best,
    litersRemaining: liters,
    message,
  };
}
