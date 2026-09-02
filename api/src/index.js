import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import Database from 'better-sqlite3';
import multer from 'multer';

const PORT = Number(process.env.PORT || 4000);
const DATA_DIR = process.env.DATA_DIR || './data';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const MIN_VERSION = process.env.MIN_APP_VERSION || '1.0.0';
const INVITE_CODE = process.env.INVITE_CODE || '';
const RELEASE_UPLOAD_TOKEN = process.env.RELEASE_UPLOAD_TOKEN || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://gasoil-tracking.delhomme.ovh').replace(/\/$/, '');
const APP_SCHEME = process.env.APP_SCHEME || 'gasoiltracking';
const TRUST_PROXY = process.env.TRUST_PROXY !== '0';
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@delhomme.ovh')
  .toLowerCase()
  .trim();
const PERSONAL_MAIL = String(process.env.PERSONAL_MAIL || '')
  .toLowerCase()
  .trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

function isManagerEmail(email) {
  const e = String(email || '')
    .toLowerCase()
    .trim();
  if (!e) return false;
  if (e === ADMIN_EMAIL) return true;
  if (PERSONAL_MAIL && e === PERSONAL_MAIL) return true;
  // Fallback si PERSONAL_MAIL n’est pas injecté en prod
  if (e === 'paveldelhomme@gmail.com') return true;
  return false;
}

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
    email_verified INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pending_registrations (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL DEFAULT 'web',
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    ip TEXT
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
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    replaced_by TEXT,
    user_agent TEXT,
    ip TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
  CREATE TABLE IF NOT EXISTS download_links (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL,
    label TEXT,
    max_uses INTEGER NOT NULL DEFAULT 50,
    use_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    last_used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

try {
  db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1');
} catch {
  /* déjà présent */
}

/** Access JWT court ; refresh opaque rotatif (révocation possible) */
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '20m';
const REFRESH_TTL_MS = Number(process.env.JWT_REFRESH_TTL_MS || 30 * 24 * 60 * 60 * 1000);

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, typ: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL, algorithm: 'HS256' }
  );
}

function issueRefreshToken(userId, meta = {}) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const id = uuid();
  const now = new Date();
  const expires = new Date(now.getTime() + REFRESH_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, hashToken(raw), expires, now.toISOString(), meta.userAgent || null, meta.ip || null);
  return { refreshToken: raw, refreshExpiresAt: expires };
}

function revokeRefreshFamily(userId) {
  db.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`
  ).run(new Date().toISOString(), userId);
}

function createSession(user, meta = {}) {
  const token = issueAccessToken(user);
  const { refreshToken, refreshExpiresAt } = issueRefreshToken(user.id, meta);
  return {
    token,
    refreshToken,
    expiresIn: ACCESS_TTL,
    refreshExpiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isManager: isManagerEmail(user.email),
    },
  };
}

/** Crée / met à jour le compte admin (email vérifié, sans passer par l’invite) */
function bootstrapAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn('[admin] ADMIN_PASSWORD non défini — pas de bootstrap admin');
    return;
  }
  if (ADMIN_PASSWORD.length < 10) {
    console.warn('[admin] ADMIN_PASSWORD trop court (min 10) — bootstrap ignoré');
    return;
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
  if (existing) {
    if (process.env.ADMIN_RESET_PASSWORD === '1') {
      db.prepare('UPDATE users SET password_hash = ?, email_verified = 1, name = ? WHERE email = ?').run(
        hash,
        ADMIN_NAME,
        ADMIN_EMAIL
      );
      console.log(`[admin] Mot de passe réinitialisé pour ${ADMIN_EMAIL}`);
    } else {
      console.log(`[admin] Compte déjà présent: ${ADMIN_EMAIL}`);
    }
    return;
  }
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)'
  ).run(id, ADMIN_EMAIL, hash, ADMIN_NAME, now);
  db.prepare('INSERT INTO sync_data (user_id, payload, updated_at) VALUES (?, ?, ?)').run(
    id,
    JSON.stringify({ vehicles: [], fillUps: [], budgets: [], trips: [] }),
    now
  );
  console.log(`[admin] Compte admin créé: ${ADMIN_EMAIL}`);
}

bootstrapAdmin();

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const allowedOrigins = new Set([
  PUBLIC_URL,
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:19006',
]);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.has(origin) || origin.startsWith('exp://')) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '256kb' }));

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { error: 'Trop d’inscriptions depuis cette IP. Réessayez plus tard.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { error: 'Trop de requêtes. Ralentissez.' },
});

const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${clientIp(req)}:${req.user?.sub || 'anon'}`,
  message: { error: 'Sync trop fréquente.' },
});

