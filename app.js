import { INSTRUMENTS, createDefaultParams, createNoiseBuffer } from "./instruments.js?v=__VERSION__";
import { createKnob } from "./knob.js?v=__VERSION__";
import { clamp, fromPosition, toPosition } from "./param-scale.js?v=__VERSION__";
import { SCALE_NAME } from "./pentatonic.js?v=__VERSION__";
import { createStringPad } from "./string-pad.js?v=__VERSION__";

const STEP_COUNT = 16;
const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.1;
const STORAGE_KEY = "drum16.state";
const DEFAULT_VOLUME = 0.8;
const BPM_RANGE = { min: 60, max: 200 };
const SWING_RANGE = { min: 0, max: 60 };
const STRING_VOLUME = 0.8;

const SKIP_SPEC = {
  id: "skip",
  label: "Skip",
  min: 0,
  max: 1,
  default: 0,
  scale: "linear",
  format: (value) => `${Math.round(value * 100)}%`,
};

const TRACKS = INSTRUMENTS;

const DEFAULT_PATTERN = {
  kick: [0, 4, 8, 12],
  snare: [4, 12],
  hat: [0, 2, 4, 6, 8, 10, 12, 14],
};

const state = {
  bpm: 120,
  swing: 0,
  skip: SKIP_SPEC.default,
  pattern: createEmptyPattern(),
  volumes: TRACKS.map(() => DEFAULT_VOLUME),
  params: TRACKS.map(createDefaultParams),
};

const audio = {
  context: null,
  noiseBuffer: null,
  trackGains: [],
  stringGain: null,
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
  skipKnobSlot: document.getElementById("skip-knob-slot"),
  stringButton: document.getElementById("string-button"),
  stringNote: document.getElementById("string-note"),
  stringScale: document.getElementById("string-scale"),
  stepButtons: [],
};

function createEmptyPattern() {
  return TRACKS.map(() => new Array(STEP_COUNT).fill(false));
}

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

    audio.stringGain = audio.context.createGain();
    audio.stringGain.gain.value = STRING_VOLUME;
    audio.stringGain.connect(compressor);
  }
  if (audio.context.state === "suspended") {
    audio.context.resume().catch((error) => console.error("Failed to resume audio", error));
  }
  return audio.context;
}

function triggerTrack(trackIndex, time) {
  const context = ensureAudio();
  TRACKS[trackIndex].play(context, {
    destination: audio.trackGains[trackIndex],
    time: time ?? context.currentTime,
    noiseBuffer: audio.noiseBuffer,
    params: state.params[trackIndex],
  });
}

function previewTrack(trackIndex) {
  try {
    triggerTrack(trackIndex);
  } catch (error) {
    console.error(error);
  }
}

function getStepDurationSeconds() {
  return 60 / state.bpm / 4;
}

function getSwingOffsetSeconds(step) {
  const isOffbeat = step % 2 === 1;
  return isOffbeat ? getStepDurationSeconds() * (state.swing / 100) * 0.5 : 0;
}

function shouldSkipHit() {
  return state.skip > 0 && Math.random() < state.skip;
}

