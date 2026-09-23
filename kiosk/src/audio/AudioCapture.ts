export type PcmChunkCallback = (pcm16: ArrayBuffer) => void;
export type CaptureDebugCallback = (event: string, data?: Record<string, unknown>) => void;

import { configureSpeechTrack, speechAudioConstraints } from './speechCapture';

const SCRIPT_PROCESSOR_BUFFER_SIZE = 1024;

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function createAudioContext(targetSampleRate: number): AudioContext {
  const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
  if (!Ctor) throw new Error('AudioContext is not available');

  try {
    return new Ctor({ sampleRate: targetSampleRate });
  } catch {
    return new Ctor();
  }
}

function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input.slice();

  const ratio = fromRate / toRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const weight = position - left;
    output[i] = input[left] * (1 - weight) + input[right] * weight;
  }

  return output;
}

function toPcm16(samples: Float32Array): ArrayBuffer {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

export class AudioCapture {
  // Gemini expects 16kHz; OpenAI Realtime expects 24kHz.
  constructor(private readonly sampleRate: 16000 | 24000 = 16000) {}

  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private highPass: BiquadFilterNode | null = null;
  private sink: GainNode | null = null;

  async start(onChunk: PcmChunkCallback, onDebug?: CaptureDebugCallback): Promise<void> {
    this.stop();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: speechAudioConstraints(),
    });

    const track = this.stream.getAudioTracks()[0];
    if (!track) throw new Error('Microphone stream has no audio track');
    const processing = await configureSpeechTrack(track);
    onDebug?.('capture_speech_processing', processing);

    this.ctx = createAudioContext(this.sampleRate);
    if (this.ctx.state === 'suspended') {
      // Await it: a fire-and-forget resume() can leave the context suspended,
      // in which case onaudioprocess never fires and the turn captures silence.
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn('[capture] AudioContext.resume failed', e);
      }
      onDebug?.('capture_context_state', { state: this.ctx.state });
    }

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.highPass = this.ctx.createBiquadFilter();
    this.highPass.type = 'highpass';
    this.highPass.frequency.value = 90;
    this.highPass.Q.value = 0.7;
    this.processor = this.ctx.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;

    this.processor.onaudioprocess = (event) => {
      if (!this.ctx) return;
      const channel = event.inputBuffer.getChannelData(0);
      const resampled = resampleLinear(channel, this.ctx.sampleRate, this.sampleRate);
      onChunk(toPcm16(resampled));
    };

    this.source.connect(this.highPass).connect(this.processor);
    this.processor.connect(this.sink).connect(this.ctx.destination);
    onDebug?.('capture_high_pass_enabled', { frequencyHz: 90, q: 0.7 });
  }

  stop(): void {
    this.source?.disconnect();
    this.highPass?.disconnect();
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.sink?.disconnect();
    this.source = null;
    this.highPass = null;
    this.processor = null;
    this.sink = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
