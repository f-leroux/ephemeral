// Time Out — dodgeball in a school gym, where time only flows while you move. Standing still,
// the whole gym drops into slow motion (balls crawl, the throwers wind up at a snail's pace);
// the moment you run, everything snaps back to full speed. So every dodge has a cost: wait in
// the slow, read where each ball is going, then make the smallest, latest move that clears it.
// One hit and you're out.
//
// Four kids on the far side take turns throwing. Each wind-up shows a dashed aim line that
// follows you until the ball leaves the hand, then locks. Throws come as: straight at you, at a
// random spot, leading you (aimed where you're running to), pairs straddling you (stand still!),
// trios with two narrow gaps, and from 28s bank shots off the padded side walls.
// The kinds and their random parameters are drawn from the rng in a fixed order, one throw at a
// time, so the sequence is the same for everyone; only when they come depends on how you move.

import { BODY_FONT } from '../engine/stage.js';
import { createParticles, createMover, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const TAU = Math.PI * 2;
const XL = 16; // inner faces of the padded side walls
const XR = 344;
const BR = 10; // ball radius
const A = XL + BR; // where a ball's centre bounces off a wall
const C = XR - BR;
const L = C - A;
const PY = 548; // the player's line
const PR = 12; // player hitbox
const MS = 290; // player top speed
const HAND_Y = 172; // where balls leave the throwers' hands
const LANES = [66, 142, 218, 294];
const TOPLINE = 104; // far baseline
const MIDLINE = 238;

const fold = (u) => {
  let m = (u - A) % (2 * L);
  if (m < 0) m += 2 * L;
  return m <= L ? A + m : A + 2 * L - m;
};
const segOf = (u) => Math.floor((u - A) / L);

// ---------- art ----------

function paintScene(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // the gym wall behind the far baseline
    const wall = g.createLinearGradient(0, 0, 0, 100);
    wall.addColorStop(0, '#0c1430');
    wall.addColorStop(1, '#1d2d5c');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, 100);
    // cinder-block courses
    g.strokeStyle = 'rgba(140,170,255,0.07)';
    g.lineWidth = 1;
    for (let y = 6; y < 70; y += 10) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
      for (let x = ((y / 10) % 2) * 15; x < W; x += 30) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 10);
        g.stroke();
      }
    }
    // high windows letting the afternoon in
    for (const wx of [40, 250]) {
      const gr = g.createLinearGradient(wx, 4, wx + 70, 30);
      gr.addColorStop(0, '#ffe7b0');
      gr.addColorStop(1, '#f7b860');
      g.fillStyle = gr;
      g.fillRect(wx, 6, 70, 22);
      g.strokeStyle = '#0a1028';
      g.lineWidth = 2;
      g.strokeRect(wx, 6, 70, 22);
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        g.moveTo(wx + k * 17.5, 6);
        g.lineTo(wx + k * 17.5, 28);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(wx, 17);
      g.lineTo(wx + 70, 17);
      g.stroke();
    }
    // bleachers with the crowd
    for (let r = 0; r < 3; r++) {
      const y = 46 + r * 15;
      g.fillStyle = r % 2 ? '#3a2a1c' : '#4a3624';
      g.fillRect(0, y + 8, W, 7);
      g.fillStyle = 'rgba(255,220,170,0.25)';
      g.fillRect(0, y + 8, W, 1);
    }
    const shirts = ['#2fb8a8', '#ffd23f', '#f3f6ff', '#2fb8a8', '#ff6b4a', '#7b6cff', '#ffd23f'];
    const skins = ['#f4c9a0', '#d9a074', '#a86a42', '#7a4a2a', '#f0b98e'];
    const hairs = ['#2a1a10', '#5a3418', '#e0b050', '#141414', '#8a3a1a'];
    for (let r = 0; r < 3; r++) {
      const y = 46 + r * 15;
      for (let x = 6 + r * 4; x < W; x += rng.range(13, 19)) {
        if (rng.chance(0.12)) continue;
        g.fillStyle = rng.pick(shirts);
        g.beginPath();
        g.roundRect(x - 5, y + 1, 10, 9, 3);
        g.fill();
        g.fillStyle = rng.pick(skins);
        g.beginPath();
        g.arc(x, y - 1, 3.6, 0, TAU);
        g.fill();
        g.fillStyle = rng.pick(hairs);
        g.beginPath();
        g.arc(x, y - 2.2, 3.7, Math.PI, TAU);
        g.fill();
      }
    }
    // the rail in front of the bleachers
    g.fillStyle = '#c8d0e6';
    g.fillRect(0, 92, W, 3);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 95, W, 5);
    // the floor: maple strips running up the court
    const floor = g.createLinearGradient(0, 100, 0, H);
    floor.addColorStop(0, '#c98d4e');
    floor.addColorStop(0.5, '#e2aa68');
    floor.addColorStop(1, '#d39a58');
    g.fillStyle = floor;
    g.fillRect(0, 100, W, H - 100);
    for (let x = 0; x < W; x += 9) {
      g.fillStyle = `rgba(${rng.chance(0.5) ? '120,60,20' : '255,220,170'},${rng.range(0.03, 0.09).toFixed(3)})`;
      g.fillRect(x, 100, 9, H - 100);
      g.fillStyle = 'rgba(90,45,15,0.16)';
      g.fillRect(x, 100, 0.7, H - 100);
      // butt joints, staggered
      let y = 100 + rng.range(0, 90);
      while (y < H) {
        g.fillRect(x, y, 9, 0.7);
        y += rng.range(70, 150);
      }
    }
    // grain
    g.strokeStyle = 'rgba(110,55,15,0.08)';
    g.lineWidth = 0.6;
    for (let i = 0; i < 140; i++) {
      const x = Math.floor(rng.range(0, W / 9)) * 9 + rng.range(1, 8);
      const y = rng.range(100, H);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + rng.range(-1.5, 1.5), y + 8, x, y + rng.range(14, 30));
      g.stroke();
    }
    // the far team's half is painted
    g.fillStyle = 'rgba(200,40,40,0.13)';
    g.fillRect(XL, TOPLINE, XR - XL, MIDLINE - TOPLINE);
    // court lines
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(XL, TOPLINE - 2, XR - XL, 3);
    g.fillRect(XL, 606, XR - XL, 3);
    g.fillStyle = '#1b3a8a';
    g.fillRect(XL, MIDLINE - 3, XR - XL, 6);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(W / 2, MIDLINE, 44, 0, TAU);
    g.stroke();
    // the school crest in the centre circle
    g.fillStyle = 'rgba(27,58,138,0.85)';
    g.beginPath();
    g.arc(W / 2, MIDLINE, 30, 0, TAU);
    g.fill();
    g.fillStyle = '#ffd23f';
    g.font = `900 22px ${BODY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('★', W / 2, MIDLINE + 1);
    // attack lines
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    for (const y of [MIDLINE - 70, MIDLINE + 110]) {
      g.beginPath();
      g.moveTo(XL, y);
      g.lineTo(XR, y);
      g.stroke();
    }
    g.setLineDash([]);
    // the key-shaped zone at your end
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(W / 2, 606, 70, Math.PI, TAU);
    g.stroke();
    // late-afternoon light shafts across the floor
    g.globalCompositeOperation = 'lighter';
    for (const [x0, w] of [[40, 70], [250, 70]]) {
      g.beginPath();
      g.moveTo(x0, 100);
      g.lineTo(x0 + w, 100);
      g.lineTo(x0 + w + 150, H);
      g.lineTo(x0 + 110, H);
      g.closePath();
      const sh = g.createLinearGradient(0, 100, 0, H);
      sh.addColorStop(0, 'rgba(255,200,120,0.16)');
      sh.addColorStop(1, 'rgba(255,200,120,0.02)');
      g.fillStyle = sh;
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // the gloss of a freshly waxed floor
    const gl = g.createLinearGradient(0, 100, W, H);
    gl.addColorStop(0, 'rgba(255,255,255,0)');
    gl.addColorStop(0.45, 'rgba(255,255,255,0)');
    gl.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    gl.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.fillRect(0, 100, W, H - 100);
    // padded side walls
    for (const [x, w] of [[0, XL], [XR, W - XR]]) {
      const pad = g.createLinearGradient(x, 0, x + w, 0);
      const inner = x === 0 ? 1 : 0;
      pad.addColorStop(inner ? 0 : 1, '#0f2a6e');
      pad.addColorStop(0.5, '#2453c4');
      pad.addColorStop(inner ? 1 : 0, '#3a6ef0');
      g.fillStyle = pad;
      g.fillRect(x, 100, w, H - 100);
      g.strokeStyle = 'rgba(10,20,60,0.6)';
      g.lineWidth = 1.5;
      for (let y = 160; y < H; y += 80) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w, y);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,0.2)';
      g.setLineDash([3, 3]);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + w / 2, 100);
      g.lineTo(x + w / 2, H);
      g.stroke();
      g.setLineDash([]);
    }
  });
}

function makeBall() {
  return makeSprite(26, 26, (g) => {
    g.beginPath();
    g.arc(0, 0, 11, 0, TAU);
    const gr = g.createRadialGradient(-4, -4, 1, 0, 0, 12);
    gr.addColorStop(0, '#ff9c7a');
    gr.addColorStop(0.5, '#ea3b2a');
    gr.addColorStop(1, '#8e1410');
    g.fillStyle = gr;
    g.fill();
    // the moulded seam and pebble texture
    g.strokeStyle = 'rgba(90,10,6,0.55)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(0, 0, 11, 4.2, 0.5, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(120,20,10,0.35)';
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996;
      const r = 9.5 * Math.sqrt((i + 0.5) / 26);
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.7, 0, TAU);
      g.fill();
    }
    g.strokeStyle = '#6a0c08';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, 11, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(-4, -5, 3.6, 1.8, -0.6, 0, TAU);
    g.fill();
  });
}

// you, seen from behind: teal jersey with a big 7
function makePlayer() {
  const body = makeSprite(40, 52, (g) => {
    // legs and sneakers are drawn per frame; this is shorts, torso and head
    g.fillStyle = '#123a5c';
    g.beginPath();
    g.roundRect(-10, 6, 20, 9, 3);
    g.fill();
    const jer = g.createLinearGradient(-13, 0, 13, 0);
    jer.addColorStop(0, '#13857a');
    jer.addColorStop(0.45, '#2fd3c0');
    jer.addColorStop(1, '#0f6e66');
    g.fillStyle = jer;
    g.beginPath();
    g.moveTo(-13, -9);
    g.quadraticCurveTo(-14, -14, -8, -15);
    g.lineTo(8, -15);
    g.quadraticCurveTo(14, -14, 13, -9);
    g.lineTo(11, 8);
    g.lineTo(-11, 8);
    g.closePath();
    g.fill();
    g.strokeStyle = '#0a4a44';
    g.lineWidth = 1.2;
    g.stroke();
    // trim
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-8, -15);
    g.quadraticCurveTo(0, -12, 8, -15);
    g.stroke();
    g.fillStyle = '#ffd23f';
    g.font = `900 13px ${BODY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('7', 0, -2);
    g.strokeStyle = 'rgba(10,60,50,0.6)';
    g.lineWidth = 0.6;
    g.strokeText('7', 0, -2);
    // head from behind: hair and ears
    g.fillStyle = '#e8b48a';
    g.beginPath();
    g.ellipse(-8.2, -21, 2, 2.6, 0, 0, TAU);
    g.ellipse(8.2, -21, 2, 2.6, 0, 0, TAU);
    g.fill();
    const hair = g.createRadialGradient(-2, -25, 1, 0, -21, 10);
    hair.addColorStop(0, '#8a5a2e');
    hair.addColorStop(1, '#3a220e');
    g.fillStyle = hair;
    g.beginPath();
    g.arc(0, -21.5, 8.6, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,220,170,0.35)';
    g.lineWidth = 0.8;
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      g.moveTo(k * 2.4, -29);
      g.quadraticCurveTo(k * 3.2, -24, k * 2.8, -16);
      g.stroke();
    }
    // a headband
    g.fillStyle = '#ffd23f';
    g.fillRect(-8.6, -24, 17.2, 2.4);
  });
  return body;
}

