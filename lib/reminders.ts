/**
 * Rappels locaux (CT / contre-visite / km entretien / bas de réservoir / seuil budget).
 * Opt-in par véhicule — aucune notif si l’utilisateur n’a pas activé.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { Vehicle, VehicleMaintenance } from '@/types';
import { getMaintenances, getVehicles } from '@/lib/database';
import { displayOdometerKm, refreshAllBudgets } from '@/lib/calculations';
import { MAINTENANCE_KIND_LABELS, maintenanceIsUrgent } from '@/lib/vehicleMaintenance';

const SCHEDULED_KEY = 'gasoil_reminder_ids_v1';
const BUDGET_THRESH_KEY = 'gasoil_budget_thresh_v1';
/** Anti-spam pour notifs « immédiates » (km / bas réservoir) — une fois / 12 h / clé. */
const STICKY_KEY = 'gasoil_sticky_notif_v1';
const STICKY_COOLDOWN_MS = 12 * 60 * 60 * 1000;

type ScheduledMap = Record<string, string>;
type BudgetThreshMap = Record<string, number>;
type StickyMap = Record<string, number>; // key → firedAt ms

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    const req = await Notifications.requestPermissionsAsync();
    return !!req.granted;
  } catch {
    return false;
  }
}

export async function configureNotificationHandler(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    /* ignore */
  }
}

async function readScheduled(): Promise<ScheduledMap> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULED_KEY);
    return raw ? (JSON.parse(raw) as ScheduledMap) : {};
  } catch {
    return {};
  }
}

async function writeScheduled(map: ScheduledMap) {
  await AsyncStorage.setItem(SCHEDULED_KEY, JSON.stringify(map));
}

async function readBudgetThresh(): Promise<BudgetThreshMap> {
  try {
    const raw = await AsyncStorage.getItem(BUDGET_THRESH_KEY);
    return raw ? (JSON.parse(raw) as BudgetThreshMap) : {};
  } catch {
    return {};
  }
}

async function writeBudgetThresh(map: BudgetThreshMap) {
  await AsyncStorage.setItem(BUDGET_THRESH_KEY, JSON.stringify(map));
}

async function readSticky(): Promise<StickyMap> {
  try {
    const raw = await AsyncStorage.getItem(STICKY_KEY);
    return raw ? (JSON.parse(raw) as StickyMap) : {};
  } catch {
    return {};
  }
}

async function writeSticky(map: StickyMap) {
  await AsyncStorage.setItem(STICKY_KEY, JSON.stringify(map));
}

function stickyReady(map: StickyMap, key: string): boolean {
  const at = map[key];
  if (!at) return true;
  return Date.now() - at >= STICKY_COOLDOWN_MS;
}

async function cancelAllTracked() {
  if (Platform.OS === 'web') return;
  const map = await readScheduled();
  try {
    for (const id of Object.values(map)) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
  await writeScheduled({});
}

function daysUntil(ymd: string): number {
  const due = new Date(`${ymd.slice(0, 10)}T12:00:00`).getTime();
  return Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
}

async function scheduleSoon(
  map: ScheduledMap,
  key: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  seconds = 5
): Promise<number> {
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
      },
    });
    map[key] = id;
    return 1;
  } catch {
    return 0;
  }
}

