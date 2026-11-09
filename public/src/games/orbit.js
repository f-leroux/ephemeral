// Low Orbit — a little satellite circles a blue planet, seen from above its pole, and space is getting
// crowded. You never steer round the orbit: it carries you on its own. ← fires the thrusters to drop to
// a lower orbit and → raises it. Like real orbits, lower is faster: everything below you overtakes you,
// everything above falls behind, and junk at your own height drifts along with you. Arcs of dead
// satellites and spent rocket stages share the sky, so every change of height is a lane change you
// time through their gaps. Rogue meteoroids orbit the wrong way, flaring up across the planet before
// they launch and racing head-on round your orbit, so you get off their height in time. Air drag keeps
// pulling you down, and too long in the glowing upper atmosphere burns you up.

import { createParticles, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const CX = 180; // the planet's centre
const CY = 318;
const R_PLANET = 46;
const R_ATM = 76; // below this you're in the upper atmosphere and heat up
const R_FLOOR = 56; // as low as the thrusters can take you
const R_MAX = 166; // as high as they can
const PR = 6.5; // the satellite's collision radius
const RSPEED = 56; // px/s of climb or descent at full thrust
const START_R = 136;
const TAU = Math.PI * 2;

const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

// ---------- art ----------

function paintSky(W, H, art) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, W * 0.3, H);
    sky.addColorStop(0, '#0b0a26');
    sky.addColorStop(0.5, '#080a1f');
    sky.addColorStop(1, '#120b2c');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // nebula clouds
    const blobs = [
      ['rgba(150,60,200,', 60, 120, 170],
      ['rgba(40,140,190,', 300, 520, 190],
      ['rgba(210,70,140,', 320, 90, 120],
      ['rgba(70,90,220,', 40, 560, 150],
    ];
    for (const [col, x, y, r] of blobs) {
      for (let k = 0; k < 7; k++) {
        const bx = x + art.range(-r * 0.5, r * 0.5);
        const by = y + art.range(-r * 0.5, r * 0.5);
        const br = r * art.range(0.4, 0.9);
        const d = g.createRadialGradient(bx, by, 0, bx, by, br);
        d.addColorStop(0, `${col}0.13)`);
        d.addColorStop(1, `${col}0)`);
        g.fillStyle = d;
        g.fillRect(bx - br, by - br, br * 2, br * 2);
      }
    }
    // dusty speckle
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(200,190,255,${art.range(0.02, 0.07)})`;
      g.fillRect(art.range(0, W), art.range(0, H), 1, 1);
    }
  }, 1);
}

function paintStars(size, art) {
  return makeSprite(size, size, (g) => {
    for (let i = 0; i < 420; i++) {
      const x = art.range(-size / 2, size / 2);
      const y = art.range(-size / 2, size / 2);
      const b = art.next();
      const r = b < 0.85 ? 0.5 : b < 0.97 ? 0.9 : 1.4;
      const tint = art.pick(['255,255,255', '200,220,255', '255,230,200', '220,200,255']);
      g.fillStyle = `rgba(${tint},${art.range(0.35, 0.95)})`;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  }, 1);
}

function paintMoon(art) {
  const R = 15;
  return makeSprite(R * 2 + 4, R * 2 + 4, (g) => {
    const base = g.createRadialGradient(5, -5, 2, 0, 0, R);
    base.addColorStop(0, '#e9e4f2');
    base.addColorStop(1, '#8c86a3');
    g.fillStyle = base;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();
    g.save();
    g.clip();
    for (let i = 0; i < 9; i++) {
      const x = art.range(-R, R);
      const y = art.range(-R, R);
      const r = art.range(1.2, 3.6);
      g.fillStyle = 'rgba(90,82,115,0.45)';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath();
      g.arc(x + 0.5, y - 0.5, r * 0.6, 0, TAU);
      g.fill();
    }
    const sh = g.createRadialGradient(7, -7, R * 0.6, 0, 0, R * 1.5);
    sh.addColorStop(0, 'rgba(10,8,30,0)');
    sh.addColorStop(1, 'rgba(10,8,30,0.85)');
    g.fillStyle = sh;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
  });
}

// the planet's surface, seen from above the pole (it turns underneath the night shading)
function paintSurface(art) {
  const R = R_PLANET;
  return makeSprite(R * 2, R * 2, (g) => {
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.clip();
    const sea = g.createRadialGradient(0, 0, 4, 0, 0, R);
    sea.addColorStop(0, '#2a8fd0');
    sea.addColorStop(0.7, '#1c6fb2');
    sea.addColorStop(1, '#14508e');
    g.fillStyle = sea;
    g.fillRect(-R, -R, R * 2, R * 2);
    // shallow water and continents
    for (let c = 0; c < 6; c++) {
      const a = art.range(0, TAU);
      const d = art.range(10, R * 0.85);
      const cx = Math.cos(a) * d;
      const cy = Math.sin(a) * d;
      const n = art.int(6, 12);
      const pts = [];
      for (let k = 0; k < n; k++) pts.push([cx + art.range(-11, 11), cy + art.range(-11, 11), art.range(3, 8)]);
      g.fillStyle = 'rgba(90,200,220,0.35)';
      for (const [x, y, r] of pts) {
        g.beginPath();
        g.arc(x, y, r + 2.5, 0, TAU);
        g.fill();
      }
      for (const [x, y, r] of pts) {
        const land = g.createRadialGradient(x - 1, y - 1, 0, x, y, r);
        land.addColorStop(0, art.chance(0.3) ? '#cdb77a' : '#5fae5a');
        land.addColorStop(1, '#3d8a48');
        g.fillStyle = land;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }
      // mountains / desert speckle
      for (let k = 0; k < 14; k++) {
        const [x, y, r] = art.pick(pts);
        g.fillStyle = art.chance(0.5) ? 'rgba(120,90,50,0.35)' : 'rgba(220,210,150,0.3)';
        g.fillRect(x + art.range(-r, r) * 0.6, y + art.range(-r, r) * 0.6, 1.3, 1.3);
      }
    }
    // the polar ice cap right in the middle (we're looking down at the pole)
    const ice = g.createRadialGradient(0, 0, 0, 0, 0, 13);
    ice.addColorStop(0, 'rgba(255,255,255,0.95)');
    ice.addColorStop(0.7, 'rgba(230,245,255,0.8)');
    ice.addColorStop(1, 'rgba(230,245,255,0)');
    g.fillStyle = ice;
    g.beginPath();
    for (let k = 0; k <= 20; k++) {
      const a = (k / 20) * TAU;
      const r = 11 + art.range(-2.5, 3);
      if (k === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
  });
}

function paintClouds(art) {
  const R = R_PLANET;
  return makeSprite(R * 2, R * 2, (g) => {
    g.beginPath();
    g.arc(0, 0, R - 0.5, 0, TAU);
    g.clip();
    // spiral bands of cloud swirling round the pole
    for (let i = 0; i < 70; i++) {
      const a = art.range(0, TAU);
      const d = art.range(14, R);
      const len = art.range(6, 16);
      g.strokeStyle = `rgba(255,255,255,${art.range(0.18, 0.45)})`;
      g.lineWidth = art.range(1.5, 3.5);
      g.lineCap = 'round';
      g.beginPath();
      g.arc(0, 0, d, a, a + len / d);
      g.stroke();
    }
    // a storm
    const sa = art.range(0, TAU);
    const sx = Math.cos(sa) * 30;
    const sy = Math.sin(sa) * 30;
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(sx, sy, 2 + k * 2.2, k, k + 4.2);
      g.stroke();
    }
  });
}

// the night side, the day-side highlight and the rim of air (fixed: the sun is up and to the right)
function paintShade() {
  const R = R_PLANET;
  const S = R + 4;
  return makeSprite(S * 2, S * 2, (g) => {
    g.save();
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.clip();
    const night = g.createLinearGradient(R * 0.55, -R * 0.55, -R * 0.75, R * 0.75);
    night.addColorStop(0, 'rgba(6,8,30,0)');
    night.addColorStop(0.4, 'rgba(6,8,30,0.2)');
    night.addColorStop(0.56, 'rgba(6,8,30,0.8)');
    night.addColorStop(1, 'rgba(4,5,20,0.93)');
    g.fillStyle = night;
    g.fillRect(-R, -R, R * 2, R * 2);
    const hi = g.createRadialGradient(R * 0.45, -R * 0.45, 0, R * 0.45, -R * 0.45, R * 0.8);
    hi.addColorStop(0, 'rgba(255,255,255,0.22)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hi;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
    // a thin bright rim of air on the day side
    g.lineWidth = 2;
    const rim = g.createLinearGradient(R, -R, -R, R);
    rim.addColorStop(0, 'rgba(150,230,255,0.9)');
    rim.addColorStop(0.5, 'rgba(120,200,255,0.25)');
    rim.addColorStop(1, 'rgba(120,200,255,0)');
    g.strokeStyle = rim;
    g.beginPath();
    g.arc(0, 0, R + 0.5, 0, TAU);
    g.stroke();
  });
}

// the glowing shell of upper atmosphere, out to R_ATM
function paintAtmosphere() {
  const S = R_ATM + 6;
  return makeSprite(S * 2, S * 2, (g) => {
    const a = g.createRadialGradient(0, 0, R_PLANET, 0, 0, R_ATM + 4);
    a.addColorStop(0, 'rgba(110,200,255,0.42)');
    a.addColorStop(0.25, 'rgba(100,170,255,0.16)');
    a.addColorStop(0.75, 'rgba(255,140,90,0.07)');
    a.addColorStop(1, 'rgba(255,120,80,0)');
    g.fillStyle = a;
    g.beginPath();
    g.arc(0, 0, R_ATM + 4, 0, TAU);
    g.fill();
  }, 2);
}

function paintSatellite() {
  // sprite space: +x along the orbit, -y away from the planet
  return makeSprite(36, 22, (g) => {
    // solar panels on booms
    g.strokeStyle = '#c9ccd6';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-13, 0);
    g.lineTo(13, 0);
    g.stroke();
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -17.5 : 6.5;
      const pg = g.createLinearGradient(x0, -4, x0 + 11, 4);
      pg.addColorStop(0, '#2b5fd6');
      pg.addColorStop(0.5, '#4f8cff');
      pg.addColorStop(1, '#1d3f9c');
      g.fillStyle = pg;
      g.fillRect(x0, -4.5, 11, 9);
      g.strokeStyle = 'rgba(190,220,255,0.55)';
      g.lineWidth = 0.5;
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        g.moveTo(x0 + (k * 11) / 4, -4.5);
        g.lineTo(x0 + (k * 11) / 4, 4.5);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(x0, 0);
      g.lineTo(x0 + 11, 0);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x0 + 0.5, -4, 4, 1);
      g.strokeStyle = '#0f235c';
      g.lineWidth = 0.6;
      g.strokeRect(x0, -4.5, 11, 9);
    }
    // gold-foil body
    const body = g.createLinearGradient(-5, -5, 5, 5);
    body.addColorStop(0, '#fff1a8');
    body.addColorStop(0.35, '#f2c24a');
    body.addColorStop(0.7, '#c98a1c');
    body.addColorStop(1, '#8a5a12');
    g.fillStyle = body;
    g.fillRect(-5, -5, 10, 10);
    g.strokeStyle = 'rgba(120,70,10,0.7)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(-5, -1);
    g.lineTo(1, 5);
    g.moveTo(-1, -5);
    g.lineTo(5, 1);
    g.stroke();
    g.strokeStyle = '#6b4510';
    g.lineWidth = 0.7;
    g.strokeRect(-5, -5, 10, 10);
    // antenna dish facing out into space
    g.fillStyle = '#e8ebf2';
    g.beginPath();
    g.ellipse(0, -7.5, 4.2, 1.8, 0, Math.PI, TAU);
    g.fill();
    g.strokeStyle = '#9aa0b0';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(0, -5);
    g.lineTo(0, -10);
    g.stroke();
    g.fillStyle = '#ff5a5a';
    g.beginPath();
    g.arc(0, -10.3, 0.9, 0, TAU);
    g.fill();
    // thruster nozzle towards the planet
    g.fillStyle = '#6d7180';
    g.fillRect(-2, 5, 4, 2.5);
  });
}

function paintJunk(kind, art) {
  if (kind === 'stage') {
    return makeSprite(30, 14, (g) => {
      const c = g.createLinearGradient(0, -5, 0, 5);
      c.addColorStop(0, '#f4f5f8');
      c.addColorStop(0.45, '#c3c7d1');
      c.addColorStop(1, '#6e7384');
      g.fillStyle = c;
      g.fillRect(-10, -5, 18, 10);
      g.fillStyle = '#e9473f';
      g.fillRect(-4, -5, 3, 10);
      g.fillStyle = '#4b4f5c';
      g.beginPath();
      g.moveTo(8, -3);
      g.lineTo(13, -5);
      g.lineTo(13, 5);
      g.lineTo(8, 3);
      g.closePath();
      g.fill();
      g.fillStyle = '#2b2d36';
      g.beginPath();
      g.ellipse(-10, 0, 1.6, 5, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(40,40,55,0.6)';
      g.lineWidth = 0.6;
      g.strokeRect(-10, -5, 18, 10);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(-9, -4, 16, 1.2);
    });
  }
  if (kind === 'panel') {
    return makeSprite(24, 18, (g) => {
      g.save();
      g.rotate(0.2);
      g.fillStyle = '#5c6478';
      g.beginPath();
      g.moveTo(-10, -6);
      g.lineTo(9, -7);
      g.lineTo(10, 2);
      g.lineTo(4, 3);
      g.lineTo(2, 7);
      g.lineTo(-9, 6);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(30,34,48,0.8)';
      g.lineWidth = 0.8;
      g.stroke();
      g.strokeStyle = 'rgba(170,180,200,0.45)';
      g.lineWidth = 0.5;
      for (let x = -7; x < 9; x += 3.4) {
        g.beginPath();
        g.moveTo(x, -6.5);
        g.lineTo(x + 0.3, 6.5);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(-10, 0);
      g.lineTo(10, -1);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(-8, -5.5, 6, 1);
      g.restore();
    });
  }
  // a tumbling chunk of wreckage
  return makeSprite(22, 22, (g) => {
    const n = 9;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const r = art.range(5.5, 9);
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const c = g.createLinearGradient(-8, -8, 8, 8);
    c.addColorStop(0, '#c7c2bd');
    c.addColorStop(0.5, '#8a847f');
    c.addColorStop(1, '#4f4a48');
    g.fillStyle = c;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(35,30,30,0.8)';
    g.lineWidth = 0.8;
    g.stroke();
    for (let k = 0; k < 4; k++) {
      const x = art.range(-4, 4);
      const y = art.range(-4, 4);
      g.fillStyle = 'rgba(40,35,35,0.4)';
      g.beginPath();
      g.arc(x, y, art.range(0.8, 1.8), 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.arc(-3, -3, 2, 0, TAU);
    g.fill();
  });
}

function paintRogue() {
  return makeSprite(22, 22, (g) => {
    const c = g.createRadialGradient(-2, -2, 0, 0, 0, 8);
    c.addColorStop(0, '#fff2b0');
    c.addColorStop(0.3, '#ffb03a');
    c.addColorStop(0.7, '#e2401c');
    c.addColorStop(1, '#5e1508');
    g.fillStyle = c;
    g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * TAU;
      const r = 7 + (k % 3 === 0 ? -1 : k % 2 ? 0.6 : 0);
      if (k === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
    g.strokeStyle = 'rgba(80,10,0,0.7)';
    g.lineWidth = 0.8;
    g.stroke();
    g.strokeStyle = 'rgba(255,240,170,0.8)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-4, 2);
    g.lineTo(-1, 0);
    g.lineTo(1, 3);
    g.moveTo(1, -4);
    g.lineTo(3, -1);
    g.stroke();
  });
}

// ---------- the game ----------

export default {
  id: 'orbit',
  title: 'Low Orbit',
  emoji: '🛰️',
  tagline: '← drops your orbit, → raises it. Dodge the junk and don’t burn up.',
  colors: { bg: '#0a0a24', fg: '#eef4ff', accent: '#ffb84a' },

  // Spacesynth (Italo space disco), 128 BPM, B minor over Bm – G – D – A: from bar one a four-on-the-floor
  // kick, a galloping octave sawtooth bass with its filter opening over the whole minute, offbeat hats
  // and a 16th "sequencer" arpeggio with echoes; then claps, a pad and sawtooth chord stabs; then a
  // heroic sawtooth lead with vibrato and echoes, 16th hats and a glassy sine sparkle; and a finale with
  // a busier kick, the lead doubled an octave down on a square, a second arpeggio an octave up and a
  // rising noise wash. 32 bars = 60s.
  music: {
    cps: 128 / 240,
    setup: `
      const kick = note("c2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const kick2 = note("c2*4 [~ ~ ~ c2]").s("sine").decay(0.17).sustain(0).gain(0.8)
      const bass = note("<[b2 b3]*4 [g2 g3]*4 [d3 d4]*4 [a2 a3]*4>").s("sawtooth")
        .decay(0.12).sustain(0.1).release(0.04).lpf(saw.range(420, 1500).slow(32)).lpq(5).gain(0.36)
      const hats = s("[~ white]*4").decay(0.05).sustain(0).hpf(7000).gain(0.045)
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.014 0.028 0.045 0.028]*4")
      const clap = s("~ pink ~ pink").decay(0.11).sustain(0).hpf(1400).lpf(5500).gain(0.13).room(0.35)
      const seq = "<[b3 d4 f#4 b4 d5 b4 f#4 d4]*2 [g3 b3 d4 g4 b4 g4 d4 b3]*2 [d4 f#4 a4 d5 f#5 d5 a4 f#4]*2 [a3 c#4 e4 a4 c#5 a4 e4 c#4]*2>"
      const arp = note(seq).s("square").decay(0.09).sustain(0).lpf(saw.range(900, 2600).slow(32)).gain(0.055)
        .delay(0.25).delaytime(0.352).delayfeedback(0.3).pan(sine.range(0.3, 0.7).slow(4))
      const arp2 = note(seq).add(note(12)).s("triangle").decay(0.07).sustain(0).lpf(3600).gain(0.04).pan(0.65)
      const chords = "<[b3,d4,f#4] [g3,b3,d4] [a3,d4,f#4] [a3,c#4,e4]>"
      const pad = note(chords).s("sawtooth").attack(0.4).release(0.8).lpf(saw.range(600, 1800).slow(32)).gain(0.06).room(0.6).roomsize(5)
      const stabs = note(chords).add(note(12)).struct("~ x ~ x ~ x x ~").s("sawtooth").decay(0.12).sustain(0).lpf(2200).gain(0.05).room(0.3).pan(0.42)
      const tune = "<[f#5 ~ b5 ~ d6 ~ c#6 b5] [d6 ~ ~ b5 g5 ~ ~ ~] [a5 ~ d6 ~ f#6 ~ e6 d6] [c#6 ~ ~ a5 e5 ~ ~ ~] [f#5 ~ b5 ~ d6 ~ f#6 ~] [g6 ~ f#6 d6 b5 ~ ~ ~] [a5 ~ d6 e6 f#6 ~ e6 d6] [c#6 ~ d6 e6 c#6 ~ ~ ~]>"
      const lead = note(tune).add(note(-12)).s("sawtooth").attack(0.01).decay(0.2).sustain(0.4).release(0.12).lpf(2300)
        .vib(5).vibmod(0.12).gain(0.07).room(0.4).delay(0.3).delaytime(0.352).delayfeedback(0.35).pan(0.56)
      const low = note(tune).add(note(-24)).s("square").decay(0.15).sustain(0.35).release(0.08).lpf(1200).gain(0.05).pan(0.44)
      const sparkle = note("<[b6 f#6 d6 f#6]*4 [b6 g6 d6 g6]*4 [a6 f#6 d6 f#6]*4 [a6 e6 c#6 e6]*4>")
        .s("sine").decay(0.05).sustain(0).gain(0.032).delay(0.3).delaytime(0.264).delayfeedback(0.4).pan(sine.range(0.2, 0.8).slow(2))
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(900, 5200).slow(8)).gain(saw.range(0, 0.06).slow(8))
    `,
    song: `arrange(
      [8, stack(kick, bass, hats, arp)],
      [8, stack(kick, bass, hats, clap, arp, pad, stabs)],
      [8, stack(kick, bass, hats16, clap, arp, pad, stabs, lead, sparkle)],
      [8, stack(kick2, bass, hats16, clap, arp, arp2, pad, stabs, lead, low, sparkle, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // how fast an orbit of radius r goes round (rad/s): Kepler, with everything speeding up a little
    const spin = (t) => lerp(1.1, 1.45, progress(t, 60, 1.2));
    const omega = (r, t) => spin(t) * Math.pow(120 / r, 1.5);

    // ---- the plan: when each arc of junk and each rogue appears (drawn up front, input-free) ----
    const events = [];
    {
      let t = 0.6;
      while (t < 62) {
        const p = progress(t, 60, 1.1);
        const n = plan.int(1, Math.round(lerp(2.2, 6, p)));
        const kinds = [];
        for (let k = 0; k < n; k++) kinds.push(plan.pick(['chunk', 'chunk', 'panel', 'stage']));
        events.push({
          t,
          type: 'arc',
          n,
          kinds,
          r: plan.range(R_ATM + 8, R_MAX - 2),
          side: plan.chance(0.5) ? 1 : -1,
          off: plan.range(1.7, 2.9),
          gap: plan.range(0.17, 0.33),
          life: plan.range(8, 12),
          tumble: plan.range(-2, 2),
        });
        t += lerp(2.3, 1.0, p) * plan.range(0.8, 1.2);
      }
      t = 2.2;
      while (t < 62) {
        const p = progress(t, 60, 1.2);
        events.push({
          t,
          type: 'rogue',
          aim: plan.chance(lerp(0.45, 0.85, p)),
          aimOff: plan.range(-9, 9),
          r: plan.range(R_ATM + 6, R_MAX - 4),
          side: plan.range(-0.5, 0.5),
          warn: lerp(1.15, 0.75, p),
          speed: plan.range(0.9, 1.15),
          travel: plan.range(1.45, 1.85) * Math.PI,
        });
        t += lerp(3.4, 1.0, p) * plan.range(0.8, 1.2);
      }
      events.sort((a, b) => a.t - b.t);
    }

    // ---- art ----
    const sky = paintSky(W, H, art);
    const stars = paintStars(780, art);
    const moon = paintMoon(art);
    const surface = paintSurface(art);
    const clouds = paintClouds(art);
    const shade = paintShade();
    const atmosphere = paintAtmosphere();
    const satSpr = paintSatellite();
    const junkSpr = {
      chunk: [paintJunk('chunk', art), paintJunk('chunk', art), paintJunk('chunk', art)],
      panel: [paintJunk('panel', art)],
      stage: [paintJunk('stage', art)],
    };
    const JUNK_R = { chunk: 6.5, panel: 7, stage: 8 };
    const JUNK_SIZE = { chunk: 19, panel: 21, stage: 26 };
    const rogueSpr = paintRogue();
    const sunGlow = glowSprite('rgba(255,225,170,1)', 120);
    const cyanGlow = glowSprite('rgba(110,220,255,1)', 24);
    const flameGlow = glowSprite('rgba(255,190,90,1)', 16);
    const redGlow = glowSprite('rgba(255,80,40,1)', 24);
    const heatGlow = glowSprite('rgba(255,110,50,1)', 24);
    const vignette = vignetteSprite(W, H, 0.6, '2,0,12');
    const exhaust = createParticles();
    const fx = createParticles();
    const twinkles = [];
    for (let i = 0; i < 16; i++) twinkles.push({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * 6, s: 0.8 + Math.random() * 1.2 });

    // ---- state ----
    const sat = { r: START_R, a: Math.PI / 2, vr: 0, heat: 0, dir: 0 };
    const trail = [];
    const hazards = [];
    let next = 0;
    let clock = 0;
    let time = 0;
    let flash = 0;
    let deadAt = null;

    const pos = (r, a) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r];

    const spawn = (e, t) => {
      if (e.type === 'arc') {
        const mid = sat.a + e.side * e.off;
        const half = ((e.n - 1) * e.gap) / 2;
        for (let k = 0; k < e.n; k++) {
          const kind = e.kinds[k];
          hazards.push({
            type: 'junk',
            kind,
            spr: junkSpr[kind][k % junkSpr[kind].length],
            r: e.r,
            a: mid - half + k * e.gap,
            hr: JUNK_R[kind],
            size: JUNK_SIZE[kind],
            rot: k * 1.3,
            tumble: e.tumble * (k % 2 ? 1 : -0.7),
            born: t,
            warn: 0.9,
            life: e.life,
            sign: 1,
            k: 1,
          });
        }
      } else {
        const r = e.aim ? clamp(sat.r + e.aimOff, R_ATM + 4, R_MAX - 2) : e.r;
        hazards.push({
          type: 'rogue',
          r,
          a: sat.a + Math.PI + e.side,
          hr: 7,
          size: 20,
          rot: 0,
          tumble: 5,
          born: t,
          warn: e.warn,
          sign: -1,
          k: e.speed,
          travel: e.travel,
          gone: 0,
        });
      }
    };

    // state of a hazard: 'warn' (materialising, harmless), 'live', 'fade' (harmless) or 'done'
    const stateOf = (h, t) => {
      const age = t - h.born;
      if (age < h.warn) return 'warn';
      if (h.type === 'junk') {
        if (age < h.warn + h.life) return 'live';
        if (age < h.warn + h.life + 0.5) return 'fade';
        return 'done';
      }
      if (h.gone < h.travel) return 'live';
      if (h.gone < h.travel + 0.6) return 'fade';
      return 'done';
    };

    const moveHazards = (dt, t) => {
      for (let i = hazards.length - 1; i >= 0; i--) {
        const h = hazards[i];
        const st = stateOf(h, t);
        h.state = st;
        if (st === 'done') {
          hazards.splice(i, 1);
          continue;
        }
        h.rot += h.tumble * dt;
        if (h.type === 'rogue') {
          if (st === 'warn') continue; // it holds still while it flares up
          const da = omega(h.r, t) * h.k * dt;
          h.a -= da;
          h.gone += da;
          if (st === 'live' && Math.random() < 0.7) {
            const [x, y] = pos(h.r, h.a);
            const tx = -Math.sin(h.a);
            const ty = Math.cos(h.a);
            fx.burst(x + tx * 4, y + ty * 4, { count: 1, speed: 30, life: 0.5, size: 3, round: true, colors: ['#ffcf5a', '#ff7a2a', '#ff4a1a'], angle: Math.atan2(ty, tx), spread: 0.8 });
          }
        } else {
          h.a += omega(h.r, t) * dt;
        }
      }
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      exhaust.update(dt);
      fx.update(dt);
      flash = Math.max(0, flash - dt * 2.5);
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { sat, hazards, omega },

      update(dt, dir, t) {
        time = t;
        updateCosmetic(dt);
        while (next < events.length && events[next].t <= t) spawn(events[next++], t);

        // thrust, drag and the orbit itself
        const p = progress(t, 60, 1.2);
        sat.dir = dir;
        sat.vr += (dir * RSPEED - sat.vr) * Math.min(1, 7 * dt);
        const drag = lerp(3, 7, p) * (sat.r < R_ATM ? 1.6 : 1);
        sat.r += (sat.vr - drag) * dt;
        if (sat.r < R_FLOOR) {
          sat.r = R_FLOOR;
          sat.vr = Math.max(0, sat.vr);
        } else if (sat.r > R_MAX) {
          sat.r = R_MAX;
          sat.vr = Math.min(0, sat.vr);
        }
        sat.a += omega(sat.r, t) * dt;
        const [sx, sy] = pos(sat.r, sat.a);

        // the upper atmosphere heats you up; out of it you cool off
        if (sat.r < R_ATM) sat.heat += dt * (0.55 + (R_ATM - sat.r) / 50);
        else sat.heat = Math.max(0, sat.heat - dt * 0.7);

        moveHazards(dt, t);

        // cosmetic: exhaust and the trail
        if (dir !== 0) {
          const ox = Math.cos(sat.a) * -dir;
          const oy = Math.sin(sat.a) * -dir;
          exhaust.burst(sx + ox * 8, sy + oy * 8, { count: 2, speed: 70, life: 0.35, size: 2.4, round: true, colors: ['#fff3c0', '#ffc35a', '#ff8a3a'], angle: Math.atan2(oy, ox), spread: 0.6 });
        }
        if (sat.heat > 0.05 && Math.random() < sat.heat) {
          fx.burst(sx, sy, { count: 1, speed: 40, life: 0.4, size: 3, round: true, colors: ['#ffd36a', '#ff6a2a'], angle: sat.a + Math.PI / 2 + Math.PI, spread: 0.8 });
        }
        trail.push([sx, sy]);
        if (trail.length > 46) trail.shift();

        // collisions
        if (sat.heat >= 1) {
          this.dead = true;
          this.deathReason = 'Burned up in the atmosphere.';
        } else {
          for (const h of hazards) {
            if (h.state !== 'live') continue;
            const [hx, hy] = pos(h.r, h.a);
            const dx = hx - sx;
            const dy = hy - sy;
            const rr = PR + h.hr * 0.9;
            if (dx * dx + dy * dy < rr * rr) {
              this.dead = true;
              this.deathReason = h.type === 'rogue' ? 'Smashed head-on into a rogue meteoroid.' : h.kind === 'stage' ? 'Rammed by a spent rocket stage.' : h.kind === 'panel' ? 'Sliced by a drifting solar panel.' : 'Hit by space junk.';
              break;
            }
          }
        }
        if (this.dead) {
          deadAt = [sx, sy];
          flash = 1;
          fx.burst(sx, sy, { count: 34, speed: 170, life: 1.1, size: 3, drag: 1.2, colors: ['#ffe9a0', '#f2c24a', '#4f8cff', '#ffffff', '#ff7a3a'] });
          fx.burst(sx, sy, { count: 14, speed: 90, life: 1.4, size: 4, drag: 0.8, colors: ['#2b5fd6', '#c98a1c', '#8a8f9e'] });
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        time += dt;
        moveHazards(dt, time);
        if (deadAt && Math.random() < 0.3) fx.burst(deadAt[0], deadAt[1], { count: 1, speed: 30, life: 0.7, size: 2.5, round: true, colors: ['#ff9a4a', '#ffd36a'] });
      },

      render(g) {
        const t = time;
        g.drawImage(sky.canvas, 0, 0, W, H);
        // slowly turning starfield
        g.save();
        g.translate(CX, CY);
        g.rotate(clock * 0.012);
        g.drawImage(stars.canvas, -stars.w / 2, -stars.h / 2, stars.w, stars.h);
        g.restore();
        for (const s of twinkles) {
          const a = 0.35 + 0.65 * Math.abs(Math.sin(clock * 1.6 + s.ph));
          g.fillStyle = `rgba(255,255,255,${a})`;
          g.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
          if (s.s > 1.6) {
            g.fillStyle = `rgba(200,220,255,${a * 0.4})`;
            g.fillRect(s.x - 3, s.y - 0.4, 6, 0.8);
            g.fillRect(s.x - 0.4, s.y - 3, 0.8, 6);
          }
        }
        // the sun's glow off the top right, and a far moon
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, W + 10, 70, { size: 320, alpha: 0.32 });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, moon, 52, 92, { size: 30 });

        // the outer edge of the reachable sky
        g.strokeStyle = 'rgba(160,170,255,0.08)';
        g.lineWidth = 1;
        g.setLineDash([2, 6]);
        g.beginPath();
        g.arc(CX, CY, R_MAX + 8, 0, TAU);
        g.stroke();
        g.setLineDash([]);

        // the planet: glowing air, the turning surface and clouds, then the fixed night shading
        const danger = clamp((R_ATM + 22 - sat.r) / 22, 0, 1);
        drawSprite(g, atmosphere, CX, CY, { alpha: 0.85 + 0.15 * Math.sin(clock * 2) });
        drawSprite(g, surface, CX, CY, { rot: clock * 0.05 });
        drawSprite(g, clouds, CX, CY, { rot: clock * 0.08 });
        drawSprite(g, shade, CX, CY);
        // the atmosphere's edge: you heat up inside it
        g.strokeStyle = `rgba(255,140,80,${0.22 + 0.5 * danger * (0.6 + 0.4 * Math.sin(clock * 10))})`;
        g.lineWidth = 1.5;
        g.setLineDash([4, 5]);
        g.lineDashOffset = -clock * 8;
        g.beginPath();
        g.arc(CX, CY, R_ATM, 0, TAU);
        g.stroke();
        g.setLineDash([]);
        g.lineDashOffset = 0;

        // orbits of the junk arcs (one faint ring per height)
        g.lineWidth = 1;
        const drawn = new Set();
        for (const h of hazards) {
          if (h.type !== 'junk' || drawn.has(h.r)) continue;
          drawn.add(h.r);
          const al = h.state === 'warn' ? 0.06 : h.state === 'fade' ? 0.03 : 0.1;
          g.strokeStyle = `rgba(200,205,225,${al})`;
          g.beginPath();
          g.arc(CX, CY, h.r, 0, TAU);
          g.stroke();
        }

        // your own orbit
        g.strokeStyle = 'rgba(110,220,255,0.22)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(CX, CY, sat.r, 0, TAU);
        g.stroke();

        // rogue paths: a red dashed arc ahead of each, round the way it's going
        for (const h of hazards) {
          if (h.type !== 'rogue' || h.state === 'fade') continue;
          const left = h.travel - h.gone;
          const span = Math.min(left, Math.PI * 1.15);
          if (span <= 0) continue;
          const pulse = h.state === 'warn' ? 0.5 + 0.5 * Math.sin(clock * 16) : 1;
          g.strokeStyle = `rgba(255,80,50,${0.45 * pulse})`;
          g.lineWidth = 2;
          g.setLineDash([5, 5]);
          g.lineDashOffset = clock * 30;
          g.beginPath();
          g.arc(CX, CY, h.r, h.a - span, h.a);
          g.stroke();
          g.setLineDash([]);
          g.lineDashOffset = 0;
        }

        // junk
        for (const h of hazards) {
          if (h.type !== 'junk') continue;
          const [x, y] = pos(h.r, h.a);
          if (h.state === 'warn') {
            const k = clamp((t - h.born) / h.warn, 0, 1);
            const flick = Math.sin(clock * 30) > 0 ? 1 : 0.5;
            g.strokeStyle = `rgba(220,225,255,${0.5 * (1 - k)})`;
            g.lineWidth = 1;
            g.beginPath();
            g.arc(x, y, h.size * (1.4 - 0.6 * k), 0, TAU);
            g.stroke();
            drawSprite(g, h.spr, x, y, { rot: h.rot, size: h.size, alpha: 0.15 + 0.35 * k * flick });
          } else {
            const alpha = h.state === 'fade' ? clamp(1 - (t - h.born - h.warn - h.life) / 0.5, 0, 1) : 1;
            drawSprite(g, h.spr, x, y, { rot: h.rot, size: h.size, alpha });
          }
        }

        // rogues
        g.globalCompositeOperation = 'lighter';
        for (const h of hazards) {
          if (h.type !== 'rogue') continue;
          const [x, y] = pos(h.r, h.a);
          if (h.state === 'warn') {
            const pulse = 0.5 + 0.5 * Math.sin(clock * 18);
            drawSprite(g, redGlow, x, y, { size: 44 + 14 * pulse, alpha: 0.35 + 0.35 * pulse });
          } else {
            const al = h.state === 'fade' ? 0.4 : 1;
            drawSprite(g, redGlow, x, y, { size: 42, alpha: 0.7 * al });
          }
        }
        g.globalCompositeOperation = 'source-over';
        for (const h of hazards) {
          if (h.type !== 'rogue') continue;
          const [x, y] = pos(h.r, h.a);
          if (h.state === 'warn') {
            const k = clamp((t - h.born) / h.warn, 0, 1);
            // a targeting reticle closing in
            g.strokeStyle = 'rgba(255,110,70,0.9)';
            g.lineWidth = 1.5;
            const rr = 18 - 8 * k;
            g.beginPath();
            g.arc(x, y, rr, 0, TAU);
            g.stroke();
            for (let q = 0; q < 4; q++) {
              const a = q * (Math.PI / 2) + clock * 2;
              g.beginPath();
              g.moveTo(x + Math.cos(a) * (rr + 2), y + Math.sin(a) * (rr + 2));
              g.lineTo(x + Math.cos(a) * (rr + 6), y + Math.sin(a) * (rr + 6));
              g.stroke();
            }
            drawSprite(g, rogueSpr, x, y, { rot: h.rot, size: h.size, alpha: 0.4 + 0.5 * k });
          } else {
            drawSprite(g, rogueSpr, x, y, { rot: h.rot, size: h.size, alpha: h.state === 'fade' ? 0.4 : 1 });
          }
        }

        fx.render(g, true);

        // the satellite, its trail and its thrusters
        if (!this.dead) {
          for (let i = 1; i < trail.length; i++) {
            const u = i / trail.length;
            g.strokeStyle = `rgba(120,225,255,${u * 0.45})`;
            g.lineWidth = u * 2.6;
            g.beginPath();
            g.moveTo(trail[i - 1][0], trail[i - 1][1]);
            g.lineTo(trail[i][0], trail[i][1]);
            g.stroke();
          }
          const [sx, sy] = pos(sat.r, sat.a);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, cyanGlow, sx, sy, { size: 46, alpha: 0.45 });
          if (sat.dir !== 0) {
            const fx0 = sx - Math.cos(sat.a) * sat.dir * 9;
            const fy0 = sy - Math.sin(sat.a) * sat.dir * 9;
            drawSprite(g, flameGlow, fx0, fy0, { size: 18 + Math.random() * 6, alpha: 0.9 });
          }
          if (sat.heat > 0) drawSprite(g, heatGlow, sx, sy, { size: 30 + 40 * sat.heat, alpha: clamp(sat.heat, 0, 1) });
          g.globalCompositeOperation = 'source-over';
          exhaust.render(g, true);
          drawSprite(g, satSpr, sx, sy, { rot: sat.a + Math.PI / 2, size: 34 });
          if (sat.heat > 0.15) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, satSpr, sx, sy, { rot: sat.a + Math.PI / 2, size: 34, alpha: clamp(sat.heat - 0.15, 0, 0.8) * 0.6 });
            g.globalCompositeOperation = 'source-over';
          }
        } else {
          exhaust.render(g, true);
        }

        // the altimeter at the bottom: low on the left, high on the right, like the controls
        const GX0 = 46;
        const GX1 = 314;
        const GY = 588;
        const toX = (r) => GX0 + ((r - R_FLOOR) / (R_MAX - R_FLOOR)) * (GX1 - GX0);
        g.fillStyle = 'rgba(8,10,30,0.6)';
        g.beginPath();
        g.roundRect(GX0 - 30, GY - 15, GX1 - GX0 + 60, 30, 15);
        g.fill();
        g.strokeStyle = 'rgba(150,170,255,0.25)';
        g.lineWidth = 1;
        g.stroke();
        const atmG = g.createLinearGradient(GX0, 0, toX(R_ATM), 0);
        atmG.addColorStop(0, 'rgba(255,110,60,0.65)');
        atmG.addColorStop(1, 'rgba(255,140,80,0.12)');
        g.fillStyle = atmG;
        g.fillRect(GX0, GY - 3, toX(R_ATM) - GX0, 6);
        g.fillStyle = 'rgba(140,170,255,0.25)';
        g.fillRect(toX(R_ATM), GY - 1, GX1 - toX(R_ATM), 2);
        // the planet and open space at the two ends
        g.fillStyle = '#2a8fd0';
        g.beginPath();
        g.arc(GX0 - 14, GY, 7, 0, TAU);
        g.fill();
        g.fillStyle = '#5fae5a';
        g.beginPath();
        g.arc(GX0 - 16, GY - 2, 3, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(230,235,255,0.85)';
        for (const [dx, dy, s] of [[12, -4, 1.6], [16, 3, 1.2], [20, -1, 1.8]]) g.fillRect(GX1 + dx - s / 2, GY + dy - s / 2, s, s);
        // junk heights
        for (const h of hazards) {
          if (h.type !== 'junk' || h.state === 'fade') continue;
          g.fillStyle = h.state === 'warn' ? 'rgba(210,215,235,0.3)' : 'rgba(210,215,235,0.7)';
          g.fillRect(toX(h.r) - 1, GY - 7, 2, 14);
        }
        // rogue heights: brighter as one closes in
        for (const h of hazards) {
          if (h.type !== 'rogue' || h.state === 'fade') continue;
          const x = toX(h.r);
          let close = 0.5;
          if (h.state === 'live') {
            const gap = Math.abs(angDiff(h.a, sat.a));
            close = clamp(1.2 - gap / 2, 0.35, 1);
          } else close = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(clock * 16));
          g.fillStyle = `rgba(255,80,50,${close})`;
          g.beginPath();
          g.moveTo(x, GY - 3);
          g.lineTo(x - 5, GY - 12);
          g.lineTo(x + 5, GY - 12);
          g.closePath();
          g.fill();
          g.beginPath();
          g.moveTo(x, GY + 3);
          g.lineTo(x - 5, GY + 12);
          g.lineTo(x + 5, GY + 12);
          g.closePath();
          g.fill();
        }
        // you
        if (!this.dead) {
          const x = toX(sat.r);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, cyanGlow, x, GY, { size: 26, alpha: 0.6 });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = sat.heat > 0.05 ? '#ffb07a' : '#8fe6ff';
          g.beginPath();
          g.moveTo(x, GY - 7);
          g.lineTo(x + 5, GY);
          g.lineTo(x, GY + 7);
          g.lineTo(x - 5, GY);
          g.closePath();
          g.fill();
          g.strokeStyle = '#0a1a33';
          g.lineWidth = 1;
          g.stroke();
          // heat bar
          if (sat.heat > 0.01) {
            g.fillStyle = 'rgba(40,10,0,0.6)';
            g.fillRect(GX0, GY + 18, GX1 - GX0, 4);
            g.fillStyle = '#ff6a2a';
            g.fillRect(GX0, GY + 18, (GX1 - GX0) * clamp(sat.heat, 0, 1), 4);
          }
        }
        g.font = '600 10px system-ui, sans-serif';
        g.textAlign = 'left';
        g.fillStyle = 'rgba(200,210,255,0.55)';
        g.fillText('◀ LOWER', GX0 - 26, GY - 22);
        g.textAlign = 'right';
        g.fillText('HIGHER ▶', GX1 + 26, GY - 22);
        g.textAlign = 'left';

        if (flash > 0) {
          g.fillStyle = `rgba(255,240,220,${flash * 0.35})`;
          g.fillRect(0, 0, W, H);
        }
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