// the far team, facing you: red jerseys, four different kids
function makeThrower(skin, hair, style) {
  return makeSprite(40, 54, (g) => {
    // legs
    g.fillStyle = skin;
    g.fillRect(-7, 10, 5, 11);
    g.fillRect(2, 10, 5, 11);
    g.fillStyle = '#f2f2f2';
    g.beginPath();
    g.roundRect(-8.5, 19, 7.5, 5, 2);
    g.roundRect(1, 19, 7.5, 5, 2);
    g.fill();
    // shorts
    g.fillStyle = '#2a1018';
    g.beginPath();
    g.roundRect(-10, 4, 20, 9, 3);
    g.fill();
    // jersey
    const jer = g.createLinearGradient(-13, 0, 13, 0);
    jer.addColorStop(0, '#9a1420');
    jer.addColorStop(0.45, '#e8394a');
    jer.addColorStop(1, '#8a1018');
    g.fillStyle = jer;
    g.beginPath();
    g.moveTo(-13, -8);
    g.quadraticCurveTo(-13, -13, -7, -14);
    g.lineTo(7, -14);
    g.quadraticCurveTo(13, -13, 13, -8);
    g.lineTo(11, 7);
    g.lineTo(-11, 7);
    g.closePath();
    g.fill();
    g.strokeStyle = '#5a0810';
    g.lineWidth = 1.2;
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-6, -14);
    g.lineTo(0, -9);
    g.lineTo(6, -14);
    g.stroke();
    // head with a face
    g.fillStyle = skin;
    g.beginPath();
    g.arc(0, -20, 8.4, 0, TAU);
    g.fill();
    g.fillStyle = hair;
    g.beginPath();
    if (style === 0) {
      g.arc(0, -22, 8.8, Math.PI * 1.02, TAU * 0.99);
      g.lineTo(6, -24);
      g.lineTo(-6, -24);
    } else if (style === 1) {
      g.arc(0, -21, 9.2, Math.PI * 0.95, TAU * 1.01);
      g.lineTo(8, -18);
      g.quadraticCurveTo(0, -27, -8, -18);
    } else if (style === 2) {
      g.arc(0, -22, 8.6, Math.PI, TAU);
      g.arc(-9, -17, 3.6, 0, TAU);
      g.moveTo(12.6, -17);
      g.arc(9, -17, 3.6, 0, TAU);
    } else {
      for (let k = -3; k <= 3; k++) {
        g.moveTo(k * 2.6 + 3, -26);
        g.arc(k * 2.6, -26 + Math.abs(k) * 0.8, 3, 0, TAU);
      }
    }
    g.fill();
    // eyes and a determined mouth
    g.fillStyle = '#1a0a08';
    g.beginPath();
    g.ellipse(-3.2, -19.5, 1.2, 1.6, 0, 0, TAU);
    g.ellipse(3.2, -19.5, 1.2, 1.6, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#1a0a08';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-5, -23);
    g.lineTo(-1.5, -22);
    g.moveTo(5, -23);
    g.lineTo(1.5, -22);
    g.moveTo(-2.5, -15.4);
    g.lineTo(2.5, -15.4);
    g.stroke();
    g.fillStyle = 'rgba(255,120,110,0.35)';
    g.beginPath();
    g.arc(-5.4, -16.8, 1.8, 0, TAU);
    g.arc(5.4, -16.8, 1.8, 0, TAU);
    g.fill();
  });
}

