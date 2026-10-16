# syntax=docker/dockerfile:1
# Target: app (API + web statis) dan scheduler (collector Playwright + jadwal + backup).

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY collector/package.json collector/
RUN npm ci
COPY . .
RUN npm run build -w frontend

FROM node:20-bookworm-slim AS app
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build /app /app
EXPOSE 4000
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/src/server.js"]

# Versi image harus sama dengan playwright-core di collector/package.json (Chromium ikut terpasang di image).
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS scheduler
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
CMD ["node", "collector/src/scheduler/index.js"]
