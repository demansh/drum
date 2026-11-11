export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toPosition(value, spec) {
  const clampedValue = clamp(value, spec.min, spec.max);
  if (spec.scale === "log") {
    return Math.log(clampedValue / spec.min) / Math.log(spec.max / spec.min);
  }
  return (clampedValue - spec.min) / (spec.max - spec.min);
}

export function fromPosition(position, spec) {
  const clampedPosition = clamp(position, 0, 1);
  if (spec.scale === "log") {
    return spec.min * (spec.max / spec.min) ** clampedPosition;
  }
  return spec.min + clampedPosition * (spec.max - spec.min);
}
