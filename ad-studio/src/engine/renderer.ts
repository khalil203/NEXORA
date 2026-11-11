// Canvas-based photo-to-video renderer. One function draws any frame at time t,
// so preview, editor and export all produce exactly the same picture.
import type { ElementLayer, Scene, TextLayer } from '../lib/types';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Img = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

export interface RenderAssets {
  images: (Img | null)[];
  logo?: Img | null;
  clips?: (ClipSource | null)[];
}
export interface ClipSource { video: HTMLVideoElement; duration: number; hasAudio: boolean }

export const ASPECT_SIZE = {
  '9:16': (h: number) => ({ width: even(h * 9 / 16), height: h }),
  '1:1': (h: number) => ({ width: even(h), height: even(h) }),
  '16:9': (h: number) => ({ width: even(h * 16 / 9), height: h }),
} as const;

/** Output size: "720p" means the short side is 720. */
export function outputSize(aspect: '9:16' | '1:1' | '16:9', res: number) {
  if (aspect === '9:16') return { width: res, height: even(res * 16 / 9) };
  if (aspect === '1:1') return { width: res, height: res };
  return { width: even(res * 16 / 9), height: res };
}
function even(n: number) { return Math.round(n / 2) * 2; }

// ---------- easing ----------
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const backOut = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const rand = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function sceneAt(scenes: Scene[], t: number) {
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    const d = scenes[i].duration;
    if (t < acc + d || i === scenes.length - 1) return { index: i, local: clamp(t - acc, 0, d), start: acc };
    acc += d;
  }
  return { index: 0, local: 0, start: 0 };
}

export function transitionDur(s: Scene) {
  return s.transition === 'none' ? 0 : Math.min(0.5, s.duration * 0.3);
}

// ---------- buffers for transitions ----------
const buffers: { c: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx }[] = [];
function buffer(i: number, W: number, H: number) {
  if (!buffers[i]) {
    const c: HTMLCanvasElement | OffscreenCanvas =
      typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    buffers[i] = { c, ctx: c.getContext('2d') as Ctx };
  }
  const b = buffers[i];
  if (b.c.width !== W || b.c.height !== H) { b.c.width = W; b.c.height = H; }
  return b;
}

// ---------- main entry ----------
export function drawFrame(ctx: Ctx, scenes: Scene[], assets: RenderAssets, t: number, W: number, H: number) {
  if (!scenes.length) {
    ctx.fillStyle = '#101019';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const { index, local } = sceneAt(scenes, t);
  const s = scenes[index];
  const tr = transitionDur(s);
  if (index > 0 && local < tr) {
    const prev = scenes[index - 1];
    const e = easeInOut(local / tr);
    const A = buffer(0, W, H), B = buffer(1, W, H);
    drawScene(A.ctx, prev, assets, prev.duration, W, H, index - 1);
    drawScene(B.ctx, s, assets, local, W, H, index);
    composite(ctx, s.transition, A.c, B.c, e, W, H);
  } else {
    drawScene(ctx, s, assets, local, W, H, index);
  }
  if (assets.logo) drawLogo(ctx, assets.logo, W, H);
}

function composite(ctx: Ctx, kind: Scene['transition'], A: CanvasImageSource, B: CanvasImageSource, e: number, W: number, H: number) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  switch (kind) {
    case 'slide':
      ctx.drawImage(A, -e * W, 0);
      ctx.drawImage(B, (1 - e) * W, 0);
      break;
    case 'zoom': {
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = e;
      const sc = 1.25 - 0.25 * e;
      ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
      ctx.drawImage(B, 0, 0);
      break;
    }
    case 'wipe':
      ctx.drawImage(A, 0, 0);
      ctx.beginPath(); ctx.rect(0, 0, e * W, H); ctx.clip();
      ctx.drawImage(B, 0, 0);
      break;
    case 'flash':
      ctx.drawImage(e < 0.5 ? A : B, 0, 0);
      ctx.globalAlpha = 1 - Math.abs(e * 2 - 1);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      break;
    default: // fade
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = e;
      ctx.drawImage(B, 0, 0);
  }
  ctx.restore();
}