/** Recalcule et planifie les rappels selon les prefs véhicule + seuils budget. */
export async function refreshVehicleReminders(): Promise<{ scheduled: number }> {
  if (Platform.OS === 'web') return { scheduled: 0 };

  await configureNotificationHandler();
  const ok = await ensureNotificationPermissions();
  if (!ok) return { scheduled: 0 };

  await cancelAllTracked();
  const vehicles = await getVehicles();
  const maintenances = await getMaintenances();
  const sticky = await readSticky();
  let stickyDirty = false;
  const map: ScheduledMap = {};
  let scheduled = 0;

  for (const v of vehicles) {
    if (v.notifyMaintenance !== false) {
      const items = maintenances.filter(
        (m) =>
          m.vehicleId === v.id &&
          m.status !== 'done' &&
          m.status !== 'cancelled' &&
          (m.dueDate || (m.dueOdometer != null && m.dueOdometer > 0))
      );
      for (const m of items) {
        if (m.dueDate) {
          const due = m.dueDate.slice(0, 10);
          const dLeft = daysUntil(due);
          const offsets = [14, 3, 0].filter((o) => dLeft >= o);
          for (const offset of offsets) {
            const fire = new Date(`${due}T09:00:00`);
            fire.setDate(fire.getDate() - offset);
            if (fire.getTime() <= Date.now() + 60_000) continue;
            const key = `maint:${m.id}:j-${offset}`;
            try {
              const id = await Notifications.scheduleNotificationAsync({
                content: {
                  title:
                    m.status === 'overdue' || maintenanceIsUrgent(m)
                      ? `Urgent · ${v.name}`
                      : `Rappel · ${v.name}`,
                  body:
                    offset === 0
                      ? `${MAINTENANCE_KIND_LABELS[m.kind]} : aujourd’hui (${m.title})`
                      : `${MAINTENANCE_KIND_LABELS[m.kind]} dans ${offset} j — ${m.title} (échéance ${due})`,
                  data: { type: 'maintenance', vehicleId: v.id, maintenanceId: m.id },
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: fire,
                },
              });
              map[key] = id;
              scheduled += 1;
            } catch {
              /* ignore */
            }
          }
        }

        if (m.dueOdometer != null && m.dueOdometer > 0) {
          const odo = displayOdometerKm(v);
          if (odo <= 0) continue;
          const remaining = m.dueOdometer - odo;
          if (remaining <= 500) {
            const stickyKey = `maint-km:${m.id}`;
            if (!stickyReady(sticky, stickyKey)) continue;
            const overdue = remaining <= 0;
            const n = await scheduleSoon(
              map,
              stickyKey,
              overdue ? `Entretien dépassé · ${v.name}` : `Entretien bientôt · ${v.name}`,
              overdue
                ? `${m.title} : échéance ${Math.round(m.dueOdometer).toLocaleString('fr-FR')} km (compteur ${odo.toLocaleString('fr-FR')}).`
                : `${m.title} : encore ~${Math.round(remaining).toLocaleString('fr-FR')} km (échéance ${Math.round(m.dueOdometer).toLocaleString('fr-FR')} km).`,
              { type: 'maintenance_km', vehicleId: v.id, maintenanceId: m.id }
            );
            if (n) {
              sticky[stickyKey] = Date.now();
              stickyDirty = true;
              scheduled += n;
            }
          } else if (sticky[`maint-km:${m.id}`]) {
            delete sticky[`maint-km:${m.id}`];
            stickyDirty = true;
          }
        }
      }
    }

    if (v.notifyLowFuel) {
      const threshold =
        v.lowFuelThresholdLiters != null && v.lowFuelThresholdLiters > 0
          ? v.lowFuelThresholdLiters
          : Math.max(5, Math.round(v.tankCapacity / 3));
      const stickyKey = `fuel:${v.id}`;
      if (v.estimatedFuelLiters != null && v.estimatedFuelLiters <= threshold) {
        if (stickyReady(sticky, stickyKey)) {
          const n = await scheduleSoon(
            map,
            stickyKey,
            `Plein à prévoir · ${v.name}`,
            `Il reste ~${v.estimatedFuelLiters.toFixed(0)} L (seuil ${threshold} L). Pensez à faire le plein.`,
            { type: 'low_fuel', vehicleId: v.id }
          );
          if (n) {
            sticky[stickyKey] = Date.now();
            stickyDirty = true;
            scheduled += n;
          }
        }
      } else if (sticky[stickyKey]) {
        delete sticky[stickyKey];
        stickyDirty = true;
      }
    }
  }

  // Seuils budget 80 % / 100 % (une fois par période / seuil)
  try {
    const statuses = await refreshAllBudgets();
    const thresh = await readBudgetThresh();
    let threshDirty = false;
    for (const s of statuses) {
      if (!s.budget.isActive) continue;
      const pct = s.percentUsed;
      const periodKey = `${s.budget.id}:${s.budget.startDate.slice(0, 10)}`;
      const last = thresh[periodKey] ?? 0;
      let hit: 80 | 100 | null = null;
      if (pct >= 100 && last < 100) hit = 100;
      else if (pct >= 80 && last < 80) hit = 80;
      if (!hit) continue;
      const label = s.budget.name || 'Budget';
      scheduled += await scheduleSoon(
        map,
        `budget:${periodKey}:${hit}`,
        hit >= 100 ? `Budget dépassé · ${label}` : `Budget à ${hit} % · ${label}`,
        hit >= 100
          ? `${formatBudgetBody(s.spent, s.budget.amount)} — enveloppe épuisée.`
          : `${formatBudgetBody(s.spent, s.budget.amount)} (${Math.round(pct)} %).`,
        { type: 'budget_threshold', budgetId: s.budget.id, threshold: hit }
      );
      thresh[periodKey] = hit;
      threshDirty = true;
    }
    const alive = new Set(
      statuses.map((s) => `${s.budget.id}:${s.budget.startDate.slice(0, 10)}`)
    );
    for (const k of Object.keys(thresh)) {
      if (!alive.has(k)) {
        delete thresh[k];
        threshDirty = true;
      }
    }
    if (threshDirty) await writeBudgetThresh(thresh);
  } catch {
    /* ignore */
  }

  if (stickyDirty) await writeSticky(sticky);
  await writeScheduled(map);
  return { scheduled };
}

function formatBudgetBody(spent: number, amount: number): string {
  const s = spent.toFixed(2).replace('.', ',');
  const a = amount.toFixed(2).replace('.', ',');
  return `${s} € / ${a} €`;
}

export function defaultLowFuelThreshold(vehicle: Vehicle): number {
  if (vehicle.lowFuelThresholdLiters != null && vehicle.lowFuelThresholdLiters > 0) {
    return vehicle.lowFuelThresholdLiters;
  }
  return Math.max(5, Math.round(vehicle.tankCapacity / 3));
}

export type { VehicleMaintenance };
