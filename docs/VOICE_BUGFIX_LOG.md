# Voice Bugfix Log

This file is the working memory for Apa voice fixes. Keep it factual: what changed, why, test result, and follow-up.

## 2026-06-26 — Guide language/context loss

### Problem
- Guide mode can lose language and context after 1-2 turns.
- Production logs showed turns where the user transcript was Russian, but the Live response started in Spanish because the session had already started with `initialLanguage: es` and `languageLock: null`.
- Production logs also showed guide turns with valid Russian user transcripts but no first audio response before timeout.

### Working hypothesis
- Gemini Live is the wrong first step for guide mode because generation starts before language and transcript are deterministic.
- The guide prompt is large, which likely increases first-audio failures and stale-instruction behavior.
- The local language detector currently treats fallback as detection, so unknown short phrases can inherit the previous language incorrectly.

### Fix attempt 1
- Build a deterministic guide pipeline for `/guide`: record audio first, then send complete PCM to a server endpoint.
- Server endpoint should transcribe audio, choose/lock language from transcript, generate text, then generate one TTS audio response.
- Keep the existing Gemini Live provider for kiosk entrance mode until guide pipeline is verified.

### Expected result
- Guide answers should not start in the previous/default language.
- Short confirmations should preserve context via the prompt/context passed after transcription.
- If a model step fails, diagnostics should show which stage failed instead of leaving only "thinking".

### Files changed in attempt 1
- Added `functions/api/guide-turn.ts`: server-side deterministic guide turn endpoint.
- Added `kiosk/src/voice/providers/guidePipeline.ts`: client provider that records PCM, posts it to `/api/guide-turn`, and plays the returned PCM audio.
- Updated `kiosk/src/voice/providers/VoiceProvider.ts`: optional `requiresToken` and `warmupAudio` flags.
- Updated `kiosk/src/App.tsx`: `/guide` uses `GuidePipelineProvider`; kiosk entrance mode still uses `GeminiVoiceProvider`.

### Verification notes
- First `npm run typecheck` failed because `GeminiVoiceProvider` did not explicitly expose `requiresToken`.
- Fixed by adding `requiresToken = true` to `GeminiVoiceProvider`.
- `npm run typecheck` passed after the provider interface fix.
- `npm run build:pages` passed; current local bundle: `index-CF-b6gVt.js`.
- `functions/api/guide-turn.ts` was typechecked separately with the kiosk TypeScript compiler because Pages Functions are not included in the normal repo typecheck.
- Local `wrangler pages dev` runtime test passed for `/api/guide-turn` with `languageLock: ru`: response stayed Russian and returned PCM TTS audio.
- A silent PCM test initially produced a bogus `"Hello"` transcript from STT, so the endpoint now checks raw PCM peak before transcription and returns a repeat prompt when input is effectively silent.
- Silent PCM retest passed: `transcript: ""`, `language: ru`, text: `Прости, я не расслышал. Повторишь еще раз?`, audio present.
- Wrangler reported `_redirects` loop warnings for `/guide` rewrites. Changed `kiosk/public/_redirects` to `/guide /guide/ 302` plus `/guide/* / 200`.
- Local route check passed: `/`, `/guide/`, `/guide/?hall=4`, and `/guide/hall-4` all return HTML 200 in Pages dev.
- Production deploy completed and production alias served `assets/index-CF-b6gVt.js`.
- Production smoke test passed for `/`, `/guide/`, `/guide/?hall=4`, and silent `/api/guide-turn`.
- Synthetic Russian speech test uncovered a serious transcription issue: Gemini `generateContent` misread raw `audio/pcm;rate=16000` as `"Hello"` / unrelated text, while the same generated speech in an audio container transcribed as Russian.
- Fixed by wrapping captured PCM16 into a WAV container inside `functions/api/guide-turn.ts` before the transcription request. TTS playback still returns raw PCM for the existing AudioWorklet.
- Local synthetic RU retest after WAV conversion correctly detected `ru`, but answer text was cut (`"Привет! О, четвер"`).
- Root cause: `gemini-2.5-flash` hidden thinking consumed the small `maxOutputTokens` budget in the answer step.
- Fixed by setting `thinkingConfig.thinkingBudget = 0` for transcribe/answer and increasing answer `maxOutputTokens` to 360.
- Local synthetic RU retest passed after thinking fix: transcript `Привет, расскажи про четвёртый`, language `ru`, full answer about Hall 4, audio present.
- Final production deploy completed: `https://518adc1e.apa-v1.pages.dev`, production alias `https://apa-v1.pages.dev` serves `assets/index-CF-b6gVt.js`.
- Production synthetic RU retest passed: `/api/guide-turn` returned language `ru`, transcript `Привет, расскажи про четвёртый`, full Russian Hall 4 answer, and TTS audio.

