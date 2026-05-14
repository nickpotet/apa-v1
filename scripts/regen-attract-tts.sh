#!/usr/bin/env bash
# Regenerates attract-mode TTS clips from audio/attract_phrases.json.
# Uses ElevenLabs eleven_multilingual_v2 + Callum voice (Husky Trickster).
# Cost: ~$0.30 per full regen (24 clips, ~4K chars total).
#
# Usage:
#   ELEVENLABS_API_KEY=sk-... ./scripts/regen-attract-tts.sh
#   # or set ELEVENLABS_API_KEY in your shell environment.
#
# Output: audio/attract/{es,en,ru,ca}/<id>.mp3  (commit after running)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/_gen-elevenlabs.mjs"

if [[ -z "${ELEVENLABS_API_KEY:-}" ]]; then
  echo "ERROR: ELEVENLABS_API_KEY is not set." >&2
  exit 1
fi

# Pass key into the Node script via env; script reads it if present
ELEVENLABS_API_KEY="$ELEVENLABS_API_KEY" node "$SCRIPT"

echo ""
echo "Commit the new .mp3 files:"
echo "  git add audio/attract && git commit -m 'chore: regen attract TTS clips'"
