// Streaming PCM16 playback via AudioWorklet.
// Single AudioContext is created lazily on first use and reused.

type PlaybackMessage =
  | { type: 'started'; bufferedSamples?: number }
  | { type: 'drainComplete'; underrunCount?: number }
  | { type: 'underrun'; underrunCount: number };

const OUTPUT_SAMPLE_RATE = 24_000;
const DESKTOP_INITIAL_BUFFER_MS = 320;
const TOUCH_INITIAL_BUFFER_MS = 420;
const WORKLET_READY_TIMEOUT_MS = 4_000;
const PLAYBACK_START_TIMEOUT_MS = 8_000;

function initialBufferMs(): number {
  return navigator.maxTouchPoints > 0 ? TOUCH_INITIAL_BUFFER_MS : DESKTOP_INITIAL_BUFFER_MS;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function decodePcm16(base64: string, targetSampleRate: number): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const source = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    source[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
  }
  if (targetSampleRate === OUTPUT_SAMPLE_RATE) return source;

  const ratio = targetSampleRate / OUTPUT_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.round(source.length * ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i / ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(source.length - 1, left + 1);
    const fraction = sourceIndex - left;
    output[i] = source[left] + (source[right] - source[left]) * fraction;
  }
  return output;
}

export class AudioPlayback {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private readyPromise: Promise<void> | null = null;
  private pending: Float32Array[] = [];
  private responseOpen = false;
  private playing = false;
  private finishWhenReady = false;
  private onPlaying: (() => void) | null = null;
  private onDone: (() => void) | null = null;
  private onDebug: ((event: string, data?: Record<string, unknown>) => void) | null = null;
  private queuedSamples = 0;
  private outputSampleRate = OUTPUT_SAMPLE_RATE;
  private playbackStartTimer: ReturnType<typeof setTimeout> | null = null;
  private currentInitialBufferMs = initialBufferMs();

  get isPlaying(): boolean {
    return this.responseOpen || this.playing || this.pending.length > 0;
  }

  prepare(): Promise<void> {
    return this.ensureReady();
  }

  startResponse(
    onPlaying: () => void,
    onDone: () => void,
    onDebug?: (event: string, data?: Record<string, unknown>) => void,
  ): void {
    this.resetState();
    this.responseOpen = true;
    this.onPlaying = onPlaying;
    this.onDone = onDone;
    this.onDebug = onDebug ?? null;
    this.currentInitialBufferMs = initialBufferMs();
    this.onDebug?.('playback_response_started', { initialBufferMs: this.currentInitialBufferMs });
    this.armPlaybackStartWatchdog();
    void this.ensureReady();
    this.resumeAudio('start_response');
  }

  enqueuePcm(base64: string): void {
    if (!this.responseOpen) return;
    const samples = decodePcm16(base64, this.outputSampleRate);
    this.queuedSamples += samples.length;
    if (!this.node) {
      this.pending.push(samples);
      this.onDebug?.('playback_chunk_buffered_before_ready', {
        bufferedMs: Math.round(this.queuedSamples / this.outputSampleRate * 1000),
      });
      void this.ensureReady();
      return;
    }
    this.resumeAudio('enqueue');
    this.postSamples(samples);
  }

  finishResponse(): void {
    if (!this.responseOpen) return;
    this.onDebug?.('playback_finish_requested', {
      bufferedMs: Math.round(this.queuedSamples / this.outputSampleRate * 1000),
    });
    if (!this.node) {
      this.finishWhenReady = true;
      return;
    }
    this.node.port.postMessage({ type: 'finish' });
  }

  /** Hard stop — drops any audio in flight. Used for "model was interrupted by visitor" and shutdown. */
  interrupt(): void {
    this.onDebug?.('playback_interrupted', {
      bufferedMs: Math.round(this.queuedSamples / this.outputSampleRate * 1000),
    });
    this.resetState();
    try { this.node?.port.postMessage({ type: 'reset' }); } catch {}
  }

  private resetState(): void {
    this.responseOpen = false;
    this.playing = false;
    this.finishWhenReady = false;
    this.pending = [];
    this.onPlaying = null;
    this.onDone = null;
    this.onDebug = null;
    this.queuedSamples = 0;
    this.clearPlaybackStartWatchdog();
  }

