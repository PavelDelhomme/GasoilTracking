# Lien écosystème Cloudity Suite (GasoilTracking)

> Ne pas toucher au volume **`gasoil_api_data`** (~8,9 Go) sans backup.

| | |
|--|--|
| Repo | `PavelDelhomme/GasoilTracking` |
| Clone | `/home/pactivisme/Documents/Dev/Perso/GasoilTracking` |
| Sous Cloudity (cible) | `products/fuel/` (submodule à créer) |
| Branches | `dev` · `preprod` · `prod` |
| Stack VPS | `gasoil-tracking` (`api` + `web` 1.4.136) |

## Docs Cloudity

- `docs/ecosystem/EMAIL-PORTEUR-DECISIONS-SUITE-2026-09-15.md`
- `docs/ecosystem/ARCHITECTURE-CURSOR-PORTAINER-SUITE.md`
- `docs/cursor/BRIEF-INTEGRATION-SUITE.md`

## Cursor

```bash
cd /home/pactivisme/Documents/Dev/Perso/GasoilTracking && cursor .
# Plus tard : Cloudity/products/fuel
```

SSO / Maps Cloudity = **après** décisions D1–D10. Données trajets/pleins **conservées**.
