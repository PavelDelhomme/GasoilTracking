/**
 * Cache SCx / masse « Système D » (fiches perso / scraping léger / moyennes).
 * DrivAerNet++ est trop lourd à embarquer ; on garde un JSON local enrichissable.
 *
 * Enrichir : `node scripts/enrich-scx-cache.mjs`
 * Autoref.eu (VIN) : optionnel via AUTOREF_API_KEY — masse parfois, Cx rarement.
 */
export type ScxCacheEntry = {
  brand: string;
  model: string;
  yearFrom?: number;
  yearTo?: number;
  curbWeightKg?: number;
  /** Cx seul si connu */
  cx?: number;
  /** Surface frontale m² si connue */
  frontalAreaM2?: number;
  /** SCx = Cx × S (prioritaire) */
  dragAreaScx?: number;
  source?: string;
};

export const SCX_CACHE: ScxCacheEntry[] = [
  {
    brand: 'Peugeot',
    model: '206',
    yearFrom: 1998,
    yearTo: 2012,
    curbWeightKg: 1025,
    cx: 0.32,
    frontalAreaM2: 1.97,
    dragAreaScx: 0.63,
    source: 'fiches-auto / moyennes',
  },
  {
    brand: 'Peugeot',
    model: '208',
    yearFrom: 2012,
    yearTo: 2026,
    curbWeightKg: 1180,
    cx: 0.29,
    frontalAreaM2: 2.1,
    dragAreaScx: 0.61,
    source: 'fiches-auto / moyennes',
  },
  {
    brand: 'Peugeot',
    model: '806',
    yearFrom: 1994,
    yearTo: 2002,
    curbWeightKg: 1680,
    dragAreaScx: 0.9,
    source: 'moyenne MPV',
  },
  {
    brand: 'Volkswagen',
    model: 'Touran',
    yearFrom: 2003,
    yearTo: 2024,
    curbWeightKg: 1550,
    cx: 0.31,
    frontalAreaM2: 2.7,
    dragAreaScx: 0.84,
    source: 'zeperfs / moyennes',
  },
  {
    brand: 'Renault',
    model: 'Clio',
    yearFrom: 2012,
    yearTo: 2026,
    curbWeightKg: 1150,
    dragAreaScx: 0.64,
    source: 'moyennes',
  },
  {
    brand: 'Peugeot',
    model: '3008',
    yearFrom: 2016,
    yearTo: 2026,
    curbWeightKg: 1480,
    dragAreaScx: 0.78,
    source: 'moyennes SUV',
  },
];

export function lookupScxCache(
  brand: string,
  model: string,
  year?: number
): ScxCacheEntry | null {
  const b = brand.trim().toLowerCase();
  const m = model.trim().toLowerCase();
  const hits = SCX_CACHE.filter((e) => {
    const eb = e.brand.toLowerCase();
    const em = e.model.toLowerCase();
    const brandOk = !b || eb.includes(b) || b.includes(eb);
    const modelOk = !m || em === m || em.includes(m) || m.includes(em);
    if (!brandOk || !modelOk) return false;
    if (year && e.yearFrom && year < e.yearFrom) return false;
    if (year && e.yearTo && year > e.yearTo) return false;
    return true;
  });
  return hits[0] || null;
}

/** Normalise SCx depuis Cx + surface, ou SCx direct. */
export function resolveScxFromEntry(e: ScxCacheEntry): number | null {
  if (e.dragAreaScx != null && e.dragAreaScx > 0.2) return e.dragAreaScx;
  if (e.cx != null && e.frontalAreaM2 != null) {
    return Math.round(e.cx * e.frontalAreaM2 * 100) / 100;
  }
  return null;
}
