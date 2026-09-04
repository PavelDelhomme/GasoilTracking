export type FuelType = 'diesel' | 'essence' | 'gpl' | 'electrique';

export interface Vehicle {
  id: number;
  name: string;
  brand: string;
  model: string;
  year: number;
  fuelType: FuelType;
  /** Consommation théorique / adaptée utilisateur en L/100km */
  consumptionPer100: number;
  tankCapacity: number;
  defaultFuelPrice: number;
  currentOdometer: number;
  /** false = compteur HS / illisible → suivi km via GPS */
  hasOdometer: boolean;
  /** Km cumulés via trajets GPS (si pas de compteur) */
  trackedKm: number;
  /**
   * Niveau carburant estimé (L). null = inconnu (autre voiture / pas de référence).
   * Mis à jour aux pleins / trajets ; saisissable manuellement.
   */
  estimatedFuelLiters: number | null;
  /**
   * Si true/undefined : la conso L/100 s’ajuste aux pleins.
   * Si false : valeur figée (saisie manuelle).
   */
  consumptionAutoAdapt?: boolean;
  /** Rappels CT / contre-visite / échéances (notifications locales). */
  notifyMaintenance?: boolean;
  /** Alerte « bientôt plein » selon le niveau réservoir. */
  notifyLowFuel?: boolean;
  /** Seuil litres restants pour l’alerte plein (défaut ~20 % du réservoir). */
  lowFuelThresholdLiters?: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface FillUp {
  id: number;
  vehicleId: number;
  date: string;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  /** null si véhicule sans compteur */
  odometer: number | null;
  /** km parcourus depuis dernier plein (GPS ou saisie manuelle) */
  distanceSinceLastKm: number | null;
  isFull: boolean;
  note?: string;
  /** Trajet lié (optionnel) */
  tripId?: number | null;
}

export type PlaceKind = 'home' | 'work' | 'other' | 'station';

export interface Place {
  id: number;
  name: string;
  address: string;
  kind: PlaceKind;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface RecurringRoute {
  id: number;
  vehicleId: number | null;
  name: string;
  fromPlaceId: number;
  toPlaceId: number;
  distanceKm: number;
  /** Allers (ou trajets) par semaine hors vacances — souvent = jours travaillés */
  timesPerWeek: number;
  /** Jours travaillés typiques / semaine (1–7), pour l’estimation */
  workDaysPerWeek: number;
  /** Pause estimation (congés / vacances) */
  isOnVacation: boolean;
  /** Fin des vacances (AAAA-MM-JJ) — optionnel */
  vacationUntil: string | null;
  isActive: boolean;
}

export interface Budget {
  id: number;
  vehicleId: number | null;
  name: string;
  /** Montant total du budget (devise du pays choisi) */
  amount: number;
  /** Montant déjà consommé (calculé dynamiquement) */
  spent: number;
  period: 'monthly' | 'yearly' | 'custom';
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export type TripStatus = 'pending' | 'confirmed' | 'rejected';
export type TripSource = 'gps' | 'manual' | 'maps_import' | 'detected';

export interface Trip {
  id: number;
  vehicleId: number;
  startTime: string;
  endTime: string | null;
  distanceKm: number;
  estimatedFuelUsed: number;
  estimatedCost: number;
  /** Polyline encodée ou JSON des points GPS */
  routePoints: string;
  originName?: string;
  destinationName?: string;
  isActive: boolean;
  /** true = suivi GPS en pause (arrêt station, etc.) */
  isPaused?: boolean;
  /** pending = à valider (import / détection) */
  status: TripStatus;
  source: TripSource;
  /** Lien optionnel vers un plein */
  fillUpId?: number | null;
  note?: string;
}

export interface TripStats {
  distanceKm: number;
  fuelUsed: number;
  cost: number;
  durationMinutes: number;
}

export interface ConsumptionStats {
  averageConsumption: number;
  totalDistance: number;
  totalFuel: number;
  totalCost: number;
  fillUpCount: number;
}

/** Stats depuis le dernier plein (trajets réels) */
export interface SinceLastFillStats {
  lastFill: FillUp | null;
  tripKm: number;
  tripCount: number;
  fuelUsedEst: number;
  costEst: number;
  fuelRemainingEst: number;
  rangeKm: number;
}

/** Agrégat d’un mois de pleins */
export interface MonthFillStats {
  monthKey: string;
  count: number;
  totalCost: number;
  totalLiters: number;
  avgPricePerLiter: number;
  avgConsumption: number | null;
  totalDistanceKm: number;
}

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  remaining: number;
  percentUsed: number;
  projectedEndOfPeriod: number;
}

/** Entretien / admin véhicule (CT, contre-visite, etc.) */
export type MaintenanceKind =
  | 'controle_technique'
  | 'contre_visite'
  | 'controle_pollution'
  | 'entretien'
  | 'assurance'
  | 'amende'
  | 'autre';

export type MaintenanceStatus = 'done' | 'pending' | 'overdue' | 'cancelled';

export interface VehicleMaintenance {
  id: number;
  vehicleId: number;
  kind: MaintenanceKind;
  title: string;
  /** Coût payé (ou estimé) */
  amount: number | null;
  /** Date de réalisation (si fait) */
  doneAt: string | null;
  /** Échéance légale / rappel */
  dueDate: string | null;
  status: MaintenanceStatus;
  note?: string;
  createdAt: string;
}
