const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;
const LONG_PRESS_VIBRATION_MS = 15;

export function bindTapAndLongPress(element, { onTap, onLongPress, pressingClassName }) {
  let press = null;

  function cancelPress() {
    if (!press) {
      return;
    }
    clearTimeout(press.timerId);
    element.classList.remove(pressingClassName);
    press = null;
  }

  function completeLongPress() {
    cancelPress();
    navigator.vibrate?.(LONG_PRESS_VIBRATION_MS);
    onLongPress();
  }

  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    cancelPress();
    element.classList.add(pressingClassName);
    press = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timerId: setTimeout(completeLongPress, LONG_PRESS_MS),
    };
  });

  element.addEventListener("pointermove", (event) => {
    if (!press || event.pointerId !== press.pointerId) {
      return;
    }
    const distance = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    if (distance > MOVE_TOLERANCE_PX) {
      cancelPress();
    }
  });

  element.addEventListener("pointerup", (event) => {
    if (!press || event.pointerId !== press.pointerId) {
      return;
    }
    cancelPress();
    onTap();
  });

  element.addEventListener("pointercancel", cancelPress);
  element.addEventListener("pointerleave", cancelPress);
  element.addEventListener("contextmenu", (event) => event.preventDefault());

  element.addEventListener("click", (event) => {
    if (event.detail === 0) {
      onTap();
    }
  });

  element.addEventListener("keydown", (event) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onLongPress();
    }
  });
}
