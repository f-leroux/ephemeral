// Hot Rocks — a volcanologist in a silver heat suit crosses a lava lake on a row of basalt
// stepping stones while the volcano behind erupts. The stone you stand on heats up and glows
// redder and redder, then melts away under your feet: you can never stand still. Stones you
// leave cool down again. Lava bombs arc out of the crater onto the stones (some aimed at you,
// later two stones wide); a bomb kills you if it lands on your stone and dumps heat into the
// rock, so a warm stone it hits melts into the lake and leaves a gap you can't cross until it
// cools back into rock. It's a space-and-heat juggling game: spread your weight around, dodge,
// and don't get cornered on a shrinking island.

import {
  createParticles,
  createMover,
  progress,
  lerp,
  clamp,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const N = 8; // stones across the lake
const SW = 45; // stone pitch
const FLOOR_Y = 552; // where the player's feet stand
const LAVA_Y = 586; // where the stones meet the lake in front
const CRATER = [180, 197];
const PAD = 9; // how close the player's centre can get to the edge of the walkable rock
const SINK = 0.7; // seconds a melted stone takes to go under
const RISE = 1.1; // seconds a stone takes to rise back (visible, not walkable yet)
const BOMB_HEAT = 0.58;

const centre = (i) => i * SW + SW / 2;

// ---------- art ----------

function slabOutline(g, jit) {
  // a hexagonal basalt column seen slightly from above: top face around y = -27
  const [a, b, c, d] = jit;
  g.beginPath();
  g.moveTo(-21, -27 + a);
  g.lineTo(-13, -33 + b);
  g.lineTo(13, -34 + c);
  g.lineTo(21, -27 + d);
  g.lineTo(20, 36);
  g.lineTo(-20, 36);
  g.closePath();
}
function slabTop(g, jit) {
  const [a, b, c, d] = jit;
  g.beginPath();
  g.moveTo(-21, -27 + a);
  g.lineTo(-13, -33 + b);
  g.lineTo(13, -34 + c);
  g.lineTo(21, -27 + d);
  g.lineTo(13, -20);
  g.lineTo(-13, -20);
  g.closePath();
}

function makeSlabArt(rng) {
  const jit = [rng.range(-1.5, 1.5), rng.range(-1.5, 1), rng.range(-1, 1.5), rng.range(-1.5, 1.5)];
  // crack network shared by the cold rock and its glowing overlays
  const cracks = [];
  for (let k = 0; k < 4; k++) {
    let x = rng.range(-14, 14);
    let y = rng.range(-31, -23);
    const pts = [[x, y]];
    const down = k > 0;
    for (let s = 0; s < (down ? 6 : 4); s++) {
      x = clamp(x + rng.range(-6, 6), -18, 18);
      y += down ? rng.range(5, 10) : rng.range(-2, 3);
      pts.push([x, y]);
    }
    cracks.push(pts);
  }
  const strokeCracks = (g) => {
    for (const pts of cracks) {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) g.lineTo(x, Math.min(y, 34));
      g.stroke();
    }
  };

  const cold = makeSprite(46, 72, (g) => {
    // side faces
    slabOutline(g, jit);
    const side = g.createLinearGradient(0, -27, 0, 36);
    side.addColorStop(0, '#3a3034');
    side.addColorStop(0.55, '#221a1d');
    side.addColorStop(1, '#5a1a0c'); // lit red by the lava below
    g.fillStyle = side;
    g.fill();
    // column facets
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 1.2;
    for (const fx of [-13, 0, 13]) {
      g.beginPath();
      g.moveTo(fx, -20);
      g.lineTo(fx * 0.95, 36);
      g.stroke();
    }
    const sheen = g.createLinearGradient(-21, 0, 21, 0);
    sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
    sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.75, 'rgba(0,0,0,0.2)');
    sheen.addColorStop(1, 'rgba(255,110,40,0.12)');
    slabOutline(g, jit);
    g.fillStyle = sheen;
    g.fill();
    // pitted texture
    for (let i = 0; i < 40; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.35)' : 'rgba(150,130,135,0.18)';
      g.beginPath();
      g.arc(rng.range(-18, 18), rng.range(-18, 32), rng.range(0.5, 1.5), 0, Math.PI * 2);
      g.fill();
    }
    // top face
    slabTop(g, jit);
    const top = g.createLinearGradient(0, -34, 0, -20);
    top.addColorStop(0, '#5d5358');
    top.addColorStop(1, '#3d3438');
    g.fillStyle = top;
    g.fill();
    for (let i = 0; i < 26; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.3)' : 'rgba(200,185,190,0.2)';
      g.beginPath();
      g.arc(rng.range(-15, 15), rng.range(-31, -22), rng.range(0.4, 1.2), 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(230,215,220,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-20, -27 + jit[0]);
    g.lineTo(-13, -33 + jit[1]);
    g.lineTo(13, -34 + jit[2]);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.moveTo(21, -27 + jit[3]);
    g.lineTo(13, -20);
    g.lineTo(-13, -20);
    g.lineTo(-21, -27 + jit[0]);
    g.stroke();
    // dormant cracks
    g.strokeStyle = 'rgba(10,5,6,0.7)';
    g.lineWidth = 1.1;
    g.lineJoin = 'round';
    strokeCracks(g);
  });

  const hot = makeSprite(46, 72, (g) => {
    // glowing cracks and a red flush, drawn with 'lighter' at the stone's heat
    slabOutline(g, jit);
    const flush = g.createLinearGradient(0, -34, 0, 36);
    flush.addColorStop(0, 'rgba(255,70,10,0.85)');
    flush.addColorStop(0.5, 'rgba(230,40,8,0.6)');
    flush.addColorStop(1, 'rgba(255,90,20,0.45)');
    g.fillStyle = flush;
    g.fill();
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,90,20,0.9)';
    g.lineWidth = 3;
    strokeCracks(g);
    g.strokeStyle = 'rgba(255,190,60,1)';
    g.lineWidth = 1.2;
    strokeCracks(g);
  });

  const white = makeSprite(46, 72, (g) => {
    slabOutline(g, jit);
    const melt = g.createLinearGradient(0, -34, 0, 36);
    melt.addColorStop(0, 'rgba(255,236,150,0.95)');
    melt.addColorStop(0.3, 'rgba(255,170,50,0.9)');
    melt.addColorStop(1, 'rgba(240,80,15,0.85)');
    g.fillStyle = melt;
    g.fill();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,255,230,1)';
    g.lineWidth = 2;
    strokeCracks(g);
  });

  return { cold, hot, white };
}

