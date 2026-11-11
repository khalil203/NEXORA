// Free AI image-to-video (Wan 2.2 on Hugging Face ZeroGPU) via the owner's Supabase function.
import { getAsset, putAsset } from './db';
import type { CategoryId, Scene } from './types';

export const AI_VIDEO_URL = 'https://oioulxjjeqdxsofhudnl.supabase.co/functions/v1/ad-studio-video';

const STYLE_HINT: Partial<Record<CategoryId, string>> = {
  luxury: 'Warm golden rim light, dark elegant backdrop with soft bokeh.',
  beauty: 'Soft pastel pink light, dreamy glow, gentle shimmer particles.',
  food: 'Warm appetizing light, gentle steam or fresh mood, cozy atmosphere.',
  tech: 'Cool blue neon rim light, futuristic glossy reflections.',
  fashion: 'Editorial fashion lighting, soft shadows, stylish mood.',
  health: 'Fresh bright natural daylight, clean and healthy mood.',
  home: 'Cozy warm home lighting, calm atmosphere.',
};

async function toJpegB64(blob: Blob, max = 832) {
  const bmp = await createImageBitmap(blob);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const u = c.toDataURL('image/jpeg', 0.88);
  return u.slice(u.indexOf(',') + 1);
}

/** Generates a ~3.5s AI clip from a product photo; stores it as an asset. ~1 minute. */
export async function createAiClip(imageId: string, category: CategoryId, signal?: AbortSignal) {
  if (!navigator.onLine) throw new Error('ไม่มีอินเทอร์เน็ต');
  const a = await getAsset(imageId);
  if (!a) throw new Error('ไม่พบรูป');
  const r = await fetch(AI_VIDEO_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: await toJpegB64(a.blob), prompt: STYLE_HINT[category] ?? '', seconds: 3.5 }),
    signal,
  });
  if (!r.ok || !r.headers.get('content-type')?.includes('video')) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `วิดีโอ AI ผิดพลาด (${r.status})`);
  }
  const blob = await r.blob();
  return putAsset(blob, 'ai-clip.mp4', 'video', `AI: Wan 2.2 (${r.headers.get('x-ai-space') ?? 'Hugging Face'}) — สร้างจากรูปสินค้าของคุณ`);
}

import type { ClipSource } from '../engine/renderer';
export type { ClipSource };

/** A muted <video> per clip; the renderer seeks/draws it, audio is mixed separately. */
export async function videoFromBlob(blob: Blob): Promise<ClipSource> {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
  v.src = URL.createObjectURL(blob);
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error('อ่านไฟล์วิดีโอไม่ได้ (รองรับ MP4/WebM)'));
  });
  const hasAudio = (v as HTMLVideoElement & { mozHasAudio?: boolean; webkitAudioDecodedByteCount?: number; audioTracks?: { length: number } }).audioTracks?.length !== 0;
  return { video: v, duration: v.duration || 8, hasAudio };
}

const clipCache = new Map<string, Promise<ClipSource | null>>();
export function loadClip(id: string) {
  if (!clipCache.has(id)) {
    clipCache.set(id, (async () => {
      const a = await getAsset(id);
      return a ? videoFromBlob(a.blob).catch(() => null) : null;
    })());
  }
  return clipCache.get(id)!;
}
/** Keeps index positions (a missing clip stays null so scene.product.clip indices still match). */
export async function loadClips(ids: string[] | undefined): Promise<(ClipSource | null)[]> {
  if (!ids?.length) return [];
  return Promise.all(ids.map(loadClip));
}

/** Put the AI clip on the attention scenes; keep real-photo scenes where the label must be exact.
 *  Text on top of moving footage gets a solid label so it always stays readable. */
export function applyClipScenes(scenes: Scene[]) {
  const pick = [scenes.find((s) => s.kind === 'hook'), scenes.find((s) => s.kind === 'benefit') ?? scenes.find((s) => s.kind === 'promo')];
  for (const sc of pick) {
    if (!sc) continue;
    sc.product.mode = 'ai';
    sc.texts.forEach((t, i) => {
      t.style = { ...t.style, preset: 'label', bg: '#ffffff', color: '#141414', color2: undefined, size: Math.min(t.style.size, 0.062) };
      t.y = i === 0 ? 0.11 : Math.max(t.y, 0.82);
    });
  }
}
