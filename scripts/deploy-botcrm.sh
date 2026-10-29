#!/bin/sh
set -eu

version=${1:-}
expected_commit=${2:-}
repo_dir=${BOTCRM_DEPLOY_ROOT:-/opt/botcrm}
node_bin=${NODE_BIN:-node}

if ! printf '%s' "$version" | LC_ALL=C grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo 'Provide a stable BotCRM release version, for example 0.7.0.' >&2
  exit 1
fi
if ! printf '%s' "$expected_commit" | LC_ALL=C grep -Eq '^[a-f0-9]{40}$'; then
  echo 'Provide the full approved BotCRM commit SHA.' >&2
  exit 1
fi

cd "$repo_dir"
if [ "$(git symbolic-ref --short HEAD)" != main ] || [ -n "$(git status --porcelain)" ]; then
  echo 'BotCRM must have a clean main checkout; refusing to replace local work.' >&2
  exit 1
fi
if [ ! -r .env.production ]; then
  echo 'The existing BotCRM production environment is not readable.' >&2
  exit 1
fi

# Fetch immutable inputs explicitly. Never force a moved tag or reset the checkout.
git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main "refs/tags/v$version:refs/tags/v$version"
tag_commit=$(git rev-parse --verify "refs/tags/v$version^{commit}")
if [ "$tag_commit" != "$expected_commit" ]; then
  echo 'The release tag does not match the approved commit.' >&2
  exit 1
fi
git merge-base --is-ancestor "$tag_commit" origin/main
git merge-base --is-ancestor HEAD "$tag_commit"
git merge --ff-only "$tag_commit"

# The authoritative BotCRM deploy owns its lock, readiness probes, routing and rollback.
# It touches only BotCRM release slots, not the shared Directus/DB stack or other bots.
release=$(git rev-parse --short=12 HEAD)
"$node_bin" infra/scripts/deploy.mjs "$release"