function makeStopwatch() {
  return makeSprite(44, 50, (g) => {
    g.translate(0, 3);
    g.fillStyle = '#c9d2ea';
    g.fillRect(-4, -25, 8, 5);
    g.beginPath();
    g.roundRect(-6, -27, 12, 4, 2);
    g.fill();
    g.save();
    g.rotate(0.7);
    g.fillRect(-2, -24, 4, 5);
    g.restore();
    g.beginPath();
    g.arc(0, 0, 20, 0, TAU);
    const rim = g.createLinearGradient(-20, -20, 20, 20);
    rim.addColorStop(0, '#f4f7ff');
    rim.addColorStop(0.5, '#9aa6c8');
    rim.addColorStop(1, '#5a6890');
    g.fillStyle = rim;
    g.fill();
    g.beginPath();
    g.arc(0, 0, 16.5, 0, TAU);
    g.fillStyle = '#0d1530';
    g.fill();
    g.strokeStyle = 'rgba(200,220,255,0.7)';
    g.lineWidth = 1;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      const r0 = k % 3 ? 13.5 : 11.5;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * 15.5, Math.sin(a) * 15.5);
      g.stroke();
    }
  });
}

// ---------- music: marching-drumline breakbeat, 136 BPM, D major over D–A–Bm–G ----------