app.use('/api/', apiLimiter);

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload?.sub) return res.status(401).json({ error: 'Token invalide' });
    // Accepte les anciens JWT sans typ ; refuse les refresh JWT s’il y en avait
    if (payload.typ && payload.typ !== 'access') {
      return res.status(401).json({ error: 'Token invalide' });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function sessionMeta(req) {
  return {
    ip: clientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function mailer() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    process.env.SMTP_SECURE === 'true' ||
    process.env.SMTP_USE_SSL === 'true' ||
    port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
}

async function sendVerificationEmail({ to, name, token, platform }) {
  // Page de confirmation (GET sans effet) — résiste au pré-scan Gmail/Outlook
  const verifyUrl = `${PUBLIC_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}&platform=${encodeURIComponent(platform || 'web')}`;
  const from = process.env.SMTP_FROM || 'Gasoil Tracking <noreply@maily.ovh>';
  const transport = mailer();
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
      <h2>Confirmez votre email</h2>
      <p>Bonjour ${String(name).replace(/[<>&]/g, '')},</p>
      <p>Pour activer votre compte Gasoil Tracking, ouvrez le lien ci-dessous puis cliquez sur <strong>«&nbsp;Confirmer mon email&nbsp;»</strong> (valide 24&nbsp;h)&nbsp;:</p>
      <p style="margin:28px 0">
        <a href="${verifyUrl}" style="background:#e94560;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">
          Ouvrir la page de validation
        </a>
      </p>
      <p style="color:#666;font-size:13px">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br/><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p style="color:#666;font-size:12px">Si vous n’êtes pas à l’origine de cette inscription, ignorez ce message.</p>
    </div>
  `;
  if (!transport) {
    console.warn('[mail] SMTP non configuré — lien de vérif:', verifyUrl);
    return { ok: false, verifyUrl, logged: true };
  }
  await transport.sendMail({
    from,
    to,
    subject: 'Gasoil Tracking — vérifiez votre email',
    html,
    text: `Bonjour ${name},\n\nOuvrez ce lien puis confirmez : ${verifyUrl}\n`,
  });
  return { ok: true, verifyUrl };
}

function confirmEmailPageHtml({ token, platform, email, name }) {
  const safeName = String(name).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const safeEmail = String(email).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const tokenJson = JSON.stringify(token);
  const platformJson = JSON.stringify(platform);
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Confirmer votre email — Gasoil Tracking</title>
<style>
body{font-family:system-ui,sans-serif;background:#0f0f1a;color:#f1f5f9;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
.card{background:#1a1a2e;padding:28px;border-radius:16px;max-width:440px;width:100%;text-align:center}
button.btn{background:#e94560;color:#fff;padding:14px 22px;border-radius:10px;border:none;font-weight:600;font-size:16px;cursor:pointer;width:100%}
button.btn:disabled{opacity:.6;cursor:wait}
.err{color:#f87171;margin-top:12px;font-size:14px}
.hint{color:#94a3b8;font-size:13px;margin-top:16px;line-height:1.5}
</style></head><body>
<div class="card">
  <h1>Confirmer votre email</h1>
  <p>Bonjour <strong>${safeName}</strong>,</p>
  <p style="color:#94a3b8">Compte&nbsp;: ${safeEmail}</p>
  <p style="margin:20px 0">Cliquez ci-dessous pour activer votre compte utilisateur (pas admin).</p>
  <button class="btn" id="confirmBtn" type="button">Confirmer mon email</button>
  <p id="err" class="err" hidden></p>
  <p class="hint">Gmail peut ouvrir les liens automatiquement : seul ce bouton active le compte.</p>
</div>
<script>
(function(){
  var btn = document.getElementById('confirmBtn');
  var err = document.getElementById('err');
  btn.addEventListener('click', function(){
    btn.disabled = true;
    err.hidden = true;
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ${tokenJson}, platform: ${platformJson} })
    }).then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
      .then(function(res){
        if (res.d && res.d.redirectUrl) {
          window.location.replace(res.d.redirectUrl);
          return;
        }
        err.textContent = (res.d && res.d.error) || 'Erreur de validation';
        err.hidden = false;
        btn.disabled = false;
      })
      .catch(function(){
        err.textContent = 'Erreur réseau. Réessayez.';
        err.hidden = false;
        btn.disabled = false;
      });
  });
})();
</script>
</body></html>`;
}

function verifyPageHtml({ ok, message, platform, token, refreshToken, showLogin = false }) {
  const parts = [
    `ok=${ok ? '1' : '0'}`,
    `msg=${encodeURIComponent(message)}`,
  ];
  if (token) parts.push(`session=${encodeURIComponent(token)}`);
  if (refreshToken) parts.push(`refresh=${encodeURIComponent(refreshToken)}`);
  const q = parts.join('&');
  const webUrl = `${PUBLIC_URL}/verify?${q}`;
  const deep = `${APP_SCHEME}://verify?${q}`;
  const primary = platform === 'mobile' ? deep : webUrl;
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Vérification email — Gasoil Tracking</title>
<style>
body{font-family:system-ui,sans-serif;background:#0f0f1a;color:#f1f5f9;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#1a1a2e;padding:28px;border-radius:16px;max-width:420px;width:90%;text-align:center}
a.btn{display:inline-block;margin-top:16px;background:#e94560;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600}
.ok{color:#34d399}.err{color:#f87171}
</style></head><body>
<div class="card">
  <h1 class="${ok ? 'ok' : 'err'}">${ok ? 'Email vérifié' : 'Échec'}</h1>
  <p>${message.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p>
  <a class="btn" href="${primary}">Continuer</a>
  ${showLogin ? `<p style="margin-top:16px"><a class="btn" href="${PUBLIC_URL}/auth" style="display:inline-block">Se connecter</a></p>` : ''}
  ${platform === 'mobile' ? `<p style="margin-top:16px;font-size:13px;color:#94a3b8"><a href="${webUrl}" style="color:#94a3b8">Ouvrir sur le web</a></p>` : `<p style="margin-top:16px;font-size:13px;color:#94a3b8"><a href="${deep}" style="color:#94a3b8">Ouvrir l’app mobile</a></p>`}
</div>
</body></html>`;
}

function buildVerifyRedirect({ ok, message, platform, session }) {
  const parts = [
    `ok=${ok ? '1' : '0'}`,
    `msg=${encodeURIComponent(message)}`,
  ];
  if (session?.token) parts.push(`session=${encodeURIComponent(session.token)}`);
  if (session?.refreshToken) parts.push(`refresh=${encodeURIComponent(session.refreshToken)}`);
  const q = parts.join('&');
  const webUrl = `${PUBLIC_URL}/verify?${q}`;
  const deep = `${APP_SCHEME}://verify?${q}`;
  return { webUrl, deep, primary: platform === 'mobile' ? deep : webUrl };
}

function finalizeEmailVerification(req, res, raw, platform) {
  const plat = platform === 'mobile' ? 'mobile' : 'web';
  if (!raw || raw.length < 20) {
    const msg = 'Lien invalide.';
    if (req.method === 'POST') return res.status(400).json({ error: msg });
    return res.status(400).type('html').send(verifyPageHtml({ ok: false, message: msg, platform: plat, showLogin: true }));
  }

  const tokenHash = hashToken(raw);
  const pending = db.prepare('SELECT * FROM pending_registrations WHERE token_hash = ?').get(tokenHash);

  if (!pending) {
    const msg =
      'Ce lien a déjà été utilisé ou a expiré. Si votre compte est actif, connectez-vous avec votre email et mot de passe.';
    if (req.method === 'POST') {
      return res.status(400).json({ error: msg, loginUrl: `${PUBLIC_URL}/auth` });
    }
    return res
      .status(200)
      .type('html')
      .send(verifyPageHtml({ ok: false, message: msg, platform: plat, showLogin: true }));
  }

  if (new Date(pending.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(pending.id);
    const msg = 'Lien expiré. Demandez un nouvel email de validation ou réinscrivez-vous.';
    if (req.method === 'POST') return res.status(400).json({ error: msg });
    return res.status(400).type('html').send(verifyPageHtml({ ok: false, message: msg, platform: plat, showLogin: true }));
  }

  const existingUser = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(pending.email);
  if (existingUser) {
    db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(pending.id);
    const session = createSession(existingUser, sessionMeta(req));
    const msg = 'Votre compte est déjà actif. Connectez-vous.';
    const redirect = buildVerifyRedirect({ ok: true, message: msg, platform: plat, session });
    if (req.method === 'POST') {
      return res.json({ ok: true, alreadyActive: true, redirectUrl: redirect.primary, ...redirect });
    }
    return res.type('html').send(
      verifyPageHtml({
        ok: true,
        message: msg,
        platform: plat,
        token: session.token,
        refreshToken: session.refreshToken,
      })
    );
  }

  const userId = uuid();
  try {
    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO users (id, email, password_hash, name, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)'
      ).run(userId, pending.email, pending.password_hash, pending.name, new Date().toISOString());
      db.prepare('INSERT INTO sync_data (user_id, payload, updated_at) VALUES (?, ?, ?)').run(
        userId,
        JSON.stringify({ vehicles: [], fillUps: [], budgets: [], trips: [] }),
        new Date().toISOString()
      );
      db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(pending.id);
    });
    tx();
  } catch {
    const msg = 'Compte déjà créé. Connectez-vous.';
    if (req.method === 'POST') {
      return res.status(409).json({ error: msg, loginUrl: `${PUBLIC_URL}/auth` });
    }
    return res
      .status(409)
      .type('html')
      .send(verifyPageHtml({ ok: false, message: msg, platform: plat, showLogin: true }));
  }

  const session = createSession(
    { id: userId, email: pending.email, name: pending.name },
    sessionMeta(req)
  );
  const msg = 'Votre email est confirmé. Bienvenue sur Gasoil Tracking !';
  const redirect = buildVerifyRedirect({ ok: true, message: msg, platform: plat, session });

  if (req.method === 'POST') {
    return res.json({
      ok: true,
      redirectUrl: redirect.primary,
      user: session.user,
      ...redirect,
    });
  }

  return res.type('html').send(
    verifyPageHtml({
      ok: true,
      message: msg,
      platform: plat,
      token: session.token,
      refreshToken: session.refreshToken,
    })
  );
}

app.get('/health', (_req, res) => res.type('text').send('ok'));

/** Taux FX via proxy (évite CORS web : frankfurter.app → 301 sans ACAO). */
const FX_FALLBACK = {
  EUR: 1,
  GBP: 0.86,
  CHF: 0.94,
  NOK: 11.5,
  SEK: 11.2,
  DKK: 7.46,
  ISK: 150,
  PLN: 4.3,
  CZK: 25.2,
  HUF: 395,
  RON: 4.97,
  BGN: 1.96,
  HRK: 7.53,
  TRY: 36,
  UAH: 43,
  RSD: 117,
  BAM: 1.96,
  ALL: 100,
  MKD: 61.5,
  MDL: 19.5,
};
let fxCache = { rates: { ...FX_FALLBACK }, date: null, fetchedAt: 0 };

app.get('/api/fx/latest', async (_req, res) => {
  try {
    const maxAgeMs = 6 * 60 * 60 * 1000;
    if (fxCache.fetchedAt && Date.now() - fxCache.fetchedAt < maxAgeMs && fxCache.date) {
      res.set('Cache-Control', 'public, max-age=3600');
      return res.json({
        base: 'EUR',
        date: fxCache.date,
        rates: fxCache.rates,
        source: 'cache',
      });
    }
    const upstream = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const data = await upstream.json();
    const rates = { ...FX_FALLBACK, ...(data.rates || {}), EUR: 1 };
    fxCache = {
      rates,
      date: data.date || new Date().toISOString().slice(0, 10),
      fetchedAt: Date.now(),
    };
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      base: 'EUR',
      date: fxCache.date,
      rates: fxCache.rates,
      source: 'frankfurter',
    });
  } catch (e) {
    console.warn('[fx]', e.message || e);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      base: 'EUR',
      date: fxCache.date || new Date().toISOString().slice(0, 10),
      rates: fxCache.rates,
      source: 'fallback',
      stale: true,
    });
  }
});

