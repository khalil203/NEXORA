// Web Audio engine: procedural (app-generated, royalty-free) music, synthesized
// SFX, and an offline mixer that produces the exact soundtrack used for export.
import { getAsset } from '../lib/db';
import type { AudioSettings, MusicMood, Scene, SfxId } from '../lib/types';

export const SR = 48000;

export const MOODS: { id: MusicMood; label: string; desc: string; bpm: number }[] = [
  { id: 'elegant', label: 'หรูหรา สง่างาม', desc: 'เปียโนและแพดนุ่ม ๆ เหมาะกับสินค้าพรีเมียม', bpm: 76 },
  { id: 'upbeat', label: 'สดใส ร่าเริง', desc: 'จังหวะสนุก อบอุ่น เหมาะกับอาหารและไลฟ์สไตล์', bpm: 112 },
  { id: 'soft', label: 'ละมุน ผ่อนคลาย', desc: 'เสียงนุ่ม เบาสบาย เหมาะกับบิวตี้และบ้าน', bpm: 84 },
  { id: 'electronic', label: 'อิเล็กทรอนิกส์ ล้ำยุค', desc: 'ซินธ์และเบสหนัก เหมาะกับแกดเจ็ต', bpm: 124 },
  { id: 'trendy', label: 'ทันสมัย ติดหู', desc: 'จังหวะโซเชียล เหมาะกับแฟชั่นและไวรัล', bpm: 100 },
  { id: 'cinematic', label: 'ภาพยนตร์', desc: 'บรรยากาศยิ่งใหญ่ ค่อย ๆ ไต่ระดับ', bpm: 70 },
];

export const SFX: { id: SfxId; label: string }[] = [
  { id: 'whoosh', label: 'วูบ (Whoosh)' },
  { id: 'pop', label: 'ป๊อป (Pop)' },
  { id: 'ding', label: 'ติ๊ง (Ding)' },
  { id: 'riser', label: 'ไต่ระดับ (Riser)' },
  { id: 'impact', label: 'กระแทก (Impact)' },
  { id: 'shimmer', label: 'วิบวับ (Shimmer)' },
];

export const GENERATED_LICENSE =
  'สร้างขึ้นโดยแอปนี้แบบอัลกอริทึม (Procedural) — ไม่มีลิขสิทธิ์บุคคลที่สาม ใช้ในงานเชิงพาณิชย์ได้';

const note = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// Chord progressions (MIDI root + quality)
const PROG: Record<MusicMood, number[][]> = {
  elegant: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]],
  upbeat: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],
  soft: [[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 67]],
  electronic: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
  trendy: [[56, 60, 63], [53, 56, 60], [49, 53, 56], [51, 55, 58]],
  cinematic: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]],
};

function noiseBuffer(ctx: BaseAudioContext, secs: number) {
  const b = ctx.createBuffer(1, Math.ceil(secs * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x7fffffff) * 2 - 1; }
  return b;
}

function env(g: GainNode, t: number, a: number, peak: number, d: number, sustain = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
}

const musicCache = new Map<string, Promise<AudioBuffer>>();

export function generateMusic(mood: MusicMood, seconds: number): Promise<AudioBuffer> {
  const len = Math.ceil(seconds) + 1;
  const key = `${mood}:${len}`;
  if (!musicCache.has(key)) musicCache.set(key, renderMusic(mood, len));
  return musicCache.get(key)!;
}

