/**
 * Accès labo QA — uniquement appareils labo (Nothing / Blackview BV9700 / Samsung G990B2).
 * Les autres utilisateurs ne voient jamais l’entrée ni la route utile.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export type DeviceIdentity = {
  brand: string;
  manufacturer: string;
  model: string;
  product: string;
  platform: string;
};

function androidConsts(): Record<string, string> {
  const c = (Platform.constants || {}) as Record<string, unknown>;
  return {
    brand: String(c.Brand || c.brand || ''),
    manufacturer: String(c.Manufacturer || c.manufacturer || ''),
    model: String(c.Model || c.model || ''),
    product: String(c.Product || c.product || ''),
  };
}

export function getDeviceIdentity(): DeviceIdentity {
  if (Platform.OS === 'android') {
    const a = androidConsts();
    return {
      brand: a.brand,
      manufacturer: a.manufacturer,
      model: a.model,
      product: a.product,
      platform: 'android',
    };
  }
  const deviceName = String(
    (Constants as { deviceName?: string }).deviceName ||
      Constants.platform?.ios?.model ||
      ''
  );
  return {
    brand: Platform.OS,
    manufacturer: Platform.OS,
    model: deviceName,
    product: deviceName,
    platform: Platform.OS,
  };
}

/** Modèles / marques labo — pas tous les Samsung/Nothing du marché. */
const RULES: Array<(d: DeviceIdentity) => boolean> = [
  // Nothing Phone
  (d) => /nothing/i.test(`${d.brand} ${d.manufacturer}`),
  (d) => /^(A142|A063|PACM00|Phone)/i.test(d.model) && /nothing/i.test(`${d.brand} ${d.manufacturer} ${d.product}`),
  // Blackview BV9700 Pro (labo)
  (d) => /BV9700/i.test(`${d.model} ${d.product}`),
  (d) => /blackview|a-gold/i.test(`${d.brand} ${d.manufacturer}`) && /9700/i.test(d.model),
  // Samsung Galaxy S21 FE (SM-G990B2) labo uniquement
  (d) => /SM-G990B/i.test(d.model),
];

export function isQaLabDevice(identity?: DeviceIdentity): boolean {
  if (Platform.OS === 'web') return false;
  const d = identity || getDeviceIdentity();
  return RULES.some((rule) => {
    try {
      return rule(d);
    } catch {
      return false;
    }
  });
}

export const QA_TEST_ACCOUNT_EMAIL = 'qa.lab@maily.ovh';

export const QA_CHECKLIST: { id: string; label: string; hint: string }[] = [
  {
    id: 'version',
    label: 'App en 1.4.58+ (force-update OK)',
    hint: 'Compte → version locale = serveur',
  },
  {
    id: 'offline',
    label: 'Pas de faux « hors ligne » quand le réseau marche',
    hint: 'Icône sync header + toast après sync',
  },
  {
    id: 'routes_map',
    label: 'Trajet travail : routes éco/rapide/alt visibles sur la carte',
    hint: 'Choisir une destination → plusieurs tracés',
  },
  {
    id: 'maps_start',
    label: 'Démarrer + Maps sans arrêt fantôme',
    hint: 'Maps s’ouvre sur le trajet choisi',
  },
  {
    id: 'finish_trip',
    label: 'Terminer un trajet ne plante pas',
    hint: 'Nav puis free',
  },
  {
    id: 'free_track',
    label: 'Suivi libre fonctionne',
    hint: 'Mode suivi libre → démarrer → terminer',
  },
  {
    id: 'swipe_tabs',
    label: 'Swipe En cours ↔ Historique',
    hint: 'Sous la carte / dans l’historique',
  },
  {
    id: 'gauge',
    label: 'Jauge 0·¼·½·1 + Modifier/Confirmer',
    hint: 'Accueil et fiche véhicule',
  },
  {
    id: 'vehicle_view',
    label: 'Bouton Voir → détail véhicule',
    hint: 'Onglet Véhicules',
  },
  {
    id: 'fillups_all',
    label: 'Pleins : filtre Tous véhicules',
    hint: 'Chips en haut de l’onglet Pleins',
  },
  {
    id: 'budget_home',
    label: 'Accueil : reste estimé budget visible',
    hint: 'Carte budget sous les stats',
  },
  {
    id: 'stations',
    label: 'Budget → stations (pas trop lent)',
    hint: 'Zone GPS ou ville',
  },
];
