# Roomvi deployment on a VPS

The production stack runs Next.js, NestJS API, the generation worker,
PostgreSQL, Redis, and Caddy with Docker Compose.

Public routing:

- `https://roomvi.ru/release` proxies to Roomvi and is protected by temporary
  HTTP Basic Auth;
- `https://roomvi.ru/release/api/*` proxies to the NestJS API and is protected
  by the same credentials;
- `/` and every path outside `/release` return `404 Not Found`.

The database, Redis, API, worker, and web containers do not publish ports on the
VPS. Only Caddy publishes ports 80 and 443.

## 1. Prepare the VPS

Install Docker Engine with the Compose plugin. Point the `A`/`AAAA` DNS records
for `roomvi.ru` to the new VPS. After DNS propagation, the previous landing VPS
is no longer part of the request path and can be shut down independently.

Caddy must be the only process listening on ports 80 and 443 on the new VPS.
No connection to the previous landing VPS is required.

## 2. Create production secrets

From the repository root:

```bash
cp .env.production.example .env.production
openssl rand -hex 32
docker run --rm -it caddy:2.10-alpine caddy hash-password --algorithm bcrypt
```

Use separate `openssl` outputs for `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, and `GUEST_HASH_SALT`. Enter the temporary preview password
when Caddy prompts for it. Put the resulting hash into
`RELEASE_AUTH_PASSWORD_HASH` and keep it wrapped in single quotes so its `$`
characters remain literal.

Fill in the S3-compatible storage settings and the generation provider settings.
`GENERATION_PROVIDER=MOCK` is suitable only for an infrastructure smoke test.

## 3. Validate and start

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f caddy api worker
```

The one-shot `migrate` service runs committed Prisma migrations before the API
and worker start. Re-running the command is safe: Prisma applies only pending
migrations.

Verify both routes:

```bash
curl -I https://roomvi.ru/
curl -I https://roomvi.ru/release
curl -I -u 'roomvi-preview:preview-password' https://roomvi.ru/release
```

The first command should return `404`, the second should return `401`, and the
authenticated request should reach the Next.js application.

## Updates and operations

Deploy a new revision with:

```bash
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Rotate the temporary preview password by generating a new hash, updating
`.env.production`, and recreating Caddy:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --force-recreate caddy
```

When closed testing ends, remove the `basic_auth` block from
`deploy/Caddyfile`; no frontend or account logic needs to change.

Persistent data lives in the `postgres_data`, `redis_data`, `caddy_data`, and
`caddy_config` Docker volumes. Back up PostgreSQL and external object storage
before upgrades.
