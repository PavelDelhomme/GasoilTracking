import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { BudgetStatus, Trip, Vehicle } from '@/types';
import {
  getActiveVehicle,
  getActiveTrip,
  getVehicles,
  setActiveVehicle as dbSetActiveVehicle,
  updateTrip,
  addTrackedKm,
} from '@/lib/database';
import { averageSpeedKmh, parseRoutePoints, ensureDefaultBudgets, refreshAllBudgets } from '@/lib/calculations';
import { recoverDataAfterUpdateIfNeeded, getUpdatePending } from '@/lib/backup';
import { confirm, notify } from '@/lib/notify';
import { stopBackgroundTracking } from '@/lib/locationService';
import { reverseGeocode } from '@/lib/geocode';
import { applyTripFuelBurn } from '@/lib/fuelLevel';
import { refreshVehicleReminders } from '@/lib/reminders';

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

      await ensureDefaultBudgets(vehicleList);
      const statuses = await refreshAllBudgets();
      setBudgetStatuses(statuses);
      void refreshVehicleReminders();
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectVehicle = useCallback(
    async (id: number) => {
      // Si un trajet GPS est en cours, changer de véhicule coupe ce trajet.
      if (activeTrip && !activeTrip.isPaused && activeTrip.isActive) {
        await new Promise<void>((resolve) => {
          confirm(
            'Changer de véhicule',
            'Un trajet GPS est en cours. Le changement va interrompre le trajet actuel. Continuer ?',
            () => {
              void (async () => {
                await stopBackgroundTracking();

                  const pts = parseRoutePoints(activeTrip.routePoints);
                  const last = pts.length > 0 ? pts[pts.length - 1] : null;

                  let destName = activeTrip.destinationName?.trim();
                  if (!destName && last) {
                    destName =
                      (await reverseGeocode(last.latitude, last.longitude).catch(() => null)) ||
                      'Lieu d’arrivée';
                  }
                  if (!destName) destName = 'Lieu d’arrivée';

                  let originName = activeTrip.originName?.trim();
                  if (!originName && pts[0]) {
                    originName =
                      (await reverseGeocode(pts[0].latitude, pts[0].longitude).catch(() => null)) ||
                      'Lieu de départ';
                  }
                  if (!originName) originName = activeTrip.originName;

                  const durationMin =
                    (Date.now() - new Date(activeTrip.startTime).getTime()) / 60000;
                  const speed = averageSpeedKmh(activeTrip.distanceKm, durationMin);
                  const noteParts = [
                    activeTrip.note,
                    speed > 0 ? `Vitesse moy. ${speed.toFixed(0)} km/h` : null,
                  ].filter(Boolean);

                  await updateTrip(activeTrip.id, {
                    isActive: false,
                    isPaused: false,
                    endTime: new Date().toISOString(),
                    status: 'confirmed',
                    originName: originName || activeTrip.originName,
                    destinationName: destName,
                    note: noteParts.join(' · ') || undefined,
                  });

                  if (activeVehicle && activeTrip.distanceKm > 0) {
                    await applyTripFuelBurn(activeVehicle, activeTrip.distanceKm);
                  }
                  if (activeTrip.distanceKm > 0) {
                    await addTrackedKm(activeTrip.vehicleId, activeTrip.distanceKm);
                  }

                await dbSetActiveVehicle(id);
                await refresh();
                resolve();
              })();
            },
            'Continuer',
            () => resolve()
          );
        });
        return;
      }

      await dbSetActiveVehicle(id);
      await refresh();
    },
    [refresh, activeTrip]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pendingBefore = await getUpdatePending().catch(() => null);
        const recovery = await recoverDataAfterUpdateIfNeeded();
        if (!cancelled && (recovery === 'restored-local' || recovery === 'restored-cloud')) {
          notify(
            'Données restaurées',
            recovery === 'restored-cloud'
              ? 'Vos données cloud ont été récupérées.'
              : 'Votre sauvegarde locale a été récupérée.'
          );
        } else if (!cancelled && pendingBefore && recovery === 'ok') {
          notify('Mise à jour OK', 'Application à jour — votre session est toujours active.');
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) await refresh();
    })();
  }, [refresh]);

  // Pendant un trajet : ne recharge QUE le trajet actif (léger).
  // Un refresh() complet toutes les 3 s + GPS bg = OOM / ANR observés sur Nothing.
  useEffect(() => {
    const live = !!activeTrip?.isActive && !activeTrip?.isPaused;
    if (!live) {
      const interval = setInterval(() => {
        void refresh();
      }, 30000);
      return () => clearInterval(interval);
    }

    const light = setInterval(() => {
      void (async () => {
        try {
          const trip = await getActiveTrip();
          setActiveTrip(trip);
        } catch {
          /* ignore */
        }
      })();
    }, 8000);

    const full = setInterval(() => {
      void refresh();
    }, 45000);

    return () => {
      clearInterval(light);
      clearInterval(full);
    };
  }, [refresh, activeTrip?.id, activeTrip?.isActive, activeTrip?.isPaused]);

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
