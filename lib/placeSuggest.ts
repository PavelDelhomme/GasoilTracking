/**
 * Suggestions d’adresses (Nominatim) + contacts téléphone.
 */
import { Platform } from 'react-native';
import * as Contacts from 'expo-contacts';

export type SuggestHit = {
  id: string;
  label: string;
  subtitle?: string;
  source: 'geo' | 'contact' | 'place';
  latitude?: number;
  longitude?: number;
};

/** Recherche multi-résultats Nominatim (FR). */
export async function searchAddressSuggestions(
  query: string,
  limit = 5
): Promise<SuggestHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2` +
      `&q=${encodeURIComponent(q)}&limit=${limit}&addressdetails=1&countrycodes=fr`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GasoilTracking/1.4 (personal fuel app)',
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      place_id?: number;
      lat?: string;
      lon?: string;
      display_name?: string;
      name?: string;
      address?: Record<string, string>;
    }>;
    return (data || [])
      .filter((h) => h.lat && h.lon)
      .map((h) => {
        const a = h.address || {};
        const road = a.road || a.pedestrian || a.residential;
        const city = a.city || a.town || a.village || a.municipality;
        const label =
          h.name ||
          (road && city ? `${road}, ${city}` : h.display_name?.split(',').slice(0, 3).join(',').trim()) ||
          q;
        return {
          id: `geo-${h.place_id || `${h.lat},${h.lon}`}`,
          label,
          subtitle: h.display_name,
          source: 'geo' as const,
          latitude: Number(h.lat),
          longitude: Number(h.lon),
        };
      });
  } catch {
    return [];
  }
}

/** Contacts avec adresse postale (natif uniquement). */
export async function searchContactSuggestions(query: string): Promise<SuggestHit[]> {
  if (Platform.OS === 'web') return [];
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  try {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') return [];
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.Addresses],
      pageSize: 80,
    });
    const hits: SuggestHit[] = [];
    for (const c of data || []) {
      const name = c.name || [c.firstName, c.lastName].filter(Boolean).join(' ');
      if (!name) continue;
      const addrs = c.addresses || [];
      for (const a of addrs) {
        const line = [a.street, a.postalCode, a.city, a.region]
          .filter(Boolean)
          .join(', ');
        if (!line) continue;
        const hay = `${name} ${line}`.toLowerCase();
        if (!hay.includes(q) && !q.split(/\s+/).every((w) => !w || hay.includes(w))) {
          continue;
        }
        hits.push({
          id: `contact-${c.id}-${line}`,
          label: name,
          subtitle: line,
          source: 'contact',
        });
        if (hits.length >= 6) return hits;
      }
    }
    return hits;
  } catch {
    return [];
  }
}
