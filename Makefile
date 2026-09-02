.PHONY: help install start web android ios typecheck build-web \
	docker-build docker-up docker-down docker-restart docker-logs docker-status \
	portainer-up portainer-down deploy-portainer \
	mobile-start mobile-android mobile-devices mobile-install-expo mobile-tunnel \
	git-status git-push repo-create \
	clean clean-all check

PROJECT_NAME := gasoil-tracking
COMPOSE := docker compose -p $(PROJECT_NAME) -f docker-compose.yml
COMPOSE_PORTAINER := $(COMPOSE) -f docker-compose.portainer.yml
DOMAIN ?= gasoil-tracking.delhomme.ovh
SAMSUNG_SERIAL ?= EEA9700PRO0014587
IMAGE := gasoil-tracking-web:latest

ifneq ($(TERM),)
  ifneq ($(TERM),dumb)
    ifneq ($(NO_COLOR),1)
      HAS_COLOR := 1
    endif
  endif
endif

ifeq ($(HAS_COLOR),1)
  GREEN  := $(shell printf '\033[0;32m')
  YELLOW := $(shell printf '\033[0;33m')
  RED    := $(shell printf '\033[0;31m')
  CYAN   := $(shell printf '\033[0;36m')
  NC     := $(shell printf '\033[0m')
else
  GREEN :=
  YELLOW :=
  RED :=
  CYAN :=
  NC :=
endif

help:
	@echo "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	@echo "${GREEN}  GASOIL TRACKING — Makefile${NC}"
	@echo "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	@echo ""
	@echo "${YELLOW}💻 DÉVELOPPEMENT:${NC}"
	@echo "  ${GREEN}install${NC}              npm install"
	@echo "  ${GREEN}start${NC}                Expo (QR code / Metro)"
	@echo "  ${GREEN}web${NC}                  Expo mode web local"
	@echo "  ${GREEN}android${NC}              Expo → Android (device/émulateur)"
	@echo "  ${GREEN}typecheck${NC}            tsc --noEmit"
	@echo "  ${GREEN}build-web${NC}            Export web statique (dist/)"
	@echo "  ${GREEN}check${NC}                typecheck + build-web"
	@echo ""
	@echo "${YELLOW}📱 MOBILE (Samsung / ADB):${NC}"
	@echo "  ${GREEN}mobile-devices${NC}       Lister les appareils ADB"
	@echo "  ${GREEN}mobile-install-expo${NC}  Installer Expo Go sur le Samsung"
	@echo "  ${GREEN}mobile-start${NC}         Expo + lancement sur ${CYAN}$(SAMSUNG_SERIAL)${NC}"
	@echo "  ${GREEN}mobile-android${NC}       Alias mobile-start"
	@echo "  ${GREEN}mobile-tunnel${NC}        Expo en mode tunnel (réseau difficile)"
	@echo ""
	@echo "${YELLOW}🐳 DOCKER (local):${NC}"
	@echo "  ${GREEN}docker-build${NC}         Build image ${CYAN}$(IMAGE)${NC}"
	@echo "  ${GREEN}docker-up${NC}            Démarrer (http://localhost:3340)"
	@echo "  ${GREEN}docker-down${NC}          Arrêter"
	@echo "  ${GREEN}docker-restart${NC}       Rebuild + redémarrage"
	@echo "  ${GREEN}docker-logs${NC}          Logs du conteneur"
	@echo "  ${GREEN}docker-status${NC}        Statut / health"
	@echo ""
	@echo "${YELLOW}🚀 PORTAINER + NGINX PROXY MANAGER:${NC}"
	@echo "  ${GREEN}portainer-up${NC}         Compose + réseau externe ${CYAN}web${NC}"
	@echo "  ${GREEN}portainer-down${NC}       Arrêt stack Portainer"
	@echo "  ${GREEN}deploy-portainer${NC}     Aide déploiement ${CYAN}$(DOMAIN)${NC}"
	@echo "  Docs: ${CYAN}docs/DEPLOY-PORTAINER.md${NC}"
	@echo "  Portainer: ${CYAN}https://portainer.delhomme.ovh${NC}"
	@echo "  Nginx PM:  ${CYAN}https://nginx.delhomme.ovh${NC}"
	@echo ""
	@echo "${YELLOW}🧹 NETTOYAGE:${NC}"
	@echo "  ${GREEN}clean${NC}                dist/, .expo/, caches"
	@echo "  ${GREEN}clean-all${NC}            + images Docker projet"
	@echo ""

# ============================================================================
# DEV
# ============================================================================

install:
	@echo "${GREEN}📦 npm install...${NC}"
	npm install

start:
	npx expo start

web:
	npx expo start --web

android:
	npx expo start --android

ios:
	npx expo start --ios

typecheck:
	@echo "${GREEN}🔍 TypeScript...${NC}"
	npx tsc --noEmit

build-web:
	@echo "${GREEN}🌐 Export Expo Web → dist/${NC}"
	npx expo export --platform web --output-dir dist

check: typecheck build-web
	@echo "${GREEN}✅ check OK${NC}"

# ============================================================================
# MOBILE
# ============================================================================

