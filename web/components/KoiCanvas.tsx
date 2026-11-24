"use client";

import { useEffect, useRef } from "react";

/**
 * KoiCanvas — nishikigoi (錦鯉) rendered as dense ASCII/mosaic tiles that
 * actually swim, in the spirit of stackedlol/ascii-sharks.
 *
 * Each koi is a top-down fish silhouette (rounded blunt head → widest third →
 * slim peduncle → flowing caudal fin) rasterised into a character grid every
 * frame. A travelling sine wave bends the spine so the body undulates and the
 * tail sweeps; pectoral fins flap. Cells are drawn as soft colour tiles with a
 * density glyph on top (sparse → dense ramp), tinted vermilion with pale
 * patches for a 紅白 (kōhaku) pattern. The whole silhouette always stays solid
 * so it reads unmistakably as a fish.
 */

const RAMP = " .:-=+*oxsX%8#@"; // sparse (edge) -> dense (spine)
const RED = [233, 78, 55] as const; // 朱色 body
const PALE = [168, 164, 160] as const; // warm-grey "white" koi patches
const INK = [18, 18, 20] as const; // eyes

// water ripple emitted on click
const RIPPLE_RAMP = " .:~=o";
const RIPPLE_COL = [78, 88, 104] as const; // cool water grey
const RIPPLE_LIFE = 1.3; // seconds
const RIPPLE_MAXR = 180; // px the front travels

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
  dash: number; // flee burst, decays to 0
  wander: number;
  seed: number;
  depth: number; // 0.5 (deep/faint) .. 1 (near)
};

type Cell = { d: number; r: number; g: number; b: number };