## 2026-06-26 — Guide pipeline quota failure

### Problem
- User reported the fix still did not work.
- Fresh production logs showed new `Gemini Guide Pipeline` was active and first guide turns worked.
- Later guide turns failed with `429 RESOURCE_EXHAUSTED`: free-tier quota exceeded for `gemini-2.5-flash`, limit 20 generateContent requests/day.
- The first deterministic pipeline used up to 3 generateContent calls per visitor turn: transcribe, answer, TTS.

### Fix attempt 2
- Collapse guide transcribe+answer into one `gemini-3.1-flash-lite` request that returns JSON: transcript, language, answer.
- Keep TTS as the second call only when quota allows.
- If TTS fails or returns no audio, return text anyway; the client now falls back to browser `speechSynthesis` instead of failing the whole turn.
- This changes normal guide cost from 3 model requests to 2, and avoids the exhausted `gemini-2.5-flash` quota for the answer/transcription step.

## 2026-06-26 — Guide latency and timeout

### Problem
- Local runtime test after attempt 2 returned correct Russian guide answer and TTS, but took about 33 seconds.
- Client guide mode still used the generic 20s thinking timeout, so real visitors could see an error before the server response arrived.
- `guideSystemPrompt` was about 32.6k characters because it embedded the full audio guide and the general entrance prompt.

### Fix attempt 3
- Rebuilt `guideSystemPrompt` in `scripts/build-pages-config.mjs` as a compact guide-specific prompt with official summaries for halls 1-4, special stand, fast answers, core persona, ticket/facility/VR facts, and silence rules.
- Removed full audio guide dump from runtime guide prompt.
- Added a guide-specific thinking timeout of 45s while keeping kiosk mode at 20s.
- Clear thinking timeout when `guide_pipeline_response_ready` or browser TTS fallback starts, not only when AudioWorklet playback starts.
- Compact prompt reduced guide prompt from about 32.6k chars to about 7.7k chars.
- Local synthetic RU runtime test after compaction returned in about 4.1s with correct `ru` transcript and Hall 4 answer.
- Gemini TTS quota was also exhausted (`gemini-2.5-flash-tts`, free-tier limit 10/day). Server TTS is now disabled by default via `GUIDE_TTS_MODE=browser` behavior, so guide mode returns text quickly and the browser speaks it with `speechSynthesis`.
- Local silence test now returns in ~8ms with repeat text and browser-TTS fallback.
- Production deploy completed: `https://e741aa83.apa-v1.pages.dev`.
- Production alias serves `assets/index-BuHMyjI4.js`.
- Production config check: guide prompt is 7668 chars.
- Production synthetic RU guide-turn returned in about 3.1s: transcript `Привет, Апа, расскажи про четвертый зал.`, language `ru`, correct Hall 4 answer, no server audio, `ttsError: server_tts_disabled_browser_fallback`.

## 2026-06-26 — Deterministic language state

