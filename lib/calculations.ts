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
  getMaintenances,
  createBudget,
  updateBudgetSpent,
  updateVehicle,
  getVehicleById,
} from './database';
import { monthKeyFromDate } from './dates';
import {
  calculateFilteredRouteDistance,
  evaluateGpsSample,
} from '@/lib/gpsTracking';
import {
  averageMovingSpeedKmh,
  estimateTripFuelLiters,
  movingDurationMinutes,
} from '@/lib/consumptionModel';

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

/** Écarte les L/100 absurdes (saisie km / litres incohérente). */
export function isSaneConsumptionSample(lPer100: number, fuelType?: Vehicle['fuelType']): boolean {
  if (!Number.isFinite(lPer100) || lPer100 <= 0) return false;
  if (fuelType === 'electrique') return lPer100 >= 5 && lPer100 <= 40;
  return lPer100 >= 3 && lPer100 <= 18;
}

/** Statistiques de consommation pour un véhicule (compteur OU km GPS/manuel) */
export async function getConsumptionStats(vehicleId: number): Promise<ConsumptionStats> {
  const [fillUps, trips, vehicle] = await Promise.all([
    getFillUps(vehicleId),
    getTrips(vehicleId),
    getVehicleById(vehicleId),
  ]);
  const ordered = [...fillUps].sort((a, b) => a.date.localeCompare(b.date));
  const fullFillUps = ordered.filter((f) => f.isFull);

  let totalDistance = 0;
  let totalFuel = 0;
  const consumptions: number[] = [];

  for (let i = 1; i < fullFillUps.length; i++) {
    const prev = fullFillUps[i - 1];
    const curr = fullFillUps[i];
    const distance = fillUpDistance(prev, curr);
    if (distance && distance > 0 && curr.liters > 0) {
      totalDistance += distance;
      totalFuel += curr.liters;
      consumptions.push((curr.liters / distance) * 100);
    }
  }

  // Tout plein avec km saisis depuis le précédent (complet ou partiel)
  for (const f of ordered) {
    if (f.distanceSinceLastKm && f.distanceSinceLastKm > 0 && f.liters > 0) {
      const c = (f.liters / f.distanceSinceLastKm) * 100;
      if (!consumptions.some((x) => Math.abs(x - c) < 0.05)) {
        consumptions.push(c);
        totalDistance += f.distanceSinceLastKm;
        totalFuel += f.liters;
      }
    }
  }

  const tripKm = trips
    .filter((t) => !t.isActive && t.status !== 'rejected' && t.distanceKm > 0)
    .reduce((s, t) => s + t.distanceKm, 0);
  if (tripKm > totalDistance) {
    totalDistance = Math.round(tripKm * 10) / 10;
  }

  const totalCost = fillUps.reduce((sum, f) => sum + f.totalCost, 0);
  const sane = consumptions.filter((c) => isSaneConsumptionSample(c, vehicle?.fuelType));

  return {
    averageConsumption:
      sane.length > 0 ? sane.reduce((a, b) => a + b, 0) / sane.length : 0,
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
    costEst: 0,
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
  const fuelUsedEst = Math.round(estimateTripFuelLiters(vehicle, tripKm) * 100) / 100;
  const price =
    lastFill.pricePerLiter > 0
      ? lastFill.pricePerLiter
      : vehicle.defaultFuelPrice > 0
        ? vehicle.defaultFuelPrice
        : 0;
  const costFromTrips = since.reduce((s, t) => s + (t.estimatedCost || 0), 0);
  const costEst =
    Math.round((costFromTrips > 0 ? costFromTrips : fuelUsedEst * price) * 100) / 100;
  const startFuel = lastFill.isFull
    ? vehicle.tankCapacity
    : vehicle.estimatedFuelLiters != null
      ? vehicle.estimatedFuelLiters + fuelUsedEst
      : Math.min(vehicle.tankCapacity, lastFill.liters);
  const fuelRemainingEst =
    vehicle.estimatedFuelLiters != null
      ? Math.max(0, Math.round(vehicle.estimatedFuelLiters * 100) / 100)
      : Math.max(0, Math.round((startFuel - fuelUsedEst) * 100) / 100);
  const effectiveL100 =
    tripKm > 0 ? (fuelUsedEst / tripKm) * 100 : estimateTripFuelLiters(vehicle, 100);
  const rangeKm =
    effectiveL100 > 0 ? Math.round((fuelRemainingEst / effectiveL100) * 1000) / 10 : 0;

  return {
    lastFill,
    tripKm,
    tripCount: since.length,
    fuelUsedEst,
    costEst,
    fuelRemainingEst,
    rangeKm,
  };
}

/**
 * Adapte la conso du véhicule aux pleins de CET utilisateur.
 * Mesures récentes pondérées + lissage + plafond ±20 %.
 * Désactivable via consumptionAutoAdapt = false (valeur manuelle).
 */
export async function adaptVehicleConsumption(
  vehicleId: number
): Promise<{ previous: number; next: number; measured: number; samples: number } | null> {
  const vehicle = await getVehicleById(vehicleId);
  if (!vehicle) return null;
  if (vehicle.consumptionAutoAdapt === false) return null;
  if (vehicle.fuelType === 'electrique') return null;

  const fillUps = await getFillUps(vehicleId);
  const ordered = [...fillUps].sort((a, b) => a.date.localeCompare(b.date));
  const samples: number[] = [];

  const fulls = ordered.filter((f) => f.isFull);
  for (let i = 1; i < fulls.length; i++) {
    const distance = fillUpDistance(fulls[i - 1], fulls[i]);
    // Segments trop courts = bruit (ville / erreur de saisie)
    if (distance && distance >= 30 && fulls[i].liters > 0) {
      samples.push((fulls[i].liters / distance) * 100);
    }
  }
  for (const f of ordered) {
    if (f.distanceSinceLastKm && f.distanceSinceLastKm >= 30 && f.liters > 0) {
      samples.push((f.liters / f.distanceSinceLastKm) * 100);
    }
  }

  const sane = samples.filter((c) => isSaneConsumptionSample(c, vehicle.fuelType));
  if (sane.length === 0) return null;

  const recent = sane.slice(-5);
  let wSum = 0;
  let cSum = 0;
  recent.forEach((c, i) => {
    const w = i + 1;
    wSum += w;
    cSum += c * w;
  });
  const measured = cSum / wSum;
  const prev = vehicle.consumptionPer100 > 0 ? vehicle.consumptionPer100 : measured;
  let next = measured * 0.6 + prev * 0.4;
  const maxDelta = Math.max(0.8, prev * 0.2);
  next = Math.min(prev + maxDelta, Math.max(prev - maxDelta, next));
  next = Math.round(next * 10) / 10;

  if (Math.abs(next - prev) < 0.05) {
    return {
      previous: prev,
      next: prev,
      measured: Math.round(measured * 10) / 10,
      samples: sane.length,
    };
  }

  await updateVehicle(vehicleId, { consumptionPer100: next });
  return {
    previous: prev,
    next,
    measured: Math.round(measured * 10) / 10,
    samples: sane.length,
  };
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
    const mains = await getMaintenances(targetVehicleId);
    spent += mains
      .filter((m) => {
        const d = (m.doneAt || '').slice(0, 10);
        if (!d) return false;
        const start = budget.startDate.slice(0, 10);
        const end = budget.endDate.slice(0, 10);
        return d >= start && d <= end;
      })
      .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  } else {
    const fillUps = await getFillUps();
    spent += fillUps
      .filter((f) => f.date >= budget.startDate && f.date <= budget.endDate)
      .reduce((sum, f) => sum + f.totalCost, 0);
    const mains = await getMaintenances();
    spent += mains
      .filter((m) => {
        const d = (m.doneAt || '').slice(0, 10);
        if (!d) return false;
        const start = budget.startDate.slice(0, 10);
        const end = budget.endDate.slice(0, 10);
        return d >= start && d <= end;
      })
      .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
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

/** Tous les budgets actifs (global + par véhicule), recalculés. */
export async function refreshAllBudgets(): Promise<BudgetStatus[]> {
  const budgets = await getBudgets();
  const statuses: BudgetStatus[] = [];
  for (const budget of budgets) {
    statuses.push(await getBudgetStatus(budget, budget.vehicleId ?? undefined));
  }
  return statuses;
}

const DEFAULT_GLOBAL_BUDGET = 250;

/**
 * Crée les enveloppes par défaut si absentes :
 * - une enveloppe globale mensuelle (250 € par défaut)
 * - une enveloppe par véhicule (nom dynamique)
 */
export async function ensureDefaultBudgets(vehicles: Vehicle[]): Promise<void> {
  const all = await getBudgets();
  const { startDate, endDate } = getBudgetPeriodDates('monthly');

  const hasGlobal = all.some((b) => b.vehicleId == null && b.period === 'monthly' && b.isActive);
  if (!hasGlobal) {
    await createBudget({
      vehicleId: null,
      name: 'Carburant total',
      amount: DEFAULT_GLOBAL_BUDGET,
      period: 'monthly',
      startDate,
      endDate,
      isActive: true,
    });
  }

  for (const v of vehicles) {
    const hasVehicleBudget = all.some(
      (b) => b.vehicleId === v.id && b.period === 'monthly' && b.isActive
    );
    if (!hasVehicleBudget) {
      await createBudget({
        vehicleId: v.id,
        name: `Carburant ${v.name}`,
        amount: DEFAULT_GLOBAL_BUDGET,
        period: 'monthly',
        startDate,
        endDate,
        isActive: true,
      });
    }
  }
}

/** Montant alloué du budget mensuel actif (global prioritaire). */
export function getActiveMonthlyAllocation(
  statuses: BudgetStatus[],
  vehicleId?: number
): number {
  const global = statuses.find(
    (s) => s.budget.vehicleId == null && s.budget.period === 'monthly'
  );
  if (global) return global.budget.amount;
  const vehicle = statuses.find(
    (s) => s.budget.vehicleId === vehicleId && s.budget.period === 'monthly'
  );
  return vehicle?.budget.amount ?? 0;
}

/** Calcule les stats en temps réel d'un trajet actif */
export function calculateTripStats(
  vehicle: Vehicle,
  distanceKm: number,
  startTime: string,
  endTime?: string | null,
  routePointsJson?: string
): { fuelUsed: number; cost: number; durationMinutes: number; movingSpeedKmh: number } {
  const fuelUsed = estimateTripFuelLiters(vehicle, distanceKm, {
    learnedFactor: vehicle.consumptionLearnFactor,
  });
  const cost = estimateCost(fuelUsed, vehicle.defaultFuelPrice);
  const endMs = endTime ? new Date(endTime).getTime() : Date.now();
  const wallMinutes = Math.max(0, (endMs - new Date(startTime).getTime()) / (1000 * 60));
  const points = routePointsJson ? parseRoutePoints(routePointsJson) : [];
  const movingMins = movingDurationMinutes(points);
  const durationMinutes = movingMins > 0.5 ? movingMins : wallMinutes;
  const movingSpeedKmh =
    points.length >= 2
      ? averageMovingSpeedKmh(distanceKm, points)
      : averageSpeedKmh(distanceKm, durationMinutes);
  return { fuelUsed, cost, durationMinutes, movingSpeedKmh };
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

/** Vitesse moyenne km/h depuis distance et durée (durée = en mouvement de préférence) */
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

/**
 * Compteur affiché = kilométrage de base (saisi) + km des trajets suivis.
 * Multi-voitures : indiquer le compteur à la prise en main, puis le GPS s’ajoute.
 */
export function displayOdometerKm(vehicle: {
  currentOdometer?: number | null;
  trackedKm?: number | null;
}): number {
  const base = Number(vehicle.currentOdometer) || 0;
  const tracked = Number(vehicle.trackedKm) || 0;
  return Math.round(base + tracked);
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
  /** Précision GPS en mètres (optionnel) */
  accuracy?: number;
  /** Vitesse device m/s (optionnel) */
  speed?: number;
}

export function parseRoutePoints(routePoints: string): RoutePoint[] {
  try {
    const parsed = JSON.parse(routePoints);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendRoutePoint(
  routePoints: string,
  point: RoutePoint & { accuracy?: number | null; speed?: number | null }
): string {
  const points = parseRoutePoints(routePoints);
  const prev = points.length > 0 ? points[points.length - 1] : null;
  const verdict = evaluateGpsSample(prev, point, { isFirst: points.length === 0 });
  if (!verdict.accept) return routePoints;

  const use = verdict.sample || point;
  // Ne pas stocker accuracy sur chaque point (JSON trop gros → OOM sur longs trajets)
  points.push({
    latitude: Math.round(use.latitude * 1e6) / 1e6,
    longitude: Math.round(use.longitude * 1e6) / 1e6,
    timestamp: use.timestamp,
  });
  return JSON.stringify(points);
}

/** Plafond de points GPS stockés (évite OOM / ANR). Conserve début + fin. */
export const MAX_STORED_ROUTE_POINTS = 600;

export function compactRoutePoints(points: RoutePoint[]): RoutePoint[] {
  if (points.length <= MAX_STORED_ROUTE_POINTS) return points;
  const keepEnds = 40;
  const budget = MAX_STORED_ROUTE_POINTS - keepEnds * 2;
  const mid = points.slice(keepEnds, points.length - keepEnds);
  const step = Math.ceil(mid.length / Math.max(1, budget));
  const sampled: RoutePoint[] = [];
  for (let i = 0; i < mid.length; i += step) {
    sampled.push(mid[i]);
  }
  return [
    ...points.slice(0, keepEnds),
    ...sampled.slice(0, budget),
    ...points.slice(points.length - keepEnds),
  ];
}

export function compactRoutePointsJson(routePoints: string): string {
  const points = compactRoutePoints(parseRoutePoints(routePoints));
  return JSON.stringify(points);
}

export function calculateRouteDistance(routePoints: string): number {
  return calculateFilteredRouteDistance(parseRoutePoints(routePoints));
}