mobile-devices:
	@echo "${GREEN}📱 Appareils ADB:${NC}"
	@adb devices -l

mobile-install-expo:
	@echo "${GREEN}📥 Installation Expo Go sur $(SAMSUNG_SERIAL)...${NC}"
	@mkdir -p .tmp
	@if [ ! -f .tmp/expo-go.apk ]; then \
		echo "${YELLOW}Téléchargement Expo Go APK...${NC}"; \
		curl -fsSL -o .tmp/expo-go.apk \
		  "https://d1ahtucjixef4r.cloudfront.net/Exponent-2.32.18.apk" \
		|| curl -fsSL -L -o .tmp/expo-go.apk \
		  "https://github.com/expo/expo-go-releases/releases/download/Expo-Go-2.32.18/Exponent-2.32.18.apk"; \
	fi
	adb -s $(SAMSUNG_SERIAL) install -r .tmp/expo-go.apk
	@echo "${GREEN}✅ Expo Go installé${NC}"

mobile-start mobile-android:
	@echo "${GREEN}📱 Lancement sur Samsung $(SAMSUNG_SERIAL)...${NC}"
	@adb -s $(SAMSUNG_SERIAL) wait-for-device
	@ANDROID_SERIAL=$(SAMSUNG_SERIAL) npx expo start --android --device

mobile-tunnel:
	@echo "${GREEN}🌐 Expo tunnel (pour Samsung hors LAN)...${NC}"
	npx expo start --tunnel --android

# ============================================================================
# DOCKER
# ============================================================================

docker-build:
	@echo "${GREEN}🐳 Build $(IMAGE)...${NC}"
	$(COMPOSE) build

docker-up: docker-build
	@echo "${GREEN}🚀 Démarrage Gasoil Tracking (port 3340)...${NC}"
	$(COMPOSE) up -d
	@echo "${GREEN}✅ http://localhost:$${GASOIL_HOST_PORT:-3340}${NC}"

docker-down:
	$(COMPOSE) down

docker-restart: docker-down docker-up

docker-logs:
	$(COMPOSE) logs -f --tail=200

docker-status:
	@echo "${GREEN}📊 Statut:${NC}"
	@$(COMPOSE) ps
	@echo ""
	@curl -sf http://127.0.0.1:$${GASOIL_HOST_PORT:-3340}/health && echo " health: ok" || echo "${RED}health: ko${NC}"

# ============================================================================
# PORTAINER / NPM
# ============================================================================

portainer-up:
	@echo "${GREEN}🚀 Stack Portainer (réseau web)...${NC}"
	@docker network inspect web >/dev/null 2>&1 || docker network create web
	$(COMPOSE_PORTAINER) up -d --build
	@echo "${GREEN}✅ Conteneur gasoil-tracking-web sur réseaux gasoil-network + web${NC}"
	@echo "${YELLOW}→ Dans Nginx Proxy Manager:${NC}"
	@echo "   Domain: $(DOMAIN)"
	@echo "   Forward hostname: gasoil-tracking-web"
	@echo "   Forward port: 80"

portainer-down:
	$(COMPOSE_PORTAINER) down

deploy-portainer:
	@echo "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	@echo "${GREEN}  Déploiement Portainer + Nginx Proxy Manager${NC}"
	@echo "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	@echo ""
	@echo "1. Portainer ${CYAN}https://portainer.delhomme.ovh${NC}"
	@echo "   → Stacks → Add stack → nom: ${CYAN}gasoil-tracking${NC}"
	@echo "   → Repository: clone ce dépôt GitHub"
	@echo "   → Compose path: docker-compose.yml"
	@echo "   → Ajoute aussi docker-compose.portainer.yml (ou colle le contenu fusionné)"
	@echo "   → Environnement: crée le réseau Docker externe ${CYAN}web${NC} s'il n'existe pas"
	@echo ""
	@echo "2. Nginx Proxy Manager ${CYAN}https://nginx.delhomme.ovh${NC}"
	@echo "   → Proxy Hosts → Add Proxy Host"
	@echo "   → Domain Names: ${CYAN}$(DOMAIN)${NC}"
	@echo "   → Scheme: http"
	@echo "   → Forward Hostname / IP: ${CYAN}gasoil-tracking-web${NC}"
	@echo "   → Forward Port: ${CYAN}80${NC}"
	@echo "   → Websockets: ON (recommandé)"
	@echo "   → SSL: Request a new SSL Certificate (Let's Encrypt)"
	@echo ""
	@echo "3. DNS: pointe ${CYAN}$(DOMAIN)${NC} vers l'IP publique du serveur (A/AAAA)"
	@echo ""
	@echo "Doc complète: ${CYAN}docs/DEPLOY-PORTAINER.md${NC}"
	@echo ""

# ============================================================================
# CLEAN
# ============================================================================

clean:
	@echo "${YELLOW}🧹 Nettoyage dist / .expo / caches...${NC}"
	rm -rf dist .expo web-build .tmp
	@echo "${GREEN}✅ clean OK${NC}"

clean-all: clean docker-down
	@docker rmi $(IMAGE) 2>/dev/null || true
	@echo "${GREEN}✅ clean-all OK${NC}"