### Fix attempt 4
- Added `detectLanguageDetailed()` with `strong` vs `fallback` confidence.
- App no longer treats fallback as a real detected language.
- Added `?lang=es|en|ru|ca|fr` support. URL language becomes the initial UI language and a hard language lock for that page session.
- Auto-lock language for the 30s visitor session only when user transcript detection is strong.
- After 30s context expiry, language resets to URL language if present, otherwise Spanish.
- Gemini Live provider now emits `provider_language_detection_detail` diagnostics with confidence.
- `npm run typecheck`, `npm run build:pages`, and standalone Pages Function typecheck passed. Local bundle after this change: `index-CsdsLb5D.js`.
- Production deploy completed: `https://6b4dc162.apa-v1.pages.dev`.
- Production alias serves `assets/index-CsdsLb5D.js`.
- Production route check passed for `/`, `/guide/`, `/guide/?hall=4`, and `/guide/?hall=4&lang=ru`.
- Production config check: guide prompt remains 7668 chars.
- Production synthetic RU guide-turn returned in about 3.3s: transcript `Привет, Апа, расскажи про четвертый зал.`, language `ru`, correct Hall 4 answer, no server audio, `ttsError: server_tts_disabled_browser_fallback`.

## 2026-06-26 — Restore good guide voice

### Problem
- Browser `speechSynthesis` fallback worked around Gemini TTS quota, but voice quality is unacceptable.

### Fix attempt 5
- Guide mode now defaults back to `GeminiVoiceProvider`, which uses Gemini Live voice `Puck`.
- The deterministic guide pipeline remains available only when the URL includes `provider=pipeline`.
- This restores the good voice for normal `/guide` and `/guide/?hall=...&lang=...` usage while keeping the pipeline for diagnostics/fallback tests.
- `npm run typecheck`, `npm run build:pages`, and standalone Pages Function typecheck passed.
- Production deploy completed: `https://d10888e2.apa-v1.pages.dev`.
- Production alias serves `assets/index-C06YLHjO.js`.
- Production route check passed for `/guide/?hall=4&lang=ru` and `/guide/?hall=4&lang=ru&provider=pipeline`.

## 2026-06-26 — Adopt stability recommendations without losing good voice

### Decision
- Accepted the recommendation to harden the 3D penguin because continuous uncapped WebGL rendering is a real kiosk heat/stability risk.
- Accepted the recommendation to make voice-token/network startup failures visible as a graceful fallback instead of a generic "I can't hear" state.
- Rejected the recommendation to standardize guide mode on the deterministic pipeline for now because the current pipeline falls back to browser TTS when server TTS quota is exhausted, and the user explicitly asked to restore the good voice.

### Fix attempt 6
- Kept normal guide and kiosk voice on `GeminiVoiceProvider` / Gemini Live voice `Puck`.
- Capped Three.js rendering to DPR 1.35 and 30 FPS, with 2 FPS when the page is hidden.
- Switched the WebGL renderer to low-power preference.
- Added WebGL context loss/restoration handling that reloads the kiosk view instead of leaving a blank/broken penguin.
- Added a localized connection fallback panel for `offline` and `capped` states. It appears only during service problems and includes a QR to the gallery site.
- Voice startup failures now show the connection fallback for 8 seconds. Speech/noise recognition errors still use the normal short "I can't hear" error so silence is not mislabeled as a network outage.

### Verification notes
- `npm run typecheck` passed.
- `npm run build:pages` passed; local bundle after this change: `index-DuG2g2Hn.js`.

## 2026-06-26 — Microphone speech noise suppression

### Fix attempt 7
- Centralized microphone constraints so the permission probe and real capture request the same speech profile.
- Explicitly reapply supported `echoCancellation`, `noiseSuppression`, `autoGainControl`, and mono-channel constraints to the selected audio track.
- Mark the track as speech content and report both browser support and actual track settings in turn diagnostics.
- Added a mild 90 Hz high-pass filter before PCM conversion to reduce low-frequency rumble, handling noise, and part of wind noise without gating quiet speech.
- Deliberately avoided a client-side noise gate because it can remove quiet consonants and regress language recognition.

## 2026-06-30 — Correct ticket inclusion and gallery climate

