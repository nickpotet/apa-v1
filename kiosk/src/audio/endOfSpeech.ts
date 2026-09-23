// End-of-speech detection for tap-to-talk ("toggle") turns.
//
// On the touch kiosk the first tap starts listening and a second tap ends it.
// Visitors rarely tap twice: in Sep 2026 logs ~10% of kiosk turns streamed until
// the 75 s hard cap because no end signal ever arrived. This detector ends the
// turn once the visitor stops talking, with a listening limit as a backstop.
//
// Pure — no Web Audio — so it can be tested against recorded speech
// (scripts/test-end-of-speech.ts). Providers feed it the RMS of each chunk.

export type EndOfSpeechReason = 'silence' | 'max_duration';

export interface EndOfSpeechOptions {
  /** Trailing quiet after speech that ends the turn. */
  silenceMs: number;
  /** Hard listening limit, whether or not speech was heard. */
  maxListenMs: number;
  /** Speech required before the silence timer arms, so a tap or click can't end the turn. */
  minSpeechMs?: number;
  /** Initial window spent only learning the room's noise floor. */
  warmupMs?: number;
}

/** Tuned on kiosk logs: 1.2 s tolerates normal mid-sentence pauses; 15 s cuts only
 *  ~2% of historical turns (p95 utterance is 11 s) while ending the 75 s hangs. */
export const KIOSK_END_OF_SPEECH: EndOfSpeechOptions = {
  silenceMs: 1200,
  maxListenMs: 15_000,
  minSpeechMs: 300,
  warmupMs: 300,
};

/** Speech is never quieter than this, whatever the room. Kiosk logs put ambient
 *  chunks below 0.01 RMS most of the time, and speech well above 0.05. */
const MIN_SPEECH_RMS = 0.02;
/** Speech must stand this far above the learned noise floor. */
const SPEECH_OVER_FLOOR = 3;

export class EndOfSpeechDetector {
  private readonly opts: EndOfSpeechOptions;
  private elapsedMs = 0;
  private speechMs = 0;
  private quietMs = 0;
  // Start from a quiet-room guess; the tracker adapts from the first chunks.
  private noiseFloor = 0.005;
  private fired = false;

  constructor(opts: EndOfSpeechOptions) {
    this.opts = opts;
  }

  /** Feed one captured chunk. Returns a reason exactly once, when the turn should end. */
  push(rms: number, durationMs: number): EndOfSpeechReason | null {
    if (this.fired) return null;
    this.elapsedMs += durationMs;

    // Warm-up: only learn the room. Without it, steady street noise would count as
    // "speech" until the floor caught up, then as silence — ending the turn before
    // the visitor said anything. A missed detection just falls to maxListenMs.
    if (this.elapsedMs <= (this.opts.warmupMs ?? 300)) {
      this.noiseFloor += (rms - this.noiseFloor) * 0.5;
      return this.elapsedMs >= this.opts.maxListenMs ? this.fire('max_duration') : null;
    }

    // Then follow drops fast and rises slowly, so a talking visitor doesn't drag
    // the floor up but a change in steady (AGC-lifted) ambience is still learned.
    const rate = rms < this.noiseFloor ? 0.3 : 0.01;
    this.noiseFloor += (rms - this.noiseFloor) * rate;

    const isSpeech = rms >= Math.max(MIN_SPEECH_RMS, this.noiseFloor * SPEECH_OVER_FLOOR);
    if (isSpeech) {
      this.speechMs += durationMs;
      this.quietMs = 0;
    } else {
      this.quietMs += durationMs;
    }

    const heardSpeech = this.speechMs >= (this.opts.minSpeechMs ?? 300);
    if (heardSpeech && this.quietMs >= this.opts.silenceMs) return this.fire('silence');
    if (this.elapsedMs >= this.opts.maxListenMs) return this.fire('max_duration');
    return null;
  }

  /** Snapshot for diagnostics. */
  get stats(): Record<string, number | boolean> {
    return {
      elapsedMs: Math.round(this.elapsedMs),
      speechMs: Math.round(this.speechMs),
      quietMs: Math.round(this.quietMs),
      noiseFloor: Number(this.noiseFloor.toFixed(4)),
      fired: this.fired,
    };
  }

  private fire(reason: EndOfSpeechReason): EndOfSpeechReason {
    this.fired = true;
    return reason;
  }
}
