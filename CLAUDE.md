# Ap — Penguin Kiosk Mascot

Vertical-screen public-facing AI kiosk for **cggalleries.com** — a penguin-themed Virtual Reality exhibition at **Carrer Sant Romà 12, Lloret de Mar (Girona)**. A stylized Rive penguin named **Apa** speaks in ES/EN/RU/CA, draws passersby with a local attract-loop, and converts curiosity into ticketed walk-ins. v1 is a 7-day MVP deployed to Nick's home first, then to the venue.

**Important framing:** cggalleries.com is *not* an art gallery. It is a penguin VR exhibition with ticket tiers from €0 (under 5) to €32 (family) to a Maxi €22 package (5 VR episodes + Ice Cube Challenge + audio tale). Ap lives there — he's home, not lost.

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind. Runs fullscreen in Chrome `--kiosk`.
- **Animation:** Rive (`@rive-app/react-canvas`) — one artboard `Ap`, one state machine `ApState`, six states (see below).
- **Voice engine:** `VoiceProvider` abstraction. Default adapter: **Gemini 3.1 Flash Live** (free tier, used through day 6). Production adapter: **OpenAI GPT-Realtime-2**, swapped in for the day-7 field test. ElevenLabs Agents is a documented fallback, not implemented in v1.
- **Audio input:** `InputSource` abstraction. Two adapters built in parallel and tested side-by-side on day 7: `TelephoneHandset` (hookswitch = push-to-talk) and `ArcadeButtonMic` (USB cardioid + arcade button). Hardware decision deferred.
- **Backend:** Node + Express on `localhost` of the kiosk mini-PC. Serves config, mints ephemeral voice-API tokens, logs anonymized events to SQLite. **Never deployed to cloud.**
- **Hardware:** Intel N100 mini-PC, 50–55" vertical screen, loud speaker, audio-input rig (TBD day 7).

## Non-negotiable rules

1. **Attract mode never calls a paid API.** All idle/teaser phrases live as pre-baked TTS audio files under `/audio/attract/{es,en,ru,ca}/`. Idle loop = local random playback. Only post-trigger conversation hits the realtime API.
2. **Backend runs locally.** No Railway, no Render, no cloud DB. On internet outage → fall back to attract loop + "ven a verme dentro" + QR. Never show a broken screen.
3. **Voice engine and audio input are swappable.** No OpenAI/Gemini SDK calls outside `kiosk/src/voice/providers/`. No direct mic/handset/hookswitch access outside `kiosk/src/audio/inputs/`. PR-level guard: imports of `openai` / `@google/genai` outside the providers folder are a bug.
4. **Conversation hard-cap: 60–90 seconds.** Enforced both client-side (`VoiceProvider` config) and server-side (Express rejects new sessions when cap or daily $-cap is hit).
5. **Never invent facts.** Prices, hours, services come from `/config/*.json`. If a fact is missing, Ap redirects to **Natalia** (the real receptionist) — never fabricates. **Never invent reward phrases** either; the only real reward mechanic is the magnet-for-story/review described in `pricing.json`.
6. **Privacy.** No raw audio stored. Logs hold anonymized transcript text + counters only. Public-facing GDPR sign required when deployed on the street (see `docs/GDPR.md`).
7. **No burn-in.** No fully static UI region; penguin always breathes; hint chips rotate slowly. Nightly low-brightness `sleeping` state.

## Rive state machine `ApState`

Inputs:
- `state` (enum): `idle | listening | thinking | speaking | excited | sleeping`
- `isSpeaking` (bool): toggled by `VoiceProvider` audio-output events; drives beak open/close on the `speaking` state. **No phoneme lip-sync** — just open-on-amplitude.
- `language` (enum): `es | en | ru | ca` — drives an optional flag/accessory accent.

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
  src/voice/providers/   Gemini, OpenAI Realtime adapters; shared VoiceProvider interface
  src/audio/inputs/      TelephoneHandset, ArcadeButtonMic adapters; shared InputSource interface
  src/rive/              Rive bindings, state-machine driver
  src/ui/                React components
  src/i18n/              ES/EN/RU/CA copy + language detection glue
/server         Node + Express local service
  routes/                /config, /token, /log, /attract-manifest
  data/                  SQLite (gitignored)
/config         ap_persona.md, pricing.json, gallery_faq.json, sales_scenarios.json, languages.json
/audio
  /attract/{es,en,ru,ca}/   Pre-baked idle clips (committed, ~1–3MB total)
  /_masters/                TTS source scripts (gitignored, regenerated)
/rive           .riv source files
/scripts        Kiosk-hardening: autostart, watchdog, nightly reboot, attract-clip TTS regen
/docs           PLAN.md, HARDWARE.md, KIOSK_SETUP.md, GDPR.md
```

## Persona (one-paragraph summary)

Apa is a curious, mischievous penguin who **lives** at the cggalleries.com VR exhibition in Lloret de Mar. He speaks like a charming kid — **2–4 sentences, ≤25 seconds aloud, never lectures**. He's proud of the VR episodes, the photo zone, and the toy shop, and excited to show them off. He never claims to be human, never gives medical/legal/political opinions, and gently redirects off-topic chats back to the exhibition. His goal in every conversation is to nudge the visitor through the door, ideally onto a VR headset. **No invented coupon phrases** — the only real reward is a free magnet at the front desk for an Instagram story (tagged) or a public review. Full persona in [config/ap_persona.md](config/ap_persona.md).

## Cost discipline

- Realtime API budget assumption: **$50–200/mo** at moderate traffic, with pre-baked attract + 60–90s cap. If sustained traffic ≥200 conversations/day pushes this past $300/mo, switch the prod `VoiceProvider` from OpenAI Realtime → Gemini Flash Live.
- Local Express enforces a daily $-cap. When hit: new conversations get a pre-recorded "vuelve en un rato, mientras tanto entra a verme" + QR.

## Working style for Claude Code

- Treat each module as its own task: `VoiceProvider` interface + one adapter, then Rive driver, then `InputSource`, then kiosk-hardening. Don't mega-edit across all layers in one go.
- When adding a feature that reads config, update the example config in `/config/` in the same change.
- Never fabricate gallery data. Missing price/hour/service → leave `"TODO: confirm with Nick"` literal in the JSON and surface it in your reply.
- Prefer editing existing files. v1 has no abstractions for hypothetical v2 features (AI-selfie, AR, payments) — don't build hooks for them.
