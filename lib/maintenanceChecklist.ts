/**
 * Checklist entretien véhicule (Oui/Non + items cochables).
 */
export const MAINTENANCE_CHECKLIST_ITEMS: { id: string; label: string; hint: string }[] = [
  { id: 'oil', label: 'Vidange / niveau huile', hint: 'Intervalle constructeur ou ~10–15 000 km' },
  { id: 'brakes', label: 'Freins (plaquettes / disques)', hint: 'Usure, bruit, course pédale' },
  { id: 'tires', label: 'Pneus (usure / pression)', hint: 'Sculpture + pression à froid' },
  { id: 'filters', label: 'Filtres (air / habitacle / gasoil)', hint: 'Selon carnet d’entretien' },
  { id: 'battery', label: 'Batterie', hint: 'Démarrages difficiles, corrosion' },
  { id: 'cooling', label: 'Liquide de refroidissement', hint: 'Niveau vase d’expansion' },
  { id: 'lights', label: 'Éclairage / signalisation', hint: 'Feux, clignotants, plaque' },
  { id: 'wipers', label: 'Essuie-glaces / lave-glace', hint: 'Balais + niveau' },
];

export type MaintenanceChecklistState = Record<string, boolean>;

export function emptyChecklist(): MaintenanceChecklistState {
  const o: MaintenanceChecklistState = {};
  for (const it of MAINTENANCE_CHECKLIST_ITEMS) o[it.id] = false;
  return o;
}

export function parseChecklistJson(raw: string | null | undefined): MaintenanceChecklistState {
  const base = emptyChecklist();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const it of MAINTENANCE_CHECKLIST_ITEMS) {
      if (typeof parsed[it.id] === 'boolean') base[it.id] = parsed[it.id] as boolean;
    }
  } catch {
    /* ignore */
  }
  return base;
}

export function checklistProgress(state: MaintenanceChecklistState): { done: number; total: number } {
  const total = MAINTENANCE_CHECKLIST_ITEMS.length;
  const done = MAINTENANCE_CHECKLIST_ITEMS.filter((it) => state[it.id]).length;
  return { done, total };
}
