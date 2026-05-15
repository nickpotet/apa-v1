type PlaybackDebug = (event: string, data?: Record<string, unknown>) => void;

const OUTPUT_SAMPLE_RATE = 24_000;
const INITIAL_BUFFER_MS = 600;

type PlaybackMessage =
  | { type: 'started'; bufferedSamples: number }
  | { type: 'status'; bufferedSamples: number; underrunCount: number }
  | { type: 'underrun'; underrunCount: number }
  | { type: 'drainComplete'; underrunCount: number };

function decodePcm16(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

export class AudioPlayback {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private readyPromise: Promise<void> | null = null;
  private pendingBeforeReady: Float32Array[] = [];
  private responseOpen = false;
  private finishWhenReady = false;
  private playing = false;
  private onPlaying: (() => void) | null = null;
  private onDone: (() => void) | null = null;
  private onDebug: PlaybackDebug | null = null;
  private underrunCount = 0;

  get isPlaying(): boolean {
    return this.responseOpen || this.playing || this.pendingBeforeReady.length > 0;
  }

  startResponse(onPlaying: () => void, onDone: () => void, onDebug?: PlaybackDebug): void {
    this.interrupt();
    this.responseOpen = true;
    this.finishWhenReady = false;
    this.playing = false;
    this.underrunCount = 0;
    this.onPlaying = onPlaying;
    this.onDone = onDone;
    this.onDebug = onDebug ?? null;
    void this.ensureReady();
  }

  enqueuePcm(base64: string): void {
    if (!this.responseOpen) return;

    const samples = decodePcm16(base64);
    if (!this.node) {
      this.pendingBeforeReady.push(samples);
      void this.ensureReady();
      return;
    }
    this.postSamples(samples);
  }

  finishResponse(): void {
    if (!this.responseOpen) return;

    if (!this.node) {
      this.finishWhenReady = true;
      void this.ensureReady();
      return;
    }

    this.node.port.postMessage({ type: 'finish' });
    this.onDebug?.('playback_finish_requested', { underrunCount: this.underrunCount });
  }

  interrupt(): void {
    this.responseOpen = false;
    this.finishWhenReady = false;
    this.playing = false;
    this.pendingBeforeReady = [];
    this.underrunCount = 0;
    this.onPlaying = null;
    this.onDone = null;
    this.onDebug = null;

    try { this.node?.port.postMessage({ type: 'reset' }); } catch {}
    this.node?.disconnect();
    this.node = null;
    this.readyPromise = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private async ensureReady(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = (async () => {
      this.ctx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
      if (this.ctx.state === 'suspended') await this.ctx.resume();

      await this.ctx.audioWorklet.addModule('/playback-worklet.js');
      if (!this.ctx) return;

      const node = new AudioWorkletNode(this.ctx, 'playback-processor');
      node.port.onmessage = (event: MessageEvent<PlaybackMessage>) => this.handleWorkletMessage(event.data);
      node.connect(this.ctx.destination);
      node.port.postMessage({
        type: 'configure',
        initialBufferSamples: Math.round(OUTPUT_SAMPLE_RATE * INITIAL_BUFFER_MS / 1000),
      });

      this.node = node;
      this.onDebug?.('playback_worklet_ready', { initialBufferMs: INITIAL_BUFFER_MS });

      for (const samples of this.pendingBeforeReady) {
        this.postSamples(samples);
      }
      this.pendingBeforeReady = [];

      if (this.finishWhenReady) {
        this.finishWhenReady = false;
        this.finishResponse();
      }
    })().catch((err) => {
      this.onDebug?.('playback_worklet_error', { message: String((err as Error).message ?? err) });
      this.finishPlayback();
    });

    return this.readyPromise;
  }

  private postSamples(samples: Float32Array): void {
    if (!this.node) return;
    this.node.port.postMessage({ type: 'append', samples }, [samples.buffer]);
  }

  private handleWorkletMessage(message: PlaybackMessage): void {
    switch (message.type) {
      case 'started':
        this.playing = true;
        this.onDebug?.('playback_started', {
          bufferedMs: Math.round(message.bufferedSamples / OUTPUT_SAMPLE_RATE * 1000),
        });
        this.onPlaying?.();
        break;
      case 'status':
        this.underrunCount = message.underrunCount;
        this.onDebug?.('playback_status', {
          bufferedMs: Math.round(message.bufferedSamples / OUTPUT_SAMPLE_RATE * 1000),
          underrunCount: message.underrunCount,
        });
        break;
      case 'underrun':
        this.underrunCount = message.underrunCount;
        this.onDebug?.('playback_underrun', { underrunCount: message.underrunCount });
        break;
      case 'drainComplete':
        this.underrunCount = message.underrunCount;
        this.onDebug?.('playback_drain_complete', { underrunCount: message.underrunCount });
        this.finishPlayback();
        break;
    }
  }

  private finishPlayback(): void {
    const onDone = this.onDone;
    this.responseOpen = false;
    this.finishWhenReady = false;
    this.playing = false;
    this.pendingBeforeReady = [];
    this.onPlaying = null;
    this.onDone = null;
    this.onDebug = null;

    this.node?.disconnect();
    this.node = null;
    this.readyPromise = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;

    onDone?.();
  }
}