function drawLogo(ctx: Ctx, logo: Img, W: number, H: number) {
  const U = Math.min(W, H);
  const size = U * 0.12;
  const r = size / Math.max(logo.width, logo.height);
  const w = logo.width * r, h = logo.height * r;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.drawImage(logo, W - w - U * 0.04, U * 0.04, w, h);
  ctx.restore();
}

// ---------- scene ----------
export function drawScene(ctx: Ctx, s: Scene, assets: RenderAssets, local: number, W: number, H: number, seed: number) {
  const U = Math.min(W, H);
  const p = clamp(local / Math.max(0.1, s.duration));
  const img = assets.images[s.imageIndex] ?? assets.images[0] ?? null;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  drawBackground(ctx, s, img, p, W, H);

  const cx = s.product.x * W, cy = s.product.y * H;
  if (s.effects.rays) drawRays(ctx, cx, cy, local, U, W, H);
  if (s.effects.spotlight) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, U * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const clip = s.product.mode === 'ai' ? (assets.clips?.[s.product.clip ?? 0] ?? null) : null;
  if (clip && clip.video.readyState >= 2) drawClip(ctx, clip, W, H);
  else if (img && s.product.mode !== 'hidden') drawProduct(ctx, s.product.mode === 'ai' ? { ...s, product: { ...s.product, mode: 'full' } } : s, img, local, p, W, H);
  if (s.effects.particles) drawParticles(ctx, local, W, H, U, seed);
  s.elements.forEach((el, i) => drawElement(ctx, el, local, W, H, U, 0.25 + i * 0.12));
  s.texts.forEach((tx, i) => drawText(ctx, tx, local, W, H, 0.15 + i * 0.18));
  ctx.restore();
}

