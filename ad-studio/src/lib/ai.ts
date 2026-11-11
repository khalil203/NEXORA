// External AI adapter: product analysis via the owner's Supabase Edge Function.
// API keys live only on the server. The app sends a studio passcode set by the owner.
import { getAsset } from './db';
import { getSettings } from './settings';
import type { CategoryId, ProductInfo } from './types';

export const DEFAULT_AI_URL = 'https://oioulxjjeqdxsofhudnl.supabase.co/functions/v1/ad-studio-analyze';

export interface AiResult {
  name: string;
  brand: string;
  category: CategoryId;
  description: string;
  features: string[];
  audience: string;
  label_text?: string;
  price_hint?: string;
  confidence?: 'high' | 'medium' | 'low';
  notes?: string;
  sources: { title: string; url: string }[];
  provider: string;
}

export function aiReady() {
  const s = getSettings();
  return s.aiOn;
}

async function call(body: unknown) {
  const s = getSettings();
  const r = await fetch(s.aiUrl || DEFAULT_AI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(s.aiPass ? { 'x-studio-pass': s.aiPass } : {}) },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({ error: `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${r.status})` }));
  if (!r.ok || data.error) throw new Error(data.error || `ผิดพลาด ${r.status}`);
  return data;
}

export async function pingAi(): Promise<{ gemini: boolean; groq: boolean }> {
  return (await call({ ping: true })).providers;
}

async function toJpegB64(blob: Blob, max = 1024) {
  const bmp = await createImageBitmap(blob);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * r);
  c.height = Math.round(bmp.height * r);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const url = c.toDataURL('image/jpeg', 0.85);
  return url.slice(url.indexOf(',') + 1);
}

export async function analyzeProduct(imageIds: string[]): Promise<AiResult> {
  if (!navigator.onLine) throw new Error('ไม่มีอินเทอร์เน็ต — AI วิเคราะห์ต้องออนไลน์');
  const images = [];
  for (const id of imageIds.slice(0, 3)) {
    const a = await getAsset(id);
    if (a) images.push({ mime: 'image/jpeg', data: await toJpegB64(a.blob) });
  }
  if (!images.length) throw new Error('ไม่พบรูปสินค้า');
  return call({ images });
}

/** Merge AI result into the product form (keeps the user's own price/promo/url). */
export function applyAi(p: ProductInfo, r: AiResult): ProductInfo {
  return {
    ...p,
    name: r.name || p.name,
    brand: r.brand || p.brand,
    category: r.category || p.category,
    description: r.description || p.description,
    features: (r.features ?? []).filter(Boolean).join('\n') || p.features,
    audience: r.audience || p.audience,
    ai: {
      provider: r.provider,
      sources: r.sources ?? [],
      confidence: r.confidence,
      notes: r.notes,
      labelText: r.label_text,
      priceHint: r.price_hint,
      at: Date.now(),
    },
  };
}
