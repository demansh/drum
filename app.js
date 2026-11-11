const STEP_COUNT = 16;
const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.1;
const STORAGE_KEY = "drum16.state";

const TRACKS = [
  { id: "kick", name: "Kick", key: "1", play: playKick },
  { id: "snare", name: "Snare", key: "2", play: playSnare },
  { id: "clap", name: "Clap", key: "3", play: playClap },
  { id: "hat", name: "Hi-Hat", key: "4", play: playClosedHat },
  { id: "openhat", name: "Open Hat", key: "5", play: playOpenHat },
  { id: "tom", name: "Tom", key: "6", play: playTom },
];

const DEFAULT_PATTERN = {
  kick: [0, 4, 8, 12],
  snare: [4, 12],
  hat: [0, 2, 4, 6, 8, 10, 12, 14],
};

const state = {
  bpm: 120,
  swing: 0,
  pattern: TRACKS.map(() => new Array(STEP_COUNT).fill(false)),
  volumes: TRACKS.map(() => 0.8),
};

const audio = {
  context: null,
  noiseBuffer: null,
  trackGains: [],
};

const transport = {
  isPlaying: false,
  currentStep: 0,
  nextStepTime: 0,
  timerId: null,
  visualQueue: [],
  lastDrawnStep: -1,
};

const elements = {
  sequencer: document.getElementById("sequencer"),
  playButton: document.getElementById("play-button"),
  bpmInput: document.getElementById("bpm-input"),
  bpmValue: document.getElementById("bpm-value"),
  swingInput: document.getElementById("swing-input"),
  swingValue: document.getElementById("swing-value"),
  clearButton: document.getElementById("clear-button"),
  randomButton: document.getElementById("random-button"),
  shareButton: document.getElementById("share-button"),
  stepButtons: [],
  volumeInputs: [],
};

function ensureAudio() {
  if (!audio.context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported in this browser");
    }
    audio.context = new AudioContextClass();
    audio.noiseBuffer = createNoiseBuffer(audio.context);

    const compressor = audio.context.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.ratio.value = 4;
    compressor.connect(audio.context.destination);

    audio.trackGains = TRACKS.map((_, index) => {
      const gain = audio.context.createGain();
      gain.gain.value = state.volumes[index];
      gain.connect(compressor);
      return gain;
    });
  }
  if (audio.context.state === "suspended") {
    audio.context.resume().catch((error) => console.error("Failed to resume audio", error));
  }
  return audio.context;
}

function createNoiseBuffer(context) {
  const length = context.sampleRate;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createNoiseSource(context) {
  const source = context.createBufferSource();
  source.buffer = audio.noiseBuffer;
  return source;
}

function createEnvelope(context, time, peak, decaySeconds) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(peak, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + decaySeconds);
  return gain;
}

function playKick(context, destination, time) {
  const oscillator = context.createOscillator();
  const envelope = createEnvelope(context, time, 1, 0.5);
  oscillator.frequency.setValueAtTime(150, time);
  oscillator.frequency.exponentialRampToValueAtTime(40, time + 0.15);
  oscillator.connect(envelope).connect(destination);
  oscillator.start(time);
  oscillator.stop(time + 0.5);
}

function playSnare(context, destination, time) {
  const noise = createNoiseSource(context);
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = 1000;
  const noiseEnvelope = createEnvelope(context, time, 0.7, 0.2);
  noise.connect(noiseFilter).connect(noiseEnvelope).connect(destination);
  noise.start(time);
  noise.stop(time + 0.2);

  const body = context.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(180, time);
  const bodyEnvelope = createEnvelope(context, time, 0.6, 0.1);
  body.connect(bodyEnvelope).connect(destination);
  body.start(time);
  body.stop(time + 0.1);
}

function playClap(context, destination, time) {
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1500;
  filter.Q.value = 0.8;
  filter.connect(destination);

  [0, 0.01, 0.02].forEach((offset, index) => {
    const burstTime = time + offset;
    const isTail = index === 2;
    const decay = isTail ? 0.2 : 0.01;
    const noise = createNoiseSource(context);
    const envelope = createEnvelope(context, burstTime, 1, decay);
    noise.connect(envelope).connect(filter);
    noise.start(burstTime);
    noise.stop(burstTime + decay);
  });
}

function playHat(context, destination, time, decaySeconds) {
  const noise = createNoiseSource(context);
  const filter = context.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 7000;
  const envelope = createEnvelope(context, time, 0.4, decaySeconds);
  noise.connect(filter).connect(envelope).connect(destination);
  noise.start(time);
  noise.stop(time + decaySeconds);
}

function playClosedHat(context, destination, time) {
  playHat(context, destination, time, 0.05);
}

function playOpenHat(context, destination, time) {
  playHat(context, destination, time, 0.3);
}

