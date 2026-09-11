/**
 * Checklist entretien véhicule (Oui/Non + items cochables + intervalles constructeur).
 */
export type MaintenanceChecklistItem = {
  id: string;
  label: string;
  hint: string;
  /** Intervalle km typique (carnet / constructeur). */
  intervalKm: number;
  /** Intervalle mois (si plus restrictif que les km). */
  intervalMonths: number;
};

export const MAINTENANCE_CHECKLIST_ITEMS: MaintenanceChecklistItem[] = [
  {
    id: 'oil',
    label: 'Vidange / niveau huile',
    hint: 'Réinit. après garage — typ. 10–15 000 km ou 12 mois',
    intervalKm: 15000,
    intervalMonths: 12,
  },
  {
    id: 'brakes',
    label: 'Freins (plaquettes / disques)',
    hint: 'Usure, bruit, course pédale — ~30–40 000 km',
    intervalKm: 35000,
    intervalMonths: 24,
  },
  {
    id: 'tires',
    label: 'Pneus (usure / pression)',
    hint: 'Sculpture + pression à froid — contrôle ~10 000 km',
    intervalKm: 10000,
    intervalMonths: 6,
  },
  {
    id: 'filters',
    label: 'Filtres (air / habitacle / gasoil)',
    hint: 'Selon carnet — souvent à chaque vidange',
    intervalKm: 15000,
    intervalMonths: 12,
  },
  {
    id: 'battery',
    label: 'Batterie',
    hint: 'Démarrages difficiles, corrosion — ~36–48 mois',
    intervalKm: 60000,
    intervalMonths: 36,
  },
  {
    id: 'cooling',
    label: 'Liquide de refroidissement',
    hint: 'Niveau vase d’expansion — ~5 ans / 100 000 km',
    intervalKm: 100000,
    intervalMonths: 60,
  },
  {
    id: 'lights',
    label: 'Éclairage / signalisation',
    hint: 'Feux, clignotants, plaque — contrôle courant',
    intervalKm: 10000,
    intervalMonths: 6,
  },
  {
    id: 'wipers',
    label: 'Essuie-glaces / lave-glace',
    hint: 'Balais + niveau — ~12 mois',
    intervalKm: 15000,
    intervalMonths: 12,
  },
];

export type ChecklistItemMeta = {
  done: boolean;
  /** Km au moment du dernier « fait » / garage. */
  lastDoneKm?: number | null;
  /** ISO date du dernier reset. */
  lastDoneAt?: string | null;
  /** Note garage / défaut signalé. */
  note?: string | null;
  /** Montant facture associé (si connu). */
  invoiceAmount?: number | null;
};

export type MaintenanceChecklistState = Record<string, boolean | ChecklistItemMeta | Record<string, unknown>>;

export function emptyChecklist(): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const it of MAINTENANCE_CHECKLIST_ITEMS) o[it.id] = false;
  return o;
}

export function normalizeItem(raw: unknown): ChecklistItemMeta {
  if (typeof raw === 'boolean') return { done: raw };
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return {
      done: Boolean(o.done),
      lastDoneKm: typeof o.lastDoneKm === 'number' ? o.lastDoneKm : null,
      lastDoneAt: typeof o.lastDoneAt === 'string' ? o.lastDoneAt : null,
      note: typeof o.note === 'string' ? o.note : null,
      invoiceAmount: typeof o.invoiceAmount === 'number' ? o.invoiceAmount : null,
    };
  }
  return { done: false };
}

export function parseChecklistJson(raw: string | null | undefined): Record<string, boolean> {
  const base = emptyChecklist();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const it of MAINTENANCE_CHECKLIST_ITEMS) {
      base[it.id] = normalizeItem(parsed[it.id]).done;
    }
  } catch {
    /* ignore */
  }
  return base;
}

