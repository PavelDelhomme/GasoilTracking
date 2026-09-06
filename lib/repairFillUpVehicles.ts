import {
  getBudgets,
  getFillUps,
  getVehicles,
  updateBudget,
  updateFillUp,
  updateVehicle,
  deactivateVehicleScopedBudgets,
} from '@/lib/database';
import { litersFromTicket } from '@/lib/fuelPrices';

/** Gazole TotalEnergies Thorigné-Fouillard (open data ~2,250 €/L, maj août 2026). */
export const TOTAL_THORIGNE_GAZOLE_EUR = 2.25;

/**
 * Tickets diesel Total Thorigné : montants payés exacts → litres recalculés au vrai prix/L.
 * (Les saisies avaient dérivé litres depuis defaultFuelPrice 1,72 € — irréaliste.)
 */
const DIESEL_TICKETS: { totalCost: number; day: string }[] = [
  { totalCost: 70.04, day: '2026-09-02' },
  { totalCost: 104.03, day: '2026-08-25' },
  { totalCost: 78.37, day: '2026-08-18' },
  { totalCost: 76.39, day: '2026-08-12' }, // Touran — même station
];

function almostEq(a: number, b: number, eps = 0.02): boolean {
  return Math.abs(a - b) <= eps;
}

/**
 * Corrige associations plein↔véhicule, prix/litres diesel Total, niveaux réservoir,
 * prix défaut véhicules diesel, enveloppe budget globale 250 €.
 * Idempotent.
 */
export async function repairFillUpVehiclesAndBudgets(): Promise<{
  fillUpsFixed: number;
  budgetsFixed: number;
  pricesFixed: number;
  levelsFixed: number;
}> {
  const vehicles = await getVehicles();
  const v806 = vehicles.find(
    (v) => /806/.test(v.name) || /806/.test(v.model || '') || /806/.test(v.brand || '')
  );
  const touran = vehicles.find(
    (v) => /touran/i.test(v.name) || /touran/i.test(v.model || '') || /touran/i.test(v.brand || '')
  );
  const v206 = vehicles.find(
    (v) => /206/.test(v.name) || /206/.test(v.model || '') || /206/.test(v.brand || '')
  );

  let fillUpsFixed = 0;
  let pricesFixed = 0;
  let levelsFixed = 0;

  if (v806 || touran || v206) {
    const fills = await getFillUps();
    for (const f of fills) {
      const day = String(f.date).slice(0, 10);
      let nextId: number | null = null;
      let nextNote: string | undefined;
      if (v806 && (day === '2026-09-02' || day === '2026-08-25' || day === '2026-08-18')) {
        nextId = v806.id;
      } else if (touran && day === '2026-08-12') {
        nextId = touran.id;
        nextNote = 'Plein diesel — Touran (Total Thorigné)';
      } else if (v206 && day === '2026-08-20') {
        nextId = v206.id;
      }
      if (nextId != null && f.vehicleId !== nextId) {
        await updateFillUp(f.id, {
          vehicleId: nextId,
          ...(nextNote ? { note: nextNote } : {}),
        });
        fillUpsFixed += 1;
      } else if (nextNote && f.note !== nextNote && nextId != null && f.vehicleId === nextId) {
        await updateFillUp(f.id, { note: nextNote });
      }
    }
  }

  // Prix/L + litres : tickets diesel Total Thorigné
  const fills = await getFillUps();
  for (const f of fills) {
    const day = String(f.date).slice(0, 10);
    const ticket = DIESEL_TICKETS.find(
      (t) => t.day === day && almostEq(f.totalCost, t.totalCost)
    );
    if (!ticket) continue;

    const ppl = TOTAL_THORIGNE_GAZOLE_EUR;
    const liters = litersFromTicket(f.totalCost, ppl);
    if (almostEq(f.pricePerLiter, ppl) && almostEq(f.liters, liters)) continue;

    const noteBase =
      day === '2026-08-12'
        ? 'Plein diesel — Touran (Total Thorigné)'
        : `Plein diesel ${f.totalCost.toFixed(2).replace('.', ',')} € — Total Thorigné`;
    const note = `${noteBase} · ${ppl.toFixed(2).replace('.', ',')} €/L · ${liters
      .toFixed(2)
      .replace('.', ',')} L`;

    await updateFillUp(f.id, {
      pricePerLiter: ppl,
      liters,
      note,
    });
    pricesFixed += 1;
  }

  // Prix défaut diesel + niveaux après dernier plein marqué « complet »
  for (const v of vehicles) {
    if (v.fuelType !== 'diesel') continue;
    const patch: { defaultFuelPrice?: number; estimatedFuelLiters?: number } = {};
    if (!almostEq(v.defaultFuelPrice, TOTAL_THORIGNE_GAZOLE_EUR, 0.01)) {
      patch.defaultFuelPrice = TOTAL_THORIGNE_GAZOLE_EUR;
    }
    const vehicleFills = fills
      .filter((f) => f.vehicleId === v.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const last = vehicleFills[0];
    if (last?.isFull && v.estimatedFuelLiters !== v.tankCapacity) {
      // Plein complet → niveau = capacité réservoir (pas les litres erronés du ticket)
      patch.estimatedFuelLiters = v.tankCapacity;
    }
    if (Object.keys(patch).length > 0) {
      await updateVehicle(v.id, patch);
      if (patch.estimatedFuelLiters !== undefined) levelsFixed += 1;
    }
  }

  let budgetsFixed = await deactivateVehicleScopedBudgets();
  const budgets = await getBudgets();
  for (const b of budgets) {
    if (b.vehicleId == null && b.period === 'monthly') {
      if (b.amount !== 250 || b.name !== 'Carburant total') {
        await updateBudget(b.id, { amount: 250, name: 'Carburant total' });
        budgetsFixed += 1;
      }
    }
  }

  return { fillUpsFixed, budgetsFixed, pricesFixed, levelsFixed };
}