function drawBackground(ctx: Ctx, s: Scene, img: Img | null, p: number, W: number, H: number) {
  const [c1, c2] = s.background.colors;
  if (s.background.type === 'solid') {
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, W, H);
  } else {
    const a = 0.9 + p * 0.5;
    const dx = Math.cos(a) * W, dy = Math.sin(a) * H;
    const g = ctx.createLinearGradient(W / 2 - dx / 2, H / 2 - dy / 2, W / 2 + dx / 2, H / 2 + dy / 2);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (s.background.type === 'blur' && img) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.filter = `blur(${Math.round(Math.min(W, H) * 0.035)}px)`;
      drawCover(ctx, img, W, H, 1.25 + p * 0.05, 0, 0);
      ctx.filter = 'none';
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
  // soft light bloom at top + vignette
  const bloom = ctx.createRadialGradient(W * 0.5, H * 0.15, 0, W * 0.5, H * 0.15, Math.max(W, H) * 0.6);
  bloom.addColorStop(0, 'rgba(255,255,255,0.10)');
  bloom.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

/** Current frame of the scene's clip (seeked by syncClips), darkened edges for text. */
function drawClip(ctx: Ctx, clip: ClipSource, W: number, H: number) {
  const v = clip.video;
  const r = Math.max(W / v.videoWidth, H / v.videoHeight) * 1.01;
  const w = v.videoWidth * r, h = v.videoHeight * r;
  ctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(0.3, 'rgba(0,0,0,0)');
  g.addColorStop(0.68, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Position each scene clip at time t. exact=true awaits the seek (export), otherwise keeps preview roughly in sync. */
export async function syncClips(scenes: Scene[], assets: RenderAssets, t: number, exact: boolean, playing = false) {
  if (!assets.clips?.length) return;
  const { index, local } = sceneAt(scenes, t);
  const jobs: Promise<void>[] = [];
  const active = new Set<HTMLVideoElement>();
  const want = (sc: Scene, lt: number) => {
    if (sc.product.mode !== 'ai') return;
    const c = assets.clips?.[sc.product.clip ?? 0];
    if (!c) return;
    const v = c.video;
    const target = Math.min(c.duration - 0.04, lt % Math.max(0.1, c.duration));
    active.add(v);
    if (exact) {
      if (Math.abs(v.currentTime - target) > 0.012) {
        jobs.push(new Promise<void>((res) => { const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = target; setTimeout(done, 1500); }));
      }
    } else {
      if (playing) {
        if (v.paused) v.play().catch(() => {});
        if (Math.abs(v.currentTime - target) > 0.35) v.currentTime = target;
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - target) > 0.04) { v.currentTime = target; jobs.push(new Promise((res) => { v.addEventListener('seeked', () => res(), { once: true }); setTimeout(res, 800); })); }
      }
    }
  };
  want(scenes[index], local);
  if (index > 0 && local < transitionDur(scenes[index])) want(scenes[index - 1], scenes[index - 1].duration);
  for (const c of assets.clips) if (c && !active.has(c.video) && !c.video.paused) c.video.pause();
  await Promise.all(jobs);
}

function drawCover(ctx: Ctx, img: Img, W: number, H: number, scale: number, ox: number, oy: number) {
  const r = Math.max(W / img.width, H / img.height) * scale;
  const w = img.width * r, h = img.height * r;
  ctx.drawImage(img, (W - w) / 2 + ox, (H - h) / 2 + oy, w, h);
}

function cameraOffsets(cam: Scene['camera'], p: number, local: number, W: number, H: number) {
  const e = easeInOut(p);
  switch (cam) {
    case 'zoom-in': return { s: 1 + 0.14 * e, x: 0, y: 0 };
    case 'zoom-out': return { s: 1.14 - 0.14 * e, x: 0, y: 0 };
    case 'pan-left': return { s: 1.1, x: (0.5 - e) * W * 0.08, y: 0 };
    case 'pan-right': return { s: 1.1, x: (e - 0.5) * W * 0.08, y: 0 };
    case 'pan-up': return { s: 1.08, x: 0, y: (0.5 - e) * H * 0.05 };
    case 'float': return { s: 1.02 + 0.03 * e, x: 0, y: Math.sin(local * 2.2) * H * 0.012 };
    default: return { s: 1, x: 0, y: 0 };
  }
}

function drawProduct(ctx: Ctx, s: Scene, img: Img, local: number, p: number, W: number, H: number) {
  const U = Math.min(W, H);
  const cam = cameraOffsets(s.camera, p, local, W, H);
  if (s.product.mode === 'full') {
    drawCover(ctx, img, W, H, cam.s, cam.x, cam.y);
    if (s.product.clean) return; // finished storyboard frame: no darkening
    // readability overlay
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const enter = easeOut(clamp(local / 0.6));
  const box = s.product.scale * U;
  const maxH = H * 0.62;
  const r = Math.min(box / img.width, Math.min(box, maxH) / img.height);
  const sc = cam.s * (0.88 + 0.12 * enter);
  const w = img.width * r * sc, h = img.height * r * sc;
  const x = s.product.x * W - w / 2 + cam.x, y = s.product.y * H - h / 2 + cam.y;
  const rad = U * 0.035;
  ctx.save();
  ctx.globalAlpha = enter;
  // floor shadow
  ctx.save();
  ctx.globalAlpha = 0.35 * enter;
  ctx.fillStyle = '#000';
  ctx.filter = `blur(${Math.round(U * 0.02)}px)`;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + U * 0.025, w * 0.42, U * 0.02, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = 'none';
  ctx.restore();
  // glow
  if (s.effects.glow) {
    ctx.shadowColor = s.background.colors[1];
    ctx.shadowBlur = U * (0.07 + 0.02 * Math.sin(local * 3));
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = U * 0.04;
  }
  ctx.shadowOffsetY = U * 0.01;
  roundRect(ctx, x, y, w, h, rad);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save();
  roundRect(ctx, x, y, w, h, rad);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);
  // sheen sweep at entrance
  const sweep = clamp((local - 0.4) / 0.9);
  if (sweep > 0 && sweep < 1) {
    const sx = x - w + sweep * w * 3;
    const g = ctx.createLinearGradient(sx, y, sx + w * 0.5, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  ctx.restore();
}

function drawRays(ctx: Ctx, cx: number, cy: number, local: number, U: number, W: number, H: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, cy);
  ctx.rotate(local * 0.15);
  const R = Math.max(W, H);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const g = ctx.createRadialGradient(0, 0, U * 0.1, 0, 0, R * 0.8);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a, a + Math.PI / n * 0.55);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx: Ctx, local: number, W: number, H: number, U: number, seed: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 36; i++) {
    const k = i + seed * 100;
    const speed = 0.02 + rand(k + 3) * 0.05;
    const x = rand(k) * W + Math.sin(local * (0.5 + rand(k + 7)) + k) * U * 0.02;
    let y = (rand(k + 1) - local * speed) % 1;
    if (y < 0) y += 1;
    const r = U * (0.002 + rand(k + 2) * 0.006);
    const a = 0.25 + 0.55 * Math.abs(Math.sin(local * (1 + rand(k + 4) * 2) + k));
    const g = ctx.createRadialGradient(x, y * H, 0, x, y * H, r * 3);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y * H, r * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- Thai-aware text ----------
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const graphemer = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
const words = (s: string) => (segmenter ? [...segmenter.segment(s)].map((x) => x.segment) : s.split(/(\s+)/));
export const graphemes = (s: string) => (graphemer ? [...graphemer.segment(s)].map((x) => x.segment) : [...s]);

/** Wraps Thai/Latin text by word, then balances line widths so no word is orphaned. */
export function wrapText(ctx: Ctx, text: string, maxW: number): string[] {
  const first = wrapRaw(ctx, text, maxW);
  if (first.length < 2) return first;
  let lo = maxW * 0.45, hi = maxW, best = first;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    const l = wrapRaw(ctx, text, mid);
    if (l.length <= first.length) { best = l; hi = mid; } else lo = mid;
  }
  return best;
}

function wrapRaw(ctx: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of words(para)) {
      const test = line + w;
      if (ctx.measureText(test).width <= maxW || !line) {
        if (ctx.measureText(test).width > maxW && !line) {
          // single word too long: break by grapheme
          let part = '';
          for (const g of graphemes(w)) {
            if (ctx.measureText(part + g).width > maxW && part) { out.push(part); part = g; } else part += g;
          }
          line = part;
        } else line = test;
      } else {
        out.push(line.trim());
        line = w.trimStart();
      }
    }
    out.push(line.trim());
  }
  return out;
}

