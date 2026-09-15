# Lien écosystème Cloudity Suite

> Fiche satellite — **ne modifie pas** le runtime ni les volumes de ce projet.

## Rôle de ce dépôt

Ce produit reste un **repo Git autonome** avec son propre déploiement Portainer / compose et ses **volumes Docker**.  
Il peut plus tard se brancher à la suite **Cloudity** (SSO « Cloudity ID », tuiles hub, éventuellement Maps / Mail / Agenda) **sans fusionner** les bases de données.

## Rapport complet (source de vérité)

Dans le monorepo Cloudity :

- [`ECOSYSTEME-SUITE-MODULAIRE.md`](https://github.com/PavelDelhomme/Cloudity/blob/dev/ECOSYSTEME-SUITE-MODULAIRE.md) (v2)
- Index doc : `docs/INDEX.md`

Copie locale typique :  
`/home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/ECOSYSTEME-SUITE-MODULAIRE.md`

## Données — règle zéro perte

| Interdit | Obligatoire avant migration |
|----------|----------------------------|
| `docker compose down -v` | Backup du volume nommé |
| Portainer « Remove volumes » | Smoke test lecture données user |
| Renommer le volume Docker à la volée | Dual domaine / dual login si SSO |

### Volumes VPS (audit 2026-09-15)

À conserver tels quels (noms Docker) :

- **GasoilTracking** → `gasoil_api_data` (~8,9 Go) monté sur `/data`
- **YTMusic / PLM** → `ytmusic_ytmusic_data` (~20,6 Go) monté sur `/app/data`
- **JobbingTrack** → `jobbingtrack-prod_postgres_data` / `jobbingtrack-preprod_postgres_data`

## Cursor

- **Unitaire** : ouvrir uniquement ce dossier (`cursor .`).
- **Global** : workspace `ClouditySuite.code-workspace` (multi-root) — commits toujours dans **ce** repo.

## Portainer

Déploiement **Git only** (ou webhook Git) **par produit**.  
Un redeploy de Cloudity **ne doit pas** toucher les volumes de ce stack.

## Décisions en attente

Voir §17 du rapport écosystème Cloudity (naming, meta-repo, premier SSO, Maps, etc.).  
**Pas d’implémentation cross-suite** tant que ces points ne sont pas tranchés.