function playTom(context, destination, time) {
  const oscillator = context.createOscillator();
  const envelope = createEnvelope(context, time, 0.8, 0.35);
  oscillator.frequency.setValueAtTime(220, time);
  oscillator.frequency.exponentialRampToValueAtTime(100, time + 0.3);
  oscillator.connect(envelope).connect(destination);
  oscillator.start(time);
  oscillator.stop(time + 0.35);
}

function triggerTrack(trackIndex, time) {
  const context = ensureAudio();
  TRACKS[trackIndex].play(context, audio.trackGains[trackIndex], time ?? context.currentTime);
}

function getStepDurationSeconds() {
  return 60 / state.bpm / 4;
}

function getSwingOffsetSeconds(step) {
  const isOffbeat = step % 2 === 1;
  return isOffbeat ? getStepDurationSeconds() * (state.swing / 100) * 0.5 : 0;
}

function scheduleStep(step, time) {
  const playTime = time + getSwingOffsetSeconds(step);
  state.pattern.forEach((steps, trackIndex) => {
    if (steps[step]) {
      triggerTrack(trackIndex, playTime);
    }
  });
  transport.visualQueue.push({ step, time: playTime });
}

function runScheduler() {
  const context = audio.context;
  while (transport.nextStepTime < context.currentTime + SCHEDULE_AHEAD_SECONDS) {
    scheduleStep(transport.currentStep, transport.nextStepTime);
    transport.nextStepTime += getStepDurationSeconds();
    transport.currentStep = (transport.currentStep + 1) % STEP_COUNT;
  }
}

function drawPlayhead() {
  if (!transport.isPlaying) {
    return;
  }
  const now = audio.context.currentTime;
  let stepToDraw = transport.lastDrawnStep;
  while (transport.visualQueue.length && transport.visualQueue[0].time <= now) {
    stepToDraw = transport.visualQueue.shift().step;
  }
  if (stepToDraw !== transport.lastDrawnStep) {
    highlightStep(stepToDraw);
    transport.lastDrawnStep = stepToDraw;
  }
  requestAnimationFrame(drawPlayhead);
}

function highlightStep(step) {
  elements.stepButtons.forEach((row) => {
    row.forEach((button, index) => button.classList.toggle("step--current", index === step));
  });
}

function startPlayback() {
  const context = ensureAudio();
  transport.isPlaying = true;
  transport.currentStep = 0;
  transport.nextStepTime = context.currentTime + 0.05;
  transport.visualQueue = [];
  transport.lastDrawnStep = -1;
  runScheduler();
  transport.timerId = setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
  elements.playButton.textContent = "■ Stop";
  requestAnimationFrame(drawPlayhead);
}

function stopPlayback() {
  transport.isPlaying = false;
  clearInterval(transport.timerId);
  transport.timerId = null;
  highlightStep(-1);
  elements.playButton.textContent = "▶ Play";
}

