// "Ad photo" from the owner's product photo — free.
// 1) FLUX.1 Kontext repaints the photo into an ad scene (Hugging Face ZeroGPU), Gemini checks the label is unchanged.
// 2) Fallback: the REAL product is cut out in the browser (unlimited) and placed on an AI backdrop (Z-Image-Turbo),
//    or on a designed studio backdrop when the GPU quota is out. The product pixels are never altered in 2).
import { getAsset, putAsset } from './db';
import { LOOKS } from './storyboard';
import type { CategoryId, FlowPlan, FlowShot, ProductInfo, Project } from './types';
import { gpuBackAt, gpuOff, isQuota, markGpuOff } from './freeai';

function timeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(msg)), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });
}

// Cut-out model (in-browser). Small quantized model; downloaded once then cached by the browser.
const CUT_CFG = { model: 'isnet_quint8' as const, output: { format: 'image/png' as const } };
let preloading: Promise<void> | null = null;
/** Start downloading the cut-out model in the background so it is ready when needed. */
export function preloadCutout() {
  if (!preloading) preloading = import('@imgly/background-removal').then((m) => m.preload(CUT_CFG)).catch(() => { preloading = null; });
  return preloading;
}
async function cutout(blob: Blob, onStage: (s: string) => void) {
  const m = await import('@imgly/background-removal');
  return m.removeBackground(blob, {
    ...CUT_CFG,
    device: (navigator as Navigator & { gpu?: unknown }).gpu ? 'gpu' : 'cpu',
    progress: (key: string, cur: number, total: number) => {
      if (key.startsWith('fetch') && total) onStage(`กำลังโหลดตัวไดคัท ${Math.round((cur / total) * 100)}% (ครั้งแรกครั้งเดียว)`);
      else if (key.startsWith('compute')) onStage('กำลังไดคัทสินค้า…');
    },
  });
}
/** Downscale big phone photos first — much faster cut-out. */
async function shrink(blob: Blob, max = 1024) {
  const bmp = await createImageBitmap(blob);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (r === 1) { bmp.close?.(); return blob; }
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
}

export const IMAGE_URL = 'https://oioulxjjeqdxsofhudnl.supabase.co/functions/v1/ad-studio-image';
const W = 1080, H = 1920;

const SCENE: Record<CategoryId, string> = {
  beauty: 'a soft pastel pink and cream beauty set, round glossy podium, silk fabric and fresh flower petals, gentle morning sunlight with soft shadows',
  food: 'a warm rustic kitchen table, natural wood surface, fresh ingredients softly blurred around, warm appetizing daylight',
  fashion: 'a minimal editorial fashion set, warm beige plaster wall, travertine block pedestal, dramatic soft window light',
  tech: 'a sleek dark tech desk set, matte black pedestal, cool blue rim light and subtle neon reflections',
  health: 'a fresh bright bathroom shelf, white stone surface, green leaves, clean natural daylight',
  home: 'a cozy modern living room shelf, light oak surface, warm lamp light, soft bokeh',
  luxury: 'a dark luxury set, black marble pedestal with gold accents, warm golden rim light, elegant bokeh',
  general: 'a clean premium studio set, round beige podium, soft gradient backdrop, soft key light',
};

async function bitmap(blob: Blob) { return createImageBitmap(blob); }
function canvas(w = W, h = H) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const toBlob = (c: HTMLCanvasElement, type = 'image/jpeg', q = 0.92) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), type, q));
async function b64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Product photo centered on a 9:16 neutral canvas so Kontext outputs a vertical ad. */
async function padVertical(blob: Blob) {
  const bmp = await bitmap(blob);
  const c = canvas(768, 1344); const x = c.getContext('2d')!;
  x.fillStyle = '#d9d6d1'; x.fillRect(0, 0, c.width, c.height);
  const s = Math.min(c.width * 0.86 / bmp.width, c.height * 0.62 / bmp.height);
  const w = bmp.width * s, h = bmp.height * s;
  x.drawImage(bmp, (c.width - w) / 2, c.height * 0.56 - h / 2, w, h);
  bmp.close?.();
  return toBlob(c, 'image/jpeg', 0.9);
}

async function post(body: object, signal?: AbortSignal) {
  const r = await fetch(IMAGE_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!r.ok || !r.headers.get('content-type')?.startsWith('image')) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `ภาพ AI ผิดพลาด (${r.status})`);
  }
  return { blob: await r.blob(), model: r.headers.get('x-ai-model') || 'AI' };
}

