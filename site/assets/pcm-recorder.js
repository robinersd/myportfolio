const AudioContext = window.AudioContext || window.webkitAudioContext;

export async function createPcmRecorder(stream) {
  if (!AudioContext) throw new Error('PCM capture is unavailable.');
  const context = new AudioContext();
  const chunks = [];
  let source, processor, silence, flushDone;
  let count = 0,
    disposed = false,
    flushTimer;
  const recorder = { state: 'inactive', mimeType: 'audio/wav', pcm: null };
  const maxSamples = Math.floor(context.sampleRate * 30);

  function append(samples) {
    if (disposed || count >= maxSamples) return;
    const chunk = samples.slice(0, maxSamples - count);
    chunks.push(chunk);
    count += chunk.length;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(flushTimer);
    flushDone?.();
    source?.disconnect();
    processor?.disconnect();
    silence?.disconnect();
    if (processor?.port) processor.port.onmessage = null;
    if (processor) processor.onaudioprocess = null;
    context.close().catch(() => {});
  }

  try {
    source = context.createMediaStreamSource(stream);
    silence = context.createGain();
    silence.gain.value = 0; // Never play the microphone back to the visitor.
    if (context.audioWorklet && window.AudioWorkletNode) {
      try {
        await context.audioWorklet.addModule(
          new URL('./pcm-worklet.js?v=structure-40', import.meta.url),
        );
        processor = new window.AudioWorkletNode(context, 'robiner-voice-capture');
        processor.port.onmessage = ({ data }) => {
          if (data === 'flushed') flushDone?.();
          else append(data);
        };
      } catch {
        processor = null;
      }
    }
    // Older embedded browsers retain the ScriptProcessor API.
    if (!processor) {
      processor = context.createScriptProcessor(1024, 1, 1);
      processor.onaudioprocess = (event) => {
        if (recorder.state === 'recording') append(event.inputBuffer.getChannelData(0));
      };
    }
    source.connect(processor);
    processor.connect(silence);
    silence.connect(context.destination);
    let resumeTimer;
    try {
      await Promise.race([
        context.resume(),
        new Promise((_, reject) => {
          resumeTimer = setTimeout(() => reject(new Error('Audio capture could not start.')), 2000);
        }),
      ]);
    } finally {
      clearTimeout(resumeTimer);
    }
    if (context.state !== 'running') throw new Error('Audio capture could not start.');
  } catch (error) {
    dispose();
    throw error;
  }

  const setState = (state) => {
    recorder.state = state;
    processor.port?.postMessage(state === 'recording' ? 'start' : 'pause');
  };
  recorder.start = () => setState('recording');
  recorder.pause = () => setState('paused');
  recorder.resume = () => setState('recording');
  recorder.cancel = () => {
    recorder.state = 'inactive';
    chunks.length = 0;
    dispose();
  };
  recorder.stop = () => {
    if (recorder.state === 'inactive') return;
    recorder.state = 'inactive';
    (async () => {
      if (processor.port)
        await new Promise((resolve) => {
          flushDone = resolve;
          flushTimer = setTimeout(resolve, 500);
          processor.port.postMessage('flush');
        });
      if (disposed) return;
      const samples = new Float32Array(count);
      let offset = 0;
      for (const chunk of chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }
      recorder.pcm = { channels: [samples], sampleRate: context.sampleRate };
      chunks.length = 0;
      dispose();
      await recorder.onstop?.();
    })().catch(() => {
      dispose();
      recorder.onerror?.();
    });
  };
  return recorder;
}
