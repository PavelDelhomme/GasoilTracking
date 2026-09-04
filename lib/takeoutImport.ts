/**
 * Lecture Takeout / export Timeline : JSON brut ou ZIP (plusieurs fichiers).
 */
import { unzipSync, strFromU8 } from 'fflate';
import { parseGoogleTimelineJson, type ImportedTripDraft } from '@/lib/mapsImport';

function isJsonFile(name: string): boolean {
  return /\.json$/i.test(name);
}

function looksLikeTimelineJson(text: string): boolean {
  return (
    text.includes('timelineObjects') ||
    text.includes('semanticSegments') ||
    text.includes('activitySegment') ||
    text.includes('Records')
  );
}

/** Décode base64 → Uint8Array (RN / web). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '');
  if (typeof atob === 'function') {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node / hermes fallback
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Buf = require('buffer').Buffer as typeof Buffer;
  return new Uint8Array(Buf.from(clean, 'base64'));
}

export function parseTimelineFromJsonText(raw: string): ImportedTripDraft[] {
  return parseGoogleTimelineJson(raw);
}

/**
 * Extrait et parse tous les JSON Timeline utiles d’un ZIP Takeout / export Maps.
 */
export function parseTimelineFromZipBytes(bytes: Uint8Array): {
  drafts: ImportedTripDraft[];
  filesRead: string[];
  errors: string[];
} {
  const files = unzipSync(bytes);
  const drafts: ImportedTripDraft[] = [];
  const filesRead: string[] = [];
  const errors: string[] = [];

  for (const [path, content] of Object.entries(files)) {
    if (!isJsonFile(path)) continue;
    // Ignore gros Records.json bruts trop verbeux sauf si seul fichier
    const name = path.split('/').pop() || path;
    try {
      const text = strFromU8(content);
      if (!looksLikeTimelineJson(text) && !/Semantic Location History|timeline/i.test(path)) {
        continue;
      }
      const list = parseGoogleTimelineJson(text);
      if (list.length) {
        filesRead.push(name);
        drafts.push(...list);
      }
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Déduplique par start+end+origin+dest
  const seen = new Set<string>();
  const unique = drafts.filter((d) => {
    const k = `${d.startTime}|${d.endTime}|${d.originName}|${d.destinationName}|${d.distanceKm}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  unique.sort((a, b) => b.startTime.localeCompare(a.startTime));
  return { drafts: unique, filesRead, errors };
}

export function filterDraftsByDateRange(
  drafts: ImportedTripDraft[],
  fromYmd?: string | null,
  toYmd?: string | null
): ImportedTripDraft[] {
  return drafts.filter((d) => {
    const day = d.startTime.slice(0, 10);
    if (fromYmd && day < fromYmd) return false;
    if (toYmd && day > toYmd) return false;
    return true;
  });
}

/** Heuristique : trajet travail / Nantes / etc. pour suggestion véhicule. */
export function suggestVehicleHint(draft: ImportedTripDraft): string {
  const blob = `${draft.originName} ${draft.destinationName}`.toLowerCase();
  if (/guerche|intermarch/.test(blob)) {
    return 'Trajet travail (Intermarché) — Touran début, puis 806.';
  }
  if (/nantes/.test(blob)) return 'Nantes — plutôt 806.';
  return '';
}
