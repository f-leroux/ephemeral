// Left/right input: hold either half of the screen, or use arrow keys / A-D.
// KeyA/KeyD are physical key codes, so this also maps to Q/D on AZERTY keyboards.

const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);

export function createInput(target = window) {
  const keys = new Set();
  const pointers = new Map(); // pointerId -> -1 | 1

  const sideOf = (e) => (e.clientX < window.innerWidth / 2 ? -1 : 1);

  const onKeyDown = (e) => {
    if (LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code)) {
      keys.add(e.code);
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onPointerDown = (e) => {
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

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerUp);
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
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
