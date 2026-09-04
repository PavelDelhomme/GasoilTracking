/**
 * Règles FR utiles pour CT / contre-visite (véhicule particulier).
 * Rappel : la contre-visite après défauts majeurs est en général à passer sous 2 mois.
 */
import type { MaintenanceKind, MaintenanceStatus, VehicleMaintenance } from '@/types';

export const MAINTENANCE_KIND_LABELS: Record<MaintenanceKind, string> = {
  controle_technique: 'Contrôle technique',
  contre_visite: 'Contre-visite',
  controle_pollution: 'Contrôle pollution',
  entretien: 'Entretien',
  assurance: 'Assurance',
  amende: 'Amende / contravention',
  autre: 'Autre',
};

/** Ajoute N mois calendaires (AAAA-MM-JJ). */
export function addMonthsIso(isoDate: string, months: number): string {
  const d = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Ajuste si le mois cible a moins de jours
  if (d.getDate() < day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

/** Échéance contre-visite = date du CT + 2 mois (délai usuel FR). */
export function contreVisiteDueFromCt(ctDoneIso: string): string {
  return addMonthsIso(ctDoneIso, 2);
}

/** Prochain CT périodique après un CT favorable : +2 ans (VP > 4 ans). */
export function nextPeriodicCtDue(ctDoneIso: string): string {
  return addMonthsIso(ctDoneIso, 24);
}

export function maintenanceIsUrgent(m: VehicleMaintenance, withinDays = 14): boolean {
  if (m.status === 'done' || m.status === 'cancelled' || !m.dueDate) return false;
  const due = new Date(`${m.dueDate.slice(0, 10)}T23:59:59`).getTime();
  const now = Date.now();
  if (due < now) return true;
  return due - now <= withinDays * 24 * 60 * 60 * 1000;
}

export function refreshMaintenanceStatus(m: VehicleMaintenance): MaintenanceStatus {
  if (m.status === 'done' || m.status === 'cancelled') return m.status;
  if (!m.dueDate) return 'pending';
  const due = new Date(`${m.dueDate.slice(0, 10)}T23:59:59`).getTime();
  return due < Date.now() ? 'overdue' : 'pending';
}
