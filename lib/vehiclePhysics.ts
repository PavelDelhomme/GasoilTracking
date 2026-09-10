/**
 * Paramètres physiques véhicule + défauts par segment / catalogue.
 * Sert au modèle de conso par bilan de forces (sans OBD).
 *
 * Boîte : on n’essaie PAS de modéliser rapport × vitesse limite × régime.
 * Seul η_trans (rendement moyen selon nb de rapports) est utilisé — suffisant sans OBD.
 */
import type { FuelType, Vehicle, VehicleSegment } from '@/types';
import { VEHICLE_CATALOG, type VehiclePreset } from '@/constants/vehicles';

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
  electrique: 3_600_000,
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
  /** L/100 typique si pas de catalogue ni saisie. */
  typicalL100: number;
  /** Puissance ralenti approximative (W). */
  idlePowerW: number;
};

export const SEGMENT_DEFAULTS: Record<VehicleSegment, Omit<SegmentDefaults, 'segment'>> = {
  city: {
    label: 'Citadine',
    curbWeightKg: 1050,
    dragAreaScx: 0.62,
    gears: 5,
    typicalL100: 5.5,
    idlePowerW: 1400,
  },
  sedan: {
    label: 'Berline / compacte',
    curbWeightKg: 1300,
    dragAreaScx: 0.68,
    gears: 6,
    typicalL100: 6.2,
    idlePowerW: 1600,
  },
  suv: {
    label: 'SUV / crossover',
    curbWeightKg: 1550,
    dragAreaScx: 0.82,
    gears: 6,
    typicalL100: 7.4,
    idlePowerW: 1900,
  },
  mpv: {
    label: 'Monospace',
    curbWeightKg: 1600,
    dragAreaScx: 0.85,
    gears: 6,
    typicalL100: 7.8,
    idlePowerW: 2000,
  },
  van: {
    label: 'Utilitaire / fourgon',
    curbWeightKg: 1800,
    dragAreaScx: 1.05,
    gears: 6,
    typicalL100: 8.5,
    idlePowerW: 2200,
  },
  pickup: {
    label: 'Pick-up',
    curbWeightKg: 2000,
    dragAreaScx: 1.1,
    gears: 6,
    typicalL100: 9.5,
    idlePowerW: 2300,
  },
};

/** Masse / SCx connus pour modèles fréquents (fiches / moyennes constructeur).
 * Pas d’API Cx gratuite fiable — enrichissement local uniquement.
 * Masse : catalogues publics / NHTSA vPIC possibles ; Cx/SCx rarement exposés.
 */
