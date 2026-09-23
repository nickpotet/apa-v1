// Live-model failover registry.
//
// Google enforces quota per model: when the realtime Live model is exhausted the
// socket closes with 1011 "You exceeded your current quota". Quota windows are
// rolling, so an exhausted model is parked for a cool-down and retried later
// rather than dropped for good.
//
// No Gemini SDK here on purpose — this is a plain registry so it can be read from
// the UI layer without breaking the CLAUDE.md rule that confines @google/genai to
// kiosk/src/voice/providers/.

const STORAGE_KEY = 'apa.live-model-cooldowns.v1';
const COOLDOWN_MS = 30 * 60_000;

/** Verified 2026-09-03: every entry accepts our Live config (audio in/out,
 *  manual activity detection, Puck voice) and reaches setupComplete. */
export const LIVE_MODEL_CHAIN: string[] = [
  import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-3.1-flash-live-preview',
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

/** Park a model after a quota rejection so later turns skip straight past it. */
export function markLiveModelExhausted(model: string): void {
  const map = read();
  map[model] = Date.now() + COOLDOWN_MS;
  write(map);
}

/** A completed turn proves the quota window reopened — un-park the model. */
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
