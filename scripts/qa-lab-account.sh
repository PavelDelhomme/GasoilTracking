#!/usr/bin/env bash
# Gestion du compte QA labo (créer / reset MDP / supprimer / status).
# Lit QA_LAB_* depuis .env — ne commit jamais les secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "ERREUR: .env manquant"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

ACTION="${1:-status}"
EMAIL="${QA_LAB_EMAIL:-qa.lab@maily.ovh}"
NAME="${QA_LAB_NAME:-QA Lab Gasoil}"
PASS="${QA_LAB_PASSWORD:-}"
SSH_HOST="${DEPLOY_SSH:-pavel-server}"

gen_pass() {
  openssl rand -base64 24 | tr -d '/+=\n' | head -c 20
}

ensure_pass() {
  if [[ -z "$PASS" || ${#PASS} -lt 12 ]]; then
    PASS="$(gen_pass)"
    # Met à jour .env (ligne QA_LAB_PASSWORD=...)
    if grep -q '^QA_LAB_PASSWORD=' .env; then
      sed -i "s|^QA_LAB_PASSWORD=.*|QA_LAB_PASSWORD=\"${PASS}\"|" .env
    else
      echo "QA_LAB_PASSWORD=\"${PASS}\"" >> .env
    fi
    echo "$PASS" > .qa-lab-password.local
    chmod 600 .qa-lab-password.local
    echo "→ Nouveau mot de passe généré et écrit dans .env (QA_LAB_PASSWORD)"
  fi
}

remote_node() {
  local js="$1"
  ssh -o BatchMode=yes -o ConnectTimeout=20 "$SSH_HOST" \
    "QA_EMAIL=$(printf %q "$EMAIL") QA_NAME=$(printf %q "$NAME") QA_PASS=$(printf %q "$PASS") docker exec -e QA_EMAIL -e QA_NAME -e QA_PASS -i gasoil-tracking-api node" <<< "$js"
}

case "$ACTION" in
  status)
    remote_node "$(cat <<'NODE'
const Database = require('better-sqlite3');
const db = new Database('/data/gasoil.db');
const email = process.env.QA_EMAIL;
const u = db.prepare('SELECT id, email, name, email_verified, created_at FROM users WHERE email = ?').get(email);
const sync = u ? db.prepare('SELECT updated_at, length(payload) as bytes FROM sync_data WHERE user_id = ?').get(u.id) : null;
console.log(JSON.stringify({ email, exists: Boolean(u), user: u || null, sync: sync || null }, null, 2));
NODE
)"
    ;;
  create|reset)
    ensure_pass
    remote_node "$(cat <<'NODE'
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const db = new Database('/data/gasoil.db');
const email = process.env.QA_EMAIL;
const name = process.env.QA_NAME || 'QA Lab Gasoil';
const pass = process.env.QA_PASS;
if (!pass || pass.length < 12) { console.error('QA_PASS trop court'); process.exit(1); }
const hash = bcrypt.hashSync(pass, 12);
const now = new Date().toISOString();
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
db.prepare('DELETE FROM pending_registrations WHERE email = ?').run(email);
if (existing) {
  db.prepare('UPDATE users SET password_hash = ?, email_verified = 1, name = ? WHERE email = ?').run(hash, name, email);
  console.log(JSON.stringify({ ok: true, action: 'reset', email, id: existing.id }));
} else {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO users (id, email, password_hash, name, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(id, email, hash, name, now);
  db.prepare(`INSERT INTO sync_data (user_id, payload, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO NOTHING`).run(id, JSON.stringify({ vehicles: [], fillUps: [], budgets: [], trips: [] }), now);
  console.log(JSON.stringify({ ok: true, action: 'created', email, id }));
}
NODE
)"
    echo "→ Email: $EMAIL"
    echo "→ Mot de passe: voir .env QA_LAB_PASSWORD (ou .qa-lab-password.local)"
    ;;
  delete)
    remote_node "$(cat <<'NODE'
const Database = require('better-sqlite3');
const db = new Database('/data/gasoil.db');
const email = process.env.QA_EMAIL;
const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (!u) { console.log(JSON.stringify({ ok: true, action: 'absent', email })); process.exit(0); }
db.prepare('DELETE FROM sync_data WHERE user_id = ?').run(u.id);
db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(u.id);
try { db.prepare('DELETE FROM qr_login_challenges WHERE user_id = ?').run(u.id); } catch (_) {}
db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
db.prepare('DELETE FROM pending_registrations WHERE email = ?').run(email);
console.log(JSON.stringify({ ok: true, action: 'deleted', email, id: u.id }));
NODE
)"
    ;;
  wipe)
    # Remet le blob sync cloud à vide (trajets / véhicules / lieux) sans supprimer le compte.
    remote_node "$(cat <<'NODE'
const Database = require('better-sqlite3');
const db = new Database('/data/gasoil.db');
const email = process.env.QA_EMAIL;
const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (!u) { console.log(JSON.stringify({ ok:false, error:'no user', email })); process.exit(1); }
const now = new Date().toISOString();
const empty = JSON.stringify({
  vehicles: [],
  fillUps: [],
  budgets: [],
  trips: [],
  places: [],
  routes: [],
  maintenances: [],
});
db.prepare(`INSERT INTO sync_data (user_id, payload, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`)
  .run(u.id, empty, now);
const sync = db.prepare('SELECT updated_at, length(payload) as bytes FROM sync_data WHERE user_id = ?').get(u.id);
console.log(JSON.stringify({ ok:true, action:'wipe', email, userId:u.id, sync }, null, 2));
NODE
)"
    echo "→ Cloud QA vidé. Sur l’appareil : adb shell pm clear com.gasoiltracking.qa puis reconnecter."
    ;;
  *)
    echo "Usage: $0 status|create|reset|wipe|delete"
    exit 1
    ;;
esac
