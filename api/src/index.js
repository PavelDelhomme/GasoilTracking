import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import multer from 'multer';

const PORT = Number(process.env.PORT || 4000);
const DATA_DIR = process.env.DATA_DIR || './data';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const MIN_VERSION = process.env.MIN_APP_VERSION || '1.0.0';
const INVITE_CODE = process.env.INVITE_CODE || '';
const RELEASE_UPLOAD_TOKEN = process.env.RELEASE_UPLOAD_TOKEN || '';
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://gasoil-tracking.delhomme.ovh';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'apks'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'gasoil.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sync_data (
    user_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS app_releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    apk_filename TEXT,
    release_notes TEXT,
    force_update INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

app.get('/health', (_req, res) => res.type('text').send('ok'));

app.get('/api/version', (_req, res) => {
  const latest = db
    .prepare('SELECT * FROM app_releases ORDER BY id DESC LIMIT 1')
    .get();
  const version = latest?.version || APP_VERSION;
  const apkUrl = latest?.apk_filename
    ? `${PUBLIC_URL}/api/download/${latest.apk_filename}`
    : `${PUBLIC_URL}/download`;
  res.json({
    version,
    minVersion: MIN_VERSION,
    forceUpdate: Boolean(latest?.force_update),
    apkUrl,
    releaseNotes: latest?.release_notes || '',
    downloadPage: `${PUBLIC_URL}/download`,
  });
});

app.get('/api/download/:file', (req, res) => {
  const file = path.basename(req.params.file);
  const full = path.join(DATA_DIR, 'apks', file);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'APK introuvable' });
  res.download(full, file);
});

app.post('/api/auth/register', (req, res) => {
  const { email, password, name, inviteCode } = req.body || {};
  if (!INVITE_CODE) {
    return res.status(403).json({ error: 'Inscriptions fermées (INVITE_CODE non configuré)' });
  }
  if (String(inviteCode || '') !== INVITE_CODE) {
    return res.status(403).json({ error: 'Code d’invitation invalide' });
  }
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password et name requis' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 8)' });
  }
  const id = uuid();
  const hash = bcrypt.hashSync(String(password), 12);
  try {
    db.prepare(
      'INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, String(email).toLowerCase().trim(), hash, String(name).trim(), new Date().toISOString());
  } catch {
    return res.status(409).json({ error: 'Email déjà utilisé' });
  }
  // sync_data vide dédié à cet user uniquement
  db.prepare(
    'INSERT INTO sync_data (user_id, payload, updated_at) VALUES (?, ?, ?)'
  ).run(id, JSON.stringify({ vehicles: [], fillUps: [], budgets: [], trips: [] }), new Date().toISOString());

  const token = jwt.sign({ sub: id, email: String(email).toLowerCase() }, JWT_SECRET, {
    expiresIn: '30d',
  });
  res.status(201).json({
    token,
    user: { id, email: String(email).toLowerCase(), name: String(name).trim() },
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(String(email || '').toLowerCase().trim());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ user });
});

app.get('/api/sync', auth, (req, res) => {
  const row = db.prepare('SELECT payload, updated_at FROM sync_data WHERE user_id = ?').get(req.user.sub);
  if (!row) return res.json({ data: null, updatedAt: null });
  res.json({ data: JSON.parse(row.payload), updatedAt: row.updated_at });
});

app.put('/api/sync', auth, (req, res) => {
  const payload = JSON.stringify(req.body?.data ?? req.body ?? {});
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO sync_data (user_id, payload, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
  ).run(req.user.sub, payload, now);
  res.json({ ok: true, updatedAt: now });
});

const upload = multer({ dest: path.join(DATA_DIR, 'apks') });

function saveRelease({ version, notes, force, file }) {
  let filename = null;
  if (file) {
    filename = `gasoil-tracking-${version}.apk`;
    fs.renameSync(file.path, path.join(DATA_DIR, 'apks', filename));
  }
  db.prepare(
    'INSERT INTO app_releases (version, platform, apk_filename, release_notes, force_update, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(version, 'android', filename, notes, force ? 1 : 0, new Date().toISOString());
  return {
    ok: true,
    version,
    apkUrl: filename ? `${PUBLIC_URL}/api/download/${filename}` : null,
  };
}

/** Upload CI automatique (token machine, pas de JWT user) */
app.post('/api/ci/releases', upload.single('apk'), (req, res) => {
  const header = req.headers['x-release-token'] || req.headers.authorization?.replace('Bearer ', '');
  if (!RELEASE_UPLOAD_TOKEN || header !== RELEASE_UPLOAD_TOKEN) {
    return res.status(401).json({ error: 'Token CI invalide' });
  }
  if (!req.file) return res.status(400).json({ error: 'APK manquant' });
  const version = req.body?.version || APP_VERSION;
  const notes = req.body?.releaseNotes || 'Mise à jour automatique';
  const force = req.body?.forceUpdate === '1' || req.body?.forceUpdate === true;
  res.status(201).json(saveRelease({ version, notes, force, file: req.file }));
});

app.post('/api/admin/releases', auth, upload.single('apk'), (req, res) => {
  const adminEmail = process.env.ADMIN_EMAIL || '';
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.sub);
  if (adminEmail && user?.email !== adminEmail) {
    return res.status(403).json({ error: 'Admin uniquement' });
  }
  const version = req.body?.version || APP_VERSION;
  const notes = req.body?.releaseNotes || '';
  const force = req.body?.forceUpdate === '1' || req.body?.forceUpdate === true;
  res.status(201).json(saveRelease({ version, notes, force, file: req.file }));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gasoil API on :${PORT}`);
});