function isDark(hex: string) {
  const m = hex.replace('#', '');
  if (m.length < 6) return false;
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}
function shade(hex: string, f: number) {
  const m = hex.replace('#', '');
  if (m.length < 6) return hex;
  const c = [0, 2, 4].map((i) => Math.round(clamp(parseInt(m.slice(i, i + 2), 16) * f, 0, 255)).toString(16).padStart(2, '0'));
  return `#${c.join('')}`;
}

export interface TextBox { x: number; y: number; w: number; h: number; lines: number; overflow: boolean }

export function setTextFont(ctx: Ctx, tx: TextLayer, U: number) {
  const px = Math.max(8, tx.style.size * U);
  ctx.font = `${tx.style.weight} ${px}px "${tx.style.font}", "Noto Sans Thai", sans-serif`;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${(tx.style.letterSpacing * U) / 1080}px`;
  return px;
}

export function measureText(ctx: Ctx, tx: TextLayer, W: number, H: number): TextBox {
  const U = Math.min(W, H);
  const px = setTextFont(ctx, tx, U);
  const maxW = W * 0.86;
  const lines = wrapText(ctx, tx.text, maxW);
  const lh = px * 1.38;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width), 1) + (tx.style.bg ? px * 0.8 : 0);
  const h = lines.length * lh;
  const cx = tx.x * W, cy = tx.y * H;
  const x = tx.style.align === 'left' ? cx : tx.style.align === 'right' ? cx - w : cx - w / 2;
  const box = { x, y: cy - h / 2, w, h, lines: lines.length };
  return { ...box, overflow: box.x < -1 || box.x + w > W + 1 || box.y < 0 || box.y + h > H };
}

function drawText(ctx: Ctx, tx: TextLayer, local: number, W: number, H: number, delay: number) {
  if (!tx.text.trim()) return;
  const U = Math.min(W, H);
  const a = tx.anim === 'none' ? 1 : clamp((local - delay) / 0.55);
  if (a <= 0) return;
  const st = tx.style;
  const px = setTextFont(ctx, tx, U);
  let lines = wrapText(ctx, tx.text, W * 0.86);
  if (tx.anim === 'typewriter') {
    const all = graphemes(lines.join('\n'));
    const n = Math.floor(all.length * clamp((local - delay) / 1.2));
    lines = all.slice(0, n).join('').split('\n');
  }
  const lh = px * 1.38;
  const total = lines.length * lh;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = st.align;
  let ox = 0, oy = 0, sc = 1, alpha = 1;
  const e = easeOut(a);
  switch (tx.anim) {
    case 'fade-up': alpha = e; oy = (1 - e) * px * 0.7; break;
    case 'pop': sc = a < 1 ? Math.max(0.01, backOut(a)) : 1; alpha = clamp(a * 2); break;
    case 'slide-left': ox = (1 - e) * W * 0.35; alpha = e; break;
    case 'glow': alpha = e; break;
  }
  const cx = tx.x * W, cy = tx.y * H;
  ctx.globalAlpha = alpha;
  ctx.translate(cx + ox, cy + oy);
  ctx.scale(sc, sc);
  if (st.preset === 'cine' && lines.length) {
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const grow = easeOut(clamp((local - delay) / 0.8));
    const g = ctx.createLinearGradient(-w * 0.6, 0, w * 0.6, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w * 0.75, -total / 2 - px * 0.35, w * 1.5, total + px * 0.7);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha *= 0.9;
    ctx.fillRect(-px * 0.9 * grow, -total / 2 - px * 0.32, px * 1.8 * grow, Math.max(2, px * 0.06));
    ctx.globalAlpha /= 0.9;
  }
  lines.forEach((line, i) => {
    const ly = -total / 2 + lh * (i + 0.5);
    drawStyledLine(ctx, line, ly, px, st, local, tx.anim === 'glow');
  });
  ctx.restore();
}

function drawStyledLine(ctx: Ctx, line: string, y: number, px: number, st: TextLayer['style'], local: number, pulse: boolean) {
  const w = ctx.measureText(line).width;
  const left = st.align === 'center' ? -w / 2 : st.align === 'right' ? -w : 0;
  const dark = isDark(st.color);
  ctx.lineJoin = 'round';
  switch (st.preset) {
    case 'cine': {
      // cinematic lower-third: soft dark glow behind, crisp white text, thin accent line
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = px * 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.001)';
      ctx.fillText(line, 0, y);
      ctx.restore();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = px * 0.35;
      ctx.shadowOffsetY = px * 0.05;
      ctx.fillStyle = st.color;
      ctx.fillText(line, 0, y);
      return;
    }
    case 'label': {
      const pad = px * 0.4;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = px * 0.3;
      roundRect(ctx, left - pad, y - px * 0.72, w + pad * 2, px * 1.44, px * 0.3);
      ctx.fillStyle = st.bg || '#ffe14d';
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = st.color;
      ctx.fillText(line, 0, y);
      return;
    }
    case 'outline':
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = px * 0.16;
      ctx.strokeText(line, 0, y);
      ctx.fillStyle = st.color;
      ctx.fillText(line, 0, y);
      return;
    case '3d': {
      const depth = Math.max(3, Math.round(px * 0.08));
      ctx.fillStyle = shade(st.color2 || '#7b2ff7', 0.6);
      for (let d = depth; d > 0; d--) ctx.fillText(line, d, y + d);
      ctx.strokeStyle = shade(st.color2 || '#7b2ff7', 0.4);
      ctx.lineWidth = px * 0.08;
      ctx.strokeText(line, 0, y);
      ctx.fillStyle = st.color;
      ctx.fillText(line, 0, y);
      return;
    }
    case 'gold': {
      const g = ctx.createLinearGradient(0, y - px / 2, 0, y + px / 2);
      g.addColorStop(0, st.color);
      g.addColorStop(0.55, st.color2 || '#b8862b');
      g.addColorStop(1, st.color);
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = px * 0.25;
      ctx.fillStyle = g;
      ctx.fillText(line, 0, y);
      return;
    }
    case 'neon': {
      const k = pulse ? 0.7 + 0.3 * Math.sin(local * 6) : 1;
      ctx.shadowColor = st.color;
      ctx.shadowBlur = px * 0.6 * k;
      ctx.fillStyle = st.color;
      ctx.fillText(line, 0, y);
      ctx.shadowBlur = px * 0.2;
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha *= 0.75;
      ctx.fillText(line, 0, y);
      return;
    }
    default: {
      if (st.color2) {
        const g = ctx.createLinearGradient(left, 0, left + w, 0);
        g.addColorStop(0, st.color);
        g.addColorStop(1, st.color2);
        ctx.fillStyle = g;
      } else ctx.fillStyle = st.color;
      if (!dark) {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = px * (pulse ? 0.3 + 0.2 * Math.sin(local * 5) : 0.22);
        ctx.shadowOffsetY = px * 0.04;
      }
      ctx.fillText(line, 0, y);
    }
  }
}

// ---------- graphic elements ----------
export function elementBox(el: ElementLayer, W: number, H: number) {
  const U = Math.min(W, H);
  const s = el.scale * U;
  const w = el.type === 'price' ? s * 2.4 : el.type === 'stars' ? s * 3 : s;
  return { x: el.x * W - w / 2, y: el.y * H - s / 2, w, h: s };
}

function drawElement(ctx: Ctx, el: ElementLayer, local: number, W: number, H: number, U: number, delay: number) {
  const a = clamp((local - delay) / 0.45);
  if (a <= 0) return;
  const s = el.scale * U;
  ctx.save();
  ctx.translate(el.x * W, el.y * H);
  const k = a < 1 ? Math.max(0.01, backOut(a)) : 1;
  ctx.scale(k, k);
  ctx.globalAlpha = clamp(a * 2);
  ctx.fillStyle = el.color;
  ctx.strokeStyle = el.color;
  const fontFor = (size: number) => `800 ${size}px "Kanit", "Noto Sans Thai", sans-serif`;
  switch (el.type) {
    case 'badge': {
      ctx.rotate(local * 0.4);
      ctx.beginPath();
      const n = 16;
      for (let i = 0; i < n * 2; i++) {
        const r = i % 2 ? s * 0.42 : s * 0.5;
        const ang = (i / (n * 2)) * Math.PI * 2;
        ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.closePath();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = s * 0.15;
      ctx.fill();
      ctx.rotate(-local * 0.4);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = isDark(el.color) ? '#fff' : '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = fontFor(s * 0.24);
      ctx.fillText(el.text || 'SALE', 0, 0, s * 0.75);
      break;
    }
    case 'price': {
      ctx.font = fontFor(s * 0.55);
      const label = el.text || '฿0';
      const tw = Math.max(ctx.measureText(label).width + s * 0.8, s * 1.6);
      roundRect(ctx, -tw / 2, -s / 2, tw, s, s / 2);
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = s * 0.25;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      const sweep = (local * 0.6) % 1.6;
      ctx.save();
      ctx.clip();
      const g = ctx.createLinearGradient(-tw / 2 + sweep * tw - tw * 0.3, 0, -tw / 2 + sweep * tw, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-tw / 2, -s / 2, tw, s);
      ctx.restore();
      ctx.fillStyle = isDark(el.color) ? '#fff' : '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, s * 0.03);
      break;
    }
    case 'arrow': {
      const b = Math.sin(local * 6) * s * 0.15;
      ctx.lineWidth = s * 0.16;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = (i ? 0.55 : 1) * clamp(a * 2);
        ctx.beginPath();
        const yy = b + i * s * 0.35 - s * 0.2;
        ctx.moveTo(-s * 0.45, yy - s * 0.2);
        ctx.lineTo(0, yy + s * 0.2);
        ctx.lineTo(s * 0.45, yy - s * 0.2);
        ctx.stroke();
      }
      break;
    }
    case 'stars':
      for (let i = 0; i < 5; i++) { star(ctx, (i - 2) * s * 0.6, 0, s * 0.27, s * 0.12); ctx.fill(); }
      break;
    case 'spark': {
      const tw = 0.7 + 0.3 * Math.sin(local * 5);
      ctx.scale(tw, tw);
      star(ctx, 0, 0, s * 0.5, s * 0.1, 4);
      ctx.shadowColor = el.color;
      ctx.shadowBlur = s * 0.4;
      ctx.fill();
      break;
    }
    case 'heart': {
      const pls = 1 + 0.08 * Math.sin(local * 7);
      ctx.scale(pls, pls);
      ctx.beginPath();
      const r = s / 2;
      ctx.moveTo(0, r * 0.7);
      ctx.bezierCurveTo(-r * 1.2, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.45);
      ctx.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.2, -r * 0.1, 0, r * 0.7);
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = s * 0.2;
      ctx.fill();
      break;
    }
    case 'ribbon': {
      ctx.font = fontFor(s * 0.45);
      const label = el.text || 'ใหม่';
      const tw = ctx.measureText(label).width + s;
      ctx.beginPath();
      ctx.moveTo(-tw / 2 - s * 0.3, -s / 2);
      ctx.lineTo(tw / 2, -s / 2);
      ctx.lineTo(tw / 2 + s * 0.3, 0);
      ctx.lineTo(tw / 2, s / 2);
      ctx.lineTo(-tw / 2 - s * 0.3, s / 2);
      ctx.lineTo(-tw / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = isDark(el.color) ? '#fff' : '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      break;
    }
    case 'check': {
      ctx.beginPath();
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isDark(el.color) ? '#fff' : '#111';
      ctx.lineWidth = s * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, 0);
      ctx.lineTo(-s * 0.05, s * 0.15);
      ctx.lineTo(s * 0.22, -s * 0.15);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function star(ctx: Ctx, x: number, y: number, R: number, r: number, n = 5) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 ? r : R;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

// ---------- asset loading ----------
export async function loadImage(blob: Blob): Promise<Img> {
  if (typeof createImageBitmap !== 'undefined') {
    try { return await createImageBitmap(blob); } catch { /* fall back */ }
  }
  const url = URL.createObjectURL(blob);
  const im = new Image();
  im.src = url;
  await im.decode();
  return im;
}

export async function ensureFonts(scenes: Scene[]) {
  if (!document.fonts) return;
  const set = new Set<string>(['800 40px "Kanit"']);
  scenes.forEach((s) => s.texts.forEach((t) => set.add(`${t.style.weight} 40px "${t.style.font}"`)));
  await Promise.all([...set].map((f) => document.fonts.load(f, 'กขคabc').catch(() => null)));
}
