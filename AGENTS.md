# Ap — Penguin Kiosk Mascot

Vertical-screen public-facing AI kiosk for **cggalleries.com** — a penguin-themed Virtual Reality exhibition at **Carrer Sant Romà 12, Lloret de Mar (Girona)**. A stylized 3D penguin named **Apa** (a Three.js/GLB model) speaks ten languages (ES/EN/RU/CA/FR/DE/UK/SR/IT/PL) at the street kiosk and in the QR-triggered in-exhibition *guide* mode, and converts curiosity into ticketed walk-ins. v1 is in production at the venue.

**Important framing:** cggalleries.com is *not* an art gallery. It is a penguin VR exhibition with ticket tiers from €0 (under 5) to €35 (family) to a Maxi €22 package (5 VR episodes + Ice Cube Challenge + audio tale). Ap lives there — he's home, not lost.

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind. In production it runs in the WebView of an Android touch panel at the venue; `scripts/ap-kiosk.sh` is the alternative Chromium `--kiosk` launcher for a Linux mini-PC. The kiosk reloads itself into each new deploy once idle (`src/config/autoUpdate.ts`, polls `/api/version`).
- **Animation:** Three.js + a rigged **GLB** model (`kiosk/public/Apa_kiosk_animated.glb`), driven by `src/rive/ApaDriver.tsx`. `KioskState` maps to named GLB animation clips; the renderer caps DPR (1.35) + FPS (30, 0.5 when hidden), uses `powerPreference: 'low-power'`, and reloads on `webglcontextlost` — all to survive low-power kiosk hardware. (Legacy Rive `@rive-app/react-canvas` has been removed.)
- **Voice engine:** `VoiceProvider` abstraction, single provider family (**Gemini** via `@google/genai`). Two adapters: `GeminiVoiceProvider` (realtime **Live API**, default for street kiosk, uses an ephemeral token from `/api/token`) and `GuidePipelineProvider` (turn-based STT→LLM→TTS via `POST /api/guide-turn`, used in guide mode). OpenAI/demo adapters were removed in v1. The Live adapter waits for the server's `setupComplete` before streaming, and on quota exhaustion or a stalled model fails over along `LIVE_MODEL_CHAIN` (`src/voice/liveModelFailover.ts`), then to the pipeline.
- **Audio input:** on the touch panel the on-screen `TalkButton` is the input. Touch = tap-to-talk (`TalkMode` `'toggle'`): a second tap ends the turn, or `src/audio/endOfSpeech.ts` ends it after 1.2 s of silence (15 s listening cap) — visitors rarely tap twice. Mouse / Space / arcade button = press-and-hold (`'hold'`), never auto-ended. `ArcadeButtonMic` (Space-key sim) and `TelephoneHandset` implement the `InputSource` abstraction for physical hardware.
- **Backend:** **Cloudflare Pages + Pages Functions** (`functions/api/*`) is production: mints ephemeral Gemini tokens (`/api/token`), runs the guide pipeline (`/api/guide-turn`), logs anonymized events to **D1** (`apa_voice_logs`). Local dev: `npm run dev` runs Vite plus `wrangler pages dev` on `127.0.0.1:8787` — the **same Functions as production** (secrets from `.env` / `.env.local`). The old Express dev server was removed in 1.0.9.
- **Hardware:** venue kiosk is an Android touch panel (US717U_TC, Android 12 WebView, portrait). The original plan was an Intel N100 mini-PC + 50–55" screen; its launch scripts remain in `/scripts`.

## Non-negotiable rules

