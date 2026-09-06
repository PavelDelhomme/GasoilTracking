/**
 * Suggestions de trajets réguliers selon l’heure (domicile↔travail, etc.).
 */
import type { Place, Trip } from '@/types';
import { haversineDistance, parseRoutePoints } from '@/lib/calculations';

export type SmartSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  label: string;
  latitude: number;
  longitude: number;
  kind: 'commute_to_work' | 'commute_to_home' | 'habit';
  score: number;
  habitCount: number;
};

function hourNow(d = new Date()): number {
  return d.getHours() + d.getMinutes() / 60;
}

function isWeekday(d = new Date()): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

function tripHour(iso: string): number {
  try {
    const d = new Date(iso);
    return d.getHours() + d.getMinutes() / 60;
  } catch {
    return 12;
  }
}

/** Fenêtres typiques FR. */
function commuteWindow(): 'to_work' | 'to_home' | 'none' {
  const h = hourNow();
  const wd = isWeekday();
  if (!wd) {
    // Week-end : suggestions plus faibles
    if (h >= 8 && h < 12) return 'to_work';
    if (h >= 16 && h < 21) return 'to_home';
    return 'none';
  }
  if (h >= 5.5 && h < 11) return 'to_work';
  if (h >= 15.5 && h < 22) return 'to_home';
  return 'none';
}

/**
 * Propose 1–3 trajets habituels (non bloquant).
 * Priorité : domicile→travail le matin, travail→domicile le soir, puis corridors fréquents.
 */
export function suggestTripsForNow(opts: {
  places: Place[];
  trips: Trip[];
  userLocation?: { latitude: number; longitude: number } | null;
  now?: Date;
}): SmartSuggestion[] {
  const now = opts.now || new Date();
  const window = commuteWindow();
  const home = opts.places.find((p) => p.kind === 'home' && p.latitude != null && p.longitude != null);
  const work = opts.places.find((p) => p.kind === 'work' && p.latitude != null && p.longitude != null);
  const out: SmartSuggestion[] = [];

  const near = (
    a: { latitude: number; longitude: number } | null | undefined,
    bLat?: number | null,
    bLon?: number | null
  ) => {
    if (!a || bLat == null || bLon == null) return false;
    return haversineDistance(a.latitude, a.longitude, bLat, bLon) < 4;
  };

  // Domicile → travail
  if (home && work && (window === 'to_work' || window === 'none')) {
    const nearHome =
      !opts.userLocation || near(opts.userLocation, home.latitude, home.longitude);
    if (nearHome || window === 'to_work') {
      const score = window === 'to_work' ? 100 : 40;
      out.push({
        id: 'commute-work',
        title: 'Aller au travail',
        subtitle: window === 'to_work' ? 'Habitude du matin' : 'Domicile → travail',
        label: work.address?.trim() || work.name,
        latitude: work.latitude!,
        longitude: work.longitude!,
        kind: 'commute_to_work',
        score: nearHome ? score : score - 20,
        habitCount: countCorridor(opts.trips, home, work),
      });
    }
  }

  // Travail → domicile
  if (home && work && (window === 'to_home' || window === 'none')) {
    const nearWork =
      !opts.userLocation || near(opts.userLocation, work.latitude, work.longitude);
    if (nearWork || window === 'to_home') {
      const score = window === 'to_home' ? 100 : 40;
      out.push({
        id: 'commute-home',
        title: 'Retour domicile',
        subtitle: window === 'to_home' ? 'Habitude du soir' : 'Travail → domicile',
        label: home.address?.trim() || home.name,
        latitude: home.latitude!,
        longitude: home.longitude!,
        kind: 'commute_to_home',
        score: nearWork ? score : score - 20,
        habitCount: countCorridor(opts.trips, work, home),
      });
    }
  }

  // Autres corridors fréquents (min 3 trajets), proches de l’heure actuelle
  const corridors = frequentCorridors(opts.trips, 3);
  const h = hourNow(now);
  for (const c of corridors) {
    if (out.some((s) => Math.abs(s.latitude - c.dLat) < 0.01 && Math.abs(s.longitude - c.dLon) < 0.01)) {
      continue;
    }
    // Bonus si heure proche de l’habitude
    const hourDist = Math.min(...c.hours.map((hh) => Math.abs(hh - h)));
    if (hourDist > 3.5 && c.count < 5) continue;
    const score = 55 - hourDist * 8 + Math.min(c.count, 10);
    if (score < 25) continue;
    out.push({
      id: `habit-${c.key}`,
      title: c.destLabel,
      subtitle: `Souvent vers ${formatHourBand(c.hours)} · ${c.count}×`,
      label: c.destLabel,
      latitude: c.dLat,
      longitude: c.dLon,
      kind: 'habit',
      score,
      habitCount: c.count,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

function countCorridor(trips: Trip[], from: Place, to: Place): number {
  return trips.filter((t) => {
    if (t.isActive || t.distanceKm < 1) return false;
    const ends = endsOf(t);
    if (ends.oLat == null || ends.dLat == null) return false;
    const fromOk =
      haversineDistance(ends.oLat, ends.oLon!, from.latitude!, from.longitude!) < 3;
    const toOk = haversineDistance(ends.dLat, ends.dLon!, to.latitude!, to.longitude!) < 3;
    return fromOk && toOk;
  }).length;
}

function endsOf(t: Trip) {
  const pts = parseRoutePoints(t.routePoints);
  const s = pts[0];
  const e = pts.length > 1 ? pts[pts.length - 1] : undefined;
  return {
    oLat: s?.latitude,
    oLon: s?.longitude,
    dLat: e?.latitude,
    dLon: e?.longitude,
  };
}

type Corridor = {
  key: string;
  destLabel: string;
  dLat: number;
  dLon: number;
  count: number;
  hours: number[];
};

function frequentCorridors(trips: Trip[], minCount: number): Corridor[] {
  const map = new Map<string, Corridor>();
  for (const t of trips) {
    if (t.isActive || t.distanceKm < 2) continue;
    const ends = endsOf(t);
    if (ends.dLat == null || ends.dLon == null) continue;
    const label = (t.destinationName || '').trim() || 'Destination';
    // grille ~1.5 km
    const key = `${(ends.dLat * 40).toFixed(0)}_${(ends.dLon * 40).toFixed(0)}`;
    const cur = map.get(key);
    if (cur) {
      cur.count += 1;
      cur.hours.push(tripHour(t.startTime));
      if (label.length > cur.destLabel.length) cur.destLabel = label;
    } else {
      map.set(key, {
        key,
        destLabel: label,
        dLat: ends.dLat,
        dLon: ends.dLon,
        count: 1,
        hours: [tripHour(t.startTime)],
      });
    }
  }
  return [...map.values()].filter((c) => c.count >= minCount);
}

function formatHourBand(hours: number[]): string {
  if (!hours.length) return '';
  const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
  const h = Math.floor(avg);
  const m = Math.round((avg - h) * 60);
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}

export function commuteHintLabel(now = new Date()): string | null {
  const w = commuteWindow();
  if (w === 'to_work') return isWeekday(now) ? 'Matin — aller travail ?' : 'Sortie — une destination habituelle ?';
  if (w === 'to_home') return 'Fin de journée — retour domicile ?';
  return null;
}
