#!/usr/bin/env node
/**
 * Envoie un PDF par SMTP (.env) à PERSONAL_MAIL.
 * Usage: node send-mail.mjs --pdf path.pdf --subject "..." [--body-file note.txt]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function loadEnv(root) {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const i = s.indexOf('=');
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null) process.env[k] = v;
  }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

async function main() {
  const root = path.resolve(__dirname, '../..');
  loadEnv(root);

  const pdf = path.resolve(arg('--pdf', ''));
  const subject = arg('--subject', 'Gasoil Tracking — rapport');
  const bodyFile = arg('--body-file', '');
  const to = arg('--to', process.env.PERSONAL_MAIL || 'paveldelhomme@gmail.com');

  if (!pdf || !fs.existsSync(pdf)) {
    console.error('FAIL: --pdf requis et existant');
    process.exit(2);
  }

  let text =
    'Rapport PDF en pièce jointe.\n' +
    `Fichier : ${path.basename(pdf)}\n` +
    'Généré via scripts/reports (overflow vérifié avant envoi).\n';
  let html =
    '<div style="font-family:system-ui,sans-serif;max-width:680px;margin:0 auto;color:#0f172a;line-height:1.45">' +
    '<h1 style="color:#c73a52">Gasoil Tracking — rapport</h1>' +
    `<p>PDF joint : <strong>${path.basename(pdf)}</strong> (vérifié sans débordement).</p></div>`;

  if (bodyFile && fs.existsSync(bodyFile)) {
    text = fs.readFileSync(bodyFile, 'utf8');
    html =
      '<div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;color:#0f172a;line-height:1.5;white-space:pre-wrap">' +
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
      '</div>';
  }

  const nodemailerPath = path.join(root, 'api/node_modules/nodemailer');
  const nodemailer = require(nodemailerPath);
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });

  await transport.verify();
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || 'Gasoil Tracking <noreply@maily.ovh>',
    to,
    subject,
    text,
    html,
    attachments: [
      {
        filename: path.basename(pdf),
        path: pdf,
        contentType: 'application/pdf',
      },
    ],
  });
  console.log(JSON.stringify({ ok: true, messageId: info.messageId, to, pdf }));
}

main().catch((e) => {
  console.error('mail_fail', e.message);
  process.exit(1);
});
