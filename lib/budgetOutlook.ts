/**
 * Budget mensuel ajusté à l’autonomie (stock carburant) et aux dépenses
 * encore estimées sur le reste du mois.
 */
import type { RecurringRoute, Vehicle } from '@/types';
import { toLocalYmd } from '@/lib/dates';

export type BudgetOutlook = {
  allocation: number;
  spent: number;
  remainingCash: number;
  remainingDays: number;
  totalDays: number;
  fuelStockLiters: number;
  fuelStockValue: number;
  rangeKm: number;
  /** Coût des trajets réguliers encore à faire ce mois (hors vacances). */
  plannedRemainingSpend: number;
  /** Reste après trajets prévus, en déduisant le carburant déjà dans les réservoirs. */
  adjustedRemaining: number;
  projectedEndOfPeriod: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function remainingMonthFraction(startDate?: string, endDate?: string, now = new Date()): {
  remainingDays: number;
  totalDays: number;
  elapsedDays: number;
} {
  const start = startDate
    ? new Date(startDate)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = endDate
    ? new Date(endDate)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const msDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / msDay);
  const elapsedDays = Math.max(0, (now.getTime() - start.getTime()) / msDay);
  const remainingDays = Math.max(0, (end.getTime() - now.getTime()) / msDay);
  return { remainingDays, totalDays, elapsedDays };
}

/** Coût mensuel estimé des trajets réguliers (tous véhicules). */
export function plannedMonthSpendFromRoutes(
  routes: RecurringRoute[],
  vehicles: Vehicle[],
  todayIso = toLocalYmd(new Date())
): number {
  if (!routes.length || !vehicles.length) return 0;
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const fallback = vehicles[0];
  let month = 0;
  for (const r of routes) {
    const onVac = r.isOnVacation && (!r.vacationUntil || r.vacationUntil >= todayIso);
    if (onVac) continue;
    const days = r.workDaysPerWeek || r.timesPerWeek || 0;
    if (days <= 0 || r.distanceKm <= 0) continue;
    const v = (r.vehicleId != null ? byId.get(r.vehicleId) : null) || fallback;
    const l100 = v.consumptionPer100 > 0 ? v.consumptionPer100 : 7.5;
    const price = v.defaultFuelPrice > 0 ? v.defaultFuelPrice : 0;
    const week = ((r.distanceKm * days * l100) / 100) * price;
    month += week * 4.33;
  }
  return roundMoney(month);
}

export function vehicleFuelStock(vehicles: Vehicle[]): {
  liters: number;
  value: number;
  rangeKm: number;
} {
  let liters = 0;
  let value = 0;
  let rangeKm = 0;
  for (const v of vehicles) {
    if (v.estimatedFuelLiters == null || !Number.isFinite(v.estimatedFuelLiters)) continue;
    const L = Math.max(0, v.estimatedFuelLiters);
    liters += L;
    const price = v.defaultFuelPrice > 0 ? v.defaultFuelPrice : 0;
    value += L * price;
    const l100 = v.consumptionPer100 > 0 ? v.consumptionPer100 : 7.5;
    if (l100 > 0) rangeKm += (L / l100) * 100;
  }
  return {
    liters: Math.round(liters * 10) / 10,
    value: roundMoney(value),
    rangeKm: Math.round(rangeKm * 10) / 10,
  };
}

export function computeBudgetOutlook(opts: {
  allocation: number;
  spent: number;
  startDate?: string;
  endDate?: string;
  vehicles: Vehicle[];
  plannedMonthSpend: number;
  now?: Date;
}): BudgetOutlook {
  const { remainingDays, totalDays, elapsedDays } = remainingMonthFraction(
    opts.startDate,
    opts.endDate,
    opts.now
  );
  const stock = vehicleFuelStock(opts.vehicles);
  const remainingCash = Math.max(0, roundMoney(opts.allocation - opts.spent));
  const plannedRemainingSpend = roundMoney(
    opts.plannedMonthSpend * (remainingDays / Math.max(totalDays, 1))
  );
  const stillToBuy = Math.max(0, plannedRemainingSpend - stock.value);
  const adjustedRemaining = roundMoney(remainingCash - stillToBuy);
  const dailyRate = elapsedDays > 0 ? opts.spent / elapsedDays : 0;
  const projectedEndOfPeriod = roundMoney(opts.spent + dailyRate * remainingDays);

  return {
    allocation: opts.allocation,
    spent: roundMoney(opts.spent),
    remainingCash,
    remainingDays: Math.round(remainingDays * 10) / 10,
    totalDays: Math.round(totalDays * 10) / 10,
    fuelStockLiters: stock.liters,
    fuelStockValue: stock.value,
    rangeKm: stock.rangeKm,
    plannedRemainingSpend,
    adjustedRemaining,
    projectedEndOfPeriod,
  };
}