const music = {
  cps: 136 / 240, // one 4/4 bar per cycle: 34 bars = 60s
  setup: `
    const kick = note("d2 ~ ~ ~ ~ ~ d2 ~ ~ ~ d2 ~ ~ ~ ~ ~").s("sine").decay(0.22).sustain(0).gain(0.8)
    const kick2 = note("d2 ~ ~ d2 ~ ~ d2 ~ ~ ~ d2 ~ ~ d2 ~ d2").s("sine").decay(0.2).sustain(0).gain(0.8)
    const snare = s("~ pink ~ pink").decay(0.14).sustain(0).hpf(900).lpf(6000).gain(0.16).room(0.2)
    const line = s("white*16").decay(0.025).sustain(0).hpf(2600).lpf(6800).gain("[0.05 0.012 0.025 0.012 0.03 0.012 0.025 0.04]*2")
    const roll = s("<~ ~ ~ white*32>").decay(0.02).sustain(0).hpf(2400).lpf(6500).gain(saw.range(0.006, 0.05))
    const quads = note("~ ~ a3 ~ fs3 ~ ~ d3 ~ a3 ~ ~ fs3 d3 ~ ~").s("sine").decay(0.1).sustain(0).gain(0.2)
    const hat = s("[~ white]*4").decay(0.035).sustain(0).hpf(7000).gain(0.04)
    const bell = note("a5*8").s("square").decay(0.03).sustain(0).lpf(2600).gain("[0.03 0.015]*4").pan(0.62)
    const clap = s("~ ~ ~ ~ white ~ ~ white ~ ~ white ~ white ~ ~ ~").decay(0.09).sustain(0).hpf(1500).lpf(5000).gain(0.07).room(0.3).pan(0.4)
    const bass = note("<[d2 ~ d3 d2 ~ a2 d3 ~] [a2 ~ a3 a2 ~ e3 a3 ~] [b2 ~ b3 b2 ~ fs3 b3 ~] [g2 ~ g3 g2 ~ d3 g3 ~]>")
      .s("sawtooth").attack(0.004).decay(0.14).sustain(0.25).release(0.05).lpf(saw.range(420, 1800).slow(34)).lpq(3).gain(0.3)
    const chords = "<[d4,fs4,a4] [cs4,e4,a4] [d4,fs4,b4] [d4,g4,b4]>"
    const brass = note(chords).struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ x ~ ~ ~").s("sawtooth").attack(0.01).decay(0.16).sustain(0.1).release(0.05)
      .lpf(saw.range(1100, 2400).slow(34)).gain(0.06).room(0.25)
    const pad = note(chords).s("sawtooth").attack(0.3).release(0.6).lpf(1000).gain(0.04).room(0.5)
    const tune = "<[a4 ~ d5 ~ fs5 ~ e5 d5] [e5 ~ ~ cs5 e5 ~ a5 ~] [fs5 ~ d5 ~ b4 ~ d5 fs5] [g5 ~ fs5 ~ e5 ~ d5 e5]>"
    const lead = note(tune).s("sawtooth").attack(0.015).decay(0.18).sustain(0.5).release(0.1).lpf(2300).vib(5).vibmod(0.08)
      .gain(0.07).delay(0.2).delaytime(0.3309).delayfeedback(0.25).pan(0.55)
    const leadHigh = note(tune).add(note(12)).s("square").attack(0.01).decay(0.12).sustain(0.3).release(0.08).lpf(2600).gain(0.035).pan(0.45)
    const glock = note("<[d5 fs5 a5 d6]*4 [cs5 e5 a5 cs6]*4 [b4 d5 fs5 b5]*4 [b4 d5 g5 b5]*4>")
      .s("triangle").decay(0.08).sustain(0).lpf(4000).gain(0.035).pan(sine.range(0.3, 0.7).slow(2))
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(9)).gain(saw.range(0, 0.05).slow(9))
  `,
  song: `arrange(
    [8, stack(kick, snare, line, roll, quads, bass, brass)],
    [8, stack(kick, snare, line, roll, quads, hat, bell, clap, bass, brass, pad)],
    [9, stack(kick, snare, line, roll, quads, hat, bell, clap, bass, brass, pad, lead, glock)],
    [9, stack(kick2, snare, line, roll, quads, hat, bell, clap, bass, brass, pad, lead, leadHigh, glock, wash)]
  )`,
};