function makePlayer(step) {
  return makeSprite(34, 48, (g) => {
    const silver = (y0, y1) => {
      const gr = g.createLinearGradient(-10, y0, 10, y1);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.45, '#c3cad3');
      gr.addColorStop(0.7, '#8d97a3');
      gr.addColorStop(1, '#dde2e8');
      return gr;
    };
    g.lineJoin = 'round';
    g.strokeStyle = '#2a2f38';
    g.lineWidth = 1.4;
    // legs and boots
    const legs = step ? [[-8, 2], [4, -1]] : [[-5, 0], [1, 0]];
    for (const [lx, tilt] of legs) {
      g.fillStyle = silver(6, 20);
      g.beginPath();
      g.roundRect(lx, 9, 6, 11, 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#3b3f47';
      g.beginPath();
      g.roundRect(lx - 1 + tilt * 0.3, 18, 9, 5, 2);
      g.fill();
      g.stroke();
    }
    // air tank on the back
    g.fillStyle = '#d9562a';
    g.beginPath();
    g.roundRect(-13, -9, 6, 16, 3);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(-12, -7, 1.5, 11);
    // body
    g.fillStyle = silver(-8, 12);
    g.beginPath();
    g.roundRect(-9, -9, 18, 21, 5);
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(70,80,95,0.45)';
    g.lineWidth = 0.8;
    for (const y of [-3, 2, 7]) {
      g.beginPath();
      g.moveTo(-8, y);
      g.lineTo(8, y);
      g.stroke();
    }
    g.strokeStyle = '#2a2f38';
    g.lineWidth = 1.4;
    // arm, swinging
    g.fillStyle = silver(-6, 8);
    g.save();
    g.translate(2, -6);
    g.rotate(step ? -0.5 : 0.15);
    g.beginPath();
    g.roundRect(-3, 0, 6, 13, 3);
    g.fill();
    g.stroke();
    g.fillStyle = '#3b3f47';
    g.beginPath();
    g.arc(0, 13, 3, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // hood
    g.fillStyle = silver(-24, -8);
    g.beginPath();
    g.roundRect(-9, -24, 18, 17, 7);
    g.fill();
    g.stroke();
    // gold visor, facing right
    const vis = g.createLinearGradient(0, -20, 0, -11);
    vis.addColorStop(0, '#ffe58a');
    vis.addColorStop(0.5, '#e0a021');
    vis.addColorStop(1, '#8a4f0a');
    g.fillStyle = vis;
    g.beginPath();
    g.roundRect(-2, -20, 11, 9, 4);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.ellipse(4, -17.5, 3, 1.2, -0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(-6, -22, 2, 6);
  });
}

function makeBomb() {
  return makeSprite(26, 26, (g) => {
    g.beginPath();
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const r = 10 + ((k * 37) % 5) * 0.6;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    const gr = g.createRadialGradient(-3, -3, 1, 0, 0, 12);
    gr.addColorStop(0, '#5a2d1c');
    gr.addColorStop(1, '#1a0b07');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = '#ff7a1e';
    g.lineWidth = 1.6;
    g.stroke();
    g.strokeStyle = '#ffd25a';
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    for (const [x0, y0, x1, y1] of [[-6, -2, 1, 3], [1, 3, 6, -4], [1, 3, 0, 9], [-6, -2, -4, -8]]) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  });
}

function makeSmoke() {
  return makeSprite(64, 64, (g) => {
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, 32);
    gr.addColorStop(0, 'rgba(70,45,50,0.55)');
    gr.addColorStop(0.6, 'rgba(50,30,36,0.3)');
    gr.addColorStop(1, 'rgba(40,25,30,0)');
    g.fillStyle = gr;
    g.fillRect(-32, -32, 64, 64);
  }, 1);
}

function paintBackdrop(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0b0510');
    sky.addColorStop(0.32, '#230a18');
    sky.addColorStop(0.62, '#4f1216');
    sky.addColorStop(0.8, '#7a2210');
    sky.addColorStop(1, '#3a0c08');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // stars, dimming towards the glow
    for (let i = 0; i < 80; i++) {
      const y = rng.range(0, 260);
      g.fillStyle = `rgba(255,230,220,${(0.6 * (1 - y / 260)).toFixed(2)})`;
      g.fillRect(rng.range(0, W), y, rng.chance(0.15) ? 1.6 : 1, rng.chance(0.15) ? 1.6 : 1);
    }
    // ash clouds lit from below
    for (let i = 0; i < 9; i++) {
      const x = rng.range(-40, W + 40);
      const y = rng.range(60, 200);
      const r = rng.range(50, 100);
      const c = g.createRadialGradient(x, y + r * 0.3, 0, x, y, r);
      c.addColorStop(0, 'rgba(120,40,30,0.32)');
      c.addColorStop(1, 'rgba(60,20,25,0)');
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(x, y, r * 1.6, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // crater glow in the sky
    const cg = g.createRadialGradient(CRATER[0], CRATER[1], 0, CRATER[0], CRATER[1], 150);
    cg.addColorStop(0, 'rgba(255,120,40,0.5)');
    cg.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = cg;
    g.fillRect(0, 40, W, 320);
    // the volcano
    g.beginPath();
    g.moveTo(-30, 520);
    g.bezierCurveTo(60, 430, 120, 300, 150, 201);
    g.lineTo(162, 196);
    g.quadraticCurveTo(180, 203, 198, 196);
    g.lineTo(210, 201);
    g.bezierCurveTo(240, 300, 300, 430, W + 30, 520);
    g.closePath();
    const vg = g.createLinearGradient(0, 196, 0, 520);
    vg.addColorStop(0, '#2c1418');
    vg.addColorStop(1, '#170a0d');
    g.fillStyle = vg;
    g.fill();
    // rocky streaks on the flanks
    g.strokeStyle = 'rgba(90,40,40,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const x = rng.range(130, 230);
      g.beginPath();
      g.moveTo(x, 230);
      g.quadraticCurveTo(x + (x - 180) * 0.8, 360, x + (x - 180) * 2.2 + rng.range(-30, 30), 500);
      g.stroke();
    }
    // lava rivers down the slopes
    const rivers = [
      [168, 204, 126, 260, 162, 360, 96, 476],
      [189, 205, 236, 270, 196, 380, 262, 486],
      [177, 205, 160, 270, 196, 330, 168, 410],
    ];
    for (const [x0, y0, x1, y1, x2, y2, x3, y3] of rivers) {
      for (const [w, col] of [[12, 'rgba(255,80,20,0.14)'], [5, 'rgba(255,100,30,0.55)'], [1.8, '#ffc062']]) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x0, y0);
        g.bezierCurveTo(x1, y1, x2, y2, x3, y3);
        g.stroke();
      }
    }
    // crater lip
    const lip = g.createRadialGradient(180, 199, 0, 180, 199, 26);
    lip.addColorStop(0, 'rgba(255,240,170,1)');
    lip.addColorStop(0.4, 'rgba(255,140,40,0.9)');
    lip.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = lip;
    g.beginPath();
    g.ellipse(180, 199, 26, 9, 0, 0, Math.PI * 2);
    g.fill();
    // far ridges
    const ridge = (base, amp, col, rim) => {
      g.beginPath();
      g.moveTo(0, H);
      let y = base;
      g.lineTo(0, y);
      for (let x = 0; x <= W + 12; x += 12) {
        y = base + rng.range(-amp, amp);
        g.lineTo(x, y);
      }
      g.lineTo(W, H);
      g.closePath();
      g.fillStyle = col;
      g.fill();
      g.strokeStyle = rim;
      g.lineWidth = 1.2;
      g.stroke();
    };
    ridge(486, 9, '#1a0a0c', 'rgba(255,90,40,0.25)');
    ridge(508, 6, '#120709', 'rgba(255,110,40,0.35)');
    // far shore of the lava lake, then the lake
    const lake = g.createLinearGradient(0, 524, 0, H);
    lake.addColorStop(0, '#8a2008');
    lake.addColorStop(0.15, '#d0400e');
    lake.addColorStop(1, '#ff7a1c');
    g.fillStyle = lake;
    g.fillRect(0, 524, W, H - 524);
    g.fillStyle = 'rgba(255,220,120,0.6)';
    g.fillRect(0, 524, W, 1.5);
  });
}

