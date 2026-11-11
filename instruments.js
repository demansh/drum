const SILENCE = 0.001;

const formatFrequency = (value) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${Math.round(value)} Hz`;
const formatDuration = (value) => `${Math.round(value * 1000)} ms`;
const formatPercent = (value) => `${Math.round(value * 100)}%`;

const frequencyParam = (id, label, min, max, defaultValue) => ({
  id,
  label,
  min,
  max,
  default: defaultValue,
  scale: "log",
  format: formatFrequency,
});

const durationParam = (id, label, min, max, defaultValue) => ({
  id,
  label,
  min,
  max,
  default: defaultValue,
  scale: "log",
  format: formatDuration,
});

const percentParam = (id, label, min, max, defaultValue) => ({
  id,
  label,
  min,
  max,
  default: defaultValue,
  scale: "linear",
  format: formatPercent,
});

export function createNoiseBuffer(context) {
  const length = context.sampleRate;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createNoiseSource(context, noiseBuffer) {
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  return source;
}

function createEnvelope(context, time, peak, decaySeconds) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(Math.max(peak, SILENCE * 2), time);
  gain.gain.exponentialRampToValueAtTime(SILENCE, time + decaySeconds);
  return gain;
}

function createFilter(context, type, frequency, q = 1) {
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  return filter;
}

function playPitchedDrum(context, destination, time, { startFrequency, endFrequency, sweep, decay, peak }) {
  const oscillator = context.createOscillator();
  const envelope = createEnvelope(context, time, peak, decay);
  oscillator.frequency.setValueAtTime(startFrequency, time);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + Math.min(sweep, decay));
  oscillator.connect(envelope).connect(destination);
  oscillator.start(time);
  oscillator.stop(time + decay);
}

function playFilteredNoise(context, { destination, time, noiseBuffer }, filter, peak, decay) {
  const noise = createNoiseSource(context, noiseBuffer);
  const envelope = createEnvelope(context, time, peak, decay);
  noise.connect(filter).connect(envelope).connect(destination);
  noise.start(time);
  noise.stop(time + decay);
}

function playKick(context, { destination, time, params }) {
  playPitchedDrum(context, destination, time, {
    startFrequency: params.pitch,
    endFrequency: Math.min(40, params.pitch * 0.5),
    sweep: params.sweep,
    decay: params.decay,
    peak: 1,
  });
}

function playSnare(context, voice) {
  const { destination, time, params } = voice;
  const noiseFilter = createFilter(context, "highpass", params.tone);
  playFilteredNoise(context, voice, noiseFilter, params.snappy * 1.2, params.decay);

  const body = context.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(params.tune, time);
  const bodyDecay = params.decay * 0.5;
  const bodyEnvelope = createEnvelope(context, time, (1 - params.snappy) * 1.3, bodyDecay);
  body.connect(bodyEnvelope).connect(destination);
  body.start(time);
  body.stop(time + bodyDecay);
}

function playClap(context, { destination, time, noiseBuffer, params }) {
  const filter = createFilter(context, "bandpass", params.tone, 0.8);
  filter.connect(destination);

  const burstOffsets = [0, params.spread, params.spread * 2];
  burstOffsets.forEach((offset, index) => {
    const burstTime = time + offset;
    const isTail = index === burstOffsets.length - 1;
    const decay = isTail ? params.decay : 0.01;
    const noise = createNoiseSource(context, noiseBuffer);
    const envelope = createEnvelope(context, burstTime, 1, decay);
    noise.connect(envelope).connect(filter);
    noise.start(burstTime);
    noise.stop(burstTime + decay);
  });
}

function playHat(context, voice) {
  const filter = createFilter(context, "highpass", voice.params.tone);
  playFilteredNoise(context, voice, filter, 0.4, voice.params.decay);
}

function playTom(context, { destination, time, params }) {
  playPitchedDrum(context, destination, time, {
    startFrequency: params.pitch,
    endFrequency: params.pitch * (1 - params.bend),
    sweep: params.decay * 0.85,
    decay: params.decay,
    peak: 0.8,
  });
}

export const INSTRUMENTS = [
  {
    id: "kick",
    name: "Kick",
    key: "1",
    play: playKick,
    params: [
      frequencyParam("pitch", "Pitch", 50, 300, 150),
      durationParam("decay", "Decay", 0.1, 1.5, 0.5),
      durationParam("sweep", "Sweep", 0.01, 0.4, 0.15),
    ],
  },
  {
    id: "snare",
    name: "Snare",
    key: "2",
    play: playSnare,
    params: [
      frequencyParam("tune", "Tune", 100, 400, 180),
      frequencyParam("tone", "Tone", 300, 6000, 1000),
      percentParam("snappy", "Snappy", 0, 1, 0.55),
      durationParam("decay", "Decay", 0.05, 0.6, 0.2),
    ],
  },
  {
    id: "clap",
    name: "Clap",
    key: "3",
    play: playClap,
    params: [
      frequencyParam("tone", "Tone", 500, 5000, 1500),
      durationParam("decay", "Decay", 0.05, 1, 0.2),
      durationParam("spread", "Spread", 0.003, 0.04, 0.01),
    ],
  },
  {
    id: "hat",
    name: "Hi-Hat",
    key: "4",
    play: playHat,
    params: [
      frequencyParam("tone", "Tone", 3000, 14000, 7000),
      durationParam("decay", "Decay", 0.01, 0.2, 0.05),
    ],
  },
  {
    id: "openhat",
    name: "Open Hat",
    key: "5",
    play: playHat,
    params: [
      frequencyParam("tone", "Tone", 3000, 14000, 7000),
      durationParam("decay", "Decay", 0.1, 1.5, 0.3),
    ],
  },
  {
    id: "tom",
    name: "Tom",
    key: "6",
    play: playTom,
    params: [
      frequencyParam("pitch", "Pitch", 60, 500, 220),
      durationParam("decay", "Decay", 0.1, 1.2, 0.35),
      percentParam("bend", "Bend", 0, 0.8, 0.55),
    ],
  },
];

export function createDefaultParams(instrument) {
  return Object.fromEntries(instrument.params.map((spec) => [spec.id, spec.default]));
}
