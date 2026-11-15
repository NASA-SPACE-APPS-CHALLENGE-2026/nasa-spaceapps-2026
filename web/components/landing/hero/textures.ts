/**
 * Procedural canvas textures for the hero scene. Everything is drawn from a seeded random generator, so
 * the farm looks the same on every load and nothing is copied from anywhere.
 */
import * as THREE from 'three';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function texture(c: HTMLCanvasElement, anisotropy = 4) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** World size of the patchwork plane (units). One "section" road grid cell is 20 units. */
export const PATCH_SIZE = 240;
/** The slab footprint, centred on the origin. */
export const SLAB_W = 10;
export const SLAB_D = 7;

const CROP_TONES = [
  ['#4d6a28', '#3f5a20'], // corn
  ['#6f8a35', '#5c752b'], // soybeans
  ['#a8915e', '#968150'], // harvested
  ['#5b4330', '#4c3828'], // tilled
  ['#bf9f52', '#a98b45'], // wheat
  ['#5f7a3f', '#516a35'], // pasture
  ['#7c6c4b', '#6b5d40'], // fallow
];

/** Satellite-style patchwork of square sections, quarter fields, pivots, a creek and farmsteads. */
export function patchworkTexture(seed = 7): THREE.CanvasTexture {
  const W = 2048;
  const k = W / PATCH_SIZE; // px per unit
  const { c, ctx } = canvas(W, W);
  const r = rng(seed);
  const px = (u: number) => (u + PATCH_SIZE / 2) * k;

  ctx.fillStyle = '#3a3226';
  ctx.fillRect(0, 0, W, W);

  const sec = 20;
  const road = 0.35;
  for (let sx = -PATCH_SIZE / 2 - sec / 2; sx < PATCH_SIZE / 2; sx += sec) {
    for (let sz = -PATCH_SIZE / 2 - sec / 2; sz < PATCH_SIZE / 2; sz += sec) {
      const x0 = sx + road;
      const z0 = sz + road;
      const s = sec - road * 2;
      const isCentre = sx === -10 && sz === -10;
      if (!isCentre && r() < 0.22) {
        drawPivotSection(ctx, px(x0), px(z0), s * k, r);
        continue;
      }
      const split = isCentre ? 2 : r() < 0.35 ? 1 : r() < 0.6 ? 2 : 4;
      const cells = split === 1 ? [[0, 0, 1, 1]] : split === 2 ? (r() < 0.5 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] : [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]]) : [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
      for (const [fx, fz, fw, fd] of cells) {
        const gap = 0.12;
        drawField(ctx, px(x0 + fx * s + gap), px(z0 + fz * s + gap), (fw * s - gap * 2) * k, (fd * s - gap * 2) * k, r);
      }
      if (!isCentre && r() < 0.18) drawFarmstead(ctx, px(x0 + 1.2), px(z0 + 1.2), r);
    }
  }

  // Roads: the section grid, pale gravel.
  ctx.strokeStyle = '#b8ab92';
  ctx.lineWidth = road * 2 * k * 0.55;
  for (let g = -PATCH_SIZE / 2 - sec / 2; g <= PATCH_SIZE / 2; g += sec) {
    ctx.beginPath();
    ctx.moveTo(px(g), 0);
    ctx.lineTo(px(g), W);
    ctx.moveTo(0, px(g));
    ctx.lineTo(W, px(g));
    ctx.stroke();
  }

  drawCreek(ctx, W, k, r);

  // The pit the slab lifts out of.
  ctx.fillStyle = '#120e0a';
  ctx.fillRect(px(-SLAB_W / 2), px(-SLAB_D / 2), SLAB_W * k, SLAB_D * k);

  return texture(c, 8);
}

