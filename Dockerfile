# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

FROM dependencies AS source

COPY . .

FROM source AS database-source

RUN DATABASE_URL=postgresql://roomvi:roomvi@localhost:5432/roomvi \
  ./node_modules/.bin/prisma generate \
  --schema=packages/database/prisma/schema.prisma

FROM database-source AS packages-build

RUN npm run build -w @roomvi/shared \
  && npm run build -w @roomvi/database

FROM packages-build AS api-build

RUN npm run build -w api

FROM api-build AS api-production

RUN npm prune --omit=dev

FROM packages-build AS worker-build

RUN npm run build -w worker

FROM worker-build AS worker-production

RUN npm prune --omit=dev

FROM source AS web-build

ARG NEXT_PUBLIC_API_URL=/release/api
ARG NEXT_PUBLIC_BASE_PATH=/release

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build -w web

FROM base AS api

ENV NODE_ENV=production
ENV API_PORT=4000

COPY --from=api-production /app/node_modules ./node_modules
COPY --from=api-production /app/apps/api/package.json ./apps/api/package.json
COPY --from=api-production /app/apps/api/dist ./apps/api/dist
COPY --from=api-production /app/packages/database/package.json ./packages/database/package.json
COPY --from=api-production /app/packages/database/dist ./packages/database/dist
COPY --from=api-production /app/packages/database/generated ./packages/database/generated
COPY --from=api-production /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=api-production /app/packages/shared/dist ./packages/shared/dist

USER node
EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]

FROM base AS worker

ENV NODE_ENV=production

COPY --from=worker-production /app/node_modules ./node_modules
COPY --from=worker-production /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=worker-production /app/apps/worker/dist ./apps/worker/dist
COPY --from=worker-production /app/packages/database/package.json ./packages/database/package.json
COPY --from=worker-production /app/packages/database/dist ./packages/database/dist
COPY --from=worker-production /app/packages/database/generated ./packages/database/generated
COPY --from=worker-production /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=worker-production /app/packages/shared/dist ./packages/shared/dist

USER node

CMD ["node", "apps/worker/dist/main.js"]

FROM base AS migrate

ENV NODE_ENV=production

COPY --from=database-source /app/node_modules ./node_modules
COPY --from=database-source /app/package.json ./package.json
COPY --from=database-source /app/packages/database/package.json ./packages/database/package.json
COPY --from=database-source /app/packages/database/prisma ./packages/database/prisma

USER node

CMD ["npm", "run", "db:migrate:deploy"]

FROM base AS web

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
