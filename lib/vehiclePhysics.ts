/**
 * Paramètres physiques véhicule + défauts par segment.
 * Sert au modèle de conso par bilan de forces (sans OBD).
 */
import type { FuelType, Vehicle, VehicleSegment } from '@/types';

export type { VehicleSegment };

export const AIR_DENSITY = 1.225; // kg/m³
export const GRAVITY = 9.81; // m/s²
/** Coefficient de roulement pneus moyens. */
export const DEFAULT_ROLLING_CR = 0.011;
/** Charge conducteur + plein approximative. */
export const DEFAULT_PAYLOAD_KG = 150;

/** Énergie carburant (J/L). */
export const FUEL_ENERGY_J_PER_L: Record<FuelType, number> = {
  essence: 32_000_000,
  diesel: 38_000_000,
  gpl: 25_000_000,
  electrique: 3_600_000, // kWh→J pour 1 « L-équivalent » display (peu utilisé)
};

/** Rendement thermique moteur de base. */
export const BASE_ENGINE_ETA: Record<FuelType, number> = {
  essence: 0.28,
  diesel: 0.33,
  gpl: 0.26,
  electrique: 0.85,
};

export type SegmentDefaults = {
  segment: VehicleSegment;
  label: string;
  curbWeightKg: number;
  dragAreaScx: number; // S × Cx (m²)
  gears: number;
};

export const SEGMENT_DEFAULTS: Record<VehicleSegment, Omit<SegmentDefaults, 'segment'>> = {
  city: { label: 'Citadine', curbWeightKg: 1050, dragAreaScx: 0.62, gears: 5 },
  sedan: { label: 'Berline / compacte', curbWeightKg: 1300, dragAreaScx: 0.68, gears: 6 },
  suv: { label: 'SUV / crossover', curbWeightKg: 1550, dragAreaScx: 0.82, gears: 6 },
  mpv: { label: 'Monospace', curbWeightKg: 1600, dragAreaScx: 0.85, gears: 6 },
  van: { label: 'Utilitaire / fourgon', curbWeightKg: 1800, dragAreaScx: 1.05, gears: 6 },
  pickup: { label: 'Pick-up', curbWeightKg: 2000, dragAreaScx: 1.1, gears: 6 },
};

const SEGMENT_KEYWORDS: Array<{ segment: VehicleSegment; re: RegExp }> = [
  { segment: 'pickup', re: /landtrek|hilux|ranger|amarok|navara|l\s*200/i },
  { segment: 'van', re: /boxer|jumper|trafic|transit|expert|jumpy|vivaro|sprinter|master|ducato/i },
  {
    segment: 'mpv',
    re: /scenic|espace|touran|c8|807|806|5008|picnic|sharan|alber|partner|rifter|berlingo|kangoo|caddy/i,
  },
  {
    segment: 'suv',
    re: /2008|3008|c3 aircross|c5 aircross|captur|kadjar|koleos|austral|arkana|tiguan|sportage|tucson|qashqai|cx-|x1|x3|gla|3008|5008|duster|sandero stepway/i,
  },
  {
    segment: 'city',
    re: /\b(108|206|208|c1|c3|clio|twingo|aygo|i10|panda|500|up!|micra|swift|polo|fiesta|yaris|jazz|adam)\b/i,
  },
];

export function inferVehicleSegment(brand: string, model: string): VehicleSegment {
  const hay = `${brand} ${model}`.trim();
  for (const { segment, re } of SEGMENT_KEYWORDS) {
    if (re.test(hay)) return segment;
  }
  // Heuristique taille nom
  if (/suv|crossover|cross/i.test(hay)) return 'suv';
  if (/sw|break|estate/i.test(hay)) return 'sedan';
  return 'sedan';
}