app.get('/api/version', (_req, res) => {
  const latest = db.prepare('SELECT * FROM app_releases ORDER BY id DESC LIMIT 1').get();
  const version = latest?.version || APP_VERSION;
  const apkAvailable = Boolean(latest?.apk_filename);
  const apkUrl = apkAvailable
    ? `${PUBLIC_URL}/api/download/${latest.apk_filename}`
    : null;
  res.json({
    version,
    minVersion: MIN_VERSION,
    forceUpdate: Boolean(latest?.force_update),
    apkUrl,
    apkAvailable,
    webUrl: PUBLIC_URL,
    /** Hub multi-plateformes (Android APK + iPhone PWA + web) */
    downloadPage: `${PUBLIC_URL}/download`,
    iosInstallUrl: `${PUBLIC_URL}/download#ios`,
    releaseNotes: latest?.release_notes || '',
    channels: {
      android: apkAvailable,
      web: true,
      iosPwa: true,
      iosAppStore: false,
    },
  });
});

/** Inscription : envoie un email de vérification (pas de compte actif tant que non cliqué) */
app.post('/api/auth/register', authLimiter, registerLimiter, async (req, res) => {
  try {
    const { email, password, name, inviteCode, platform } = req.body || {};
    if (!INVITE_CODE) {
      return res.status(403).json({ error: 'Inscriptions fermées (INVITE_CODE non configuré)' });
    }
    if (String(inviteCode || '') !== INVITE_CODE) {
      return res.status(403).json({ error: 'Code d’invitation invalide' });
    }
    const cleanEmail = String(email || '')
      .toLowerCase()
      .trim();
    const cleanName = String(name || '').trim().slice(0, 80);
    const plat = platform === 'mobile' ? 'mobile' : 'web';
    if (!cleanEmail || !password || !cleanName) {
      return res.status(400).json({ error: 'email, password et name requis' });
    }
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ error: 'Email invalide' });
    }
    if (String(password).length < 8 || String(password).length > 128) {
      return res.status(400).json({ error: 'Mot de passe : 8 à 128 caractères' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'Email déjà utilisé' });
    }

    db.prepare('DELETE FROM pending_registrations WHERE email = ?').run(cleanEmail);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const id = uuid();
    const hash = bcrypt.hashSync(String(password), 12);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO pending_registrations (id, email, password_hash, name, token_hash, platform, expires_at, created_at, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, cleanEmail, hash, cleanName, tokenHash, plat, expires, new Date().toISOString(), clientIp(req));

    const mail = await sendVerificationEmail({
      to: cleanEmail,
      name: cleanName,
      token: rawToken,
      platform: plat,
    });
    // Log serveur uniquement (jamais exposé au client si mail OK) — utile pour ops
    console.log(`[mail] verification ${mail.ok ? 'sent' : 'fallback'} to=${cleanEmail}`);

    // Prévenir les admins (dont PERSONAL_MAIL) qu’un compte attend validation
    void notifyManagersPendingRegistration({
      email: cleanEmail,
      name: cleanName,
      platform: plat,
    });

    res.status(201).json({
      ok: true,
      pending: true,
      message:
        'Un email de vérification a été envoyé. Cliquez le lien pour activer votre compte (valide 24 h). Un administrateur a aussi été prévenu.',
      ...(mail.ok
        ? {}
        : { debugVerifyUrl: mail.verifyUrl }),
    });
  } catch (e) {
    console.error('register', e);
    res.status(500).json({ error: 'Erreur lors de l’inscription' });
  }
});

