#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOMVI_ENV_FILE:-${PROJECT_ROOT}/.env.production}"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.prod.yml"
MODE="${1:-all}"

export COMPOSE_BAKE=false
export COMPOSE_PARALLEL_LIMIT=1

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Production env file not found: ${ENV_FILE}" >&2
  exit 1
fi

compose=(
  docker compose
  --parallel 1
  --progress plain
  --env-file "${ENV_FILE}"
  -f "${COMPOSE_FILE}"
)

build_service() {
  local service="$1"

  echo
  echo "==> Building ${service}"
  "${compose[@]}" build "${service}"
}

cd "${PROJECT_ROOT}"
"${compose[@]}" config --quiet

case "${MODE}" in
  all)
    for service in migrate api worker web; do
      build_service "${service}"
    done

    echo
    echo '==> Starting production stack'
    "${compose[@]}" up -d --no-build
    ;;
  web)
    build_service web

    echo
    echo '==> Recreating web'
    "${compose[@]}" up -d --no-deps --no-build web
    ;;
  api)
    build_service migrate
    build_service api

    echo
    echo '==> Recreating API and applying migrations'
    "${compose[@]}" up -d --no-build api
    ;;
  worker)
    build_service migrate
    build_service worker

    echo
    echo '==> Recreating worker and applying migrations'
    "${compose[@]}" up -d --no-build worker
    ;;
  *)
    echo "Usage: $0 [all|web|api|worker]" >&2
    exit 2
    ;;
esac
