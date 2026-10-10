// Midnight Toys — it's the middle of the night and the toys are up. A teddy bear scurries across the
// bedroom floor between Lego bricks, letter blocks, toy cars and picture books, but the kid in the bed
// keeps stirring. Whenever their eyes open, the teddy has to freeze like an ordinary toy: move while
// you're watched and the game's up. It's "grandma's footsteps": you may only dodge between glances, so
// you have to be in a clear spot before the eyes open. Later the kid only glances to one side (you can
// keep moving on the other), sometimes stirs and falls back asleep, and looks twice in a row.

import {
  createMover,
  createParticles,
  progress,
  lerp,
  clamp,
  circleRect,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const TEDDY_Y = 548;
const TR = 10; // teddy hit radius
const BED_BOTTOM = 132; // the floor shows from under the footboard down
const MOVE_LIMIT = 32; // moving faster than this while watched gets you seen
const GRACE = 0.1; // the eyes take this long to focus once open
const TABLE_DT = 0.01;
const KID = { x: 180, y: 47 };

const speedAt = (t) => lerp(115, 225, progress(t, 60, 1.15));
const smooth = (u) => u * u * (3 - 2 * u);

const DEATHS = {
  lego: 'Stepped on a Lego. Even a teddy can’t keep quiet after that.',
  block: 'Knocked over a letter block. Clunk!',
  car: 'Tripped over a toy car.',
  book: 'Tripped over a picture book.',
  ball: 'Bumped the ball and sent it bouncing.',
};

// ---------- art ----------

function paintFloor(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const PW = 45;
    for (let i = 0, x = 0; x < W; i++, x += PW) {
      const shade = rng.range(-8, 8);
      const grad = g.createLinearGradient(x, 0, x + PW, 0);
      grad.addColorStop(0, `rgb(${52 + shade},${54 + shade},${86 + shade})`);
      grad.addColorStop(0.5, `rgb(${60 + shade},${62 + shade},${96 + shade})`);
      grad.addColorStop(1, `rgb(${48 + shade},${50 + shade},${80 + shade})`);
      g.fillStyle = grad;
      g.fillRect(x, 0, PW, H);
      // grain, wavy but repeating exactly every H so the floor tiles
      for (let k = 0; k < 7; k++) {
        const x0 = x + rng.range(4, PW - 4);
        const a = rng.range(0.5, 3);
        const ph = rng.range(0, 6.28);
        g.strokeStyle = `rgba(${rng.pick(['25,25,50', '90,92,140', '30,30,60'])},${rng.range(0.12, 0.3)})`;
        g.lineWidth = rng.range(0.5, 1.4);
        g.beginPath();
        for (let y = 0; y <= H; y += 10) {
          const xx = x0 + a * Math.sin((Math.PI * 2 * 2 * y) / H + ph);
          if (y === 0) g.moveTo(xx, y);
          else g.lineTo(xx, y);
        }
        g.stroke();
      }
      // the gap between planks
      g.fillStyle = 'rgba(12,12,28,0.75)';
      g.fillRect(x + PW - 1.5, 0, 1.5, H);
      g.fillStyle = 'rgba(140,145,200,0.12)';
      g.fillRect(x, 0, 1, H);
      // butt joints and nail heads
      const jy = rng.range(0, H);
      for (const y of [jy - H, jy, jy + H]) {
        g.fillStyle = 'rgba(12,12,28,0.7)';
        g.fillRect(x, y, PW, 1.5);
        g.fillStyle = 'rgba(140,145,200,0.1)';
        g.fillRect(x, y + 1.5, PW, 1);
        for (const nx of [x + 8, x + PW - 9]) {
          g.fillStyle = 'rgba(20,20,40,0.8)';
          g.beginPath();
          g.arc(nx, y + 6, 1.4, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }, 1.5);
}

function paintRug(r) {
  return makeSprite(r * 2 + 4, r * 2 + 4, (g) => {
    // a braided rag rug: rings of muted colours with a stitched look
    const cols = ['#6d4c7d', '#3f6e78', '#a2606a', '#c9a35a', '#4f5f96', '#7c8a5a'];
    for (let rr = r, i = 0; rr > 4; rr -= 7, i++) {
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      g.ellipse(0, 0, rr, rr * 0.82, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(20,15,30,0.35)';
      g.lineWidth = 1;
      g.setLineDash([3, 2]);
      g.beginPath();
      g.ellipse(0, 0, rr - 3.5, (rr - 3.5) * 0.82, 0, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    // dim it to the moonlit room
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(20,22,50,0.5)';
    g.fillRect(-r - 2, -r - 2, r * 2 + 4, r * 2 + 4);
  }, 2);
}

function shadowed(w, h, draw, round = false) {
  return makeSprite(w + 10, h + 10, (g) => {
    g.fillStyle = 'rgba(5,5,20,0.45)';
    g.beginPath();
    if (round) g.ellipse(3, 4, w / 2, h / 2, 0, 0, Math.PI * 2);
    else g.roundRect(-w / 2 + 3, -h / 2 + 4, w, h, 4);
    g.fill();
    draw(g);
  });
}

function paintLego(color, vertical) {
  const w = vertical ? 18 : 34;
  const h = vertical ? 34 : 18;
  return shadowed(w, h, (g) => {
    const body = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    body.addColorStop(0, color[0]);
    body.addColorStop(0.5, color[1]);
    body.addColorStop(1, color[2]);
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, 2.5);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 0.8;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, 1.5);
    const cols = vertical ? 2 : 4;
    const rows = vertical ? 4 : 2;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = -w / 2 + (w / cols) * (i + 0.5);
        const y = -h / 2 + (h / rows) * (j + 0.5);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.arc(x + 0.8, y + 1, 3, 0, Math.PI * 2);
        g.fill();
        const s = g.createRadialGradient(x - 1, y - 1, 0, x, y, 3);
        s.addColorStop(0, color[0]);
        s.addColorStop(0.4, color[1]);
        s.addColorStop(1, color[2]);
        g.fillStyle = s;
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.beginPath();
        g.arc(x - 1, y - 1, 0.9, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

function paintBlock(color, letter) {
  const s = 26;
  return shadowed(s, s, (g) => {
    g.fillStyle = color[2];
    g.beginPath();
    g.roundRect(-s / 2, -s / 2, s, s, 3);
    g.fill();
    const top = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
    top.addColorStop(0, color[0]);
    top.addColorStop(1, color[1]);
    g.fillStyle = top;
    g.beginPath();
    g.roundRect(-s / 2 + 3, -s / 2 + 3, s - 6, s - 6, 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(-s / 2 + 1, -s / 2 + 1, s - 2, 1.4);
    g.fillStyle = '#fbf3df';
    g.font = '900 15px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, 0, 1);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 0.6;
    g.strokeText(letter, 0, 1);
  });
}

function paintCar(color) {
  const w = 22;
  const h = 40;
  return shadowed(w, h, (g) => {
    // wheels poking out
    g.fillStyle = '#15151c';
    for (const x of [-w / 2 - 1, w / 2 - 4]) for (const y of [-14, 8]) g.fillRect(x, y, 5, 9);
    const body = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, color[2]);
    body.addColorStop(0.4, color[0]);
    body.addColorStop(1, color[1]);
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(-w / 2 + 1, -h / 2, w - 2, h, 7);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 0.8;
    g.stroke();
    // windscreen, roof, rear window
    g.fillStyle = '#9fd3ea';
    g.beginPath();
    g.roundRect(-7, -9, 14, 6, 2);
    g.fill();
    g.fillStyle = color[1];
    g.fillRect(-7, -3, 14, 10);
    g.fillStyle = '#7fb3cc';
    g.fillRect(-6.5, 7.5, 13, 4);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(-5, -8, 4, 1.4);
    // racing stripe and headlights
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(-1.5, -h / 2 + 2, 3, 9);
    g.fillRect(-1.5, 13, 3, 6);
    g.fillStyle = '#fff6c8';
    for (const x of [-6, 6]) {
      g.beginPath();
      g.arc(x, -h / 2 + 3, 2, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function paintBook(color) {
  const w = 42;
  const h = 32;
  return shadowed(w, h, (g) => {
    // pages showing along one edge
    g.fillStyle = '#e9e1cc';
    g.fillRect(-w / 2 + 2, -h / 2 + 2, w - 2, h - 2);
    g.strokeStyle = 'rgba(120,100,80,0.4)';
    g.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(-w / 2 + 3, h / 2 - 1 - i);
      g.lineTo(w / 2, h / 2 - 1 - i);
      g.stroke();
    }
    const c = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    c.addColorStop(0, color[0]);
    c.addColorStop(1, color[1]);
    g.fillStyle = c;
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w - 2, h - 3, 2);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(-w / 2, -h / 2, 4, h - 3);
    // a moon and stars on the cover
    g.fillStyle = '#fff1b0';
    g.beginPath();
    g.arc(4, -2, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color[0];
    g.beginPath();
    g.arc(7, -4, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff1b0';
    for (const [x, y] of [[-8, -8], [13, 6], [-5, 6], [15, -9]]) g.fillRect(x, y, 1.8, 1.8);
  });
}

function paintBall() {
  const r = 14;
  return shadowed(r * 2, r * 2, (g) => {
    const cols = ['#e84a4a', '#fbf3df', '#f2c230', '#fbf3df', '#3f7fd8', '#fbf3df'];
    for (let i = 0; i < 6; i++) {
      g.fillStyle = cols[i];
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, r, (i / 6) * Math.PI * 2 - 0.4, ((i + 1) / 6) * Math.PI * 2 - 0.4);
      g.closePath();
      g.fill();
    }
    const sh = g.createRadialGradient(-5, -6, 1, 0, 0, r);
    sh.addColorStop(0, 'rgba(255,255,255,0.55)');
    sh.addColorStop(0.4, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,30,0.45)');
    g.fillStyle = sh;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fbf3df';
    g.beginPath();
    g.arc(0, 0, 2.5, 0, Math.PI * 2);
    g.fill();
  }, true);
}

// The teddy is drawn from parts so it can come alive: it waddles upright while it moves, and the
// moment it stops it flops into an ordinary toy's pose (sat down, arms stuck out, head lolled,
// glassy button eyes) to fool the kid.
function paintTeddyParts() {
  const fur = (g, x, y, r) => {
    const f = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
    f.addColorStop(0, '#d9a066');
    f.addColorStop(0.6, '#b07440');
    f.addColorStop(1, '#7a4a24');
    return f;
  };
  const foot = makeSprite(14, 11, (g) => {
    g.fillStyle = fur(g, 0, 0, 6);
    g.beginPath();
    g.ellipse(0, 0, 6, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#efcf9e';
    g.beginPath();
    g.ellipse(0, 0.6, 3.4, 2.6, 0, 0, Math.PI * 2);
    g.fill();
  });
  const body = makeSprite(26, 27, (g) => {
    g.fillStyle = fur(g, 0, 0, 12);
    g.beginPath();
    g.ellipse(0, 0, 11, 11.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#efcf9e';
    g.beginPath();
    g.ellipse(0, 2, 6, 6.5, 0, 0, Math.PI * 2);
    g.fill();
    // a stitched patch on the tummy
    g.strokeStyle = 'rgba(110,60,30,0.6)';
    g.lineWidth = 0.6;
    g.setLineDash([1.2, 1]);
    g.strokeRect(1, 0, 4, 4);
    g.setLineDash([]);
  });
  // an arm hanging down from its shoulder at (0, -6)
  const arm = makeSprite(10, 17, (g) => {
    g.fillStyle = fur(g, 0, 0, 7);
    g.beginPath();
    g.ellipse(0, 0, 4.2, 7.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#efcf9e';
    g.beginPath();
    g.ellipse(0, 4.8, 2.6, 2.2, 0, 0, Math.PI * 2);
    g.fill();
  });
  // head centred on (0, 0), with ears, muzzle and nose; the eyes and mouth are drawn on top
  const head = makeSprite(32, 32, (g) => {
    for (const s of [-1, 1]) {
      g.fillStyle = fur(g, s * 9.5, -8, 5.5);
      g.beginPath();
      g.arc(s * 9.5, -8, 5.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#efcf9e';
      g.beginPath();
      g.arc(s * 9.5, -7.5, 2.8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = fur(g, 0, 0, 11);
    g.beginPath();
    g.arc(0, 0, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#efcf9e';
    g.beginPath();
    g.ellipse(0, 3.5, 5.2, 4.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a160a';
    g.beginPath();
    g.ellipse(0, 2, 2.2, 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2a160a';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(0, 3.5);
    g.lineTo(0, 5);
    g.stroke();
  });
  // the living face: a little open smile (the eyes are drawn live so they can look and blink)
  const smile = makeSprite(8, 5, (g) => {
    g.fillStyle = '#3a1a0c';
    g.beginPath();
    g.moveTo(-2.4, -1.2);
    g.quadraticCurveTo(0, 2.6, 2.4, -1.2);
    g.closePath();
    g.fill();
    g.fillStyle = '#e0707a';
    g.beginPath();
    g.ellipse(0, 0.6, 1.1, 0.7, 0, 0, Math.PI * 2);
    g.fill();
  });
  // the toy face: glassy button eyes and a stitched mouth
  const toyFace = makeSprite(20, 16, (g) => {
    for (const s of [-1, 1]) {
      const x = s * 4.4;
      const y = -2;
      const b = g.createRadialGradient(x - 0.8, y - 0.8, 0, x, y, 2.4);
      b.addColorStop(0, '#4a3a30');
      b.addColorStop(1, '#0c0604');
      g.fillStyle = b;
      g.beginPath();
      g.arc(x, y, 2.3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(160,130,110,0.6)';
      g.lineWidth = 0.4;
      g.stroke();
      g.fillStyle = 'rgba(200,180,160,0.7)';
      for (const [dx, dy] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) g.fillRect(x + dx - 0.25, y + dy - 0.25, 0.5, 0.5);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.arc(x - 1, y - 1.1, 0.55, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#2a160a';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-2.6, 5.6);
    g.quadraticCurveTo(0, 6.4, 2.6, 5.6);
    g.stroke();
    for (const x of [-1.8, 0, 1.8]) {
      g.beginPath();
      g.moveTo(x, 5.1);
      g.lineTo(x, 6.6);
      g.stroke();
    }
  });
  return { foot, body, arm, head, smile, toyFace };
}

function paintBedBack(W) {
  return makeSprite(W, 100, (g) => {
    g.translate(-W / 2, -50);
    // headboard
    const hb = g.createLinearGradient(0, 0, 0, 20);
    hb.addColorStop(0, '#3a2414');
    hb.addColorStop(1, '#6d4628');
    g.fillStyle = hb;
    g.fillRect(10, 0, W - 20, 20);
    // mattress and sheet
    const sheet = g.createLinearGradient(0, 18, 0, 100);
    sheet.addColorStop(0, '#9fb0d8');
    sheet.addColorStop(1, '#8090c0');
    g.fillStyle = sheet;
    g.beginPath();
    g.roundRect(16, 16, W - 32, 90, 6);
    g.fill();
    // pillow
    const pil = g.createRadialGradient(W / 2 - 20, 30, 4, W / 2, 40, 90);
    pil.addColorStop(0, '#f4f6ff');
    pil.addColorStop(1, '#b9c3e6');
    g.fillStyle = pil;
    g.beginPath();
    g.roundRect(W / 2 - 78, 20, 156, 46, 18);
    g.fill();
    g.strokeStyle = 'rgba(80,90,140,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(W / 2 - 60, 30);
    g.quadraticCurveTo(W / 2 - 40, 44, W / 2 - 62, 58);
    g.moveTo(W / 2 + 58, 28);
    g.quadraticCurveTo(W / 2 + 44, 42, W / 2 + 62, 56);
    g.stroke();
  }, 2);
}

function paintBedFront(W, rng) {
  return makeSprite(W, 70, (g) => {
    g.translate(-W / 2, -35);
    // shadow on the floor under the footboard
    const sh = g.createLinearGradient(0, 56, 0, 70);
    sh.addColorStop(0, 'rgba(5,5,20,0.7)');
    sh.addColorStop(1, 'rgba(5,5,20,0)');
    g.fillStyle = sh;
    g.fillRect(0, 56, W, 14);
    // the duvet, from the kid's chin to the footboard
    const du = g.createLinearGradient(0, 4, 0, 60);
    du.addColorStop(0, '#2f7a90');
    du.addColorStop(1, '#1f5466');
    g.fillStyle = du;
    g.beginPath();
    g.moveTo(14, 12);
    g.bezierCurveTo(W * 0.3, 2, W * 0.7, 2, W - 14, 12);
    g.lineTo(W - 12, 60);
    g.lineTo(12, 60);
    g.closePath();
    g.fill();
    // rockets and stars printed on it
    g.save();
    g.clip();
    for (let i = 0; i < 26; i++) {
      const x = rng.range(20, W - 20);
      const y = rng.range(16, 56);
      if (rng.chance(0.3)) {
        g.save();
        g.translate(x, y);
        g.rotate(rng.range(-0.6, 0.6));
        g.fillStyle = '#f0e2c0';
        g.beginPath();
        g.ellipse(0, 0, 2.6, 6, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e8584a';
        g.beginPath();
        g.moveTo(-3.5, 5);
        g.lineTo(0, 2);
        g.lineTo(3.5, 5);
        g.fill();
        g.fillStyle = '#f2b53a';
        g.beginPath();
        g.moveTo(-1.5, 6);
        g.lineTo(0, 10);
        g.lineTo(1.5, 6);
        g.fill();
        g.restore();
      } else {
        g.fillStyle = 'rgba(244,210,90,0.85)';
        const s = rng.range(1.5, 2.8);
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 ? s * 0.45 : s;
          g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fill();
      }
    }
    // folds
    g.strokeStyle = 'rgba(10,30,45,0.35)';
    g.lineWidth = 2;
    for (const x of [W * 0.28, W * 0.62, W * 0.8]) {
      g.beginPath();
      g.moveTo(x, 16);
      g.quadraticCurveTo(x + 10, 36, x - 4, 58);
      g.stroke();
    }
    g.restore();
    // the turned-down sheet over the top edge
    g.fillStyle = '#dfe6f4';
    g.beginPath();
    g.moveTo(16, 9);
    g.bezierCurveTo(W * 0.3, -1, W * 0.7, -1, W - 16, 9);
    g.lineTo(W - 16, 15);
    g.bezierCurveTo(W * 0.7, 6, W * 0.3, 6, 16, 15);
    g.closePath();
    g.fill();
    // the kid's hands holding the duvet
    for (const s of [-1, 1]) {
      g.fillStyle = '#f0c29a';
      g.beginPath();
      g.ellipse(W / 2 + s * 30, 7, 6.5, 4.5, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(150,90,60,0.5)';
      g.lineWidth = 0.6;
      for (const k of [-2.5, 0, 2.5]) {
        g.beginPath();
        g.moveTo(W / 2 + s * 30 + k, 4);
        g.lineTo(W / 2 + s * 30 + k, 8);
        g.stroke();
      }
    }
    // footboard with round posts
    const fb = g.createLinearGradient(0, 52, 0, 64);
    fb.addColorStop(0, '#9a6a44');
    fb.addColorStop(0.3, '#7a5032');
    fb.addColorStop(1, '#3e2614');
    g.fillStyle = fb;
    g.fillRect(10, 52, W - 20, 12);
    g.fillStyle = 'rgba(255,220,180,0.25)';
    g.fillRect(10, 53, W - 20, 1.2);
    for (const x of [12, W - 12]) {
      const p = g.createRadialGradient(x - 2, 56, 0, x, 58, 9);
      p.addColorStop(0, '#c99468');
      p.addColorStop(1, '#4a2c16');
      g.fillStyle = p;
      g.beginPath();
      g.arc(x, 58, 9, 0, Math.PI * 2);
      g.fill();
    }
  }, 2);
}

function paintKidHead() {
  return makeSprite(64, 60, (g) => {
    // messy hair behind
    g.fillStyle = '#5a3418';
    g.beginPath();
    g.arc(0, -2, 24, 0, Math.PI * 2);
    g.fill();
    // face
    const f = g.createRadialGradient(-6, -2, 2, 0, 4, 22);
    f.addColorStop(0, '#fbd8b6');
    f.addColorStop(1, '#e2a986');
    g.fillStyle = f;
    g.beginPath();
    g.ellipse(0, 5, 19, 18, 0, 0, Math.PI * 2);
    g.fill();
    // fringe
    g.fillStyle = '#6a3e1e';
    g.beginPath();
    g.moveTo(-21, -2);
    g.quadraticCurveTo(-14, -20, 2, -18);
    g.quadraticCurveTo(18, -20, 21, -2);
    g.quadraticCurveTo(14, -10, 8, -6);
    g.quadraticCurveTo(4, -12, -2, -6);
    g.quadraticCurveTo(-8, -12, -12, -5);
    g.quadraticCurveTo(-16, -8, -21, -2);
    g.fill();
    g.strokeStyle = 'rgba(255,220,180,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-8, -16);
    g.quadraticCurveTo(-2, -18, 4, -15);
    g.stroke();
    // a tuft sticking up
    g.strokeStyle = '#5a3418';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(2, -22);
    g.quadraticCurveTo(6, -30, 12, -27);
    g.stroke();
    // rosy cheeks
    for (const s of [-1, 1]) {
      g.fillStyle = 'rgba(240,120,120,0.35)';
      g.beginPath();
      g.ellipse(s * 11, 10, 4.5, 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, 3);
}

function paintMoonlight() {
  // light through a four-pane window, falling on the floor
  return makeSprite(200, 240, (g) => {
    g.transform(1, 0, -0.35, 1, 0, 0);
    const c = g.createLinearGradient(0, -110, 0, 110);
    c.addColorStop(0, 'rgba(150,180,255,0.0)');
    c.addColorStop(0.3, 'rgba(150,180,255,0.16)');
    c.addColorStop(1, 'rgba(150,180,255,0.08)');
    g.fillStyle = c;
    for (const [x, y] of [[-55, -100], [5, -100], [-55, 5], [5, 5]]) g.fillRect(x, y, 52, 97);
  }, 1);
}

// ---------- game ----------

export default {
  id: 'toys',
  title: 'Midnight Toys',
  emoji: '🧸',
  tagline: 'Sneak the teddy across the bedroom floor without bumping any toys. When the kid opens their eyes, freeze: if they see you move, it’s over.',
  colors: { bg: '#1c1d38', fg: '#f6efd8', accent: '#f2b53a' },

  // UK garage / 2-step in D minor at 136 BPM: skippy two-step kicks and a plucky sawtooth bass from
  // bar one under a music-box "Twinkle Twinkle" turned minor, then rimshots, organ stabs and a pad,
  // then a 16th music-box arpeggio and shaker, and a four-on-the-floor finale with claps and the tune
  // doubled an octave down. 34 bars = 60s.
  music: {
    cps: 34 / 60,
    setup: `
      const roots = "<38 46 43 45>"
      const kick2 = note("d2 ~ ~ ~ ~ ~ ~ ~ ~ ~ d2 ~ ~ ~ ~ ~").s("sine").decay(0.2).sustain(0).gain(0.8)
      const kick4 = note("d2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const snare = s("~ white ~ white").decay(0.12).sustain(0).hpf(1500).lpf(6000).gain(0.16)
      const clap = s("~ pink ~ pink").decay(0.1).sustain(0).hpf(1500).lpf(5000).gain(0.13).room(0.3).roomsize(2)
      const rim = s("pink").struct("~ ~ ~ x ~ ~ x ~ ~ ~ ~ x ~ x ~ ~").decay(0.03).sustain(0).hpf(3000).lpf(7000).gain(0.08)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.04 0.03 0.045]*4")
      const bass = note("[0 ~ ~ 12] [~ ~ 0 ~] [~ ~ 0 ~] [7 ~ 12 ~]".add(roots))
        .s("sawtooth").decay(0.15).sustain(0.3).release(0.05).lpf(saw.range(500, 1400).slow(34)).gain(0.34)
      const chords = "<[d4,f4,a4] [d4,f4,as4] [d4,g4,as4] [cs4,e4,a4]>"
      const stabs = note(chords).struct("~ x ~ ~ ~ ~ x ~").s("square").decay(0.12).sustain(0)
        .lpf(saw.range(1400, 2600).slow(34)).gain(0.07).pan(0.4)
        .delay(0.2).delaytime(0.33).delayfeedback(0.25)
      const pad = note(chords).s("sawtooth").attack(0.3).release(0.5).lpf(900).gain(0.06)
      const tune = "<[d5 d5 a5 a5] [as5 as5 a5 ~] [g5 g5 f5 f5] [e5 e5 d5 ~] [a5 a5 f5 f5] [f5 f5 d5 ~] [g5 g5 as5 as5] [a5 cs6 e6 ~]>"
      const musicbox = note(tune).s("triangle").decay(0.4).sustain(0).gain(0.12).pan(0.55)
        .delay(0.25).delaytime(0.33).delayfeedback(0.3)
      const arp = note("<[d5 f5 a5 f5]*4 [d5 f5 as5 f5]*4 [d5 g5 as5 g5]*4 [cs5 e5 a5 e5]*4>")
        .s("triangle").decay(0.08).sustain(0).lpf(3500).gain(0.045).pan(sine.range(0.3, 0.7).slow(2))
      const lead2 = note("<[d4 d4 a4 a4] [as4 as4 a4 ~] [g4 g4 f4 f4] [e4 e4 d4 ~] [a4 a4 f4 f4] [f4 f4 d4 ~] [g4 g4 as4 as4] [a4 cs5 e5 ~]>").s("square").decay(0.25).sustain(0.2).release(0.05).lpf(1800).gain(0.05).pan(0.4)
    `,
    song: `arrange(
      [8, stack(kick2, snare, hats, bass, musicbox)],
      [8, stack(kick2, snare, rim, hats, bass, stabs, pad, musicbox)],
      [8, stack(kick2, snare, rim, hats, shaker, bass, stabs, pad, musicbox, arp)],
      [10, stack(kick4, snare, clap, rim, hats, shaker, bass, stabs, pad, musicbox, arp, lead2)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');
    const floor = paintFloor(W, H, art);
    const rugs = [paintRug(70), paintRug(54)];
    const teddyArt = paintTeddyParts();
    const bedBack = paintBedBack(W);
    const bedFront = paintBedFront(W, art);
    const kidHead = paintKidHead();
    const moon = paintMoonlight();
    const starGlow = glowSprite('rgba(255,236,170,1)', 8);
    const eyeGlow = glowSprite('rgba(255,215,120,1)', 30);
    const warmGlow = glowSprite('rgba(255,190,110,1)', 60);
    const vignette = vignetteSprite(W, H, 0.6, '6,6,20');
    const LEGO = [
      ['#ff7a70', '#e0302c', '#9a1414'],
      ['#7ab8ff', '#2f6fd8', '#173c86'],
      ['#ffe27a', '#f2b81c', '#a07408'],
      ['#8ce08a', '#2fa54a', '#16642a'],
    ];
    const art2 = {
      lego: LEGO.map((c) => [paintLego(c, false), paintLego(c, true)]),
      block: [
        paintBlock(['#ff9a7a', '#e2553c', '#8e2a1a'], 'A'),
        paintBlock(['#8fc6ff', '#3b7ed6', '#1c3e7a'], 'B'),
        paintBlock(['#a6e39a', '#43a35a', '#1d5a2c'], 'C'),
        paintBlock(['#ffe08a', '#e8a91f', '#8a5c08'], '1'),
        paintBlock(['#d6a6ff', '#8b55d6', '#46237a'], '2'),
      ],
      car: [paintCar(['#ff6a5a', '#c3271d', '#7a1008']), paintCar(['#5ad6c8', '#1f8f86', '#0d4a46'])],
      book: [paintBook(['#3f8f6a', '#25563f']), paintBook(['#c25a8a', '#7a2c54']), paintBook(['#3c5aa8', '#22346a'])],
      ball: [paintBall()],
    };
    const fx = createParticles();

    // ---- how far the floor has scrolled under the teddy at every moment (it only depends on time) ----
    const dist = [0];
    for (let i = 1; i <= 6800; i++) dist.push(dist[i - 1] + speedAt((i - 0.5) * TABLE_DT) * TABLE_DT);
    const Dat = (t) => {
      const f = Math.max(0, t) / TABLE_DT;
      const i = Math.min(Math.floor(f), dist.length - 2);
      return dist[i] + (dist[i + 1] - dist[i]) * (f - i);
    };
    const Tof = (d) => {
      let lo = 0;
      let hi = dist.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (dist[mid] < d) lo = mid;
        else hi = mid;
      }
      return (lo + (d - dist[lo]) / Math.max(1e-6, dist[hi] - dist[lo])) * TABLE_DT;
    };

    // ---- when the kid stirs and looks: warning from t0, eyes open from t1 to t2 ----
    const watches = [];
    {
      let t = 4.2;
      while (t < 59) {
        const p = progress(t, 60, 1.2);
        const warn = lerp(0.9, 0.5, p);
        if (t > 22 && plan.chance(0.17)) {
          // the kid stirs, mumbles and goes back to sleep
          watches.push({ t0: t, t1: t + warn, t2: t + warn, fake: true, side: 0 });
          t += warn + plan.range(0.5, 0.9);
          continue;
        }
        const side = t > 15 && plan.chance(lerp(0.35, 0.5, p)) ? (plan.chance(0.5) ? -1 : 1) : 0;
        let dur = plan.range(lerp(1.0, 1.5, p), lerp(1.6, 2.3, p));
        if (!side) dur = Math.min(dur, 360 / speedAt(t + warn + 1.5)); // the whole stretch is in view when you freeze
        watches.push({ t0: t, t1: t + warn, t2: t + warn + dur, fake: false, side });
        const doubleTake = t > 28 && plan.chance(0.25);
        t += warn + dur + (doubleTake ? plan.range(0.6, 0.9) : plan.range(lerp(2.4, 1.0, p), lerp(3.4, 1.7, p)));
      }
    }

    // ---- a guaranteed route: it holds still whenever the kid is looking your way ----
    const keys = [[0, W / 2], [2.6, W / 2]];
    {
      const avg = (t) => lerp(70, 112, progress(t, 60, 1.2)); // average sideways speed of a move
      let tc = 2.6;
      let xc = W / 2;
      const biased = (lo, hi) => (plan.chance(0.5) ? lo + (hi - lo) * plan.range(0, 0.35) : hi - (hi - lo) * plan.range(0, 0.35));
      const moveTo = (until, xEnd, lo0 = 36, hi0 = W - 36) => {
        while (until - tc > 1.5) {
          const dur = plan.range(0.6, Math.min(1.3, until - tc - 0.7));
          const rem = until - tc - dur;
          const v = avg(tc);
          const lo = Math.max(lo0, xc - v * dur, xEnd - v * rem);
          const hi = Math.min(hi0, xc + v * dur, xEnd + v * rem);
          if (lo > hi) break;
          xc = biased(lo, hi);
          tc += dur;
          keys.push([tc, xc]);
        }
        if (until > tc + 1e-3) keys.push([until, xEnd]);
        tc = Math.max(tc, until);
        xc = xEnd;
      };
      for (const w of watches) {
        const a = Math.max(tc, w.fake ? w.t0 : w.t1 - 0.08);
        const b = w.fake ? w.t1 + 0.3 : w.t2 + 0.12;
        const reach = avg(tc) * (a - tc);
        let lo = Math.max(40, xc - reach);
        let hi = Math.min(W - 40, xc + reach);
        if (w.side) {
          // a sideways glance: the route waits on the other half
          const slo = w.side < 0 ? W / 2 + 44 : 34;
          const shi = w.side < 0 ? W - 34 : W / 2 - 44;
          if (Math.max(lo, slo) <= Math.min(hi, shi)) {
            lo = Math.max(lo, slo);
            hi = Math.min(hi, shi);
          } else w.side = 0;
        }
        moveTo(a, biased(lo, hi));
        w.a = a;
        w.b = b;
        if (w.side) {
          const slo = w.side < 0 ? W / 2 + 44 : 34;
          const shi = w.side < 0 ? W - 34 : W / 2 - 44;
          moveTo(b, plan.range(slo, shi), slo, shi);
        } else {
          keys.push([b, xc]);
          tc = b;
        }
      }
      const v = avg(tc);
      moveTo(63, clamp(xc + plan.range(-1, 1) * v * (63 - tc), 40, W - 40));
    }
    const routeAt = (t) => {
      let i = 0;
      while (i < keys.length - 2 && keys[i + 1][0] <= t) i++;
      const [t0, x0] = keys[i];
      const [t1, x1] = keys[i + 1];
      if (t <= t0) return x0;
      if (t >= t1) return x1;
      return x0 + (x1 - x0) * smooth((t - t0) / (t1 - t0));
    };
    const routeX = (d) => routeAt(Tof(d));

    // ---- toys on the floor, never in the route's way ----
    const toys = []; // { type, x, d, w, h, art }
    {
      const dims = {
        lego: () => (plan.chance(0.5) ? [34, 18, 0] : [18, 34, 1]),
        block: () => [26, 26],
        car: () => [22, 40],
        book: () => [42, 32],
        ball: () => [28, 28],
      };
      const types = ['lego', 'lego', 'lego', 'block', 'block', 'car', 'book', 'ball'];
      const clearOfRoute = (o, corr) => {
        for (let dd = o.d - o.h / 2 - TR - 4; dd <= o.d + o.h / 2 + TR + 4; dd += 5) {
          const rx = routeX(dd);
          if (Math.abs(rx - clamp(rx, o.x - o.w / 2, o.x + o.w / 2)) < corr) return false;
        }
        return true;
      };
      const clearOfToys = (o) => {
        for (let i = toys.length - 1; i >= 0 && i >= toys.length - 16; i--) {
          const q = toys[i];
          if (Math.abs(q.x - o.x) < (q.w + o.w) / 2 + 8 && Math.abs(q.d - o.d) < (q.h + o.h) / 2 + 8) return false;
        }
        return true;
      };
      const tryToy = (x, d, corr) => {
        const type = plan.pick(types);
        const [w, h, vert] = dims[type]();
        const variants = art2[type];
        let sprite = plan.pick(variants);
        if (type === 'lego') sprite = sprite[vert];
        const o = { type, x: clamp(x, w / 2 + 4, W - w / 2 - 4), d, w, h, art: sprite, rot: type === 'car' || type === 'book' ? plan.range(-0.25, 0.25) : 0 };
        if (clearOfRoute(o, corr) && clearOfToys(o)) toys.push(o);
      };
      let d = Dat(2.9);
      const dEnd = Dat(61.5);
      while (d < dEnd) {
        const T = Tof(d);
        const p = progress(T, 60, 1.2);
        const corr = TR + lerp(28, 15, p);
        const locked = watches.some((w) => !w.fake && T >= w.a - 0.2 && T <= w.b + 0.1);
        if (locked) {
          // while you're frozen, everywhere but your spot gets cluttered
          for (let x = plan.range(16, 40); x < W - 12; x += plan.range(46, 62)) {
            if (plan.chance(lerp(0.6, 0.8, p))) tryToy(x, d + plan.range(-8, 8), corr);
          }
          d += plan.range(48, 62);
        } else {
          const n = plan.int(1, Math.round(lerp(2, 3.4, p)));
          for (let i = 0; i < n; i++) tryToy(plan.range(16, W - 16), d + plan.range(-10, 10), corr);
          d += plan.range(lerp(78, 52, p), lerp(108, 70, p));
        }
      }
      toys.sort((a, b) => a.d - b.d);
    }

    // ---- cosmetic bits ----
    const rugList = [];
    for (let d = 300; d < Dat(62) + 800; d += 520 + Math.random() * 500) {
      rugList.push({ d, x: 40 + Math.random() * (W - 80), art: rugs[(Math.random() * 2) | 0] });
    }
    const stars = Array.from({ length: 46 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 30 + Math.random() * 420,
      s: 4 + Math.random() * 6,
      tw: Math.random() * 6.28,
      warm: Math.random() < 0.6,
    }));
    const zzz = [];

    const teddy = createMover({ x: W / 2, minX: 18, maxX: W - 18, speed: 230, accel: 24 });
    let walk = 0;
    let lastT = 0;
    let clock = 0;
    let deadT = 0;
    let seen = false;
    let tripped = null;
    let wobble = 0;
    let nextZ = 0;
    // the teddy's act (cosmetic only): 0 alive and waddling, 1 playing an ordinary toy
    let toyness = 0;
    let stillFor = 0;
    let flop = 1; // which way its head lolls when it freezes
    let blinkAt = 1.5;
    let lookX = 0;

    const yOf = (d, t) => TEDDY_Y - (d - Dat(t));
    // what the kid is doing at time t
    const stateAt = (t) => {
      for (const w of watches) {
        if (t < w.t0) break;
        if (t < w.t1) return { phase: 'warn', w, k: (t - w.t0) / (w.t1 - w.t0) };
        if (t < w.t2) return { phase: 'open', w, k: t - w.t1 };
        if (t < w.t2 + 0.3) return { phase: 'close', w, k: (t - w.t2) / 0.3 };
      }
      return { phase: 'sleep' };
    };
    const watched = (w, x) => !w.side || (w.side < 0 ? x < W / 2 : x > W / 2);

    const game = {
      dead: false,
      deathReason: '',
      teddy,
      toys,
      watches,
      routeAt,
      Dat,

      update(dt, dir, t) {
        lastT = t;
        clock += dt;
        teddy.update(dt, dir);
        walk += Math.abs(teddy.vx) * dt * 0.09;
        stillFor = Math.abs(teddy.vx) < 25 ? stillFor + dt : 0;
        const act = stillFor > 0.05 ? 1 : 0;
        if (act && toyness < 0.05) flop = Math.random() < 0.5 ? -1 : 1;
        toyness += (act - toyness) * Math.min(1, dt * (act ? 16 : 20));
        lookX += (clamp(teddy.vx / 120, -1, 1) - lookX) * Math.min(1, dt * 12);
        const D = Dat(t);

        // the kid's eyes
        const st = stateAt(t);
        if (st.phase === 'open' && st.k > GRACE && Math.abs(teddy.vx) > MOVE_LIMIT && watched(st.w, teddy.x)) {
          this.dead = true;
          seen = true;
          this.deathReason = st.w.side ? 'The kid glanced over and saw you move!' : 'The kid saw you move!';
          fx.burst(teddy.x, TEDDY_Y - 30, { count: 14, speed: 120, life: 0.7, size: 4, colors: ['#ffe27a', '#fff6d0', '#f2b53a'], angle: -Math.PI / 2, spread: 2.4, drag: 2 });
          return;
        }

        // toys
        for (const o of toys) {
          if (o.d < D - 50) continue;
          if (o.d > D + 50) break;
          const y = TEDDY_Y - (o.d - D);
          if (circleRect(teddy.x, TEDDY_Y, TR, o.x - o.w / 2 + 2, y - o.h / 2 + 2, o.w - 4, o.h - 4)) {
            this.dead = true;
            tripped = o;
            this.deathReason = DEATHS[o.type];
            fx.burst(teddy.x, TEDDY_Y - 6, { count: 26, speed: 130, life: 0.9, size: 4, colors: ['#fbf3df', '#efe2c8', '#d9a066'], round: true, drag: 2.5 });
            return;
          }
        }

        // little dust puffs from scurrying paws
        if (Math.abs(teddy.vx) > 120 && Math.random() < 0.2) {
          fx.burst(teddy.x - Math.sign(teddy.vx) * 8, TEDDY_Y + 18, { count: 1, speed: 20, life: 0.5, size: 3, colors: ['rgba(170,175,220,0.6)'], round: true });
        }
        fx.update(dt, speedAt(t));
      },

      afterlife(dt) {
        clock += dt;
        deadT += dt;
        fx.update(dt);
      },

      render(g) {
        const t = lastT;
        const D = Dat(t);
        const dead = game.dead;
        const st = dead && seen ? { phase: 'open', w: stateAt(t).w ?? { side: 0 }, k: 1 } : stateAt(t);

        // floor, rugs and moonlight
        const off = D % H;
        drawSprite(g, floor, W / 2, H / 2 + off);
        drawSprite(g, floor, W / 2, H / 2 + off - H);
        for (const r of rugList) {
          const y = yOf(r.d, t);
          if (y < -90 || y > H + 90) continue;
          drawSprite(g, r.art, r.x, y);
        }
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, moon, 110, 380);
        g.globalCompositeOperation = 'source-over';

        // toys
        for (const o of toys) {
          const y = yOf(o.d, t);
          if (y > H + 40) continue;
          if (y < BED_BOTTOM - 50) break;
          let x = o.x;
          if (o === tripped) x += Math.sin(deadT * 40) * 3 * Math.max(0, 1 - deadT * 2);
          drawSprite(g, o.art, x, y, { rot: o.rot });
        }

        // a ring round the teddy warning that the kid is waking
        const tx = teddy.x;
        const ty = TEDDY_Y;
        if (!dead && st.phase === 'warn' && (!st.w.fake || st.k < 0.75)) {
          const k = st.k;
          g.strokeStyle = 'rgba(255,200,80,0.25)';
          g.lineWidth = 4;
          g.beginPath();
          g.arc(tx, ty, 26, 0, Math.PI * 2);
          g.stroke();
          g.strokeStyle = '#ffcf5a';
          g.beginPath();
          g.arc(tx, ty, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
          g.stroke();
        }
        const inSight = st.phase === 'open' && watched(st.w, tx);
        if (!dead && inSight) {
          const pulse = 0.6 + 0.4 * Math.sin(clock * 14);
          g.strokeStyle = `rgba(255,80,70,${0.5 + 0.4 * pulse})`;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(tx, ty, 26, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = '#ffffff';
          g.font = '900 13px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = 'rgba(120,10,10,0.6)';
          g.fillText('FREEZE!', tx + 1, ty - 39);
          g.fillStyle = '#ffd9d0';
          g.fillText('FREEZE!', tx, ty - 40);
        }

        // the teddy
        let rot = 0;
        let bob = 0;
        const toy = dead ? (seen ? 0 : toyness * Math.max(0, 1 - deadT * 4)) : toyness;
        const alive = 1 - toy;
        if (!dead) {
          rot = (Math.sin(walk) * 0.16 + teddy.lean * 0.12) * alive;
          bob = -Math.abs(Math.sin(walk)) * 2.5 * alive;
        } else {
          rot = Math.min(1.3, deadT * 5) * (tripped ? 1 : -1);
          bob = tripped ? Math.min(8, deadT * 30) : 0;
        }
        g.fillStyle = 'rgba(5,5,20,0.45)';
        g.beginPath();
        g.ellipse(tx + 2, ty + 18, 13 + toy * 3, 5, 0, 0, Math.PI * 2);
        g.fill();
        drawTeddy(g, tx, ty + bob, rot, toy, dead);
        fx.render(g);

        // the star projector's stars drift across everything
        g.globalCompositeOperation = 'lighter';
        const spin = clock * 0.05;
        for (const s of stars) {
          const a = s.a + spin;
          const x = W / 2 + Math.cos(a) * s.r;
          const y = 380 + Math.sin(a) * s.r * 0.9;
          if (x < -10 || x > W + 10 || y < BED_BOTTOM || y > H + 10) continue;
          drawSprite(g, starGlow, x, y, { size: s.s, alpha: 0.35 + 0.2 * Math.sin(clock * 2 + s.tw) });
        }

        // the kid's gaze lights up the floor it's watching
        let light = 0;
        if (st.phase === 'warn' && !st.w.fake) light = st.k * 0.25;
        else if (st.phase === 'open') light = Math.min(1, st.k / 0.12);
        else if (st.phase === 'close') light = 1 - st.k;
        if (light > 0) {
          const side = st.w.side;
          g.save();
          g.beginPath();
          if (side < 0) g.rect(0, BED_BOTTOM - 10, W / 2, H);
          else if (side > 0) g.rect(W / 2, BED_BOTTOM - 10, W / 2, H);
          else g.rect(0, BED_BOTTOM - 10, W, H);
          g.clip();
          const grad = g.createRadialGradient(KID.x, KID.y, 30, KID.x, KID.y + 200, 560);
          grad.addColorStop(0, `rgba(255,205,120,${0.5 * light})`);
          grad.addColorStop(0.5, `rgba(255,180,100,${0.2 * light})`);
          grad.addColorStop(1, `rgba(255,160,90,${0.12 * light})`);
          g.fillStyle = grad;
          g.fillRect(0, BED_BOTTOM - 10, W, H);
          g.restore();
          if (side) {
            g.globalCompositeOperation = 'source-over';
            g.strokeStyle = `rgba(255,214,140,${0.55 * light})`;
            g.lineWidth = 2;
            g.setLineDash([8, 7]);
            g.lineDashOffset = -clock * 30;
            g.beginPath();
            g.moveTo(W / 2, BED_BOTTOM);
            g.lineTo(W / 2, H);
            g.stroke();
            g.setLineDash([]);
          }
        }
        g.globalCompositeOperation = 'source-over';

        // the bed and the kid
        drawSprite(g, bedBack, W / 2, 50);
        if (st.phase === 'warn' && !(st.w.fake && st.k > 0.75)) wobble = Math.sin(clock * 18) * 1.2 * (1 - st.k * 0.5);
        else wobble *= 0.9;
        const hx = KID.x + wobble;
        drawSprite(g, kidHead, hx, KID.y - 4, { rot: wobble * 0.03 });
        drawEyes(g, st, hx, dead);
        drawSprite(g, bedFront, W / 2, 97);

        // thought bubbles: z's while asleep, "?" while stirring, "!" when looking
        if (st.phase === 'sleep' || (st.phase === 'warn' && st.w.fake && st.k > 0.75)) {
          if (clock > nextZ) {
            nextZ = clock + 0.7;
            zzz.push({ x: KID.x + 22, y: KID.y - 14, age: 0 });
          }
        }
        for (let i = zzz.length - 1; i >= 0; i--) {
          const z = zzz[i];
          z.age += 1 / 60;
          if (z.age > 1.6) {
            zzz.splice(i, 1);
            continue;
          }
          g.globalAlpha = Math.max(0, 1 - z.age / 1.6) * 0.8;
          g.fillStyle = '#c8d4ff';
          g.font = `800 ${10 + z.age * 6}px system-ui, sans-serif`;
          g.textAlign = 'center';
          g.fillText('z', z.x + z.age * 22 + Math.sin(z.age * 5) * 4, z.y - z.age * 18);
        }
        g.globalAlpha = 1;
        if (st.phase === 'warn' && !(st.w.fake && st.k > 0.75)) bubble(g, KID.x + 36, KID.y - 22, '?', '#ffe8a8', 0.6 + st.k * 0.4);
        else if (st.phase === 'open') bubble(g, KID.x + 36, KID.y - 22, '!', '#ffb0a0', 1);

        drawSprite(g, vignette, W / 2, H / 2);
      },
    };

    function drawTeddy(g, x, y, rot, toy, dead) {
      const alive = 1 - toy;
      const step = Math.sin(walk);
      const sit = toy * 5; // it plops down on its bottom
      const P = teddyArt;
      g.save();
      g.translate(x, y);
      if (rot) g.rotate(rot);
      // feet: stepping in turn while it walks, splayed out in front when it sits
      for (const s of [-1, 1]) {
        const lift = Math.max(0, s * step) * 3.5 * alive;
        drawSprite(g, P.foot, s * (7 + toy * 4), 18 - lift + toy * 2, { rot: s * -0.55 * toy });
      }
      // arms: swinging as it waddles, stuck stiffly out when it plays dead
      for (const s of [-1, 1]) {
        g.save();
        g.translate(s * 8.5, -1 + sit * 0.7);
        g.rotate(s * lerp(-0.5, -1.35, toy) + step * 0.55 * alive);
        drawSprite(g, P.arm, 0, 6);
        g.restore();
      }
      drawSprite(g, P.body, 0, 8 + sit * 0.6);
      // red bow tie
      const by = 2 + sit * 0.8;
      g.fillStyle = '#d8323a';
      g.beginPath();
      g.moveTo(0, by);
      g.lineTo(-5, by - 2.5);
      g.lineTo(-5, by + 2.5);
      g.closePath();
      g.moveTo(0, by);
      g.lineTo(5, by - 2.5);
      g.lineTo(5, by + 2.5);
      g.closePath();
      g.fill();
      g.fillStyle = '#9e1c24';
      g.beginPath();
      g.arc(0, by, 1.5, 0, Math.PI * 2);
      g.fill();
      // head: bobbing and peering where it's going, or lolled to one side like a stuffed toy
      g.translate(lookX * 1.5 * alive, -8 + sit + Math.cos(walk * 2) * 0.8 * alive);
      g.rotate(flop * 0.3 * toy + lookX * 0.08 * alive);
      drawSprite(g, P.head, 0, 0);
      if (alive > 0.02) {
        g.globalAlpha = alive;
        const caught = dead && seen;
        if (!dead && clock > blinkAt + 0.12) blinkAt = clock + 1.5 + Math.random() * 2.5;
        const open = caught ? 1.25 : clock > blinkAt ? 0.15 : 1;
        for (const s of [-1, 1]) {
          g.fillStyle = '#fbf3df';
          g.beginPath();
          g.ellipse(s * 4.4, -2, 2.6, 2.8 * open, 0, 0, Math.PI * 2);
          g.fill();
          if (open > 0.5) {
            g.fillStyle = '#120804';
            g.beginPath();
            g.arc(s * 4.4 + lookX * 1.1, -1.8, caught ? 1.1 : 1.6, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.9)';
            g.beginPath();
            g.arc(s * 4.4 + lookX * 1.1 - 0.5, -2.4, 0.5, 0, Math.PI * 2);
            g.fill();
          }
        }
        drawSprite(g, P.smile, 0, 6.3);
        g.globalAlpha = 1;
      }
      if (toy > 0.02) drawSprite(g, P.toyFace, 0, 0, { alpha: toy });
      g.restore();
    }

    function bubble(g, x, y, text, color, s) {
      g.fillStyle = 'rgba(250,246,235,0.92)';
      g.beginPath();
      g.arc(x, y, 10 * s, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x - 9 * s, y + 9 * s, 2.5 * s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = color === '#ffb0a0' ? '#c8302a' : '#8a6410';
      g.font = `900 ${14 * s}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, x, y + 1);
    }

    function drawEyes(g, st, hx, dead) {
      // lids: 0 shut, 1 wide open
      let lid = 0;
      if (st.phase === 'warn') {
        const flutter = Math.abs(Math.sin(clock * 9));
        lid = st.w.fake && st.k > 0.75 ? 0 : (0.15 + st.k * 0.35) * flutter;
      } else if (st.phase === 'open') lid = Math.min(1, st.k / 0.1);
      else if (st.phase === 'close') lid = 1 - st.k;
      let look = 0;
      if (st.phase !== 'sleep' && st.w) look = st.w.side ? st.w.side * 3 : clamp((teddy.x - W / 2) / 50, -3, 3);
      if (dead && seen) {
        lid = 1;
        look = clamp((teddy.x - W / 2) / 50, -3, 3);
      }
      const ey = KID.y;
      if (lid > 0.5) {
        g.globalCompositeOperation = 'lighter';
        for (const s of [-1, 1]) drawSprite(g, eyeGlow, hx + s * 8, ey, { size: 34, alpha: 0.35 * (lid - 0.5) * 2 });
        g.globalCompositeOperation = 'source-over';
      }
      for (const s of [-1, 1]) {
        const ex = hx + s * 8;
        if (lid < 0.08) {
          g.strokeStyle = '#3a2010';
          g.lineWidth = 1.4;
          g.lineCap = 'round';
          g.beginPath();
          g.arc(ex, ey - 1.5, 4.2, 0.3, Math.PI - 0.3);
          g.stroke();
          continue;
        }
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(ex, ey, 5.4, 5.4 * lid, 0, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.beginPath();
        g.ellipse(ex, ey, 5.4, 5.4 * lid, 0, 0, Math.PI * 2);
        g.clip();
        g.fillStyle = '#3b2412';
        g.beginPath();
        g.arc(ex + look * 0.7, ey + 1.4, 3.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(ex + look * 0.7 - 1, ey + 0.4, 1, 0, Math.PI * 2);
        g.fill();
        g.restore();
        g.strokeStyle = '#3a2010';
        g.lineWidth = 1.1;
        g.beginPath();
        g.ellipse(ex, ey, 5.4, 5.4 * lid, 0, Math.PI, Math.PI * 2);
        g.stroke();
      }
      if (dead && seen) {
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, warmGlow, hx, KID.y, { size: 180, alpha: Math.max(0, 0.5 - deadT * 0.4) });
        g.globalCompositeOperation = 'source-over';
      }
    }

    return game;
  },
};
