#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=${ENV_FILE:-"$repo_dir/.env.example"}

docker compose --env-file "$env_file" -f "$repo_dir/compose.yaml" -f "$repo_dir/compose.local.yaml" config --quiet
docker compose --env-file "$env_file" -f "$repo_dir/compose.yaml" -f "$repo_dir/compose.production.yaml" config --quiet
node --check "$repo_dir/scripts/bootstrap-directus.mjs"

echo "Infrastructure configuration is valid."

