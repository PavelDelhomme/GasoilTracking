import {
  getBudgets,
  getFillUps,
  getVehicles,
  updateBudget,
  updateFillUp,
  deactivateVehicleScopedBudgets,
} from '@/lib/database';

/**
 * Corrige les associations plein ↔ véhicule connues + enveloppe budget globale 250 €.
 * Idempotent : ne change rien si déjà correct.
 */
export async function repairFillUpVehiclesAndBudgets(): Promise<{
  fillUpsFixed: number;
  budgetsFixed: number;
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

  return { fillUpsFixed, budgetsFixed };
}
