#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=${ENV_FILE:-/etc/bot-platform/infra.env}

docker compose \
  --env-file "$env_file" \
  -f "$repo_dir/compose.yaml" \
  -f "$repo_dir/compose.production.yaml" \
  ps

docker compose \
  --env-file "$env_file" \
  -f "$repo_dir/compose.yaml" \
  -f "$repo_dir/compose.production.yaml" \
  logs --tail=50 directus cms-bootstrap tailscale

