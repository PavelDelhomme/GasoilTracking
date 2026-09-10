/**
 * Enrichissement fiche technique :
 * - Autoref.eu (VIN) si AUTOREF_API_KEY / EXPO_PUBLIC_AUTOREF_API_KEY
 * - Cache local SCx (Système D : fiches-auto / zeperfs / moyennes)
 * Cx/SCx ne sont presque jamais dans les API VIN gratuites.
 */
import { lookupScxCache, resolveScxFromEntry } from '@/lib/scxCache';

export type SpecsLookupResult = {
  curbWeightKg?: number;
  dragAreaScx?: number;
  brand?: string;
  model?: string;
  year?: number;
  source: string;
  notes?: string;
};

function autorefKey(): string | null {
  try {
    const extra = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
    const k =
      extra?.EXPO_PUBLIC_AUTOREF_API_KEY ||
      extra?.AUTOREF_API_KEY ||
      '';
    return k.trim() || null;
  } catch {
    return null;
  }
}

/** Lookup Autoref (optionnel). Ne plante jamais l’UI. */
export async function lookupAutorefByVin(vin: string): Promise<SpecsLookupResult | null> {
  const clean = vin.trim().toUpperCase().replace(/\s/g, '');
  if (clean.length < 11) return null;
  const key = autorefKey();
  if (!key) {
    return {
      source: 'local',
      notes: 'Pas de clé Autoref — saisissez masse/SCx ou utilisez le catalogue.',
    };
  }
  try {
    // Endpoint typique Autoref — à ajuster selon la doc fournie avec la clé
    const url = `https://api.autoref.eu/v1/vin/${encodeURIComponent(clean)}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
        'X-API-Key': key,
        'User-Agent': 'GasoilTracking/1.4',
      },
    });
    if (!res.ok) return { source: 'autoref', notes: `Autoref HTTP ${res.status}` };
    const data = (await res.json()) as Record<string, unknown>;
    const info = (data.VIN_INFO || data.vin_info || data) as Record<string, unknown>;
    const specs = Array.isArray(data.SPECS) ? (data.SPECS[0] as Record<string, unknown>) : null;
    const mass =
      Number(specs?.CURB_WEIGHT || specs?.WEIGHT || info?.WEIGHT || 0) || undefined;
    return {
      brand: String(info.MAKE || info.BRAND || '').trim() || undefined,
      model: String(info.MODEL || '').trim() || undefined,
      year: Number(info.YEAR || info.MODEL_YEAR || 0) || undefined,
      curbWeightKg: mass && mass > 400 ? mass : undefined,
      source: 'autoref',
      notes: 'Cx/SCx rarement fournis par Autoref — compléter via cache local.',
    };
  } catch (e) {
    return {
      source: 'autoref',
      notes: e instanceof Error ? e.message : 'Autoref indisponible',
    };
  }
}

/** Combine VIN (si dispo) + cache SCx local. */
export async function enrichVehicleSpecs(opts: {
  brand: string;
  model: string;
  year?: number;
  vin?: string | null;
}): Promise<SpecsLookupResult> {
  const local = lookupScxCache(opts.brand, opts.model, opts.year);
  const scx = local ? resolveScxFromEntry(local) : null;
  let remote: SpecsLookupResult | null = null;
  if (opts.vin?.trim()) {
    remote = await lookupAutorefByVin(opts.vin);
  }
  return {
    brand: remote?.brand || opts.brand,
    model: remote?.model || opts.model,
    year: remote?.year || opts.year,
    curbWeightKg: remote?.curbWeightKg || local?.curbWeightKg,
    dragAreaScx: scx ?? undefined,
    source: [remote?.source, local?.source].filter(Boolean).join('+') || 'none',
    notes: remote?.notes,
  };
}
