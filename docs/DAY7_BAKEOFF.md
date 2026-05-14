# Day 7 — Field-Test Bake-off: Gemini vs OpenAI Realtime

## Goal

Run both voice providers back-to-back on real visitors and pick one for production deployment. Measure latency, voice quality, language switching, and cost.

## Switching providers

**Gemini Flash Live (default — Days 1–6):**
```
# server/.env
VOICE_PROVIDER=gemini   # or omit — gemini is default
GEMINI_API_KEY=...
```
In `kiosk/src/App.tsx`: ensure `new GeminiVoiceProvider()` and `new ArcadeButtonMic()`.

**OpenAI Realtime (Day 7 swap):**
```
# server/.env
VOICE_PROVIDER=openai
OPENAI_API_KEY=sk-...
```
In `kiosk/src/App.tsx`: swap to `new OpenAIRealtimeProvider()`.
Optionally swap to `new TelephoneHandset()` to test the handset adapter (press **H** in dev).

The server mints the ephemeral token on each `/api/token` call; no frontend code change is needed beyond the provider import.

## Input adapters on the day

| Adapter | Dev key | Production |
|---|---|---|
| `ArcadeButtonMic` | Space (hold) | USB cardioid + arcade button |
| `TelephoneHandset` | H (toggle) | Physical handset + hookswitch |

Test both adapters with each voice provider. The winning combination goes to production.

## Bake-off scorecard

Run 5 conversations per cell. Score 1–5 for each criterion.

| Criterion | Gemini + Arcade | Gemini + Handset | OpenAI + Arcade | OpenAI + Handset |
|---|---|---|---|---|
| First-token latency (< 1.5s = 5) | | | | |
| Voice naturalness | | | | |
| ES / EN / RU / CA accuracy | | | | |
| Language auto-detection | | | | |
| Interruption handling | | | | |
| Error recovery | | | | |
| **Total / 30** | | | | |

## Latency measurement

Time from `onTalkEnd()` (button release) to first audio from speaker.
Target: ≤ 1.5 s for a passing grade.

```
console.time('[latency]')   // in onTalkEnd
console.timeEnd('[latency]') // in onSpeakingStart
```

Open DevTools > Console before each test run.

## Cost check

After all test sessions:
```bash
curl http://127.0.0.1:8787/api/log   # no — use SQLite directly:
cd server && node -e "
  import('better-sqlite3').then(({ default: DB }) => {
    const db = new DB('data/events.sqlite');
    console.table(db.prepare(\"SELECT model, COUNT(*) n, ROUND(SUM(cost_usd),3) usd FROM conversations GROUP BY model\").all());
  });
"
```

## Decision criteria

- If latency delta < 300ms → prefer lower cost (Gemini).
- If OpenAI voice quality scores ≥ 2 points higher → worth the extra cost.
- If any provider fails Russian or Catalan reliably → disqualified.

## Production deployment

Once winner is chosen:

1. Set `VOICE_PROVIDER` and the matching API key in `server/.env`.
2. Build the kiosk: `cd kiosk && npm run build`.
3. Copy repo to `/opt/ap` on the mini-PC.
4. `sudo systemctl enable ap-server ap-kiosk && sudo systemctl start ap-server ap-kiosk`.
5. Add nightly reboot: `sudo crontab -e` → `0 3 * * * /sbin/shutdown -r now`.
6. Verify GDPR notice is posted near the screen (see `docs/GDPR.md`).
