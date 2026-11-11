const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MINOR_PENTATONIC_INTERVALS = [0, 3, 5, 7, 10];
const ROOT_MIDI_NOTE = 45;
const OCTAVE_COUNT = 2;

const STEP_WEIGHTS = [
  { delta: 0, weight: 15 },
  { delta: 1, weight: 25 },
  { delta: -1, weight: 25 },
  { delta: 2, weight: 12 },
  { delta: -2, weight: 12 },
  { delta: 3, weight: 4 },
  { delta: -3, weight: 4 },
  { delta: 4, weight: 1.5 },
  { delta: -4, weight: 1.5 },
];
const TOTAL_STEP_WEIGHT = STEP_WEIGHTS.reduce((total, { weight }) => total + weight, 0);

export const SCALE_NAME = "A minor pentatonic";

function createNote(midiNote) {
  return {
    midiNote,
    name: `${NOTE_NAMES[midiNote % 12]}${Math.floor(midiNote / 12) - 1}`,
    frequency: 440 * 2 ** ((midiNote - 69) / 12),
  };
}

function buildScaleNotes(rootMidiNote, octaveCount, intervals) {
  const midiNotes = [];
  for (let octave = 0; octave < octaveCount; octave++) {
    intervals.forEach((interval) => midiNotes.push(rootMidiNote + octave * 12 + interval));
  }
  midiNotes.push(rootMidiNote + octaveCount * 12);
  return midiNotes.map(createNote);
}

export const PENTATONIC_NOTES = buildScaleNotes(ROOT_MIDI_NOTE, OCTAVE_COUNT, MINOR_PENTATONIC_INTERVALS);

const STARTING_NOTE_INDEX = MINOR_PENTATONIC_INTERVALS.length;

function pickStepDelta(random) {
  let threshold = random() * TOTAL_STEP_WEIGHT;
  for (const { delta, weight } of STEP_WEIGHTS) {
    threshold -= weight;
    if (threshold < 0) {
      return delta;
    }
  }
  return 0;
}

export function pickNextNoteIndex(currentIndex, random = Math.random) {
  if (currentIndex === null) {
    return STARTING_NOTE_INDEX;
  }
  const lastIndex = PENTATONIC_NOTES.length - 1;
  const delta = pickStepDelta(random);
  const candidateIndex = currentIndex + delta;
  const isOutOfRange = candidateIndex < 0 || candidateIndex > lastIndex;
  const nextIndex = isOutOfRange ? currentIndex - delta : candidateIndex;
  return Math.min(lastIndex, Math.max(0, nextIndex));
}
