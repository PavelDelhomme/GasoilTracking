/**
 * Hash de contenu snapshot — module pur (pas de RN / SQLite) pour tests & sync skip.
 */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Forme minimale pour le hash (évite d’importer dataSnapshot → database). */
export type SnapshotHashInput = {
  schema?: number;
  exportedAt?: string;
  appVersion?: string;
  vehicles?: Array<{
    id: number;
    estimatedFuelLiters?: number | null;
    currentOdometer?: number | null;
    trackedKm?: number | null;
    consumptionLearnFactor?: number | null;
    isActive?: boolean;
  }>;
  fillUps?: Array<{
    id: number;
    vehicleId: number;
    date: string;
    liters: number;
    totalCost: number;
    isFull?: boolean;
  }>;
  budgets?: Array<{
    id: number;
    vehicleId?: number | null;
    amount: number;
    spent: number;
    isActive?: boolean;
    period: string;
  }>;
  trips?: Array<{
    id: number;
    vehicleId: number;
    distanceKm: number;
    startTime: string;
    endTime?: string | null;
    status?: string;
    isActive?: boolean;
    estimatedFuelUsed?: number;
    estimatedCost?: number;
    destinationName?: string | null;
    routePoints?: string;
  }>;
  places?: Array<{
    id: number;
    name: string;
    latitude: number;
    longitude: number;
  }>;
  recurringRoutes?: Array<{ id: number; distanceKm: number; name: string }>;
  maintenances?: Array<{
    id: number;
    vehicleId: number;
    kind: string;
    doneAt?: string | null;
    amount?: number | null;
    status: string;
  }>;
  clientPrefs?: { onboardingDoneV2?: boolean };
};

/**
 * Empreinte stable du contenu métier (ignore `exportedAt`, `appVersion`, `routePoints`).
 * Permet de skip un sync cosmétique si local ≡ remote.
 */
export function snapshotContentHash(snap: SnapshotHashInput | null | undefined): string {
  if (!snap) return '';
  const trips = [...(snap.trips || [])]
    .map((t) => ({
      id: t.id,
      vehicleId: t.vehicleId,
      distanceKm: t.distanceKm,
      startTime: t.startTime,
      endTime: t.endTime ?? null,
      status: t.status,
      isActive: !!t.isActive,
      estimatedFuelUsed: t.estimatedFuelUsed,
      estimatedCost: t.estimatedCost,
      destinationName: t.destinationName ?? null,
    }))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const vehicles = [...(snap.vehicles || [])]
    .map((v) => ({
      id: v.id,
      estimatedFuelLiters: v.estimatedFuelLiters,
      currentOdometer: v.currentOdometer,
      trackedKm: v.trackedKm,
      consumptionLearnFactor: v.consumptionLearnFactor ?? null,
      isActive: !!v.isActive,
    }))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const fillUps = [...(snap.fillUps || [])]
    .map((f) => ({
      id: f.id,
      vehicleId: f.vehicleId,
      date: f.date,
      liters: f.liters,
      totalCost: f.totalCost,
      isFull: !!f.isFull,
    }))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const budgets = [...(snap.budgets || [])]
    .map((b) => ({
      id: b.id,
      vehicleId: b.vehicleId ?? null,
      amount: b.amount,
      spent: b.spent,
      isActive: !!b.isActive,
      period: b.period,
    }))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const places = [...(snap.places || [])]
    .map((p) => ({ id: p.id, name: p.name, latitude: p.latitude, longitude: p.longitude }))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const recurringRoutes = [...(snap.recurringRoutes || [])]
    .map((r) => ({
      id: r.id,
      distanceKm: r.distanceKm,
      name: r.name,
    }))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const maintenances = [...(snap.maintenances || [])]
    .map((m) => ({
      id: m.id,
      vehicleId: m.vehicleId,
      kind: m.kind,
      doneAt: m.doneAt ?? null,
      amount: m.amount ?? null,
      status: m.status,
    }))
    .sort((a, b) => Number(a.id) - Number(b.id));

  return fnv1aHex(
    stableStringify({
      schema: snap.schema ?? 1,
      vehicles,
      fillUps,
      budgets,
      trips,
      places,
      recurringRoutes,
      maintenances,
      clientPrefs: {
        onboardingDoneV2: !!snap.clientPrefs?.onboardingDoneV2,
      },
    })
  );
}
