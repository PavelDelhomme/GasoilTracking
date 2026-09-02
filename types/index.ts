export type FuelType = 'diesel' | 'essence' | 'gpl' | 'electrique';

export interface Vehicle {
  id: number;
  name: string;
  brand: string;
  model: string;
  year: number;
  fuelType: FuelType;
  /** Consommation théorique en L/100km (ou kWh/100km pour électrique) */
  consumptionPer100: number;
  /** Capacité du réservoir en litres */
  tankCapacity: number;
  /** Prix carburant par défaut €/L */
  defaultFuelPrice: number;
  /** Kilométrage actuel */
  currentOdometer: number;
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
  odometer: number;
  isFull: boolean;
  note?: string;
}

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
  destinationName?: string;
  isActive: boolean;
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
