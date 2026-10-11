#!/usr/bin/env bash
# Regenerate one building with its name painted on its sign: gen-named.sh <id>. Reference: ref-<id>.png (the current art on magenta).
set -euo pipefail
cd "$(dirname "$0")"
id="$1"
{
  echo "Use your built-in image generation tool (not the API/CLI fallback) to create the following image at 1024x1024. The attached image is the building to redraw. Save the PNG in the current directory as $id.png. Reply with the file path."
  echo
  cat "$id.prompt.txt"
} | codex exec --skip-git-repo-check -m "${CODEX_MODEL:-gpt-5.5}" -s workspace-write "--image=ref-$id.png" -
ls -la "$id.png"