function scheduleStep(step, time) {
  const playTime = time + getSwingOffsetSeconds(step);
  state.pattern.forEach((steps, trackIndex) => {
    if (steps[step] && !shouldSkipHit()) {
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

function positionToHexByte(position) {
  return Math.round(clamp(position, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
}

function encodePattern() {
  return state.pattern
    .map((steps) =>
      steps
        .reduce((bits, isActive, index) => (isActive ? bits | (1 << index) : bits), 0)
        .toString(16)
        .padStart(4, "0"),
    )
    .join("");
}

function encodeSound() {
  return TRACKS.map((track, trackIndex) =>
    [
      positionToHexByte(state.volumes[trackIndex]),
      ...track.params.map((spec) => positionToHexByte(toPosition(state.params[trackIndex][spec.id], spec))),
    ].join(""),
  ).join("");
}

function encodeState() {
  return [state.bpm, state.swing, encodePattern(), encodeSound(), Math.round(state.skip * 100)].join("-");
}

function decodePattern(patternText) {
  if (patternText.length !== TRACKS.length * 4) {
    return null;
  }
  return TRACKS.map((_, trackIndex) => {
    const bits = parseInt(patternText.slice(trackIndex * 4, trackIndex * 4 + 4), 16);
    return Array.from({ length: STEP_COUNT }, (_, step) => (bits & (1 << step)) !== 0);
  });
}

function decodeSound(soundText) {
  const expectedLength = TRACKS.reduce((total, track) => total + (1 + track.params.length) * 2, 0);
  if (!soundText || soundText.length !== expectedLength) {
    return null;
  }
  let offset = 0;
  const readPosition = () => {
    const position = parseInt(soundText.slice(offset, offset + 2), 16) / 255;
    offset += 2;
    return position;
  };
  const volumes = [];
  const params = TRACKS.map((track) => {
    volumes.push(readPosition());
    return Object.fromEntries(track.params.map((spec) => [spec.id, fromPosition(readPosition(), spec)]));
  });
  return { volumes, params };
}

function decodeState(encoded) {
  const match = /^(\d{2,3})-(\d{1,2})-([0-9a-f]+)(?:-([0-9a-f]+)(?:-(\d{1,3}))?)?$/i.exec(encoded ?? "");
  if (!match) {
    return null;
  }
  const [, bpmText, swingText, patternText, soundText, skipText] = match;
  const pattern = decodePattern(patternText);
  if (!pattern) {
    return null;
  }
  return {
    bpm: clamp(Number(bpmText), BPM_RANGE.min, BPM_RANGE.max),
    swing: clamp(Number(swingText), SWING_RANGE.min, SWING_RANGE.max),
    skip: skipText ? clamp(Number(skipText), 0, 100) / 100 : SKIP_SPEC.default,
    pattern,
    ...decodeSound(soundText),
  };
}

function persistState() {
  const encoded = encodeState();
  try {
    history.replaceState(null, "", `#${encoded}`);
  } catch (error) {
    console.warn("Unable to update URL", error);
  }
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
    return decodeState(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    console.warn("Unable to read state from localStorage", error);
    return null;
  }
}

function applyDefaultPattern() {
  TRACKS.forEach((track, trackIndex) => {
    (DEFAULT_PATTERN[track.id] ?? []).forEach((step) => {
      state.pattern[trackIndex][step] = true;
    });
  });
}

function createTrackHeader(track, trackIndex, knobsPanel) {
  const header = document.createElement("div");
  header.className = "track__header";

  const nameButton = document.createElement("button");
  nameButton.type = "button";
  nameButton.className = "track__name";
  nameButton.textContent = track.name;
  nameButton.addEventListener("click", () => previewTrack(trackIndex));

  const volumeInput = document.createElement("input");
  volumeInput.type = "range";
  volumeInput.min = "0";
  volumeInput.max = "1";
  volumeInput.step = "0.01";
  volumeInput.value = String(state.volumes[trackIndex]);
  volumeInput.className = "track__volume";
  volumeInput.setAttribute("aria-label", `${track.name} volume`);
  volumeInput.addEventListener("input", () => setVolume(trackIndex, Number(volumeInput.value)));
  volumeInput.addEventListener("change", persistState);

  const soundToggle = document.createElement("button");
  soundToggle.type = "button";
  soundToggle.className = "track__toggle";
  soundToggle.textContent = "⚙︎";
  soundToggle.setAttribute("aria-label", `${track.name} sound settings`);
  soundToggle.setAttribute("aria-controls", knobsPanel.id);
  soundToggle.setAttribute("aria-expanded", "false");
  soundToggle.addEventListener("click", () => {
    const isExpanded = knobsPanel.hidden;
    knobsPanel.hidden = !isExpanded;
    soundToggle.setAttribute("aria-expanded", String(isExpanded));
  });

  header.append(nameButton, volumeInput, soundToggle);
  return header;
}

function createKnobsPanel(track, trackIndex) {
  const panel = document.createElement("div");
  panel.className = "track__knobs";
  panel.id = `knobs-${track.id}`;
  panel.hidden = true;
  track.params.forEach((spec) => {
    const knob = createKnob({
      spec,
      value: state.params[trackIndex][spec.id],
      onInput: (value) => {
        state.params[trackIndex][spec.id] = value;
      },
      onCommit: () => {
        persistState();
        if (!transport.isPlaying) {
          previewTrack(trackIndex);
        }
      },
    });
    panel.append(knob.element);
  });
  return panel;
}

function createStepsContainer(track, trackIndex) {
  const container = document.createElement("div");
  container.className = "track__steps";
  const stepRow = [];
  for (let step = 0; step < STEP_COUNT; step++) {
    const stepButton = document.createElement("button");
    stepButton.type = "button";
    stepButton.className = "step";
    stepButton.classList.toggle("step--beat", step % 4 === 0);
    stepButton.setAttribute("aria-label", `${track.name} step ${step + 1}`);
    stepButton.addEventListener("click", () => toggleStep(trackIndex, step));
    stepRow.push(stepButton);
    container.append(stepButton);
  }
  elements.stepButtons.push(stepRow);
  return container;
}

function renderSequencer() {
  const fragment = document.createDocumentFragment();
  TRACKS.forEach((track, trackIndex) => {
    const row = document.createElement("div");
    row.className = "track";
    const knobsPanel = createKnobsPanel(track, trackIndex);
    row.append(
      createTrackHeader(track, trackIndex, knobsPanel),
      createStepsContainer(track, trackIndex),
      knobsPanel,
    );
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
    previewTrack(trackIndex);
  }
}

function setVolume(trackIndex, volume) {
  state.volumes[trackIndex] = volume;
  if (audio.trackGains[trackIndex]) {
    audio.trackGains[trackIndex].gain.setTargetAtTime(volume, audio.context.currentTime, 0.01);
  }
}

function clearPattern() {
  state.pattern = createEmptyPattern();
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
    previewTrack(trackIndex);
  }
}

function mountSkipKnob() {
  const knob = createKnob({
    spec: SKIP_SPEC,
    value: state.skip,
    onInput: (value) => {
      state.skip = value;
    },
    onCommit: persistState,
  });
  elements.skipKnobSlot.append(knob.element);
}

function mountStringPad() {
  elements.stringScale.textContent = SCALE_NAME;
  createStringPad({
    button: elements.stringButton,
    noteLabel: elements.stringNote,
    getAudioOutput: () => ({ context: ensureAudio(), destination: audio.stringGain }),
  });
}

function unlockAudioOnFirstGesture() {
  const unlock = () => {
    try {
      ensureAudio();
    } catch (error) {
      console.error(error);
    }
  };
  ["pointerup", "keydown"].forEach((eventName) =>
    document.addEventListener(eventName, unlock, { once: true, capture: true }),
  );
}

function bindControls() {
  mountSkipKnob();
  mountStringPad();
  unlockAudioOnFirstGesture();
  elements.playButton.addEventListener("click", togglePlayback);
  elements.bpmInput.addEventListener("input", () => {
    state.bpm = clamp(Number(elements.bpmInput.value), BPM_RANGE.min, BPM_RANGE.max);
    renderControls();
  });
  elements.swingInput.addEventListener("input", () => {
    state.swing = clamp(Number(elements.swingInput.value), SWING_RANGE.min, SWING_RANGE.max);
    renderControls();
  });
  elements.bpmInput.addEventListener("change", persistState);
  elements.swingInput.addEventListener("change", persistState);
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
