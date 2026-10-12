// Capture mono samples directly; no browser-specific WebM/MP4 decoding needed.
class RobinerVoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.buffer = new Float32Array(1024);
    this.used = 0;
    this.port.onmessage = ({ data }) => {
      this.recording = data === 'start';
      if (data === 'flush') {
        this.flush();
        this.port.postMessage('flushed');
      }
    };
  }

  flush() {
    if (!this.used) return;
    const chunk = this.buffer.slice(0, this.used);
    this.port.postMessage(chunk, [chunk.buffer]);
    this.used = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!this.recording || !channels?.length) return true;
    for (let index = 0; index < channels[0].length; index++) {
      let sample = 0;
      for (const channel of channels) sample += channel[index];
      this.buffer[this.used++] = sample / channels.length;
      if (this.used === this.buffer.length) this.flush();
    }
    return true;
  }
}

registerProcessor('robiner-voice-capture', RobinerVoiceCapture);