/** Rendement transmission selon nb de rapports. */
export function transmissionEfficiency(gears?: number | null): number {
  if (gears == null || gears <= 0) return 0.88;
  if (gears <= 4) return 0.85;
  if (gears === 5) return 0.87;
  if (gears === 6) return 0.89;
  return 0.9; // 7+ / DCT approx
}

/** Rendement moteur selon carburant + âge. */
export function engineEfficiency(fuel: FuelType, year: number, nowYear = new Date().getFullYear()): number {
  let eta = BASE_ENGINE_ETA[fuel] ?? 0.28;
  if (!year || year < 1970) return Math.max(0.2, eta - 0.02);
  const age = Math.max(0, nowYear - year);
  if (age > 10) {
    const steps = Math.floor((age - 10) / 5);
    eta -= steps * 0.001;
  }
  return Math.max(0.2, Math.min(0.4, eta));
}

export type ResolvedPhysics = {
  segment: VehicleSegment;
  curbWeightKg: number;
  payloadKg: number;
  massKg: number;
  dragAreaScx: number;
  rollingCr: number;
  gears: number | null;
  etaTrans: number;
  etaEngine: number;
  energyJPerL: number;
  fromDefaults: {
    mass: boolean;
    scx: boolean;
    segment: boolean;
  };
};

/** Résout masse / SCx / segment avec défauts auto si champs absents. */
export function resolveVehiclePhysics(vehicle: Pick<
  Vehicle,
  | 'brand'
  | 'model'
  | 'year'
  | 'fuelType'
  | 'transmissionGears'
  | 'curbWeightKg'
  | 'dragAreaScx'
  | 'vehicleSegment'
  | 'payloadKg'
>): ResolvedPhysics {
  const segment =
    vehicle.vehicleSegment && SEGMENT_DEFAULTS[vehicle.vehicleSegment]
      ? vehicle.vehicleSegment
      : inferVehicleSegment(vehicle.brand || '', vehicle.model || '');
  const def = SEGMENT_DEFAULTS[segment];
  const massFromDefault = !(vehicle.curbWeightKg != null && vehicle.curbWeightKg > 400);
  const scxFromDefault = !(vehicle.dragAreaScx != null && vehicle.dragAreaScx > 0.3);
  const curb = massFromDefault ? def.curbWeightKg : Number(vehicle.curbWeightKg);
  const payload =
    vehicle.payloadKg != null && vehicle.payloadKg >= 0 ? Number(vehicle.payloadKg) : DEFAULT_PAYLOAD_KG;
  const scx = scxFromDefault ? def.dragAreaScx : Number(vehicle.dragAreaScx);
  const gears =
    vehicle.transmissionGears != null && vehicle.transmissionGears > 0
      ? vehicle.transmissionGears
      : def.gears;

  return {
    segment,
    curbWeightKg: curb,
    payloadKg: payload,
    massKg: curb + payload,
    dragAreaScx: scx,
    rollingCr: DEFAULT_ROLLING_CR,
    gears,
    etaTrans: transmissionEfficiency(gears),
    etaEngine: engineEfficiency(vehicle.fuelType, vehicle.year),
    energyJPerL: FUEL_ENERGY_J_PER_L[vehicle.fuelType] || FUEL_ENERGY_J_PER_L.essence,
    fromDefaults: {
      mass: massFromDefault,
      scx: scxFromDefault,
      segment: !vehicle.vehicleSegment,
    },
  };
}

/** Valeurs à préremplir dans le formulaire véhicule. */
export function suggestPhysicsFields(brand: string, model: string, gears?: number | null) {
  const segment = inferVehicleSegment(brand, model);
  const def = SEGMENT_DEFAULTS[segment];
  return {
    vehicleSegment: segment,
    curbWeightKg: def.curbWeightKg,
    dragAreaScx: def.dragAreaScx,
    transmissionGears: gears != null && gears > 0 ? gears : def.gears,
    payloadKg: DEFAULT_PAYLOAD_KG,
    segmentLabel: def.label,
  };
}
