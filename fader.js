import { clamp, fromPosition, toPosition } from "./param-scale.js?v=__VERSION__";

const THUMB_HEIGHT_PX = 14;
const THUMB_GRAB_TOLERANCE_PX = 14;
const DOUBLE_TAP_MS = 300;
const KEYBOARD_STEP = 0.01;
const KEYBOARD_PAGE_STEP = 0.1;
const WHEEL_STEP = 0.02;
const WHEEL_COMMIT_DELAY_MS = 250;

const KEY_DELTAS = {
  ArrowUp: KEYBOARD_STEP,
  ArrowRight: KEYBOARD_STEP,
  ArrowDown: -KEYBOARD_STEP,
  ArrowLeft: -KEYBOARD_STEP,
  PageUp: KEYBOARD_PAGE_STEP,
  PageDown: -KEYBOARD_PAGE_STEP,
};

export function createFader({ spec, value, onInput, onCommit }) {
  const root = document.createElement("div");
  root.className = "fader";

  const readout = document.createElement("output");
  readout.className = "fader__value";

  const track = document.createElement("div");
  track.className = "fader__track";
  track.tabIndex = 0;
  track.setAttribute("role", "slider");
  track.setAttribute("aria-orientation", "vertical");
  track.setAttribute("aria-label", spec.label);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");

  const label = document.createElement("span");
  label.className = "fader__label";
  label.textContent = spec.label;

  root.append(readout, track, label);

  let position = toPosition(value, spec);
  let drag = null;
  let lastTapTime = 0;
  let wheelCommitTimer = null;

  function render() {
    const formattedValue = spec.format(fromPosition(position, spec));
    track.style.setProperty("--position", String(position));
    track.setAttribute("aria-valuenow", String(Math.round(position * 100)));
    track.setAttribute("aria-valuetext", formattedValue);
    readout.textContent = formattedValue;
  }

  function setPosition(nextPosition) {
    const clampedPosition = clamp(nextPosition, 0, 1);
    if (clampedPosition === position) {
      return false;
    }
    position = clampedPosition;
    render();
    onInput(fromPosition(position, spec));
    return true;
  }

  function commit() {
    onCommit(fromPosition(position, spec));
  }

  function resetToDefault() {
    setPosition(toPosition(spec.default, spec));
    commit();
  }

  function measureTrack() {
    const rect = track.getBoundingClientRect();
    return { bottom: rect.bottom, usableHeight: Math.max(1, rect.height - THUMB_HEIGHT_PX) };
  }

  track.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.preventDefault();
    track.focus({ preventScroll: true });
    const now = performance.now();
    if (now - lastTapTime < DOUBLE_TAP_MS) {
      lastTapTime = 0;
      resetToDefault();
      return;
    }
    lastTapTime = now;
    track.setPointerCapture(event.pointerId);

    const { bottom, usableHeight } = measureTrack();
    const lowestThumbCenterY = bottom - THUMB_HEIGHT_PX / 2;
    const thumbCenterY = lowestThumbCenterY - position * usableHeight;
    const isGrabbingThumb = Math.abs(event.clientY - thumbCenterY) <= THUMB_GRAB_TOLERANCE_PX;
    const hasJumped = !isGrabbingThumb && setPosition((lowestThumbCenterY - event.clientY) / usableHeight);

    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startPosition: position,
      usableHeight,
      hasMoved: hasJumped,
    };
  });

  track.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (setPosition(drag.startPosition + (drag.startY - event.clientY) / drag.usableHeight)) {
      drag.hasMoved = true;
    }
  });

  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (drag.hasMoved) {
      commit();
    }
    drag = null;
  };
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);

  track.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (setPosition(position - Math.sign(event.deltaY) * WHEEL_STEP)) {
        clearTimeout(wheelCommitTimer);
        wheelCommitTimer = setTimeout(commit, WHEEL_COMMIT_DELAY_MS);
      }
    },
    { passive: false },
  );

  track.addEventListener("keydown", (event) => {
    if (event.key in KEY_DELTAS) {
      event.preventDefault();
      if (setPosition(position + KEY_DELTAS[event.key])) {
        commit();
      }
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (setPosition(event.key === "Home" ? 0 : 1)) {
        commit();
      }
    } else if (event.key === "Enter" || event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      resetToDefault();
    }
  });

  render();

  return { element: root };
}