async function renderMusic(mood: MusicMood, seconds: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const info = MOODS.find((m) => m.id === mood)!;
  const beat = 60 / info.bpm;
  const bar = beat * 4;
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  const noise = noiseBuffer(ctx, 1);
  // simple stereo "reverb": feedback delay
  const delay = ctx.createDelay(1);
  delay.delayTime.value = beat * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = mood === 'cinematic' || mood === 'elegant' ? 0.38 : 0.22;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(master);

  const prog = PROG[mood];
  const bars = Math.ceil(seconds / bar);
  const drums = mood === 'upbeat' || mood === 'electronic' || mood === 'trendy';

  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const chord = prog[b % prog.length];
    // pad
    for (const n of chord) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = mood === 'electronic' ? 'sawtooth' : 'triangle';
        o.frequency.value = note(n);
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = mood === 'electronic' ? 1400 : 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(mood === 'electronic' ? 0.018 : 0.03, t0 + Math.min(bar * 0.4, 1.2));
        g.gain.linearRampToValueAtTime(0.0001, t0 + bar + 0.3);
        o.connect(f).connect(g);
        g.connect(master);
        g.connect(delay);
        o.start(t0);
        o.stop(t0 + bar + 0.4);
      }
    }
    // bass
    const bassSteps = drums ? 4 : 2;
    for (let i = 0; i < bassSteps; i++) {
      const t = t0 + (i * bar) / bassSteps;
      const o = ctx.createOscillator();
      o.type = mood === 'electronic' || mood === 'trendy' ? 'sawtooth' : 'sine';
      o.frequency.value = note(chord[0] - 24);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 400;
      const g = ctx.createGain();
      env(g, t, 0.01, 0.22, bar / bassSteps * 0.9);
      o.connect(f).connect(g).connect(master);
      o.start(t);
      o.stop(t + bar / bassSteps);
    }
    // melody / arpeggio (bell-like)
    const steps = mood === 'cinematic' ? 4 : 8;
    for (let i = 0; i < steps; i++) {
      const pattern = [0, 1, 2, 1, 2, 3, 2, 1];
      if (mood === 'soft' && i % 2) continue;
      const n = chord[pattern[i % pattern.length] % chord.length] + 12;
      const t = t0 + (i * bar) / steps;
      const o = ctx.createOscillator();
      o.type = mood === 'electronic' ? 'square' : 'sine';
      o.frequency.value = note(n);
      const g = ctx.createGain();
      env(g, t, 0.005, mood === 'electronic' ? 0.03 : 0.06, 0.5);
      o.connect(g);
      g.connect(master);
      g.connect(delay);
      o.start(t);
      o.stop(t + 0.6);
    }
    // drums
    if (drums) {
      for (let i = 0; i < 4; i++) {
        const t = t0 + i * beat;
        if (mood !== 'trendy' || i % 2 === 0) kick(ctx, master, t);
        if (i % 2 === 1) clap(ctx, master, noise, t);
        hat(ctx, master, noise, t + beat / 2);
        if (mood === 'electronic') hat(ctx, master, noise, t);
      }
      if (mood === 'trendy') for (let i = 0; i < 8; i++) hat(ctx, master, noise, t0 + i * beat / 2 + beat / 4, 0.04);
    } else if (mood === 'cinematic' && b % 2 === 1) {
      kick(ctx, master, t0, 0.9, 50);
    }
  }
  return normalize(await ctx.startRendering(), 0.9);
}

function kick(ctx: BaseAudioContext, dest: AudioNode, t: number, peak = 0.7, end = 45) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(end, t + 0.12);
  const g = ctx.createGain();
  env(g, t, 0.003, peak, 0.25);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.3);
}
function hat(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, t: number, peak = 0.08) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = ctx.createGain();
  env(g, t, 0.002, peak, 0.05);
  s.connect(f).connect(g).connect(dest);
  s.start(t);
  s.stop(t + 0.08);
}
function clap(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, t: number) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1500;
  const g = ctx.createGain();
  env(g, t, 0.003, 0.25, 0.15);
  s.connect(f).connect(g).connect(dest);
  s.start(t);
  s.stop(t + 0.2);
}

// ---------- SFX ----------
const sfxCache = new Map<SfxId, Promise<AudioBuffer>>();
export function getSfx(id: SfxId) {
  if (!sfxCache.has(id)) sfxCache.set(id, renderSfx(id));
  return sfxCache.get(id)!;
}

