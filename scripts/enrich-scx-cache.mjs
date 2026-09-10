#!/usr/bin/env node
/**
 * Système D — enrichit lib/scxCache.ts hints via sources web (usage perso uniquement).
 * Ne pas industrialiser / commercialiser le scraping.
 *
 * Usage:
 *   node scripts/enrich-scx-cache.mjs
 *
 * Sources visées (tolérées en petit volume perso) :
 *   - fiches-auto.fr (explications S / Cx)
 *   - zeperfs.com
 * DrivAerNet++ : dataset scientifique lourd (8000 géométries) — hors scope runtime app ;
 *   utile pour labo offline, pas embarqué ici.
 *
 * Par défaut : vérifie le cache existant et affiche les trous (pas de scrape agressif).
 * Avec --fetch : tente une page publique nominatim-style search (rate-limité).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE_TS = path.join(ROOT, 'lib/scxCache.ts');

const KNOWN = [
  { brand: 'Peugeot', model: '206' },
  { brand: 'Peugeot', model: '208' },
  { brand: 'Peugeot', model: '806' },
  { brand: 'Volkswagen', model: 'Touran' },
  { brand: 'Renault', model: 'Clio' },
  { brand: 'Peugeot', model: '3008' },
  { brand: 'Citroen', model: 'C3' },
  { brand: 'Ford', model: 'Fiesta' },
];

async function main() {
  const doFetch = process.argv.includes('--fetch');
  console.log('=== Enrichissement SCx (Système D) ===');
  console.log('Cache:', CACHE_TS);
  console.log('DrivAerNet++ : non embarqué (trop lourd) — utiliser hors-ligne si besoin.');
  console.log('Autoref.eu : VIN → masse/specs ; Cx rare. Clé : AUTOREF_API_KEY');
  console.log('');

  const raw = fs.readFileSync(CACHE_TS, 'utf8');
  for (const k of KNOWN) {
    const hit = raw.toLowerCase().includes(k.model.toLowerCase());
    console.log(`${hit ? 'OK ' : 'MANQUE '} ${k.brand} ${k.model}`);
  }

  if (!doFetch) {
    console.log('\nRelancer avec --fetch pour tenter des lookups HTTP légers (perso).');
    console.log('Sources : fiches-auto.fr, zeperfs.com — respecter robots.txt / délais.');
    return;
  }

  // Lookup très léger : page d’accueil Wikipedia « Cx (automobile) » n’aide pas ;
  // on documente seulement des URLs à vérifier manuellement.
  for (const k of KNOWN) {
    const q = encodeURIComponent(`${k.brand} ${k.model} Cx SCx masse`);
    console.log(`Recherche manuelle : https://www.google.com/search?q=${q}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log('\nAjoutez les valeurs trouvées dans lib/scxCache.ts (dragAreaScx / curbWeightKg).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
