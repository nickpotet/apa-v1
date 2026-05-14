# 7-Day Build Plan — Ap v1

Start: 2026-05-14. End: 2026-05-20. Stage 1 deploys to Nick's home; gallery rollout follows after a stable home run.

Each day has a **definition of done** (`DoD`). Don't move on until DoD is met or explicitly deferred.

---

## Day 1 — Content & scaffold (2026-05-14)

- Finalize [config/ap_persona.md](../config/ap_persona.md) with Nick (artist names, coupon, staff name).
- Fill real values in [config/pricing.json](../config/pricing.json) and [config/gallery_faq.json](../config/gallery_faq.json) — replace every `TODO: confirm with Nick`.
- Scaffold `/kiosk` with Vite + React + TS + Tailwind. Scaffold `/server` with Express + better-sqlite3.
- Decide one Rive art style direction (rough sketch ok).

**DoD:** repo builds, both kiosk and server start with `npm run dev`, no real LLM call yet.

---

## Day 2 — Kiosk screen

- Portrait React layout: penguin canvas center, large `talkButton` bottom, six scenario hint chips, QR block, status indicator (`idle` / `listening` / `thinking` / `speaking`).
- All UI strings read from [config/languages.json](../config/languages.json).
- Tailwind theme — high contrast, readable outdoors, large hit targets.

**DoD:** open `localhost:5173` in Chrome `--kiosk`, see the full UI in ES, no animation yet (static penguin placeholder ok).

---

## Day 3 — Voice (Gemini Flash Live)

- `kiosk/src/voice/providers/VoiceProvider.ts` — interface: `start(opts)`, `stop()`, events `onListening | onThinking | onSpeakingStart | onSpeakingEnd | onTranscript | onError | onLanguageDetected | onTimeoutNearing`.
- `kiosk/src/voice/providers/gemini.ts` — first adapter against Gemini 3.1 Flash Live.
- `kiosk/src/audio/inputs/InputSource.ts` — interface: events `onTalkStart | onTalkEnd | onError`. Day-3 implementation: `ArcadeButtonMic` (USB cardioid + button), since the handset rig isn't here yet.
- Wire button-press → `InputSource` → `VoiceProvider` → output through default speaker.
- 60-second hard cap enforced in `VoiceProvider`.
- System prompt = `ap_persona.md` + injected `pricing.json` + `gallery_faq.json` + `sales_scenarios.json` summaries.

**DoD:** hold button, ask "what time do you open" in ES/EN/RU/CA, get a 2–4 sentence reply in the right language with correct hours.

---

## Day 4 — Rive animation

- One artboard `Ap`, one state machine `ApState`, six states (see CLAUDE.md).
- Data-binding inputs: `state` (enum), `isSpeaking` (bool), `language` (enum).
- `kiosk/src/rive/ApDriver.tsx` — subscribes to `VoiceProvider` events and updates inputs.
- Replace static placeholder with the Rive canvas.

**DoD:** penguin visibly transitions through `idle → listening → thinking → speaking → idle` during a real conversation, beak opens/closes while audio plays.

---

## Day 5 — Sales scenarios + attract mode

- Six hint chips on screen → tapping a chip sends a synthetic transcript to `VoiceProvider` ("the visitor asked X") and triggers the matching scenario from [sales_scenarios.json](../config/sales_scenarios.json).
- `scripts/regen-attract.ts` — Node script: reads attract phrase list (per language), calls a TTS API once, saves `.mp3` files to `/audio/attract/{lang}/`. Run manually, commit results.
- `kiosk/src/attract/AttractLoop.ts` — local random playback every 30–90s when idle, drives `excited` Rive state during the clip. **Never** calls a paid API at runtime.

**DoD:** screen idles, plays an attract clip every minute in a random enabled language, penguin reacts; tapping a chip starts a real conversation in the matching scenario; full loop works offline.

---

## Day 6 — Backend + kiosk-hardening + lead capture

- `/server` endpoints:
  - `GET /config` — bundles all `/config/*.json` for the kiosk.
  - `POST /token` — mints an ephemeral voice-API token, enforces daily $-cap.
  - `POST /log` — anonymized event log to SQLite: counter, language, scenario, duration, qrShown, couponMentioned. **No raw audio, no full transcripts** — just summary fields.
  - `GET /attract-manifest` — list of available attract clips.
- `/scripts/kiosk-setup.sh` (macOS dev) and `/scripts/kiosk-setup-linux.sh` (target hardware): Chrome `--kiosk` autostart, watchdog (restart on crash), 04:00 reboot cron, screen-saver disabled.
- Offline fallback: if `/token` fails or network is down, kiosk shows `offlineFallback` string and keeps attract loop running.
- QR codes: WhatsApp, Instagram, Google Reviews, coupon-mention reminder.

**DoD:** unplug ethernet → screen keeps attract loop, says offline fallback when button held; plug it back → conversations resume. Reboot mini-PC → kiosk auto-launches in <30s.

---

## Day 7 — Hardware bake-off + OpenAI Realtime swap

- Build the second `InputSource`: `TelephoneHandset` (hookswitch wired to a GPIO/USB adapter as a momentary button).
- Implement `kiosk/src/voice/providers/openaiRealtime.ts` — swap via env var `VOICE_PROVIDER=openai`.
- Field test at Nick's place mimicking gallery acoustics (open window, traffic noise, music):
  - Side-by-side test: handset vs cardioid+button, both with Gemini and with OpenAI Realtime.
  - Measure: ASR error rate, latency to first audio, conversation completion %, conversions (QR scan/coupon mention).
- Pick the production combination. Update CLAUDE.md with the decision.

**DoD:** documented winner for (input hardware × voice provider) in `docs/HARDWARE.md`, and the kiosk runs unattended at Nick's place for 24h with no manual restart.

---

## Day 8+ (out of v1 scope, parked)

- Move to gallery, GDPR sign, sticker QR placement test.
- AI-selfie / AR pingüino / payments / multi-device.
- 3D upgrade only if v1 has measurable conversion lift sustained for 2+ weeks.
