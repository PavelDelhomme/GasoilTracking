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
DEPLOY_SSH ?= pavel-server

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
	@echo "${YELLOW}🚀 PRODUCTION (Git → VPS → https://$(DOMAIN)):${NC}"
	@echo "  ${GREEN}release${NC} / ${GREEN}push${NC}       Push ${CYAN}$(BRANCH)${NC} → GitHub"
	@echo "  ${GREEN}deploy${NC}               Pull Git sur VPS + rebuild conteneur"
	@echo "  ${GREEN}update${NC}               ${CYAN}release + deploy${NC} (mise à jour live)"
	@echo "  ${GREEN}status-prod${NC}          Health https://$(DOMAIN)"
	@echo "  ${GREEN}portainer-info${NC}       Aide stack Repository Portainer UI"
	@echo "  Live: ${CYAN}https://$(DOMAIN)${NC}"
	@echo ""
	@echo "${YELLOW}💻 DEV:${NC} install start web typecheck build-web check"
	@echo "${YELLOW}📱 MOBILE:${NC} mobile-devices mobile-install-expo mobile-start"
	@echo "${YELLOW}🐳 LOCAL:${NC} docker-up → http://localhost:3340"
	@echo ""

portainer-info:
	@echo "UI: ${CYAN}$(PORTAINER_UI)${NC} → Stacks → Add stack → Repository"
	@echo "  Name:          gasoil-tracking"
	@echo "  Repository:    ${CYAN}$(REPO_URL)${NC}"
	@echo "  Reference:     refs/heads/$(BRANCH)"
	@echo "  Compose path:  ${CYAN}$(COMPOSE_PORTAINER_PATH)${NC}"
	@echo "  Auth:          PAT GitHub (repo privé)"
	@echo "Conteneur déjà live via make deploy (clone /home/pavel/apps/gasoil-tracking)."
	@echo ""

release push:
	@echo "${GREEN}📤 Push $(BRANCH) → GitHub...${NC}"
	@if [ -n "$$(git status --porcelain)" ]; then \
	  echo "${YELLOW}Fichiers non commités — committe d'abord.${NC}"; \
	  git status --short; exit 1; \
	fi
	@git push -u origin $(BRANCH)
	@echo "${GREEN}✅ Sur GitHub. Ensuite: make deploy${NC}"

deploy:
	@echo "${GREEN}🚀 Déploiement production (Git pull VPS + compose)...${NC}"
	@chmod +x scripts/deploy-vps.sh
	@DEPLOY_SSH=$(DEPLOY_SSH) GASOIL_DOMAIN=$(DOMAIN) ./scripts/deploy-vps.sh

update: release deploy
	@echo "${GREEN}✅ Live → https://$(DOMAIN)${NC}"

status-prod:
	@curl -sfI "https://$(DOMAIN)/health" | head -8
	@curl -sf "https://$(DOMAIN)/health" && echo " ✅" || echo "${RED}ko${NC}"

install:
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
	npx tsc --noEmit

build-web:
	npx expo export --platform web --output-dir dist

check: typecheck build-web

mobile-devices:
	@adb devices -l

mobile-install-expo:
	@mkdir -p .tmp
	@test -f .tmp/expo-go.apk || curl -fsSL -L -o .tmp/expo-go.apk \
	  "https://github.com/expo/expo-go-releases/releases/download/Expo-Go-2.32.20/Expo-Go-2.32.20.apk"
	adb -s $(SAMSUNG_SERIAL) install -r .tmp/expo-go.apk

mobile-start mobile-android:
	@adb -s $(SAMSUNG_SERIAL) wait-for-device
	@CI=1 npx expo start --port 8081 & \
	  sleep 8; \
	  IP=$$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($$i=="src") print $$(i+1)}' | head -1); \
	  adb -s $(SAMSUNG_SERIAL) shell am start -a android.intent.action.VIEW -d "exp://$${IP}:8081"; \
	  wait

mobile-tunnel:
	npx expo start --tunnel --android

docker-build:
	$(COMPOSE) build

docker-up: docker-build
	$(COMPOSE) up -d

docker-down:
	$(COMPOSE) down

docker-restart: docker-down docker-up

docker-logs:
	$(COMPOSE) logs -f --tail=200

docker-status:
	@$(COMPOSE) ps

clean:
	rm -rf dist .expo web-build .tmp

clean-all: clean docker-down
	@docker rmi $(IMAGE) 2>/dev/null || true
