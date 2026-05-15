const STATUS_INTERVAL_FRAMES = 24_000;

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.queueSamples = 0;
    this.readIndex = 0;
    this.initialBufferSamples = 14_400;
    this.started = false;
    this.finishing = false;
    this.underrunCount = 0;
    this.framesSinceStatus = 0;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  handleMessage(message) {
    switch (message.type) {
      case 'configure':
        this.initialBufferSamples = Math.max(1, message.initialBufferSamples || this.initialBufferSamples);
        break;
      case 'append':
        if (message.samples?.length) {
          this.queue.push(message.samples);
          this.queueSamples += message.samples.length;
        }
        if (!this.started && this.queueSamples >= this.initialBufferSamples) {
          this.started = true;
          this.port.postMessage({ type: 'started', bufferedSamples: this.queueSamples });
        }
        break;
      case 'finish':
        this.finishing = true;
        if (!this.started && this.queueSamples > 0) {
          this.started = true;
          this.port.postMessage({ type: 'started', bufferedSamples: this.queueSamples });
        }
        if (this.queueSamples === 0) this.completeDrain();
        break;
      case 'reset':
        this.queue = [];
        this.queueSamples = 0;
        this.readIndex = 0;
        this.started = false;
        this.finishing = false;
        this.underrunCount = 0;
        this.framesSinceStatus = 0;
        break;
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;

    if (!this.started) {
      output.fill(0);
      return true;
    }

    for (let i = 0; i < output.length; i++) {
      if (this.queueSamples === 0) {
        output[i] = 0;
        if (this.finishing) {
          this.completeDrain();
        } else if (i === 0) {
          this.underrunCount++;
          this.port.postMessage({ type: 'underrun', underrunCount: this.underrunCount });
        }
        continue;
      }

      const head = this.queue[0];
      output[i] = head[this.readIndex++];
      this.queueSamples--;

      if (this.readIndex >= head.length) {
        this.queue.shift();
        this.readIndex = 0;
      }
    }

    this.framesSinceStatus += output.length;
    if (this.framesSinceStatus >= STATUS_INTERVAL_FRAMES) {
      this.framesSinceStatus = 0;
      this.port.postMessage({
        type: 'status',
        bufferedSamples: this.queueSamples,
        underrunCount: this.underrunCount,
      });
    }

    return true;
  }

  completeDrain() {
    if (!this.started && !this.finishing) return;
    this.queue = [];
    this.queueSamples = 0;
    this.readIndex = 0;
    this.started = false;
    this.finishing = false;
    this.port.postMessage({ type: 'drainComplete', underrunCount: this.underrunCount });
  }
}

registerProcessor('playback-processor', PlaybackProcessor);
