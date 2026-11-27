"use client";

import { useEffect, useRef } from "react";

// Shared tuning values for the field and its water interactions.
const MOBILE_DOT_SCALE = 0.7;
const GRID_SPACING = { desktop: 16, mobile: 16 * (8.8 / 11.2) * MOBILE_DOT_SCALE } as const;
const BASE_DOT_RADIUS = 1.35;
const BASE_DOT_ALPHA = 0.32;
const BASE_DOT_COLOR = { light: [79, 83, 91], dark: [130, 140, 156] } as const;
const KOI_DOT_RADIUS_MIN = 1.9;
// Maximum fish radius as a fraction of grid pitch; peaks can gently touch.
const KOI_DOT_RADIUS_MAX = 0.53;
const KOI_DOT_SCALE = 1.35;
const KOI_PATTERN_ALPHA = 0.9;
const RIPPLE_DOT_SCALE = 4.8;
const RIPPLE_STRENGTH = 1.15;
const RIPPLE_RADIUS = 300;
const RIPPLE_FALLOFF = 3; // number of wavelengths behind the leading edge
const RIPPLE_LIFETIME = 2.1; // seconds
const RIPPLE_ALPHA_BOOST = 0.24;
const FLUID_VISUAL_CONFIG = {
  radiusMultiplier: 0.7,
  intensity: 0.9,
  peakCompression: 0.8,
  alphaBoost: 0.07,
  colorStrength: 0.95,
  light: { weak: [184, 185, 188], strong: [150, 152, 157] },
  dark: { weak: [112, 121, 135], strong: [134, 144, 160] },
} as const;
const HOVER_DOT_SCALE = 0.53; // peak radius relative to grid spacing
const HOVER_CORE_RADIUS = 130;
const HOVER_PRIMARY_RADIUS = 300;
const HOVER_RADIUS = 460;
const HOVER_STRENGTH = 1.0;
const HOVER_TRAIL_LIFETIME = 2.4;
const HOVER_TRAIL_INTERVAL = 0.16;
const HOVER_WARP_STRENGTH = 48;
const KOI_WAKE_STRENGTH = 0.42;
const TURN_BEND_CONFIG = {
  maxCurvature: 2.2, // total bend angle in radians, independent of body length
  bendDuration: 0.16,
  holdDuration: 0.15,
  releaseDuration: 0.325,
  headToTailDelay: 0.09,
  swimBlend: 0.45,
} as const;
const RIPPLE_DISPLACEMENT = 2.8; // px at the wave crest

// The grid stays ordered; water gives individual dots a small local displacement.
const DOT_FIELD_CONFIG = {
  spacing: GRID_SPACING,
  opacity: { base: BASE_DOT_ALPHA, active: KOI_PATTERN_ALPHA },
  animation: { transitionSpeed: 0.18 },
  interaction: { maxWaveOffset: 0.9 },
  koiWake: { radius: 65, strength: KOI_WAKE_STRENGTH, frequency: 0.075, speed: 2.5 },
  pointer: { strength: HOVER_STRENGTH, smoothing: 7, trailDuration: HOVER_TRAIL_LIFETIME },
};

const RED = [233, 78, 55] as const; // 朱色 body
const PALE = [176, 172, 168] as const; // warm-grey "white" (白) koi patches
const SUMI = [40, 38, 44] as const; // black (墨) markings — sanke / showa

// water ripple emitted on click
const RIPPLE_COL = [78, 88, 104] as const; // cool water grey

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const smooth = (t: number) => t * t * (3 - 2 * t);

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

type Koi = {
  x: number; // nose position
  y: number;
  dir: number; // heading (nose points this way)
  speed: number;
  len: number; // body length (nose..peduncle), px
  width: number; // max half-width, px
  phase: number;
  waves: number; // body wavelengths
  amp: number; // undulation amplitude, px
  swim: number; // temporal swim speed
  tailPhase: number; // accumulated tail-sweep phase (cycles)
  turn: { age: number; angle: number; applied: number } | null;
  dash: number; // flee burst, decays to 0
  wander: number;
  seed: number;
  depth: number; // 0.5 (deep/faint) .. 1 (near)
  // variety / markings
  whiteCov: number; // how much white (紅白 pattern) 0..1
  sumi: number; // black (墨) level — 0 kohaku/benigoi, up to ~0.6 showa
  redShade: number; // -1 deeper crimson .. +1 warmer orange
};