/** Trim a cut-out PNG to its visible pixels. */
async function trimmed(png: Blob) {
  const bmp = await bitmap(png);
  const c = canvas(bmp.width, bmp.height); const x = c.getContext('2d')!;
  x.drawImage(bmp, 0, 0); bmp.close?.();
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y += 2) for (let i = 0; i < c.width; i += 2) {
    if (d[(y * c.width + i) * 4 + 3] > 24) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0 || y1 <= y0) throw new Error('ตัดพื้นหลังไม่สำเร็จ');
  const out = canvas(x1 - x0 + 2, y1 - y0 + 2);
  out.getContext('2d')!.drawImage(c, -x0, -y0);
  return out;
}

/** Designed studio backdrop (no AI needed): gradient wall, floor and a lit podium. Returns podium top y. */
function studio(x: CanvasRenderingContext2D, category: CategoryId, style: Project['style']) {
  const look = LOOKS[style];
  const [a, b] = look.bg[0];
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a); g.addColorStop(0.62, b); g.addColorStop(1, a);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H * 0.42, W * 0.75);
  glow.addColorStop(0, 'rgba(255,255,255,0.35)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, H);
  // podium
  const top = H * 0.74, rx = W * 0.36, ry = W * 0.07, hgt = H * 0.13;
  const body = x.createLinearGradient(W / 2 - rx, 0, W / 2 + rx, 0);
  body.addColorStop(0, 'rgba(0,0,0,0.28)'); body.addColorStop(0.45, 'rgba(255,255,255,0.22)'); body.addColorStop(1, 'rgba(0,0,0,0.35)');
  x.fillStyle = category === 'luxury' || category === 'tech' ? '#1b1b1f' : '#efe9e2';
  x.beginPath(); x.moveTo(W / 2 - rx, top); x.lineTo(W / 2 - rx, top + hgt); x.ellipse(W / 2, top + hgt, rx, ry, 0, Math.PI, 0, true); x.lineTo(W / 2 + rx, top); x.closePath(); x.fill();
  x.fillStyle = body; x.fill();
  x.fillStyle = category === 'luxury' || category === 'tech' ? '#2a2a30' : '#f8f4ef';
  x.beginPath(); x.ellipse(W / 2, top, rx, ry, 0, 0, Math.PI * 2); x.fill();
  if (category === 'luxury') { x.strokeStyle = look.accent; x.lineWidth = 4; x.stroke(); }
  return top;
}

function placeProduct(x: CanvasRenderingContext2D, prod: HTMLCanvasElement, baseY: number, reflection: boolean) {
  const s = Math.min(W * 0.62 / prod.width, H * 0.5 / prod.height);
  const w = prod.width * s, h = prod.height * s, px = (W - w) / 2, py = baseY - h;
  // contact shadow
  x.save();
  x.filter = 'blur(18px)';
  x.fillStyle = 'rgba(0,0,0,0.45)';
  x.beginPath(); x.ellipse(W / 2, baseY + 4, w * 0.46, Math.max(10, w * 0.06), 0, 0, Math.PI * 2); x.fill();
  x.restore();
  if (reflection) {
    x.save();
    x.beginPath(); x.rect(0, baseY, W, h * 0.28); x.clip();
    x.globalAlpha = 0.14; x.translate(0, baseY * 2); x.scale(1, -1);
    x.drawImage(prod, px, py, w, h); x.restore();
  }
  x.drawImage(prod, px, py, w, h);
}

export type FrameMethod = 'kontext' | 'cutout-ai' | 'cutout-studio' | 'photo-studio';
export interface AdPhoto { assetId: string; method: FrameMethod; notes: string[] }
type FrameKind = 'hero' | 'lifestyle' | 'closeup' | 'cta';

function frameKind(type: string, i: number, n: number): FrameKind {
  if (/macro|detail|close/i.test(type)) return 'closeup';
  if (/life|usage|use/i.test(type)) return 'lifestyle';
  if (/cta|end/i.test(type) || (i === n - 1 && n > 1)) return 'cta';
  return i === 1 ? 'lifestyle' : 'hero';
}

