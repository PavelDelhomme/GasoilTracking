/**
 * Classement stations pour détour « essence basse » :
 * prix + km détour + litres brûlés pour y aller (intérêt réel du plein).
 */
import type { FuelType, Vehicle } from '@/types';
import {
  cheapestStationFuelPrice,
  fuelLabel,
  fuelPriceKey,
  type FuelStationPrice,
} from '@/lib/fuelPrices';

export type RankedStation = FuelStationPrice & {
  pricePerL: number;
  detourKm: number;
  fuelToReachL: number;
  /** Litres envisageables au plein (capacité − restant). */
  fillLiters: number;
  /** Coût estimé du plein à cette station. */
  fillCost: number;
  /** Économie nette vs prix de référence, après coût du trajet aller. */
  netSavingEur: number;
  /** Plus bas = meilleur. */
  score: number;
  label: string;
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Top N stations : pas seulement les moins chères, mais les plus intéressantes
 * une fois le détour + conso du véhicule pris en compte.
 */
export function rankStationsForDetour(opts: {
  stations: FuelStationPrice[];
  vehicle: Vehicle;
  litersRemaining: number;
  limit?: number;
}): RankedStation[] {
  const fuel = opts.vehicle.fuelType;
  const l100 = Math.max(3, opts.vehicle.consumptionPer100 || 7);
  const tank = Math.max(20, opts.vehicle.tankCapacity || 50);
  const remaining = Math.max(0, opts.litersRemaining);
  const fillLiters = Math.max(5, Math.min(tank - remaining, tank * 0.85));
  const withPrice = opts.stations.filter(
    (s) => cheapestStationFuelPrice(s.prices, fuel) != null && (s.distanceKm ?? 99) < 35
  );
  if (!withPrice.length) return [];

  const prices = withPrice.map((s) => cheapestStationFuelPrice(s.prices, fuel)!.price);
  const refPrice =
    median(prices) ||
    opts.vehicle.defaultFuelPrice ||
    (fuel === 'diesel' ? 1.65 : 1.8);

  const ranked: RankedStation[] = withPrice.map((s) => {
    const pick = cheapestStationFuelPrice(s.prices, fuel)!;
    const pricePerL = pick.price;
    const detourKm = Math.max(0, s.distanceKm ?? 0);
    // Aller à la station (pas retour) — on assume qu’on continue ensuite
    const fuelToReachL = Math.round(((detourKm / 100) * l100) * 100) / 100;
    const driveCost = fuelToReachL * refPrice;
    const fillCost = fillLiters * pricePerL;
    const refFillCost = fillLiters * refPrice;
    const netSavingEur = Math.round((refFillCost - fillCost - driveCost) * 100) / 100;
    // Score : prioriser économie nette, pénaliser détour long / inatteignable
    const reachPenalty =
      fuelToReachL > remaining * 0.55 ? 40 : fuelToReachL > remaining * 0.35 ? 10 : 0;
    const lowFuelDetourPenalty = remaining < 12 ? detourKm * 0.35 : detourKm * 0.1;
    const score = -netSavingEur + lowFuelDetourPenalty + reachPenalty;
    const city = s.city ? ` (${s.city})` : '';
    const grade = fuel === 'essence' ? ` ${fuelLabel(pick.key)}` : '';
    const label = `${s.name}${city} · ${pricePerL.toFixed(3)} €/L${grade} · ${detourKm.toFixed(1)} km · ~${fuelToReachL.toFixed(1)} L · ${
      netSavingEur >= 0 ? `+${netSavingEur.toFixed(1)} €` : `${netSavingEur.toFixed(1)} €`
    }`;
    return {
      ...s,
      pricePerL,
      detourKm,
      fuelToReachL,
      fillLiters: Math.round(fillLiters * 10) / 10,
      fillCost: Math.round(fillCost * 100) / 100,
      netSavingEur,
      score,
      label,
    };
  });

  return ranked
    .filter((s) => {
      // Si réservoir très bas : pas de détour long même si prix alléchant
      const maxKm = remaining < 10 ? 12 : remaining < 15 ? 18 : 30;
      return s.detourKm <= maxKm && s.fuelToReachL < Math.max(0.5, remaining * 0.75);
    })
    .sort((a, b) => a.score - b.score || a.detourKm - b.detourKm)
    .slice(0, opts.limit ?? 3);
}

export function fuelKeyForVehicle(fuel: FuelType) {
  return fuelPriceKey(fuel);
}

/** Marge dénivelé / bouchon pour « encore joignable ». */
export const STATION_REACH_MARGIN = 1.15;

export function estimatedRangeKm(vehicle: Vehicle, liters: number): number {
  const l100 = Math.max(3, Number(vehicle.consumptionPer100) || 7);
  const learn =
    Number(vehicle.consumptionLearnFactor) > 0.5 ? Number(vehicle.consumptionLearnFactor) : 1;
  const L = Math.max(0, liters);
  return Math.round(((L * 100) / (l100 * learn)) * 10) / 10;
}

export function fuelLitersToDriveKm(vehicle: Vehicle, distanceKm: number): number {
  const l100 = Math.max(3, Number(vehicle.consumptionPer100) || 7);
  const learn =
    Number(vehicle.consumptionLearnFactor) > 0.5 ? Number(vehicle.consumptionLearnFactor) : 1;
  return Math.round((distanceKm / 100) * l100 * learn * 100) / 100;
}

export type CheapestReachableStation = FuelStationPrice & {
  pricePerL: number;
  fuelKey: string;
  fuelToReachL: number;
  rangeKm: number;
};

/**
 * Stations encore joignables avec le niveau actuel, triées du litre le moins cher.
 */
export function pickCheapestReachableStations(opts: {
  stations: FuelStationPrice[];
  vehicle: Vehicle;
  litersRemaining: number;
  limit?: number;
}): CheapestReachableStation[] {
  const remaining = Math.max(0, opts.litersRemaining);
  const rangeKm = estimatedRangeKm(opts.vehicle, remaining);
  const maxKm = rangeKm / STATION_REACH_MARGIN;
  const out: CheapestReachableStation[] = [];
  for (const s of opts.stations) {
    const pick = cheapestStationFuelPrice(s.prices, opts.vehicle.fuelType);
    if (!pick) continue;
    const distanceKm = Number(s.distanceKm);
    if (!Number.isFinite(distanceKm) || distanceKm < 0) continue;
    const fuelToReachL = fuelLitersToDriveKm(opts.vehicle, distanceKm);
    if (distanceKm > maxKm + 0.05) continue;
    if (fuelToReachL * STATION_REACH_MARGIN > remaining) continue;
    out.push({
      ...s,
      distanceKm,
      pricePerL: pick.price,
      fuelKey: pick.key,
      fuelToReachL,
      rangeKm,
    });
  }
  return out
    .sort(
      (a, b) =>
        a.pricePerL - b.pricePerL || (a.distanceKm ?? 99) - (b.distanceKm ?? 99)
    )
    .slice(0, opts.limit ?? 3);
}

/** Rayon de recherche open-data (plafond API 30 km). */
export function stationSearchRadiusKm(rangeKm: number): number {
  if (!Number.isFinite(rangeKm) || rangeKm <= 0) return 12;
  return Math.min(30, Math.max(8, Math.round(rangeKm * 0.9)));
}