function drawField(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number) {
  const [base, line] = CROP_TONES[Math.floor(r() * CROP_TONES.length)];
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  // Rows, along the long side mostly.
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  const along = w > h ? r() < 0.8 : r() < 0.2;
  const step = 2 + r() * 1.5;
  ctx.beginPath();
  if (along) {
    for (let yy = y + step; yy < y + h; yy += step) {
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
    }
  } else {
    for (let xx = x + step; xx < x + w; xx += step) {
      ctx.moveTo(xx, y);
      ctx.lineTo(xx, y + h);
    }
  }
  ctx.stroke();
  // Wet patches / soil variation.
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = `rgba(20, 14, 8, ${0.05 + r() * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(x + r() * w, y + r() * h, 4 + r() * w * 0.25, 3 + r() * h * 0.2, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPivotSection(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number) {
  ctx.fillStyle = '#8c7a55';
  ctx.fillRect(x, y, s, s);
  const cx = x + s / 2;
  const cy = y + s / 2;
  const rad = s * 0.48;
  const sectors = r() < 0.5 ? 1 : 2;
  for (let i = 0; i < sectors; i++) {
    const [base] = CROP_TONES[Math.floor(r() * 3)];
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const a0 = (i / sectors) * Math.PI * 2 + 0.4;
    ctx.arc(cx, cy, rad, a0, a0 + (Math.PI * 2) / sectors);
    ctx.closePath();
    ctx.fill();
  }
  // Wheel tracks: concentric rings.
  ctx.strokeStyle = 'rgba(30, 24, 14, 0.35)';
  ctx.lineWidth = 1;
  for (let rr = rad * 0.2; rr < rad; rr += rad * 0.18) {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#d6cdb6';
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawFarmstead(ctx: CanvasRenderingContext2D, x: number, y: number, r: () => number) {
  ctx.fillStyle = '#2e3d1f';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.arc(x + r() * 26, y + r() * 26, 3 + r() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#d9d4c7' : '#9a9286';
    ctx.fillRect(x + 6 + r() * 14, y + 6 + r() * 14, 4 + r() * 6, 3 + r() * 4);
  }
}

function drawCreek(ctx: CanvasRenderingContext2D, W: number, k: number, r: () => number) {
  const pts: [number, number][] = [];
  let x = W * 0.08;
  for (let y = -20; y <= W + 20; y += 24) {
    x += (r() - 0.45) * 40;
    pts.push([x, y]);
  }
  // Trees along the banks.
  ctx.fillStyle = '#2b3a1c';
  for (const [px, py] of pts) {
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(px + (r() - 0.5) * 30, py + (r() - 0.5) * 24, 3 + r() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = '#2f3b3a';
  ctx.lineWidth = 0.5 * k;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.stroke();
}

/** Top of the slab: dark loam with furrows between the crop rows. Rows run along x. */
export function slabTopTexture(rows: number, seed = 3): THREE.CanvasTexture {
  const W = 1024;
  const H = Math.round((W * SLAB_D) / SLAB_W);
  const { c, ctx } = canvas(W, H);
  const r = rng(seed);
  ctx.fillStyle = '#3a2b1d';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, r, ['#2c2016', '#4a3726', '#54402c'], 5000, 1.6);
  const step = H / rows;
  for (let i = 0; i < rows; i++) {
    const y = (i + 0.5) * step;
    ctx.fillStyle = 'rgba(98, 136, 46, 0.9)';
    ctx.fillRect(0, y - step * 0.24, W, step * 0.48);
    ctx.fillStyle = 'rgba(16, 11, 7, 0.45)';
    ctx.fillRect(0, y + step * 0.32, W, step * 0.12);
  }
  return texture(c, 8);
}

/** Side texture for one soil layer: base colour with grains, pebbles and a wavy lower edge shadow. */
export function strataTexture(base: string, grains: string[], pebbles: number, seed: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const { c, ctx } = canvas(W, H);
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, r, grains, 9000, 1.4);
  for (let i = 0; i < pebbles; i++) {
    const g = 140 + Math.floor(r() * 70);
    ctx.fillStyle = `rgb(${g}, ${g - 12}, ${g - 30})`;
    ctx.beginPath();
    ctx.ellipse(r() * W, r() * H, 3 + r() * 9, 2 + r() * 6, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(r() * W, r() * H, 2, 2);
  }
  // Soft band at the bottom so layers read as separate.
  const grad = ctx.createLinearGradient(0, H * 0.82, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  return texture(c);
}

function speckle(ctx: CanvasRenderingContext2D, W: number, H: number, r: () => number, colours: string[], n: number, size: number) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colours[i % colours.length];
    ctx.fillRect(r() * W, r() * H, size * (0.5 + r()), size * (0.5 + r()));
  }
}
