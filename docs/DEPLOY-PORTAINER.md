# Gasoil Tracking — Portainer + Nginx Proxy Manager

Domaine prévu : **https://gasoil-tracking.delhomme.ovh**

| Outil | URL |
|-------|-----|
| Portainer | https://portainer.delhomme.ovh |
| Nginx Proxy Manager | https://nginx.delhomme.ovh |

## Architecture

```
Internet → NPM (SSL gasoil-tracking.delhomme.ovh)
              ↓ réseau Docker « web »
         gasoil-tracking-web:80  (nginx + export Expo Web)
```

L’app mobile (Android/iOS) reste locale via Expo / APK. Le conteneur sert la **version web** (PWA) pour consultation / gestion depuis le navigateur.

## Prérequis serveur

1. Réseau Docker externe `web` (partagé avec NPM) :

```bash
docker network create web
```

2. Nginx Proxy Manager déjà attaché à ce réseau `web`.

## Option A — Portainer (recommandé)

1. Ouvre https://portainer.delhomme.ovh  
2. **Stacks → Add stack**  
3. Nom : `gasoil-tracking`  
4. **Repository** (ou Web editor) :
   - Clone le dépôt GitHub `PavelDelhomme/GasoilTracking`
   - Compose path : `docker-compose.yml`
5. Dans l’éditeur, fusionne l’overlay Portainer (réseau `web`) — contenu de `docker-compose.portainer.yml` — ou déploie en ligne de commande (option B).
6. **Deploy the stack**

Conteneur attendu : `gasoil-tracking-web`

## Option B — CLI sur le VPS

```bash
git clone git@github.com:PavelDelhomme/GasoilTracking.git
cd GasoilTracking
docker network inspect web >/dev/null 2>&1 || docker network create web
docker compose -f docker-compose.yml -f docker-compose.portainer.yml up -d --build
```

Ou depuis ta machine (si le contexte Docker pointe vers le VPS) :

```bash
make portainer-up
```

## Nginx Proxy Manager

1. https://nginx.delhomme.ovh → **Proxy Hosts → Add Proxy Host**
2. Remplir :

| Champ | Valeur |
|-------|--------|
| Domain Names | `gasoil-tracking.delhomme.ovh` |
| Scheme | `http` |
| Forward Hostname / IP | `gasoil-tracking-web` |
| Forward Port | `80` |
| Cache Assets | optionnel |
| Block Common Exploits | ON |
| Websockets Support | ON |

3. Onglet **SSL** → Request a new SSL Certificate → Force SSL → Let’s Encrypt  
4. Save

Le hostname `gasoil-tracking-web` doit résoudre sur le réseau `web` (même réseau que NPM).

## DNS

Chez ton registrar / Cloudflare :

| Type | Nom | Valeur |
|------|-----|--------|
| A | `gasoil-tracking` | IP publique du serveur |
| ou CNAME | `gasoil-tracking` | vers le domaine principal du VPS |

Tu t’occupes du sous-domaine → une fois le DNS propagé, NPM délivre le certificat.

## Vérifications

```bash
# Sur le serveur
docker ps | grep gasoil
docker exec gasoil-tracking-web wget -qO- http://127.0.0.1/health
# → ok

# Depuis l’extérieur (après DNS + SSL)
curl -I https://gasoil-tracking.delhomme.ovh/health
```

## Mise à jour

```bash
cd GasoilTracking
git pull
docker compose -f docker-compose.yml -f docker-compose.portainer.yml up -d --build
```

Dans Portainer : Stack → **Pull and redeploy** (si repo Git configuré).

## Local (sans Portainer)

```bash
make docker-up
# → http://localhost:3340
```

## Mobile Samsung

```bash
make mobile-devices
make mobile-install-expo   # installe Expo Go
make mobile-start          # lance Metro + ouvre sur le BV9700Pro
```
