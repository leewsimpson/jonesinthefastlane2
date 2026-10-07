#!/usr/bin/env bash
# Make the Pages project's production branch `production`, so `main` deploys stay on the main alias and only the
# production workflow updates the production URL (ci-cd.md CD-02, CD-03). Idempotent.
# Usage: pages-production-branch.sh <project>   (needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID)
set -euo pipefail
project=${1:?project}
api="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID:?}/pages/projects/${project}"
auth=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN:?}")
current=$(curl -fsS "${auth[@]}" "$api" | jq -r '.result.production_branch')
if [ "$current" = production ]; then
  echo "Pages production branch is already 'production'"
  exit 0
fi
echo "Pages production branch is '$current'; setting it to 'production'"
curl -fsS -X PATCH "${auth[@]}" -H 'Content-Type: application/json' \
  -d '{"production_branch":"production"}' "$api" | jq -e '.success' > /dev/null
