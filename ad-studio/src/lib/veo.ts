// Veo 3.1 via the Gemini API — the same model as Google Flow, fully automatic, PAID per second.
// The key stays server-side (edge function ad-studio-veo). The app always shows the price and asks before spending.
import { getAsset, putAsset } from './db';
import type { FlowShot } from './types';

export const VEO_URL = 'https://oioulxjjeqdxsofhudnl.supabase.co/functions/v1/ad-studio-veo';
export const VEO_SECONDS = 8;
export const THB_PER_USD = 33; // rough, display only

/** USD per second at 720p (Gemini API price list, Sep 2026). */
export function pricePerSecond(model: string) {
  if (/lite/i.test(model)) return 0.05;
  if (/fast/i.test(model)) return 0.10;
  return 0.40;
}
export function estimateCost(model: string, clips: number, seconds = VEO_SECONDS) {
  const usd = pricePerSecond(model) * seconds * clips;
  return { usd, thb: Math.round(usd * THB_PER_USD) };
}
export const fmtCost = (c: { usd: number; thb: number }) => `$${c.usd.toFixed(2)} (~฿${c.thb})`;

export interface VeoStatus { ready: boolean; models: string[]; hint?: string }
export async function veoStatus(): Promise<VeoStatus> {
  const r = await fetch(VEO_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'status' }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return { ready: !!d.ready, models: d.models ?? [], hint: d.hint };
}

async function b64(blob: Blob, max = 1280) {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Generate one Veo clip from the product photo + prompt. Billable: call only after the owner approved the cost. */
export async function generateVeoClip(prompt: string, imageId: string, model: string, onTick?: (sec: number) => void, signal?: AbortSignal): Promise<Blob> {
  const a = await getAsset(imageId);
  const image = a ? await b64(a.blob) : undefined;
  const r = await fetch(VEO_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify({ action: 'start', prompt, image, model, seconds: VEO_SECONDS }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.op) throw new Error(d.error || `HTTP ${r.status}`);
  const t0 = Date.now();
  for (;;) {
    await sleep(10000);
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    onTick?.(Math.round((Date.now() - t0) / 1000));
    if (Date.now() - t0 > 8 * 60_000) throw new Error('Veo ใช้เวลานานเกิน 8 นาที');
    const p = await fetch(VEO_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify({ action: 'poll', op: d.op }) });
    if ((p.headers.get('content-type') || '').includes('video')) return p.blob();
    const x = await p.json().catch(() => ({}));
    if (!p.ok) throw new Error(x.error || `HTTP ${p.status}`);
  }
}

/** Generate every missing shot's clip; saves each as an asset as soon as it arrives. */
export async function generateFlowClips(
  shots: FlowShot[], imageId: string, model: string,
  onShot: (i: number, assetId: string) => void, onStage: (s: string) => void, signal?: AbortSignal,
) {
  for (let i = 0; i < shots.length; i++) {
    if (shots[i].clip) continue;
    onStage(`Veo กำลังสร้างช็อต ${i + 1}/${shots.length}…`);
    const blob = await generateVeoClip(shots[i].veo_prompt, imageId, model, (s) => onStage(`Veo กำลังสร้างช็อต ${i + 1}/${shots.length}… ${s} วิ`), signal);
    const asset = await putAsset(blob, `veo-shot${i + 1}.mp4`, 'video', `Veo 3.1 API (${model}) — สร้างอัตโนมัติ`);
    onShot(i, asset.id);
  }
}
