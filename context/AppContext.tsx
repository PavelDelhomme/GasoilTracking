import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { BudgetStatus, Trip, Vehicle } from '@/types';
import {
  getActiveVehicle,
  getActiveTrip,
  getActiveTripLite,
  getTripById,
  getVehicles,
  setActiveVehicle as dbSetActiveVehicle,
  updateTrip,
  addTrackedKm,
} from '@/lib/database';
import { parseRoutePoints, ensureDefaultBudgets, refreshAllBudgets, calculateTripStats } from '@/lib/calculations';
import { recoverDataAfterUpdateIfNeeded, getUpdatePending } from '@/lib/backup';
import { confirm, notify } from '@/lib/notify';
import { flushTripUpdates, stopBackgroundTracking } from '@/lib/locationService';
import { reverseGeocode } from '@/lib/geocode';
import { applyTripFuelBurn } from '@/lib/fuelLevel';
import { refreshVehicleReminders } from '@/lib/reminders';
import { repairTripHistory } from '@/lib/repairTripHistory';
import { repairFillUpVehiclesAndBudgets } from '@/lib/repairFillUpVehicles';
import { finalizeStaleActiveTrip } from '@/lib/finalizeStaleTrip';

const REMINDERS_THROTTLE_MS = 2 * 60 * 60 * 1000;

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
  /** Évite repairTripHistory à chaque poll 90s — seulement au boot / changement véhicule. */
  const repairedForVehicle = useRef<number | 'none' | null>(null);
  const fillBudgetRepaired = useRef(false);
  const lastRemindersAt = useRef(0);
  const staleTripChecked = useRef(false);

  const refresh = useCallback(async () => {
    try {
      if (!staleTripChecked.current) {
        try {
          const closed = await finalizeStaleActiveTrip();
          if (closed) {
            await stopBackgroundTracking().catch(() => undefined);
          } else {
            // FGS orphelin possible (trajet déjà inactif)
            const live = await getActiveTrip();
            if (!live?.isActive) {
              await stopBackgroundTracking().catch(() => undefined);
            }
          }
          staleTripChecked.current = true;
        } catch (e) {
          console.warn('finalizeStaleActiveTrip', e);
        }
      }

      const [vehicleList, active, trip] = await Promise.all([
        getVehicles(),
        getActiveVehicle(),
        // Lite : jamais pousser le JSON GPS complet dans le Context React (OOM trajet).
        getActiveTripLite(),
      ]);
      setVehicles(vehicleList);
      setActiveVehicleState(active);
      setActiveTrip(trip);

      if (!fillBudgetRepaired.current) {
        try {
          await repairFillUpVehiclesAndBudgets();
          fillBudgetRepaired.current = true;
        } catch (e) {
          console.warn('repairFillUpVehiclesAndBudgets', e);
        }
      }

      const repairKey = active?.id ?? 'none';
      if (repairedForVehicle.current !== repairKey) {
        try {
          await repairTripHistory(active?.id);
          repairedForVehicle.current = repairKey;
        } catch (e) {
          console.warn('repairTripHistory', e);
        }
      }

      await ensureDefaultBudgets(vehicleList);
      const statuses = await refreshAllBudgets();
      setBudgetStatuses(statuses);
      const now = Date.now();
      if (now - lastRemindersAt.current >= REMINDERS_THROTTLE_MS) {
        lastRemindersAt.current = now;
        void refreshVehicleReminders();
      }
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
                await flushTripUpdates().catch(() => undefined);
                const fresh = (await getTripById(activeTrip.id).catch(() => null)) || activeTrip;

                  const pts = parseRoutePoints(fresh.routePoints);
                  const last = pts.length > 0 ? pts[pts.length - 1] : null;

                  let destName = fresh.destinationName?.trim();
                  if (!destName && last) {
                    destName =
                      (await reverseGeocode(last.latitude, last.longitude).catch(() => null)) ||
                      'Lieu d’arrivée';
                  }
                  if (!destName) destName = 'Lieu d’arrivée';

                  let originName = fresh.originName?.trim();
                  if (!originName && pts[0]) {
                    originName =
                      (await reverseGeocode(pts[0].latitude, pts[0].longitude).catch(() => null)) ||
                      'Lieu de départ';
                  }
                  if (!originName) originName = fresh.originName;

                  if (!activeVehicle) {
                    await dbSetActiveVehicle(id);
                    await refresh();
                    resolve();
                    return;
                  }

                  const live = calculateTripStats(
                    activeVehicle,
                    fresh.distanceKm,
                    fresh.startTime,
                    new Date().toISOString(),
                    fresh.routePoints
                  );
                  const speed =
                    live.movingSpeedKmh > 0
                      ? live.movingSpeedKmh
                      : (fresh.distanceKm / Math.max(live.durationMinutes, 0.01)) * 60;
                  const noteParts = [
                    fresh.note,
                    speed > 0 ? `Vitesse moy. ${speed.toFixed(0)} km/h` : null,
                  ].filter(Boolean);

                  await updateTrip(fresh.id, {
                    isActive: false,
                    isPaused: false,
                    endTime: new Date().toISOString(),
                    status: 'confirmed',
                    originName: originName || fresh.originName,
                    destinationName: destName,
                    routePoints: fresh.routePoints,
                    estimatedFuelUsed: live.fuelUsed,
                    estimatedCost: live.cost,
                    note: noteParts.join(' · ') || undefined,
                  });

                  if (activeVehicle && fresh.distanceKm > 0) {
                    await applyTripFuelBurn(activeVehicle, fresh.distanceKm);
                  }
                  if (fresh.distanceKm > 0) {
                    await addTrackedKm(fresh.vehicleId, fresh.distanceKm);
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

  // Pendant un trajet : poll LITE (sans route_points) — le JSON GPS plein plantait l’UI (OOM).
  useEffect(() => {
    const live = !!activeTrip?.isActive && !activeTrip?.isPaused;
    if (!live) {
      const lightIdle = setInterval(() => {
        void (async () => {
          try {
            const trip = await getActiveTripLite();
            setActiveTrip(trip);
          } catch {
            /* ignore */
          }
        })();
      }, 90000);
      return () => clearInterval(lightIdle);
    }

    const light = setInterval(() => {
      void (async () => {
        try {
          const trip = await getActiveTripLite();
          setActiveTrip(trip);
        } catch {
          /* ignore */
        }
      })();
    }, 10000);

    const full = setInterval(() => {
      void refresh();
    }, 180000);

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
