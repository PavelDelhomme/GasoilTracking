# Build Expo Web → assets statiques, servi par nginx
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV EXPO_NO_TELEMETRY=1
RUN npx expo export --platform web --output-dir dist

# --- Production ---
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="Gasoil Tracking"
LABEL org.opencontainers.image.description="Suivi carburant — interface web"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