export default {
  id: 'timeout',
  title: 'Time Out',
  emoji: '⏱️',
  tagline: 'Time only moves when you do. Dodge every ball: one hit and you’re out.',
  colors: { bg: '#0f1838', fg: '#ffffff', accent: '#2fd3c0' },
  music,

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- art ----
    const scene = paintScene(W, H, art);
    const ballSpr = makeBall();
    const playerSpr = makePlayer();
    const watchSpr = makeStopwatch();
    const kids = [
      { skin: '#f0c49a', hair: '#2a1a10', style: 0 },
      { skin: '#a8683e', hair: '#141414', style: 3 },
      { skin: '#e8b48a', hair: '#d8a040', style: 2 },
      { skin: '#7a4a2a', hair: '#1a0e08', style: 1 },
    ].map((k) => makeThrower(k.skin, k.hair, k.style));
    const glowRed = glowSprite('rgba(255,80,50,0.8)', 26);
    const glowTeal = glowSprite('rgba(60,240,220,0.7)', 40);
    const glowWhite = glowSprite('rgba(255,255,255,0.9)', 30);
    const glowSun = glowSprite('rgba(255,210,140,0.6)', 20);
    const vignette = vignetteSprite(W, H, 0.5, '8,10,30');
    const coldVignette = vignetteSprite(W, H, 0.85, '30,80,180');

    const fx = createParticles();
    const sparks = createParticles();
    const rings = [];
    const motes = [];
    for (let i = 0; i < 36; i++) motes.push({ x: Math.random() * W, y: 110 + Math.random() * (H - 110), s: 0.6 + Math.random() * 1.4, ph: Math.random() * TAU });

    // ---- state ----
    const mover = createMover({ x: W / 2, minX: XL + 14, maxX: XR - 14, speed: MS, accel: 22 });
    const throwers = LANES.map((x, i) => ({ i, x, state: 'idle', k: 0, wx: x, aim: [], vol: null, swing: 0, reload: 0 }));
    const volleys = [];
    const balls = [];
    let wt = 0; // world time: only runs at full speed while you move
    let ts = 1; // current time scale
    let now = 0; // real time
    let clock = 0;
    let nextWT = 0.9;
    let spec = null;
    let dodged = 0;
    let shake = 0;
    let runPhase = 0;
    let deathX = W / 2;
    let outFlash = 0;
    let knocked = 0;
    let lockFlash = 0;

    const drawSpec = (t) => {
      // always the same number of draws, whatever happens
      const kr = plan.next();
      const br = plan.next();
      const off = plan.range(-9, 9);
      const r = plan.next();
      const r2 = plan.next();
      const speedK = plan.range(0.94, 1.06);
      const gapK = plan.range(0.85, 1.15);
      const p = progress(t, 60, 1.3);
      let kind = 'aim';
      if (t > 4) {
        const ws = [
          ['stray', 0.2],
          ['lead', t > 10 ? lerp(0.16, 0.26, p) : 0],
          ['pair', t > 13 ? 0.14 : 0],
          ['trio', t > 22 ? lerp(0.1, 0.2, p) : 0],
        ];
        let acc = 0;
        for (const [k, w] of ws) {
          acc += w;
          if (kr < acc) {
            kind = k;
            break;
          }
        }
      }
      const bank = t > 28 && (kind === 'aim' || kind === 'lead' || kind === 'stray') && br < lerp(0.25, 0.42, p);
      return { kind, bank, off, r, r2, speedK, gapK, p };
    };

    // where the throw is aimed right now (follows you until release)
    const aimTargets = (v) => {
      const px = mover.x;
      const s = v.spec;
      if (s.kind === 'stray') return [lerp(A + 12, C - 12, s.r2)];
      if (s.kind === 'pair') {
        const c = clamp(px, A + 40, C - 40);
        return [c - 37, c + 37];
      }
      if (s.kind === 'trio') {
        const c = clamp(px, A + 72, C - 72);
        return [c - 70, c, c + 70];
      }
      let x = px + s.off;
      if (s.kind === 'lead') x += mover.vx * 0.55;
      return [clamp(x, A + 2, C - 2)];
    };
    // unrolled x for a bank shot off the wall nearer the thrower
    const unroll = (x0, tx, bank) => {
      if (!bank) return tx;
      const c1 = 2 * C - tx;
      const c2 = 2 * A - tx;
      return Math.abs(c1 - x0) < Math.abs(c2 - x0) ? c1 : c2;
    };

    const reasonFor = (s) => {
      if (s.bank) return 'Hit by a ball banked off the wall. You’re out!';
      if (s.kind === 'pair' || s.kind === 'trio') return 'Caught in a volley. You’re out!';
      if (s.kind === 'stray') return 'Ran into a ball. You’re out!';
      if (s.kind === 'lead') return 'They threw where you were running. You’re out!';
      return 'Hit by a dodgeball. You’re out!';
    };

    const tryLaunch = (t) => {
      if (!spec) spec = drawSpec(t);
      const n = spec.kind === 'trio' ? 3 : spec.kind === 'pair' ? 2 : 1;
      const free = throwers.filter((th) => th.state === 'idle');
      if (free.length < n) return false;
      // pairs and trios turn into a single throw when you're pinned against a wall
      const s = spec;
      if ((s.kind === 'pair' && (mover.x < A + 36 || mover.x > C - 36)) || (s.kind === 'trio' && (mover.x < A + 50 || mover.x > C - 50))) s.kind = 'aim';
      const m = s.kind === 'trio' ? 3 : s.kind === 'pair' ? 2 : 1;
      const start = Math.floor(s.r * free.length);
      let picked = [];
      for (let j = 0; j < m; j++) picked.push(free[(start + j) % free.length]);
      picked.sort((a, b) => a.x - b.x);
      const wind = lerp(0.8, 0.46, s.p);
      const v = { spec: s, throwers: picked, t0: wt, t1: wt + wind, targets: [] };
      for (const th of picked) {
        th.state = 'wind';
        th.vol = v;
        th.wx = th.x;
      }
      v.targets = aimTargets(v);
      volleys.push(v);
      const gap = lerp(1.05, 0.36, s.p) * s.gapK * (m > 1 ? 1.35 : 1);
      nextWT = wt + gap;
      spec = null;
      return true;
    };

    const release = (v) => {
      v.targets = aimTargets(v);
      const s = v.spec;
      const V = lerp(310, 480, s.p) * s.speedK;
      v.throwers.forEach((th, j) => {
        const x0 = th.wx + 9;
        const tx = v.targets[j];
        const U = unroll(x0, tx, s.bank);
        const dx = U - x0;
        const dy = PY - HAND_Y;
        const len = Math.hypot(dx, dy);
        balls.push({ u: x0, x: x0, y: HAND_Y, vx: (dx / len) * V, vy: (dy / len) * V, seg: segOf(x0), cross: tx, spec: s, state: 'fly', spin: 0, passed: false, a: 1 });
        th.state = 'throw';
        th.k = 0;
        th.vol = null;
        sparks.burst(x0, HAND_Y, { count: 6, speed: 90, life: 0.3, size: 2.5, angle: Math.atan2(dy, dx), spread: 1, colors: ['#ffffff', '#ffd0b0'] });
      });
      lockFlash = 0.25;
    };

    const stepWorld = (dtw, play, game) => {
      // throwers drift around their spots and reload
      throwers.forEach((th) => {
        if (th.state === 'wind') return;
        const target = LANES[th.i] + Math.sin(wt * 0.7 + th.i * 1.9) * 14;
        th.x += clamp(target - th.x, -40 * dtw, 40 * dtw);
        if (th.state === 'throw') {
          th.k += dtw;
          if (th.k > 0.3) {
            th.state = 'empty';
            th.k = 0;
          }
        } else if (th.state === 'empty') {
          th.k += dtw;
          if (th.k > 0.35) th.state = 'idle';
        }
      });
      for (let i = volleys.length - 1; i >= 0; i--) {
        const v = volleys[i];
        if (play) v.targets = aimTargets(v);
        if (wt >= v.t1) {
          release(v);
          volleys.splice(i, 1);
        }
      }
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        b.spin += dtw * 9;
        if (b.state === 'fly') {
          b.u += b.vx * dtw;
          b.y += b.vy * dtw;
          b.x = fold(b.u);
          const seg = segOf(b.u);
          if (seg !== b.seg) {
            b.seg = seg;
            const wx = b.x < W / 2 ? XL : XR;
            sparks.burst(wx, b.y, { count: 10, speed: 120, life: 0.35, size: 2.5, angle: wx === XL ? 0 : Math.PI, spread: 2, colors: ['#ffffff', '#bcd2ff', '#ffd23f'] });
            rings.push({ x: wx, y: b.y, age: 0, max: 0.35, r0: 4, r1: 22, col: '200,220,255' });
          }
          if (play && !game.dead && Math.abs(b.y - PY) < BR + PR + 2) {
            const dx = b.x - mover.x;
            const dy = b.y - PY;
            if (dx * dx + dy * dy < (BR + PR) * (BR + PR)) {
              game.dead = true;
              game.deathReason = reasonFor(b.spec);
              deathX = mover.x;
              outFlash = 1;
              shake = 0.45;
              knocked = Math.sign(dx || 1);
              b.state = 'bounce';
              b.vx = -dx * 14 + (Math.random() - 0.5) * 60;
              b.vy = -260;
              fx.burst(mover.x, PY - 6, { count: 30, speed: 240, life: 0.8, size: 4, colors: ['#ffd23f', '#ffffff', '#ff6b4a'], drag: 2 });
              rings.push({ x: b.x, y: b.y, age: 0, max: 0.45, r0: 8, r1: 50, col: '255,220,120' });
              continue;
            }
          }
          if (!b.passed && b.y > PY + BR + PR + 2) {
            b.passed = true;
            if (play && !game.dead) dodged++;
          }
          if (b.y > 616) {
            // bounces off the back wall and dribbles away
            b.state = 'roll';
            b.vy = -Math.abs(b.vy) * 0.3;
            b.vx *= 0.5;
            sparks.burst(b.x, 618, { count: 6, speed: 80, life: 0.3, size: 2, angle: -Math.PI / 2, spread: 2, colors: ['#ffffff', '#ffd0b0'] });
          }
        } else {
          b.x += b.vx * dtw;
          b.y += b.vy * dtw;
          if (b.state === 'bounce') b.vy += 600 * dtw;
          else {
            b.vx *= Math.max(0, 1 - 1.5 * dtw);
            b.vy *= Math.max(0, 1 - 1.5 * dtw);
          }
          if (b.x < A) {
            b.x = 2 * A - b.x;
            b.vx = -b.vx;
          } else if (b.x > C) {
            b.x = 2 * C - b.x;
            b.vx = -b.vx;
          }
          b.a -= dtw * (b.state === 'roll' ? 0.8 : 0.4);
          if (b.a <= 0 || b.y > H + 30) balls.splice(i, 1);
        }
      }
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt);
      outFlash = Math.max(0, outFlash - dt * 0.5);
      lockFlash = Math.max(0, lockFlash - dt);
      fx.update(dt * Math.max(ts, 0.5));
      sparks.update(dt * Math.max(ts, 0.5));
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].age += dt * Math.max(ts, 0.4);
        if (rings[i].age > rings[i].max) rings.splice(i, 1);
      }
      for (const m of motes) {
        m.ph += dt * ts * 0.8;
        m.y -= dt * ts * 6 * m.s;
        m.x += Math.sin(m.ph) * dt * ts * 5;
        if (m.y < 105) m.y = H;
      }
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { balls, mover, volleys },

      update(dt, dir, t) {
        now = t + dt;
        mover.update(dt, dir);
        runPhase += (Math.abs(mover.vx) * dt) / 9;
        const p = progress(now, 60, 1.3);
        const f = Math.min(1, Math.abs(mover.vx) / MS);
        const sMin = lerp(0.3, 0.5, p);
        const target = sMin + (1 - sMin) * f;
        ts += (target - ts) * Math.min(1, dt * 10);
        const dtw = dt * ts;
        wt += dtw;
        updateCosmetic(dt);
        while (wt >= nextWT) {
          if (!tryLaunch(now)) break;
        }
        stepWorld(dtw, true, this);
      },

      afterlife(dt) {
        ts += (0.35 - ts) * Math.min(1, dt * 3);
        wt += dt * ts;
        updateCosmetic(dt);
        stepWorld(dt * ts, false, this);
      },

      render(g) {
        const sx = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
        const sy = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
        g.save();
        g.translate(sx, sy);
        g.fillStyle = '#0f1838';
        g.fillRect(-8, -8, W + 16, H + 16);
        g.drawImage(scene.canvas, 0, 0, W, H);

        // sun on the windows, and dust drifting in the light (it slows with time)
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, glowSun, 75, 17, { size: 110, alpha: 0.5 });
        drawSprite(g, glowSun, 285, 17, { size: 110, alpha: 0.5 });
        g.fillStyle = 'rgba(255,230,180,0.5)';
        for (const m of motes) g.fillRect(m.x, m.y, m.s, m.s);
        g.globalCompositeOperation = 'source-over';

        // the dodge counter on the wall
        g.fillStyle = '#05081a';
        g.strokeStyle = '#5a78d0';
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(W - 86, 34, 72, 26, 5);
        g.fill();
        g.stroke();
        g.font = `800 8px ${BODY_FONT}`;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillStyle = '#9fb4ff';
        g.fillText('DODGED', W - 80, 47);
        g.font = `800 15px ${BODY_FONT}`;
        g.textAlign = 'right';
        g.fillStyle = '#ffd23f';
        g.fillText(String(dodged).padStart(2, '0'), W - 20, 47.5);

        // aim lines for every wind-up: they follow you, then lock when the ball is thrown
        for (const v of volleys) {
          const k = clamp((wt - v.t0) / (v.t1 - v.t0), 0, 1);
          v.throwers.forEach((th, j) => {
            const x0 = th.wx + 9;
            const tx = v.targets[j];
            const U = unroll(x0, tx, v.spec.bank);
            const dx = U - x0;
            const dy = PY - HAND_Y;
            const a = 0.35 + 0.55 * k;
            g.lineCap = 'round';
            g.setLineDash([7, 7]);
            g.lineDashOffset = -clock * 40;
            for (const pass of [0, 1]) {
              g.strokeStyle = pass ? `rgba(255,50,35,${a.toFixed(3)})` : `rgba(255,255,255,${(a * 0.5).toFixed(3)})`;
              g.lineWidth = pass ? 2.6 : 5;
              g.beginPath();
              for (let s = 0; s <= 40; s++) {
                const u = s / 40;
                const x = fold(x0 + dx * u);
                const y = HAND_Y + dy * u;
                if (s === 0) g.moveTo(x, y);
                else g.lineTo(x, y);
              }
              g.stroke();
            }
            g.setLineDash([]);
            // the target on your line, closing in as the throw comes
            const pulse = 0.5 + 0.5 * Math.sin(clock * 16);
            g.strokeStyle = `rgba(255,40,30,${(0.5 + 0.4 * k * pulse + 0.1).toFixed(3)})`;
            g.lineWidth = 3;
            const rr = lerp(30, BR + 4, k);
            g.beginPath();
            g.arc(tx, PY, rr, 0, TAU);
            g.stroke();
            g.beginPath();
            g.moveTo(tx - rr - 4, PY);
            g.lineTo(tx - rr + 5, PY);
            g.moveTo(tx + rr + 4, PY);
            g.lineTo(tx + rr - 5, PY);
            g.stroke();
          });
        }

        // where each flying ball will cross your line
        for (const b of balls) {
          if (b.state !== 'fly' || b.passed) continue;
          const left = (PY - b.y) / b.vy;
          const k = clamp(1 - left / 1.4, 0, 1);
          g.fillStyle = `rgba(255,60,40,${(0.25 + 0.55 * k).toFixed(3)})`;
          g.beginPath();
          g.moveTo(b.cross - 7, PY + 26);
          g.lineTo(b.cross + 7, PY + 26);
          g.lineTo(b.cross, PY + 18);
          g.closePath();
          g.fill();
          g.fillRect(b.cross - 7, PY + 28, 14, 2);
        }

        // the far team
        throwers.forEach((th) => {
          const x = th.state === 'wind' ? th.wx : th.x;
          const bob = th.state === 'idle' ? Math.sin(wt * 6 + th.i) * 1.2 : 0;
          const y = 148 + bob;
          g.fillStyle = 'rgba(60,20,10,0.25)';
          g.beginPath();
          g.ellipse(x, y + 22, 13, 4, 0, 0, TAU);
          g.fill();
          // arms
          let hx;
          let hy;
          if (th.state === 'wind') {
            const v = th.vol;
            const k = clamp((wt - v.t0) / (v.t1 - v.t0), 0, 1);
            hx = x + 12 + 4 * k;
            hy = y - 12 - 14 * Math.sin(k * Math.PI * 0.5);
          } else if (th.state === 'throw') {
            const k = clamp(th.k / 0.3, 0, 1);
            hx = x + 9;
            hy = y + 8 + 6 * Math.sin(k * Math.PI);
          } else {
            hx = x + 7;
            hy = y + 4;
          }
          g.strokeStyle = '#7a1018';
          g.lineWidth = 5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(x - 11, y - 8);
          g.lineTo(x - 15, y + 4);
          g.moveTo(x + 11, y - 8);
          g.lineTo(hx, hy);
          g.stroke();
          drawSprite(g, kids[th.i], x, y);
          if (th.state === 'wind' || th.state === 'idle') {
            if (th.state === 'wind') {
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, glowRed, hx, hy, { size: 40, alpha: 0.6 });
              g.globalCompositeOperation = 'source-over';
            }
            drawSprite(g, ballSpr, hx, hy, { size: 20 });
          }
        });

        // balls: shadow, motion ghosts, body
        for (const b of balls) {
          const fly = b.state === 'fly';
          const lift = fly ? 10 : b.state === 'bounce' ? 14 : 2;
          g.globalAlpha = Math.max(0, b.a);
          g.fillStyle = 'rgba(60,25,10,0.28)';
          g.beginPath();
          g.ellipse(b.x + 2, b.y + 4, 10, 5, 0, 0, TAU);
          g.fill();
          if (fly) {
            const sp = Math.hypot(b.vx, b.vy) || 1;
            const ux = fold(b.u - b.vx * 0.04) - b.x;
            for (let j = 3; j >= 1; j--) {
              g.fillStyle = `rgba(255,90,60,${(0.12 * (4 - j)).toFixed(3)})`;
              g.beginPath();
              g.arc(b.x + ux * j * 0.8, b.y - lift - (b.vy / sp) * 16 * j * 0.8, BR * (1 - j * 0.12), 0, TAU);
              g.fill();
            }
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowRed, b.x, b.y - lift, { size: 44, alpha: 0.45 * b.a });
            g.globalCompositeOperation = 'source-over';
          }
          drawSprite(g, ballSpr, b.x, b.y - lift, { size: 24, rot: b.spin });
          g.globalAlpha = 1;
        }

        // you
        {
          const px = this.dead ? deathX : mover.x;
          const lean = this.dead ? 0 : mover.lean;
          const moving = Math.abs(mover.vx) > 30 && !this.dead;
          g.fillStyle = 'rgba(40,20,10,0.3)';
          g.beginPath();
          g.ellipse(px, PY + 20, 15, 5, 0, 0, TAU);
          g.fill();
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowTeal, px, PY, { size: 84, alpha: 0.32 + 0.2 * (1 - ts) });
          g.globalCompositeOperation = 'source-over';
          g.save();
          g.translate(px, PY);
          if (this.dead) {
            const k = Math.min(1, (1 - outFlash) * 3);
            g.rotate(knocked * -k * 1.2);
          } else g.rotate(lean * 0.18);
          // legs: a run cycle while moving, a ready crouch while still
          const sw = moving ? Math.sin(runPhase) * 4 : 0;
          g.fillStyle = '#e8b48a';
          g.fillRect(-7, 12 + sw * 0.4, 5, 8 - sw * 0.5);
          g.fillRect(2, 12 - sw * 0.4, 5, 8 + sw * 0.5);
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.roundRect(-8.5, 19 + sw * 0.6, 7.5, 5, 2);
          g.roundRect(1, 19 - sw * 0.6, 7.5, 5, 2);
          g.fill();
          g.fillStyle = '#2fd3c0';
          g.fillRect(-8.5, 22 + sw * 0.6, 7.5, 1.5);
          g.fillRect(1, 22 - sw * 0.6, 7.5, 1.5);
          // arms out for balance
          const arm = moving ? Math.cos(runPhase) * 3 : 0;
          g.strokeStyle = '#e8b48a';
          g.lineWidth = 4.5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(-11, -9);
          g.lineTo(-17, 1 + arm);
          g.moveTo(11, -9);
          g.lineTo(17, 1 - arm);
          g.stroke();
          g.drawImage(playerSpr.canvas, -20, -26, 40, 52);
          g.restore();
          if (this.dead) {
            // stars circling the dazed player
            for (let k = 0; k < 4; k++) {
              const a = clock * 4 + (k * TAU) / 4;
              g.fillStyle = '#ffd23f';
              g.font = `900 12px ${BODY_FONT}`;
              g.textAlign = 'center';
              g.fillText('★', px + Math.cos(a) * 18, PY - 30 + Math.sin(a) * 5);
            }
          }
        }

        // rings and sparks
        for (const r of rings) {
          const k = r.age / r.max;
          g.strokeStyle = `rgba(${r.col},${(1 - k).toFixed(3)})`;
          g.lineWidth = 3 * (1 - k) + 1;
          g.beginPath();
          g.arc(r.x, r.y, lerp(r.r0, r.r1, k), 0, TAU);
          g.stroke();
        }
        fx.render(g);
        sparks.render(g, true);

        // slow motion: the gym goes cold and blue while you stand still
        const cold = clamp((1 - ts) / 0.7, 0, 1);
        if (cold > 0.01) {
          g.fillStyle = `rgba(40,90,190,${(cold * 0.16).toFixed(3)})`;
          g.fillRect(0, 0, W, H);
          g.globalAlpha = cold * 0.8;
          g.drawImage(coldVignette.canvas, 0, 0, W, H);
          g.globalAlpha = 1;
        }
        if (lockFlash > 0) {
          g.fillStyle = `rgba(255,255,255,${(lockFlash * 0.12).toFixed(3)})`;
          g.fillRect(0, 0, W, H);
        }

        // OUT!
        if (outFlash > 0) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowWhite, deathX, PY, { size: 170, alpha: outFlash });
          g.globalCompositeOperation = 'source-over';
          const a = Math.min(1, outFlash * 2);
          g.font = `900 46px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineWidth = 6;
          g.strokeStyle = `rgba(120,0,10,${a.toFixed(3)})`;
          g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          const y = 400 - (1 - outFlash) * 30;
          g.strokeText('OUT!', W / 2, y);
          g.fillText('OUT!', W / 2, y);
        }
        g.restore();
        g.drawImage(vignette.canvas, 0, 0, W, H);

        // the stopwatch: its hand runs only as fast as time does
        {
          const cx = W - 34;
          const cy = H - 36;
          drawSprite(g, watchSpr, cx, cy - 3);
          g.fillStyle = `rgba(47,211,192,${(0.25 + 0.5 * ts).toFixed(3)})`;
          g.beginPath();
          g.moveTo(cx, cy);
          g.arc(cx, cy, 14, -Math.PI / 2, -Math.PI / 2 + ts * TAU);
          g.closePath();
          g.fill();
          const ang = wt * TAU * 0.5 - Math.PI / 2;
          g.strokeStyle = '#ff5a4a';
          g.lineWidth = 2;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(ang) * 13, cy + Math.sin(ang) * 13);
          g.stroke();
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.arc(cx, cy, 2, 0, TAU);
          g.fill();
          g.font = `800 11px ${BODY_FONT}`;
          g.textAlign = 'right';
          g.textBaseline = 'middle';
          g.fillStyle = ts < 0.7 ? '#9fd8ff' : '#ffffff';
          g.fillText(ts < 0.7 ? 'SLOW-MO' : 'FULL SPEED', cx - 26, cy);
        }
      },
    };
    return game;
  },
};
