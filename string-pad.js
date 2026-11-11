import { PENTATONIC_NOTES, pickNextNoteIndex } from "./pentatonic.js?v=__VERSION__";

const PLUCK_DURATION_SECONDS = 3;
const STRING_DAMPING = 0.996;
const PEAK_LEVEL = 0.7;
const RELEASE_TIME_CONSTANT_SECONDS = 0.04;
const RELEASE_STOP_DELAY_SECONDS = 0.3;

function createPluckBuffer(context, frequency) {
  const { sampleRate } = context;
  const length = Math.floor(sampleRate * PLUCK_DURATION_SECONDS);
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  const period = Math.max(2, Math.round(sampleRate / frequency));

  let previousSample = 0;
  for (let i = 0; i < Math.min(period, length); i++) {
    previousSample = 0.5 * (Math.random() * 2 - 1 + previousSample);
    data[i] = previousSample;
  }
  for (let i = period; i < length; i++) {
    const olderSample = i - period - 1 >= 0 ? data[i - period - 1] : data[i - period];
    data[i] = STRING_DAMPING * 0.5 * (data[i - period] + olderSample);
  }
  return buffer;
}

export function createStringPad({ button, noteLabel, getAudioOutput }) {
  let currentNoteIndex = null;
  let activeVoice = null;
  let activePointerId = null;

  function startNote() {
    const { context, destination } = getAudioOutput();
    currentNoteIndex = pickNextNoteIndex(currentNoteIndex);
    const note = PENTATONIC_NOTES[currentNoteIndex];

    const source = context.createBufferSource();
    source.buffer = createPluckBuffer(context, note.frequency);
    const gain = context.createGain();
    gain.gain.value = PEAK_LEVEL;
    source.connect(gain).connect(destination);
    source.start();

    activeVoice = { context, source, gain };
    noteLabel.textContent = note.name;
    button.classList.add("string-pad__button--held");
  }

  function releaseNote() {
    if (!activeVoice) {
      return;
    }
    const { context, source, gain } = activeVoice;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(PEAK_LEVEL, now);
    gain.gain.setTargetAtTime(0, now, RELEASE_TIME_CONSTANT_SECONDS);
    source.stop(now + RELEASE_STOP_DELAY_SECONDS);
    activeVoice = null;
    button.classList.remove("string-pad__button--held");
  }

  function press() {
    releaseNote();
    try {
      startNote();
    } catch (error) {
      console.error("Failed to play string note", error);
    }
  }

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    activePointerId = event.pointerId;
    press();
  });

  const handlePointerEnd = (event) => {
    if (event.pointerId !== activePointerId) {
      return;
    }
    activePointerId = null;
    releaseNote();
  };
  button.addEventListener("pointerup", handlePointerEnd);
  button.addEventListener("pointercancel", handlePointerEnd);
  button.addEventListener("lostpointercapture", handlePointerEnd);
  button.addEventListener("contextmenu", (event) => event.preventDefault());

  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.repeat) {
      event.preventDefault();
      press();
    }
  });
  button.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      releaseNote();
    }
  });
  button.addEventListener("blur", releaseNote);
}
