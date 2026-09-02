import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { BudgetStatus, Trip, Vehicle } from '@/types';
import {
  getActiveVehicle,
  getActiveTrip,
  getVehicles,
  setActiveVehicle as dbSetActiveVehicle,
} from '@/lib/database';
import { refreshBudgets } from '@/lib/calculations';

interface AppContextType {
  activeVehicle: Vehicle | null;
  vehicles: Vehicle[];
  activeTrip: Trip | null;
  budgetStatuses: BudgetStatus[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  selectVehicle: (id: number) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [activeVehicle, setActiveVehicleState] = useState<Vehicle | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [budgetStatuses, setBudgetStatuses] = useState<BudgetStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [vehicleList, active, trip] = await Promise.all([
        getVehicles(),
        getActiveVehicle(),
        getActiveTrip(),
      ]);
      setVehicles(vehicleList);
      setActiveVehicleState(active);
      setActiveTrip(trip);

      if (active) {
        const statuses = await refreshBudgets(active.id);
        setBudgetStatuses(statuses);
      } else {
        const statuses = await refreshBudgets();
        setBudgetStatuses(statuses);
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectVehicle = useCallback(async (id: number) => {
    await dbSetActiveVehicle(id);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, activeTrip ? 5000 : 30000);
    return () => clearInterval(interval);
  }, [refresh, activeTrip]);

  return (
    <AppContext.Provider
      value={{
        activeVehicle,
        vehicles,
        activeTrip,
        budgetStatuses,
        isLoading,
        refresh,
        selectVehicle,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
