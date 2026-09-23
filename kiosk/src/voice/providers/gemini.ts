// ONLY file allowed to import @google/genai (CLAUDE.md rule).

import { GoogleGenAI, Modality } from '@google/genai';
import type { Session } from '@google/genai';
import type { Language, VoiceProvider, VoiceProviderConfig, VoiceProviderEvents } from './VoiceProvider';
import { AudioCapture } from '../../audio/AudioCapture';
import { AudioPlayback } from '../../audio/AudioPlayback';
import { EndOfSpeechDetector } from '../../audio/endOfSpeech';
import {
  LIVE_MODEL_CHAIN,
  markLiveModelExhausted,
  markLiveModelHealthy,
  nextAvailableLiveModel,
} from '../liveModelFailover';
import {
  activeLanguageInstruction,
  detectLanguageDetailed,
  lockedLanguageInstruction,
} from '../languageDetection';

const VOICE = 'Puck';
const FIRST_AUDIO_TIMEOUT_MS = 12_000;
const TURN_COMPLETE_TIMEOUT_MS = 45_000;
const PLAYBACK_DRAIN_TIMEOUT_MS = 30_000;
const MAX_BUFFERED_AUDIO_SAMPLES = 16000 * 20;
/** How long to wait for the server's setupComplete before giving up on the socket. */
const SETUP_TIMEOUT_MS = 8_000;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function inspectPcm16(buf: ArrayBuffer): { peak: number; rms: number; samples: number } {
  const int16 = new Int16Array(buf);
  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < int16.length; i++) {
    const normalized = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    const abs = Math.abs(normalized);
    if (abs > peak) peak = abs;
    sumSquares += normalized * normalized;
  }
  return {
    peak: Number(peak.toFixed(4)),
    rms: Number(Math.sqrt(sumSquares / Math.max(1, int16.length)).toFixed(4)),
    samples: int16.length,
  };
}

function buildInstructions(config: VoiceProviderConfig): string {
  if (!config.languageLock) {
    return `${config.systemPrompt}\n\n${activeLanguageInstruction(config.initialLanguage)}`;
  }
  const guard = lockedLanguageInstruction(config.languageLock);
  return `${guard}\n\n${config.systemPrompt}\n\n${guard}`;
}

export class GeminiVoiceProvider implements VoiceProvider {
  readonly name = 'Gemini Flash Live';
  /** Chosen per session from LIVE_MODEL_CHAIN, skipping quota-parked models. */
  model = LIVE_MODEL_CHAIN[0];
  readonly requiresToken = true;

  private session: Session | null = null;
  private capture = new AudioCapture();
  private playback = new AudioPlayback();
  private events: VoiceProviderEvents | null = null;
  private capTimeout:     ReturnType<typeof setTimeout> | null = null;
  private nearTimeout:    ReturnType<typeof setTimeout> | null = null;
  private firstAudioTimeout: ReturnType<typeof setTimeout> | null = null;
  private turnCompleteTimeout: ReturnType<typeof setTimeout> | null = null;
  private playbackDrainTimeout: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private turnEnded = false;
  private responseComplete = false;
  private language: Language = 'es';
  private languageLock: Language | null = null;
  private sawResponseAudio = false;
  private activityOpen = false;
  private pendingAudioChunks: ArrayBuffer[] = [];
  private pendingAudioSamples = 0;
  private chunksCaptured = 0;
  private chunksSent = 0;
  private firstChunkCaptured = false;
  private firstChunkSent = false;
  private inputTranscriptSeen = false;
  private outputTranscriptSeen = false;
  private peakInputLevel = 0;
  private silentChunks = 0;
  private lastBufferedReportMs = 0;
  private endOfSpeech: EndOfSpeechDetector | null = null;
  private resolveSetup: (() => void) | null = null;
  private setupDone = false;

