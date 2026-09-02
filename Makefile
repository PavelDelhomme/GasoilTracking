.PHONY: help install start web android ios typecheck build-web check \
	docker-build docker-up docker-down docker-restart docker-logs docker-status \
	portainer-info release push deploy update status-prod \
	mobile-start mobile-android mobile-devices mobile-install-expo mobile-tunnel \
	clean clean-all

PROJECT_NAME := gasoil-tracking
COMPOSE := docker compose -p $(PROJECT_NAME) -f docker-compose.yml
DOMAIN ?= gasoil-tracking.delhomme.ovh
REPO_URL := https://github.com/PavelDelhomme/GasoilTracking.git
COMPOSE_PORTAINER_PATH := docker-compose.portainer.yml
BRANCH := main
SAMSUNG_SERIAL ?= EEA9700PRO0014587
IMAGE := gasoil-tracking-web:latest
PORTAINER_UI := https://portainer.delhomme.ovh
NPM_UI := https://nginx.delhomme.ovh

# Charge .env local (webhook, etc.) sans l'exporter partout
ifneq (,$(wildcard .env))
  include .env
  export
endif

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
	@echo "${YELLOW}🚀 DÉPLOIEMENT PORTAINER (Git — production):${NC}"
	@echo "  ${GREEN}portainer-info${NC}       Valeurs exactes à coller dans Portainer"
	@echo "  ${GREEN}release${NC} / ${GREEN}push${NC}       Push ${CYAN}$(BRANCH)${NC} → GitHub"
	@echo "  ${GREEN}deploy${NC}               Webhook Portainer (rebuild stack)"
	@echo "  ${GREEN}update${NC}               ${CYAN}release + deploy${NC} (mise à jour complète)"
	@echo "  ${GREEN}status-prod${NC}          Health check ${CYAN}https://$(DOMAIN)${NC}"
	@echo "  Portainer: ${CYAN}$(PORTAINER_UI)${NC}"
	@echo "  Nginx PM:  ${CYAN}$(NPM_UI)${NC}"
	@echo "  Doc:       ${CYAN}docs/DEPLOY-PORTAINER.md${NC}"
	@echo ""
	@echo "${YELLOW}💻 DÉVELOPPEMENT:${NC}"
	@echo "  ${GREEN}install${NC}              npm install"
	@echo "  ${GREEN}start${NC}                Expo (QR / Metro)"
	@echo "  ${GREEN}web${NC}                  Expo web local"
	@echo "  ${GREEN}typecheck${NC}            tsc --noEmit"
	@echo "  ${GREEN}build-web${NC}            Export web → dist/"
	@echo "  ${GREEN}check${NC}                typecheck + build-web"
	@echo ""
	@echo "${YELLOW}📱 MOBILE (Samsung):${NC}"
	@echo "  ${GREEN}mobile-devices${NC}       Appareils ADB"
	@echo "  ${GREEN}mobile-install-expo${NC}  Installer Expo Go SDK 52"
	@echo "  ${GREEN}mobile-start${NC}         Metro + ouverture Samsung"
	@echo ""
	@echo "${YELLOW}🐳 DOCKER LOCAL (pas le VPS):${NC}"
	@echo "  ${GREEN}docker-up${NC}            http://localhost:3340"
	@echo "  ${GREEN}docker-down${NC}          Arrêt local"
	@echo "  ${GREEN}docker-logs${NC}          Logs locaux"
	@echo ""
	@echo "${YELLOW}🧹 NETTOYAGE:${NC}"
	@echo "  ${GREEN}clean${NC} / ${GREEN}clean-all${NC}"
	@echo ""

# ============================================================================
# PORTAINER GIT — production
# ============================================================================

portainer-info:
	@echo "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	@echo "${GREEN}  Portainer — créer / vérifier la stack Git${NC}"
	@echo "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	@echo ""
	@echo "UI: ${CYAN}$(PORTAINER_UI)${NC} → Stacks → Add stack"
	@echo ""
	@echo "  Name:             ${CYAN}gasoil-tracking${NC}"
	@echo "  Build method:     ${CYAN}Repository${NC}"
	@echo "  Repository URL:   ${CYAN}$(REPO_URL)${NC}"
	@echo "  Reference:        ${CYAN}refs/heads/$(BRANCH)${NC}"
	@echo "  Compose path:     ${CYAN}$(COMPOSE_PORTAINER_PATH)${NC}"
	@echo "  Authentication:   ${CYAN}ON${NC} (PAT GitHub scope repo)"
	@echo ""
	@echo "Puis NPM ${CYAN}$(NPM_UI)${NC}:"
	@echo "  Domain:           ${CYAN}$(DOMAIN)${NC}"
	@echo "  Forward host:     ${CYAN}gasoil-tracking-web${NC}"
	@echo "  Forward port:     ${CYAN}80${NC}"
	@echo "  SSL:              Let's Encrypt"
	@echo ""
	@echo "Webhook (pour ${GREEN}make deploy${NC}):"
	@echo "  Stack → Webhooks → Create → coller l'URL dans ${CYAN}.env${NC}:"
	@echo "  ${CYAN}PORTAINER_WEBHOOK_URL=https://portainer.delhomme.ovh/api/stacks/webhooks/...${NC}"
	@echo ""
	@if [ -n "$(PORTAINER_WEBHOOK_URL)" ]; then \
	  echo "${GREEN}✓ PORTAINER_WEBHOOK_URL est défini dans .env${NC}"; \
	else \
	  echo "${YELLOW}○ PORTAINER_WEBHOOK_URL pas encore défini — ${GREEN}make deploy${NC} affichera l'aide${NC}"; \
	fi
	@echo ""

