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

export type TripStatus = 'pending' | 'confirmed' | 'rejected';
export type TripSource = 'gps' | 'manual' | 'maps_import' | 'detected';

export interface Budget {
  id: number;
  vehicleId: number | null;
  name: string;
  /** Montant total du budget en € */
  amount: number;
  /** Montant déjà consommé (calculé dynamiquement) */
  spent: number;
  period: 'monthly' | 'yearly' | 'custom';
  startDate: string;
  endDate: string;
  isActive: boolean;
}

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

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  remaining: number;
  percentUsed: number;
  projectedEndOfPeriod: number;
}