export function parseChecklistMeta(raw: string | null | undefined): Record<string, ChecklistItemMeta> {
  const out: Record<string, ChecklistItemMeta> = {};
  for (const it of MAINTENANCE_CHECKLIST_ITEMS) out[it.id] = { done: false };
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const it of MAINTENANCE_CHECKLIST_ITEMS) {
      out[it.id] = normalizeItem(parsed[it.id]);
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function serializeChecklist(
  boolState: Record<string, boolean>,
  meta?: Record<string, ChecklistItemMeta>
): string {
  const payload: Record<string, ChecklistItemMeta> = {};
  for (const it of MAINTENANCE_CHECKLIST_ITEMS) {
    const m = meta?.[it.id];
    payload[it.id] = {
      done: Boolean(boolState[it.id]),
      lastDoneKm: m?.lastDoneKm ?? null,
      lastDoneAt: m?.lastDoneAt ?? null,
      note: m?.note ?? null,
      invoiceAmount: m?.invoiceAmount ?? null,
    };
  }
  return JSON.stringify(payload);
}

export function checklistProgress(state: Record<string, boolean>): { done: number; total: number } {
  const total = MAINTENANCE_CHECKLIST_ITEMS.length;
  const done = MAINTENANCE_CHECKLIST_ITEMS.filter((it) => state[it.id]).length;
  return { done, total };
}

export type ChecklistDueInfo = {
  status: 'ok' | 'soon' | 'overdue' | 'unknown';
  label: string;
  nextDueKm?: number | null;
  nextDueDate?: string | null;
};

/** Calcule l’échéance suivante à partir du dernier reset + intervalles constructeur. */
export function computeChecklistDue(
  item: MaintenanceChecklistItem,
  meta: ChecklistItemMeta,
  currentOdometer: number | null | undefined
): ChecklistDueInfo {
  if (!meta.done && !meta.lastDoneKm && !meta.lastDoneAt) {
    return { status: 'unknown', label: 'Pas encore fait — à planifier' };
  }

  const odo = currentOdometer != null && currentOdometer > 0 ? currentOdometer : null;
  let nextDueKm: number | null = null;
  if (meta.lastDoneKm != null && meta.lastDoneKm > 0) {
    nextDueKm = meta.lastDoneKm + item.intervalKm;
  }

  let nextDueDate: string | null = null;
  if (meta.lastDoneAt) {
    const d = new Date(meta.lastDoneAt.includes('T') ? meta.lastDoneAt : `${meta.lastDoneAt}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      d.setMonth(d.getMonth() + item.intervalMonths);
      nextDueDate = d.toISOString().slice(0, 10);
    }
  }

  const kmLeft = nextDueKm != null && odo != null ? nextDueKm - odo : null;
  const daysLeft =
    nextDueDate != null
      ? Math.ceil((new Date(`${nextDueDate}T23:59:59`).getTime() - Date.now()) / 86400000)
      : null;

  if ((kmLeft != null && kmLeft <= 0) || (daysLeft != null && daysLeft <= 0)) {
    const parts: string[] = [];
    if (kmLeft != null && kmLeft <= 0) parts.push(`dépassé de ${Math.abs(Math.round(kmLeft))} km`);
    if (daysLeft != null && daysLeft <= 0) parts.push('échéance date dépassée');
    return {
      status: 'overdue',
      label: `À refaire — ${parts.join(' · ')}`,
      nextDueKm,
      nextDueDate,
    };
  }
  if ((kmLeft != null && kmLeft <= 1000) || (daysLeft != null && daysLeft <= 30)) {
    const parts: string[] = [];
    if (kmLeft != null) parts.push(`dans ~${Math.round(kmLeft)} km`);
    if (daysLeft != null) parts.push(`dans ~${daysLeft} j`);
    return {
      status: 'soon',
      label: `Bientôt — ${parts.join(' / ')}`,
      nextDueKm,
      nextDueDate,
    };
  }
  if (kmLeft != null || daysLeft != null) {
    const parts: string[] = [];
    if (kmLeft != null) parts.push(`encore ~${Math.round(kmLeft)} km`);
    if (daysLeft != null) parts.push(`~${daysLeft} j`);
    return {
      status: 'ok',
      label: `OK — ${parts.join(' / ')}`,
      nextDueKm,
      nextDueDate,
    };
  }
  return { status: 'ok', label: 'Fait (intervalle à suivre au carnet)', nextDueKm, nextDueDate };
}

/** Coche « fait » et réinitialise l’intervalle au compteur / date du jour. */
export function markChecklistDoneAt(
  meta: ChecklistItemMeta,
  odometer: number | null | undefined
): ChecklistItemMeta {
  return {
    ...meta,
    done: true,
    lastDoneKm: odometer != null && odometer > 0 ? odometer : meta.lastDoneKm ?? null,
    lastDoneAt: new Date().toISOString(),
  };
}
