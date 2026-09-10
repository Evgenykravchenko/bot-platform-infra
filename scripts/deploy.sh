#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=${ENV_FILE:-/etc/bot-platform/infra.env}

if [ ! -r "$env_file" ]; then
  echo "Environment file is not readable: $env_file" >&2
  exit 1
fi

compose() {
  docker compose \
    --env-file "$env_file" \
    -f "$repo_dir/compose.yaml" \
    -f "$repo_dir/compose.production.yaml" \
    "$@"
}

compose config --quiet
compose pull
compose up -d --remove-orphans --wait
compose ps

