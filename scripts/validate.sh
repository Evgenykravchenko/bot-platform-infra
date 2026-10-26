#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=${ENV_FILE:-"$repo_dir/.env.example"}
node_bin=${NODE_BIN:-node}

docker compose --env-file "$env_file" -f "$repo_dir/compose.yaml" -f "$repo_dir/compose.local.yaml" config --quiet
docker compose --env-file "$env_file" -f "$repo_dir/compose.yaml" -f "$repo_dir/compose.production.yaml" config --quiet
"$node_bin" --check "$repo_dir/scripts/bootstrap-directus.mjs"
"$node_bin" --check "$repo_dir/scripts/vk-oauth-callback.mjs"

echo "Infrastructure configuration is valid."

