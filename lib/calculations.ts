import type {
  Budget,
  BudgetStatus,
  ConsumptionStats,
  FillUp,
  MonthFillStats,
  SinceLastFillStats,
  Vehicle,
} from '@/types';
import {
  getFillUps,
  getTrips,
  getBudgets,
  updateBudgetSpent,
  updateVehicle,
  getVehicleById,
} from './database';
import { monthKeyFromDate } from './dates';

/** Calcule la distance entre deux points GPS (formule Haversine) en km */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Estime le carburant consommé pour une distance donnée */
export function estimateFuelUsed(distanceKm: number, consumptionPer100: number): number {
  return (distanceKm * consumptionPer100) / 100;
}

/** Estime le coût du carburant */
export function estimateCost(fuelLiters: number, pricePerLiter: number): number {
  return fuelLiters * pricePerLiter;
}

/** Calcule la consommation réelle entre deux pleins complets */
export function calculateRealConsumption(
  previousFillUp: FillUp,
  currentFillUp: FillUp
): number | null {
  if (!currentFillUp.isFull || !previousFillUp.isFull) return null;
  let distance: number | null = null;
  if (
    currentFillUp.odometer != null &&
    previousFillUp.odometer != null &&
    currentFillUp.odometer > previousFillUp.odometer
  ) {
    distance = currentFillUp.odometer - previousFillUp.odometer;
  } else if (currentFillUp.distanceSinceLastKm != null && currentFillUp.distanceSinceLastKm > 0) {
    distance = currentFillUp.distanceSinceLastKm;
  }
  if (!distance || distance <= 0) return null;
  return (currentFillUp.liters / distance) * 100;
}

function fillUpDistance(prev: FillUp, curr: FillUp): number | null {
  if (curr.odometer != null && prev.odometer != null && curr.odometer > prev.odometer) {
    return curr.odometer - prev.odometer;
  }
  if (curr.distanceSinceLastKm != null && curr.distanceSinceLastKm > 0) {
    return curr.distanceSinceLastKm;
  }
  return null;
}

/** Statistiques de consommation pour un véhicule (compteur OU km GPS/manuel) */
export async function getConsumptionStats(vehicleId: number): Promise<ConsumptionStats> {
  const [fillUps, trips] = await Promise.all([getFillUps(vehicleId), getTrips(vehicleId)]);
  const ordered = [...fillUps].sort((a, b) => a.date.localeCompare(b.date));
  const fullFillUps = ordered.filter((f) => f.isFull);

  let totalDistance = 0;
  let totalFuel = 0;
  const consumptions: number[] = [];

  for (let i = 1; i < fullFillUps.length; i++) {
    const prev = fullFillUps[i - 1];
    const curr = fullFillUps[i];
    const distance = fillUpDistance(prev, curr);
    if (distance && distance > 0) {
      totalDistance += distance;
      totalFuel += curr.liters;
      consumptions.push((curr.liters / distance) * 100);
    }
  }

  // Pleins partiels avec distance saisie comptent aussi pour la conso moyenne
  for (const f of ordered) {
    if (!f.isFull && f.distanceSinceLastKm && f.distanceSinceLastKm > 0 && f.liters > 0) {
      consumptions.push((f.liters / f.distanceSinceLastKm) * 100);
      totalDistance += f.distanceSinceLastKm;
      totalFuel += f.liters;
    }
  }

  // Km GPS des trajets terminés (complète le total si peu de pleins)
  const tripKm = trips
    .filter((t) => !t.isActive && t.status !== 'rejected' && t.distanceKm > 0)
    .reduce((s, t) => s + t.distanceKm, 0);
  if (tripKm > totalDistance) {
    totalDistance = Math.round(tripKm * 10) / 10;
  }

  const totalCost = fillUps.reduce((sum, f) => sum + f.totalCost, 0);

  return {
    averageConsumption:
      consumptions.length > 0
        ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length
        : 0,
    totalDistance,
    totalFuel,
    totalCost,
    fillUpCount: fillUps.length,
  };
}

