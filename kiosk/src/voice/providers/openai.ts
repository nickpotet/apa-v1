// OpenAI Realtime adapter — implements VoiceProvider using the Realtime WebSocket API.
// CLAUDE.md rule: this is the ONLY file allowed to import/use OpenAI's Realtime WS.
// Swap in App.tsx through VOICE_PROVIDER=openai for the Day 7 field-test bake-off.
import type { VoiceProvider, VoiceProviderConfig, VoiceProviderEvents } from './VoiceProvider';
import type { Language } from './VoiceProvider';
import { AudioCapture } from '../../audio/AudioCapture';
import { AudioPlayback } from '../../audio/AudioPlayback';
import { activeLanguageInstruction, detectLanguage } from '../languageDetection';

const MODEL = 'gpt-realtime';
const VOICE = 'verse'; // warm, natural — closest to Apa's personality in OpenAI voices
const RESPONSE_TIMEOUT_MS = 15_000;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

type RtEvent = Record<string, unknown>;

export class OpenAIRealtimeProvider implements VoiceProvider {
  readonly name = 'OpenAI Realtime';
  readonly model = MODEL;

  // OpenAI Realtime outputs at 24kHz; input also expects 24kHz PCM16.
  private capture  = new AudioCapture(24000);
  private playback = new AudioPlayback();
  private ws: WebSocket | null = null;
  private events: VoiceProviderEvents | null = null;
  private capTimeout:  ReturnType<typeof setTimeout> | null = null;
  private nearTimeout: ReturnType<typeof setTimeout> | null = null;
  private responseTimeout: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private responseComplete = false;
  private language: Language = 'es';

  async start(config: VoiceProviderConfig, events: VoiceProviderEvents): Promise<void> {
    await this.stopActiveSession();
    this.stopped = false;
    this.events  = events;
    this.responseComplete = false;
    this.language = config.initialLanguage;

    try {
      await this.capture.start((pcm16) => {
        if (this.stopped || this.ws?.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: toBase64(pcm16),
        }));
      });

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const ws = new WebSocket(
          `wss://api.openai.com/v1/realtime?model=${MODEL}`,
          ['realtime', `openai-insecure-api-key.${config.ephemeralToken}`, 'openai-beta.realtime=v1'],
        );
        this.ws = ws;

        const settleReject = (err: Error) => {
          if (!settled) {
            settled = true;
            reject(err);
          } else {
            this.fail(err);
          }
        };

        ws.onopen = () => {
          if (this.stopped) { ws.close(); return; }

          ws.send(JSON.stringify({
            type: 'session.update',
            session: {
              model: MODEL,
              instructions: `${config.systemPrompt}\n\n${activeLanguageInstruction(config.initialLanguage)}`,
              voice: VOICE,
              input_audio_format:  'pcm16',
              output_audio_format: 'pcm16',
              input_audio_transcription: { model: 'whisper-1' },
              turn_detection: null,
              modalities: ['text', 'audio'],
            },
          }));

          const cap = config.maxConversationSeconds;
          this.nearTimeout = setTimeout(() => events.onTimeoutNearing(), (cap - 10) * 1000);
          this.capTimeout  = setTimeout(() => this.close('timeout'), cap * 1000);

          events.onListening();
          settled = true;
          resolve();
        };

        ws.onmessage = (e) => this.handleMessage(JSON.parse(e.data as string) as RtEvent);
        ws.onerror = () => settleReject(new Error('OpenAI Realtime WebSocket error'));
        ws.onclose = (e) => {
          if (!this.stopped) this.close(e.code === 1000 ? 'user' : 'network', false);
        };
      });
    } catch (err) {
      await this.stopActiveSession();
      throw err;
    }
  }

  endTurn(): void {
    this.capture.stop();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      this.ws.send(JSON.stringify({ type: 'response.create' }));
    }
    this.startResponseWatchdog();
    this.events?.onThinking();
  }

  private handleMessage(msg: RtEvent): void {
    if (this.stopped) return;
    const ev = this.events;
    if (!ev) return;

    switch (msg.type) {
      case 'response.audio.delta': {
        const delta = msg.delta as string;
        this.clearResponseWatchdog();
        this.playback.enqueue(
          delta,
          () => ev.onSpeakingStart(),
          () => {
            ev.onSpeakingEnd();
            this.maybeCompleteResponse();
          },
        );
        break;
      }
      case 'response.audio_transcript.delta':
        // streaming transcript — log complete version below
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = msg.transcript as string;
        ev.onTranscript({ role: 'user', text: transcript });
        this.language = detectLanguage(transcript, this.language);
        ev.onLanguageDetected(this.language);
        break;
      }
      case 'response.output_item.done': {
        const item = msg.item as { content?: Array<{ transcript?: string }> };
        const text = item?.content?.find((c) => c.transcript)?.transcript;
        if (text) ev.onTranscript({ role: 'ap', text });
        break;
      }
      case 'response.done':
        this.responseComplete = true;
        this.clearResponseWatchdog();
        this.maybeCompleteResponse();
        break;
      case 'input_audio_buffer.speech_started':
        this.playback.interrupt();
        ev.onSpeakingEnd();
        this.maybeCompleteResponse();
        break;
      case 'error': {
        const err = msg.error as { message?: string };
        this.fail(new Error(err?.message ?? 'OpenAI Realtime error'));
        break;
      }
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
    try { this.ws?.close(1000); } catch {}
    this.ws = null;
    this.events = null;
  }

  private close(reason: 'user' | 'timeout' | 'error' | 'network' | 'complete', closeSocket = true): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    this.capture.stop();
    this.playback.interrupt();
    if (closeSocket) {
      try { this.ws?.close(1000); } catch {}
    }
    this.ws = null;
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
    try { this.ws?.close(1000); } catch {}
    this.ws = null;
    this.responseComplete = false;
    this.events?.onError(err);
    this.events = null;
  }

  private maybeCompleteResponse(): void {
    if (!this.responseComplete || this.playback.isPlaying) return;
    this.close('complete');
  }

  private startResponseWatchdog(): void {
    this.clearResponseWatchdog();
    this.responseTimeout = setTimeout(() => {
      this.fail(new Error(`OpenAI Realtime did not return audio within ${RESPONSE_TIMEOUT_MS / 1000}s`));
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
