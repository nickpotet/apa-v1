# Ap — Penguin Kiosk Mascot

Vertical-screen public-facing AI kiosk for **cggalleries.com** — a penguin-themed Virtual Reality exhibition at **Carrer Sant Romà 12, Lloret de Mar (Girona)**. A stylized 3D penguin named **Apa** (a Three.js/GLB model) speaks in ES/EN/RU/CA — plus FR in the QR-triggered in-exhibition *guide* mode — draws passersby with a local attract-loop, and converts curiosity into ticketed walk-ins. v1 is a 7-day MVP deployed to Nick's home first, then to the venue.

**Important framing:** cggalleries.com is *not* an art gallery. It is a penguin VR exhibition with ticket tiers from €0 (under 5) to €35 (family) to a Maxi €22 package (5 VR episodes + Ice Cube Challenge + audio tale). Ap lives there — he's home, not lost.

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind. Runs fullscreen in Chrome `--kiosk`.
- **Animation:** Three.js + a rigged **GLB** model (`kiosk/public/Apa_kiosk_animated.glb`), driven by `src/rive/ApaDriver.tsx`. `KioskState` maps to named GLB animation clips; the renderer caps DPR (1.35) + FPS (30, 0.5 when hidden), uses `powerPreference: 'low-power'`, and reloads on `webglcontextlost` — all to survive the N100. (Legacy Rive `@rive-app/react-canvas` has been removed.)
- **Voice engine:** `VoiceProvider` abstraction, single provider family (**Gemini** via `@google/genai`). Two adapters: `GeminiVoiceProvider` (realtime **Live API**, default for street kiosk, uses an ephemeral token from `/api/token`) and `GuidePipelineProvider` (turn-based STT→LLM→TTS via `POST /api/guide-turn`, used in guide mode). OpenAI/demo adapters were removed in v1.
- **Audio input:** `InputSource` abstraction. `ArcadeButtonMic` (USB cardioid + arcade button) is the active adapter; `TelephoneHandset` is a documented alternative. Hardware decision deferred.
- **Backend:** **Cloudflare Pages + Pages Functions** (`functions/api/*`) is production: mints ephemeral Gemini tokens (`/api/token`), runs the guide pipeline (`/api/guide-turn`), logs anonymized events to **D1** (`apa_voice_logs`). Local dev uses a **Node + Express** server (`/server`, `127.0.0.1:8787`, proxied by Vite) — dev only, not deployed.
- **Hardware:** Intel N100 mini-PC, 50–55" vertical screen, loud speaker, audio-input rig (TBD day 7).

## Non-negotiable rules

1. **Attract mode never calls a paid API.** All idle/teaser phrases live as pre-baked TTS audio files under `/audio/attract/{es,en,ru,ca}/`. Idle loop = local random playback. Only post-trigger conversation hits the realtime API.
2. **Production is Cloudflare Pages; local dev is the Express server.** No Railway/Render. D1 (`apa_voice_logs`) holds anonymized logs only. On internet outage → fall back to attract loop + the `ConnectionFallback` QR card ("ven a verme dentro"). Never show a broken screen.
3. **Voice engine and audio input are swappable.** Client-side: no Gemini SDK calls outside `kiosk/src/voice/providers/`, no direct mic/handset access outside `kiosk/src/audio/inputs/`. Server-side Gemini calls are confined to `functions/api/` (Pages Functions) — these legitimately import `@google/genai`. PR-level guard: a `@google/genai` import in kiosk app code outside the providers folder is a bug.
4. **Conversation hard-cap: 60–90 seconds.** Enforced client-side (`VoiceProvider` config, `maxConversationSeconds: 75`) and server-side (the token endpoint refuses new sessions when the cap or daily $-cap is hit).
5. **Never invent facts.** Prices, hours, services come from `/config/*.json`. If a fact is missing, Ap redirects to **Natalia** (the real receptionist) — never fabricates. **Never invent reward phrases** either; the only real reward mechanic is the magnet-for-story/review described in `pricing.json`.
6. **Privacy.** No raw audio stored. Logs hold anonymized transcript text + counters only. Public-facing GDPR sign required when deployed on the street (see `docs/GDPR.md`).
7. **No burn-in.** No fully static UI region; penguin always breathes; hint chips rotate slowly. Nightly low-brightness `sleeping` state.
8. **Version every change.** `config/app_version.json` is the source of truth. After any code, config, prompt, content, or asset change, run `npm run version:bump` exactly once before verification or deployment. Logs and conversation exports must include this version.

