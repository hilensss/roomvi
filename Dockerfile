# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build

ENV NEXT_TELEMETRY_DISABLED=1 \
  NODE_OPTIONS=--max-old-space-size=512 \
  NPM_CONFIG_AUDIT=false \
  NPM_CONFIG_FUND=false

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN nice -n 10 npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/database packages/database

RUN DATABASE_URL=postgresql://roomvi:roomvi@localhost:5432/roomvi \
  nice -n 10 ./node_modules/.bin/prisma generate \
  --schema=packages/database/prisma/schema.prisma

RUN nice -n 10 npm run build -w @roomvi/shared \
  && nice -n 10 npm run build -w @roomvi/database

COPY apps/api apps/api

RUN nice -n 10 ./node_modules/.bin/tsc \
  -p apps/api/tsconfig.json \
  --noCheck

COPY apps/worker apps/worker

RUN nice -n 10 ./node_modules/.bin/tsc \
  -p apps/worker/tsconfig.json \
  --noCheck

COPY apps/web apps/web

ARG NEXT_PUBLIC_API_URL=/release/api
ARG NEXT_PUBLIC_BASE_PATH=/release
ARG NEXT_PUBLIC_RUB_PER_USD=90
ARG NEXT_PUBLIC_USD_BUDGET_STEP=50

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
  NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH} \
  NEXT_PUBLIC_RUB_PER_USD=${NEXT_PUBLIC_RUB_PER_USD} \
  NEXT_PUBLIC_USD_BUDGET_STEP=${NEXT_PUBLIC_USD_BUDGET_STEP}

RUN nice -n 10 npm run build -w web

RUN nice -n 10 npm prune --omit=dev --no-audit --no-fund

FROM base AS production

WORKDIR /app

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000

COPY --from=build --chown=node:node /app /app

USER node

CMD ["node", "apps/api/dist/main.js"]
