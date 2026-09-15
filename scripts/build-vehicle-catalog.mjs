#!/usr/bin/env node
/**
 * Extrait VEHICLE_CATALOG depuis constants/vehicles.ts → api/data/vehicle-catalog.json
 * Usage: node scripts/build-vehicle-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcPath = path.join(root, 'constants', 'vehicles.ts');
const outPath = path.join(root, 'api', 'data', 'vehicle-catalog.json');

const src = fs.readFileSync(srcPath, 'utf8');
const versionMatch = src.match(/VEHICLE_CATALOG_SEED_VERSION\s*=\s*['"]([^'"]+)['"]/);
const versionCatalog = versionMatch?.[1] || `build-${new Date().toISOString().slice(0, 10)}`;

const start = src.indexOf('export const VEHICLE_CATALOG');
const eq = src.indexOf('=', start);
const arrStart = src.indexOf('[', eq);
if (arrStart < 0) {
  console.error('VEHICLE_CATALOG introuvable');
  process.exit(1);
}
let depth = 0;
let arrEnd = -1;
for (let i = arrStart; i < src.length; i++) {
  const c = src[i];
  if (c === '[') depth++;
  else if (c === ']') {
    depth--;
    if (depth === 0) {
      arrEnd = i;
      break;
    }
  }
}
if (arrEnd < 0) {
  console.error('Fin de tableau VEHICLE_CATALOG introuvable');
  process.exit(1);
}

let literal = src.slice(arrStart, arrEnd + 1);
// Clés uniquement après { ou , (ne pas toucher aux "e:Ny1" etc.)
literal = literal
  .replace(/'/g, '"')
  .replace(/([{\[,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
  .replace(/,\s*([}\]])/g, '$1');

let entries;
try {
  entries = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 5000 });
} catch (e) {
  console.error('Parse catalogue échoué:', e.message);
  process.exit(1);
}

if (!Array.isArray(entries) || entries.length < 50) {
  console.error('Catalogue trop petit ou invalide:', entries?.length);
  process.exit(1);
}

const payload = {
  schema: 'gasoil.vehicle-catalog.v1',
  versionCatalog,
  updatedAt: new Date().toISOString(),
  entries,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
console.log(`OK ${entries.length} entrées → ${path.relative(root, outPath)} (${versionCatalog})`);
