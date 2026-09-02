# Production

- Site : https://gasoil-tracking.delhomme.ovh  
- Download APK : https://gasoil-tracking.delhomme.ovh/download  
- API version : https://gasoil-tracking.delhomme.ovh/api/version  
- Branche Git : **prod**  
- Stack Portainer : `gasoil-tracking` (Git → `docker-compose.yml` → `refs/heads/prod`)

## Mise à jour

```bash
# après commit sur prod
make update    # push + redeploy Portainer Git
# ou
make release && make deploy
```

`scripts/deploy-portainer-git.sh` utilise `PORTAINER_ACCESS_TOKEN` du `.env`.

## Portainer upgrade (déjà fait 2.19.5 → 2.45.0)

Backup : `/home/pavel/backups/portainer_data_*.tar.gz`  
Ancien conteneur : `portainer-ce-2.19.5-backup` (arrêtable/supprimable après validation)

Rollback si besoin :
```bash
ssh pavel-server
docker stop portainer && docker rename portainer portainer-bad
docker rename portainer-ce-2.19.5-backup portainer && docker start portainer
# ou restaurer le tar dans le volume portainer_data
```

## Comptes & sync

- `POST /api/auth/register` / `login`
- `GET|PUT /api/sync` (Bearer JWT)
- App mobile : écran Compte + sync + check version au démarrage

## APK prod

Build EAS / local puis upload admin :
```bash
curl -X POST https://gasoil-tracking.delhomme.ovh/api/admin/releases \
  -H "Authorization: Bearer <token-admin>" \
  -F version=1.0.1 -F apk=@gasoil.apk -F releaseNotes="Correctifs"
```