export default function KoiCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cv = canvas;
    const context = cv.getContext("2d", { alpha: true });
    if (!context) return;
    const cx = context;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let W = 0,
      H = 0,
      dpr = 1,
      cw = 10,
      ch = 15,
      cols = 0,
      rows = 0;
    let koi: Koi[] = [];
    let cells: (Cell | null)[] = [];
    let ripples: { x: number; y: number; age: number }[] = [];
    let sizeScale = 1;

    const mono =
      'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace';

    function makeKoi(atX?: number): Koi {
      const depth = 0.55 + Math.random() * 0.45;
      const len = (210 + Math.random() * 170) * depth * sizeScale;
      const goRight = Math.random() < 0.5;
      const dir = (goRight ? 0 : Math.PI) + (Math.random() - 0.5) * 0.35;
      return {
        x: atX ?? Math.random() * W,
        y: 0.14 * H + Math.random() * 0.72 * H,
        dir,
        // travel speed varied largely independently of size for individuality
        speed: (30 + Math.random() * 70) * (0.75 + 0.25 * depth),
        len,
        width: len * (0.17 + Math.random() * 0.03),
        phase: Math.random() * TAU,
        waves: 0.75 + Math.random() * 0.4,
        amp: len * (0.11 + Math.random() * 0.05),
        // calmer tail sweep, with noticeable per-koi variation
        swim: 0.7 + Math.random() * 0.95,
        tailPhase: Math.random() * 10,
        dash: 0,
        wander: Math.random() * TAU,
        seed: Math.random() * 12,
        depth,
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

      cw = clamp(Math.round(W / 150), 8, 12);
      ch = Math.round(cw * 1.4);
      cols = Math.ceil(W / cw) + 1;
      rows = Math.ceil(H / ch) + 1;
      cells = new Array(cols * rows).fill(null);

      cx.font = `600 ${Math.round(ch * 0.8)}px ${mono}`;
      cx.textAlign = "center";
      cx.textBaseline = "middle";

      sizeScale = clamp(W / 1200, 0.58, 1);
      const target = clamp(Math.round((W * H) / 230000), 3, 6);
      if (koi.length === 0) koi = Array.from({ length: target }, () => makeKoi());
      else if (koi.length < target) while (koi.length < target) koi.push(makeKoi());
      else koi.length = target;
    }

    // top-down koi half-width profile along the body (nx 0=nose .. 1=peduncle)
    // Stocky carp body: full through the middle, then a SHORT thick peduncle.
    function halfWidth(nx: number): number {
      if (nx < 0.28) {
        // blunt, rounded head growing to the shoulders
        const u = nx / 0.28;
        return 0.42 + 0.58 * smooth(Math.sqrt(u));
      }
      if (nx < 0.68) {
        // hold a full body through the middle
        const u = (nx - 0.28) / 0.4;
        return 1 - 0.26 * smooth(u);
      }
      // taper quickly to a short, sturdy peduncle near the tail
      const u = (nx - 0.68) / 0.32;
      return 0.74 - 0.47 * smooth(u);
    }

    // deliberate 紅白 white markings (smooth blobs) — keeps the body solid
    function white(nx: number, fr: number): number {
      const g1 = Math.exp(
        -(((nx - 0.33) / 0.1) ** 2 + ((fr - 0.1) / 0.8) ** 2),
      );
      const g2 = Math.exp(
        -(((nx - 0.63) / 0.12) ** 2 + ((fr + 0.12) / 0.85) ** 2),
      );
      return clamp(Math.max(g1, g2) * 1.05, 0, 0.9);
    }

    function stamp(
      px: number,
      py: number,
      d: number,
      col: readonly [number, number, number],
    ) {
      if (d <= 0.04) return;
      const c = (px / cw) | 0;
      const r = (py / ch) | 0;
      if (c < 0 || c >= cols || r < 0 || r >= rows) return;
      const i = r * cols + c;
      const prev = cells[i];
      if (prev && prev.d >= d) return;
      cells[i] = { d, r: col[0], g: col[1], b: col[2] };
    }

    function drawKoi(k: Koi, time: number) {
      const dx = Math.cos(k.dir);
      const dy = Math.sin(k.dir);
      const px = -dy; // perpendicular (left of heading)
      const py = dx;
      const L = k.len;
      const stepA = Math.max(1.2, cw * 0.42);
      const stepL = Math.max(1.2, cw * 0.42);
      const edgeAlpha = 0.6 + 0.4 * k.depth;

      // spine bend at body fraction nx (travelling wave; tail sways most)
      const bend = (nx: number) =>
        k.amp *
        (0.08 + 0.92 * nx) *
        Math.sin(TAU * (nx * k.waves - k.tailPhase + k.phase) + k.phase);

      // ---- body ----
      for (let a = 0; a <= L; a += stepA) {
        const nx = a / L;
        // round the snout so the head isn't a flat wall
        const cap = Math.min(1, Math.sqrt(nx / 0.05));
        const hw = k.width * halfWidth(nx) * cap;
        if (hw < 0.4) continue;
        const b = bend(nx);
        // base point along the spine (behind the nose)
        const sx = k.x - dx * a + px * b;
        const sy = k.y - dy * a + py * b;
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
          // kōhaku: lighten to pale inside the white markings, keep it solid
          const w = white(nx, fr);
          const r = Math.round(RED[0] + (PALE[0] - RED[0]) * w);
          const g = Math.round(RED[1] + (PALE[1] - RED[1]) * w);
          const bl = Math.round(RED[2] + (PALE[2] - RED[2]) * w);
          stamp(wx, wy, d * (1 - 0.28 * w), [r, g, bl]);
        }
      }

      // ---- caudal fin: short, full koi (carp) paddle, barely notched ----
      // (not the long, flowing, deeply-forked veil of a goldfish)
      const tailLen = L * 0.24;
      const baseA = L;
      for (let a = 0; a <= tailLen; a += stepA) {
        const u = a / tailLen; // 0 at peduncle -> 1 at tail tip
        const nx = 1 + u * 0.24;
        // stiff carp tail: damp the sway so it doesn't flow like a veil
        const b = bend(nx) * 0.6;
        const sx = k.x - dx * (baseA + a) + px * b;
        const sy = k.y - dy * (baseA + a) + py * b;
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
          stamp(sx + px * l, sy + py * l, d, RED);
        }
      }

      // ---- pectoral fins: a pair just behind the head, flapping ----
      const finNx = 0.32;
      const finA = finNx * L;
      const flap = 0.55 + 0.45 * Math.sin(time * k.swim * 1.1 + k.phase);
      const bFin = bend(finNx);
      const fsx = k.x - dx * finA + px * bFin;
      const fsy = k.y - dy * finA + py * bFin;
      const hwFin = k.width * halfWidth(finNx);
      for (const side of [1, -1]) {
        const fLen = k.width * (0.9 + 0.9 * flap);
        for (let t = 0; t <= 1.0001; t += 0.12) {
          const lat = side * (hwFin * 0.7 + t * fLen);
          const back = t * k.len * 0.1;
          const wx = fsx - dx * back + px * lat;
          const wy = fsy - dy * back + py * lat;
          stamp(wx, wy, (1 - t) * 0.5 * edgeAlpha, RED);
        }
      }

      // ---- eyes ----
      const eA = 0.12 * L;
      const bEye = bend(0.12);
      const esx = k.x - dx * eA + px * bEye;
      const esy = k.y - dy * eA + py * bEye;
      const ehw = k.width * halfWidth(0.12) * 0.62;
      for (const side of [1, -1]) {
        stamp(esx + px * side * ehw, esy + py * side * ehw, 1, INK);
      }
    }

    function render(time: number) {
      cells.fill(null);
      for (const k of koi) drawKoi(k, time);
      cx.clearRect(0, 0, W, H);
      const rl = RAMP.length - 1;
      const tw = cw - 1;
      const thh = ch - 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = cells[r * cols + c];
          if (!cell) continue;
          const d = cell.d;
          const x = c * cw;
          const y = r * ch;
          // soft mosaic tile
          cx.fillStyle = `rgba(${cell.r},${cell.g},${cell.b},${d * 0.34})`;
          cx.fillRect(x + 0.5, y + 0.5, tw, thh);
          // density glyph
          const g = RAMP[clamp(Math.round(d * rl), 0, rl)];
          if (g !== " ") {
            cx.fillStyle = `rgba(${cell.r},${cell.g},${cell.b},${clamp(d, 0, 1)})`;
            cx.fillText(g, x + cw / 2, y + ch / 2 + 0.5);
          }
        }
      }
      drawRipples();
    }

    // expanding concentric ASCII rings — a splash where the user clicked
    function drawRipples() {
      if (ripples.length === 0) return;
      const lam = Math.max(20, cw * 2.4); // ring spacing (wider than a cell)
      const rrl = RIPPLE_RAMP.length - 1;
      const tw = cw - 1;
      const thh = ch - 1;
      for (const rp of ripples) {
        const p = rp.age / RIPPLE_LIFE; // 0..1
        const r = RIPPLE_MAXR * (1 - (1 - p) * (1 - p)); // ease-out front
        const fade = 1 - p;
        const c0 = Math.max(0, Math.floor((rp.x - r - cw) / cw));
        const c1 = Math.min(cols - 1, Math.ceil((rp.x + r + cw) / cw));
        const r0 = Math.max(0, Math.floor((rp.y - r - ch) / ch));
        const r1 = Math.min(rows - 1, Math.ceil((rp.y + r + ch) / ch));
        for (let ry = r0; ry <= r1; ry++) {
          const py = ry * ch + ch / 2;
          for (let ci = c0; ci <= c1; ci++) {
            const pxp = ci * cw + cw / 2;
            const d = Math.hypot(pxp - rp.x, py - rp.y);
            const back = r - d; // >= 0 is inside the expanding front
            if (back < 0 || back > lam * 3) continue;
            const wave = Math.cos((back / lam) * TAU); // rings at the front + every λ
            if (wave <= 0) continue;
            const a = wave * (1 - back / (lam * 3)) * fade;
            if (a < 0.04) continue;
            // faint water tile + glyph
            cx.fillStyle = `rgba(${RIPPLE_COL[0]},${RIPPLE_COL[1]},${RIPPLE_COL[2]},${clamp(a * 0.3, 0, 0.3)})`;
            cx.fillRect(ci * cw + 0.5, ry * ch + 0.5, tw, thh);
            const g = RIPPLE_RAMP[clamp(Math.round(a * rrl), 0, rrl)];
            if (g === " ") continue;
            cx.fillStyle = `rgba(${RIPPLE_COL[0]},${RIPPLE_COL[1]},${RIPPLE_COL[2]},${clamp(a, 0, 0.9)})`;
            cx.fillText(g, pxp, py + 0.5);
          }
        }
      }
    }

    function update(dt: number, time: number) {
      for (const k of koi) {
        // tail sweeps a touch faster during a startled dash
        k.tailPhase += k.swim * (1 + k.dash * 0.6) * dt;
        k.dash = Math.max(0, k.dash - dt * 1.7);
        const spd = k.speed * (1 + k.dash);
        // wander less while bolting away
        k.dir += Math.sin(time * 0.3 + k.wander) * 0.14 * (1 - 0.8 * Math.min(1, k.dash)) * dt;
        k.x += Math.cos(k.dir) * spd * dt;
        k.y += Math.sin(k.dir) * spd * dt;
        const m = 0.1 * H;
        if (k.y < m) k.dir += 0.5 * dt;
        if (k.y > H - m) k.dir -= 0.5 * dt;
        const reach = k.len * 1.6;
        if (Math.cos(k.dir) > 0 && k.x - reach > W)
          Object.assign(k, makeKoi(-reach * 0.4));
        else if (Math.cos(k.dir) < 0 && k.x + reach < 0)
          Object.assign(k, makeKoi(W + reach * 0.4));
      }
      if (ripples.length) {
        for (const rp of ripples) rp.age += dt;
        ripples = ripples.filter((rp) => rp.age < RIPPLE_LIFE);
      }
    }

    let raf = 0,
      last = 0,
      t0 = 0;
    function frame(now: number) {
      if (!t0) (t0 = now), (last = now);
      const time = (now - t0) / 1000;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      update(dt, time);
      render(time);
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
      // pivot around the body centre so it turns in place (not around the nose)
      const pivot = k.len * 0.5;
      const mx = k.x - Math.cos(k.dir) * pivot;
      const my = k.y - Math.sin(k.dir) * pivot;
      const sign = Math.random() < 0.5 ? 1 : -1;
      k.dir += sign * (Math.PI / 2 + Math.random() * (Math.PI / 2)); // 90–180°
      k.x = mx + Math.cos(k.dir) * pivot;
      k.y = my + Math.sin(k.dir) * pivot;
      k.dash = 2.4 + Math.random() * 1.1; // startled burst
      k.wander = Math.random() * TAU;
    }

    resize();
    if (reduce) render(0.9);
    else raf = requestAnimationFrame(frame);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointerdown", onPoint);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", onPoint);
    };
  }, []);

  return <canvas ref={ref} className="koi-layer" aria-hidden="true" />;
}
