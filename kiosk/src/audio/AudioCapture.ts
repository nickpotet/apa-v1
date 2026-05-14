export type PcmChunkCallback = (pcm16: ArrayBuffer) => void;

export class AudioCapture {
  // sampleRate: 16000 for Gemini Live, 24000 for OpenAI Realtime
  constructor(private readonly sampleRate: 16000 | 24000 = 16000) {}

  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sink: GainNode | null = null;

  async start(onChunk: PcmChunkCallback): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: this.sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.ctx = new AudioContext({ sampleRate: this.sampleRate });
    await this.ctx.audioWorklet.addModule('/capture-worklet.js');
    this.node = new AudioWorkletNode(this.ctx, 'capture-processor');
    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => onChunk(e.data);
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.node);
    this.node.connect(this.sink).connect(this.ctx.destination);
  }

  stop(): void {
    this.source?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    this.source = null;
    this.node = null;
    this.sink = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