async function renderSfx(id: SfxId): Promise<AudioBuffer> {
  const dur = id === 'riser' ? 1.2 : id === 'shimmer' ? 1 : 0.7;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const noise = noiseBuffer(ctx, dur);
  const out = ctx.destination;
  if (id === 'whoosh' || id === 'riser') {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(id === 'riser' ? 300 : 600, 0);
    f.frequency.exponentialRampToValueAtTime(id === 'riser' ? 6000 : 3500, dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(0.9, dur * (id === 'riser' ? 0.85 : 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, dur);
    s.connect(f).connect(g).connect(out);
    s.start(0);
  } else if (id === 'pop') {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(900, 0);
    o.frequency.exponentialRampToValueAtTime(220, 0.08);
    const g = ctx.createGain();
    env(g, 0, 0.002, 0.8, 0.12);
    o.connect(g).connect(out);
    o.start(0);
  } else if (id === 'ding') {
    for (const [fr, p] of [[1760, 0.4], [2637, 0.2], [3520, 0.1]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = fr;
      const g = ctx.createGain();
      env(g, 0, 0.003, p, 0.6);
      o.connect(g).connect(out);
      o.start(0);
    }
  } else if (id === 'impact') {
    kick(ctx, out, 0, 1, 35);
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    env(g, 0, 0.002, 0.6, 0.4);
    s.connect(f).connect(g).connect(out);
    s.start(0);
  } else if (id === 'shimmer') {
    for (let i = 0; i < 10; i++) {
      const o = ctx.createOscillator();
      o.frequency.value = 2000 + i * 260;
      const g = ctx.createGain();
      env(g, i * 0.05, 0.003, 0.07, 0.35);
      o.connect(g).connect(out);
      o.start(i * 0.05);
    }
  }
  return normalize(await ctx.startRendering(), 0.95);
}

/** Peak-normalize a generated buffer so volume sliders map to predictable loudness. */
function normalize(b: AudioBuffer, peak: number) {
  let max = 0;
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > max) max = v; } }
  if (max > 0) { const g = peak / max; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; } }
  return b;
}

// ---------- uploaded audio ----------
const decodeCache = new Map<string, Promise<AudioBuffer | null>>();
export function decodeAsset(id: string) {
  if (!decodeCache.has(id)) {
    decodeCache.set(id, (async () => {
      const a = await getAsset(id);
      if (!a) return null;
      const ctx = new OfflineAudioContext(2, SR, SR);
      return ctx.decodeAudioData(await a.blob.arrayBuffer());
    })());
  }
  return decodeCache.get(id)!;
}

export async function musicBuffer(music: string | null, seconds: number) {
  if (!music) return null;
  if (music.startsWith('gen:')) return generateMusic(music.slice(4) as MusicMood, seconds);
  if (music.startsWith('asset:')) return decodeAsset(music.slice(6));
  return null;
}