// a tileable strip of crusted lava; drawn twice side by side and scrolled
function paintLava(W, h, rng, dark) {
  return makeSprite(W, h, (g) => {
    g.translate(-W / 2, -h / 2);
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, dark ? '#ff8c26' : '#ffa236');
    base.addColorStop(0.4, '#ec5212');
    base.addColorStop(1, '#a8240a');
    g.fillStyle = base;
    g.fillRect(0, 0, W, h);
    // crust plates with glowing seams, wrapped at the edges
    for (let i = 0; i < 26; i++) {
      const cx = rng.range(0, W);
      const cy = rng.range(4, h - 2);
      const r = rng.range(8, 20) * (0.6 + cy / h);
      const sq = 0.38 + cy / h * 0.25;
      const n = 7;
      const pts = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const rr = r * rng.range(0.7, 1.1);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr * sq]);
      }
      for (const ox of [-W, 0, W]) {
        g.beginPath();
        for (const [px, py] of pts) g.lineTo(cx + ox + px, cy + py);
        g.closePath();
        g.fillStyle = `rgba(${dark ? 50 : 70},14,8,${rng.range(0.55, 0.8).toFixed(2)})`;
        g.fill();
        g.strokeStyle = 'rgba(255,200,90,0.5)';
        g.lineWidth = 1;
        g.stroke();
      }
    }
    // bright streaks
    for (let i = 0; i < 18; i++) {
      const x = rng.range(0, W);
      const y = rng.range(2, h - 2);
      g.strokeStyle = 'rgba(255,240,170,0.55)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 8, y - 2, x + rng.range(14, 26), y + rng.range(-1, 1));
      g.stroke();
    }
  });
}