1. **Idle mode never calls a paid API.** Idle speech is disabled (the AttractLoop was removed); the six scenario chips play pre-baked clips from `kiosk/public/audio/chips/{lang}/`. Only a visitor-started conversation hits the realtime API. (`/audio/attract/` holds older teaser clips, unused at runtime.)
2. **Production is Cloudflare Pages; local dev runs the same Functions via `wrangler pages dev`.** No Railway/Render. D1 (`apa_voice_logs`) holds anonymized logs only. On internet outage → fall back to attract loop + the `ConnectionFallback` QR card ("ven a verme dentro"). Never show a broken screen.
3. **Voice engine and audio input are swappable.** Client-side: no Gemini SDK calls outside `kiosk/src/voice/providers/`, no direct mic/handset access outside `kiosk/src/audio/inputs/`. Server-side Gemini calls are confined to `functions/api/` (Pages Functions) — these legitimately import `@google/genai`. PR-level guard: a `@google/genai` import in kiosk app code outside the providers folder is a bug.
4. **Conversation hard-cap: 60–90 seconds.** Enforced client-side (`VoiceProvider` config, `maxConversationSeconds: 75`; tap-to-talk listening also ends on silence / at 15 s). **Server-side enforcement is not implemented:** `functions/api/token.ts` mints a token for any caller, with no session or daily $-cap — a known gap, deliberately deferred.
5. **Never invent facts.** Prices, hours, services come from `/config/*.json`. If a fact is missing, Ap redirects to **Natalia** (the real receptionist) — never fabricates. **Never invent reward phrases** either; the only real reward mechanic is the magnet-for-story/review described in `pricing.json`.
6. **Privacy.** No raw audio stored. Logs hold anonymized transcript text + counters only. Public-facing GDPR sign required when deployed on the street (see `docs/GDPR.md`).
7. **No burn-in.** No fully static UI region; penguin always breathes; hint chips rotate slowly. Nightly low-brightness `sleeping` state.
8. **Version every change.** `config/app_version.json` is the source of truth. After any code, config, prompt, content, or asset change, run `npm run version:bump` exactly once before verification or deployment. Logs and conversation exports must include this version.

## Animation states (GLB clips)

Rendering moved from Rive to a Three.js/GLB model. `KioskState` (`src/types.ts`) maps to named animation clips in `Apa_kiosk_animated.glb` via `STATE_ANIM` in `src/rive/ApaDriver.tsx`. The six logical states below still hold; `error`/`capped`/`offline`/`preparing` reuse existing clips. **No phoneme lip-sync** — the `speaking` clip loops while audio plays. UI language covers all ten languages; UI copy lives in `kiosk/src/config/venueConfig.ts` (the single source — `config/languages.json` only lists the enabled set).

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
  src/config/            venueConfig (UI copy), appVersion, autoUpdate
  src/i18n/              ES/EN/RU/CA(/FR in guide) copy + language detection glue
/functions/api  Cloudflare Pages Functions (prod + local dev): token, guide-turn, log, health, admin/*
                (static /api/config and /api/version are generated by scripts/build-pages-config.mjs)
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
- A daily $-cap in the token endpoint is planned but **not implemented**. On the free Gemini tier, per-model quota exhaustion is absorbed client-side by the Live-model failover.

## Ops

- **Deploy:** `npm run deploy:pages` (needs `CLOUDFLARE_API_TOKEN`, kept in `.dev.vars.cloudflare`). The venue kiosk picks the deploy up by itself within ~5 min of idle.
- **Diagnostics:** `?debug=1` shows an on-screen panel with a copy-all button. Every turn is logged to D1 with per-event timing, mic levels and socket close codes; read them via `GET /api/admin/conversations` (Bearer `ADMIN_LOG_TOKEN`) or `npm run sync:voice-logs`. Diagnose from these logs before guessing.
- **Tests:** `npm run test:end-of-speech` (real recorded speech through the detector), `test:languages`, `test:entrance-cadence`, `check:languages`.

## Working style for Codex

- Treat each module as its own task: `VoiceProvider` interface + one adapter, then the GLB driver (`ApaDriver`), then `InputSource`, then kiosk-hardening. Don't mega-edit across all layers in one go.
- When adding a feature that reads config, update the example config in `/config/` in the same change.
- Never fabricate gallery data. Missing price/hour/service → leave `"TODO: confirm with Nick"` literal in the JSON and surface it in your reply.
- Prefer editing existing files. v1 has no abstractions for hypothetical v2 features (AI-selfie, AR, payments) — don't build hooks for them.
