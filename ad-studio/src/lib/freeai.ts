// FREE pro engine: AI director script (Gemini) → LTX-2.3 clips (Wan 2.2 fallback) on Hugging Face ZeroGPU
// → Thai voice-over per shot (Gemini TTS) → assembled ad. Nothing here is paid.
import { decodeAsset } from '../engine/audio';
import { AI_VIDEO_URL } from './aivideo';
import { getAsset, putAsset } from './db';
import type { CategoryId, FlowShot, Project } from './types';

export const TTS_URL = 'https://oioulxjjeqdxsofhudnl.supabase.co/functions/v1/ad-studio-tts';

async function jpeg(blob: Blob, max = 832) {
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

/** Scene description for LTX: the Veo prompt without the spoken Thai line / audio notes (voice is added separately). */
export function scenePrompt(s: FlowShot) {
  return s.veo_prompt
    .replace(/A warm Thai[^"]*"[^"]*"\.?/gi, '')
    .replace(/(voice-?over|narrat\w*|says?)[^.]*"[^"]*"\.?/gi, '')
    .replace(/AUDIO:[^.]*\.?/gi, '')
    .replace(/"[^"]*[฀-๿][^"]*"/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const isQuota = (m: string) => /ZeroGPU|quota|โควตา|ไม่ว่าง|exceeded/i.test(m);

// Remember when the free GPU quota ran out so we don't waste time asking again for a while.
const GPU_KEY = 'ads.gpuOffUntil';
export function gpuOff() { try { return Date.now() < Number(localStorage.getItem(GPU_KEY) || 0); } catch { return false; } }
/** Remembers the quota is out. If the error says "Try again in H:MM:SS" we wait exactly that long, else 2 h. */
export function markGpuOff(msg = '') {
  const m = /again in (\d+):(\d+):(\d+)/i.exec(msg);
  const ms = m ? ((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + 60) * 1000 : 2 * 3600_000;
  try { localStorage.setItem(GPU_KEY, String(Date.now() + ms)); } catch { /* ignore */ }
}
/** "HH:MM" local time when the free GPU quota is expected back, or '' if unknown/available. */
export function gpuBackAt() {
  try { const t = Number(localStorage.getItem(GPU_KEY) || 0); return t > Date.now() ? new Date(t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''; } catch { return ''; }
}
export function clearGpuOff() { try { localStorage.removeItem(GPU_KEY); } catch { /* ignore */ } }

export async function createShotClip(imageId: string, shot: FlowShot, signal?: AbortSignal) {
  const a = await getAsset(imageId);
  if (!a) throw new Error('ไม่พบรูป');
  const r = await fetch(AI_VIDEO_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal,
    body: JSON.stringify({ image: await jpeg(a.blob), engine: 'auto', scene: scenePrompt(shot), seconds: 5 }),
  });
  if (!r.ok || !r.headers.get('content-type')?.includes('video')) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `วิดีโอ AI ผิดพลาด (${r.status})`);
  }
  const space = r.headers.get('x-ai-space') ?? 'Hugging Face';
  const model = /ltx/i.test(space) ? 'LTX-2.3' : 'Wan 2.2';
  return putAsset(await r.blob(), `${model}-shot.mp4`, 'video', `AI ฟรี: ${model} (${space}) — สร้างจากรูปสินค้าของคุณ`);
}

export async function createVoice(text: string, signal?: AbortSignal) {
  const r = await fetch(TTS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify({ text }) });
  if (!r.ok || !r.headers.get('content-type')?.includes('audio')) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `เสียงพากย์ผิดพลาด (${r.status})`);
  }
  return putAsset(await r.blob(), 'voice-th.wav', 'audio', `เสียงพากย์ AI: Gemini TTS (${r.headers.get('x-tts-model') ?? 'Gemini'})`);
}

/**
 * Fills p.flow.shots[].clip / .voice for free. Stops asking for video after the first quota error
 * (remaining shots use the product photo with motion). Returns notes for the owner.
 */
export async function makeFreeAssets(p: Project, _category: CategoryId, onStage: (s: string, v: number) => void, signal?: AbortSignal, maxClips = 99) {
  const shots = p.flow!.shots;
  const notes: string[] = [];
  let videoOff = gpuOff() || maxClips <= 0;
  let made = 0;
  if (videoOff && maxClips > 0) notes.push(`โควตา GPU ฟรีหมด — วิดีโอใช้ภาพโฆษณาเคลื่อนกล้องแทนคลิป AI${gpuBackAt() ? ` (โควตากลับมาประมาณ ${gpuBackAt()} น.)` : ''}`);
  // all Thai voice lines at once (fast, runs while the videos are generated)
  const voices = Promise.all(shots.map(async (s, i) => {
    if (s.voice || !s.voice_th) return;
    try { s.voice = (await createVoice(s.voice_th, signal)).id; }
    catch (e) { if ((e as Error).name !== 'AbortError') notes.push(`เสียงพากย์ช็อต ${i + 1}: ${(e as Error).message.slice(0, 80)}`); }
  }));
  if (videoOff) onStage('AI กำลังพากย์เสียงไทย…', 0.5);
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (!s.clip && !videoOff) {
      onStage(`AI กำลังสร้างวิดีโอ LTX-2.3 ช็อต ${i + 1}/${shots.length} (~1 นาที)`, 0.3 + ((i + 0.5) / shots.length) * 0.4);
      try { s.clip = (await createShotClip(s.frame ?? p.images[0], s, signal)).id; if (++made >= maxClips) videoOff = true; }
      catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        const m = (e as Error).message;
        if (isQuota(m)) { videoOff = true; markGpuOff(m); notes.push('โควตา GPU ฟรีวันนี้หมด — ช็อตที่เหลือใช้ภาพสินค้าเคลื่อนไหวแทน (โควตากลับมาเองภายใน 24 ชม.)'); }
        else notes.push(`วิดีโอช็อต ${i + 1}: ${m.slice(0, 80)}`);
      }
    }
  }
  await voices;
  return notes;
}

export async function voiceDurations(shots: FlowShot[]) {
  return Promise.all(shots.map(async (s) => (s.voice ? (await decodeAsset(s.voice).catch(() => null))?.duration ?? 0 : 0)));
}
