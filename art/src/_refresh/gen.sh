#!/usr/bin/env bash
# Generate one refresh image with Codex's built-in image tool: gen.sh <name> [reference.png ...]   (e.g. ../../../design/concepts/classic-rebuilt.png)
# The prompt goes on stdin: `--image` takes several values and would swallow a positional prompt.
set -euo pipefail
cd "$(dirname "$0")"
name="$1"; shift
refs=()
for r in "$@"; do refs+=("--image=$r"); done
{
  echo "Use your built-in image generation tool (not the API/CLI fallback) to create the following image at ${SIZE:-1536x1024}. The attached image(s) are style references only: do not copy their text, signs or layout. Save the PNG in the current directory as $name.png. Reply with the file path."
  echo
  cat "$name.prompt.txt"
} | codex exec --skip-git-repo-check -m "${CODEX_MODEL:-gpt-5.5}" -s workspace-write "${refs[@]}" -
ls -la "$name.png"
