// Gemini Live adapter — implements VoiceProvider using @google/genai SDK.
// CLAUDE.md rule: this is the ONLY file allowed to import @google/genai.
// Model defaults to Gemini 3.1 Flash Live; override with VITE_GEMINI_MODEL.

import { GoogleGenAI, Modality } from '@google/genai';
import type { Session } from '@google/genai';
import type { VoiceProvider, VoiceProviderConfig, VoiceProviderEvents, Language } from './VoiceProvider';
import { AudioCapture } from '../../audio/AudioCapture';
import { AudioPlayback } from '../../audio/AudioPlayback';

const MODEL = import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-3.1-flash-live-preview';
const VOICE = 'Puck'; // playful, warm — fits Apa's personality
const RESPONSE_TIMEOUT_MS = 15_000;

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

  async start(config: VoiceProviderConfig, events: VoiceProviderEvents): Promise<void> {
    await this.stopActiveSession();
    this.stopped = false;
    this.events = events;
    this.chunksSent = 0;
    this.activityOpen = false;

    const inputMode = config.inputMode ?? 'audio';

    try {
      if (inputMode === 'audio') {
        await this.capture.start((pcm16) => {
          if (this.stopped || this.turnEnded || !this.session) return;
          this.session.sendRealtimeInput({
            audio: { data: toBase64(pcm16), mimeType: 'audio/pcm;rate=16000' },
          });
          this.chunksSent++;
        });
      }

      const ai = new GoogleGenAI({ apiKey: config.ephemeralToken });

      this.session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: config.systemPrompt }] },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          // PTT mode: disable auto-VAD, client sends activityStart/End explicitly.
          // Note: explicitVadSignal is Enterprise-only; use realtimeInputConfig instead.
          ...(inputMode === 'audio' ? {
            realtimeInputConfig: {
              automaticActivityDetection: { disabled: true },
            },
          } : {}),
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

      this.turnEnded = inputMode === 'text';

      if (inputMode === 'audio') {
        this.session.sendRealtimeInput({ activityStart: {} });
        this.activityOpen = true;
        events.onListening();
      }
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
    if (this.activityOpen) {
      this.session.sendRealtimeInput({ activityEnd: {} });
      this.activityOpen = false;
    }
    this.startResponseWatchdog();
    this.events?.onThinking();
  }

  sendText(text: string): void {
    if (!this.session) return;
    this.capture.stop();
    this.turnEnded = true;
    if (this.activityOpen) {
      this.session.sendRealtimeInput({ activityEnd: {} });
      this.activityOpen = false;
    }
    this.session.sendRealtimeInput({ text });
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
    }

    const parts = sc.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
        this.clearResponseWatchdog();
        this.playback.enqueue(
          part.inlineData.data,
          () => ev.onSpeakingStart(),
          () => { if (!sc.interrupted) ev.onSpeakingEnd(); },
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
      this.detectLanguage(sc.inputTranscription.text, ev);
    }

    if (sc.turnComplete) {
      this.clearResponseWatchdog();
      if (!this.playback.isPlaying) ev.onSpeakingEnd();
    }
  }

  private detectLanguage(text: string, ev: VoiceProviderEvents): void {
    let lang: Language = 'es';
    if (/[Ѐ-ӿ]/.test(text)) lang = 'ru';
    else if (/\b(el|la|els|les|un|una|de|del|al|i|que|és|per|amb)\b/i.test(text)) lang = 'ca';
    else if (!/\b(el|la|los|las|de|en|y|es|que|por|un|una)\b/i.test(text)) lang = 'en';
    ev.onLanguageDetected(lang);
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
  }

  private close(reason: 'user' | 'timeout' | 'error' | 'network', closeSocket = true): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    this.capture.stop();
    if (closeSocket) {
      try { this.session?.close(); } catch {}
    }
    this.session = null;
    this.activityOpen = false;
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
    this.events?.onError(err);
    this.events = null;
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