function bokeh(x: CanvasRenderingContext2D, seed: number, tint = '255,240,220') {
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < 22; k++) {
    const cx = rnd() * W, cy = rnd() * H * 0.7, rad = 30 + rnd() * 110;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(${tint},${0.10 + rnd() * 0.18})`); g.addColorStop(1, `rgba(${tint},0)`);
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
  }
}

/** One storyboard frame from the real product (cut-out or framed photo) on a designed/AI set. */
async function compositeFrame(p: Project, src: Blob, prod: HTMLCanvasElement | null, kind: FrameKind, i: number, sceneText: string, notes: string[], onStage: (s: string) => void, signal?: AbortSignal) {
  const c = canvas(); const x = c.getContext('2d')!;
  let method: FrameMethod = 'cutout-studio';
  let baseY = H * 0.8;
  let aiBg = false;
  if (prod && kind === 'lifestyle' && !gpuOff()) {
    try {
      onStage(`AI กำลังสร้างฉากไลฟ์สไตล์ (Z-Image) เฟรม ${i + 1}…`);
      const bg = await timeout(post({ action: 'scene', prompt: `Empty product photography scene for a vertical 9:16 brand shoot: ${sceneText}. An empty surface in the lower center where a product will be placed. No product, no text, no logo, no people. Photorealistic, high detail, shallow depth of field.` }, signal), 40000, 'AI ใช้เวลานานเกินไป');
      const bmp = await bitmap(bg.blob);
      const sc = Math.max(W / bmp.width, H / bmp.height);
      x.drawImage(bmp, (W - bmp.width * sc) / 2, (H - bmp.height * sc) / 2, bmp.width * sc, bmp.height * sc);
      bmp.close?.();
      aiBg = true; method = 'cutout-ai';
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      if (isQuota((e as Error).message)) markGpuOff();
    }
  }
  if (!aiBg) {
    if (kind === 'closeup' || kind === 'lifestyle') {
      // soft set without podium: gradient + bokeh light
      const look = LOOKS[p.style];
      const [a, b] = look.bg[(i + 1) % look.bg.length];
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, a); g.addColorStop(1, b);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      bokeh(x, i + 3, kind === 'lifestyle' ? '255,236,200' : '255,255,255');
      const floor = x.createLinearGradient(0, H * 0.72, 0, H); floor.addColorStop(0, 'rgba(0,0,0,0)'); floor.addColorStop(1, 'rgba(0,0,0,0.35)');
      x.fillStyle = floor; x.fillRect(0, H * 0.72, W, H * 0.28);
      baseY = kind === 'closeup' ? H * 0.96 : H * 0.82;
    } else baseY = studio(x, p.product.category, p.style);
  }
  if (prod) {
    if (kind === 'closeup') {
      const sc = Math.min(W * 0.92 / prod.width, H * 0.8 / prod.height);
      const w = prod.width * sc, h = prod.height * sc;
      x.drawImage(prod, (W - w) / 2, baseY - h, w, h);
    } else placeProduct(x, prod, kind === 'cta' ? baseY : baseY, !aiBg && kind !== 'lifestyle');
  } else {
    const bmp = await bitmap(src);
    const big = kind === 'closeup';
    const s2 = Math.min(W * (big ? 0.86 : 0.72) / bmp.width, H * (big ? 0.62 : 0.5) / bmp.height);
    const w = bmp.width * s2, h = bmp.height * s2, px = (W - w) / 2, py = Math.min(baseY - h - 24, H - h - 60);
    x.save(); x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 50; x.shadowOffsetY = 24;
    x.beginPath(); x.roundRect(px, py, w, h, 36); x.fillStyle = '#fff'; x.fill(); x.restore();
    x.save(); x.beginPath(); x.roundRect(px, py, w, h, 36); x.clip(); x.drawImage(bmp, px, py, w, h); x.restore();
    bmp.close?.();
    method = 'photo-studio';
  }
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
  void notes;
  return { blob: await toBlob(c), method };
}

const LICENSE: Record<FrameMethod, string> = {
  kontext: 'สตอรี่บอร์ด AI: FLUX.1 Kontext (แก้จากรูปสินค้าของคุณ, ตรวจฉลากโดย Gemini)',
  'cutout-ai': 'สตอรี่บอร์ด: สินค้าจริง (ไดคัท) + ฉาก AI Z-Image-Turbo',
  'cutout-studio': 'สตอรี่บอร์ด: สินค้าจริง (ไดคัท) + ฉากที่แอปออกแบบ',
  'photo-studio': 'สตอรี่บอร์ด: รูปสินค้าจริงบนฉากที่แอปออกแบบ',
};

/**
 * AI storyboard for a brand shoot: one 9:16 frame per shot of the director's script.
 * Saves each frame as shot.frame; the videos are later made from these frames.
 */
export async function makeStoryboard(p: Project, onStage: (s: string, v: number) => void, signal?: AbortSignal) {
  const src = await getAsset(p.images[0]);
  if (!src) throw new Error('ไม่พบรูปสินค้า');
  const shots = p.flow!.shots;
  const n = shots.length;
  const notes: string[] = [];
  let prod: HTMLCanvasElement | null | undefined;
  const getCut = async (): Promise<HTMLCanvasElement | null> => {
    if (prod !== undefined) return prod;
    onStage('กำลังไดคัทสินค้า…', 0.25);
    try { prod = await timeout(cutout(await shrink(src.blob), (t) => onStage(t, 0.25)).then(trimmed), 45000, 'ไดคัทช้าเกินไป'); }
    catch (e) { prod = null; notes.push(`ไดคัท: ${(e as Error).message.slice(0, 60)} — ใช้รูปเดิมวางบนฉากแทน`); }
    return prod ?? null;
  };
  const methods: FrameMethod[] = [];
  for (let i = 0; i < n; i++) {
    const s = shots[i];
    if (s.frame) continue;
    const kind = frameKind(s.type, i, n);
    const sceneText = (s.image_prompt || scenePromptText(s.veo_prompt) || SCENE[p.product.category] || SCENE.general).slice(0, 500);
    const stageV = 0.22 + (i / n) * 0.1;
    let blob: Blob | null = null; let method: FrameMethod = 'cutout-studio';
    if (!gpuOff()) {
      try {
        onStage(`AI สตอรี่บอร์ด เฟรม ${i + 1}/${n} (FLUX Kontext)…`, stageV);
        const r = await timeout(post({
          action: 'kontext', image: await b64(await padVertical(src.blob)),
          prompt: `Brand shoot storyboard frame ${i + 1} of ${n} (${kind === 'closeup' ? 'close-up detail shot' : kind === 'lifestyle' ? 'lifestyle shot' : kind === 'cta' ? 'clean hero end frame' : 'hero shot'}), premium vertical 9:16 advertising photo. Replace the plain grey background with: ${sceneText}. Keep the product exactly the same: same shape, colors, logo, label and all text, sharp and readable. Realistic lighting and a soft contact shadow. Do not add any text, hands or people.`,
        }, signal), 60000, 'AI ใช้เวลานานเกินไป');
        blob = r.blob; method = 'kontext';
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        if (isQuota((e as Error).message)) markGpuOff();
        else notes.push(`เฟรม ${i + 1} AI: ${(e as Error).message.slice(0, 70)}`);
      }
    }
    if (!blob) {
      onStage(`กำลังจัดเฟรมสตอรี่บอร์ด ${i + 1}/${n}…`, stageV);
      const r = await compositeFrame(p, src.blob, await getCut(), kind, i, sceneText, notes, (t) => onStage(t, stageV), signal);
      blob = r.blob; method = r.method;
    }
    const a = await putAsset(blob, `storyboard-${i + 1}.jpg`, 'image', LICENSE[method]);
    s.frame = a.id;
    methods.push(method);
  }
  return { notes, methods };
}

function scenePromptText(veo: string) {
  return veo.replace(/A warm Thai[^"]*"[^"]*"\.?/gi, '').replace(/AUDIO:[^.]*\.?/gi, '').replace(/"[^"]*[\u0E00-\u0E7F][^"]*"/g, '').replace(/No on-screen text[^.]*\./gi, '').trim();
}

/**
 * ONE pro ad image from the product photo (prompt written automatically by the AI director).
 * The owner reviews it before any video is made. variant > 0 = "make another one".
 */
export async function makeAdImage(p: Project, variant: number, onStage: (s: string) => void, signal?: AbortSignal): Promise<AdPhoto & { prompt: string }> {
  const src = await getAsset(p.images.find((id) => id !== p.adPhoto?.assetId) ?? p.images[0]);
  if (!src) throw new Error('ไม่พบรูปสินค้า');
  const shots = p.flow?.shots ?? [];
  const pick = shots.length ? shots[variant % shots.length] : undefined;
  const sceneText = (pick?.image_prompt || (pick ? scenePromptText(pick.veo_prompt) : '') || SCENE[p.product.category] || SCENE.general).slice(0, 500);
  const prompt = `Premium vertical 9:16 advertising photo for a brand shoot. Replace the plain grey background with: ${sceneText}. Keep the product exactly the same: same shape, colors, logo, label and all text, sharp and readable. Realistic studio lighting on the product, soft contact shadow, shallow depth of field. Do not add any text, hands or people.`;
  const notes: string[] = [];
  if (!gpuOff()) {
    try {
      onStage('AI กำลังสร้างภาพโฆษณา (FLUX Kontext)…');
      const r = await timeout(post({ action: 'kontext', image: await b64(await padVertical(src.blob)), prompt }, signal), 75000, 'AI ใช้เวลานานเกินไป');
      const a = await putAsset(r.blob, 'ad-image.jpg', 'image', LICENSE.kontext);
      return { assetId: a.id, method: 'kontext', notes, prompt };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      if (isQuota((e as Error).message)) { markGpuOff((e as Error).message); notes.push(`โควตา GPU ฟรีวันนี้หมด — ใช้สินค้าจริงไดคัทบนฉากแทนภาพ AI${gpuBackAt() ? ` (ภาพ AI ใช้ได้อีกครั้งประมาณ ${gpuBackAt()} น.)` : ''}`); }
      else notes.push(`ภาพ AI: ${(e as Error).message.slice(0, 80)}`);
    }
  } else notes.push(`โควตา GPU ฟรีหมด — ใช้สินค้าจริงไดคัทบนฉากแทนภาพ AI${gpuBackAt() ? ` (ภาพ AI ใช้ได้อีกครั้งประมาณ ${gpuBackAt()} น.)` : ''}`);
  onStage('กำลังไดคัทสินค้า…');
  let prod: HTMLCanvasElement | null = null;
  try { prod = await timeout(cutout(await shrink(src.blob), onStage).then(trimmed), 45000, 'ไดคัทช้าเกินไป'); }
  catch (e) { notes.push(`ไดคัท: ${(e as Error).message.slice(0, 60)}`); }
  const kinds: FrameKind[] = ['hero', 'lifestyle', 'closeup'];
  const r = await compositeFrame(p, src.blob, prod, kinds[variant % kinds.length], variant, sceneText, notes, onStage, signal);
  const a = await putAsset(r.blob, 'ad-image.jpg', 'image', LICENSE[r.method]);
  return { assetId: a.id, method: r.method, notes, prompt };
}

// =====================================================================================
// STORYBOARD (6 panels, 9:16): made automatically, or split from a sheet the owner made in ChatGPT.
export const BOARD_URL = 'https://oioulxjjeqdxsofhudnl.supabase.co/functions/v1/ad-studio-board';

async function boardCall(body: object, signal?: AbortSignal) {
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(BOARD_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return d;
    last = d.error || `HTTP ${r.status}`;
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error(last);
}
const tags = (h: unknown) => (Array.isArray(h) ? h : []).slice(0, 4).map((x) => String(x)).map((x) => (x.startsWith('#') ? x : `#${x.replace(/\s+/g, '')}`));

/** AI director: 6-panel Thai storyboard written only from the label/product facts. */
export async function requestBoardPlan(product: ProductInfo, imageId: string, signal?: AbortSignal): Promise<FlowPlan> {
  const a = await getAsset(imageId);
  const image = a ? await b64(await toBlob(await fit(a.blob, 1024), 'image/jpeg', 0.88)) : undefined;
  const d = await boardCall({ action: 'plan', panels: 6, image, product: {
    name: product.name, brand: product.brand, category: product.category, description: product.description,
    features: product.features, price: product.price,
  } }, signal);
  const pl = d.plan;
  return {
    hook: pl.hook || '', cta: pl.cta || '', caption: String(pl.caption || ''), hashtags: tags(pl.hashtags), model: d.model, createdAt: Date.now(),
    palette: Array.isArray(pl.palette) ? pl.palette.filter((c: unknown) => /^#[0-9a-f]{6}$/i.test(String(c))).slice(0, 2) : undefined,
    shots: (pl.panels as Record<string, unknown>[]).map((x): FlowShot => ({
      type: String(x.role || 'feature'), method: 'frames', image_prompt: String(x.bg || ''), veo_prompt: String(x.motion || 'Slow cinematic push-in.'),
      voice_th: String(x.voice || ''), headline: String(x.headline || ''), product: !!x.product,
    })),
  };
}

async function fit(blob: Blob, max: number) {
  const bmp = await bitmap(blob);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = canvas(Math.round(bmp.width * r), Math.round(bmp.height * r));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return c;
}

/**
 * Free text-to-image backdrop (Pollinations) — no key, no GPU quota. The corner logo is cropped away later.
 * Fetched through our server (the service blocks direct browser calls); it is rate-limited, so callers retry.
 */
async function freeScene(prompt: string, seed: number, viaServer: boolean, signal?: AbortSignal) {
  const full = `${prompt.slice(0, 560)} Photorealistic premium advertising photography, vertical, no text, no letters, no logo, no watermark.`;
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  signal?.addEventListener('abort', stop);
  const t = setTimeout(stop, 60000);
  try {
    const r = viaServer
      ? await fetch(BOARD_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal, body: JSON.stringify({ action: 'scene', seed, prompt: full }) })
      : await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=720&height=1280&nologo=true&seed=${seed}`, { signal: ctl.signal, referrerPolicy: 'origin' });
    if (!r.ok || !r.headers.get('content-type')?.startsWith('image')) throw new Error(`ฉาก AI ${r.status}`);
    return await bitmap(await r.blob());
  } finally { clearTimeout(t); signal?.removeEventListener('abort', stop); }
}

function paletteBg(x: CanvasRenderingContext2D, pal: string[] | undefined, i: number) {
  const [a, b] = pal?.length === 2 ? pal : ['#2563eb', '#93c5fd'];
  const g = x.createLinearGradient(0, 0, i % 2 ? W : 0, H); g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, b); g.addColorStop(1, a);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  bokeh(x, i + 5, '255,255,255');
}

/** Builds one 9:16 frame per panel. Product panels use the REAL product (cut-out); scenes come from free AI. */
export async function makeBoardFrames(p: Project, variant: number, onStage: (s: string, v: number) => void, signal?: AbortSignal) {
  const plan = p.flow!;
  const src = await getAsset(p.images.find((id) => !plan.shots.some((s) => s.frame === id)) ?? p.images[0]);
  if (!src) throw new Error('ไม่พบรูปสินค้า');
  const notes: string[] = [];
  let prod: HTMLCanvasElement | null = null;
  onStage('กำลังไดคัทสินค้า…', 0.22);
  try { prod = await timeout(cutout(await shrink(src.blob), (t) => onStage(t, 0.22)).then(trimmed), 60000, 'ไดคัทช้าเกินไป'); }
  catch (e) { notes.push(`ไดคัท: ${(e as Error).message.slice(0, 60)} — ใช้รูปเดิมแทน`); }
  const n = plan.shots.length;
  let aiFail = 0, missed = 0;
  for (let i = 0; i < n; i++) {
    const s = plan.shots[i];
    onStage(`AI กำลังวาดสตอรี่บอร์ด ช่อง ${i + 1}/${n}…`, 0.25 + (i / n) * 0.15);
    const c = canvas(); const x = c.getContext('2d')!;
    let ai = false;
    if (aiFail < 3 && s.image_prompt) {
      // the free image service allows roughly one picture every few seconds → retry politely
      for (let attempt = 0; attempt < 3 && !ai; attempt++) {
        try {
          if (i > 0 || attempt > 0) await new Promise((res) => setTimeout(res, attempt ? 3000 : 1500));
          const bmp = await freeScene(s.image_prompt, 1000 * (variant + 1) + i + attempt * 37, true, signal);
          const sc = Math.max(W / bmp.width, H / bmp.height) * 1.08; // zoom a little: crops the provider's corner logo
          x.drawImage(bmp, (W - bmp.width * sc) / 2, 0, bmp.width * sc, bmp.height * sc);
          bmp.close?.(); ai = true;
        } catch {
          if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
        }
      }
      aiFail = ai ? 0 : aiFail + 1;
      if (!ai) missed++;
    }
    if (!ai) paletteBg(x, plan.palette, i);
    if (s.product || !ai) { // no scene available → show the real product instead of an empty frame
      if (prod) placeProduct(x, prod, H * 0.86, false);
      else {
        const bmp = await bitmap(src.blob);
        const s2 = Math.min(W * 0.72 / bmp.width, H * 0.5 / bmp.height);
        const w = bmp.width * s2, h = bmp.height * s2, px = (W - w) / 2, py = H * 0.84 - h;
        x.save(); x.beginPath(); x.roundRect(px, py, w, h, 36); x.clip(); x.drawImage(bmp, px, py, w, h); x.restore();
        bmp.close?.();
      }
    }
    const a = await putAsset(await toBlob(c), `storyboard-${i + 1}.jpg`, 'image',
      `สตอรี่บอร์ด: ${ai ? 'ฉาก AI ฟรี (Pollinations FLUX)' : 'ฉากที่แอปออกแบบ'}${s.product ? ' + สินค้าจริงของคุณ (ไดคัท)' : ''}`);
    s.frame = a.id; s.clip = null;
  }
  if (missed) notes.push('ฉาก AI บางช่องสร้างไม่ได้ — ใช้พื้นหลังสีแบรนด์แทน (กด "สร้างใหม่" เพื่อลองอีกครั้ง)');
  return notes;
}

/** Splits a storyboard sheet the owner made elsewhere (e.g. ChatGPT) into 9:16 frames + Thai voice lines. */
export async function splitBoard(sheetId: string, onStage: (s: string) => void, signal?: AbortSignal) {
  const a = await getAsset(sheetId);
  if (!a) throw new Error('ไม่พบภาพสตอรี่บอร์ด');
  onStage('AI กำลังอ่านสตอรี่บอร์ดและแยกช่อง…');
  const small = await fit(a.blob, 1280);
  const d = await boardCall({ action: 'split', mime: 'image/jpeg', image: await b64(await toBlob(small, 'image/jpeg', 0.9)) }, signal);
  const bd = d.board;
  const full = await bitmap(a.blob);
  const shots: FlowShot[] = [];
  for (const [i, pn] of (bd.panels as Record<string, unknown>[]).entries()) {
    const bx = pn.box_2d as number[];
    if (!Array.isArray(bx) || bx.length !== 4) continue;
    const sx = Math.max(0, bx[1] / 1000 * full.width), sy = Math.max(0, bx[0] / 1000 * full.height);
    const sw = Math.min(full.width - sx, (bx[3] - bx[1]) / 1000 * full.width), sh = Math.min(full.height - sy, (bx[2] - bx[0]) / 1000 * full.height);
    if (sw < 40 || sh < 40) continue;
    onStage(`กำลังจัดช่อง ${i + 1} เป็น 9:16…`);
    const c = canvas(); const x = c.getContext('2d')!;
    // blurred, enlarged panel fills the frame; the sharp panel sits in the middle
    const cs = Math.max(W / sw, H / sh);
    x.filter = 'blur(40px) brightness(0.85)';
    x.drawImage(full, sx, sy, sw, sh, (W - sw * cs) / 2 - 40, (H - sh * cs) / 2 - 40, sw * cs + 80, sh * cs + 80);
    x.filter = 'none';
    const fs = W / sw, fh = sh * fs, fy = (H - fh) / 2;
    x.save(); x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 60; x.fillStyle = '#000'; x.fillRect(0, fy, W, fh); x.restore();
    x.imageSmoothingQuality = 'high';
    x.drawImage(full, sx, sy, sw, sh, 0, fy, W, fh);
    const asset = await putAsset(await toBlob(c), `storyboard-${i + 1}.jpg`, 'image', 'สตอรี่บอร์ดที่คุณอัปโหลด (ตัดแยกช่องโดยแอป)');
    shots.push({ type: String(pn.title || `panel ${i + 1}`), method: 'frames', image_prompt: '', veo_prompt: String(pn.motion || 'Slow push-in.'), voice_th: String(pn.voice || ''), headline: String(pn.text || ''), frame: asset.id });
  }
  full.close?.();
  if (!shots.length) throw new Error('แยกช่องสตอรี่บอร์ดไม่สำเร็จ');
  const plan: FlowPlan = { hook: bd.hook || '', cta: bd.cta || '', caption: String(bd.caption || ''), hashtags: tags(bd.hashtags), shots, model: d.model, createdAt: Date.now(), baked: true };
  return { plan, name: [bd.brand, bd.product].filter(Boolean).join(' ').trim() || 'สินค้า' };
}