/** GET : page de confirmation (sans consommer le token — anti pré-scan Gmail) */
app.get('/api/auth/verify-email', authLimiter, (req, res) => {
  const raw = String(req.query.token || '');
  const platform = req.query.platform === 'mobile' ? 'mobile' : 'web';
  if (!raw || raw.length < 20) {
    return res
      .status(400)
      .type('html')
      .send(verifyPageHtml({ ok: false, message: 'Lien invalide.', platform, showLogin: true }));
  }

  const tokenHash = hashToken(raw);
  const pending = db.prepare('SELECT * FROM pending_registrations WHERE token_hash = ?').get(tokenHash);
  if (!pending) {
    return res
      .status(200)
      .type('html')
      .send(
        verifyPageHtml({
          ok: false,
          message:
            'Ce lien a déjà été utilisé ou a expiré. Si votre compte est actif, connectez-vous.',
          platform,
          showLogin: true,
        })
      );
  }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(pending.id);
    return res
      .status(400)
      .type('html')
      .send(
        verifyPageHtml({
          ok: false,
          message: 'Lien expiré. Réinscrivez-vous ou demandez un nouvel email.',
          platform,
          showLogin: true,
        })
      );
  }

  return res.type('html').send(
    confirmEmailPageHtml({
      token: raw,
      platform,
      email: pending.email,
      name: pending.name,
    })
  );
});

/** POST : validation réelle après clic utilisateur */
app.post('/api/auth/verify-email', authLimiter, (req, res) => {
  const raw = String(req.body?.token || '');
  const platform = req.body?.platform === 'mobile' ? 'mobile' : 'web';
  return finalizeEmailVerification(req, res, raw, platform);
});