const KNOWN_PHYSICS: Array<{
  re: RegExp;
  curbWeightKg: number;
  dragAreaScx: number;
  gears?: number;
}> = [
  { re: /\b108\b/i, curbWeightKg: 940, dragAreaScx: 0.58, gears: 5 },
  { re: /\b106\b/i, curbWeightKg: 850, dragAreaScx: 0.62, gears: 5 },
  { re: /\b206\+?\b/i, curbWeightKg: 1025, dragAreaScx: 0.63, gears: 5 },
  { re: /\b207\b/i, curbWeightKg: 1200, dragAreaScx: 0.65, gears: 5 },
  { re: /\b208\b/i, curbWeightKg: 1180, dragAreaScx: 0.61, gears: 6 },
  { re: /\b2008\b/i, curbWeightKg: 1280, dragAreaScx: 0.72, gears: 6 },
  { re: /\b306\b/i, curbWeightKg: 1100, dragAreaScx: 0.66, gears: 5 },
  { re: /\b307\b/i, curbWeightKg: 1280, dragAreaScx: 0.68, gears: 5 },
  { re: /\b308\b/i, curbWeightKg: 1320, dragAreaScx: 0.65, gears: 6 },
  { re: /\b3008\b/i, curbWeightKg: 1480, dragAreaScx: 0.78, gears: 6 },
  { re: /\b406\b/i, curbWeightKg: 1380, dragAreaScx: 0.68, gears: 5 },
  { re: /\b407\b/i, curbWeightKg: 1520, dragAreaScx: 0.7, gears: 6 },
  { re: /\b5008\b/i, curbWeightKg: 1580, dragAreaScx: 0.82, gears: 6 },
  { re: /\b508\b/i, curbWeightKg: 1500, dragAreaScx: 0.66, gears: 6 },
  { re: /\b806\b/i, curbWeightKg: 1680, dragAreaScx: 0.9, gears: 5 },
  { re: /\b807\b/i, curbWeightKg: 1750, dragAreaScx: 0.92, gears: 6 },
  { re: /\bpartner\b/i, curbWeightKg: 1420, dragAreaScx: 0.88, gears: 5 },
  { re: /\brifter\b/i, curbWeightKg: 1450, dragAreaScx: 0.86, gears: 6 },
  { re: /\bexpert\b/i, curbWeightKg: 1750, dragAreaScx: 1.05, gears: 6 },
  { re: /\bboxer\b/i, curbWeightKg: 2100, dragAreaScx: 1.25, gears: 6 },
  { re: /\btouran\b/i, curbWeightKg: 1550, dragAreaScx: 0.84, gears: 6 },
  { re: /\bgolf\b/i, curbWeightKg: 1320, dragAreaScx: 0.64, gears: 6 },
  { re: /\bpolo\b/i, curbWeightKg: 1120, dragAreaScx: 0.62, gears: 5 },
  { re: /\bpassat\b/i, curbWeightKg: 1480, dragAreaScx: 0.66, gears: 6 },
  { re: /\btiguan\b/i, curbWeightKg: 1620, dragAreaScx: 0.8, gears: 7 },
  { re: /\bcaddy\b/i, curbWeightKg: 1480, dragAreaScx: 0.9, gears: 6 },
  { re: /\bclio\b/i, curbWeightKg: 1150, dragAreaScx: 0.64, gears: 5 },
  { re: /\btwingo\b/i, curbWeightKg: 980, dragAreaScx: 0.6, gears: 5 },
  { re: /\bcaptur\b/i, curbWeightKg: 1280, dragAreaScx: 0.74, gears: 6 },
  { re: /\bm[eé]gane\b/i, curbWeightKg: 1350, dragAreaScx: 0.65, gears: 6 },
  { re: /\bsc[eé]nic\b/i, curbWeightKg: 1500, dragAreaScx: 0.82, gears: 6 },
  { re: /\bkangoo\b/i, curbWeightKg: 1380, dragAreaScx: 0.92, gears: 5 },
  { re: /\btrafic\b/i, curbWeightKg: 1850, dragAreaScx: 1.15, gears: 6 },
  { re: /\bduster\b/i, curbWeightKg: 1320, dragAreaScx: 0.82, gears: 6 },
  { re: /\bsandero\b/i, curbWeightKg: 1080, dragAreaScx: 0.66, gears: 5 },
  { re: /\bc1\b/i, curbWeightKg: 900, dragAreaScx: 0.58, gears: 5 },
  { re: /\bc3 aircross\b/i, curbWeightKg: 1280, dragAreaScx: 0.76, gears: 6 },
  { re: /\bc3\b/i, curbWeightKg: 1100, dragAreaScx: 0.64, gears: 5 },
  { re: /\bc4\b/i, curbWeightKg: 1300, dragAreaScx: 0.66, gears: 6 },
  { re: /\bc5 aircross\b/i, curbWeightKg: 1550, dragAreaScx: 0.8, gears: 8 },
  { re: /\bberlingo\b/i, curbWeightKg: 1420, dragAreaScx: 0.88, gears: 6 },
  { re: /\bfiesta\b/i, curbWeightKg: 1120, dragAreaScx: 0.63, gears: 5 },
  { re: /\bfocus\b/i, curbWeightKg: 1320, dragAreaScx: 0.65, gears: 6 },
  { re: /\byaris\b/i, curbWeightKg: 1100, dragAreaScx: 0.6, gears: 5 },
  { re: /\bcorolla\b/i, curbWeightKg: 1350, dragAreaScx: 0.62, gears: 6 },
  { re: /\bcivic\b/i, curbWeightKg: 1320, dragAreaScx: 0.63, gears: 6 },
  { re: /\bjazz\b/i, curbWeightKg: 1120, dragAreaScx: 0.62, gears: 5 },
  { re: /\bqashqai\b/i, curbWeightKg: 1450, dragAreaScx: 0.76, gears: 6 },
  { re: /\bsportage\b/i, curbWeightKg: 1580, dragAreaScx: 0.8, gears: 7 },
  { re: /\btucson\b/i, curbWeightKg: 1550, dragAreaScx: 0.78, gears: 7 },
  { re: /\bcorsa\b/i, curbWeightKg: 1100, dragAreaScx: 0.62, gears: 5 },
  { re: /\bastra\b/i, curbWeightKg: 1320, dragAreaScx: 0.65, gears: 6 },
  { re: /\btransit\b/i, curbWeightKg: 2100, dragAreaScx: 1.2, gears: 6 },
];

