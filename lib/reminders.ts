/**
 * Rappels locaux (CT / contre-visite / bas de réservoir).
 * Opt-in par véhicule — aucune notif si l’utilisateur n’a pas activé.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { Vehicle, VehicleMaintenance } from '@/types';
import { getMaintenances, getVehicles } from '@/lib/database';
import { MAINTENANCE_KIND_LABELS, maintenanceIsUrgent } from '@/lib/vehicleMaintenance';

const SCHEDULED_KEY = 'gasoil_reminder_ids_v1';

type ScheduledMap = Record<string, string>;

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

/** Recalcule et planifie les rappels selon les prefs véhicule. */
export async function refreshVehicleReminders(): Promise<{ scheduled: number }> {
  if (Platform.OS === 'web') return { scheduled: 0 };

  await configureNotificationHandler();
  const ok = await ensureNotificationPermissions();
  if (!ok) return { scheduled: 0 };

  await cancelAllTracked();
  const vehicles = await getVehicles();
  const maintenances = await getMaintenances();
  const map: ScheduledMap = {};
  let scheduled = 0;

  for (const v of vehicles) {
    if (v.notifyMaintenance !== false) {
      const items = maintenances.filter(
        (m) =>
          m.vehicleId === v.id &&
          m.status !== 'done' &&
          m.status !== 'cancelled' &&
          m.dueDate
      );
      for (const m of items) {
        const due = m.dueDate!.slice(0, 10);
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
    }

    if (v.notifyLowFuel) {
      const threshold =
        v.lowFuelThresholdLiters != null && v.lowFuelThresholdLiters > 0
          ? v.lowFuelThresholdLiters
          : Math.max(5, Math.round(v.tankCapacity * 0.2));
      if (v.estimatedFuelLiters != null && v.estimatedFuelLiters <= threshold) {
        try {
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: `Plein à prévoir · ${v.name}`,
              body: `Il reste ~${v.estimatedFuelLiters.toFixed(0)} L (seuil ${threshold} L). Pensez à faire le plein.`,
              data: { type: 'low_fuel', vehicleId: v.id },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 5,
            },
          });
          map[`fuel:${v.id}`] = id;
          scheduled += 1;
        } catch {
          /* ignore */
        }
      }
    }
  }

  await writeScheduled(map);
  return { scheduled };
}

export function defaultLowFuelThreshold(vehicle: Vehicle): number {
  if (vehicle.lowFuelThresholdLiters != null && vehicle.lowFuelThresholdLiters > 0) {
    return vehicle.lowFuelThresholdLiters;
  }
  return Math.max(5, Math.round(vehicle.tankCapacity * 0.2));
}

export type { VehicleMaintenance };
