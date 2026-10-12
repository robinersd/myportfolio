import { createPcmRecorder } from './pcm-recorder.js?v=structure-40';

const MAX_SECONDS = 30;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 900000;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const AudioContext = window.AudioContext || window.webkitAudioContext;

export function readDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('This file could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPG, PNG or WebP photo.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Choose a photo smaller than 10 MB.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let blob;
    for (const quality of [0.85, 0.7, 0.55]) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_IMAGE_BYTES) break;
    }
    if (!blob || blob.size > MAX_IMAGE_BYTES)
      throw new Error('This photo is too large. Try a smaller image.');
    const dataUrl = await readDataUrl(blob);
    return { type: 'image', mimeType: 'image/jpeg', data: dataUrl.split(',')[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Portable, bounded PCM WAV keeps uploads readable across browser recording formats.
export function encodeMonoWav(channels, sourceRate) {
  const rate = 16000;
  const sourceLength = channels[0].length;
  const count = Math.floor((sourceLength * rate) / sourceRate);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const word = (offset, value) =>
    [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
  word(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  word(8, 'WAVE');
  word(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, 'data');
  view.setUint32(40, count * 2, true);
  for (let index = 0; index < count; index++) {
    const first = Math.floor((index * sourceRate) / rate);
    const end = Math.min(
      sourceLength,
      Math.max(first + 1, Math.floor(((index + 1) * sourceRate) / rate)),
    );
    let sample = 0;
    for (const channel of channels) {
      for (let position = first; position < end; position++) sample += channel[position];
    }
    sample = Math.max(-1, Math.min(1, sample / ((end - first) * channels.length)));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return buffer;
}

export async function preparePcmVoice(channels, sampleRate) {
  const duration = channels[0].length / sampleRate;
  if (duration < 0.2) throw new Error('The recording is too short. Please record again.');
  if (duration > MAX_SECONDS + 0.8) throw new Error('Use a voice clip of 30 seconds or less.');
  const wav = new Blob([encodeMonoWav(channels, sampleRate)], { type: 'audio/wav' });
  const dataUrl = await readDataUrl(wav);
  const waveform = Array.from({ length: 44 }, (_, index) => {
    const first = Math.floor((index * channels[0].length) / 44);
    const end = Math.floor(((index + 1) * channels[0].length) / 44);
    let peak = 0;
    for (let position = first; position < end; position += 16)
      peak = Math.max(peak, Math.abs(channels[0][position]));
    return Math.min(1, peak * 3);
  });
  return {
    type: 'audio',
    mimeType: 'audio/wav',
    data: dataUrl.split(',')[1],
    duration,
    transcript: '',
    waveform,
  };
}

async function prepareVoice(blob) {
  if (!AudioContext)
    throw new Error('Audio recording is not supported in this browser. Try Chrome or Edge.');
  if (!blob.size) throw new Error('No audio was captured. Please record again.');
  if (blob.size > MAX_SOURCE_BYTES) throw new Error('Choose a voice clip smaller than 10 MB.');
  const context = new AudioContext();
  try {
    let audio;
    try {
      audio = await context.decodeAudioData(await blob.arrayBuffer());
    } catch {
      throw new Error(
        'This browser could not prepare the recording. Please try recording in Chrome.',
      );
    }
    const channels = Array.from({ length: audio.numberOfChannels }, (_, index) =>
      audio.getChannelData(index),
    );
    return await preparePcmVoice(channels, audio.sampleRate);
  } finally {
    await context.close();
  }
}

const clock = (seconds) =>
  Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');

function voiceBars(values = []) {
  const wave = document.createElement('div');
  wave.className = 'chat-voice-wave';
  wave.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 44; index++) {
    const bar = document.createElement('i');
    bar.style.height = 3 + Math.min(1, values[index] || 0) * 19 + 'px';
    wave.append(bar);
  }
  return wave;
}

function playbackButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chat-voice-play';
  return button;
}

function playbackState(button, playing, label) {
  button.textContent = playing ? 'Ⅱ' : '▶';
  button.setAttribute('aria-label', label || (playing ? 'Pause voice note' : 'Play voice note'));
}

// The same compact player is used in drafts and right-aligned sent messages.
export function createVoicePlayer(item, onError = () => {}) {
  const capsule = document.createElement('div');
  capsule.className = 'chat-voice-capsule';
  const button = playbackButton();
  const audio = document.createElement('audio');
  audio.src = 'data:' + item.mimeType + ';base64,' + item.data;
  audio.preload = 'metadata';
  audio.hidden = true;
  const wave = voiceBars(item.waveform);
  const timer = document.createElement('span');
  timer.className = 'chat-voice-time';
  timer.textContent = clock(item.duration);
  playbackState(button, false);
  button.addEventListener('click', async () => {
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      onError('Playback is unavailable. Please try again.');
    }
  });
  audio.addEventListener('play', () => playbackState(button, true));
  audio.addEventListener('pause', () => playbackState(button, false));
  audio.addEventListener('ended', () => {
    playbackState(button, false);
    timer.textContent = clock(item.duration);
    [...wave.children].forEach((bar) => bar.classList.remove('is-played'));
  });
  audio.addEventListener('timeupdate', () => {
    timer.textContent = clock(audio.currentTime);
    [...wave.children].forEach((bar, index) => {
      bar.classList.toggle(
        'is-played',
        index / wave.children.length < audio.currentTime / item.duration,
      );
    });
  });
  capsule.append(button, wave, timer, audio);
  return capsule;
}

export function enableChatAttachments(panel, { onChange, onStatus, onPhotoReady }) {
  const photoInput = panel.querySelector('.chat-photo-input');
  const photoButton = panel.querySelector('.chat-attach-photo');
  const recordButton = panel.querySelector('.chat-record-voice');
  const discardButton = panel.querySelector('.chat-discard-voice');
  const voiceSlot = panel.querySelector('.chat-voice-slot');
  const form = panel.querySelector('form');
  const preview = panel.querySelector('.chat-attachments');
  let photo = null,
    voice = null,
    session = null;
  let busy = false,
    processing = false,
    revision = 0;

  function update() {
    const blocked = busy || processing;
    const voiceMode = Boolean(session || voice);
    form.classList.toggle('is-voice-mode', voiceMode);
    voiceSlot.hidden = discardButton.hidden = !voiceMode;
    photoButton.disabled = recordButton.disabled = blocked || voiceMode;
    discardButton.disabled = busy;
    voiceSlot.querySelectorAll('button').forEach((control) => {
      control.disabled = blocked || Boolean(session && (!session.recorder || session.stopping));
    });
    preview.querySelectorAll('button, textarea').forEach((control) => {
      control.disabled = blocked || Boolean(session);
    });
    onChange();
  }

  function clearPlayer() {
    voiceSlot.querySelectorAll('audio').forEach((audio) => audio.pause());
    voiceSlot.replaceChildren();
  }

  function render() {
    preview.replaceChildren();
    preview.hidden = !photo && !voice;
    if (photo) {
      const card = document.createElement('div');
      card.className = 'chat-attachment-preview';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chat-remove-attachment';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove photo');
      remove.addEventListener('click', () => {
        photo = null;
        render();
      });
      const image = document.createElement('img');
      image.src = 'data:' + photo.mimeType + ';base64,' + photo.data;
      image.alt = 'Selected photo to analyze';
      card.append(image, remove);
      const strip = document.createElement('div');
      strip.className = 'chat-photo-strip';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'chat-add-photo';
      add.textContent = '＋';
      add.setAttribute('aria-label', 'Add or replace photo');
      add.addEventListener('click', () => photoInput.click());
      strip.append(add, card);
      preview.append(strip);
    }
    if (!session) {
      clearPlayer();
      if (voice) {
        voiceSlot.append(createVoicePlayer(voice, onStatus));
        const details = document.createElement('details');
        details.className = 'chat-voice-review';
        details.open = !voice.transcript.trim();
        const summary = document.createElement('summary');
        summary.textContent = 'Review spoken words';
        const label = document.createElement('label');
        label.textContent = 'Words to analyze';
        const transcript = document.createElement('textarea');
        transcript.rows = 2;
        transcript.maxLength = 2000;
        transcript.value = voice.transcript;
        transcript.placeholder = 'Type the spoken words if transcription is unavailable.';
        transcript.setAttribute('aria-label', 'Voice transcript');
        transcript.addEventListener('input', () => {
          voice.transcript = transcript.value;
          update();
        });
        label.append(transcript);
        details.append(summary, label);
        preview.append(details);
      }
    }
    update();
  }

  photoButton.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    photoInput.value = '';
    if (!file || busy || processing || session) return;
    const id = ++revision;
    let selected = false;
    processing = true;
    update();
    onStatus('Preparing photo…');
    try {
      const item = await preparePhoto(file);
      if (id !== revision) return;
      photo = item;
      selected = true;
      render();
      onStatus('Photo ready. Add a question or send it for analysis.');
    } catch (error) {
      if (id === revision) onStatus(error.message);
    } finally {
      if (id === revision) {
        processing = false;
        update();
        if (selected && matchMedia('(max-width: 600px)').matches) onPhotoReady?.();
      }
    }
  });

  function releaseResources(active) {
    if (active.resourcesReleased) return;
    active.resourcesReleased = true;
    clearInterval(active.timer);
    clearTimeout(active.speechRestart);
    active.stream?.getTracks().forEach((track) => track.stop());
    active.meterSource?.disconnect();
    active.meter?.close().catch(() => {});
  }

  function stopRecording(discard = false) {
    const active = session;
    if (!active) return Promise.resolve();
    active.discard ||= discard;
    if (active.stopping && !discard) return active.done;
    active.stopping = true;
    clearInterval(active.timer);
    clearTimeout(active.speechRestart);
    try {
      active.recognition?.stop();
    } catch {
      active.resolveRecognition?.();
    }
    if (active.recorder && active.recorder.state !== 'inactive') active.recorder.stop();
    if (discard || !active.recorder) {
      active.recorder?.cancel?.();
      releaseResources(active);
      active.recognition?.abort();
      active.resolveDone();
      session = null;
      processing = false;
      render();
    } else {
      processing = true;
      update();
    }
    return active.done;
  }

  function elapsed(active) {
    return (
      active.elapsed +
      (active.recorder?.state === 'recording' ? performance.now() - active.started : 0)
    );
  }

  function pauseRecording() {
    const active = session;
    if (!active?.recorder || active.stopping) return;
    clearTimeout(active.speechRestart);
    if (active.recorder.state === 'recording') {
      active.elapsed = elapsed(active);
      active.recorder.pause();
      try {
        active.recognition?.stop();
      } catch {}
    } else if (active.recorder.state === 'paused') {
      active.started = performance.now();
      active.recorder.resume();
      active.speechPrefix = active.words;
      active.trackRecognition?.();
      try {
        active.recognition?.start();
      } catch {
        active.resolveRecognition?.();
      }
    }
    playbackState(
      active.pause,
      active.recorder.state === 'recording',
      active.recorder.state === 'recording' ? 'Pause recording' : 'Resume recording',
    );
    onStatus(active.recorder.state === 'paused' ? 'Recording paused.' : 'Recording…');
    update();
  }

  async function startRecording() {
    if (busy || processing || session || voice) return;
    if (!navigator.mediaDevices?.getUserMedia || (!AudioContext && !window.MediaRecorder)) {
      onStatus(
        'Microphone recording needs HTTPS or localhost. Open the HTTPS site in Chrome and allow microphone access.',
      );
      return;
    }
    const active = {
      chunks: [],
      words: '',
      speechPrefix: '',
      elapsed: 0,
      discard: false,
      stream: null,
      recorder: null,
    };
    active.done = new Promise((resolve) => {
      active.resolveDone = resolve;
    });
    session = active;
    clearPlayer();
    const capsule = document.createElement('div');
    capsule.className = 'chat-voice-capsule';
    active.pause = playbackButton();
    playbackState(active.pause, true, 'Pause recording');
    active.pause.addEventListener('click', () => {
      if (session === active) pauseRecording();
    });
    active.wave = voiceBars();
    active.time = document.createElement('span');
    active.time.className = 'chat-voice-time';
    active.time.textContent = '0:00';
    capsule.append(active.pause, active.wave, active.time);
    voiceSlot.append(capsule);
    update();
    onStatus('Allow microphone access to record.');
    try {
      active.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== active || active.discard || panel.hidden) {
        active.stream.getTracks().forEach((track) => track.stop());
        if (session === active) stopRecording(true);
        return;
      }
      try {
        active.recorder = await createPcmRecorder(active.stream);
      } catch {
        if (!window.MediaRecorder) throw new Error('Audio capture is unavailable.');
        const mimeType = [
          'audio/webm;codecs=opus',
          'audio/ogg;codecs=opus',
          'audio/mp4',
          'audio/webm',
        ].find((type) => window.MediaRecorder.isTypeSupported?.(type));
        active.recorder = new window.MediaRecorder(active.stream, mimeType ? { mimeType } : {});
      }
      if (session !== active || active.discard || panel.hidden) {
        active.recorder.cancel?.();
        releaseResources(active);
        return;
      }
      active.recorder.ondataavailable = (event) => {
        if (event.data.size) active.chunks.push(event.data);
      };
      active.recorder.onerror = () => {
        onStatus('Recording failed. Please try again.');
        stopRecording(true);
      };
      active.recorder.onstop = async () => {
        // Final data has arrived; stop the mic only after the recorder flushes.
        releaseResources(active);
        if (active.discard || session !== active) {
          active.resolveDone();
          return;
        }
        processing = true;
        update();
        onStatus('Preparing voice note…');
        let recognitionTimeout;
        try {
          if (active.recognition)
            await Promise.race([
              active.recognitionEnded,
              new Promise((resolve) => {
                recognitionTimeout = setTimeout(resolve, 1200);
              }),
            ]);
          clearTimeout(recognitionTimeout);
          active.recognition?.abort();
          const pcm = active.recorder.pcm;
          const item = pcm
            ? await preparePcmVoice(pcm.channels, pcm.sampleRate)
            : await prepareVoice(new Blob(active.chunks, { type: active.recorder.mimeType }));
          if (active.discard || session !== active) return;
          item.transcript = active.words.slice(0, 2000).trim();
          voice = item;
          onStatus(
            item.transcript
              ? 'Voice note ready. Review the words or send for analysis.'
              : 'No words detected. Enter the spoken words or record again.',
          );
        } catch (error) {
          if (!active.discard) onStatus(error.message);
        } finally {
          clearTimeout(recognitionTimeout);
          if (session === active) {
            session = null;
            processing = false;
            render();
          }
          active.resolveDone(Boolean(voice && session === null && !active.discard));
        }
      };
      if (SpeechRecognition) {
        active.recognition = new SpeechRecognition();
        active.recognition.lang = navigator.language || 'fil-PH';
        active.recognition.continuous = true;
        active.recognition.interimResults = true;
        active.trackRecognition = () => {
          active.recognitionEnded = new Promise((resolve) => {
            active.resolveRecognition = resolve;
          });
        };
        active.trackRecognition();
        active.recognition.onend = () => {
          active.resolveRecognition?.();
          if (
            active.stopping ||
            active.discard ||
            active.speechFailed ||
            active.recorder.state !== 'recording'
          )
            return;
          active.speechPrefix = active.words;
          active.trackRecognition();
          active.speechRestart = setTimeout(() => {
            if (
              active.stopping ||
              active.discard ||
              session !== active ||
              active.recorder.state !== 'recording'
            )
              return;
            try {
              active.recognition.start();
            } catch {
              active.resolveRecognition?.();
            }
          }, 150);
        };
        active.recognition.onresult = (event) => {
          const words = Array.from(event.results)
            .map((result) => result[0].transcript)
            .join(' ');
          active.words = [active.speechPrefix, words].filter(Boolean).join(' ');
        };
        active.recognition.onerror = (event) => {
          active.speechFailed = !['no-speech', 'aborted'].includes(event.error);
        };
        try {
          active.recognition.start();
        } catch {
          active.recognition = null;
        }
      }
      // A live amplitude meter, rather than a decorative looping waveform.
      try {
        active.meter = new AudioContext();
        active.analyser = active.meter.createAnalyser();
        active.analyser.fftSize = 256;
        active.meterSource = active.meter.createMediaStreamSource(active.stream);
        active.meterSource.connect(active.analyser);
        active.samples = new Uint8Array(active.analyser.fftSize);
        active.meter.resume().catch(() => {});
      } catch {
        active.analyser = null;
      }
      active.recorder.start(250);
      active.started = performance.now();
      const tick = () => {
        const seconds = Math.min(MAX_SECONDS, elapsed(active) / 1000);
        active.time.textContent = clock(seconds);
        if (active.analyser && active.recorder.state === 'recording')
          active.analyser.getByteTimeDomainData(active.samples);
        [...active.wave.children].forEach((bar, index) => {
          const sample =
            active.recorder.state === 'recording' && active.samples
              ? Math.abs(active.samples[index * 5] - 128) / 128
              : 0;
          bar.style.height = 3 + Math.min(1, sample * 4) * 19 + 'px';
        });
        if (seconds >= MAX_SECONDS) stopRecording();
      };
      active.timer = setInterval(tick, 125);
      tick();
      onStatus(
        SpeechRecognition
          ? 'Recording…'
          : 'Recording… You can enter the spoken words before sending.',
      );
      update();
    } catch (error) {
      stopRecording(true);
      onStatus(
        error.name === 'NotAllowedError'
          ? 'Allow microphone access in your browser to record.'
          : 'The microphone is unavailable. Try opening the HTTPS site in Chrome.',
      );
    }
  }
  recordButton.addEventListener('click', startRecording);
  discardButton.addEventListener('click', () => {
    if (busy) return;
    if (session) stopRecording(true);
    voice = null;
    render();
    onStatus('Voice note deleted.');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRecording();
  });
  window.addEventListener('pagehide', () => stopRecording(true));

  return {
    get hasAttachments() {
      return Boolean(photo || voice);
    },
    get canFinish() {
      return !busy && !processing && Boolean(session?.recorder && !session.stopping);
    },
    get ready() {
      return !processing && !session && (!voice || Boolean(voice.transcript.trim()));
    },
    finish: () => stopRecording(),
    snapshot: () => [photo, voice].filter(Boolean).map((item) => ({ ...item })),
    setBusy(value) {
      busy = value;
      update();
    },
    stop() {
      stopRecording(true);
      panel.querySelectorAll('audio').forEach((audio) => audio.pause());
    },
    clear() {
      revision++;
      stopRecording(true);
      processing = false;
      photo = voice = null;
      render();
    },
    restore(items) {
      photo = items.find((item) => item.type === 'image') || null;
      voice = items.find((item) => item.type === 'audio') || null;
      render();
    },
  };
}
