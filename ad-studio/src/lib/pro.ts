// "Pro" commercial pipeline: AI director plan (Claude if available, else Gemini) →
// optional AI lifestyle scenes (auto-enabled when a free image-edit model is available) →
// multiple AI video shots (Wan 2.2) → cinematic edit.
import { getAsset, putAsset, uid } from './db';
import { AI_VIDEO_URL } from './aivideo';
import { featureList, generateCaptions, MOOD_FOR_STYLE } from './marketing';
import { getSettings } from './settings';
import { LOOKS, textStyle } from './storyboard';
import type { BrandKit, MusicMood, Project, ProductInfo, Scene, SceneKind, TextLayer } from './types';

export const PRO_URL = 'https://oioulxjjeqdxsofhudnl.supabase.co/functions/v1/ad-studio-pro';

export interface Shot { type: string; scene_prompt: string; motion_prompt: string; headline: string; sub: string; seconds: number }
export interface Plan { hook: string; cta: string; music: string; caption: string; hashtags: string[]; shots: Shot[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function b64(blob: Blob, max = 832) {
  const bmp = await createImageBitmap(blob);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const u = c.toDataURL('image/jpeg', 0.9);
  return u.slice(u.indexOf(',') + 1);
}

export async function proStatus(): Promise<{ claude: boolean; gemini: boolean; hf: boolean }> {
  const r = await fetch(PRO_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ping' }) });
  return r.json();
}

function factsText(p: ProductInfo) {
  return [
    `ชื่อ: ${p.name}`, p.brand && `แบรนด์: ${p.brand}`, `หมวด: ${p.category}`, p.description && `คำอธิบาย: ${p.description}`,
    featureList(p).length ? `จุดเด่น (ยืนยันแล้ว): ${featureList(p).join(', ')}` : '', p.price && `ราคา: ${p.price} บาท`, p.promo && `โปรโมชั่น: ${p.promo}`,
    p.audience && `กลุ่มเป้าหมาย: ${p.audience}`,
  ].filter(Boolean).join('\n');
}

/** Ask the AI director for a shot list. Retries because the free tier is often busy. */
export async function requestPlan(p: ProductInfo, imageId: string, seconds: number, shots = 4, signal?: AbortSignal) {
  const a = await getAsset(imageId);
  const image = a ? await b64(a.blob, 768) : undefined;
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const r = await fetch(PRO_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal,
      body: JSON.stringify({ action: 'plan', product: factsText(p), image, seconds, shots, useClaude: getSettings().useClaude }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.plan?.shots?.length) return { plan: d.plan as Plan, model: d.model as string, fallback: d.fallback as string | undefined };
    last = d.error || `HTTP ${r.status}`;
    await sleep(8000);
  }
  throw new Error(last);
}

let editDisabledUntil = 0;
/** Put the real product into a new scene. Returns null (no error) if the free model is unavailable. */
export async function editScene(imageBlob: Blob, prompt: string, signal?: AbortSignal): Promise<Blob | null> {
  if (!getSettings().aiScenes || Date.now() < editDisabledUntil) return null;
  try {
    const r = await fetch(PRO_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify({ action: 'edit', image: await b64(imageBlob, 1024), prompt }) });
    if (r.ok && r.headers.get('content-type')?.startsWith('image/')) return await r.blob();
  } catch (e) { if ((e as Error).name === 'AbortError') throw e; }
  editDisabledUntil = Date.now() + 30 * 60 * 1000; // skip for 30 min to save time/quota
  return null;
}

/** Wan 2.2 clip from any image + motion prompt. */
export async function clipFromImage(blob: Blob, motion: string, signal?: AbortSignal) {
  const r = await fetch(AI_VIDEO_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify({ image: await b64(blob), prompt: motion, seconds: 3.5 }) });
  if (!r.ok || !r.headers.get('content-type')?.includes('video')) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `วิดีโอ AI ผิดพลาด (${r.status})`);
  }
  return putAsset(await r.blob(), 'ai-shot.mp4', 'video', `AI: Wan 2.2 (${r.headers.get('x-ai-space') ?? 'Hugging Face'})`);
}

const KIND: Record<string, SceneKind> = { hero: 'hook', lifestyle: 'benefit', usage: 'benefit', macro: 'features', cta: 'cta' };

export interface ProAssets { plan: Plan; clips: (string | null)[]; model: string; notes: string[] }

