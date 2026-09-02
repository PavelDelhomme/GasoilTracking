import type { Budget, BudgetStatus, ConsumptionStats, FillUp, Vehicle } from '@/types';
import {
  getFillUps,
  getBudgets,
  updateBudgetSpent,
  updateVehicle,
  getVehicleById,
} from './database';

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
  const fillUps = await getFillUps(vehicleId);
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
  startTime: string
): { fuelUsed: number; cost: number; durationMinutes: number } {
  const fuelUsed = estimateFuelUsed(distanceKm, vehicle.consumptionPer100);
  const cost = estimateCost(fuelUsed, vehicle.defaultFuelPrice);
  const durationMinutes = (Date.now() - new Date(startTime).getTime()) / (1000 * 60);
  return { fuelUsed, cost, durationMinutes };
}

/** Autonomie restante estimée en km */
export function estimateRange(
  vehicle: Vehicle,
  currentFuelLevel?: number
): number {
  const fuelInTank = currentFuelLevel ?? vehicle.tankCapacity * 0.5;
  if (vehicle.consumptionPer100 <= 0) return 0;
  return (fuelInTank / vehicle.consumptionPer100) * 100;
}

/** Formate un montant en euros */
export function formatEuro(amount: number): string {
  return `${amount.toFixed(2)} €`;
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
