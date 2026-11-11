// Google Flow (Veo 3.1) workflow. Flow has no API, so the app prepares everything
// (AI director prompts + Thai voice lines), the owner generates each clip in Flow,
// imports the clips back, and the app assembles the finished ad.
import { getAsset, uid } from './db';
import { featureList, generateCaptions, MOOD_FOR_STYLE } from './marketing';
import { PRO_URL } from './pro';
import { getSettings } from './settings';
import { LOOKS, textStyle } from './storyboard';
import type { BrandKit, FlowPlan, FlowShot, Project, ProductInfo, Scene, TextLayer } from './types';
import type { ClipSource } from '../engine/renderer';

export const FLOW_URL = 'https://labs.google/fx/tools/flow';

async function b64(blob: Blob, max = 768) {
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

function facts(p: ProductInfo) {
  return [
    `ชื่อ: ${p.name}`, p.brand && `แบรนด์: ${p.brand}`, `หมวด: ${p.category}`, p.description && `คำอธิบาย: ${p.description}`,
    featureList(p).length ? `จุดเด่น (ยืนยันแล้ว): ${featureList(p).join(', ')}` : '', p.price && `ราคา: ${p.price} บาท`, p.promo && `โปรโมชั่น: ${p.promo}`,
    p.audience && `กลุ่มเป้าหมาย: ${p.audience}`,
  ].filter(Boolean).join('\n');
}

/** Clean up what the model returns so every shot has a usable Veo prompt with the Thai line in it. */
export function normalizeShot(s: Partial<FlowShot>, i: number, n: number): FlowShot {
  const voice = (s.voice_th || '').trim();
  let veo = (s.veo_prompt || '').trim();
  if (!veo) {
    veo = `Premium vertical 9:16 commercial shot of the exact product from the reference photo (label, logo and colors unchanged, product does not deform). ${i === 0 ? 'Studio hero shot, soft key light, slow cinematic dolly-in.' : i === n - 1 ? 'Clean elegant end frame, product centered, gentle light sweep, slow push-in.' : 'Realistic lifestyle setting that fits the product, natural light, smooth handheld-style camera.'} Shallow depth of field, photorealistic. AUDIO: soft modern background music and subtle ambience.`;
  }
  veo = veo.replace(/["“]?<voice_th>["”]?/g, voice ? `"${voice}"` : '');
  if (voice && !veo.includes(voice)) veo += ` A warm Thai female voice-over says in Thai: "${voice}"`;
  if (!/no (on-screen )?text|no subtitles/i.test(veo)) veo += ' No on-screen text, no subtitles.';
  return {
    type: s.type || (i === 0 ? 'hero' : i === n - 1 ? 'cta' : 'lifestyle'),
    method: s.method === 'ingredients' ? 'ingredients' : 'frames',
    image_prompt: s.image_prompt || '',
    veo_prompt: veo,
    voice_th: voice,
    headline: (s.headline || '').trim(),
    clip: s.clip ?? null,
  };
}

export async function requestFlowPlan(p: ProductInfo, imageId: string, shots = 3, signal?: AbortSignal): Promise<FlowPlan> {
  const a = await getAsset(imageId);
  const image = a ? await b64(a.blob) : undefined;
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(PRO_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal,
      body: JSON.stringify({ action: 'plan', mode: 'flow', product: facts(p), image, shots, useClaude: getSettings().useClaude }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.plan?.shots?.length) {
      const raw = d.plan.shots as Partial<FlowShot>[];
      return {
        hook: d.plan.hook || '', cta: d.plan.cta || '', caption: String(d.plan.caption || '').replace(/(^|\s)#[^\s#]+/g, '').replace(/\n{3,}/g, '\n\n').trim(),
        hashtags: (d.plan.hashtags || []).slice(0, 4).map((h: string) => (h.startsWith('#') ? h : `#${h}`)),
        shots: raw.map((s, i) => normalizeShot(s, i, raw.length)), model: d.model, createdAt: Date.now(),
      };
    }
    last = d.error || `HTTP ${r.status}`;
    await new Promise((res) => setTimeout(res, 8000));
  }
  throw new Error(last);
}

/**
 * Build the finished cinematic ad. Flow/Veo: one scene per imported clip (their Thai audio is kept).
 * free: every shot becomes a scene — AI clip when available, otherwise the product photo with motion —
 * with the Thai voice-over line (Gemini TTS) on top and app music ducked under the voice.
 */
export function assembleFlowAd(d: Project, clipInfo: (ClipSource | null)[], kit: BrandKit | null, opts: { free?: boolean; voiceDur?: number[] } = {}) {
  const plan = d.flow!;
  const look = LOOKS[d.style];
  const font = kit?.font || 'Prompt';
  const used = plan.shots.map((s, i) => ({ s, i, c: clipInfo[i] ?? null }))
    .filter((x) => opts.free || (x.s.clip && x.c));
  const withClip = used.filter((x) => x.s.clip && x.c);
  d.aiClips = withClip.map((x) => x.s.clip!) as string[];
  const cine = (text: string, y: number, size: number): TextLayer => ({
    id: uid(), text, x: 0.5, y, anim: 'fade-up',
    style: { ...textStyle(look, 'bold', size, font), preset: 'cine', color: '#ffffff', color2: undefined, bg: undefined, weight: 700 },
  });
  const cams: Scene['camera'][] = ['zoom-in', 'float', 'pan-left', 'zoom-out'];
  d.scenes = used.map(({ s, i, c }, k): Scene => {
    const last = k === used.length - 1;
    const texts: TextLayer[] = [];
    if (plan.baked) { /* text is already in the storyboard panel */ }
    else if (k === 0 && plan.hook) texts.push(cine(plan.hook, 0.13, 0.066));
    else if (s.headline && !last) texts.push(cine(s.headline, 0.82, 0.06));
    if (last && !plan.baked) {
      if (s.headline) texts.push(cine(s.headline, 0.14, 0.062));
      const cta = cine(plan.cta || kit?.cta || 'ดูรายละเอียดเพิ่มเติม', 0.8, 0.056);
      cta.style = { ...cta.style, preset: 'label', bg: '#ffffff', color: '#111111' };
      texts.push(cta);
    }
    const clipIdx = c && s.clip ? withClip.findIndex((x) => x.i === i) : -1;
    const vd = opts.voiceDur?.[i] ?? 0;
    const base = clipIdx >= 0 ? Math.min(c!.duration, 8) : 3.5;
    const duration = Math.round(Math.min(8, Math.max(base, vd ? vd + 0.6 : 0)) * 10) / 10;
    return {
      id: uid(), kind: k === 0 ? 'hook' : last ? 'cta' : 'benefit',
      duration, imageIndex: s.frame && d.images.includes(s.frame) ? d.images.indexOf(s.frame) : Math.min(k, Math.max(0, d.images.length - 1)),
      background: clipIdx >= 0 ? { type: 'solid', colors: ['#000000', '#000000'] } : { type: 'blur', colors: look.bg[k % look.bg.length] },
      camera: clipIdx >= 0 ? 'static' : plan.baked ? (k % 2 ? 'zoom-out' : 'zoom-in') : cams[k % cams.length],
      product: clipIdx >= 0 ? { x: 0.5, y: 0.5, scale: 1, mode: 'ai', clip: clipIdx } : { x: 0.5, y: 0.47, scale: 0.78, mode: 'full', clean: !!plan.baked },
      effects: { particles: clipIdx < 0 && !plan.baked && !!s.product, rays: false, glow: false, spotlight: false },
      texts,
      elements: last && d.product.price ? [{ id: uid(), type: 'price', x: 0.5, y: 0.9, scale: 0.085, color: look.accent, text: `฿${d.product.price.replace(/[^\d,.]/g, '')}` }] : [],
      transition: k === 0 ? 'none' : 'fade',
      sfx: null,
      voice: opts.free ? s.voice ?? null : null,
    };
  });
  d.audio = opts.free
    // free: soft app music under the Thai voice-over, keep a little of the clip's ambience
    ? { ...d.audio, music: `gen:${MOOD_FOR_STYLE[d.style]}`, musicVolume: 0.5, clipVolume: 0.35, voiceVolume: 1, sfxVolume: 0 }
    // Veo already made music + Thai voice; keep it, no extra app music by default
    : { ...d.audio, music: null, clipVolume: 1, sfxVolume: 0 };
  d.captions = generateCaptions(d.product, d.style, d.strategy);
  if (plan.caption) { d.captions.tiktok = plan.caption; d.captions.instagram = plan.caption; d.captions.facebook = plan.caption; d.captions.youtube = plan.caption; }
  if (plan.hashtags.length) d.captions.hashtags = plan.hashtags.slice(0, 4);
  d.status = 'ready';
}