## Animation states (GLB clips)

Rendering moved from Rive to a Three.js/GLB model. `KioskState` (`src/types.ts`) maps to named animation clips in `Apa_kiosk_animated.glb` via `STATE_ANIM` in `src/rive/ApaDriver.tsx`. The six logical states below still hold; `error`/`capped`/`offline`/`preparing` reuse existing clips. **No phoneme lip-sync** — the `speaking` clip loops while audio plays. UI language covers `es | en | ru | ca | fr`.

States:
- `idle` — slow breathing, occasional blink. Default in attract.
- `listening` — head tilted, eyes wide. While button held / handset off-hook.
- `thinking` — looking up, tapping flipper. While waiting on first model token.
- `speaking` — beak open/close on `isSpeaking`. Active while audio plays.
- `excited` — jump, wave. Triggered by attract teaser and by conversion events (QR scanned, coupon shown).
- `sleeping` — dim, slow breathing. Triggered by night schedule.

## Repo layout

```
/kiosk          React + Vite frontend (the screen)
  src/voice/providers/   gemini (realtime Live) + guidePipeline adapters; shared VoiceProvider interface
  src/audio/inputs/      ArcadeButtonMic (active), TelephoneHandset (alt); shared InputSource interface
  src/rive/              Three.js/GLB driver (ApaDriver) — folder name is legacy
  src/ui/                React components (KioskScreen, GuideScreen, ConnectionFallback, DebugPanel)
  src/i18n/              ES/EN/RU/CA(/FR in guide) copy + language detection glue
/functions/api  Cloudflare Pages Functions (prod): token, guide-turn, log, admin/*
/server         Node + Express — local dev API only (proxied by Vite), not deployed
  routes/                /config, /token, /log, /attract-manifest
  data/                  SQLite (gitignored, dev only; prod logs to D1)
/config         ap_persona.md, pricing.json, gallery_faq.json, sales_scenarios.json, languages.json
/audio
  /attract/{es,en,ru,ca}/   Pre-baked idle clips (committed, ~1–3MB total)
  /_masters/                TTS source scripts (gitignored, regenerated)
/migrations     D1 schema migrations
/scripts        Kiosk-hardening + build-pages-config + sync-voice-logs
/docs           PLAN.md, HARDWARE.md, KIOSK_SETUP.md, GDPR.md
```

## Persona (one-paragraph summary)

Apa is a curious, mischievous penguin who **lives** at the cggalleries.com VR exhibition in Lloret de Mar. He speaks like a charming kid — **2–4 sentences, ≤25 seconds aloud, never lectures**. He's proud of the VR episodes, the photo zone, and the toy shop, and excited to show them off. He never claims to be human, never gives medical/legal/political opinions, and gently redirects off-topic chats back to the exhibition. His goal in every conversation is to nudge the visitor through the door, ideally onto a VR headset. **No invented coupon phrases** — the only real reward is a free magnet at the front desk for an Instagram story (tagged) or a public review. Full persona in [config/ap_persona.md](config/ap_persona.md).

## Cost discipline

- Realtime API budget assumption: **$50–200/mo** at moderate traffic, with pre-baked attract + 60–90s cap. If sustained traffic pushes this past ~$300/mo, the cost lever is to move the kiosk from the realtime Live adapter to the cheaper turn-based `GuidePipelineProvider` (one transcribe+answer call + one TTS call per turn).
- The token endpoint enforces a daily $-cap. When hit: new conversations get a pre-recorded "vuelve en un rato, mientras tanto entra a verme" + QR.

## Working style for Claude Code

- Treat each module as its own task: `VoiceProvider` interface + one adapter, then the GLB driver (`ApaDriver`), then `InputSource`, then kiosk-hardening. Don't mega-edit across all layers in one go.
- When adding a feature that reads config, update the example config in `/config/` in the same change.
- Never fabricate gallery data. Missing price/hour/service → leave `"TODO: confirm with Nick"` literal in the JSON and surface it in your reply.
- Prefer editing existing files. v1 has no abstractions for hypothetical v2 features (AI-selfie, AR, payments) — don't build hooks for them.