function togglePlayback() {
  try {
    if (transport.isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

function encodeState() {
  const rows = state.pattern.map((steps) =>
    steps
      .reduce((bits, isActive, index) => (isActive ? bits | (1 << index) : bits), 0)
      .toString(16)
      .padStart(4, "0"),
  );
  return [state.bpm, state.swing, rows.join("")].join("-");
}

function decodeState(encoded) {
  const match = /^(\d{2,3})-(\d{1,2})-([0-9a-f]+)$/i.exec(encoded ?? "");
  if (!match) {
    return null;
  }
  const [, bpmText, swingText, rowsText] = match;
  if (rowsText.length !== TRACKS.length * 4) {
    return null;
  }
  const bpm = clamp(Number(bpmText), 60, 200);
  const swing = clamp(Number(swingText), 0, 60);
  const pattern = TRACKS.map((_, trackIndex) => {
    const bits = parseInt(rowsText.slice(trackIndex * 4, trackIndex * 4 + 4), 16);
    return Array.from({ length: STEP_COUNT }, (_, step) => (bits & (1 << step)) !== 0);
  });
  return { bpm, swing, pattern };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function persistState() {
  const encoded = encodeState();
  history.replaceState(null, "", `#${encoded}`);
  try {
    localStorage.setItem(STORAGE_KEY, encoded);
  } catch (error) {
    console.warn("Unable to save state to localStorage", error);
  }
}

function loadInitialState() {
  const fromHash = decodeState(location.hash.slice(1));
  if (fromHash) {
    return fromHash;
  }
  try {
    const fromStorage = decodeState(localStorage.getItem(STORAGE_KEY));
    if (fromStorage) {
      return fromStorage;
    }
  } catch (error) {
    console.warn("Unable to read state from localStorage", error);
  }
  return null;
}

function applyDefaultPattern() {
  TRACKS.forEach((track, trackIndex) => {
    (DEFAULT_PATTERN[track.id] ?? []).forEach((step) => {
      state.pattern[trackIndex][step] = true;
    });
  });
}

function renderSequencer() {
  const fragment = document.createDocumentFragment();
  TRACKS.forEach((track, trackIndex) => {
    const row = document.createElement("div");
    row.className = "track";

    const nameButton = document.createElement("button");
    nameButton.type = "button";
    nameButton.className = "track__name";
    nameButton.textContent = `${track.key}. ${track.name}`;
    nameButton.addEventListener("click", () => triggerTrack(trackIndex));
    row.append(nameButton);

    const volumeInput = document.createElement("input");
    volumeInput.type = "range";
    volumeInput.min = "0";
    volumeInput.max = "1";
    volumeInput.step = "0.01";
    volumeInput.value = String(state.volumes[trackIndex]);
    volumeInput.className = "track__volume";
    volumeInput.setAttribute("aria-label", `${track.name} volume`);
    volumeInput.addEventListener("input", () => setVolume(trackIndex, Number(volumeInput.value)));
    elements.volumeInputs.push(volumeInput);
    row.append(volumeInput);

    const stepRow = [];
    for (let step = 0; step < STEP_COUNT; step++) {
      const stepButton = document.createElement("button");
      stepButton.type = "button";
      stepButton.className = "step";
      stepButton.classList.toggle("step--beat", step % 4 === 0);
      stepButton.setAttribute("aria-label", `${track.name} step ${step + 1}`);
      stepButton.addEventListener("click", () => toggleStep(trackIndex, step));
      stepRow.push(stepButton);
      row.append(stepButton);
    }
    elements.stepButtons.push(stepRow);
    fragment.append(row);
  });
  elements.sequencer.replaceChildren(fragment);
}

function renderPattern() {
  state.pattern.forEach((steps, trackIndex) => {
    steps.forEach((isActive, step) => {
      const button = elements.stepButtons[trackIndex][step];
      button.classList.toggle("step--active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  });
}

function renderControls() {
  elements.bpmInput.value = String(state.bpm);
  elements.bpmValue.textContent = String(state.bpm);
  elements.swingInput.value = String(state.swing);
  elements.swingValue.textContent = String(state.swing);
}

function toggleStep(trackIndex, step) {
  const isActive = !state.pattern[trackIndex][step];
  state.pattern[trackIndex][step] = isActive;
  renderPattern();
  persistState();
  if (isActive && !transport.isPlaying) {
    triggerTrack(trackIndex);
  }
}

function setVolume(trackIndex, volume) {
  state.volumes[trackIndex] = volume;
  if (audio.trackGains[trackIndex]) {
    audio.trackGains[trackIndex].gain.setTargetAtTime(volume, audio.context.currentTime, 0.01);
  }
}

function clearPattern() {
  state.pattern = TRACKS.map(() => new Array(STEP_COUNT).fill(false));
  renderPattern();
  persistState();
}

function randomizePattern() {
  const densityByTrack = { kick: 0.3, snare: 0.15, clap: 0.1, hat: 0.6, openhat: 0.1, tom: 0.1 };
  state.pattern = TRACKS.map((track) =>
    Array.from({ length: STEP_COUNT }, () => Math.random() < (densityByTrack[track.id] ?? 0.2)),
  );
  state.pattern[0][0] = true;
  renderPattern();
  persistState();
}

async function shareLink() {
  persistState();
  const originalLabel = elements.shareButton.textContent;
  try {
    await navigator.clipboard.writeText(location.href);
    elements.shareButton.textContent = "Copied!";
  } catch (error) {
    console.warn("Clipboard unavailable", error);
    prompt("Скопируйте ссылку:", location.href);
  }
  setTimeout(() => {
    elements.shareButton.textContent = originalLabel;
  }, 1500);
}

function isTypingTarget(target) {
  return target instanceof HTMLInputElement && target.type !== "range";
}

function handleKeydown(event) {
  if (event.repeat || isTypingTarget(event.target) || event.metaKey || event.ctrlKey) {
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
    return;
  }
  const trackIndex = TRACKS.findIndex((track) => track.key === event.key);
  if (trackIndex !== -1) {
    triggerTrack(trackIndex);
  }
}

function bindControls() {
  elements.playButton.addEventListener("click", togglePlayback);
  elements.bpmInput.addEventListener("input", () => {
    state.bpm = clamp(Number(elements.bpmInput.value), 60, 200);
    renderControls();
    persistState();
  });
  elements.swingInput.addEventListener("input", () => {
    state.swing = clamp(Number(elements.swingInput.value), 0, 60);
    renderControls();
    persistState();
  });
  elements.clearButton.addEventListener("click", clearPattern);
  elements.randomButton.addEventListener("click", randomizePattern);
  elements.shareButton.addEventListener("click", shareLink);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("keyup", (event) => {
    if (event.code === "Space" && !isTypingTarget(event.target)) {
      event.preventDefault();
    }
  });
}

function init() {
  const initialState = loadInitialState();
  if (initialState) {
    Object.assign(state, initialState);
  } else {
    applyDefaultPattern();
  }
  renderSequencer();
  renderPattern();
  renderControls();
  bindControls();
}

init();
