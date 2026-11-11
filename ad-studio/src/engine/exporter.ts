// Video export. Primary path: WebCodecs (H.264) + mp4-muxer → real MP4, rendered
// frame-by-frame (faster than realtime, exact timing). Fallback: MediaRecorder
// realtime capture → WebM (or MP4 where the browser records MP4).
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { Scene } from '../lib/types';
import { audioCtx } from './audio';
import { drawFrame, syncClips, type RenderAssets } from './renderer';

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  quality: 'standard' | 'high';
  preferFormat: 'mp4' | 'webm';
  onProgress: (p: number, stage: string) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  format: 'mp4' | 'webm';
  note?: string;
}

export function bitrateFor(w: number, h: number, fps: number, q: 'standard' | 'high') {
  const base = w * h * fps * (q === 'high' ? 0.12 : 0.07);
  return Math.round(Math.min(Math.max(base, 1_500_000), 16_000_000));
}

export function estimateSizeMB(w: number, h: number, fps: number, q: 'standard' | 'high', seconds: number) {
  return ((bitrateFor(w, h, fps, q) + 128_000) * seconds) / 8 / 1024 / 1024;
}

const AVC = ['avc1.640033', 'avc1.64002a', 'avc1.640028', 'avc1.4d0033', 'avc1.4d0028', 'avc1.42e033', 'avc1.42e01f'];

export async function webCodecsSupport(w: number, h: number, fps: number) {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of AVC) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, framerate: fps, bitrate: 4_000_000 });
      if (r.supported) return codec;
    } catch { /* try next */ }
  }
  return null;
}

async function audioCodec(): Promise<'aac' | 'opus' | null> {
  if (typeof AudioEncoder === 'undefined') return null;
  try {
    if ((await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported) return 'aac';
  } catch { /* ignore */ }
  try {
    if ((await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported) return 'opus';
  } catch { /* ignore */ }
  return null;
}

export function mediaRecorderMime(prefer: 'mp4' | 'webm' = 'mp4') {
  if (typeof MediaRecorder === 'undefined') return null;
  const mp4 = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
  const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const list = prefer === 'webm' ? [...webm, ...mp4] : [...mp4, ...webm];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function exportVideo(scenes: Scene[], assets: RenderAssets, audio: AudioBuffer | null, o: ExportOptions): Promise<ExportResult> {
  const total = scenes.reduce((t, s) => t + s.duration, 0);
  const codec = o.preferFormat === 'mp4' ? await webCodecsSupport(o.width, o.height, o.fps) : null;
  if (codec) {
    try {
      return await exportWebCodecs(scenes, assets, audio, o, codec, total);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      console.warn('WebCodecs export failed, falling back', e);
    }
  }
  return exportRecorder(scenes, assets, audio, o, total);
}

async function exportWebCodecs(scenes: Scene[], assets: RenderAssets, audio: AudioBuffer | null, o: ExportOptions, codec: string, total: number): Promise<ExportResult> {
  const aCodec = audio ? await audioCodec() : null;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: o.width, height: o.height, frameRate: o.fps },
    audio: aCodec ? { codec: aCodec, sampleRate: audio!.sampleRate, numberOfChannels: 2 } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let failure: Error | null = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e as Error; },
  });
  venc.configure({ codec, width: o.width, height: o.height, bitrate: bitrateFor(o.width, o.height, o.fps, o.quality), framerate: o.fps, latencyMode: 'quality' });

  const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(o.width, o.height)
    : Object.assign(document.createElement('canvas'), { width: o.width, height: o.height });
  const ctx = canvas.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D;
  const frames = Math.round(total * o.fps);
  const frameDur = 1e6 / o.fps;
  for (let i = 0; i < frames; i++) {
    if (o.signal?.aborted) { venc.close(); throw new DOMException('ยกเลิกแล้ว', 'AbortError'); }
    if (failure) throw failure;
    await syncClips(scenes, assets, i / o.fps, true);
    drawFrame(ctx, scenes, assets, i / o.fps, o.width, o.height);
    const vf = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
    venc.encode(vf, { keyFrame: i % (o.fps * 2) === 0 });
    vf.close();
    while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    if (i % 3 === 0) { o.onProgress((i / frames) * (aCodec ? 0.9 : 0.97), 'กำลังเรนเดอร์ภาพ'); await tick(); }
  }
  await venc.flush();
  venc.close();
  if (failure) throw failure;

  if (audio && aCodec) {
    o.onProgress(0.92, 'กำลังเข้ารหัสเสียง');
    let aFail: Error | null = null;
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { aFail = e as Error; } });
    aenc.configure({ codec: aCodec === 'aac' ? 'mp4a.40.2' : 'opus', sampleRate: audio.sampleRate, numberOfChannels: 2, bitrate: 128000 });
    const L = audio.getChannelData(0), R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L;
    const len = Math.min(audio.length, Math.round(total * audio.sampleRate));
    const N = 4096;
    for (let off = 0; off < len; off += N) {
      const n = Math.min(N, len - off);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(off, off + n), 0);
      data.set(R.subarray(off, off + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: audio.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off / audio.sampleRate) * 1e6), data });
      aenc.encode(ad);
      ad.close();
      if (aFail) throw aFail;
    }
    await aenc.flush();
    aenc.close();
  }
  muxer.finalize();
  o.onProgress(1, 'เสร็จสิ้น');
  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
  return {
    blob,
    format: 'mp4',
    note: audio && !aCodec ? 'อุปกรณ์นี้เข้ารหัสเสียงไม่ได้ วิดีโอนี้จึงไม่มีเสียง ลองส่งออกเป็น WebM เพื่อให้มีเสียง'
      : aCodec === 'opus' ? 'เสียงถูกเข้ารหัสแบบ Opus (อุปกรณ์ไม่รองรับ AAC) บางแอปอาจเล่นเสียงไม่ได้ หากมีปัญหาให้ลองส่งออกเป็น WebM' : undefined,
  };
}