// ---------- music: epic trap, 140 BPM, F♯ minor with a Phrygian G ----------

const music = {
  cps: 140 / 240,
  setup: `
    const kick = note("f#2 ~ ~ ~ ~ ~ ~ f#2 ~ ~ f#2 ~ ~ ~ ~ ~").s("sine").decay(0.32).sustain(0).gain(0.8)
    const kick2 = note("f#2 ~ ~ f#2 ~ ~ ~ f#2 ~ ~ f#2 ~ ~ f#2 ~ f#2").s("sine").decay(0.28).sustain(0).gain(0.8)
    const snare = s("~ ~ pink ~").decay(0.16).sustain(0).hpf(900).lpf(6000).gain(0.16).room(0.35)
    const clap = s("~ ~ white ~").decay(0.1).sustain(0).hpf(1500).lpf(5000).gain(0.07).room(0.4)
    const hats = s("white*8").decay(0.03).sustain(0).hpf(7000).gain("[0.045 0.028]*4")
    const rolls = s("<[white white white white white white white white white white white white [white white white] [white white white] [white white white white] [white white white white]] [white white white white white white white white white white white white white white [white white white white] [white white white white white white]]>")
      .decay(0.025).sustain(0).hpf(7000).gain(0.04)
    const open = s("[~ white]*4").decay(0.12).sustain(0).hpf(7500).gain(0.026)
    const roots = "<f#2 d2 b2 c#3>"
    const bass808 = note(roots).struct("x ~ ~ ~ ~ ~ ~ x ~ ~ x ~ ~ ~ ~ ~").s("sine").decay(0.7).sustain(0).release(0.1).gain(0.45)
    const grit = note(roots).add(note(12)).struct("x ~ ~ ~ ~ ~ ~ x ~ ~ x ~ ~ x ~ ~").s("sawtooth").decay(0.25).sustain(0.15).release(0.05)
      .lpf(saw.range(300, 1500).slow(35)).lpq(5).gain(0.13)
    const bells = note("<[c#5 ~ f#5 ~ a5 ~ g#5 ~] [f#5 ~ a5 ~ d5 ~ c#5 ~] [b4 ~ d5 ~ f#5 ~ e5 ~] [f5 ~ g#5 ~ c#5 ~ b4 ~]>")
      .s("triangle").decay(0.25).sustain(0).lpf(4000).gain(0.09).delay(0.3).delaytime(0.321).delayfeedback(0.35).pan(0.42)
    const chords = "<[f#3,a3,c#4] [f#3,a3,d4] [f#3,b3,d4] [f3,g#3,c#4]>"
    const brass = note(chords).struct("x ~ ~ x ~ ~ x ~").s("sawtooth").attack(0.01).decay(0.18).sustain(0.2).release(0.1)
      .lpf(saw.range(900, 2400).slow(35)).gain(0.065).room(0.3).pan(0.58)
    const pad = note(chords).s("sawtooth").attack(0.4).release(0.6).lpf(900).gain(0.045).room(0.6)
    const tune = "<[f#5@3 g5 a5@4] [a5@3 g5 f#5@2 e5@2] [d5@4 f#5@4] [f5@4 c#5@4]>"
    const lead = note(tune).s("square").attack(0.01).decay(0.2).sustain(0.5).release(0.1).lpf(2400).vib(5).vibmod(0.1)
      .gain(0.07).delay(0.2).delaytime(0.321).delayfeedback(0.25).pan(0.5)
    const leadLow = note(tune).add(note(-12)).s("sawtooth").attack(0.02).decay(0.25).sustain(0.5).release(0.1).lpf(1400).gain(0.06)
    const arp = note("<[f#4 a4 c#5 f#5]*4 [d4 f#4 a4 d5]*4 [b3 d4 f#4 b4]*4 [c#4 f4 g#4 c#5]*4>")
      .s("triangle").decay(0.07).sustain(0).lpf(3500).gain(0.04).pan(sine.range(0.3, 0.7).slow(2))
    const rumble = s("brown").attack(0.3).decay(1.6).sustain(0).lpf(500).gain(0.12)
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(10)).gain(saw.range(0, 0.055).slow(10))
  `,
  song: `arrange(
    [8, stack(kick, snare, hats, bass808, grit, bells, rumble)],
    [8, stack(kick, snare, clap, hats, bass808, grit, bells, brass, pad, rumble)],
    [9, stack(kick, snare, clap, rolls, bass808, grit, bells, brass, pad, lead, arp)],
    [10, stack(kick2, snare, clap, rolls, open, bass808, grit, bells, brass, pad, lead, leadLow, arp, wash)]
  )`,
};

