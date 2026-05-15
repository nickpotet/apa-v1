// Plays back PCM16 audio chunks from the Gemini response.
// Gemini Live outputs PCM16 at 24 kHz mono — chunks arrive incrementally
// and are queued so playback is gapless.

const PLAYBACK_IDLE_GRACE_MS = 1200;
const PLAYBACK_SCHEDULE_AHEAD_S = 0.12;
const PLAYBACK_MIN_START_BUFFER_S = 0.18;
const PLAYBACK_MAX_START_DELAY_MS = 60;

export class AudioPlayback {
  private ctx: AudioContext | null = null;
  private nextAt = 0;
  private activeSources = 0;
  private doneTimer: ReturnType<typeof setTimeout> | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private pendingBuffers: AudioBuffer[] = [];
  private pendingDuration = 0;
  private onPlaying: (() => void) | null = null;
  private onDone: (() => void) | null = null;

  get isPlaying(): boolean {
    return this.ctx !== null && (this.activeSources > 0 || this.pendingBuffers.length > 0 || this.nextAt > this.ctx.currentTime);
  }

  /** Queue one base64-encoded PCM16 chunk (24 kHz mono). Returns promise that resolves when done playing. */
  enqueue(base64: string, onPlaying: () => void, onDone: () => void): void {
    const continuingStream = this.activeSources > 0 || this.doneTimer !== null;
    clearTimeout(this.doneTimer ?? undefined);
    this.doneTimer = null;
    clearTimeout(this.startTimer ?? undefined);
    this.startTimer = null;

    const ctx = this.ensureContext();
    this.onPlaying = onPlaying;
    this.onDone = onDone;

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
    this.pendingBuffers.push(buf);
    this.pendingDuration += buf.duration;

    if (continuingStream || this.pendingDuration >= PLAYBACK_MIN_START_BUFFER_S) {
      this.flushPendingBuffers();
      return;
    }

    this.startTimer = setTimeout(() => {
      this.startTimer = null;
      this.flushPendingBuffers();
    }, PLAYBACK_MAX_START_DELAY_MS);
  }

  /** Immediately stop all playback (model interrupted). */
  interrupt(): void {
    clearTimeout(this.doneTimer ?? undefined);
    this.doneTimer = null;
    clearTimeout(this.startTimer ?? undefined);
    this.startTimer = null;
    this.generation++;
    this.closeContext();
    this.nextAt = 0;
    this.activeSources = 0;
    this.pendingBuffers = [];
    this.pendingDuration = 0;
    this.onPlaying = null;
    this.onDone = null;
  }

  private ensureContext(): AudioContext {
    this.ctx ??= new AudioContext({ sampleRate: 24000 });
    return this.ctx;
  }

  private flushPendingBuffers(): void {
    const ctx = this.ctx;
    const onPlaying = this.onPlaying;
    const onDone = this.onDone;
    if (!ctx || !onPlaying || !onDone || this.pendingBuffers.length === 0) return;

    while (this.pendingBuffers.length > 0) {
      const buf = this.pendingBuffers.shift()!;
      this.pendingDuration = Math.max(0, this.pendingDuration - buf.duration);

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
        if (this.activeSources === 0 && this.pendingBuffers.length === 0) {
          this.doneTimer = setTimeout(() => {
            this.doneTimer = null;
            if (this.activeSources === 0 && this.pendingBuffers.length === 0) {
              this.closeContext();
              this.onDone?.();
              this.onPlaying = null;
              this.onDone = null;
            }
          }, PLAYBACK_IDLE_GRACE_MS);
        }
      };
    }
  }

  private closeContext(): void {
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.nextAt = 0;
  }
}
