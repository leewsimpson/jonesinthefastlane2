#!/usr/bin/env bash
# usage: gen_one.sh <category> <id> <canvas>
cat="$1"; id="$2"; canvas="$3"
ART="C:/Github/_experiment/jonesinthefastlane2/art/src"
LOG="${TMPDIR:-/tmp}/fastlane-art-logs"; mkdir -p "$LOG"
cd "$ART/$cat" || exit 1
[ -f "$id.png" ] && { echo "SKIP $id"; exit 0; }
refs=(-i ../_anchor/style-anchor.png)
note="Match the illustration style of the attached style reference image exactly (outline weight, palette, shading, proportions) but NOT its subject."
if [[ "$id" == *-emotions ]]; then
  base="${id%-emotions}"
  refs+=(-i "$base.png")
  note="$note The second attached image ($base.png) is the character to draw: copy that character exactly."
fi
prompt="$(cat "$id.prompt.txt")"
printf '%s' "Use your built-in image generation tool (not the API/CLI fallback) to create the image described below at $canvas. $note Save the PNG in the current directory as $id.png. Reply with the file path.

$prompt" | codex exec --skip-git-repo-check -s workspace-write "${refs[@]}" > "$LOG/$id.log" 2>&1
if [ -f "$id.png" ]; then echo "OK $id"; else echo "FAIL $id"; fi
