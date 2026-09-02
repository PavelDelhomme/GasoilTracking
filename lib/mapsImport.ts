import type { TripSource, TripStatus } from '@/types';

export type ImportedTripDraft = {
  originName: string;
  destinationName: string;
  startTime: string;
  endTime: string | null;
  distanceKm: number;
  activityType: 'driving' | 'unknown' | 'other';
  source: TripSource;
  status: TripStatus;
  note?: string;
};

/**
 * Parse une URL Google Maps Directions :
 * https://www.google.com/maps/dir/Origin/Destination/...
 * ou /dir/?api=1&origin=...&destination=...
 */
export function parseGoogleMapsUrl(raw: string): ImportedTripDraft | null {
  const text = raw.trim();
  if (!text) return null;

  try {
    // Format /maps/dir/A/B/
    const dirMatch = text.match(/\/maps\/dir\/([^/?#]+)\/([^/?#]+)/i);
    if (dirMatch) {
      const originName = decodeURIComponent(dirMatch[1].replace(/\+/g, ' '));
      const destinationName = decodeURIComponent(dirMatch[2].replace(/\+/g, ' '));
      const now = new Date();
      return {
        originName,
        destinationName,
        startTime: new Date(now.getTime() - 45 * 60_000).toISOString(),
        endTime: now.toISOString(),
        distanceKm: 0,
        activityType: 'driving',
        source: 'maps_import',
        status: 'pending',
        note: 'Import URL Google Maps — distance à confirmer',
      };
    }

    const url = new URL(text.startsWith('http') ? text : `https://${text}`);
    const origin =
      url.searchParams.get('origin') ||
      url.searchParams.get('saddr') ||
      '';
    const destination =
      url.searchParams.get('destination') ||
      url.searchParams.get('daddr') ||
      '';
    if (origin && destination) {
      const now = new Date();
      return {
        originName: origin,
        destinationName: destination,
        startTime: new Date(now.getTime() - 45 * 60_000).toISOString(),
        endTime: now.toISOString(),
        distanceKm: Number(url.searchParams.get('distanceKm') || 0),
        activityType: 'driving',
        source: 'maps_import',
        status: 'pending',
        note: 'Import URL Google Maps',
      };
    }
  } catch {
    /* fallthrough */
  }

  // Texte libre "A → B" ou "A -> B"
  const arrow = text.split(/\s*(?:→|->|=>)\s*/);
  if (arrow.length === 2 && arrow[0] && arrow[1]) {
    const now = new Date();
    return {
      originName: arrow[0].trim(),
      destinationName: arrow[1].trim(),
      startTime: new Date(now.getTime() - 30 * 60_000).toISOString(),
      endTime: now.toISOString(),
      distanceKm: 0,
      activityType: 'driving',
      source: 'manual',
      status: 'pending',
    };
  }

  return null;
}

type TimelineActivity = {
  activityType?: string;
  probability?: number;
};

type TimelineSegment = {
  activitySegment?: {
    startLocation?: { latitudeE7?: number; longitudeE7?: number; name?: string; address?: string };
    endLocation?: { latitudeE7?: number; longitudeE7?: number; name?: string; address?: string };
    duration?: { startTimestamp?: string; endTimestamp?: string; startTimestampMs?: string; endTimestampMs?: string };
    distance?: number;
    activityType?: string;
    activities?: TimelineActivity[];
    waypointPath?: { distanceMeters?: number };
  };
};

function placeName(loc?: {
  name?: string;
  address?: string;
  latitudeE7?: number;
  longitudeE7?: number;
}): string {
  if (!loc) return 'Lieu inconnu';
  if (loc.name) return loc.name;
  if (loc.address) return loc.address;
  if (loc.latitudeE7 != null && loc.longitudeE7 != null) {
    return `${(loc.latitudeE7 / 1e7).toFixed(4)}, ${(loc.longitudeE7 / 1e7).toFixed(4)}`;
  }
  return 'Lieu inconnu';
}

function classifyActivity(seg: NonNullable<TimelineSegment['activitySegment']>): {
  activityType: ImportedTripDraft['activityType'];
  status: TripStatus;
} {
  const types = [
    seg.activityType,
    ...(seg.activities || []).map((a) => a.activityType),
  ]
    .filter(Boolean)
    .map((t) => String(t).toUpperCase());

  const driving = types.some((t) =>
    /IN_PASSENGER_VEHICLE|IN_VEHICLE|MOTORCYCLING|DRIVING/.test(t)
  );
  const other = types.some((t) =>
    /WALKING|RUNNING|CYCLING|ON_BICYCLE|ON_FOOT|IN_BUS|IN_TRAIN|IN_SUBWAY|FLYING|STILL/.test(t)
  );

  if (driving) return { activityType: 'driving', status: 'pending' };
  if (other) return { activityType: 'other', status: 'pending' };
  return { activityType: 'unknown', status: 'pending' };
}

/**
 * Import Google Timeline / Takeout (JSON).
 * Formats supportés :
 * - Takeout classique `timelineObjects[].activitySegment`
 * - Export Maps récent `semanticSegments[].activity` (stockage appareil)
 */
export function parseGoogleTimelineJson(raw: string): ImportedTripDraft[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      'JSON invalide — exportez Timeline depuis Google Maps (menu → Exporter les données Timeline).'
    );
  }

  const classic = parseClassicTimeline(data);
  if (classic.length) return classic;

  const semantic = parseSemanticSegments(data);
  if (semantic.length) return semantic;

  return [];
}

function parseClassicTimeline(data: unknown): ImportedTripDraft[] {
  const root = data as { timelineObjects?: TimelineSegment[] } | TimelineSegment[];
  const objects = Array.isArray(root) ? root : root.timelineObjects || [];
  const drafts: ImportedTripDraft[] = [];

  for (const obj of objects) {
    const seg = obj.activitySegment;
    if (!seg) continue;

    const { activityType, status } = classifyActivity(seg);
    const start =
      seg.duration?.startTimestamp ||
      (seg.duration?.startTimestampMs
        ? new Date(Number(seg.duration.startTimestampMs)).toISOString()
        : null);
    const end =
      seg.duration?.endTimestamp ||
      (seg.duration?.endTimestampMs
        ? new Date(Number(seg.duration.endTimestampMs)).toISOString()
        : null);
    if (!start) continue;

    const meters = seg.distance ?? seg.waypointPath?.distanceMeters ?? 0;
    const distanceKm = meters > 0 ? meters / 1000 : 0;
    if (distanceKm < 0.2 && activityType !== 'driving') continue;

    drafts.push({
      originName: placeName(seg.startLocation),
      destinationName: placeName(seg.endLocation),
      startTime: start,
      endTime: end,
      distanceKm: Math.round(distanceKm * 100) / 100,
      activityType,
      source: 'detected',
      status,
      note:
        activityType === 'driving'
          ? 'Détecté : trajet voiture (à valider)'
          : activityType === 'other'
            ? 'Détecté : autre mode (à valider ou ignorer)'
            : 'Détecté : mode indéfini (à classer)',
    });
  }

  return drafts.sort((a, b) => b.startTime.localeCompare(a.startTime));
}

function parseLatLng(raw?: string): string | null {
  if (!raw) return null;
  // "48.8566°, 2.3522°" ou "48.8566, 2.3522"
  const m = raw.match(/(-?\d+(?:\.\d+)?)\s*°?\s*,\s*(-?\d+(?:\.\d+)?)\s*°?/);
  if (!m) return raw;
  return `${Number(m[1]).toFixed(4)}, ${Number(m[2]).toFixed(4)}`;
}

function parseSemanticSegments(data: unknown): ImportedTripDraft[] {
  const root = data as {
    semanticSegments?: Array<{
      startTime?: string;
      endTime?: string;
      activity?: {
        distanceMeters?: number;
        start?: { latLng?: string; name?: string };
        end?: { latLng?: string; name?: string };
        topCandidate?: { type?: string; probability?: number };
      };
    }>;
  };
  const segs = root.semanticSegments || [];
  const drafts: ImportedTripDraft[] = [];

  for (const seg of segs) {
    const act = seg.activity;
    if (!act || !seg.startTime) continue;
    const type = String(act.topCandidate?.type || '').toUpperCase();
    const driving = /IN_PASSENGER_VEHICLE|IN_VEHICLE|MOTORCYCLING|DRIVING|IN_TAXI/.test(type);
    const other = /WALKING|RUNNING|CYCLING|ON_BICYCLE|ON_FOOT|IN_BUS|IN_TRAIN|IN_SUBWAY|FLYING|STILL/.test(
      type
    );
    const activityType: ImportedTripDraft['activityType'] = driving
      ? 'driving'
      : other
        ? 'other'
        : 'unknown';
    const meters = act.distanceMeters || 0;
    const distanceKm = meters > 0 ? meters / 1000 : 0;
    if (distanceKm < 0.2 && activityType !== 'driving') continue;

    drafts.push({
      originName: act.start?.name || parseLatLng(act.start?.latLng) || 'Départ',
      destinationName: act.end?.name || parseLatLng(act.end?.latLng) || 'Arrivée',
      startTime: seg.startTime,
      endTime: seg.endTime || null,
      distanceKm: Math.round(distanceKm * 100) / 100,
      activityType,
      source: 'detected',
      status: 'pending',
      note: driving
        ? 'Timeline Maps (appareil) — voiture à valider'
        : other
          ? 'Timeline Maps — autre mode'
          : 'Timeline Maps — mode indéfini',
    });
  }

  return drafts.sort((a, b) => b.startTime.localeCompare(a.startTime));
}
