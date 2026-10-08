// Which voice failures count as "the kiosk lost its connection".
//
// Conservative: only clear connectivity/transport failures escalate to the
// QR "lost connection" fallback. Anything we can't confidently classify (e.g.
// "no microphone audio", speech-synthesis failures) keeps the old transient
// error so we never mislabel a local hiccup as an outage.
const CONNECTIVITY_ERROR = /failed to fetch|networkerror|load failed|net::|err_|http [45]\d\d|\b50[234]\b|websocket|socket|connection|disconnect|offline|timed? ?out|token|guide[ -]turn|econn|enotfound/i;

// Google answered, it is just busy: 503 UNAVAILABLE "high demand" (2026-10-08),
// "overloaded". The network is fine and the next press usually works, so this is
// a short "try again", not the QR outage card. Quota exhaustion is deliberately
// NOT here: it lasts hours, and the QR card ("ven a verme dentro") is the right
// answer while the kiosk cannot talk.
const MODEL_BUSY_ERROR = /high demand|overloaded|"status"\s*:\s*"UNAVAILABLE"/i;

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

/** Busy wins over connectivity: Google's busy JSON also contains "503". */
export function classifyVoiceFailure(error: unknown): 'busy' | 'connectivity' | 'other' {
  const message = messageOf(error);
  if (MODEL_BUSY_ERROR.test(message)) return 'busy';
  if (CONNECTIVITY_ERROR.test(message)) return 'connectivity';
  return 'other';
}

/** A busy error is worth a short "try again" once or twice. Several in a row mean
 *  Google is out for longer, and the QR card is the honest answer again. */
export function createBusyStreak(options: { limit: number; windowMs: number; now?: () => number }) {
  const now = options.now ?? Date.now;
  let hits: number[] = [];
  return {
    /** Records a busy failure; true once the streak is long enough to escalate. */
    record(): boolean {
      const t = now();
      hits = [...hits.filter((at) => t - at < options.windowMs), t];
      return hits.length >= options.limit;
    },
    reset(): void {
      hits = [];
    },
  };
}
