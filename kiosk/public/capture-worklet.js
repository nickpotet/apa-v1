// AudioWorklet processor: converts Float32 mic samples to Int16 (PCM16)
// and posts each buffer to the main thread via port.postMessage().
// Gemini Live expects PCM16 at 16 kHz mono — AudioCapture.ts sets that sample rate.
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const out = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(out.buffer, [out.buffer]);
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