/** Renvoi public si inscription en attente (rate-limit) */
app.post('/api/auth/resend-verification', authLimiter, registerLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .toLowerCase()
      .trim();
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (user) {
      return res.json({
        ok: true,
        alreadyActive: true,
        message: 'Compte déjà actif. Connectez-vous avec votre email et mot de passe.',
      });
    }

    const pending = db.prepare('SELECT * FROM pending_registrations WHERE email = ?').get(email);
    if (!pending) {
      return res.status(404).json({
        error: 'Aucune inscription en attente. Inscrivez-vous avec le code d’invitation.',
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      'UPDATE pending_registrations SET token_hash = ?, expires_at = ? WHERE id = ?'
    ).run(tokenHash, expires, pending.id);

    const mail = await sendVerificationEmail({
      to: pending.email,
      name: pending.name,
      token: rawToken,
      platform: pending.platform || 'web',
    });

    res.json({
      ok: true,
      message: mail.ok
        ? 'Nouvel email de validation envoyé. Ouvrez-le et cliquez sur « Confirmer mon email ».'
        : 'SMTP indisponible — contactez l’admin.',
    });
  } catch (e) {
    console.error('resend-verification-public', e);
    res.status(500).json({ error: 'Échec envoi' });
  }
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = String(req.body?.email || '')
    .toLowerCase()
    .trim();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({ error: 'email et password requis' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // message générique anti-énumération
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  if (user.email_verified === 0) {
    return res.status(403).json({ error: 'Email non vérifié. Consultez votre boîte mail.' });
  }
  res.json(createSession(user, sessionMeta(req)));
});

/** Rotation du refresh token → nouvel access + nouveau refresh */
app.post('/api/auth/refresh', authLimiter, (req, res) => {
  const raw = String(req.body?.refreshToken || '');
  if (!raw || raw.length < 20) {
    return res.status(400).json({ error: 'refreshToken requis' });
  }
  const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(hashToken(raw));
  if (!row) {
    return res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
  }
  if (row.revoked_at) {
    // Réutilisation d’un token déjà tourné → révoque toute la famille (vol possible)
    revokeRefreshFamily(row.user_id);
    return res.status(401).json({ error: 'Session invalidée. Reconnectez-vous.' });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      row.id
    );
    return res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  if (!user) {
    return res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
  }

  const now = new Date().toISOString();
  const next = issueRefreshToken(user.id, sessionMeta(req));
  const newRow = db
    .prepare('SELECT id FROM refresh_tokens WHERE token_hash = ?')
    .get(hashToken(next.refreshToken));
  db.prepare('UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?').run(
    now,
    newRow?.id || null,
    row.id
  );

  res.json({
    token: issueAccessToken(user),
    refreshToken: next.refreshToken,
    expiresIn: ACCESS_TTL,
    refreshExpiresAt: next.refreshExpiresAt,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

app.post('/api/auth/logout', auth, (req, res) => {
  const raw = String(req.body?.refreshToken || '');
  if (raw) {
    db.prepare(
      `UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL`
    ).run(new Date().toISOString(), hashToken(raw), req.user.sub);
  } else {
    revokeRefreshFamily(req.user.sub);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db
    .prepare('SELECT id, email, name, created_at, email_verified FROM users WHERE id = ?')
    .get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const manager = isManagerEmail(user.email);
  let pendingRegistrationsCount = 0;
  let pendingRegistrations = [];
  if (manager) {
    pendingRegistrations = db
      .prepare(
        'SELECT email, name, platform, expires_at, created_at FROM pending_registrations ORDER BY created_at DESC LIMIT 20'
      )
      .all();
    pendingRegistrationsCount = pendingRegistrations.length;
  }
  res.json({
    user: {
      ...user,
      isManager: manager,
    },
    pendingRegistrationsCount,
    pendingRegistrations,
  });
});

/** Changer le mot de passe (connecté) */
app.post('/api/auth/change-password', auth, authLimiter, (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  if (!current || !next) {
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
  }
  if (next.length < 8 || next.length > 128) {
    return res.status(400).json({ error: 'Nouveau mot de passe : 8 à 128 caractères' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!user || !bcrypt.compareSync(current, user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(next, 12),
    user.id
  );
  revokeRefreshFamily(user.id);
  res.json({ ok: true, message: 'Mot de passe mis à jour. Reconnectez-vous sur vos autres appareils.' });
});

/** Demande de réinitialisation (lien email) — réponse anti-énumération */
app.post('/api/auth/forgot-password', authLimiter, registerLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .toLowerCase()
      .trim();
    const generic =
      'Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.';
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.json({ ok: true, message: generic });
    }
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
    const raw = crypto.randomBytes(32).toString('hex');
    const id = uuid();
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, user.id, hashToken(raw), expires, new Date().toISOString());

    const resetUrl = `${PUBLIC_URL}/reset-password?token=${encodeURIComponent(raw)}`;
    const transport = mailer();
    const from = process.env.SMTP_FROM || 'Gasoil Tracking <noreply@maily.ovh>';
    if (transport) {
      await transport.sendMail({
        from,
        to: user.email,
        subject: 'Gasoil Tracking — réinitialiser le mot de passe',
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
          <h2>Réinitialisation</h2>
          <p>Bonjour ${String(user.name).replace(/[<>&]/g, '')},</p>
          <p>Cliquez pour choisir un nouveau mot de passe (lien valable 2 h) :</p>
          <p style="margin:24px 0"><a href="${resetUrl}" style="background:#e94560;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Réinitialiser</a></p>
          <p style="color:#666;font-size:12px">${resetUrl}</p>
        </div>`,
        text: `Réinitialiser : ${resetUrl}\n`,
      });
    } else {
      console.warn('[mail] forgot-password', resetUrl);
    }
    res.json({ ok: true, message: generic, mailed: Boolean(transport) });
  } catch (e) {
    console.error('forgot-password', e);
    res.status(500).json({ error: 'Échec' });
  }
});

app.post('/api/auth/reset-password', authLimiter, (req, res) => {
  const raw = String(req.body?.token || '');
  const next = String(req.body?.newPassword || '');
  if (!raw || next.length < 8 || next.length > 128) {
    return res.status(400).json({ error: 'Token et nouveau mot de passe (8+ car.) requis' });
  }
  const row = db
    .prepare('SELECT * FROM password_resets WHERE token_hash = ?')
    .get(hashToken(raw));
  if (!row || row.used_at) {
    return res.status(400).json({ error: 'Lien invalide ou déjà utilisé' });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Lien expiré — redemandez une réinitialisation' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(next, 12),
    row.user_id
  );
  db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    row.id
  );
  revokeRefreshFamily(row.user_id);
  res.json({ ok: true, message: 'Mot de passe mis à jour. Vous pouvez vous connecter.' });
});

/** Suppression de compte (RGPD) — efface sync + sessions */
app.post('/api/auth/delete-account', auth, authLimiter, (req, res) => {
  const password = String(req.body?.password || '');
  const confirm = String(req.body?.confirm || '');
  if (confirm !== 'SUPPRIMER') {
    return res.status(400).json({ error: 'Saisissez SUPPRIMER pour confirmer' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const uid = user.id;
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM sync_data WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  res.json({ ok: true, message: 'Compte et données cloud supprimés.' });
});

app.get('/api/sync', auth, syncLimiter, (req, res) => {
  const row = db.prepare('SELECT payload, updated_at FROM sync_data WHERE user_id = ?').get(req.user.sub);
  if (!row) return res.json({ data: null, updatedAt: null });
  try {
    res.json({ data: JSON.parse(row.payload), updatedAt: row.updated_at });
  } catch {
    res.status(500).json({ error: 'Données sync corrompues' });
  }
});

app.put('/api/sync', auth, syncLimiter, (req, res) => {
  const body = req.body?.data ?? req.body ?? {};
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return res.status(400).json({ error: 'Payload sync invalide' });
  }
  const payload = JSON.stringify(body);
  if (payload.length > 2_000_000) {
    return res.status(413).json({ error: 'Payload trop volumineux' });
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO sync_data (user_id, payload, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
  ).run(req.user.sub, payload, now);
  res.json({ ok: true, updatedAt: now });
});

const upload = multer({
  dest: path.join(DATA_DIR, 'apks'),
  limits: { fileSize: 120 * 1024 * 1024 },
});

function saveRelease({ version, notes, force, file }) {
  let filename = null;
  if (file) {
    filename = `gasoil-tracking-${String(version).replace(/[^\w.\-]/g, '')}.apk`;
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

function requireManager(req, res, next) {
  const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.user.sub);
  if (!user || !isManagerEmail(user.email)) {
    return res.status(403).json({ error: 'Réservé admin / compte gestionnaire' });
  }
  req.adminUser = user;
  next();
}

/** @deprecated alias */
function requireAdmin(req, res, next) {
  return requireManager(req, res, next);
}

function latestApkFile() {
  const latest = db.prepare('SELECT * FROM app_releases ORDER BY id DESC LIMIT 1').get();
  if (!latest?.apk_filename) return null;
  const full = path.join(DATA_DIR, 'apks', latest.apk_filename);
  if (!fs.existsSync(full)) return null;
  return { ...latest, full };
}

function createDownloadLink({ createdBy, label, days = 14, maxUses = 50 }) {
  const raw = crypto.randomBytes(24).toString('base64url');
  const id = uuid();
  const expires = new Date(Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO download_links (id, token_hash, created_by, label, max_uses, use_count, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, hashToken(raw), createdBy, label || null, maxUses, expires, new Date().toISOString());
  const url = `${PUBLIC_URL}/get-app?t=${encodeURIComponent(raw)}`;
  return { id, url, token: raw, expiresAt: expires, maxUses };
}

async function sendDownloadInviteEmail({ to, url, fromName, inviteCode, webUrl, downloadPage }) {
  const transport = mailer();
  const from = process.env.SMTP_FROM || 'Gasoil Tracking <noreply@maily.ovh>';
  const code = String(inviteCode || INVITE_CODE || '').trim();
  const web = String(webUrl || PUBLIC_URL).replace(/\/$/, '');
  const hub = String(downloadPage || `${PUBLIC_URL}/download`);
  const hubWithCode = code ? `${hub}?code=${encodeURIComponent(code)}` : hub;
  const codeBlock = code
    ? `<p style="margin:24px 0;padding:14px 16px;background:#0f0f1a;border-radius:10px;border:1px solid #334155">
        <strong style="display:block;margin-bottom:6px;color:#f1f5f9">Code d’invitation (parrainage)</strong>
        <span style="font-size:22px;letter-spacing:1px;font-weight:700;color:#e94560">${code.replace(/[<>&]/g, '')}</span>
        <span style="display:block;margin-top:8px;color:#94a3b8;font-size:12px">À saisir lors de la création du compte dans l’app ou sur le web.</span>
      </p>`
    : '';
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2>Gasoil Tracking — invitation</h2>
      <p>${String(fromName || 'Un administrateur').replace(/[<>&]/g, '')} vous invite à utiliser Gasoil Tracking.</p>
      ${codeBlock}

      <h3 style="margin:28px 0 10px;font-size:16px">📱 iPhone / iPad (recommandé)</h3>
      <p style="margin:0 0 10px;color:#475569;font-size:14px">Pas d’App Store nécessaire : ouvrez l’app web, puis <strong>Partager → Sur l’écran d’accueil</strong> dans Safari.</p>
      <p style="margin:0 0 8px">
        <a href="${web}" style="background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
          Ouvrir l’app (iPhone / web)
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:12px;color:#64748b"><a href="${hubWithCode}#ios">${hubWithCode}#ios</a></p>

      <h3 style="margin:24px 0 10px;font-size:16px">🤖 Android</h3>
      <p style="margin:0 0 10px;color:#475569;font-size:14px">Téléchargez l’APK, ouvrez le fichier, autorisez l’installation.</p>
      <p style="margin:0 0 8px">
        <a href="${url}" style="background:#e94560;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
          Télécharger l’APK Android
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:12px;color:#64748b"><a href="${url}">${url}</a></p>

      <h3 style="margin:24px 0 10px;font-size:16px">💻 Navigateur</h3>
      <p style="margin:0 0 8px">
        <a href="${web}" style="background:#0f172a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
          Version web
        </a>
      </p>

      <p style="color:#666;font-size:13px;margin-top:28px">Page d’installation (tous supports) : <a href="${hubWithCode}">${hubWithCode}</a></p>
    </div>`;
  const textParts = [
    `${String(fromName || 'Un administrateur')} vous invite à Gasoil Tracking.`,
    code ? `Code d’invitation : ${code}` : '',
    `iPhone / web : ${web}`,
    `Guide iPhone (écran d’accueil) : ${hubWithCode}#ios`,
    `Android APK : ${url}`,
    `Page d’installation : ${hubWithCode}`,
  ].filter(Boolean);
  if (!transport) {
    console.warn('[mail] download+invite', url, web, code ? `code=${code}` : '');
    return { ok: false, url, webUrl: web, downloadPage: hubWithCode, inviteCode: code || null };
  }
  await transport.sendMail({
    from,
    to,
    subject: code
      ? 'Gasoil Tracking — iPhone / Android / web + code'
      : 'Gasoil Tracking — installer (iPhone, Android, web)',
    html,
    text: textParts.join('\n\n') + '\n',
  });
  return { ok: true, url, webUrl: web, downloadPage: hubWithCode, inviteCode: code || null };
}

async function notifyManagersPendingRegistration({ email, name, platform }) {
  const recipients = [
    ...new Set(
      [ADMIN_EMAIL, PERSONAL_MAIL, 'paveldelhomme@gmail.com'].filter(Boolean).map((e) =>
        String(e).toLowerCase().trim()
      )
    ),
  ];
  if (!recipients.length) return;
  const transport = mailer();
  const from = process.env.SMTP_FROM || 'Gasoil Tracking <noreply@maily.ovh>';
  const subject = `Gasoil Tracking — compte à valider : ${email}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
      <h2>Nouveau compte en attente</h2>
      <p><strong>${String(name).replace(/[<>&]/g, '')}</strong> (${String(email).replace(/[<>&]/g, '')})</p>
      <p>Plateforme : ${String(platform || 'web')}</p>
      <p>Validez depuis l’app (Administration) ou renvoyez l’email de vérification.</p>
    </div>`;
  if (!transport) {
    console.warn('[mail] pending notify', email, '→', recipients.join(','));
    return;
  }
  for (const to of recipients) {
    try {
      await transport.sendMail({
        from,
        to,
        subject,
        html,
        text: `Compte à valider : ${name} <${email}> (${platform})\n`,
      });
    } catch (e) {
      console.error('[mail] pending notify fail', to, e.message);
    }
  }
}

app.get('/api/download/:file', (req, res) => {
  // Conservé pour CI / rétrocompat — préférer /api/get-app/:token
  const file = path.basename(req.params.file);
  if (!/^[\w.\-]+$/.test(file)) return res.status(400).json({ error: 'Nom invalide' });
  const full = path.join(DATA_DIR, 'apks', file);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'APK introuvable' });
  res.download(full, file);
});

/** Téléchargement APK via jeton sécurisé */
app.get('/api/get-app/:token', authLimiter, (req, res) => {
  const raw = String(req.params.token || '');
  if (!raw || raw.length < 16) return res.status(400).json({ error: 'Lien invalide' });
  const row = db.prepare('SELECT * FROM download_links WHERE token_hash = ?').get(hashToken(raw));
  if (!row || row.revoked_at) return res.status(404).json({ error: 'Lien invalide ou révoqué' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: 'Lien expiré — demandez un nouveau lien' });
  }
  if (row.use_count >= row.max_uses) {
    return res.status(410).json({ error: 'Lien épuisé (trop de téléchargements)' });
  }
  const apk = latestApkFile();
  if (!apk) return res.status(404).json({ error: 'Aucune APK publiée pour le moment' });

  db.prepare(
    'UPDATE download_links SET use_count = use_count + 1, last_used_at = ? WHERE id = ?'
  ).run(new Date().toISOString(), row.id);

  res.setHeader('Cache-Control', 'no-store');
  res.download(apk.full, apk.apk_filename);
});

/** Page HTML d’atterrissage pour le lien partagé */
app.get('/get-app', (req, res) => {
  const t = String(req.query.t || '');
  const apk = latestApkFile();
  const version = apk?.version || APP_VERSION;
  if (!t || t.length < 16) {
    return res.status(400).type('html').send(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Lien invalide</title></head>
<body style="font-family:system-ui;background:#0f0f1a;color:#f1f5f9;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="background:#1a1a2e;padding:28px;border-radius:16px;max-width:420px;text-align:center"><h1>Lien invalide</h1>
<p>Demandez un nouveau lien de téléchargement à l’administrateur.</p></div></body></html>`);
  }
  const dl = `${PUBLIC_URL}/api/get-app/${encodeURIComponent(t)}`;
  res.type('html').send(`<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Télécharger Gasoil Tracking</title>
<style>
body{font-family:system-ui,sans-serif;background:#0f0f1a;color:#f1f5f9;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
.card{background:#1a1a2e;padding:28px;border-radius:16px;max-width:420px;width:100%;text-align:center}
a.btn{display:inline-block;margin-top:16px;background:#e94560;color:#fff;padding:14px 20px;border-radius:10px;text-decoration:none;font-weight:700}
.muted{color:#94a3b8;font-size:13px;line-height:1.5}
</style></head><body>
<div class="card">
  <h1>Gasoil Tracking</h1>
  <p class="muted">Version ${String(version).replace(/[<>&]/g, '')} — lien sécurisé</p>
  <a class="btn" href="${dl}">Télécharger l’APK</a>
  <p class="muted" style="margin-top:18px">Android : ouvrez le fichier téléchargé → Autoriser l’installation depuis cette source.</p>
</div>
</body></html>`);
});

app.get('/api/admin/overview', auth, requireManager, (_req, res) => {
  const users = db
    .prepare('SELECT id, email, name, email_verified, created_at FROM users ORDER BY created_at DESC')
    .all();
  const pending = db
    .prepare(
      'SELECT id, email, name, platform, expires_at, created_at FROM pending_registrations ORDER BY created_at DESC'
    )
    .all();
  const links = db
    .prepare(
      `SELECT id, label, max_uses, use_count, expires_at, created_at, revoked_at, last_used_at, created_by
       FROM download_links ORDER BY created_at DESC LIMIT 20`
    )
    .all();
  const apk = latestApkFile();
  res.json({
    adminEmail: ADMIN_EMAIL,
    personalMail: PERSONAL_MAIL || null,
    inviteCode: INVITE_CODE || null,
    users,
    pending,
    userCount: users.length,
    pendingCount: pending.length,
    apkVersion: apk?.version || APP_VERSION,
    apkAvailable: Boolean(apk),
    webUrl: PUBLIC_URL,
    downloadPage: `${PUBLIC_URL}/download`,
    iosInstallUrl: `${PUBLIC_URL}/download#ios`,
    channels: {
      android: Boolean(apk),
      web: true,
      iosPwa: true,
      iosAppStore: false,
    },
    downloadLinks: links,
  });
});

/** Créer un lien de téléchargement sécurisé */
app.post('/api/admin/download-links', auth, requireManager, (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.body?.days) || 14));
  const maxUses = Math.min(500, Math.max(1, Number(req.body?.maxUses) || 50));
  const label = String(req.body?.label || 'Partage APK').slice(0, 80);
  if (!latestApkFile()) {
    return res.status(404).json({ error: 'Aucune APK publiée — uploadez d’abord une release' });
  }
  const link = createDownloadLink({
    createdBy: req.adminUser.email,
    label,
    days,
    maxUses,
  });
  res.status(201).json(link);
});

/** Envoyer invitation multi-plateformes (iPhone/web + Android + code) */
app.post('/api/admin/send-download-link', auth, requireManager, async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .toLowerCase()
      .trim();
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Email destinataire invalide' });
    }
    const days = Math.min(90, Math.max(1, Number(req.body?.days) || 14));
    const maxUses = Math.min(100, Math.max(1, Number(req.body?.maxUses) || 10));
    const apk = latestApkFile();
    let linkUrl = `${PUBLIC_URL}/download`;
    let expiresAt = null;
    if (apk) {
      const link = createDownloadLink({
        createdBy: req.adminUser.email,
        label: `Envoyé à ${email}`,
        days,
        maxUses,
      });
      linkUrl = link.url;
      expiresAt = link.expiresAt;
    }
    const mail = await sendDownloadInviteEmail({
      to: email,
      url: linkUrl,
      fromName: req.adminUser.name || req.adminUser.email,
      inviteCode: INVITE_CODE,
      webUrl: PUBLIC_URL,
      downloadPage: `${PUBLIC_URL}/download`,
    });
    const hub = mail.downloadPage || `${PUBLIC_URL}/download`;
    res.json({
      ok: true,
      mailed: mail.ok,
      url: linkUrl,
      webUrl: mail.webUrl || PUBLIC_URL,
      downloadPage: hub,
      iosInstallUrl: `${hub}#ios`,
      inviteCode: mail.inviteCode || INVITE_CODE || null,
      expiresAt,
      apkIncluded: Boolean(apk),
      message: mail.ok
        ? apk
          ? `Email envoyé à ${email} (iPhone/web + APK Android + code)`
          : `Email envoyé à ${email} (iPhone/web + code — APK pas encore publiée)`
        : 'SMTP indisponible — copiez les liens et le code manuellement',
    });
  } catch (e) {
    console.error('send-download-link', e);
    res.status(500).json({ error: 'Échec envoi' });
  }
});

app.post('/api/admin/download-links/:id/revoke', auth, requireManager, (req, res) => {
  const id = String(req.params.id || '');
  const row = db.prepare('SELECT id FROM download_links WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Lien introuvable' });
  db.prepare('UPDATE download_links SET revoked_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  );
  res.json({ ok: true });
});

app.post('/api/admin/resend-verification', auth, requireManager, async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .toLowerCase()
      .trim();
    if (!email) return res.status(400).json({ error: 'email requis' });
    const pending = db.prepare('SELECT * FROM pending_registrations WHERE email = ?').get(email);
    if (!pending) return res.status(404).json({ error: 'Aucune inscription en attente pour cet email' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      'UPDATE pending_registrations SET token_hash = ?, expires_at = ? WHERE id = ?'
    ).run(tokenHash, expires, pending.id);

    const mail = await sendVerificationEmail({
      to: pending.email,
      name: pending.name,
      token: rawToken,
      platform: pending.platform || 'web',
    });
    res.json({
      ok: true,
      mailed: mail.ok,
      verifyUrl: mail.verifyUrl,
      message: mail.ok ? 'Email renvoyé' : 'SMTP KO — utilisez verifyUrl',
    });
  } catch (e) {
    console.error('resend-verification', e);
    res.status(500).json({ error: 'Échec renvoi' });
  }
});

/** Valider un compte en attente (sans attendre le clic email de l’utilisateur) */
app.post('/api/admin/approve-pending', auth, requireManager, (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .toLowerCase()
      .trim();
    if (!email) return res.status(400).json({ error: 'email requis' });
    const pending = db.prepare('SELECT * FROM pending_registrations WHERE email = ?').get(email);
    if (!pending) {
      return res.status(404).json({ error: 'Aucune inscription en attente pour cet email' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      db.prepare('DELETE FROM pending_registrations WHERE email = ?').run(email);
      return res.json({ ok: true, alreadyExists: true, message: 'Compte déjà actif' });
    }
    const userId = uuid();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO users (id, email, password_hash, name, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)'
    ).run(userId, pending.email, pending.password_hash, pending.name, now);
    db.prepare(
      `INSERT INTO sync_data (user_id, payload, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO NOTHING`
    ).run(
      userId,
      JSON.stringify({ vehicles: [], fillUps: [], budgets: [], trips: [] }),
      now
    );
    db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(pending.id);
    res.json({
      ok: true,
      user: { id: userId, email: pending.email, name: pending.name },
      message: `Compte validé : ${pending.email}`,
    });
  } catch (e) {
    console.error('approve-pending', e);
    res.status(500).json({ error: 'Échec validation' });
  }
});

app.post('/api/admin/reject-pending', auth, requireManager, (req, res) => {
  const email = String(req.body?.email || '')
    .toLowerCase()
    .trim();
  if (!email) return res.status(400).json({ error: 'email requis' });
  const r = db.prepare('DELETE FROM pending_registrations WHERE email = ?').run(email);
  if (!r.changes) return res.status(404).json({ error: 'Aucune inscription en attente' });
  res.json({ ok: true, message: `Inscription refusée / annulée : ${email}` });
});

app.post('/api/admin/releases', auth, requireAdmin, upload.single('apk'), (req, res) => {
  const version = req.body?.version || APP_VERSION;
  const notes = req.body?.releaseNotes || '';
  const force = req.body?.forceUpdate === '1' || req.body?.forceUpdate === true;
  res.status(201).json(saveRelease({ version, notes, force, file: req.file }));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gasoil API on :${PORT}`);
});
