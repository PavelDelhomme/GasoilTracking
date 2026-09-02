import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { BudgetStatus, Trip, Vehicle } from '@/types';
import {
  getActiveVehicle,
  getActiveTrip,
  getVehicles,
  setActiveVehicle as dbSetActiveVehicle,
} from '@/lib/database';
import { refreshBudgets } from '@/lib/calculations';
import { recoverDataAfterUpdateIfNeeded } from '@/lib/backup';
import { notify } from '@/lib/notify';

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

  const selectVehicle = useCallback(
    async (id: number) => {
      await dbSetActiveVehicle(id);
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const recovery = await recoverDataAfterUpdateIfNeeded();
        if (!cancelled && (recovery === 'restored-local' || recovery === 'restored-cloud')) {
          notify(
            'Données restaurées',
            recovery === 'restored-cloud'
              ? 'Vos données cloud ont été récupérées.'
              : 'Votre sauvegarde locale a été récupérée.'
          );
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) await refresh();
    })();
    const interval = setInterval(() => {
      void refresh();
    }, activeTrip ? 5000 : 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
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