release push:
	@echo "${GREEN}📤 Push $(BRANCH) → GitHub (Portainer lit ce dépôt)...${NC}"
	@git status --short
	@if [ -n "$$(git status --porcelain)" ]; then \
	  echo "${YELLOW}Des fichiers non commités — committe d'abord (ou make update après commit).${NC}"; \
	  git status --short; \
	  exit 1; \
	fi
	@git push -u origin $(BRANCH)
	@echo "${GREEN}✅ Code sur GitHub. Ensuite: make deploy  (ou Pull and redeploy dans Portainer)${NC}"

deploy:
	@echo "${GREEN}🚀 Déploiement Portainer (webhook)...${NC}"
	@if [ -z "$(PORTAINER_WEBHOOK_URL)" ]; then \
	  echo "${YELLOW}Pas de PORTAINER_WEBHOOK_URL dans .env${NC}"; \
	  echo ""; \
	  echo "1. ${CYAN}$(PORTAINER_UI)${NC} → Stacks → gasoil-tracking → Webhooks → Create"; \
	  echo "2. Ajoute dans .env:  PORTAINER_WEBHOOK_URL=<url>"; \
	  echo "3. Relance ${GREEN}make deploy${NC}"; \
	  echo ""; \
	  echo "Sans webhook: ouvre la stack → ${CYAN}Pull and redeploy${NC}"; \
	  exit 1; \
	fi
	@curl -fsS -X POST "$(PORTAINER_WEBHOOK_URL)" \
	  && echo "" && echo "${GREEN}✅ Webhook envoyé — Portainer rebuild depuis Git${NC}" \
	  || (echo "${RED}Échec webhook${NC}"; exit 1)

update: release deploy
	@echo "${GREEN}✅ Mise à jour lancée (Git + Portainer)${NC}"

status-prod:
	@echo "${GREEN}📊 Production ${CYAN}https://$(DOMAIN)${NC}"
	@curl -sfI "https://$(DOMAIN)/health" 2>/dev/null | head -5 \
	  && echo "${GREEN}health: ok${NC}" \
	  || (echo "${YELLOW}Pas encore joignable (DNS / stack / NPM ?)${NC}"; \
	      curl -sfI "https://$(DOMAIN)/" 2>/dev/null | head -3 || true)

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
	@echo "${GREEN}📥 Installation Expo Go (SDK 52) sur $(SAMSUNG_SERIAL)...${NC}"
	@mkdir -p .tmp
	@if [ ! -f .tmp/expo-go.apk ]; then \
		echo "${YELLOW}Téléchargement Expo Go 2.32.20...${NC}"; \
		curl -fsSL -L -o .tmp/expo-go.apk \
		  "https://github.com/expo/expo-go-releases/releases/download/Expo-Go-2.32.20/Expo-Go-2.32.20.apk"; \
	fi
	adb -s $(SAMSUNG_SERIAL) install -r .tmp/expo-go.apk
	@echo "${GREEN}✅ Expo Go installé${NC}"

mobile-start mobile-android:
	@echo "${GREEN}📱 Lancement sur Samsung $(SAMSUNG_SERIAL)...${NC}"
	@adb -s $(SAMSUNG_SERIAL) wait-for-device
	@echo "${YELLOW}Démarrage Metro puis ouverture Expo Go...${NC}"
	@CI=1 npx expo start --port 8081 & \
	  sleep 8; \
	  IP=$$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($$i=="src") print $$(i+1)}' | head -1); \
	  echo "${GREEN}Ouverture exp://$${IP}:8081${NC}"; \
	  adb -s $(SAMSUNG_SERIAL) shell am start -a android.intent.action.VIEW -d "exp://$${IP}:8081"; \
	  wait

mobile-tunnel:
	@echo "${GREEN}🌐 Expo tunnel...${NC}"
	npx expo start --tunnel --android

# ============================================================================
# DOCKER LOCAL
# ============================================================================

docker-build:
	@echo "${GREEN}🐳 Build $(IMAGE) (local)...${NC}"
	$(COMPOSE) build

docker-up: docker-build
	@echo "${GREEN}🚀 Local http://localhost:$${GASOIL_HOST_PORT:-3340}${NC}"
	$(COMPOSE) up -d

docker-down:
	$(COMPOSE) down

docker-restart: docker-down docker-up

docker-logs:
	$(COMPOSE) logs -f --tail=200

docker-status:
	@$(COMPOSE) ps
	@curl -sf http://127.0.0.1:$${GASOIL_HOST_PORT:-3340}/health && echo " health: ok" || echo "${RED}health: ko${NC}"

# ============================================================================
# CLEAN
# ============================================================================

clean:
	rm -rf dist .expo web-build .tmp
	@echo "${GREEN}✅ clean OK${NC}"

clean-all: clean docker-down
	@docker rmi $(IMAGE) 2>/dev/null || true
	@echo "${GREEN}✅ clean-all OK${NC}"
