/**
 * Règles FR utiles pour CT / contre-visite (véhicule particulier).
 * Rappel : la contre-visite après défauts majeurs est en général à passer sous 2 mois.
 */
import type { MaintenanceKind, MaintenanceStatus, VehicleMaintenance } from '@/types';
import { toLocalYmd } from '@/lib/dates';

export const MAINTENANCE_KIND_LABELS: Record<MaintenanceKind, string> = {
  controle_technique: 'Contrôle technique',
  contre_visite: 'Contre-visite',
  controle_pollution: 'Contrôle pollution',
  entretien: 'Entretien',
  assurance: 'Assurance',
  amende: 'Amende / contravention',
  autre: 'Autre',
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  done: 'Fait',
  pending: 'À faire',
  overdue: 'En retard',
  cancelled: 'Annulé',
};

/** Fenêtre « bientôt » pour échéance km (affichage / urgent). */
export const MAINTENANCE_KM_URGENT_REMAINING = 500;

/** Ajoute N mois calendaires (AAAA-MM-JJ, calendrier local). */
export function addMonthsIso(isoDate: string, months: number): string {
  const d = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Ajuste si le mois cible a moins de jours
  if (d.getDate() < day) d.setDate(0);
  return toLocalYmd(d);
}

/** Échéance contre-visite = date du CT + 2 mois (délai usuel FR). */
export function contreVisiteDueFromCt(ctDoneIso: string): string {
  return addMonthsIso(ctDoneIso, 2);
}

/** Prochain CT périodique après un CT favorable : +2 ans (VP > 4 ans). */
export function nextPeriodicCtDue(ctDoneIso: string): string {
  return addMonthsIso(ctDoneIso, 24);
}

export function maintenanceIsUrgent(
  m: VehicleMaintenance,
  withinDays = 14,
  currentOdometer?: number | null
): boolean {
  if (m.status === 'done' || m.status === 'cancelled') return false;

  if (m.dueOdometer != null && m.dueOdometer > 0 && currentOdometer != null && currentOdometer > 0) {
    const remaining = m.dueOdometer - currentOdometer;
    if (remaining <= MAINTENANCE_KM_URGENT_REMAINING) return true;
  }

  if (!m.dueDate) return false;
  const due = new Date(`${m.dueDate.slice(0, 10)}T23:59:59`).getTime();
  const now = Date.now();
  if (due < now) return true;
  return due - now <= withinDays * 24 * 60 * 60 * 1000;
}

export function refreshMaintenanceStatus(
  m: VehicleMaintenance,
  currentOdometer?: number | null
): MaintenanceStatus {
  if (m.status === 'done' || m.status === 'cancelled') return m.status;

  if (m.dueDate) {
    const due = new Date(`${m.dueDate.slice(0, 10)}T23:59:59`).getTime();
    if (due < Date.now()) return 'overdue';
  }

  if (
    m.dueOdometer != null &&
    m.dueOdometer > 0 &&
    currentOdometer != null &&
    currentOdometer > 0 &&
    currentOdometer >= m.dueOdometer
  ) {
    return 'overdue';
  }

  return 'pending';
}