- Fixed conflicting gallery data: standard admission includes 1 VR episode, not 2. Extra episodes are paid separately.
- Added air conditioning as an official facility fact: the gallery is kept cool, like Antarctica.
- Added a prompt guard that Apa must never describe the gallery as warm or hot inside.

## 2026-07-03 — Complete DE, UK, SR and IT support

### Language runtime
- Expanded the shared language type, URL parsing, UI state, Gemini Live instructions, guide API, browser TTS fallback and conversation confirmations to ES, EN, RU, CA, FR, DE, UK, SR and IT.
- Replaced the old Cyrillic shortcut with script markers and lexical scoring that distinguish Russian, Ukrainian and Serbian. Serbian defaults to Latin script and mirrors Cyrillic input.
- Kept manual language selection as a hard lock for the 30-second visitor session.

### UI and knowledge
- Added complete kiosk and guide interface copy for German, Ukrainian, Serbian and Italian.
- Added compact circular flags, native-language tooltips and one-row layout for all nine languages from 360 px wide.
- Localized ticket, FAQ and sales-scenario maps for all nine languages while preserving the official rule that a standard ticket includes one VR episode.
- Added 18 button responses and 6 attract phrases per language.

### Fixed audio and production packaging
- Reworked the fixed-audio generator to use Gemini voice Puck, resume from existing files, retry transient failures and reject empty output.
- Completed and validated 162 button clips and 54 attract clips.
- Added attract audio and a static `/api/attract-manifest` to the Pages build so production no longer depends on the local Express route for idle audio.

### Verification
- `npm run check:languages`: 9 languages, 162 button clips and 54 attract clips present and non-empty.
- `npm run test:languages`: 10 positive language-detection cases and 4 ambiguity cases passed.
- `npm run typecheck` and `npm run build:pages` passed.
- Visual checks cover kiosk and guide at 360x800, 440x956 and 1080x1920. All nine flags stay visible in one row with no horizontal overflow.
- Production deploy completed and the permanent alias `https://apa-v1.pages.dev` serves bundle `index-DbJzZblT.js`.
- Production checks passed for Italian kiosk UI, Serbian Hall 4 guide UI, nine-language config, 9 x 6 attract manifest and new Puck button/attract MP3 files.

## 2026-07-04 — Polish support and silent idle mode

### Polish language
- Added Polish (`pl`, `pl-PL`) to kiosk and guide URL selection, hard language lock, Gemini instructions, deterministic guide pipeline, browser speech fallback, repeat messages and transcript detection.
- Added complete Polish UI, Hall/stand labels, status and error copy, scenario buttons, pricing, FAQ, VR descriptions and sales hooks.
- Added a compact circular Polish flag while keeping all ten flags in one row on narrow screens.
- Added 18 Polish fixed button responses and generated all of them with Gemini voice Puck.

### Idle speech removal
- Removed the client AttractLoop and every runtime call that could play speech while Apa is idle.
- Removed the local Express attract route/static audio serving and attract generation path.
- Pages builds no longer copy attract MP3 files. `/api/attract-manifest` remains as an empty compatibility object.
- Apa keeps the visual idle animation but stays silent until a visitor presses a button.

### Verification
- `npm run check:languages`: 10 languages, 180 button clips, idle speech disabled.
- `npm run test:languages`: 11 positive language cases and 4 ambiguity cases passed.
- `npm run typecheck` passed.
- `npm run build:pages` and standalone Pages guide-function typecheck passed.
- Kiosk and guide passed layout checks at 360x800, 440x956 and 1080x1920: all ten flags stay in one row with no overflow.
- Built assets contain no `AttractLoop`, attract-manifest fetch or `/audio/attract` reference; the compatibility manifest is empty.
- Production alias `https://apa-v1.pages.dev` serves bundle `index-CDmfvxq3.js`.
- Production checks passed for Polish kiosk and Hall 4 guide UI, both prompts, all 18 Polish Puck clips and an empty attract manifest. The deployed bundle contains no idle-audio runtime references.

