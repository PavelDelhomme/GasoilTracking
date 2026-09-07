# Pipeline rapports PDF + mail (Gasoil Tracking)

Outil **obligatoire** pour tout PDF / mail récap demandé dans ce projet.

## Commandes

```bash
# Générer + vérifier overflow (bloque si FAIL)
./scripts/reports/run-report.sh generators/rapport-complet-2026-09.js

# Générer + vérifier + envoyer mail
./scripts/reports/run-report.sh generators/rapport-complet-2026-09.js \
  --mail --subject "Gasoil Tracking — rapport complet"

# Nouveau rapport : copier le template
cp scripts/reports/generators/_template.js \
   scripts/reports/generators/$(date +%Y-%m-%d)-sujet.js
```

Makefile :

```bash
make report GEN=generators/rapport-complet-2026-09.js
make report-mail GEN=generators/... SUBJECT="..."
```

## Règles anti-débordement

1. Utiliser uniquement `bindPdfHelpers(doc)` (`pdfkit-safe.js`).
2. Après `kvList` / `table`, PDFKit laisse `doc.x` au milieu → les helpers appellent toujours `resetX()` et écrivent à `LEFT()` + `WIDTH()`.
3. Ne jamais appeler `doc.text(str)` sans `x`/`width` explicites.
4. Soft-break : `/` `,` `_` seulement (pas couper les emails au `@`).
5. **Interdit d’envoyer le mail** si `verify-overflow.py` retourne FAIL.

## Sortie

PDF écrits dans `dist/reports/` (gitignored). Les **générateurs** restent dans `scripts/reports/` (versionnés).
