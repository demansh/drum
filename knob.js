import { clamp, fromPosition, toPosition } from "./param-scale.js";

const DRAG_PIXELS_FOR_FULL_RANGE = 160;
const FINE_DRAG_MULTIPLIER = 4;
const DOUBLE_TAP_MS = 300;
const KEYBOARD_STEP = 0.01;
const KEYBOARD_PAGE_STEP = 0.1;
const WHEEL_STEP = 0.02;
const WHEEL_COMMIT_DELAY_MS = 250;

export function createKnob({ spec, value, onInput, onCommit }) {
  const root = document.createElement("div");
  root.className = "knob";

  const dial = document.createElement("div");
  dial.className = "knob__dial";
  dial.tabIndex = 0;
  dial.setAttribute("role", "slider");
  dial.setAttribute("aria-label", spec.label);
  dial.setAttribute("aria-valuemin", "0");
  dial.setAttribute("aria-valuemax", "100");

  const label = document.createElement("span");
  label.className = "knob__label";
  label.textContent = spec.label;

  const readout = document.createElement("output");
  readout.className = "knob__value";

  root.append(dial, label, readout);

  let position = toPosition(value, spec);
  let drag = null;
  let lastTapTime = 0;
  let wheelCommitTimer = null;

  function render() {
    const formattedValue = spec.format(fromPosition(position, spec));
    dial.style.setProperty("--position", String(position));
    dial.setAttribute("aria-valuenow", String(Math.round(position * 100)));
    dial.setAttribute("aria-valuetext", formattedValue);
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

  dial.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dial.focus({ preventScroll: true });
    const now = performance.now();
    if (now - lastTapTime < DOUBLE_TAP_MS) {
      lastTapTime = 0;
      resetToDefault();
      return;
    }
    lastTapTime = now;
    dial.setPointerCapture(event.pointerId);
    drag = { pointerId: event.pointerId, startY: event.clientY, startPosition: position, hasMoved: false };
  });

  dial.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const pixelsForFullRange = DRAG_PIXELS_FOR_FULL_RANGE * (event.shiftKey ? FINE_DRAG_MULTIPLIER : 1);
    const delta = (drag.startY - event.clientY) / pixelsForFullRange;
    if (setPosition(drag.startPosition + delta)) {
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
  dial.addEventListener("pointerup", endDrag);
  dial.addEventListener("pointercancel", endDrag);

  dial.addEventListener(
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

  dial.addEventListener("dblclick", (event) => event.preventDefault());

  dial.addEventListener("keydown", (event) => {
    const keyDeltas = {
      ArrowUp: KEYBOARD_STEP,
      ArrowRight: KEYBOARD_STEP,
      ArrowDown: -KEYBOARD_STEP,
      ArrowLeft: -KEYBOARD_STEP,
      PageUp: KEYBOARD_PAGE_STEP,
      PageDown: -KEYBOARD_PAGE_STEP,
    };
    if (event.key in keyDeltas) {
      event.preventDefault();
      if (setPosition(position + keyDeltas[event.key])) {
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