/** Offline mix of the full soundtrack (music + scene SFX). Returns null if silent. */
export async function mixSoundtrack(scenes: Scene[], audio: AudioSettings, clipIds: string[] = []): Promise<AudioBuffer | null> {
  const total = scenes.reduce((t, s) => t + s.duration, 0);
  if (total <= 0) return null;
  const hasSfx = scenes.some((s) => s.sfx) && audio.sfxVolume > 0;
  const clipVol = audio.clipVolume ?? 1;
  const clipBufs = clipVol > 0 ? await Promise.all(clipIds.map((id) => decodeAsset(id).catch(() => null))) : [];
  const hasClipAudio = clipBufs.some(Boolean) && scenes.some((s) => s.product.mode === 'ai');
  const voiceVol = audio.voiceVolume ?? 1;
  const voiceBufs = voiceVol > 0 ? await Promise.all(scenes.map((s) => (s.voice ? decodeAsset(s.voice).catch(() => null) : null))) : [];
  const hasVoice = voiceBufs.some(Boolean);
  if (!audio.music && !hasSfx && !hasClipAudio && !hasVoice) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * SR), SR);
  const music = await musicBuffer(audio.music, total).catch(() => null);
  if (music && audio.musicVolume > 0) {
    const src = ctx.createBufferSource();
    src.buffer = music;
    src.loop = music.duration < total + (audio.musicStart || 0);
    const g = ctx.createGain();
    const v = audio.musicVolume;
    const fi = Math.min(audio.fadeIn, total / 2), fo = Math.min(audio.fadeOut, total / 2);
    g.gain.setValueAtTime(fi > 0 ? 0 : v, 0);
    if (fi > 0) g.gain.linearRampToValueAtTime(v, fi);
    g.gain.setValueAtTime(v, Math.max(fi, total - fo));
    if (fo > 0) g.gain.linearRampToValueAtTime(0, total);
    const duck = ctx.createGain();
    if (hasVoice) {
      let t = 0;
      scenes.forEach((s, i) => {
        const vb = voiceBufs[i];
        if (vb) {
          const end = t + Math.min(vb.duration, s.duration);
          duck.gain.setValueAtTime(1, Math.max(0, t - 0.15));
          duck.gain.linearRampToValueAtTime(0.35, t + 0.1);
          duck.gain.setValueAtTime(0.35, end);
          duck.gain.linearRampToValueAtTime(1, end + 0.3);
        }
        t += s.duration;
      });
    }
    src.connect(g).connect(duck).connect(ctx.destination);
    src.start(0, Math.min(audio.musicStart || 0, Math.max(0, music.duration - 0.1)));
  }
  if (hasClipAudio) {
    // keep the sound that came with each clip (e.g. Veo Thai voice-over), aligned to its scene
    let t = 0;
    for (const s of scenes) {
      const b = s.product.mode === 'ai' ? clipBufs[s.product.clip ?? 0] : null;
      if (b) {
        const src = ctx.createBufferSource();
        src.buffer = b;
        const g = ctx.createGain();
        g.gain.setValueAtTime(clipVol, t);
        g.gain.setValueAtTime(clipVol, Math.max(t, t + s.duration - 0.12));
        g.gain.linearRampToValueAtTime(0, t + s.duration);
        src.connect(g).connect(ctx.destination);
        src.start(t, 0, Math.min(b.duration, s.duration));
      }
      t += s.duration;
    }
  }
  if (hasVoice) {
    let t = 0;
    scenes.forEach((s, i) => {
      const vb = voiceBufs[i];
      if (vb) {
        const src = ctx.createBufferSource();
        src.buffer = vb;
        const g = ctx.createGain();
        g.gain.value = voiceVol;
        src.connect(g).connect(ctx.destination);
        src.start(t + 0.15, 0, Math.max(0.1, Math.min(vb.duration, s.duration - 0.15)));
      }
      t += s.duration;
    });
  }
  if (hasSfx) {
    let t = 0;
    for (const s of scenes) {
      if (s.sfx) {
        const b = await getSfx(s.sfx);
        const src = ctx.createBufferSource();
        src.buffer = b;
        const g = ctx.createGain();
        g.gain.value = audio.sfxVolume;
        src.connect(g).connect(ctx.destination);
        // riser lands on the cut; others hit right on it
        src.start(Math.max(0, s.sfx === 'riser' ? t - b.duration * 0.85 : t));
      }
      t += s.duration;
    }
  }
  return ctx.startRendering();
}

// ---------- realtime playback helper ----------
let liveCtx: AudioContext | null = null;
export function audioCtx() {
  if (!liveCtx) liveCtx = new AudioContext({ sampleRate: SR });
  return liveCtx;
}

export function playBuffer(buf: AudioBuffer, offset = 0, volume = 1) {
  const ctx = audioCtx();
  if (ctx.state === 'suspended') ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(ctx.destination);
  src.start(0, Math.max(0, Math.min(offset, buf.duration)));
  return { src, startedAt: ctx.currentTime - offset, stop: () => { try { src.stop(); } catch { /* already stopped */ } } };
}
