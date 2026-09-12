/**
 * Suggestions d’adresses (Photon + Nominatim) + contacts téléphone.
 */
import { Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import {
  searchPlaces,
  type PlaceBias,
  type SuggestHit,
} from '@/lib/placeSearch';

export type { SuggestHit, PlaceBias };

/** Recherche multi-résultats : Photon (POI) puis Nominatim (FR). */
export async function searchAddressSuggestions(
  query: string,
  limit = 5,
  bias?: PlaceBias | null
): Promise<SuggestHit[]> {
  return searchPlaces(query, { limit, bias });
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
