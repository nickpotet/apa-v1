import { AudioCapture } from '../../audio/AudioCapture';
import { AudioPlayback } from '../../audio/AudioPlayback';
import type { VoiceProvider, VoiceProviderConfig, VoiceProviderEvents } from './VoiceProvider';

type GuideTurnResponse = {
  ok?: boolean;
  language?: VoiceProviderConfig['initialLanguage'];
  languageSource?: string;
  transcript?: string;
  text?: string;
  audioPcmBase64?: string;
  audioMimeType?: string;
  ttsError?: string | null;
  latencyMs?: number;
  inputStats?: Record<string, unknown>;
  models?: Record<string, string | null>;
  error?: string;
  message?: string;
};

const SAMPLE_RATE = 16_000;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function concatBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const buffer of buffers) {
    out.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return out.buffer;
}

function inspectPcm16(buffer: ArrayBuffer): { peak: number; samples: number } {
  const data = new Int16Array(buffer);
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]) / 0x7fff;
    if (abs > peak) peak = abs;
  }
  return {
    peak: Number(peak.toFixed(4)),
    samples: data.length,
  };
}

export class GuidePipelineProvider implements VoiceProvider {
  readonly name = 'Gemini Guide Pipeline';
  readonly model = 'guide-pipeline';
  readonly requiresToken = false;

  private capture = new AudioCapture(SAMPLE_RATE);
  private playback = new AudioPlayback();
  private events: VoiceProviderEvents | null = null;
  private config: VoiceProviderConfig | null = null;
  private chunks: ArrayBuffer[] = [];
  private stopped = true;
  private ending = false;
  private abort: AbortController | null = null;
  private browserSpeaking = false;

  warmupAudio(): Promise<void> {
    return this.playback.prepare();
  }

  async start(config: VoiceProviderConfig, events: VoiceProviderEvents): Promise<void> {
    await this.stop();
    this.config = config;
    this.events = events;
    this.chunks = [];
    this.stopped = false;
    this.ending = false;
    this.abort = null;

    events.onDebug?.('guide_pipeline_start_requested', {
      language: config.initialLanguage,
      languageLock: config.languageLock,
    });

    await this.capture.start((pcm16) => {
      if (this.stopped || this.ending) return;
      this.chunks.push(pcm16.slice(0));
      if (this.chunks.length === 1) {
        events.onDebug?.('guide_pipeline_first_audio_chunk_captured', inspectPcm16(pcm16));
      }
    }, (event, data) => events.onDebug?.(`guide_pipeline_${event}`, data));

    events.onDebug?.('guide_pipeline_capture_started');
    events.onListening();
  }

  endTurn(): void {
    if (this.stopped || this.ending) return;
    this.ending = true;
    void this.finishTurn();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.ending = false;
    this.abort?.abort();
    this.abort = null;
    this.capture.stop();
    this.playback.interrupt();
    if (this.browserSpeaking) {
      window.speechSynthesis?.cancel();
      this.browserSpeaking = false;
    }
  }

  private async finishTurn(): Promise<void> {
    const events = this.events;
    const config = this.config;
    if (!events || !config) return;

    this.capture.stop();
    const audio = concatBuffers(this.chunks);
    const stats = inspectPcm16(audio);
    events.onDebug?.('guide_pipeline_end_turn', {
      chunksCaptured: this.chunks.length,
      samples: stats.samples,
      peakInputLevel: stats.peak,
    });

    if (audio.byteLength < SAMPLE_RATE * 2 * 0.25) {
      this.fail(new Error('No microphone audio was captured for this turn'));
      return;
    }

    events.onThinking();
    const startedAt = performance.now();
    this.abort = new AbortController();

    try {
      events.onDebug?.('guide_pipeline_request_started', {
        audioBytes: audio.byteLength,
        sampleRate: SAMPLE_RATE,
      });
      const response = await fetch('/api/guide-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: this.abort.signal,
        body: JSON.stringify({
          audioPcmBase64: toBase64(audio),
          sampleRate: SAMPLE_RATE,
          initialLanguage: config.initialLanguage,
          languageLock: config.languageLock,
          systemPrompt: config.systemPrompt,
        }),
      });
      const data = await response.json() as GuideTurnResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.message || data.error || `guide-turn HTTP ${response.status}`);
      }
      if (this.stopped) return;

      events.onDebug?.('guide_pipeline_response_ready', {
        latencyMs: Math.round(performance.now() - startedAt),
        serverLatencyMs: data.latencyMs,
        language: data.language,
        languageSource: data.languageSource,
        audioMimeType: data.audioMimeType,
        ttsError: data.ttsError,
        inputStats: data.inputStats,
        models: data.models,
      });

      if (data.language) events.onLanguageDetected(data.language);
      if (data.transcript) events.onTranscript({ role: 'user', text: data.transcript });
      if (data.text) events.onTranscript({ role: 'ap', text: data.text });
      if (!data.audioPcmBase64) {
        this.speakWithBrowser(data.text || '', data.language ?? config.initialLanguage, events);
        return;
      }

      this.playback.startResponse(
        () => events.onSpeakingStart(),
        () => {
          if (this.stopped) return;
          this.stopped = true;
          this.ending = false;
          events.onSpeakingEnd();
          events.onEnd('complete');
        },
        (event, payload) => events.onDebug?.(event, payload),
      );
      this.playback.enqueuePcm(data.audioPcmBase64);
      this.playback.finishResponse();
    } catch (err) {
      if (this.stopped) return;
      this.fail(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.abort = null;
    }
  }

  private fail(error: Error): void {
    const events = this.events;
    this.stopped = true;
    this.ending = false;
    this.capture.stop();
    this.playback.interrupt();
    events?.onError(error);
  }

  private speakWithBrowser(
    text: string,
    language: VoiceProviderConfig['initialLanguage'],
    events: VoiceProviderEvents,
  ): void {
    if (!text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      throw new Error('guide-turn returned no audio and browser speech synthesis is unavailable');
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const langCode: Record<VoiceProviderConfig['initialLanguage'], string> = {
      es: 'es-ES',
      en: 'en-US',
      ru: 'ru-RU',
      ca: 'ca-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      uk: 'uk-UA',
      sr: 'sr-RS',
      it: 'it-IT',
      pl: 'pl-PL',
    };
    utterance.lang = langCode[language];
    utterance.rate = 1;
    utterance.pitch = 1.15;
    utterance.onstart = () => {
      if (this.stopped) return;
      this.browserSpeaking = true;
      events.onDebug?.('guide_pipeline_browser_tts_started', { language });
      events.onSpeakingStart();
    };
    utterance.onerror = (event) => {
      if (this.stopped) return;
      this.browserSpeaking = false;
      this.fail(new Error(`browser speech synthesis failed: ${event.error}`));
    };
    utterance.onend = () => {
      if (this.stopped) return;
      this.browserSpeaking = false;
      this.stopped = true;
      this.ending = false;
      events.onDebug?.('guide_pipeline_browser_tts_finished', { language });
      events.onSpeakingEnd();
      events.onEnd('complete');
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
}
