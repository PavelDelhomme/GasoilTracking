# Lien écosystème Cloudity Suite (GasoilTracking)

| | |
|---|---|
| Repo | `PavelDelhomme/GasoilTracking` |
| **Checkout canonique** | `/home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/products/GasoilTracking` |
| Alias Cloudity | `products/fuel` → `GasoilTracking` |
| Clone historique (secondaire) | `/home/pactivisme/Documents/Dev/Perso/GasoilTracking` |
| Branches | `dev` (quotidien / submodule), `prod` (ship Portainer), `preprod` |
| Stack VPS | `gasoil-tracking` (`api` + `web`) — volume `gasoil_api_data` (**jamais** Remove) |
| Domaine | https://gasoil-tracking.delhomme.ovh |

## Règle de travail

1. Ouvrir **via Cloudity** : `products/GasoilTracking` (ou workspace `Cloudity.code-workspace`).
2. Commits / push dans ce repo ; branche `dev` pour le quotidien, merge → `prod` pour ship.
3. Après push `prod` : `make deploy` + APK / OTA depuis ce même checkout.
4. Puis bump du pointeur submodule dans le monorepo Cloudity (`git add products/GasoilTracking`).

```bash
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/products/GasoilTracking
cursor .
```

Guide suite : `Cloudity/docs/cursor/BRIEF-INTEGRATION-SUITE.md`