const SEGMENT_KEYWORDS: Array<{ segment: VehicleSegment; re: RegExp }> = [
  { segment: 'pickup', re: /landtrek|hilux|ranger|amarok|navara|l\s*200/i },
  { segment: 'van', re: /boxer|jumper|trafic|transit|expert|jumpy|vivaro|sprinter|master|ducato/i },
  {
    segment: 'mpv',
    re: /scenic|espace|touran|c8|807|806|5008|picnic|sharan|alber|partner|rifter|berlingo|kangoo|caddy/i,
  },
  {
    segment: 'suv',
    re: /2008|3008|c3 aircross|c5 aircross|captur|kadjar|koleos|austral|arkana|tiguan|sportage|tucson|qashqai|cx-|x1|x3|gla|duster|sandero stepway/i,
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
  if (/suv|crossover|cross/i.test(hay)) return 'suv';
  if (/sw|break|estate/i.test(hay)) return 'sedan';
  return 'sedan';
}

/** Meilleure entrée catalogue (marque + modèle + année/carburant). */
export function findCatalogueMatch(
  brand: string,
  model: string,
  year?: number,
  fuel?: FuelType
): VehiclePreset | null {
  const b = (brand || '').trim().toLowerCase();
  const m = (model || '').trim().toLowerCase();
  if (!b && !m) return null;
  const candidates = VEHICLE_CATALOG.filter((v) => {
    const vb = v.brand.toLowerCase();
    const vm = v.model.toLowerCase();
    const brandOk = !b || vb.includes(b) || b.includes(vb);
    const modelOk =
      !m ||
      vm === m ||
      vm.includes(m) ||
      m.includes(vm) ||
      `${vb} ${vm}`.includes(m);
    if (!brandOk || !modelOk) return false;
    if (fuel && v.fuel !== fuel) return false;
    return true;
  });
  if (!candidates.length) return null;
  if (year && year > 1970) {
    candidates.sort(
      (a, b2) => Math.abs(a.year - year) - Math.abs(b2.year - year) || b2.year - a.year
    );
  } else {
    candidates.sort((a, b2) => b2.year - a.year);
  }
  return candidates[0];
}

function knownPhysicsFor(brand: string, model: string) {
  const hay = `${brand} ${model}`;
  for (const k of KNOWN_PHYSICS) {
    if (k.re.test(hay)) return k;
  }
  return null;
}

/** Rendement transmission selon nb de rapports (pas de carte rapports×vitesse). */
export function transmissionEfficiency(gears?: number | null): number {
  if (gears == null || gears <= 0) return 0.88;
  if (gears <= 4) return 0.85;
  if (gears === 5) return 0.87;
  if (gears === 6) return 0.89;
  return 0.9;
}

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
  typicalL100: number;
  idlePowerW: number;
  fromDefaults: {
    mass: boolean;
    scx: boolean;
    segment: boolean;
  };
};

