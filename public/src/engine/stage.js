// Keeps the full-screen canvas sized to the viewport at device pixel ratio.

export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  const w = Math.round(cw * dpr);
  const h = Math.round(ch * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { g: canvas.getContext('2d'), cw, ch, dpr };
}

export const DISPLAY_FONT = "'Syne', system-ui, sans-serif";
export const BODY_FONT = "'Inter', system-ui, sans-serif";