export default function KoiCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cv = canvas;
    const context = cv.getContext("2d", { alpha: true });
    if (!context) return;
    const cx = context;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduce = motionQuery.matches;

    let W = 0,
      H = 0,
      dpr = 1,
      cw = 10,
      ch = 15,
      cols = 0,
      rows = 0;
    let koi: Koi[] = [];
    let target = new Float32Array(0), targetR = new Float32Array(0),
      targetG = new Float32Array(0), targetB = new Float32Array(0),
      current = new Float32Array(0), currentR = new Float32Array(0),
      currentG = new Float32Array(0), currentB = new Float32Array(0),
      ripple = new Float32Array(0), rippleX = new Float32Array(0),
      rippleY = new Float32Array(0), water = new Float32Array(0),
      hover = new Float32Array(0);
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, active: false, strength: 0, speed: 0, dirX: 1, dirY: 0, lastTime: 0, trailClock: 0 };
    const trail = Array.from({ length: 6 }, () => ({ x: 0, y: 0, dirX: 1, dirY: 0, age: HOVER_TRAIL_LIFETIME, strength: 0 }));
    let trailIndex = 0;
    let baseCol: readonly [number, number, number] = BASE_DOT_COLOR.light;
    let ripples: { x: number; y: number; age: number }[] = [];
    let sizeScale = 1;

    // theme-aware palette (koi read on light paper OR dark water)
    let redBase: readonly [number, number, number] = RED;
    let paleCol: readonly [number, number, number] = PALE;
    let sumiCol: readonly [number, number, number] = SUMI;
    let rippleCol: readonly [number, number, number] = RIPPLE_COL;
    let fluidColors: { weak: readonly [number, number, number]; strong: readonly [number, number, number] } = FLUID_VISUAL_CONFIG.light;


    function readDark(): boolean {
      const t = document.documentElement.getAttribute("data-theme");
      if (t === "dark") return true;
      if (t === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    function applyTheme() {
      const dark = readDark();
      redBase = dark ? [242, 92, 66] : RED;
      paleCol = dark ? [223, 220, 215] : PALE;
      sumiCol = dark ? [10, 9, 14] : SUMI;
      rippleCol = dark ? [150, 160, 178] : RIPPLE_COL;
      baseCol = dark ? BASE_DOT_COLOR.dark : BASE_DOT_COLOR.light;
      fluidColors = dark ? FLUID_VISUAL_CONFIG.dark : FLUID_VISUAL_CONFIG.light;
    }
    applyTheme();

    function makeKoi(atX?: number): Koi {
      const depth = 0.55 + Math.random() * 0.45;
      const len = (220 + Math.random() * 180) * depth * sizeScale;
      const goRight = Math.random() < 0.5;
      const dir = (goRight ? 0 : Math.PI) + (Math.random() - 0.5) * 0.35;
      // variety — vermilion stays dominant, but each koi reads differently
      const roll = Math.random();
      let whiteCov: number;
      let sumi: number;
      let redShade: number;
      if (roll < 0.34) {
        // 緋鯉 / benigoi — almost solid vermilion
        whiteCov = 0.08;
        sumi = 0;
        redShade = 0.1 + Math.random() * 0.6; // warmer
      } else if (roll < 0.72) {
        // 紅白 / kohaku — red on white
        whiteCov = 0.4 + Math.random() * 0.15;
        sumi = 0;
        redShade = (Math.random() - 0.5) * 0.5;
      } else if (roll < 0.9) {
        // 大正三色 / sanke — red + white + a little black
        whiteCov = 0.38;
        sumi = 0.22 + Math.random() * 0.12;
        redShade = (Math.random() - 0.5) * 0.4;
      } else {
        // 昭和三色 / showa — bolder black
        whiteCov = 0.32;
        sumi = 0.5 + Math.random() * 0.2;
        redShade = -0.1 - Math.random() * 0.3; // deeper crimson
      }
      return {
        x: atX ?? Math.random() * W,
        y: 0.14 * H + Math.random() * 0.72 * H,
        dir,
        // travel speed varied largely independently of size for individuality
        speed: (30 + Math.random() * 70) * (0.75 + 0.25 * depth),
        len,
        // slimmer, more elegant koi (less catfish)
        width: len * (0.122 + Math.random() * 0.028),
        phase: Math.random() * TAU,
        waves: 0.75 + Math.random() * 0.4,
        amp: len * (0.11 + Math.random() * 0.05),
        // calmer tail sweep, with noticeable per-koi variation
        swim: (0.7 + Math.random() * 0.95) * 0.5,
        tailPhase: Math.random() * 10,
        turn: null,
        dash: 0,
        wander: Math.random() * TAU,
        seed: Math.random() * 12,
        depth,
        whiteCov,
        sumi,
        redShade,
      };
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.floor(W * dpr);
      cv.height = Math.floor(H * dpr);
      cv.style.width = W + "px";
      cv.style.height = H + "px";
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cw = W < 768 ? DOT_FIELD_CONFIG.spacing.mobile : DOT_FIELD_CONFIG.spacing.desktop;
      ch = cw;
      cols = Math.ceil(W / cw);
      rows = Math.ceil(H / ch);
      const count = cols * rows;
      target = new Float32Array(count); targetR = new Float32Array(count);
      targetG = new Float32Array(count); targetB = new Float32Array(count);
      current = new Float32Array(count); currentR = new Float32Array(count);
      currentG = new Float32Array(count); currentB = new Float32Array(count);
      ripple = new Float32Array(count); rippleX = new Float32Array(count);
      rippleY = new Float32Array(count); water = new Float32Array(count);
      hover = new Float32Array(count);

      sizeScale = clamp(W / 1200, 0.58, 1);
      const targetCount = clamp(Math.round((W * H) / 230000), 3, 6);
      if (koi.length === 0) koi = Array.from({ length: targetCount }, () => makeKoi());
      else if (koi.length < targetCount) while (koi.length < targetCount) koi.push(makeKoi());
      else koi.length = targetCount;
    }

    // top-down koi half-width profile along the body (nx 0=nose .. 1=peduncle)
    // Slim, spindle-shaped koi: narrowish rounded head, broad shoulders,
    // then a long graceful taper to a sturdy peduncle.
    function halfWidth(nx: number): number {
      if (nx < 0.2) {
        // rounded, not-too-wide head
        const u = nx / 0.2;
        return 0.34 + 0.66 * smooth(Math.sqrt(u));
      }
      if (nx < 0.44) {
        // shoulders hold near full width
        const u = (nx - 0.2) / 0.24;
        return 1 - 0.12 * smooth(u);
      }
      // long, elegant taper to a slim-but-sturdy peduncle
      const u = (nx - 0.44) / 0.56;
      return 0.88 - 0.6 * smooth(u);
    }

    // per-koi marking field: a few soft blobs placed by the koi's seed so no
    // two fish share the same pattern. `n` blobs, `cov` scales their presence.
    function blobs(
      nx: number,
      fr: number,
      seed: number,
      n: number,
      cov: number,
      spreadFr: number,
    ): number {
      let m = 0;
      for (let i = 0; i < n; i++) {
        const cxp = 0.2 + 0.58 * hash(seed * 1.7 + i * 2.3 + 0.5);
        const cwN = 0.07 + 0.08 * hash(seed + i * 4.1 + 1.3);
        const cfr = (hash(seed * 2.1 + i * 3.7) - 0.5) * 1.4;
        m = Math.max(
          m,
          Math.exp(-(((nx - cxp) / cwN) ** 2 + ((fr - cfr) / spreadFr) ** 2)),
        );
      }
      return clamp(m * (0.45 + cov * 1.2), 0, 1);
    }

    function stamp(
      px: number,
      py: number,
      d: number,
      col: readonly [number, number, number],
    ) {
      if (d <= 0.04) return;
      const c = Math.floor(px / cw);
      const r = Math.floor(py / ch);
      if (c < 0 || c >= cols || r < 0 || r >= rows) return;
      const i = r * cols + c;
      if (target[i] >= d) return;
      target[i] = d;
      targetR[i] = col[0]; targetG[i] = col[1]; targetB[i] = col[2];
    }

    function drawKoi(k: Koi, time: number) {
      const L = k.len;
      const stepA = Math.max(1.2, cw * 0.42);
      const stepL = Math.max(1.2, cw * 0.42);
      const edgeAlpha = 0.6 + 0.4 * k.depth;

      const baseR = clamp(redBase[0] + k.redShade * 6, 205, 252);
      const baseG = clamp(redBase[1] + k.redShade * 34, 52, 140);
      const baseB = clamp(redBase[2] + k.redShade * 10, 40, 92);
      const baseCol: readonly [number, number, number] = [baseR, baseG, baseB];

      // Integrate fixed-length segments along the spine, including the tail.
      // The turn envelope reaches each segment later, then releases head first.
      const segments = 100;
      const segmentLength = L * 1.24 / segments;
      const spine: { x: number; y: number; angle: number }[] = [];
      let sx = k.x, sy = k.y, turnAngle = 0;
      for (let i = 0; i <= segments; i++) {
        const nx = i * 1.24 / segments;
        const turn = k.turn;
        let bendAmount = 0;
        if (turn) {
          const localTime = turn.age - nx * TURN_BEND_CONFIG.headToTailDelay;
          const rise = smooth(clamp(localTime / TURN_BEND_CONFIG.bendDuration, 0, 1));
          const releaseStart = TURN_BEND_CONFIG.bendDuration + TURN_BEND_CONFIG.holdDuration;
          const release = 1 - smooth(clamp((localTime - releaseStart) / TURN_BEND_CONFIG.releaseDuration, 0, 1));
          bendAmount = rise * release;
          if (i > 0 && nx <= 1) {
            const angleFactor = clamp(Math.abs(turn.angle) / Math.PI, 0.5, 1);
            turnAngle += Math.sign(turn.angle) * TURN_BEND_CONFIG.maxCurvature * angleFactor * bendAmount * segmentLength / L;
          }
        }
        const phase = TAU * (nx * k.waves - k.tailPhase + k.phase) + k.phase;
        const slope = k.amp / L * (0.92 * Math.sin(phase) +
          (0.08 + 0.92 * nx) * TAU * k.waves * Math.cos(phase));
        const swimScale = 1 - bendAmount * (1 - TURN_BEND_CONFIG.swimBlend);
        const angle = k.dir - turnAngle - Math.atan(slope * swimScale);
        spine.push({ x: sx, y: sy, angle });
        sx -= Math.cos(angle) * segmentLength;
        sy -= Math.sin(angle) * segmentLength;
      }
      const spineAt = (fraction: number) => {
        const position = clamp(fraction / 1.24 * segments, 0, segments);
        const index = Math.min(Math.floor(position), segments - 1);
        const t = position - index;
        const a = spine[index], b = spine[index + 1];
        const angle = a.angle + (b.angle - a.angle) * t;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
          dx: Math.cos(angle), dy: Math.sin(angle), px: -Math.sin(angle), py: Math.cos(angle) };
      };

      // ---- body ----
      for (let a = 0; a <= L; a += stepA) {
        const nx = a / L;
        // round the snout so the head isn't a flat wall
        const cap = Math.min(1, Math.sqrt(nx / 0.05));
        const hw = k.width * halfWidth(nx) * cap;
        if (hw < 0.4) continue;
        const point = spineAt(nx);
        const { x: sx, y: sy, px, py } = point;
        for (let l = -hw; l <= hw; l += stepL) {
          const fr = l / hw; // -1..1 across the body
          const wx = sx + px * l;
          const wy = sy + py * l;
          // solid body: dense spine, still-substantial edge; soft outer antialias
          const afr = Math.abs(fr);
          const edge = 1 - smooth(clamp((afr - 0.82) / 0.18, 0, 1)); // 1 inside -> 0 rim
          let d = (1 - 0.5 * afr * afr) * (0.82 + 0.18 * (1 - nx)) * edge;
          d *= 0.92 + 0.08 * hash(a * 3.1 + l * 1.7 + k.seed);
          d = clamp(d, 0, 1) * edgeAlpha;
          // markings: white (白) lightens, sumi (墨) darkens — sharpened edges
          const w = smooth(clamp((blobs(nx, fr, k.seed, 3, k.whiteCov, 0.95) - 0.38) / 0.28, 0, 1));
          const s =
            k.sumi > 0
              ? smooth(clamp((blobs(nx, fr, k.seed * 2.7 + 4, 2, k.sumi, 0.7) - 0.42) / 0.26, 0, 1))
              : 0;
          let r = baseR + (paleCol[0] - baseR) * w;
          let g = baseG + (paleCol[1] - baseG) * w;
          let bl = baseB + (paleCol[2] - baseB) * w;
          r += (sumiCol[0] - r) * s;
          g += (sumiCol[1] - g) * s;
          bl += (sumiCol[2] - bl) * s;
          stamp(wx, wy, d * (1 - 0.26 * w + 0.12 * s), [
            Math.round(r),
            Math.round(g),
            Math.round(bl),
          ]);
        }
      }

      // ---- caudal fin: short, full koi (carp) paddle, barely notched ----
      // (not the long, flowing, deeply-forked veil of a goldfish)
      const tailLen = L * 0.24;
      for (let a = 0; a <= tailLen; a += stepA) {
        const u = a / tailLen; // 0 at peduncle -> 1 at tail tip
        const nx = 1 + u * 0.24;
        const { x: sx, y: sy, px, py } = spineAt(nx);
        // fan grows smoothly out of the peduncle width
        const spread = k.width * (0.27 + 0.78 * smooth(u));
        for (let l = -spread; l <= spread; l += stepL) {
          const fr = l / spread;
          const afr = Math.abs(fr);
          // rounded fan with a shallow central fork (koi, not goldfish veil)
          const corner = 1 - 0.42 * smooth(clamp((afr - 0.6) / 0.4, 0, 1));
          const notch = 1 - 0.2 * Math.exp(-((fr / 0.16) ** 2));
          const edgeU = corner * notch;
          if (u > edgeU) continue;
          // solid, fullest through the middle
          let d = (1 - u * 0.24) * (0.7 - 0.08 * afr);
          d = clamp(d, 0, 1) * edgeAlpha * 0.95;
          stamp(sx + px * l, sy + py * l, d, baseCol);
        }
      }

      // ---- pectoral fins: a pair just behind the head, flapping ----
      const finNx = 0.32;
      const flap = 0.55 + 0.45 * Math.sin(time * k.swim * 1.1 + k.phase);
      const { x: fsx, y: fsy, dx, dy, px, py } = spineAt(finNx);
      const hwFin = k.width * halfWidth(finNx);
      for (const side of [1, -1]) {
        const fLen = k.width * (0.9 + 0.9 * flap);
        for (let t = 0; t <= 1.0001; t += 0.12) {
          const lat = side * (hwFin * 0.7 + t * fLen);
          const back = t * k.len * 0.1;
          const wx = fsx - dx * back + px * lat;
          const wy = fsy - dy * back + py * lat;
          stamp(wx, wy, (1 - t) * 0.5 * edgeAlpha, baseCol);
        }
      }


    }

    // Waves are sampled only in a bounded area around each moving fish.
    function addKoiWake(k: Koi, time: number) {
      const cfg = DOT_FIELD_CONFIG.koiWake;
      const dx = Math.cos(k.dir), dy = Math.sin(k.dir);
      const back = k.len * 1.6 + cfg.radius;
      const side = k.width + k.amp + cfg.radius + back * 0.2;
      const endX = k.x - dx * back, endY = k.y - dy * back;
      const padX = Math.abs(dy) * side + Math.abs(dx) * cfg.radius;
      const padY = Math.abs(dx) * side + Math.abs(dy) * cfg.radius;
      const c0 = Math.max(0, Math.floor((Math.min(k.x, endX) - padX) / cw));
      const c1 = Math.min(cols - 1, Math.ceil((Math.max(k.x, endX) + padX) / cw));
      const r0 = Math.max(0, Math.floor((Math.min(k.y, endY) - padY) / ch));
      const r1 = Math.min(rows - 1, Math.ceil((Math.max(k.y, endY) + padY) / ch));
      const tailBend = k.amp * Math.sin(TAU * (k.waves - k.tailPhase + k.phase) + k.phase);
      const velocity = clamp(k.speed * (1 + k.dash * 0.2) / 80, 0.4, 1.15);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const rx = (c + 0.5) * cw - k.x, ry = (r + 0.5) * ch - k.y;
        const along = -(rx * dx + ry * dy);
        if (along < -cfg.radius || along > k.len * 1.6 + cfg.radius) continue;
        const lateral = rx * -dy + ry * dx;
        const bodyFraction = clamp(along / k.len, 0, 1);
        const spine = k.amp * (0.08 + 0.92 * bodyFraction) *
          Math.sin(TAU * (bodyFraction * k.waves - k.tailPhase + k.phase) + k.phase);
        const sideDistance = Math.abs(lateral - spine);
        let wave = 0;
        if (along >= 0 && along <= k.len) {
          const edge = k.width * halfWidth(bodyFraction);
          const distance = Math.max(0, sideDistance - edge);
          if (distance < cfg.radius) {
            const falloff = (1 - distance / cfg.radius) ** 2;
            wave += Math.sin(distance * cfg.frequency - time * cfg.speed + along / k.len * 2) * falloff * 0.65;
          }
        }
        // A small bow pressure wave, elongated across the direction of travel.
        const headDistance = Math.hypot(Math.max(0, -along) * 1.3, lateral * 0.8);
        if (along < 0 && headDistance < cfg.radius) {
          wave += Math.sin(headDistance * cfg.frequency - time * cfg.speed) * (1 - headDistance / cfg.radius) ** 2 * 0.5;
        }
        // Tail movement bends a widening, downstream wake.
        const behind = along - k.len;
        if (behind > 0 && behind < k.len * 0.6 + cfg.radius) {
          const extent = k.len * 0.6 + cfg.radius;
          const centre = tailBend * 0.6 * (1 - behind / extent);
          const spread = k.width + behind * 0.32 + 18;
          const across = Math.abs(lateral - centre);
          if (across < spread) {
            const fade = (1 - behind / extent) ** 2 * (1 - across / spread) ** 2;
            wave += Math.sin(behind * cfg.frequency - time * cfg.speed + lateral * 0.035 + k.tailPhase * TAU) * fade;
          }
        }
        water[r * cols + c] += wave * cfg.strength * velocity;
      }
    }

    // Smooth, continuously changing coordinate warp; the actual dot grid stays fixed.
    function addPointerWave(x: number, y: number, strength: number, time: number, dirX: number, dirY: number) {
      if (strength <= 0.001) return;
      const scale = clamp(Math.min(W, H) / 800, 0.6, 1);
      const radius = HOVER_RADIUS * scale;
      const core = HOVER_CORE_RADIUS * scale;
      const primary = HOVER_PRIMARY_RADIUS * scale;
      const c0 = Math.max(0, Math.floor((x - radius) / cw));
      const c1 = Math.min(cols - 1, Math.ceil((x + radius) / cw));
      const r0 = Math.max(0, Math.floor((y - radius) / ch));
      const r1 = Math.min(rows - 1, Math.ceil((y + radius) / ch));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const dx = (c + 0.5) * cw - x, dy = (r + 0.5) * ch - y;
        const distance = Math.hypot(dx, dy);
        if (distance >= radius) continue;
        const fade = 1 - smooth(clamp((distance - core) / (radius - core), 0, 1));
        const inner = 1 - smooth(clamp(distance / primary, 0, 1));
        const warpX = Math.sin(dx * 0.009 + dy * 0.006 + time * 0.45) * HOVER_WARP_STRENGTH * scale;
        const warpY = Math.sin(dy * 0.011 - dx * 0.005 - time * 0.35 + 1.8) * HOVER_WARP_STRENGTH * scale;
        const wx = dx + warpX, wy = dy + warpY;
        const warpedDistance = Math.hypot(wx, wy);
        const along = wx * dirX + wy * dirY;
        const across = -wx * dirY + wy * dirX;
        const main = Math.sin(warpedDistance * 0.019 - time * 1.65 + across * 0.004);
        const detail = Math.sin(wx * 0.021 + wy * 0.013 + time * 1.1) * 0.42;
        const flow = Math.sin(along * 0.018 - across * 0.009 - time * 1.3) * 0.38;
        hover[r * cols + c] += (main * 0.65 + detail + flow) * fade * (0.65 + inner * 0.35) * strength;
      }
    }

    function render(time: number, immediate = false, dt = 1 / 60) {
      target.fill(0);
      ripple.fill(0);
      rippleX.fill(0);
      rippleY.fill(0);
      water.fill(0);
      hover.fill(0);
      for (const k of koi) {
        drawKoi(k, time);
        if (!reduce) addKoiWake(k, time);
      }
      if (!reduce) {
        const cfg = DOT_FIELD_CONFIG.pointer;
        addPointerWave(pointer.x, pointer.y, pointer.strength * cfg.strength * 0.48, time, pointer.dirX, pointer.dirY);
        for (const mark of trail) {
          if (mark.age < cfg.trailDuration) {
            const fade = 1 - mark.age / cfg.trailDuration;
            const drift = mark.age * 22;
            addPointerWave(mark.x + mark.dirX * drift, mark.y + mark.dirY * drift,
              mark.strength * cfg.strength * fade * fade * 0.38, time, mark.dirX, mark.dirY);
          }
        }
      }
      // Restrict ripple calculations to the expanding wave's bounding box.
      for (const rp of ripples) {
        const p = rp.age / RIPPLE_LIFETIME;
        const radius = RIPPLE_RADIUS * (1 - (1 - p) ** 2);
        const wavelength = Math.max(20, cw * 2.4);
        const c0 = Math.max(0, Math.floor((rp.x - radius) / cw));
        const c1 = Math.min(cols - 1, Math.ceil((rp.x + radius) / cw));
        const r0 = Math.max(0, Math.floor((rp.y - radius) / ch));
        const r1 = Math.min(rows - 1, Math.ceil((rp.y + radius) / ch));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const dx = (c + 0.5) * cw - rp.x;
          const dy = (r + 0.5) * ch - rp.y;
          const distance = Math.hypot(dx, dy);
          const back = radius - distance;
          if (back < 0 || back > wavelength * RIPPLE_FALLOFF) continue;
          const envelope = (1 - back / (wavelength * RIPPLE_FALLOFF)) * (1 - p) ** 0.7;
          const oscillation = Math.cos(back / wavelength * TAU);
          const wave = Math.max(0, oscillation) * envelope;
          const i = r * cols + c;
          ripple[i] = Math.max(ripple[i], wave);
          if (distance > 0) {
            const offset = oscillation * envelope * RIPPLE_DISPLACEMENT / distance;
            rippleX[i] += dx * offset;
            rippleY[i] += dy * offset;
          }
        }
      }
      cx.clearRect(0, 0, W, H);
      const blend = immediate ? 1 : 1 - Math.pow(1 - DOT_FIELD_CONFIG.animation.transitionSpeed, dt * 60);
      const dotScale = W < 768 ? MOBILE_DOT_SCALE : 1;
      const designPitch = cw / dotScale;
      const maxRadius = designPitch * KOI_DOT_RADIUS_MAX;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = (c + 0.5) * cw, y = (r + 0.5) * ch;
        const goal = target[i];
        if (current[i] < 0.001 && target[i] > 0) {
          currentR[i] = targetR[i]; currentG[i] = targetG[i]; currentB[i] = targetB[i];
        }
        current[i] += (goal - current[i]) * blend;
        const d = current[i];
        // Keep the last fish colour as its influence fades, avoiding a colour flash.
        if (target[i] > 0) {
          currentR[i] += (targetR[i] - currentR[i]) * blend;
          currentG[i] += (targetG[i] - currentG[i]) * blend;
          currentB[i] += (targetB[i] - currentB[i]) * blend;
        }
        const wakeWave = clamp(water[i], -DOT_FIELD_CONFIG.interaction.maxWaveOffset, DOT_FIELD_CONFIG.interaction.maxWaveOffset);
        // Compress overlapping wave sources smoothly rather than clipping broad peaks.
        const fluidInput = hover[i] * FLUID_VISUAL_CONFIG.intensity;
        const hoverWave = fluidInput / (1 + Math.abs(fluidInput) * FLUID_VISUAL_CONFIG.peakCompression);
        // Keep fish markings clear while the surrounding water responds independently.
        const waterVisibility = (1 - clamp(d * 2, 0, 1));
        const highlight = ripple[i] * waterVisibility;
        const fishAmount = clamp(d * KOI_DOT_SCALE, 0, 1);
        const fishRadius = d > 0.01
          ? (KOI_DOT_RADIUS_MIN - BASE_DOT_RADIUS) * Math.min(1, d * 4) +
            (maxRadius - KOI_DOT_RADIUS_MIN) * fishAmount
          : 0;
        const hoverRadius = hoverWave >= 0
          ? hoverWave * designPitch * HOVER_DOT_SCALE * FLUID_VISUAL_CONFIG.radiusMultiplier
          : hoverWave * BASE_DOT_RADIUS * 0.85;
        const wave = (wakeWave + hoverRadius) * waterVisibility;
        const radius = clamp(BASE_DOT_RADIUS + fishRadius + wave +
          highlight * RIPPLE_STRENGTH * RIPPLE_DOT_SCALE, W < 768 ? 0.2 : 0.35, maxRadius);
        const mix = clamp(d * 2.5, 0, 1);
        const waterMix = clamp(highlight * 0.55, 0, 1);
        const fluidMagnitude = clamp(Math.abs(hoverWave), 0, 1);
        const fluidMix = smooth(clamp(fluidMagnitude * 3, 0, 1)) * waterVisibility * FLUID_VISUAL_CONFIG.colorStrength;
        const fluidPeak = smooth(fluidMagnitude);
        const fluidR = fluidColors.weak[0] + (fluidColors.strong[0] - fluidColors.weak[0]) * fluidPeak;
        const fluidG = fluidColors.weak[1] + (fluidColors.strong[1] - fluidColors.weak[1]) * fluidPeak;
        const fluidB = fluidColors.weak[2] + (fluidColors.strong[2] - fluidColors.weak[2]) * fluidPeak;
        const baseR = baseCol[0] + (rippleCol[0] - baseCol[0]) * waterMix + (currentR[i] - baseCol[0]) * mix;
        const baseG = baseCol[1] + (rippleCol[1] - baseCol[1]) * waterMix + (currentG[i] - baseCol[1]) * mix;
        const baseB = baseCol[2] + (rippleCol[2] - baseCol[2]) * waterMix + (currentB[i] - baseCol[2]) * mix;
        const red = Math.round(baseR + (fluidR - baseR) * fluidMix);
        const green = Math.round(baseG + (fluidG - baseG) * fluidMix);
        const blue = Math.round(baseB + (fluidB - baseB) * fluidMix);
        const alpha = clamp(DOT_FIELD_CONFIG.opacity.base + d * (DOT_FIELD_CONFIG.opacity.active - DOT_FIELD_CONFIG.opacity.base) +
          wakeWave * waterVisibility * 0.18 + hoverWave * waterVisibility * FLUID_VISUAL_CONFIG.alphaBoost + highlight * RIPPLE_ALPHA_BOOST, 0, 1);
        cx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
        cx.beginPath();
        cx.arc(
          x + clamp(rippleX[i], -RIPPLE_DISPLACEMENT, RIPPLE_DISPLACEMENT) * waterVisibility,
          y + clamp(rippleY[i], -RIPPLE_DISPLACEMENT, RIPPLE_DISPLACEMENT) * waterVisibility,
          radius * dotScale, 0, TAU,
        );
        cx.fill();
      }
    }

    function update(dt: number, time: number) {
      for (const k of koi) {
        // tail sweeps a touch faster during a startled dash
        k.tailPhase += k.swim * (1 + k.dash * 0.6) * dt;
        k.dash = Math.max(0, k.dash - dt * 1.7);
        const spd = k.speed * (1 + k.dash);
        if (k.turn) {
          const turn = k.turn;
          turn.age += dt;
          const start = TURN_BEND_CONFIG.bendDuration * 0.39;
          const duration = TURN_BEND_CONFIG.holdDuration + TURN_BEND_CONFIG.releaseDuration * 0.65;
          const progress = smooth(clamp((turn.age - start) / duration, 0, 1));
          const next = turn.angle * progress;
          k.dir += next - turn.applied;
          turn.applied = next;
          if (turn.age >= TURN_BEND_CONFIG.bendDuration + TURN_BEND_CONFIG.holdDuration +
            TURN_BEND_CONFIG.releaseDuration + TURN_BEND_CONFIG.headToTailDelay * 1.24) k.turn = null;
        } else {
          k.dir += Math.sin(time * 0.3 + k.wander) * 0.14 * (1 - 0.8 * Math.min(1, k.dash)) * dt;
        }
        k.x += Math.cos(k.dir) * spd * dt;
        k.y += Math.sin(k.dir) * spd * dt;
        const m = 0.1 * H;
        if (!k.turn && k.y < m) k.dir += 0.5 * dt;
        if (!k.turn && k.y > H - m) k.dir -= 0.5 * dt;
        const reach = k.len * 1.6;
        if (Math.cos(k.dir) > 0 && k.x - reach > W)
          Object.assign(k, makeKoi(-reach * 0.4));
        else if (Math.cos(k.dir) < 0 && k.x + reach < 0)
          Object.assign(k, makeKoi(W + reach * 0.4));
      }
      const cfg = DOT_FIELD_CONFIG.pointer;
      const follow = 1 - Math.exp(-cfg.smoothing * dt);
      pointer.x += (pointer.targetX - pointer.x) * follow;
      pointer.y += (pointer.targetY - pointer.y) * follow;
      pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * follow;
      pointer.speed *= Math.exp(-4 * dt);
      pointer.trailClock += dt;
      for (const mark of trail) mark.age += dt;
      if (pointer.active && pointer.speed > 0.04 && pointer.trailClock >= HOVER_TRAIL_INTERVAL) {
        const mark = trail[trailIndex];
        mark.x = pointer.x; mark.y = pointer.y; mark.age = 0;
        mark.strength = clamp(pointer.speed, 0, 1);
        mark.dirX = pointer.dirX; mark.dirY = pointer.dirY;
        trailIndex = (trailIndex + 1) % trail.length;
        pointer.trailClock = 0;
      }
      if (ripples.length) {
        for (const rp of ripples) rp.age += dt;
        ripples = ripples.filter((rp) => rp.age < RIPPLE_LIFETIME);
      }
    }

    let raf = 0,
      last = 0,
      t0 = 0;
    function frame(now: number) {
      raf = 0;
      if (!t0) (t0 = now), (last = now);
      const time = (now - t0) / 1000;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      update(dt, time);
      render(time, false, dt);
      raf = requestAnimationFrame(frame);
    }

    // click/tap a koi -> it turns 90–180° and darts away
    function onPoint(e: PointerEvent) {
      if (reduce) return;
      const bx = e.clientX;
      const by = e.clientY;
      // water ripple at every click
      ripples.push({ x: bx, y: by, age: 0 });
      if (ripples.length > 6) ripples.shift();
      let best = -1;
      let bestLat = Infinity;
      for (let i = 0; i < koi.length; i++) {
        const k = koi[i];
        const hx = Math.cos(k.dir);
        const hy = Math.sin(k.dir);
        const rx = bx - k.x;
        const ry = by - k.y;
        const along = -(rx * hx + ry * hy); // 0 = nose, len = peduncle
        if (along < -0.3 * k.len || along > k.len * 1.45) continue;
        const nx = clamp(along / k.len, 0, 1);
        const hw = k.width * halfWidth(nx) + 24; // generous tap target
        const lat = Math.abs(rx * -hy + ry * hx);
        if (lat <= hw && lat < bestLat) {
          bestLat = lat;
          best = i;
        }
      }
      if (best < 0) return;
      const k = koi[best];
      const sign = Math.random() < 0.5 ? 1 : -1;
      k.turn = { age: 0, angle: sign * (Math.PI / 2 + Math.random() * Math.PI / 2), applied: 0 };
      k.dash = 2.4 + Math.random() * 1.1; // startled burst
      k.wander = Math.random() * TAU;
    }

    function onPointerMove(e: PointerEvent) {
      if (reduce || e.pointerType !== "mouse") return;
      if (!pointer.active) {
        pointer.x = e.clientX; pointer.y = e.clientY;
        pointer.speed = 0;
      } else {
        const elapsed = Math.max(8, e.timeStamp - pointer.lastTime);
        const dx = e.clientX - pointer.targetX, dy = e.clientY - pointer.targetY;
        const distance = Math.hypot(dx, dy);
        pointer.speed = clamp(distance / elapsed / 1.2, 0, 1);
        if (distance > 0.5) { pointer.dirX = dx / distance; pointer.dirY = dy / distance; }
      }
      pointer.targetX = e.clientX; pointer.targetY = e.clientY;
      pointer.lastTime = e.timeStamp; pointer.active = true;
    }
    function onPointerLeave(e: PointerEvent) {
      if (!e.relatedTarget) pointer.active = false;
    }

    resize();
    let visible = true;
    function start() {
      if (!reduce && visible && !document.hidden && !raf) {
        last = 0; t0 = 0;
        raf = requestAnimationFrame(frame);
      }
    }
    if (reduce) render(0.9, true);
    else start();

    const onResize = () => { resize(); if (reduce) render(0.9, true); };
    const onTheme = () => {
      applyTheme();
      if (reduce) render(0.9, true); // repaint the still frame on theme change
    };
    const onVisibility = () => {
      if (document.hidden || !visible) { cancelAnimationFrame(raf); raf = 0; }
      else start();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; onVisibility();
    });
    observer.observe(cv);
    const onMotion = () => {
      reduce = motionQuery.matches;
      if (reduce) {
        pointer.active = false; pointer.strength = 0;
        for (const mark of trail) mark.age = DOT_FIELD_CONFIG.pointer.trailDuration;
        ripples.length = 0;
      }
      cancelAnimationFrame(raf); raf = 0;
      if (reduce) render(0.9, true); else start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    motionQuery.addEventListener("change", onMotion);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("resize", onResize);
    window.addEventListener("pointerdown", onPoint);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerout", onPointerLeave);
    window.addEventListener("themechange", onTheme);
    mq.addEventListener("change", onTheme);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotion);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", onPoint);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerout", onPointerLeave);
      window.removeEventListener("themechange", onTheme);
      mq.removeEventListener("change", onTheme);
    };
  }, []);

  return <canvas ref={ref} className="koi-layer" aria-hidden="true" />;
}
