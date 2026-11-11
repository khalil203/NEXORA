// Fully-automatic pipeline: AI analysis → strategy → storyboard → captions → MP4 export.
// Also hosts the batch queue (one video per job) used by the Batch page.
import { mixSoundtrack } from '../engine/audio';
import { exportVideo } from '../engine/exporter';
import { ensureFonts, loadImage, outputSize, type RenderAssets } from '../engine/renderer';
import { aiReady, analyzeProduct, applyAi } from './ai';
import { applyClipScenes, createAiClip, loadClips } from './aivideo';
import { buildProProject, makeProAssets, type ProAssets } from './pro';
import { assembleFlowAd, requestFlowPlan } from './flow';
import { generateFlowClips } from './veo';
import { makeFreeAssets, voiceDurations } from './freeai';
import { makeBoardFrames, preloadCutout, requestBoardPlan, splitBoard } from './adphoto';
import { clearGpuOff } from './freeai';
import { getAsset, getProject, listBrandKits, logActivity, saveProject } from './db';
import { CATEGORIES, generateCaptions, generateStrategy, MOOD_FOR_STYLE, STYLE_LABEL, VERSION_PRESETS } from './marketing';
import { newProject } from './project';
import { getSettings } from './settings';
import { generateStoryboard } from './storyboard';
import type { Aspect, BrandKit, Duration, Project, ProductInfo, StyleId } from './types';

export type StyleChoice = StyleId | 'auto';

export function autoBuild(d: Project, kit: BrandKit | null) {
  buildScenes(d, kit);
  if (d.aiClips?.length) applyClipScenes(d.scenes);
}
function buildScenes(d: Project, kit: BrandKit | null) {
  d.strategy = generateStrategy(d.product, d.style, kit?.cta);
  d.scenes = generateStoryboard({
    product: d.product, strategy: d.strategy, style: d.style, duration: d.duration, imageCount: d.images.length,
    font: kit?.font, brandColors: kit ? [kit.primary, kit.secondary] : undefined,
  });
  d.captions = generateCaptions(d.product, d.style, d.strategy);
  d.status = 'ready';
}

export async function renderProject(p: Project, onProgress: (v: number, stage: string) => void, signal?: AbortSignal) {
  const s = getSettings();
  const images = await Promise.all(p.images.map(async (id) => {
    const a = await getAsset(id);
    return a ? loadImage(a.blob).catch(() => null) : null;
  }));
  let logo = null;
  if (p.brandKitId) {
    const kit = (await listBrandKits()).find((k) => k.id === p.brandKitId);
    const a = kit?.logo ? await getAsset(kit.logo) : null;
    if (a) logo = await loadImage(a.blob).catch(() => null);
  }
  const assets: RenderAssets = { images, logo, clips: await loadClips(p.aiClips) };
  await ensureFonts(p.scenes);
  const audio = await mixSoundtrack(p.scenes, p.audio, p.aiClips);
  const size = outputSize(p.aspect, s.exportRes);
  const r = await exportVideo(p.scenes, assets, audio, { ...size, fps: s.exportFps, quality: s.exportQuality, preferFormat: 'mp4', onProgress, signal });
  p.exports.unshift({ at: Date.now(), format: r.format, width: size.width, height: size.height, fps: s.exportFps, bytes: r.blob.size });
  p.status = 'exported';
  await saveProject(p);
  return r;
}

// ---------------------------------------------------------------- batch queue
export type JobStatus = 'waiting' | 'analyzing' | 'building' | 'rendering' | 'review' | 'completed' | 'failed';
export interface Job {
  id: string;
  group: number;
  label: string;
  style: StyleChoice;
  images: string[];
  status: JobStatus;
  progress: number;
  stage?: string;
  error?: string;
  projectId?: string;
  name?: string;
  blob?: Blob;
  format?: 'mp4' | 'webm';
  note?: string;
  flow?: boolean;
  veo?: boolean;
  adPhoto?: string;
  frames?: string[];
  adMethod?: string;
  adPrompt?: string;
  variant?: number;
  board?: string; // uploaded storyboard sheet (asset id)
  baked?: boolean;
}
export interface BatchOptions { aspect: Aspect; duration: Duration; kitId?: string; autoExport: boolean }

interface State { jobs: Job[]; running: boolean; opts: BatchOptions | null }
const state: State = { jobs: [], running: false, opts: null };
const groupProduct = new Map<number, ProductInfo>();
const groupClip = new Map<number, string | null>();
const groupPro = new Map<number, ProAssets | null>();
const listeners = new Set<() => void>();
let abort: AbortController | null = null;
let wake: { release: () => Promise<void> } | null = null;

