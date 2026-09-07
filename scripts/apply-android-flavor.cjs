#!/usr/bin/env node
/**
 * Applique APP_FLAVOR sur le projet Android natif (applicationId + nom)
 * sans forcément refaire un prebuild complet.
 *
 * Usage: APP_FLAVOR=qa node scripts/apply-android-flavor.mjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveFlavor } = require('../lib/appFlavors');

const ROOT = path.resolve(__dirname, '..');
const flavor = resolveFlavor(process.env.APP_FLAVOR);

function mustExist(p) {
  if (!fs.existsSync(p)) throw new Error(`Manquant: ${p}`);
  return p;
}

function patchGradle(file) {
  let s = fs.readFileSync(file, 'utf8');
  // Ne pas changer namespace (sources Kotlin restent com.gasoiltracking.app).
  // Seul applicationId change → apps installables en parallèle.
  s = s.replace(/applicationId\s+['"][^'"]+['"]/, `applicationId '${flavor.androidPackage}'`);
  fs.writeFileSync(file, s);
}

function patchManifestSchemes(file) {
  let s = fs.readFileSync(file, 'utf8');
  // Remplace les schemes deep-link pour éviter les collisions entre flavors
  s = s.replace(
    /android:scheme="gasoiltracking[^"]*"/g,
    `android:scheme="${flavor.scheme}"`
  );
  s = s.replace(
    /android:scheme="com\.gasoiltracking\.[^"]+"/g,
    `android:scheme="${flavor.androidPackage}"`
  );
  fs.writeFileSync(file, s);
}

function patchStrings(file) {
  let s = fs.readFileSync(file, 'utf8');
  if (/name="app_name"/.test(s)) {
    s = s.replace(/<string name="app_name">[^<]*<\/string>/, `<string name="app_name">${flavor.name}</string>`);
  } else {
    s = s.replace('</resources>', `    <string name="app_name">${flavor.name}</string>\n</resources>`);
  }
  fs.writeFileSync(file, s);
}

const gradle = mustExist(path.join(ROOT, 'android/app/build.gradle'));
patchGradle(gradle);

const manifest = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifest)) patchManifestSchemes(manifest);

const stringsCandidates = [
  path.join(ROOT, 'android/app/src/main/res/values/strings.xml'),
];
for (const f of stringsCandidates) {
  if (fs.existsSync(f)) patchStrings(f);
}

console.log(
  JSON.stringify({
    ok: true,
    flavor: flavor.key,
    package: flavor.androidPackage,
    name: flavor.name,
  })
);
