---
name: gasoil-pdf-recap
description: >-
  Génère et envoie des rapports PDF + mails récap Gasoil Tracking sans
  débordement ni perte de contenu. À utiliser dès que l'utilisateur demande un
  mail récap, un PDF rapport, un rapport complet, ou tout récapitulatif PDF.
---

# Gasoil Tracking — PDF + mail récap

## Quand appliquer

Toute demande du type : « envoie un mail récap », « fais un PDF de rapport », « rapport complet », « récap PDF », etc.

## Processus obligatoire (ne pas contourner)

1. **Contenu** — Collecter tout ce qui doit figurer (versions, commits, features, backlog, checklist, URLs). Rien ne doit être omis pour « faire plus court » sauf demande explicite.
2. **Générateur** — Créer ou mettre à jour un fichier dans `scripts/reports/generators/` :
   - Copier `_template.js` pour un nouveau sujet, ou éditer un générateur existant.
   - **Toujours** `const { … } = bindPdfHelpers(doc)` depuis `../pdfkit-safe`.
   - Interdit : helpers PDF dupliqués sous `dist/` ; `doc.text(...)` sans `LEFT()` + `WIDTH()` après un `kvList`/`table`.
3. **Pipeline** — Exécuter uniquement :

```bash
./scripts/reports/run-report.sh generators/<fichier>.js \
  --mail \
  --subject "Gasoil Tracking — <titre>" \
  [--body-file /chemin/note.txt]
```

4. **Gate overflow** — `run-report.sh` lance `verify-overflow.py`. Si **FAIL**, corriger le générateur (marges, soft-break, tableaux) et **rejouer**. Ne pas envoyer manuellement un PDF non vérifié.
5. **Confirmer** à l’utilisateur : chemin PDF, pages, `RESULT PASS`, `messageId` mail.

## Anti-patterns (déjà vus)

| Erreur | Effet | Fix |
|--------|--------|-----|
| Helpers dans `dist/reports/_pdfgen/` | Perte au clean | Versionner sous `scripts/reports/` |
| `doc.text` après `kvList` sans reset X | Texte hors page à droite | Helpers `resetX` + `LEFT()`/`WIDTH()` |
| Soft-break sur `@` | Emails coupés | Seulement `/` `,` `_` |
| Mail avant verify | PDF débordant envoyé | Toujours `run-report.sh` |

## Structure PDF recommandée

1. Bandeau + titre + callout version live  
2. Métadonnées (`kvList`)  
3. Sommaire  
4. Sections numérotées (`h2` / `h3` / `para` / `bullets` / `table`)  
5. Backlog / suite  
6. `writeFooters(label)` puis `doc.end()` — le script doit logger `JSON.stringify({ ok, out, kb, pages })`

## Destinataire / SMTP

- To : `PERSONAL_MAIL` ou `paveldelhomme@gmail.com`
- Credentials : `.env` (`SMTP_*`) — ne pas committer

## Makefile

```bash
make report GEN=generators/…
make report-mail GEN=generators/… SUBJECT="…"
```