  private async ensureReady(): Promise<void> {
    if (this.node) {
      this.resumeAudio('ready');
      return;
    }
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = (async () => {
      const ctx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
      this.context = ctx;
      this.outputSampleRate = ctx.sampleRate || OUTPUT_SAMPLE_RATE;
      this.onDebug?.('playback_context_created', {
        state: ctx.state,
        sampleRate: this.outputSampleRate,
      });
      this.resumeAudio('init');
      await withTimeout(ctx.audioWorklet.addModule('/playback-worklet.js'), WORKLET_READY_TIMEOUT_MS, 'playback worklet');

      const node = new AudioWorkletNode(ctx, 'playback-processor');
      node.port.onmessage = (e: MessageEvent<PlaybackMessage>) => this.handleWorkletMessage(e.data);
      node.connect(ctx.destination);
      node.port.postMessage({
        type: 'configure',
        initialBufferSamples: Math.round(this.outputSampleRate * this.currentInitialBufferMs / 1000),
      });

      this.node = node;
      this.onDebug?.('playback_worklet_ready', {
        contextState: ctx.state,
        sampleRate: this.outputSampleRate,
        pendingChunks: this.pending.length,
      });

      // Flush whatever arrived before the worklet was ready.
      for (const samples of this.pending) this.postSamples(samples);
      this.pending = [];

      if (this.finishWhenReady) {
        this.finishWhenReady = false;
        node.port.postMessage({ type: 'finish' });
      }
    })();

    try {
      await this.readyPromise;
    } catch (err) {
      console.warn('[playback] worklet init failed', err);
      this.readyPromise = null;
      this.onDebug?.('playback_init_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
      // Signal "done" so the caller doesn't hang on isPlaying.
      const onDone = this.onDone;
      this.resetState();
      onDone?.();
    }
  }

  private resumeAudio(reason: string): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'suspended') return;
    this.onDebug?.('playback_resume_requested', { reason });
    ctx.resume()
      .then(() => {
        this.onDebug?.('playback_resume_finished', { state: ctx.state, reason });
      })
      .catch((err) => {
        this.onDebug?.('playback_resume_failed', {
          reason,
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }

  private armPlaybackStartWatchdog(): void {
    this.clearPlaybackStartWatchdog();
    this.playbackStartTimer = setTimeout(() => {
      this.playbackStartTimer = null;
      if (!this.responseOpen || this.playing) return;
      this.onDebug?.('playback_start_timeout', {
        nodeReady: Boolean(this.node),
        contextState: this.context?.state ?? 'missing',
        bufferedMs: Math.round(this.queuedSamples / this.outputSampleRate * 1000),
      });
      const onDone = this.onDone;
      this.resetState();
      try { this.node?.port.postMessage({ type: 'reset' }); } catch {}
      onDone?.();
    }, PLAYBACK_START_TIMEOUT_MS);
  }

  private clearPlaybackStartWatchdog(): void {
    clearTimeout(this.playbackStartTimer ?? undefined);
    this.playbackStartTimer = null;
  }

  private postSamples(samples: Float32Array): void {
    if (!this.node) return;
    this.node.port.postMessage({ type: 'append', samples }, [samples.buffer]);
  }

  private handleWorkletMessage(message: PlaybackMessage): void {
    switch (message.type) {
      case 'started':
        this.playing = true;
        this.clearPlaybackStartWatchdog();
        this.onDebug?.('playback_started', {
          bufferedMs: Math.round((message.bufferedSamples ?? this.queuedSamples) / this.outputSampleRate * 1000),
        });
        this.onPlaying?.();
        break;
      case 'underrun':
        this.onDebug?.('playback_underrun', { underrunCount: message.underrunCount });
        break;
      case 'drainComplete': {
        const onDone = this.onDone;
        this.onDebug?.('playback_drain_complete', {
          underrunCount: message.underrunCount ?? 0,
        });
        this.resetState();
        onDone?.();
        break;
      }
    }
  }
}
