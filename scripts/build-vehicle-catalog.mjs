#!/usr/bin/env node
/**
 * Génère api/static/vehicle-catalog.json depuis le catalogue TypeScript.
 * Usage: npx tsx scripts/build-vehicle-catalog.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

async function main() {
  // Charge via tsx register si dispo
  let catalog;
  let version;
  try {
    const mod = await import(path.join(root, 'constants/vehicles.ts'));
    catalog = mod.VEHICLE_CATALOG;
    version = mod.VEHICLE_CATALOG_VERSION;
  } catch (e) {
    console.error('Import TS échoué — lancez avec: npx tsx scripts/build-vehicle-catalog.mjs');
    console.error(e);
    process.exit(1);
  }

  const payload = {
    schema: 1,
    version: version || 'unknown',
    updatedAt: new Date().toISOString(),
    count: catalog.length,
    vehicles: catalog,
  };

  const outDir = path.join(root, 'api/static');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'vehicle-catalog.json');
  fs.writeFileSync(outFile, JSON.stringify(payload));
  console.log(`OK ${outFile} — ${catalog.length} véhicules, version ${payload.version}`);
}

main();
