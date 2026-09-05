#!/usr/bin/env node
/**
 * Télécharge le keystore Android EAS (prod) pour builds locaux.
 * Nécessite EXPO_TOKEN dans l'environnement ou .env
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP_ID = 'd85bab84-0971-4266-8f8c-a37113bc7761';

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

async function main() {
  loadEnv();
  const token = process.env.EXPO_TOKEN;
  if (!token) {
    console.error('EXPO_TOKEN manquant');
    process.exit(1);
  }

  const query = `query($id: String!) {
    app { byId(appId: $id) {
      androidAppCredentials {
        androidAppBuildCredentialsList {
          isDefault
          androidKeystore {
            keyAlias keystorePassword keyPassword keystore sha256CertificateFingerprint
          }
        }
      }
    }}
  }`;

  const res = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { id: APP_ID } }),
  });
  const data = await res.json();
  if (data.errors) {
    console.error(JSON.stringify(data.errors, null, 2));
    process.exit(1);
  }

  const list =
    data.data.app.byId.androidAppCredentials[0].androidAppBuildCredentialsList;
  const cred = list.find((c) => c.isDefault) || list[0];
  const ks = cred.androidKeystore;
  if (!ks?.keystore) {
    console.error('Pas de keystore EAS');
    process.exit(1);
  }

  const dir = path.join(ROOT, 'credentials');
  fs.mkdirSync(dir, { recursive: true });
  const jksPath = path.join(dir, 'gasoil-release.jks');
  fs.writeFileSync(jksPath, Buffer.from(ks.keystore, 'base64'));

  const keyPassword = ks.keyPassword || ks.keystorePassword;
  fs.writeFileSync(
    path.join(dir, 'keystore.properties'),
    [
      'storeFile=gasoil-release.jks',
      `storePassword=${ks.keystorePassword}`,
      `keyAlias=${ks.keyAlias}`,
      `keyPassword=${keyPassword}`,
      '',
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(ROOT, 'credentials.json'),
    JSON.stringify(
      {
        android: {
          keystore: {
            keystorePath: 'credentials/gasoil-release.jks',
            keystorePassword: ks.keystorePassword,
            keyAlias: ks.keyAlias,
            keyPassword,
          },
        },
      },
      null,
      2
    ) + '\n'
  );

  console.log('OK', jksPath);
  console.log('SHA-256', ks.sha256CertificateFingerprint);
  console.log('alias', ks.keyAlias);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