/** Agrégats pleins pour un mois (AAAA-MM) */
export function getMonthFillStats(fillUps: FillUp[], monthKey: string): MonthFillStats {
  const monthFills = fillUps.filter((f) => monthKeyFromDate(f.date) === monthKey);
  const totalCost = monthFills.reduce((s, f) => s + f.totalCost, 0);
  const totalLiters = monthFills.reduce((s, f) => s + f.liters, 0);
  let totalDistanceKm = 0;
  const consumptions: number[] = [];
  for (const f of monthFills) {
    if (f.distanceSinceLastKm && f.distanceSinceLastKm > 0 && f.liters > 0) {
      totalDistanceKm += f.distanceSinceLastKm;
      consumptions.push((f.liters / f.distanceSinceLastKm) * 100);
    }
  }
  return {
    monthKey,
    count: monthFills.length,
    totalCost,
    totalLiters,
    avgPricePerLiter: totalLiters > 0 ? totalCost / totalLiters : 0,
    avgConsumption:
      consumptions.length > 0
        ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length
        : null,
    totalDistanceKm,
  };
}

/**
 * Autonomie restante estimée à partir des trajets depuis le dernier plein
 * (pas un demi-réservoir théorique).
 */
export async function getSinceLastFillStats(vehicleId: number): Promise<SinceLastFillStats> {
  const [vehicle, fillUps, trips] = await Promise.all([
    getVehicleById(vehicleId),
    getFillUps(vehicleId),
    getTrips(vehicleId),
  ]);
  const empty: SinceLastFillStats = {
    lastFill: null,
    tripKm: 0,
    tripCount: 0,
    fuelUsedEst: 0,
    fuelRemainingEst: 0,
    rangeKm: 0,
  };
  if (!vehicle || !fillUps.length) return empty;

  const lastFill = [...fillUps].sort((a, b) => b.date.localeCompare(a.date))[0];
  const since = trips.filter(
    (t) =>
      !t.isActive &&
      t.status !== 'rejected' &&
      t.distanceKm > 0 &&
      t.startTime >= lastFill.date
  );
  const tripKm = Math.round(since.reduce((s, t) => s + t.distanceKm, 0) * 10) / 10;
  const conso =
    vehicle.consumptionPer100 > 0 ? vehicle.consumptionPer100 : 7;
  const fuelUsedEst = Math.round(estimateFuelUsed(tripKm, conso) * 100) / 100;
  const startFuel = lastFill.isFull
    ? vehicle.tankCapacity
    : Math.min(vehicle.tankCapacity, lastFill.liters);
  const fuelRemainingEst = Math.max(0, Math.round((startFuel - fuelUsedEst) * 100) / 100);
  const rangeKm =
    conso > 0 ? Math.round((fuelRemainingEst / conso) * 1000) / 10 : 0;

  return {
    lastFill,
    tripKm,
    tripCount: since.length,
    fuelUsedEst,
    fuelRemainingEst,
    rangeKm,
  };
}

/** Met à jour la conso du véhicule pour CET utilisateur (moyenne glissante) */
export async function adaptVehicleConsumption(vehicleId: number): Promise<number | null> {
  const stats = await getConsumptionStats(vehicleId);
  if (stats.averageConsumption <= 0) return null;
  const vehicle = await getVehicleById(vehicleId);
  if (!vehicle) return null;
  const adapted = stats.averageConsumption * 0.7 + vehicle.consumptionPer100 * 0.3;
  await updateVehicle(vehicleId, { consumptionPer100: Math.round(adapted * 10) / 10 });
  return adapted;
}