export default {
  id: 'hotrocks',
  title: 'Hot Rocks',
  emoji: '🌋',
  tagline: 'Keep moving: the rock under your feet melts. Dodge the lava bombs.',
  colors: { bg: '#1a080c', fg: '#ffe6c8', accent: '#ff6a1a' },
  music,

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- art ----
    const backdrop = paintBackdrop(W, H, art);
    const lavaBack = paintLava(W, 104, art, false);
    const lavaFront = paintLava(W, 56, art, true);
    const slabArt = [makeSlabArt(art), makeSlabArt(art), makeSlabArt(art)];
    const playerSpr = [makePlayer(false), makePlayer(true)];
    const bombSpr = makeBomb();
    const smokeSpr = makeSmoke();
    const glowBig = glowSprite('rgba(255,110,30,0.9)', 46);
    const glowSmall = glowSprite('rgba(255,200,90,0.9)', 18);
    const glowCrater = glowSprite('rgba(255,120,40,0.7)', 80);
    const glowSuit = glowSprite('rgba(170,230,255,0.5)', 28);
    const vignette = vignetteSprite(W, H, 0.65, '25,4,4');

    const fx = createParticles();
    const embers = createParticles();
    const smoke = [];
    const bubbles = [];

    // ---- state ----
    const slabs = [];
    for (let i = 0; i < N; i++) slabs.push({ i, h: 0, state: 'solid', age: 0, reform: 0, art: slabArt[(i * 5 + 1) % 3] });
    const mover = createMover({ x: centre(3), minX: PAD, maxX: W - PAD, speed: 190, accel: 20 });
    let facing = 1;
    let walk = 0;
    let clock = 0;
    let shake = 0;
    let flash = 0;
    let craterPulse = 0;
    let sink = 0;
    let deathKind = '';
    const bombs = [];
    let nextBomb = 2.2;
    let bombCount = 0;
    let curP = 0;

    const slabAt = (x) => clamp(Math.floor(x / SW), 0, N - 1);
    const solid = (i) => i >= 0 && i < N && slabs[i].state === 'solid';

    const collapse = (s) => {
      s.state = 'gone';
      s.age = 0;
      s.h = 1;
      s.reform = lerp(3.8, 6, curP) + SINK;
      fx.burst(centre(s.i), FLOOR_Y + 10, { count: 26, speed: 170, life: 0.8, size: 3.5, gravity: 420, angle: -Math.PI / 2, spread: 2.2, colors: ['#ffd25a', '#ff8a1e', '#ff4a10', '#fff2b0'] });
      shake = Math.max(shake, 0.25);
    };

    const pickNearestSolid = (i, side) => {
      if (solid(i)) return i;
      for (let d = 1; d < N; d++) {
        for (const s of side > 0 ? [d, -d] : [-d, d]) if (solid(i + s)) return i + s;
      }
      return i;
    };

    const spawnBomb = (t) => {
      const p = progress(t);
      // fixed draws per bomb, whatever the player does
      const gap = plan.range(0.75, 1.25);
      const r1 = plan.next();
      const r2 = plan.next();
      const r3 = plan.next();
      const r4 = plan.next();
      bombCount++;
      const here = slabAt(mover.x);
      const aimed = bombCount > 1 && r2 < lerp(0.3, 0.5, p);
      let target = aimed ? here : pickNearestSolid(Math.floor(r1 * N), r4 < 0.5 ? -1 : 1);
      const wide = t > 16 && r3 < lerp(0, 0.45, p);
      const targets = [target];
      if (wide) {
        let other = target + (r4 < 0.5 ? -1 : 1);
        if (other < 0 || other >= N) other = target - (other - target);
        targets.push(other);
      }
      const dur = lerp(1.35, 0.95, p);
      bombs.push({ targets, age: 0, dur, spin: (r1 - 0.5) * 8, off: (r4 - 0.5) * 30 });
      craterPulse = 1;
      nextBomb = t + lerp(2.0, 0.72, p) * gap;
    };

    const land = (b, game) => {
      for (const i of b.targets) {
        const cx = centre(i);
        const s = slabs[i];
        if (!game.dead && Math.abs(mover.x - cx) < SW / 2 + 5) {
          game.dead = true;
          game.deathReason = 'A lava bomb landed on you.';
          deathKind = 'bomb';
          fx.burst(mover.x, FLOOR_Y - 20, { count: 30, speed: 150, life: 1.1, size: 4, gravity: 200, drag: 1, colors: ['#c3cad3', '#8d97a3', '#3b3f47', '#e0a021'] });
        }
        if (s.state === 'solid') {
          s.h += BOMB_HEAT;
          if (s.h >= 1) collapse(s);
        }
        fx.burst(cx, FLOOR_Y - 4, { count: 34, speed: 230, life: 0.9, size: 4, gravity: 520, angle: -Math.PI / 2, spread: 2.6, colors: ['#fff2b0', '#ffd25a', '#ff8a1e', '#ff4a10'] });
        fx.burst(cx, FLOOR_Y - 10, { count: 8, speed: 50, life: 1.4, size: 9, round: true, gravity: -40, drag: 1, colors: ['rgba(60,35,35,0.6)', 'rgba(90,60,55,0.5)'] });
      }
      shake = Math.max(shake, b.targets.length > 1 ? 0.45 : 0.3);
      flash = 0.5;
    };

    const bombPos = (b) => {
      const u = clamp(b.age / b.dur, 0, 1);
      const tx = b.targets.reduce((a, i) => a + centre(i), 0) / b.targets.length;
      const x = lerp(CRATER[0] + b.off * 0.3, tx, u);
      const y = lerp(CRATER[1], FLOOR_Y - 6, u) - 300 * 4 * u * (1 - u) * (1 - u * 0.35);
      return { x, y, u };
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt);
      flash = Math.max(0, flash - dt * 1.5);
      craterPulse = Math.max(0, craterPulse - dt * 2);
      fx.update(dt);
      embers.update(dt);
      if (Math.random() < dt * 14) {
        embers.burst(Math.random() * W, LAVA_Y + Math.random() * 40, { count: 1, speed: 30, life: 2.2, size: 2.2, gravity: -40, angle: -Math.PI / 2, spread: 1, colors: ['#ffb040', '#ff7a1e', '#ffe08a'] });
      }
      if (Math.random() < dt * 3.2) {
        smoke.push({ x: CRATER[0] + (Math.random() - 0.5) * 20, y: CRATER[1] - 6, r: 14, life: 0, max: 5 + Math.random() * 2, vx: 6 + Math.random() * 10 });
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i];
        s.life += dt;
        s.y -= 14 * dt;
        s.x += s.vx * dt;
        s.r += 9 * dt;
        if (s.life > s.max) smoke.splice(i, 1);
      }
      if (Math.random() < dt * 2.5) bubbles.push({ x: Math.random() * W, y: 595 + Math.random() * 40, age: 0, max: 0.7 + Math.random() * 0.6, r: 2 + Math.random() * 3 });
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.age += dt;
        if (b.age > b.max) {
          fx.burst(b.x, b.y, { count: 5, speed: 60, life: 0.4, size: 2, gravity: 300, angle: -Math.PI / 2, spread: 1.6, colors: ['#ffd25a', '#ff8a1e'] });
          bubbles.splice(i, 1);
        }
      }
      for (const s of slabs) {
        if (s.state === 'gone') {
          s.age += dt;
          if (Math.random() < dt * 4) fx.burst(centre(s.i) + (Math.random() - 0.5) * 30, LAVA_Y - 8, { count: 1, speed: 30, life: 0.5, size: 2.5, gravity: 120, angle: -Math.PI / 2, spread: 1, colors: ['#ffd25a', '#ff7a1e'] });
        } else if (s.h > 0.62 && Math.random() < dt * 30 * (s.h - 0.6)) {
          fx.burst(centre(s.i) + (Math.random() - 0.5) * 34, FLOOR_Y - 4, { count: 1, speed: 40, life: 0.6, size: 2, gravity: -60, angle: -Math.PI / 2, spread: 0.8, colors: ['#ffd25a', '#fff2b0', '#ff8a1e'] });
        }
      }
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { slabs, bombs, mover, slabAt },

      update(dt, dir, t) {
        updateCosmetic(dt);
        const p = progress(t);
        curP = p;
        const heatRate = lerp(0.34, 0.68, p);
        const coolRate = lerp(0.3, 0.26, p);

        // walking, but never off the rock: gaps in the row are walls of lava
        mover.update(dt, dir);
        let here = slabAt(mover.x);
        if (!solid(here)) here = pickNearestSolid(here, -Math.sign(mover.vx) || 1);
        let a = here;
        let b = here;
        while (solid(a - 1)) a--;
        while (solid(b + 1)) b++;
        const lo = Math.max(PAD, a * SW + PAD);
        const hi = Math.min(W - PAD, (b + 1) * SW - PAD);
        if (mover.x < lo) {
          mover.x = lo;
          mover.vx = Math.max(0, mover.vx);
        } else if (mover.x > hi) {
          mover.x = hi;
          mover.vx = Math.min(0, mover.vx);
        }
        here = slabAt(mover.x);
        if (dir) facing = dir;
        walk += Math.abs(mover.vx) * dt;

        // heat: the stone underfoot warms, the others cool
        for (const s of slabs) {
          if (s.state === 'solid') {
            if (s.i === here) s.h += heatRate * dt;
            else s.h = Math.max(0, s.h - coolRate * dt);
            if (s.h >= 1) {
              collapse(s);
              if (s.i === here && !this.dead) {
                this.dead = true;
                this.deathReason = 'The rock melted under your feet.';
                deathKind = 'melt';
              }
            }
          } else if (s.state === 'gone') {
            if (s.age >= s.reform) {
              s.state = 'solid';
              s.h = 0.35;
            }
          }
        }

        // lava bombs
        while (t >= nextBomb) spawnBomb(nextBomb);
        for (let i = bombs.length - 1; i >= 0; i--) {
          const bm = bombs[i];
          bm.age += dt;
          if (Math.random() < 0.6) {
            const { x, y, u } = bombPos(bm);
            fx.burst(x, y, { count: 1, speed: 20, life: 0.45, size: 2 + 4 * u, round: true, colors: ['#ffd25a', '#ff8a1e', '#ff4a10'] });
          }
          if (bm.age >= bm.dur) {
            bombs.splice(i, 1);
            land(bm, this);
          }
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        if (deathKind === 'melt') {
          sink = Math.min(70, sink + dt * 55);
          if (Math.random() < 0.5) fx.burst(mover.x + (Math.random() - 0.5) * 20, LAVA_Y - 4, { count: 2, speed: 80, life: 0.6, size: 3, gravity: 300, angle: -Math.PI / 2, spread: 1.4, colors: ['#ffd25a', '#ff8a1e', '#fff2b0'] });
        } else if (Math.random() < 0.3) {
          fx.burst(mover.x, FLOOR_Y - 14, { count: 1, speed: 30, life: 1.2, size: 8, round: true, gravity: -50, colors: ['rgba(60,40,40,0.5)'] });
        }
        for (const bm of bombs) bm.age += dt * 0.25;
      },

      render(g) {
        const sx = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
        const sy = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
        g.save();
        g.translate(sx, sy);
        g.drawImage(backdrop.canvas, -6, -6, W + 12, H + 12);

        // crater: flickering glow and the smoke plume
        g.globalCompositeOperation = 'lighter';
        const flick = 0.75 + 0.15 * Math.sin(clock * 9) + 0.1 * Math.sin(clock * 23);
        drawSprite(g, glowCrater, CRATER[0], CRATER[1], { size: 150 + 60 * craterPulse, alpha: clamp(flick + craterPulse * 0.4, 0, 1) });
        g.globalCompositeOperation = 'source-over';
        for (const s of smoke) {
          const k = s.life / s.max;
          drawSprite(g, smokeSpr, s.x, s.y, { size: s.r * 2, alpha: Math.min(1, k * 4) * (1 - k) });
        }

        // the lake behind the stones
        const off = (clock * 9) % W;
        g.drawImage(lavaBack.canvas, -off, 536, W, 104);
        g.drawImage(lavaBack.canvas, W - off, 536, W, 104);
        // darker towards the far shore, so glowing stones stand out against it
        const dim = g.createLinearGradient(0, 530, 0, 590);
        dim.addColorStop(0, 'rgba(40,6,6,0.75)');
        dim.addColorStop(1, `rgba(60,10,6,${(0.4 + 0.08 * Math.sin(clock * 2)).toFixed(3)})`);
        g.fillStyle = dim;
        g.fillRect(0, 530, W, 60);

        // stones
        for (const s of slabs) {
          const cx = centre(s.i);
          if (s.state === 'solid') {
            const jig = s.h > 0.75 ? (Math.random() - 0.5) * 2.4 * (s.h - 0.75) * 4 : 0;
            const y = FLOOR_Y + 27 + (s.h > 0.8 ? (s.h - 0.8) * 10 : 0);
            drawSprite(g, s.art.cold, cx + jig, y, { size: 46 });
            if (s.h > 0.02) {
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, s.art.hot, cx + jig, y, { size: 46, alpha: clamp(Math.pow(s.h, 1.3), 0, 1) });
              g.globalCompositeOperation = 'source-over';
              if (s.h > 0.6) drawSprite(g, s.art.white, cx + jig, y, { size: 46, alpha: clamp((s.h - 0.6) / 0.4, 0, 1) });
            }
          } else {
            const age = s.age;
            if (age < SINK) {
              const k = age / SINK;
              drawSprite(g, s.art.cold, cx, FLOOR_Y + 27 + k * 50, { size: 46, rot: (s.i % 2 ? 1 : -1) * k * 0.3, alpha: 1 - k * 0.6 });
              drawSprite(g, s.art.white, cx, FLOOR_Y + 27 + k * 50, { size: 46, rot: (s.i % 2 ? 1 : -1) * k * 0.3, alpha: 1 - k });
            } else if (s.reform - age < RISE) {
              const k = clamp((s.reform - age) / RISE, 0, 1);
              const y = FLOOR_Y + 27 + k * 40;
              drawSprite(g, s.art.cold, cx, y, { size: 46, alpha: 1 - k * 0.5 });
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, s.art.hot, cx, y, { size: 46, alpha: 0.5 + 0.5 * k });
              g.globalCompositeOperation = 'source-over';
            }
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowBig, cx, LAVA_Y - 8, { size: 70, alpha: 0.45 + 0.15 * Math.sin(clock * 6 + s.i) });
            g.globalCompositeOperation = 'source-over';
          }
        }

        // where bombs will land: pulsing rings and a growing shadow on the stone
        for (const bm of bombs) {
          const u = clamp(bm.age / bm.dur, 0, 1);
          for (const i of bm.targets) {
            const cx = centre(i);
            const pulse = 0.5 + 0.5 * Math.sin(clock * (10 + u * 18));
            g.fillStyle = `rgba(20,0,0,${(0.15 + 0.35 * u).toFixed(3)})`;
            g.beginPath();
            g.ellipse(cx, FLOOR_Y - 1, 8 + 12 * u, 3 + 4 * u, 0, 0, Math.PI * 2);
            g.fill();
            g.strokeStyle = `rgba(255,${Math.round(220 - 140 * u)},60,${(0.55 + 0.45 * pulse).toFixed(3)})`;
            g.lineWidth = 2.2;
            g.beginPath();
            g.ellipse(cx, FLOOR_Y - 1, 20, 7, 0, 0, Math.PI * 2);
            g.stroke();
            g.globalCompositeOperation = 'lighter';
            const beam = g.createLinearGradient(0, FLOOR_Y - 150, 0, FLOOR_Y);
            beam.addColorStop(0, 'rgba(255,60,20,0)');
            beam.addColorStop(1, `rgba(255,70,20,${(0.12 + 0.3 * u * (0.6 + 0.4 * pulse)).toFixed(3)})`);
            g.fillStyle = beam;
            g.fillRect(cx - 20, FLOOR_Y - 150, 40, 150);
            g.globalCompositeOperation = 'source-over';
            // chevrons above the stone
            g.fillStyle = `rgba(255,${Math.round(200 - 120 * u)},60,${(0.5 + 0.5 * pulse).toFixed(3)})`;
            const yy = FLOOR_Y - 58 - 6 * pulse;
            g.beginPath();
            g.moveTo(cx - 8, yy);
            g.lineTo(cx + 8, yy);
            g.lineTo(cx, yy + 9);
            g.closePath();
            g.fill();
          }
        }

        // the volcanologist
        const here = slabAt(mover.x);
        const hs = slabs[here];
        if (!(this.dead && deathKind === 'bomb')) {
          const moving = Math.abs(mover.vx) > 25;
          const frame = moving ? Math.floor(walk / 14) % 2 : 0;
          const bob = moving ? Math.abs(Math.sin(walk / 14 * Math.PI)) * -1.6 : 0;
          const sinkY = hs.state === 'solid' && hs.h > 0.8 ? (hs.h - 0.8) * 10 : 0;
          const py = FLOOR_Y - 22 + bob + sinkY + sink;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowSuit, mover.x, py, { size: 50, alpha: 0.5 });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.beginPath();
          g.ellipse(mover.x, FLOOR_Y, 11, 3, 0, 0, Math.PI * 2);
          g.fill();
          g.save();
          g.translate(mover.x, py);
          if (facing < 0) g.scale(-1, 1);
          g.rotate(mover.lean * 0.12 * facing + (sink ? 0.3 : 0));
          g.drawImage(playerSpr[frame].canvas, -17, -24, 34, 48);
          g.restore();
          // heat gauge over the head when the stone underfoot is warming up
          if (!this.dead && hs.state === 'solid' && hs.h > 0.3) {
            const k = clamp(hs.h, 0, 1);
            const gx = mover.x - 17;
            const gy = py - 36;
            g.fillStyle = 'rgba(20,6,6,0.8)';
            g.strokeStyle = 'rgba(255,230,200,0.7)';
            g.lineWidth = 1;
            g.beginPath();
            g.roundRect(gx - 2, gy - 2, 38, 8, 4);
            g.fill();
            g.stroke();
            g.fillStyle = k > 0.75 ? (Math.sin(clock * 30) > 0 ? '#fff2b0' : '#ff3a10') : k > 0.5 ? '#ff8a1e' : '#ffd25a';
            g.beginPath();
            g.roundRect(gx, gy, 34 * k, 4, 2);
            g.fill();
          }
          if (!this.dead && hs.state === 'solid' && hs.h > 0.45 && Math.random() < 0.25) {
            fx.burst(mover.x + (Math.random() - 0.5) * 12, FLOOR_Y - 2, { count: 1, speed: 25, life: 0.8, size: 6, round: true, gravity: -60, drag: 1, colors: ['rgba(230,220,220,0.35)', 'rgba(200,190,190,0.3)'] });
          }
        }

        // the lake in front, round the stones' feet
        const off2 = (clock * 14 + 120) % W;
        g.drawImage(lavaFront.canvas, -off2, LAVA_Y, W, 56);
        g.drawImage(lavaFront.canvas, W - off2, LAVA_Y, W, 56);
        g.strokeStyle = 'rgba(255,230,140,0.75)';
        g.lineWidth = 1.6;
        g.beginPath();
        for (let x = 0; x <= W; x += 12) g.lineTo(x, LAVA_Y + Math.sin(x * 0.07 + clock * 2.4) * 1.6);
        g.stroke();
        for (const b of bubbles) {
          const k = b.age / b.max;
          g.fillStyle = 'rgba(255,230,140,0.75)';
          g.beginPath();
          g.arc(b.x, b.y, b.r * (0.5 + k), Math.PI, 0);
          g.fill();
          g.strokeStyle = 'rgba(120,30,10,0.6)';
          g.lineWidth = 1;
          g.stroke();
        }

        // bombs in flight
        for (const bm of bombs) {
          const { x, y, u } = bombPos(bm);
          const size = lerp(7, 24, Math.pow(u, 1.2));
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowBig, x, y, { size: size * 3.2, alpha: 0.75 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, bombSpr, x, y, { size, rot: bm.age * bm.spin });
        }

        // sparks, splashes, embers
        fx.render(g, true);
        embers.render(g, true);

        // heat flash from impacts
        if (flash > 0) {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = flash * 0.35;
          g.fillStyle = '#ff7a2a';
          g.fillRect(-6, -6, W + 12, H + 12);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
        }
        g.globalCompositeOperation = 'lighter';
        for (const s of slabs) if (s.state === 'solid' && s.h > 0.5) drawSprite(g, glowSmall, centre(s.i), FLOOR_Y - 4, { size: 60, alpha: (s.h - 0.5) * 0.8 });
        g.globalCompositeOperation = 'source-over';
        g.restore();
        g.drawImage(vignette.canvas, 0, 0, W, H);
      },
    };
    return game;
  },
};
