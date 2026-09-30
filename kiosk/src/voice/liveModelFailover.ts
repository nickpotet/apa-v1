// Live-model failover registry.
//
// A Live model can become unusable while the others keep working:
//  - quota exhaustion (per model): 1011 "You exceeded your current quota", or the
//    model transcribes the visitor and never replies (2026-09-03);
//  - a Google-side outage of one model: 1011 "Internal error encountered", or the
//    socket opens and the model stays silent (2026-09-30, 7 failed kiosk turns in
//    4 minutes while gemini-2.5-flash-native-audio-latest answered normally).
// A failing model is parked for a cool-down and retried later rather than dropped
// for good: quota windows are rolling and outages end.
//
// No Gemini SDK here on purpose — this is a plain registry so it can be read from
// the UI layer without breaking the CLAUDE.md rule that confines @google/genai to
// kiosk/src/voice/providers/.

const STORAGE_KEY = 'apa.live-model-cooldowns.v1';
/** Quota windows reopen slowly. */
export const QUOTA_COOLDOWN_MS = 30 * 60_000;
/** Outages are usually short; come back to the primary model sooner. */
export const OUTAGE_COOLDOWN_MS = 10 * 60_000;

export type ModelFailure = 'quota' | 'server_error';

/** Classify a Live socket close. Null = not the model's fault (normal close,
 *  our protocol error such as 1007, or plain network loss). */
export function classifyLiveClose(code: number, reason: string | undefined): ModelFailure | null {
  const text = reason ?? '';
  if (/quota|resource[_ ]?exhausted|billing/i.test(text)) return 'quota';
  // 1011 internal error, 1013 try again later, 1014 bad gateway — all server side.
  if (code === 1011 || code === 1013 || code === 1014) return 'server_error';
  if (/internal error|unavailable|overloaded|deadline exceeded/i.test(text)) return 'server_error';
  return null;
}

/** Verified 2026-09-03: every entry accepts our Live config (audio in/out,
 *  manual activity detection, Puck voice) and reaches setupComplete. */
export const LIVE_MODEL_CHAIN: string[] = [
  import.meta.env?.VITE_GEMINI_MODEL ?? 'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-latest',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-flash-native-audio-preview-09-2025',
].filter((model, index, all) => all.indexOf(model) === index);

type Cooldowns = Record<string, number>;

function read(): Cooldowns {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Cooldowns;
    const now = Date.now();
    // Drop entries whose cool-down already elapsed.
    return Object.fromEntries(
      Object.entries(parsed).filter(([, until]) => typeof until === 'number' && until > now),
    );
  } catch {
    return {};
  }
}

function write(map: Cooldowns): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Private mode / storage disabled — failover still works for this page session.
  }
}

/** First model in the chain that is not cooling down, or null when all are parked. */
export function nextAvailableLiveModel(): string | null {
  const cooling = read();
  return LIVE_MODEL_CHAIN.find((model) => !cooling[model]) ?? null;
}

/** Park a failing model so later turns skip straight past it. */
export function markLiveModelExhausted(model: string, cooldownMs = QUOTA_COOLDOWN_MS): void {
  const map = read();
  map[model] = Date.now() + cooldownMs;
  write(map);
}

/** A completed turn proves the model works again — un-park it. */
export function markLiveModelHealthy(model: string): void {
  const map = read();
  if (!map[model]) return;
  delete map[model];
  write(map);
}

/** True when every Live model is parked and the turn-based pipeline should take over. */
export function allLiveModelsExhausted(): boolean {
  return nextAvailableLiveModel() === null;
}

export function liveFailoverSnapshot(): Record<string, unknown> {
  const cooling = read();
  return {
    chain: LIVE_MODEL_CHAIN,
    cooling: Object.keys(cooling),
    next: nextAvailableLiveModel(),
  };
}