async function exportRecorder(scenes: Scene[], assets: RenderAssets, audio: AudioBuffer | null, o: ExportOptions, total: number): Promise<ExportResult> {
  const mime = mediaRecorderMime(o.preferFormat);
  if (!mime) throw new Error('เบราว์เซอร์นี้ไม่รองรับการบันทึกวิดีโอ กรุณาใช้ Chrome เวอร์ชันล่าสุดบน Android');
  const canvas = Object.assign(document.createElement('canvas'), { width: o.width, height: o.height });
  const ctx = canvas.getContext('2d', { alpha: false })!;
  drawFrame(ctx, scenes, assets, 0, o.width, o.height);
  const stream = canvas.captureStream(o.fps);
  let src: AudioBufferSourceNode | null = null;
  const actx = audioCtx();
  if (actx.state === 'suspended') await actx.resume();
  if (audio) {
    const dest = actx.createMediaStreamDestination();
    src = actx.createBufferSource();
    src.buffer = audio;
    src.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrateFor(o.width, o.height, o.fps, o.quality) });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(500);
  const t0 = actx.currentTime + 0.05;
  src?.start(t0);
  await new Promise<void>((resolve, reject) => {
    const loop = () => {
      if (o.signal?.aborted) { rec.stop(); src?.stop(); reject(new DOMException('ยกเลิกแล้ว', 'AbortError')); return; }
      const t = actx.currentTime - t0;
      if (t >= total) { resolve(); return; }
      syncClips(scenes, assets, Math.max(0, t), false, true);
      drawFrame(ctx, scenes, assets, Math.max(0, t), o.width, o.height);
      o.onProgress(Math.max(0, t) / total, 'กำลังบันทึกแบบเรียลไทม์ (เปิดหน้าจอค้างไว้)');
      requestAnimationFrame(loop);
    };
    loop();
  });
  rec.stop();
  try { src?.stop(); } catch { /* ignore */ }
  await done;
  stream.getTracks().forEach((t) => t.stop());
  o.onProgress(1, 'เสร็จสิ้น');
  const isMp4 = mime.startsWith('video/mp4');
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), format: isMp4 ? 'mp4' : 'webm', note: isMp4 || o.preferFormat === 'webm' ? undefined : 'อุปกรณ์นี้ส่งออก MP4 ไม่ได้ จึงส่งออกเป็น WebM ซึ่ง TikTok/YouTube รองรับ' };
}
