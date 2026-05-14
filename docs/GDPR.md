# GDPR / privacy — Ap v1

Public-facing device processing speech in the EU. Treat this as a real obligation from day 1, not a deployment-day afterthought.

## What we collect

- **Live audio**: streamed to the voice provider (Gemini or OpenAI) during an active conversation. **Not stored** by us. Provider retention follows their EU data-processing terms.
- **Anonymized event log** (SQLite on the kiosk): counter, timestamp, detected language, scenario id, duration, whether QR was shown, whether the coupon phrase was uttered. **No raw audio, no full transcripts, no PII.**
- **Attract clip plays**: a count per clip per day. No visitor data.

## What we do NOT collect (v1)

- No camera input.
- No raw audio storage.
- No persistent identifiers across conversations — every conversation is fresh, Ap has no cross-visit memory.

## Required signage (visible at the kiosk)

ES (primary): "Conversaciones procesadas por IA. No se graban audio ni imágenes. Más info: cggalleries.com/privacidad"

EN/RU/CA equivalents under or via QR.

## Data-subject requests

Because there's no PII stored, there's effectively nothing to surface in a SAR. The privacy page on cggalleries.com should still describe the device and what its providers do with audio.

## v2 changes that need a privacy re-review

- AI-selfie (camera input).
- Any persistent identifier (loyalty card, returning-visitor recognition).
- Linking conversation logs to payments or CRM.

Re-do the DPIA before any of these ship.