/** Run AI director + scenes + shots for one product. Stops spending quota after the first quota error. */
export async function makeProAssets(p: ProductInfo, imageId: string, seconds: number, onStage: (s: string, v: number) => void, signal?: AbortSignal): Promise<ProAssets> {
  onStage('AI ผู้กำกับกำลังเขียนสคริปต์โฆษณา', 0.06);
  const { plan, model, fallback } = await requestPlan(p, imageId, seconds, 4, signal);
  const notes: string[] = [];
  if (fallback) notes.push(`Claude ใช้ไม่ได้ (${fallback.slice(0, 60)}) จึงใช้ Gemini แทน`);
  const photo = (await getAsset(imageId))!.blob;
  const clips: (string | null)[] = [];
  let quotaOut = false;
  const maxAi = 3; // fits the free daily GPU quota for one ad
  for (let i = 0; i < plan.shots.length; i++) {
    const s = plan.shots[i];
    if (quotaOut || s.type === 'cta' || clips.filter(Boolean).length >= maxAi) { clips.push(null); continue; }
    onStage(`AI กำลังสร้างช็อต ${i + 1}/${plan.shots.length} (~1 นาที)`, 0.08 + (i / plan.shots.length) * 0.07);
    let source = photo;
    if (s.type !== 'hero' && s.type !== 'macro') {
      const edited = await editScene(photo, s.scene_prompt, signal);
      if (edited) { source = edited; await putAsset(edited, 'ai-scene.jpg', 'image', 'AI scene (Qwen-Image-Edit)'); }
    }
    try {
      clips.push((await clipFromImage(source, s.motion_prompt, signal)).id);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      clips.push(null);
      quotaOut = true;
      notes.push(`วิดีโอ AI หยุดที่ช็อต ${i + 1}: ${(e as Error).message.slice(0, 90)}`);
    }
  }
  return { plan, clips, model, notes };
}

/** Build a cinematic project from the plan. */
export function buildProProject(d: Project, a: ProAssets, kit: BrandKit | null) {
  const look = LOOKS[d.style];
  const total = d.duration;
  const raw = a.plan.shots.map((s) => Math.max(1.5, Number(s.seconds) || total / a.plan.shots.length));
  const sum = raw.reduce((x, y) => x + y, 0);
  const durs = raw.map((x) => Math.round((x / sum) * total * 10) / 10);
  durs[durs.length - 1] = Math.round((total - durs.slice(0, -1).reduce((x, y) => x + y, 0)) * 10) / 10;

  d.aiClips = a.clips.filter((c): c is string => !!c);
  const font = kit?.font || 'Prompt';
  const cine = (text: string, y: number, size: number): TextLayer => ({
    id: uid(), text, x: 0.5, y, anim: 'fade-up',
    style: { ...textStyle(look, 'bold', size, font), preset: 'cine', color: '#ffffff', color2: undefined, bg: undefined, weight: 700 },
  });
  d.scenes = a.plan.shots.map((s, i): Scene => {
    const clipId = a.clips[i];
    const clipIndex = clipId ? d.aiClips!.indexOf(clipId) : -1;
    const isCta = s.type === 'cta' || i === a.plan.shots.length - 1;
    const texts: TextLayer[] = [];
    if (i === 0 && a.plan.hook) texts.push(cine(a.plan.hook, 0.14, 0.072));
    else if (s.headline) texts.push(cine(s.headline, isCta ? 0.16 : 0.8, isCta ? 0.07 : 0.064));
    if (s.sub && !isCta) texts.push(cine(s.sub, 0.87, 0.04));
    if (isCta) {
      texts.push(cine(a.plan.cta || kit?.cta || 'ดูรายละเอียดเพิ่มเติม', 0.8, 0.058));
      texts[texts.length - 1].style = { ...texts[texts.length - 1].style, preset: 'label', bg: '#ffffff', color: '#111111' };
    }
    return {
      id: uid(), kind: isCta ? 'cta' : KIND[s.type] ?? 'features', duration: durs[i], imageIndex: 0,
      background: { type: 'blur', colors: look.bg[i % look.bg.length] },
      camera: isCta ? 'float' : 'zoom-in',
      product: clipIndex >= 0 ? { x: 0.5, y: 0.5, scale: 1, mode: 'ai', clip: clipIndex } : isCta ? { x: 0.5, y: 0.45, scale: 0.58, mode: 'card' } : { x: 0.5, y: 0.5, scale: 1, mode: 'full' },
      effects: { particles: isCta, rays: false, glow: isCta, spotlight: isCta },
      texts,
      elements: isCta && d.product.price ? [{ id: uid(), type: 'price', x: 0.5, y: 0.89, scale: 0.09, color: look.accent, text: `฿${d.product.price.replace(/[^\d,.]/g, '')}` }] : [],
      transition: i === 0 ? 'none' : 'fade',
      sfx: i === 0 ? null : i === a.plan.shots.length - 1 ? 'shimmer' : 'whoosh',
    };
  });
  const moods: MusicMood[] = ['elegant', 'upbeat', 'soft', 'electronic', 'trendy', 'cinematic'];
  d.audio.music = `gen:${moods.includes(a.plan.music as MusicMood) ? a.plan.music : MOOD_FOR_STYLE[d.style]}`;
  d.captions = generateCaptions(d.product, d.style, d.strategy);
  if (a.plan.caption) { d.captions.tiktok = a.plan.caption; d.captions.instagram = a.plan.caption; }
  if (a.plan.hashtags?.length) d.captions.hashtags = a.plan.hashtags.slice(0, 4).map((h) => (h.startsWith('#') ? h : `#${h}`));
  d.status = 'ready';
}