  async start(config: VoiceProviderConfig, events: VoiceProviderEvents): Promise<void> {
    await this.close('user');
    this.stopped = false;
    this.events = events;
    this.turnEnded = false;
    this.responseComplete = false;
    this.language = config.initialLanguage;
    this.languageLock = config.languageLock;
    this.sawResponseAudio = false;
    this.activityOpen = false;
    this.pendingAudioChunks = [];
    this.pendingAudioSamples = 0;
    this.chunksCaptured = 0;
    this.chunksSent = 0;
    this.firstChunkCaptured = false;
    this.firstChunkSent = false;
    this.inputTranscriptSeen = false;
    this.outputTranscriptSeen = false;
    this.peakInputLevel = 0;
    this.silentChunks = 0;
    this.lastBufferedReportMs = 0;
    this.endOfSpeech = config.endOfSpeech ? new EndOfSpeechDetector(config.endOfSpeech) : null;
    this.setupDone = false;

    try {
      events.onDebug?.('provider_start_requested', {
        language: config.initialLanguage,
        languageLock: config.languageLock,
      });
      await this.capture.start((pcm16) => {
        if (this.stopped || this.turnEnded) return;
        this.chunksCaptured++;
        const stats = inspectPcm16(pcm16);
        if (!this.firstChunkCaptured) {
          this.firstChunkCaptured = true;
          events.onDebug?.('provider_first_audio_chunk_captured', stats);
        }
        if (stats.peak > this.peakInputLevel) this.peakInputLevel = stats.peak;
        if (stats.rms < 0.01) this.silentChunks++;
        // Tap-to-talk: tell the app when the visitor has stopped talking. Samples
        // are already resampled to 16 kHz, so samples / 16 = milliseconds.
        const ended = this.endOfSpeech?.push(stats.rms, stats.samples / 16);
        if (ended) {
          events.onDebug?.('provider_end_of_speech', { reason: ended, ...this.endOfSpeech?.stats });
          events.onEndOfSpeech?.(ended);
        }
        if (this.session && this.activityOpen) {
          this.sendAudioChunk(pcm16);
          return;
        }
        this.queueAudioChunk(pcm16);
      }, (event, data) => events.onDebug?.(`provider_${event}`, data));
      events.onDebug?.('provider_capture_started');
      events.onListening();

      const isEphemeralToken = config.ephemeralToken.startsWith('auth_tokens/');
      const ai = new GoogleGenAI({
        apiKey: config.ephemeralToken,
        ...(isEphemeralToken ? { httpOptions: { apiVersion: 'v1alpha' } } : {}),
      });
      // Skip models parked by a previous quota rejection. If every model is parked
      // we still try the primary — the cool-down may have lapsed upstream.
      this.model = nextAvailableLiveModel() ?? LIVE_MODEL_CHAIN[0];
      const connectStartedAt = performance.now();
      // live.connect() resolves as soon as it has *sent* the setup message — it does
      // not wait for the server's setupComplete (verified in @google/genai 2.2.0).
      // Realtime input sent before setupComplete breaks the protocol order; it is the
      // leading suspect for the intermittent 1007 "Precondition check failed" closes.
      const setupComplete = new Promise<void>((resolve) => { this.resolveSetup = resolve; });
      events.onDebug?.('provider_connect_started', {
        ephemeral: isEphemeralToken,
        model: this.model,
        isFallback: this.model !== LIVE_MODEL_CHAIN[0],
      });

      this.session = await ai.live.connect({
        model: this.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: buildInstructions(config) }] },
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
        },
        callbacks: {
          onopen: () => {
            console.log('[gemini] open');
            events.onDebug?.('provider_socket_open', {
              latencyMs: Math.round(performance.now() - connectStartedAt),
            });
          },
          onmessage: (msg) => this.handleMessage(msg),
          onerror: (e) => this.fail(new Error(String((e as ErrorEvent).message ?? e))),
          onclose: (e) => {
            events.onDebug?.('provider_socket_closed', {
              code: (e as CloseEvent).code,
              reason: (e as CloseEvent).reason,
            });
            if (this.stopped) return;
            const { code, reason } = e as CloseEvent;
            // Google closes with 1011 + "You exceeded your current quota..." when the
            // Live-model quota is exhausted. Surface it distinctly so the UI can show
            // the "come back in a bit" screen instead of a silently resetting button.
            if (/quota|resource_exhausted|billing/i.test(reason ?? '')) {
              // Park this model so the next turn skips straight to the next one.
              markLiveModelExhausted(this.model);
              events.onDebug?.('provider_model_quota_exhausted', {
                model: this.model,
                next: nextAvailableLiveModel(),
              });
              this.close('quota', false);
              return;
            }
            this.close(code === 1000 ? 'user' : 'network', false);
          },
        },
      });

      if (this.stopped) return;

      // Hold realtime input until the server confirms setup; mic audio keeps
      // buffering meanwhile, so the visitor loses nothing.
      let setupTimer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        setupComplete,
        new Promise<void>((resolve) => { setupTimer = setTimeout(resolve, SETUP_TIMEOUT_MS); }),
      ]);
      clearTimeout(setupTimer);
      if (this.stopped) return;
      if (!this.setupDone) {
        // "timed out" is classed as a connectivity error, so the UI shows the QR fallback.
        this.fail(new Error(`Gemini Live setup timed out after ${SETUP_TIMEOUT_MS / 1000}s`));
        return;
      }
      events.onDebug?.('provider_setup_complete', {
        latencyMs: Math.round(performance.now() - connectStartedAt),
        chunksBuffered: this.pendingAudioChunks.length,
      });

      this.session.sendRealtimeInput({ activityStart: {} });
      events.onDebug?.('provider_activity_start_sent');
      this.activityOpen = true;
      this.flushPendingAudioChunks();

      const cap = config.maxConversationSeconds;
      this.nearTimeout = setTimeout(() => events.onTimeoutNearing(), (cap - 10) * 1000);
      this.capTimeout  = setTimeout(() => this.close('timeout'), cap * 1000);
    } catch (err) {
      await this.close('error');
      throw err;
    }
  }

  endTurn(): void {
    if (this.turnEnded || !this.session) return;
    this.turnEnded = true;
    this.capture.stop();
    this.flushPendingAudioChunks();
    this.events?.onDebug?.('provider_end_turn', {
      chunksCaptured: this.chunksCaptured,
      chunksSent: this.chunksSent,
      peakInputLevel: this.peakInputLevel,
      silentChunks: this.silentChunks,
    });
    if (this.chunksSent === 0) {
      this.fail(new Error('No microphone audio was captured for this turn'));
      return;
    }
    try {
      this.session.sendRealtimeInput({ activityEnd: {} });
      this.events?.onDebug?.('provider_activity_end_sent');
    } catch {}
    this.events?.onThinking();
    this.startFirstAudioWatchdog();
  }

  async stop(): Promise<void> {
    await this.close('user');
  }

  warmupAudio(): Promise<void> {
    return this.playback.prepare();
  }

  private handleMessage(msg: { setupComplete?: unknown; serverContent?: {
    modelTurn?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    turnComplete?: boolean;
    interrupted?: boolean;
  }}): void {
    if (this.stopped) return;
    const ev = this.events;
    if (!ev) return;
    if (msg.setupComplete && !this.setupDone) {
      this.setupDone = true;
      this.resolveSetup?.();
      this.resolveSetup = null;
    }
    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      ev.onDebug?.('provider_interrupted');
      this.playback.interrupt();
      ev.onSpeakingEnd();
      this.maybeCompleteResponse();
    }

    for (const part of sc.modelTurn?.parts ?? []) {
      if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
        if (!this.sawResponseAudio) {
          ev.onDebug?.('provider_first_response_audio');
          this.clearFirstAudioWatchdog();
          this.startTurnCompleteWatchdog();
          this.playback.startResponse(
            () => ev.onSpeakingStart(),
            () => {
              if (!sc.interrupted) ev.onSpeakingEnd();
              if (!this.responseComplete) {
                console.warn('[gemini] playback drained before turnComplete');
                this.responseComplete = true;
                this.clearTurnCompleteWatchdog();
              }
              this.clearPlaybackDrainWatchdog();
              this.maybeCompleteResponse();
            },
            (event, data) => ev.onDebug?.(event, data),
          );
          this.sawResponseAudio = true;
        }
        this.playback.enqueuePcm(part.inlineData.data);
      }
      if (part.text) {
        if (!this.outputTranscriptSeen) {
          this.outputTranscriptSeen = true;
          ev.onDebug?.('provider_first_output_transcript');
        }
        ev.onTranscript({ role: 'ap', text: part.text });
      }
    }

    if (sc.outputTranscription?.text) {
      if (!this.outputTranscriptSeen) {
        this.outputTranscriptSeen = true;
        ev.onDebug?.('provider_first_output_transcript');
      }
      ev.onTranscript({ role: 'ap', text: sc.outputTranscription.text });
    }

    if (sc.inputTranscription?.text) {
      if (!this.inputTranscriptSeen) {
        this.inputTranscriptSeen = true;
        ev.onDebug?.('provider_first_input_transcript');
      }
      ev.onTranscript({ role: 'user', text: sc.inputTranscription.text });
      const detected = detectLanguageDetailed(sc.inputTranscription.text, this.language);
      this.language = this.languageLock ?? detected.language;
      ev.onDebug?.('provider_language_detection_detail', {
        language: detected.language,
        confidence: detected.confidence,
      });
      ev.onLanguageDetected(this.language);
    }

    if (sc.turnComplete) {
      ev.onDebug?.('provider_turn_complete');
      // A completed turn proves this model's quota window is open again.
      markLiveModelHealthy(this.model);
      this.responseComplete = true;
      this.clearFirstAudioWatchdog();
      this.clearTurnCompleteWatchdog();
      this.playback.finishResponse();
      if (this.playback.isPlaying) this.startPlaybackDrainWatchdog();
      this.maybeCompleteResponse();
    }
  }

  private maybeCompleteResponse(): void {
    if (!this.responseComplete || this.playback.isPlaying) return;
    this.close('complete');
  }

  private queueAudioChunk(pcm16: ArrayBuffer): void {
    const samples = Math.floor(pcm16.byteLength / Int16Array.BYTES_PER_ELEMENT);
    this.pendingAudioChunks.push(pcm16);
    this.pendingAudioSamples += samples;
    const bufferedMs = Math.round(this.pendingAudioSamples / 16000 * 1000);
    if (bufferedMs >= this.lastBufferedReportMs + 250 || this.pendingAudioChunks.length === 1) {
      this.lastBufferedReportMs = bufferedMs;
      this.events?.onDebug?.('provider_audio_buffered', {
        bufferedMs,
        chunksBuffered: this.pendingAudioChunks.length,
      });
    }

    while (this.pendingAudioSamples > MAX_BUFFERED_AUDIO_SAMPLES && this.pendingAudioChunks.length > 1) {
      const dropped = this.pendingAudioChunks.shift();
      if (dropped) {
        this.pendingAudioSamples -= Math.floor(dropped.byteLength / Int16Array.BYTES_PER_ELEMENT);
        this.events?.onDebug?.('provider_audio_buffer_trimmed', {
          bufferedMs: Math.round(this.pendingAudioSamples / 16000 * 1000),
        });
      }
    }
  }

  private flushPendingAudioChunks(): void {
    if (!this.session || !this.activityOpen) return;
    const bufferedChunks = this.pendingAudioChunks.length;
    const bufferedMs = Math.round(this.pendingAudioSamples / 16000 * 1000);
    for (const chunk of this.pendingAudioChunks) {
      this.sendAudioChunk(chunk);
    }
    this.pendingAudioChunks = [];
    this.pendingAudioSamples = 0;
    this.events?.onDebug?.('provider_audio_buffer_flushed', {
      bufferedChunks,
      bufferedMs,
      chunksSent: this.chunksSent,
    });
  }

  private sendAudioChunk(pcm16: ArrayBuffer): void {
    if (!this.session || !this.activityOpen) return;
    this.session.sendRealtimeInput({
      audio: { data: toBase64(pcm16), mimeType: 'audio/pcm;rate=16000' },
    });
    this.chunksSent++;
    if (!this.firstChunkSent) {
      this.firstChunkSent = true;
      this.events?.onDebug?.('provider_first_audio_chunk_sent', { chunksSent: this.chunksSent });
    }
  }

  private startFirstAudioWatchdog(): void {
    this.clearFirstAudioWatchdog();
    this.firstAudioTimeout = setTimeout(() => {
      this.firstAudioTimeout = null;
      // A quota-throttled Live model often does NOT close with 1011 — it transcribes
      // the visitor correctly and then never generates a reply (verified 2026-09-03
      // against the exhausted gemini-3.1-flash-live-preview). So an input transcript
      // with no response audio means socket and upstream are healthy and the *model*
      // is stalling: park it and fail over instead of surfacing a dead end.
      if (this.inputTranscriptSeen) {
        markLiveModelExhausted(this.model);
        this.events?.onDebug?.('provider_model_stalled', {
          model: this.model,
          next: nextAvailableLiveModel(),
        });
        this.close('quota');
        return;
      }
      this.events?.onDebug?.('provider_first_audio_timeout');
      this.fail(new Error(`Gemini Live returned no audio within ${FIRST_AUDIO_TIMEOUT_MS / 1000}s`));
    }, FIRST_AUDIO_TIMEOUT_MS);
  }

  private clearFirstAudioWatchdog(): void {
    clearTimeout(this.firstAudioTimeout ?? undefined);
    this.firstAudioTimeout = null;
  }

  private startTurnCompleteWatchdog(): void {
    this.clearTurnCompleteWatchdog();
    this.turnCompleteTimeout = setTimeout(() => {
      console.warn('[gemini] forcing response complete after missing turnComplete');
      this.turnCompleteTimeout = null;
      this.events?.onDebug?.('provider_turn_complete_timeout');
      this.responseComplete = true;
      this.playback.finishResponse();
      if (this.playback.isPlaying) this.startPlaybackDrainWatchdog();
      this.maybeCompleteResponse();
    }, TURN_COMPLETE_TIMEOUT_MS);
  }

  private clearTurnCompleteWatchdog(): void {
    clearTimeout(this.turnCompleteTimeout ?? undefined);
    this.turnCompleteTimeout = null;
  }

  private startPlaybackDrainWatchdog(): void {
    this.clearPlaybackDrainWatchdog();
    this.playbackDrainTimeout = setTimeout(() => {
      console.warn('[gemini] forcing close after playback drain timeout');
      this.playbackDrainTimeout = null;
      this.events?.onDebug?.('provider_playback_drain_timeout');
      this.playback.interrupt();
      this.close('complete');
    }, PLAYBACK_DRAIN_TIMEOUT_MS);
  }

  private clearPlaybackDrainWatchdog(): void {
    clearTimeout(this.playbackDrainTimeout ?? undefined);
    this.playbackDrainTimeout = null;
  }

  /** Unblock start() if the socket dies before setupComplete arrives. */
  private releaseSetupWait(): void {
    this.resolveSetup?.();
    this.resolveSetup = null;
  }

  private clearTimers(): void {
    clearTimeout(this.capTimeout ?? undefined);
    clearTimeout(this.nearTimeout ?? undefined);
    this.clearFirstAudioWatchdog();
    this.clearTurnCompleteWatchdog();
    this.clearPlaybackDrainWatchdog();
    this.capTimeout = null;
    this.nearTimeout = null;
  }

  private async close(
    reason: 'user' | 'timeout' | 'error' | 'network' | 'quota' | 'complete',
    closeSocket = true,
  ): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    this.releaseSetupWait();
    this.capture.stop();
    this.playback.interrupt();
    if (closeSocket) {
      try { this.session?.close(); } catch {}
    }
    this.session = null;
    this.activityOpen = false;
    this.pendingAudioChunks = [];
    this.pendingAudioSamples = 0;
    const ev = this.events;
    this.events = null;
    ev?.onDebug?.('provider_closed', {
      reason,
      chunksCaptured: this.chunksCaptured,
      chunksSent: this.chunksSent,
      peakInputLevel: this.peakInputLevel,
      silentChunks: this.silentChunks,
    });
    ev?.onEnd(reason);
  }

  private fail(err: Error): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    this.releaseSetupWait();
    this.capture.stop();
    this.playback.interrupt();
    try { this.session?.close(); } catch {}
    this.session = null;
    this.activityOpen = false;
    this.pendingAudioChunks = [];
    this.pendingAudioSamples = 0;
    const ev = this.events;
    this.events = null;
    ev?.onDebug?.('provider_failed', {
      message: err.message,
      chunksCaptured: this.chunksCaptured,
      chunksSent: this.chunksSent,
      peakInputLevel: this.peakInputLevel,
      silentChunks: this.silentChunks,
    });
    ev?.onError(err);
  }
}
