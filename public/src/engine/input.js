// Left/right input: hold either half of the screen, or use arrow keys / A-D.
// KeyA/KeyD are physical key codes, so this also maps to Q/D on AZERTY keyboards.
// Pass an element instead of window to use the halves of that element (the home practice strip).

const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);

export function createInput(target = window) {
  const keys = new Set();
  const pointers = new Map(); // pointerId -> -1 | 1

  const el = target === window ? null : target;
  const sideOf = (e) => {
    if (!el) return e.clientX < window.innerWidth / 2 ? -1 : 1;
    const r = el.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? -1 : 1;
  };

  const onKeyDown = (e) => {
    if (LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code)) {
      keys.add(e.code);
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onPointerDown = (e) => {
    if (e.target.closest?.('button')) return; // e.g. the mute button
    pointers.set(e.pointerId, sideOf(e));
    e.preventDefault();
  };
  const onPointerMove = (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, sideOf(e));
  };
  const onPointerUp = (e) => pointers.delete(e.pointerId);
  const onBlur = () => {
    keys.clear();
    pointers.clear();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  target.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('blur', onBlur);

  return {
    // -1 = left, 1 = right, 0 = none (or both held)
    dir() {
      let left = false;
      let right = false;
      for (const k of keys) {
        if (LEFT_KEYS.has(k)) left = true;
        if (RIGHT_KEYS.has(k)) right = true;
      }
      for (const side of pointers.values()) {
        if (side < 0) left = true;
        else right = true;
      }
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