/** L/100 de base : saisie > catalogue > segment (jamais un 7,5 figé universel). */
export function resolveBaseConsumptionPer100(
  vehicle: Pick<Vehicle, 'consumptionPer100' | 'brand' | 'model' | 'year' | 'fuelType' | 'vehicleSegment'>
): number {
  if (vehicle.consumptionPer100 > 0) return vehicle.consumptionPer100;
  const cat = findCatalogueMatch(vehicle.brand, vehicle.model, vehicle.year, vehicle.fuelType);
  if (cat && cat.consumption > 0) return cat.consumption;
  const segment =
    vehicle.vehicleSegment && SEGMENT_DEFAULTS[vehicle.vehicleSegment]
      ? vehicle.vehicleSegment
      : inferVehicleSegment(vehicle.brand || '', vehicle.model || '');
  return SEGMENT_DEFAULTS[segment].typicalL100;
}

export function resolveVehiclePhysics(
  vehicle: Pick<
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
    | 'consumptionPer100'
  >
): ResolvedPhysics {
  const segment =
    vehicle.vehicleSegment && SEGMENT_DEFAULTS[vehicle.vehicleSegment]
      ? vehicle.vehicleSegment
      : inferVehicleSegment(vehicle.brand || '', vehicle.model || '');
  const def = SEGMENT_DEFAULTS[segment];
  const known = knownPhysicsFor(vehicle.brand || '', vehicle.model || '');
  const cat = findCatalogueMatch(vehicle.brand, vehicle.model, vehicle.year, vehicle.fuelType);

  const massFromDefault = !(vehicle.curbWeightKg != null && vehicle.curbWeightKg > 400);
  const scxFromDefault = !(vehicle.dragAreaScx != null && vehicle.dragAreaScx > 0.3);
  const curb = massFromDefault
    ? known?.curbWeightKg ?? def.curbWeightKg
    : Number(vehicle.curbWeightKg);
  const payload =
    vehicle.payloadKg != null && vehicle.payloadKg >= 0 ? Number(vehicle.payloadKg) : DEFAULT_PAYLOAD_KG;
  const scx = scxFromDefault ? known?.dragAreaScx ?? def.dragAreaScx : Number(vehicle.dragAreaScx);
  const gears =
    vehicle.transmissionGears != null && vehicle.transmissionGears > 0
      ? vehicle.transmissionGears
      : known?.gears ?? def.gears;

  const typicalL100 =
    vehicle.consumptionPer100 > 0
      ? vehicle.consumptionPer100
      : cat?.consumption ?? def.typicalL100;

  // Ralenti un peu plus élevé si masse élevée
  const idlePowerW = Math.round(def.idlePowerW * Math.min(1.35, Math.max(0.85, curb / def.curbWeightKg)));

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
    typicalL100,
    idlePowerW,
    fromDefaults: {
      mass: massFromDefault,
      scx: scxFromDefault,
      segment: !vehicle.vehicleSegment,
    },
  };
}

/** Valeurs à préremplir : catalogue + physique connue + segment. */
export function suggestPhysicsFields(
  brand: string,
  model: string,
  gears?: number | null,
  opts?: { year?: number; fuel?: FuelType }
) {
  const segment = inferVehicleSegment(brand, model);
  const def = SEGMENT_DEFAULTS[segment];
  const known = knownPhysicsFor(brand, model);
  const cat = findCatalogueMatch(brand, model, opts?.year, opts?.fuel);
  return {
    vehicleSegment: segment,
    curbWeightKg: known?.curbWeightKg ?? cat?.curbWeightKg ?? def.curbWeightKg,
    dragAreaScx: known?.dragAreaScx ?? cat?.dragAreaScx ?? def.dragAreaScx,
    transmissionGears:
      gears != null && gears > 0 ? gears : known?.gears ?? def.gears,
    payloadKg: DEFAULT_PAYLOAD_KG,
    segmentLabel: def.label,
    consumptionPer100: cat?.consumption ?? def.typicalL100,
    tankCapacity: cat?.tank,
    fuelType: cat?.fuel ?? opts?.fuel,
    year: cat?.year ?? opts?.year,
  };
}