const emit = () => listeners.forEach((l) => l());
export const batchState = () => state;
export function subscribeBatch(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const patch = (j: Job, p: Partial<Job>) => { Object.assign(j, p); state.jobs = [...state.jobs]; emit(); };

/** groups: each group = photos of ONE product. versions: videos per product. */
export function startBatch(groups: string[][], versions: number, style: StyleChoice, opts: BatchOptions) {
  const base = state.jobs.length ? Math.max(...state.jobs.map((j) => j.group)) + 1 : 0;
  const styles: StyleChoice[] = versions <= 1 ? [style] : VERSION_PRESETS.slice(0, versions).map((v) => v.style);
  groups.forEach((imgs, gi) => {
    styles.forEach((st, vi) => {
      state.jobs.push({
        id: `${base + gi}-${vi}-${Date.now()}`, group: base + gi, images: imgs, style: st, status: 'waiting', progress: 0,
        label: versions <= 1 ? `วิดีโอ ${base + gi + 1}` : `วิดีโอ ${base + gi + 1} · ${VERSION_PRESETS[vi].label}`,
      });
    });
  });
  state.opts = opts;
  state.jobs = [...state.jobs];
  emit();
  if (getSettings().videoEngine === 'ltx') preloadCutout(); // download the cut-out model while AI analyzes
  run();
}

/** Start from a finished storyboard sheet the owner uploads. */
export function startBoardJob(sheetId: string, opts: BatchOptions) {
  const base = state.jobs.length ? Math.max(...state.jobs.map((j) => j.group)) + 1 : 0;
  state.jobs.push({ id: `${base}-b-${Date.now()}`, group: base, images: [sheetId], style: 'auto', status: 'waiting', progress: 0, label: 'สตอรี่บอร์ดของคุณ', board: sheetId });
  state.opts = opts;
  state.jobs = [...state.jobs];
  emit();
  run();
}

export function retryJob(id: string) {
  const j = state.jobs.find((x) => x.id === id);
  if (!j) return;
  patch(j, { status: 'waiting', error: undefined, progress: 0 });
  run();
}
/** Owner approved the ad image → make the video from it. */
export async function approveJob(id: string) {
  const j = state.jobs.find((x) => x.id === id);
  if (!j?.projectId || j.status !== 'review') return;
  const p = await getProject(j.projectId);
  if (!p?.adPhoto) return;
  p.adPhoto.approved = true;
  await saveProject(p);
  patch(j, { status: 'waiting', stage: undefined });
  run();
}
/** Owner wants a different ad image (tries the AI again even if the quota looked empty). */
export function regenerateJob(id: string) {
  const j = state.jobs.find((x) => x.id === id);
  if (!j || j.status !== 'review') return;
  clearGpuOff();
  patch(j, { status: 'waiting', variant: (j.variant ?? 0) + 1, stage: undefined, note: undefined, frames: undefined });
  run();
}
/** Flow-script jobs whose clips can still be generated with the paid Veo API. */
export async function veoPending() {
  const out: { job: Job; missing: number }[] = [];
  for (const j of state.jobs) {
    if (!j.flow || !j.projectId || j.status !== 'completed') continue;
    const p = await getProject(j.projectId);
    const missing = p?.flow?.shots.filter((s) => !s.clip).length ?? 0;
    if (missing) out.push({ job: j, missing });
  }
  return out;
}

/** PAID: only call after the owner approved the total shown on screen. Generates clips → assembles → renders each ad. */
export async function runVeoBatch(model: string, jobIds: string[]) {
  if (state.running) return;
  state.running = true;
  abort = new AbortController();
  emit();
  try { wake = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { wake = null; }
  const kits = await listBrandKits();
  for (const id of jobIds) {
    const j = state.jobs.find((x) => x.id === id);
    if (!j?.projectId || abort.signal.aborted) continue;
    try {
      const p = await getProject(j.projectId);
      if (!p?.flow) continue;
      patch(j, { status: 'analyzing', progress: 0.05, error: undefined, veo: true });
      const n = p.flow.shots.length;
      let got = p.flow.shots.filter((s) => s.clip).length;
      await generateFlowClips(p.flow.shots, p.images[0], model, async (i, assetId) => {
        p.flow!.shots[i].clip = assetId; got++;
        await saveProject(p);
        patch(j, { progress: 0.05 + 0.6 * (got / n) });
      }, (stage) => patch(j, { stage }), abort.signal);
      await logActivity(`สร้างคลิป Veo อัตโนมัติ (${model}) “${p.product.name}”`, p.id);
      patch(j, { status: 'building', stage: 'ประกอบโฆษณา', progress: 0.66 });
      const ids = p.flow.shots.map((s) => s.clip).filter(Boolean) as string[];
      const clips = await loadClips(ids);
      const kit = kits.find((k) => k.id === p.brandKitId) ?? null;
      if (!p.strategy) p.strategy = generateStrategy(p.product, p.style, kit?.cta);
      assembleFlowAd(p, clips, kit);
      p.name = `${p.product.name || 'สินค้า'} · Veo`;
      await saveProject(p);
      patch(j, { status: 'rendering', stage: 'กำลังเรนเดอร์วิดีโอ', progress: 0.7, name: p.name });
      const r = await renderProject(p, (v, stage) => patch(j, { progress: 0.7 + v * 0.3, stage }), abort.signal);
      patch(j, { status: 'completed', progress: 1, blob: r.blob, format: r.format, flow: false, stage: 'เสร็จแล้ว', note: r.note || 'เสียงพากย์ไทยจาก Veo — ฟังตรวจก่อนโพสต์' });
    } catch (e) {
      const err = e as Error;
      // keep the script + any clips already paid for; the owner can run Veo again for the missing shots only
      patch(j, { status: 'completed', flow: true, progress: 1, error: err.name === 'AbortError' ? 'หยุดโดยผู้ใช้' : `Veo: ${err.message}`, stage: 'คลิปที่สร้างแล้วถูกเก็บไว้' });
    }
  }
  state.running = false;
  await wake?.release().catch(() => {});
  wake = null;
  emit();
}

export function stopBatch() { abort?.abort(); }
export function clearFinished() { state.jobs = state.jobs.filter((j) => !['completed', 'failed'].includes(j.status)); emit(); }

async function run() {
  if (state.running) return;
  state.running = true;
  abort = new AbortController();
  emit();
  try { wake = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { wake = null; }
  const kits = await listBrandKits();
  let j: Job | undefined;
  while ((j = state.jobs.find((x) => x.status === 'waiting')) && !abort.signal.aborted) {
    await runJob(j, kits.find((k) => k.id === state.opts?.kitId) ?? null);
  }
  if (abort.signal.aborted) state.jobs.filter((x) => !['completed', 'failed', 'review'].includes(x.status)).forEach((x) => patch(x, { status: 'failed', error: 'หยุดโดยผู้ใช้' }));
  state.running = false;
  await wake?.release().catch(() => {});
  wake = null;
  emit();
}

/** Shared by auto and uploaded storyboards: build frames → stop for review → (approved) video + voice → render. */
async function freeStage(j: Job, p2: Project, kit: BrandKit | null) {
  const opts = state.opts!;
  const plan = p2.flow!;
  if (!p2.adPhoto?.approved) {
    const notes = plan.baked && plan.shots.every((x) => x.frame) ? []
      : await makeBoardFrames(p2, j.variant ?? 0, (stage, v) => patch(j, { status: 'analyzing', stage, progress: v }), abort?.signal);
    const frames = plan.shots.map((x) => x.frame).filter(Boolean) as string[];
    p2.adPhoto = { assetId: frames[0], method: plan.baked ? 'uploaded' : 'storyboard' };
    await saveProject(p2);
    patch(j, { status: 'review', progress: 0.4, adPhoto: frames[0], frames, baked: !!plan.baked, adMethod: p2.adPhoto.method, stage: 'รอคุณตรวจสตอรี่บอร์ด', note: notes.join(' · ') || undefined });
    return;
  }
  const frames = plan.shots.map((x) => x.frame).filter(Boolean) as string[];
  p2.images = [...frames, ...p2.images.filter((id) => !frames.includes(id))].slice(0, 10);
  patch(j, { note: undefined, status: 'analyzing', stage: 'AI กำลังพากย์เสียงไทย…', progress: 0.45 });
  // panels with baked-in Thai text are not sent to the video AI (it would warp the letters) → camera motion instead
  const notes = await makeFreeAssets(p2, p2.product.category, (stage, v) => { patch(j, { status: 'analyzing', stage, progress: Math.max(0.45, v) }); }, abort?.signal, plan.baked ? 0 : 99);
  await saveProject(p2);
  patch(j, { status: 'building', stage: 'ประกอบโฆษณา', progress: 0.72 });
  const clips = await loadClips(plan.shots.map((x) => x.clip).filter(Boolean) as string[]);
  let k = 0;
  const info = plan.shots.map((x) => (x.clip ? clips[k++] : null));
  if (!p2.strategy) p2.strategy = generateStrategy(p2.product, p2.style, kit?.cta);
  assembleFlowAd(p2, info, kit, { free: true, voiceDur: await voiceDurations(plan.shots) });
  await saveProject(p2);
  await logActivity(`AI สร้างโฆษณาฟรี “${p2.name}”`, p2.id);
  const note = notes.join(' · ') || undefined;
  if (opts.autoExport) {
    patch(j, { status: 'rendering', stage: 'กำลังเรนเดอร์วิดีโอ', progress: 0.75 });
    const r = await renderProject(p2, (v, stage) => patch(j, { progress: 0.75 + v * 0.25, stage }), abort?.signal);
    patch(j, { status: 'completed', progress: 1, blob: r.blob, format: r.format, note: [note, r.note].filter(Boolean).join(' · ') || undefined, stage: 'เสร็จแล้ว' });
  } else patch(j, { status: 'completed', progress: 1, note, stage: 'สร้างโปรเจกต์แล้ว (ยังไม่ส่งออก)' });
}

async function runJob(j: Job, kit: BrandKit | null) {
  const opts = state.opts!;
  try {
    // uploaded storyboard sheet (made by the owner, e.g. in ChatGPT): split → review → video
    if (j.board) {
      let proj = j.projectId ? await getProject(j.projectId) : undefined;
      if (!proj?.flow) {
        patch(j, { status: 'analyzing', stage: 'AI กำลังอ่านสตอรี่บอร์ด', progress: 0.1 });
        const sb = await splitBoard(j.board, (stage) => patch(j, { stage, progress: 0.2 }), abort?.signal);
        proj = newProject('viral', kit);
        proj.aspect = '9:16';
        proj.images = [j.board];
        proj.product = { ...proj.product, name: sb.name };
        proj.flow = sb.plan;
        proj.name = `${sb.name} · สตอรี่บอร์ด`;
        await saveProject(proj);
        patch(j, { projectId: proj.id, name: proj.name });
      }
      await freeStage(j, proj, kit);
      return;
    }
    // 1) analyze once per product group
    let product = groupProduct.get(j.group);
    if (!product) {
      patch(j, { status: 'analyzing', stage: 'AI กำลังอ่านฉลากและค้นข้อมูล', progress: 0.05 });
      if (!aiReady()) throw new Error('ยังไม่ได้เปิด AI อัตโนมัติ (ใส่รหัสสตูดิโอในหน้าสร้างโฆษณา)');
      const base = newProject('viral', kit).product;
      let res;
      try { res = await analyzeProduct(j.images); }
      catch { patch(j, { stage: 'AI ไม่ว่าง กำลังลองใหม่…' }); await new Promise((r) => setTimeout(r, 10000)); res = await analyzeProduct(j.images); }
      product = applyAi(base, res);
      groupProduct.set(j.group, product);
    }
    const opts2 = getSettings();
    // 0a) FREE PRO: AI storyboard (6 panels, 9:16) → owner reviews → video per panel + Thai voice-over → render
    if (opts2.videoEngine === 'ltx') {
      let proj = j.projectId ? await getProject(j.projectId) : undefined;
      if (!proj?.flow) {
        patch(j, { status: 'building', stage: 'AI ผู้กำกับกำลังเขียนสตอรี่บอร์ด', progress: 0.15, name: product.name });
        const fp = await requestBoardPlan(product, j.images[0], abort?.signal);
        const style: StyleId = j.style === 'auto' ? CATEGORIES[product.category].style : j.style;
        proj = newProject(style, kit);
        proj.style = style;
        proj.aspect = '9:16';
        proj.images = j.images.slice(0, 2);
        proj.product = { ...product };
        proj.flow = fp;
        proj.name = `${product.name || 'สินค้า'} · AI ฟรี`;
        await saveProject(proj);
        patch(j, { projectId: proj.id, name: proj.name });
      }
      await freeStage(j, proj, kit);
      return;
    }
    // 0) GOOGLE FLOW: AI director writes Veo prompts; owner generates clips in Flow (no API)
    if (opts2.videoEngine === 'flow' || opts2.videoEngine === 'veo') {
      patch(j, { status: 'building', stage: 'AI ผู้กำกับกำลังเขียนสคริปต์สำหรับ Google Flow', progress: 0.3, name: product.name });
      const fp = await requestFlowPlan(product, j.images[0], 3, abort?.signal);
      const proj = newProject(CATEGORIES[product.category].style, kit);
      proj.style = CATEGORIES[product.category].style;
      proj.aspect = '9:16';
      proj.images = j.images.slice(0, 5);
      proj.product = { ...product };
      proj.flow = fp;
      proj.name = `${product.name || 'สินค้า'} · Google Flow`;
      await saveProject(proj);
      await logActivity(`AI เขียนสคริปต์ Flow “${proj.name}”`, proj.id);
      patch(j, { status: 'completed', progress: 1, projectId: proj.id, name: proj.name, flow: true, stage: 'พร้อมสร้างคลิปใน Google Flow' });
      return;
    }
    // 1a) PRO: AI director + multi-shot AI video, once per product
    let clipNote: string | undefined;
    if (opts2.proMode && opts2.aiClip && !groupPro.has(j.group)) {
      try {
        const pa = await makeProAssets(product, j.images[0], opts.duration, (stage, v) => patch(j, { status: 'analyzing', stage, progress: v }), abort?.signal);
        groupPro.set(j.group, pa);
        if (pa.notes.length) clipNote = pa.notes.join(' · ');
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        groupPro.set(j.group, null);
        clipNote = `โหมดโปรไม่สำเร็จ (${(e as Error).message.slice(0, 100)}) — ใช้โหมดมาตรฐานแทน`;
      }
    }
    const pro = groupPro.get(j.group) ?? null;
    // 1b) standard: one AI clip per product (falls back to photo motion if quota is out)
    if (!pro && opts2.aiClip && !groupClip.has(j.group)) {
      patch(j, { status: 'analyzing', stage: 'AI กำลังสร้างวิดีโอเคลื่อนไหว (~1 นาที)', progress: 0.08 });
      try { groupClip.set(j.group, (await createAiClip(j.images[0], product.category, abort?.signal)).id); }
      catch (e) { groupClip.set(j.group, null); clipNote = `วิดีโอ AI: ${(e as Error).message} — ใช้ภาพเคลื่อนไหวจากรูปแทน`; }
    }
    const clipId = groupClip.get(j.group) ?? null;
    // 2) build project (reuse it on retry)
    let proj = j.projectId ? await getProject(j.projectId) : undefined;
    if (!proj) {
      patch(j, { status: 'building', stage: 'สร้างกลยุทธ์และสตอรี่บอร์ด', progress: 0.12, name: product.name });
      const style: StyleId = j.style === 'auto' ? CATEGORIES[product.category].style : j.style;
      proj = newProject(style, kit);
      proj.style = style;
      proj.aspect = opts.aspect;
      proj.duration = opts.duration;
      proj.images = j.images.slice(0, 5);
      proj.product = { ...product };
      proj.audio.music = `gen:${MOOD_FOR_STYLE[style]}`;
      proj.name = `${product.name || 'สินค้า'} · ${STYLE_LABEL[style]}`;
      if (pro) {
        proj.strategy = generateStrategy(proj.product, proj.style, kit?.cta);
        buildProProject(proj, pro, kit);
        proj.name = `${product.name || 'สินค้า'} · โปร ${STYLE_LABEL[style]}`;
      } else {
        if (clipId) proj.aiClips = [clipId];
        autoBuild(proj, kit);
      }
      await saveProject(proj);
      patch(j, { projectId: proj.id, name: proj.name });
      await logActivity(`AI สร้างวิดีโอ “${proj.name}”`, proj.id);
    }
    // 3) render
    if (opts.autoExport) {
      patch(j, { status: 'rendering', stage: 'กำลังเรนเดอร์วิดีโอ', progress: 0.15 });
      const r = await renderProject(proj, (v, stage) => patch(j, { progress: 0.15 + v * 0.85, stage }), abort?.signal);
      patch(j, { status: 'completed', progress: 1, blob: r.blob, format: r.format, note: [clipNote, r.note].filter(Boolean).join(' · ') || undefined, stage: 'เสร็จแล้ว' });
    } else {
      patch(j, { status: 'completed', progress: 1, note: clipNote, stage: 'สร้างโปรเจกต์แล้ว (ยังไม่ส่งออก)' });
    }
  } catch (e) {
    const err = e as Error;
    patch(j, { status: 'failed', error: err.name === 'AbortError' ? 'หยุดโดยผู้ใช้' : err.message, stage: undefined });
  }
}
