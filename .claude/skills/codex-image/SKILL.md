---
name: codex-image
description: Generate 2D graphics (sprites, backgrounds, icons, concept art) with ChatGPT image generation via the local Codex CLI, billed to the user's ChatGPT subscription — no API key. Use when the user asks to generate, draw, or create an image or game asset.
---

# Codex image generation

Codex CLI (`codex`) is installed and logged in with the user's ChatGPT account. Its built-in `image_gen` tool generates images against the subscription's usage limits — roughly 18k tokens per image.

## Steps

1. **Write the prompt.** Spell out subject, style (e.g. pixel art, flat vector), view angle, and background. The model drifts on background — a request for "white or transparent" came back black with a glow — so state the background firmly, e.g. "solid flat #FFFFFF background, no glow, no shadow".
2. **Run Codex non-interactively** from the folder the image should land in (create it first), with a long timeout (≥ 5 min):

   ```powershell
   Set-Location <target-dir>
   codex exec --skip-git-repo-check -s workspace-write "Use your built-in image generation tool (not the API/CLI fallback) to create <description>. Save the PNG in the current directory as <name>.png. Reply with the file path."
   ```

   - `--skip-git-repo-check` — needed outside a git repo.
   - `-s workspace-write` — lets Codex copy the file into the cwd.
   - `-i <ref.png>` — attach a reference image to keep a set of sprites in a consistent style.
   - "built-in … not the API fallback" keeps Codex off its `OPENAI_API_KEY` script path. If it still asks for a key, re-run; never ask the user for one.
3. **Verify.** Done when `<name>.png` exists in the target dir and you have viewed it with Read and checked it against the prompt (subject, style, background). If the file is missing, Codex's original is under `~/.codex/generated_images/<session-id>/` — copy the newest PNG from there.

One image per `codex exec` call; run calls sequentially, and confirm with the user before generating large batches, since each call spends their plan quota.
