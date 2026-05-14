# Hardware spec — Ap v1

Target: vertical-screen public-facing kiosk that survives outdoor adjacency, runs unattended, and stays under €1200 setup cost.

## Confirmed for day 1

- **Mini-PC:** Intel N100 fanless, 8–16GB RAM, 256GB SSD. €150–250. Quiet, low-power, plenty for Chrome `--kiosk` + Node server.
- **Display:** 50–55" portrait-oriented commercial display, ≥500 nit if behind glass. €300–500. Must support 24/7 duty cycle.
- **Speaker:** powered speaker rated for outdoor adjacency, ≥20W RMS. €50–150.
- **Network:** wired ethernet preferred, Wi-Fi as backup. Cellular failover (4G dongle) optional, decided after location is set.

## Audio input — bake-off, decided on day 7

Both candidates are wired in via the `InputSource` abstraction (`kiosk/src/audio/inputs/`). Whichever loses day 7 stays in the codebase as a fallback.

### Candidate A — Telephone handset (preferred bias)

- **Why:** solves outdoor noise elegantly (handset = close-talk, far better SNR than any room mic), the hookswitch doubles as a beautiful natural push-to-talk gesture, strong visual/TikTok hook.
- **Parts:** retro-style desk handset (USB or analog → USB adapter), the hookswitch wired as a momentary button to a USB input (e.g. an Adafruit / generic HID button board).
- **Risks:** sourcing a sturdy handset, vandalism, hygiene perception. Mitigate with a chunky industrial handset and a clear sign ("limpio cada hora — promesa de pingüino").

### Candidate B — Cardioid USB mic + arcade button

- **Why:** standard, cheap, well-known. Less novel, more vulnerable to street noise.
- **Parts:** USB cardioid mic mounted facing the visitor at mouth height, arcade button (Sanwa-style, 60mm) wired via Adafruit board as HID.
- **Risks:** street noise blowing through, button vandalism (less so than handset cable).

## Bake-off metrics (day 7)

| Metric | Target |
|---|---|
| ASR word error rate (controlled phrases) | ≤10% |
| Latency to first audio response | ≤1500ms |
| Conversation completion (no early hangup) | ≥70% |
| Conversion proxy (QR mentioned + coupon said) | track baseline |

Measure on **both** voice providers (Gemini Flash Live and OpenAI Realtime) so we can separate hardware effect from model effect.

## Anti-burn-in / anti-vandalism

- UI always has motion (idle penguin breath, slow chip rotation).
- Nightly `sleeping` state at low brightness 02:00–07:00.
- Screen behind tempered glass when outdoor. Mini-PC and cabling inside locked enclosure.
- USB ports physically blocked (epoxy or USB blockers) on the public-facing side.

## Power & resilience

- Mini-PC behind small UPS (≥30 min) so brownouts don't corrupt SQLite.
- Watchdog script (`/scripts/watchdog.sh`) restarts Chrome on crash, reboots whole machine if Chrome dead >5min.
- Cron: nightly reboot at 04:00 (low-traffic, ensures clean state).