## 2026-07-04 — Curiosity-first penguin conversations

### Problem
- The entrance persona still defined every conversation as a single-purpose conversion flow and instructed Apa to bridge nearly every fact to VR or the entrance.
- The Antarctic fact bank contained only a few general penguin facts, so live answers quickly returned to tickets and the gallery.

### Fix
- Replaced the sales-first goal with a two-stage cadence: the first two contentful Apa replies stay on penguins or Antarctica; starting with the third reply, Apa may make one unsolicited gallery bridge per visitor session.
- Added a sourced bank of 20 penguin facts covering swimming, feathers, senses, habitats, emperor behavior, Adelie behavior and diet.
- Allowed Gemini to add only highly confident qualitative details; new numbers, records, measurements and species claims must come from the official bank.
- Added continuation rules so "yes", "more" and equivalents produce a new fact without losing the topic or repeating an invitation.
- Kept silent idle, the separate guide prompt and all pre-recorded scenario-button clips unchanged.

### Verification
- `npm run test:penguin-attraction` validates fact schema, sources, prompt cadence and removal of the old goal.
- Built Pages prompt contains all 20 facts and the guide prompt does not contain the entrance fact bank.
- A live Gemini smoke test in Russian produced two different fact-only replies, then a third fact with one VR bridge.
- A prompt-only four-turn smoke test showed that Gemini could still repeat a gallery bridge on reply four. Cadence enforcement therefore moved into the client instead of relying on prompt interpretation alone.
- The client now counts completed Apa replies from the 30-second context: replies 1-2 and 4+ are `FACT_ONLY`; only reply 3 is `BRIDGE_ALLOWED`. The selected state is included in turn diagnostics.
- `npm run test:entrance-cadence` verifies replies 1-6 and new-session reset. The runtime-augmented live retest could not run after the Gemini free-tier daily request limit was exhausted.
- Production alias `https://apa-v1.pages.dev` serves bundle `index-BLjOYrbn.js`. Production config contains all 20 facts and the mandatory response-state check; the guide prompt remains unchanged and the idle manifest remains empty.

## 2026-07-06 — Balanced entrance topics and full virtual reality wording

### Topic balance
- Added an official entrance story bank for photographic art, Sergey Potetyunin, the expedition film, installations and virtual reality.
- Added a persistent five-session cycle in `localStorage`; each bridge topic receives exactly one slot per cycle.
- Fixed the opening and bridge topics for the full 30-second visitor session and clear them with the transcript context.
- Replies one and two use a rotating curiosity topic without a sales pitch, reply three uses the assigned bridge, and later replies follow the visitor without another unsolicited promotion.
- Added the opening topic, bridge topic and cycle index to turn diagnostics and durable turn logs.

### Wording
- Removed the abbreviation for virtual reality from visitor-facing config, prompts and guide interface copy in all ten languages.
- Added mandatory prompt instructions to use the full localized term and explain the headset on first mention.
- Updated fixed-audio source texts for the next regeneration. Existing audio files were deliberately not regenerated in this change.

### Verification
- `npm run test:entrance-cadence` passed the complete five-session cycle and response-state sequence.
- `npm run check:virtual-reality-wording -- --dist` passed for source files and both built prompts.
- `npm run typecheck`, `npm run build:pages` and `npm run test:penguin-attraction -- --dist` passed without a live model request.

## 2026-07-06 — Versioned conversation logs

- Added `config/app_version.json` as the single application-version source and synchronized package metadata.
- Added the application version to debug copies, every diagnostic envelope, completed turns, transcripts and events.
- Added nullable `app_version` columns to D1 turns, messages and events; historical records remain valid with no version.
- Added version output to admin conversation endpoints and local `voice_turns.jsonl` / `messages.jsonl` sync files.
- Added the same field to local SQLite conversation and voice-turn records.
- Added `npm run version:bump` and a project rule requiring one patch bump for every change batch before verification or deployment.
