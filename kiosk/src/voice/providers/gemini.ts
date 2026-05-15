// Gemini Live adapter — implements VoiceProvider using @google/genai SDK.
// CLAUDE.md rule: this is the ONLY file allowed to import @google/genai.
// Model defaults to Gemini 3.1 Flash Live; override with VITE_GEMINI_MODEL.

import { GoogleGenAI, Modality } from '@google/genai';
import type { Session } from '@google/genai';
import type { Language, VoiceProvider, VoiceProviderConfig, VoiceProviderEvents } from './VoiceProvider';
import { AudioCapture } from '../../audio/AudioCapture';
import { AudioPlayback } from '../../audio/AudioPlayback';
import { activeLanguageInstruction, detectLanguage } from '../languageDetection';

const MODEL = import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-3.1-flash-live-preview';
const VOICE = 'Puck'; // playful, warm — fits Apa's personality
const RESPONSE_TIMEOUT_MS = 15_000;
const MAX_PENDING_AUDIO_CHUNKS = 1_000;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export class GeminiVoiceProvider implements VoiceProvider {
  readonly name = 'Gemini Flash Live';
  readonly model = MODEL;

  private session: Session | null = null;
  private capture = new AudioCapture();
  private playback = new AudioPlayback();
  private events: VoiceProviderEvents | null = null;
  private capTimeout: ReturnType<typeof setTimeout> | null = null;
  private nearTimeout: ReturnType<typeof setTimeout> | null = null;
  private responseTimeout: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private chunksSent = 0;
  private turnEnded = false;
  private activityOpen = false;
  private pendingAudioChunks: ArrayBuffer[] = [];
  private responseComplete = false;
  private language: Language = 'es';

  async start(config: VoiceProviderConfig, events: VoiceProviderEvents): Promise<void> {
    await this.stopActiveSession();
    this.stopped = false;
    this.events = events;
    this.chunksSent = 0;
    this.turnEnded = false;
    this.activityOpen = false;
    this.pendingAudioChunks = [];
    this.responseComplete = false;
    this.language = config.initialLanguage;

    try {
      await this.capture.start((pcm16) => {
        if (this.stopped || this.turnEnded) return;
        if (!this.session || !this.activityOpen) {
          this.queueAudioChunk(pcm16);
          return;
        }
        this.sendAudioChunk(pcm16);
      });

      const isEphemeralToken = config.ephemeralToken.startsWith('auth_tokens/');
      const ai = new GoogleGenAI({
        apiKey: config.ephemeralToken,
        ...(isEphemeralToken ? { httpOptions: { apiVersion: 'v1alpha' } } : {}),
      });

      this.session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: `${config.systemPrompt}\n\n${activeLanguageInstruction(config.initialLanguage)}` }],
          },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: { disabled: true },
          },
        },
        callbacks: {
          onopen: () => {
            if (this.stopped) return;
            console.log('[gemini] open');
            const cap = config.maxConversationSeconds;
            this.nearTimeout = setTimeout(() => events.onTimeoutNearing(), (cap - 10) * 1000);
            this.capTimeout  = setTimeout(() => this.close('timeout'), cap * 1000);
          },
          onmessage: (msg) => this.handleMessage(msg),
          onerror: (e) => this.fail(new Error(String((e as ErrorEvent).message ?? e))),
          onclose: (e) => {
            if (!this.stopped) this.close((e as CloseEvent).code === 1000 ? 'user' : 'network', false);
          },
        },
      });

      this.session.sendRealtimeInput({ activityStart: {} });
      this.activityOpen = true;
      this.flushPendingAudioChunks();
      events.onListening();
    } catch (err) {
      await this.stopActiveSession();
      throw err;
    }
  }

  endTurn(): void {
    if (this.turnEnded || !this.session) return;
    this.turnEnded = true;
    console.log(`[gemini] endTurn → activityEnd (sent ${this.chunksSent} audio chunks)`);
    this.capture.stop();
    this.flushPendingAudioChunks();
    if (this.activityOpen) {
      this.session.sendRealtimeInput({ activityEnd: {} });
      this.activityOpen = false;
    }
    this.startResponseWatchdog();
    this.events?.onThinking();
  }

  private handleMessage(msg: { serverContent?: {
    modelTurn?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    turnComplete?: boolean;
    interrupted?: boolean;
  }}): void {
    if (this.stopped) return;
    const ev = this.events;
    if (!ev) return;

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      this.playback.interrupt();
      ev.onSpeakingEnd();
      this.maybeCompleteResponse();
    }

    const parts = sc.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
        this.clearResponseWatchdog();
        this.playback.enqueue(
          part.inlineData.data,
          () => ev.onSpeakingStart(),
          () => {
            if (!sc.interrupted) ev.onSpeakingEnd();
            this.maybeCompleteResponse();
          },
        );
      }
      if (part.text) ev.onTranscript({ role: 'ap', text: part.text });
    }

    if (sc.outputTranscription?.text) {
      this.clearResponseWatchdog();
      ev.onTranscript({ role: 'ap', text: sc.outputTranscription.text });
    }

    if (sc.inputTranscription?.text) {
      ev.onTranscript({ role: 'user', text: sc.inputTranscription.text });
      this.language = detectLanguage(sc.inputTranscription.text, this.language);
      ev.onLanguageDetected(this.language);
    }

    if (sc.turnComplete) {
      this.responseComplete = true;
      this.clearResponseWatchdog();
      this.maybeCompleteResponse();
    }
  }

  async stop(): Promise<void> {
    this.close('user');
  }

  private async stopActiveSession(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    this.capture.stop();
    this.playback.interrupt();
    try { this.session?.close(); } catch {}
    this.session = null;
    this.events = null;
    this.activityOpen = false;
    this.pendingAudioChunks = [];
  }

  private close(reason: 'user' | 'timeout' | 'error' | 'network' | 'complete', closeSocket = true): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    this.capture.stop();
    this.playback.interrupt();
    if (closeSocket) {
      try { this.session?.close(); } catch {}
    }
    this.session = null;
    this.activityOpen = false;
    this.pendingAudioChunks = [];
    this.responseComplete = false;
    this.events?.onEnd(reason);
    this.events = null;
  }

  private fail(err: Error): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    this.capture.stop();
    this.playback.interrupt();
    try { this.session?.close(); } catch {}
    this.session = null;
    this.activityOpen = false;
    this.pendingAudioChunks = [];
    this.responseComplete = false;
    this.events?.onError(err);
    this.events = null;
  }

  private maybeCompleteResponse(): void {
    if (!this.responseComplete || this.playback.isPlaying) return;
    this.close('complete');
  }

  private queueAudioChunk(pcm16: ArrayBuffer): void {
    this.pendingAudioChunks.push(pcm16);
    if (this.pendingAudioChunks.length > MAX_PENDING_AUDIO_CHUNKS) {
      this.pendingAudioChunks.shift();
    }
  }

  private flushPendingAudioChunks(): void {
    if (!this.session || !this.activityOpen) return;
    for (const chunk of this.pendingAudioChunks) {
      this.sendAudioChunk(chunk);
    }
    this.pendingAudioChunks = [];
  }

  private sendAudioChunk(pcm16: ArrayBuffer): void {
    if (!this.session) return;
    this.session.sendRealtimeInput({
      audio: { data: toBase64(pcm16), mimeType: 'audio/pcm;rate=16000' },
    });
    this.chunksSent++;
  }

  private startResponseWatchdog(): void {
    this.clearResponseWatchdog();
    this.responseTimeout = setTimeout(() => {
      this.fail(new Error(`Gemini Live did not return audio within ${RESPONSE_TIMEOUT_MS / 1000}s`));
    }, RESPONSE_TIMEOUT_MS);
  }

  private clearResponseWatchdog(): void {
    clearTimeout(this.responseTimeout ?? undefined);
    this.responseTimeout = null;
  }

  private clearTimers(): void {
    clearTimeout(this.capTimeout ?? undefined);
    clearTimeout(this.nearTimeout ?? undefined);
    this.clearResponseWatchdog();
    this.capTimeout = null;
    this.nearTimeout = null;
  }
}