/** Calcule le statut d'un budget avec dépenses dynamiques */
export async function getBudgetStatus(
  budget: Budget,
  vehicleId?: number
): Promise<BudgetStatus> {
  const targetVehicleId = budget.vehicleId ?? vehicleId;
  let spent = 0;

  if (targetVehicleId) {
    const fillUps = await getFillUps(targetVehicleId);
    spent += fillUps
      .filter((f) => f.date >= budget.startDate && f.date <= budget.endDate)
      .reduce((sum, f) => sum + f.totalCost, 0);
  } else {
    const fillUps = await getFillUps();
    spent += fillUps
      .filter((f) => f.date >= budget.startDate && f.date <= budget.endDate)
      .reduce((sum, f) => sum + f.totalCost, 0);
  }

  await updateBudgetSpent(budget.id, spent);

  const remaining = Math.max(0, budget.amount - spent);
  const percentUsed = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

  const start = new Date(budget.startDate);
  const end = new Date(budget.endDate);
  const now = new Date();
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const elapsedDays = Math.max(0, (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const dailyRate = elapsedDays > 0 ? spent / elapsedDays : 0;
  const remainingDays = Math.max(0, (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const projectedEndOfPeriod = spent + dailyRate * remainingDays;

  return {
    budget: { ...budget, spent },
    spent,
    remaining,
    percentUsed,
    projectedEndOfPeriod,
  };
}

/** Met à jour tous les budgets actifs pour un véhicule */
export async function refreshBudgets(vehicleId?: number): Promise<BudgetStatus[]> {
  const budgets = await getBudgets(vehicleId);
  const statuses: BudgetStatus[] = [];
  for (const budget of budgets) {
    statuses.push(await getBudgetStatus(budget, vehicleId));
  }
  return statuses;
}

/** Calcule les stats en temps réel d'un trajet actif */
export function calculateTripStats(
  vehicle: Vehicle,
  distanceKm: number,
  startTime: string,
  endTime?: string | null
): { fuelUsed: number; cost: number; durationMinutes: number } {
  const fuelUsed = estimateFuelUsed(distanceKm, vehicle.consumptionPer100);
  const cost = estimateCost(fuelUsed, vehicle.defaultFuelPrice);
  const endMs = endTime ? new Date(endTime).getTime() : Date.now();
  const durationMinutes = Math.max(0, (endMs - new Date(startTime).getTime()) / (1000 * 60));
  return { fuelUsed, cost, durationMinutes };
}

/** Autonomie restante estimée en km (conso adaptée si fournie) */
export function estimateRange(
  vehicle: Vehicle,
  currentFuelLevel?: number,
  consumptionPer100?: number
): number {
  const fuelInTank = currentFuelLevel ?? vehicle.tankCapacity * 0.5;
  const conso = consumptionPer100 && consumptionPer100 > 0
    ? consumptionPer100
    : vehicle.consumptionPer100;
  if (conso <= 0) return 0;
  return (fuelInTank / conso) * 100;
}

/** Vitesse moyenne km/h depuis distance et durée */
export function averageSpeedKmh(distanceKm: number, durationMinutes: number): number {
  if (durationMinutes <= 0 || distanceKm <= 0) return 0;
  return (distanceKm / durationMinutes) * 60;
}

/** Formate un montant (devise selon le pays choisi) */
let moneyFormatter: (amount: number) => string = (amount) => `${amount.toFixed(2)} €`;

export function setMoneyFormatter(fn: (amount: number) => string) {
  moneyFormatter = fn;
}

export function formatEuro(amount: number): string {
  return moneyFormatter(amount);
}

/** Formate une consommation */
export function formatConsumption(value: number, fuelType: Vehicle['fuelType']): string {
  const unit = fuelType === 'electrique' ? 'kWh/100km' : 'L/100km';
  return `${value.toFixed(1)} ${unit}`;
}

/** Formate une distance */
export function formatDistance(km: number): string {
  return km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(1)} km`;
}

/** Dates de début/fin pour un budget mensuel ou annuel */
export function getBudgetPeriodDates(period: Budget['period']): { startDate: string; endDate: string } {
  const now = new Date();
  let start: Date;
  let end: Date;

  if (period === 'monthly') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (period === 'yearly') {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
  } else {
    start = now;
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export function parseRoutePoints(routePoints: string): RoutePoint[] {
  try {
    return JSON.parse(routePoints);
  } catch {
    return [];
  }
}

export function appendRoutePoint(
  routePoints: string,
  point: RoutePoint
): string {
  const points = parseRoutePoints(routePoints);
  if (points.length > 0) {
    const last = points[points.length - 1];
    const dist = haversineDistance(last.latitude, last.longitude, point.latitude, point.longitude);
    if (dist < 0.01) return routePoints;
  }
  points.push(point);
  return JSON.stringify(points);
}

export function calculateRouteDistance(routePoints: string): number {
  const points = parseRoutePoints(routePoints);
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
  }
  return total;
}
