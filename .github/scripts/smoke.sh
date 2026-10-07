#!/usr/bin/env bash
# Post-deploy smoke test (ci-cd.md CD-06): the API's /healthz reports the expected version, the web app serves its
# shell, and /config.json points at the API. `/daily` joins when the Daily Run API lands (Phase 7).
# Usage: smoke.sh <web url> <api url> <expected version (commit SHA)>
set -euo pipefail
web=${1:?web url}
api=${2:?api url}
sha=${3:?expected version}

retry() { # retry <description> <command…>: up to 8 tries, 5 s apart, for edge caches to catch up
  local what=$1; shift
  for i in 1 2 3 4 5 6 7 8; do
    if "$@"; then echo "ok: $what"; return 0; fi
    echo "waiting for $what (try $i)…"; sleep 5
  done
  echo "::error::smoke test failed: $what"; return 1
}

api_version() {
  curl -fsS -D - "$api/healthz" -o /dev/null | tr -d '\r' |
    awk -F': ' 'tolower($1)=="x-fastlane-version"{print $2}'
}
version_matches() { [ "$(api_version)" = "$sha" ]; }
shell_served() { curl -fsS "$web/" | grep -q '<div id="root">'; }
config_points_at_api() { curl -fsS "$web/config.json" | grep -qF "\"$api\""; }
csp_set() { curl -fsSI "$web/" | tr -d '\r' | grep -qi '^content-security-policy:'; }

retry "API $api/healthz reports $sha" version_matches
retry "web shell at $web/" shell_served
retry "$web/config.json points at $api" config_points_at_api
retry "security headers on $web/" csp_set
