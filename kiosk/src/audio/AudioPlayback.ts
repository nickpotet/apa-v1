// Plays back PCM16 audio chunks from the Gemini response.
// Gemini Live outputs PCM16 at 24 kHz mono — chunks arrive incrementally
// and are queued so playback is gapless.

const PLAYBACK_IDLE_GRACE_MS = 900;
const PLAYBACK_SCHEDULE_AHEAD_S = 0.03;

export class AudioPlayback {
  private ctx: AudioContext | null = null;
  private nextAt = 0;
  private activeSources = 0;
  private doneTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  get isPlaying(): boolean {
    return this.ctx !== null && (this.activeSources > 0 || this.nextAt > this.ctx.currentTime);
  }

  /** Queue one base64-encoded PCM16 chunk (24 kHz mono). Returns promise that resolves when done playing. */
  enqueue(base64: string, onPlaying: () => void, onDone: () => void): void {
    clearTimeout(this.doneTimer ?? undefined);
    this.doneTimer = null;

    const ctx = this.ensureContext();

    // Resume if suspended by browser autoplay policy (requires prior user gesture).
    if (ctx.state === 'suspended') ctx.resume();
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x7fff;

    const buf = ctx.createBuffer(1, float32.length, 24000);
    buf.copyToChannel(float32, 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + PLAYBACK_SCHEDULE_AHEAD_S, this.nextAt);
    this.nextAt = startAt + buf.duration;
    src.start(startAt);

    if (this.activeSources === 0) onPlaying();
    this.activeSources++;
    const sourceGeneration = this.generation;

    src.onended = () => {
      if (sourceGeneration !== this.generation) return;
      this.activeSources--;
      if (this.activeSources === 0) {
        this.doneTimer = setTimeout(() => {
          this.doneTimer = null;
          if (this.activeSources === 0) {
            this.closeContext();
            onDone();
          }
        }, PLAYBACK_IDLE_GRACE_MS);
      }
    };
  }

  /** Immediately stop all playback (model interrupted). */
  interrupt(): void {
    clearTimeout(this.doneTimer ?? undefined);
    this.doneTimer = null;
    this.generation++;
    this.closeContext();
    this.nextAt = 0;
    this.activeSources = 0;
  }

  private ensureContext(): AudioContext {
    this.ctx ??= new AudioContext({ sampleRate: 24000 });
    return this.ctx;
  }

  private closeContext(): void {
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.nextAt = 0;
  }
}
