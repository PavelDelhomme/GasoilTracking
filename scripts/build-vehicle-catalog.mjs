#!/usr/bin/env node
/**
 * Génère api/static/vehicle-catalog.json depuis constants/vehicles*.ts
 * (Node pur — pas besoin de tsx).
 *
 * Usage: node scripts/build-vehicle-catalog.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function parseArrayLiteral(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`Marqueur introuvable: ${marker}`);
  const eq = src.indexOf('=', start);
  const i = src.indexOf('[', eq);
  let depth = 0;
  let end = -1;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        end = k;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`Tableau non fermé après ${marker}`);
  return new Function(`return (${src.slice(i, end + 1)})`)();
}

function dedupeKey(v) {
  return `${v.brand}|${v.model}|${v.year}|${v.fuel}`.toLowerCase();
}

function main() {
  const vehiclesTs = fs.readFileSync(path.join(root, 'constants/vehicles.ts'), 'utf8');
  const extraTs = fs.readFileSync(path.join(root, 'constants/vehicleCatalogExtra.ts'), 'utf8');

  const base = parseArrayLiteral(vehiclesTs, 'const VEHICLE_CATALOG_BASE');
  const extra = parseArrayLiteral(extraTs, 'export const VEHICLE_CATALOG_EXTRA');

  const versionMatch = vehiclesTs.match(
    /export const VEHICLE_CATALOG_VERSION\s*=\s*['"]([^'"]+)['"]/
  );
  const version = versionMatch?.[1] || 'unknown';

  const map = new Map();
  for (const v of [...base, ...extra]) {
    map.set(dedupeKey(v), v);
  }
  const vehicles = [...map.values()];

  const payload = {
    schema: 'gasoil.vehicle-catalog.v1',
    version,
    updatedAt: new Date().toISOString(),
    count: vehicles.length,
    vehicles,
  };

  const outDir = path.join(root, 'api/static');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'vehicle-catalog.json');
  fs.writeFileSync(outFile, `${JSON.stringify(payload)}\n`);
  console.log(`OK ${outFile} — ${vehicles.length} véhicules, version ${version}`);
}

main();
