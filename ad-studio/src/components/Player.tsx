import { Pause, Play, RotateCcw } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { audioCtx, mixSoundtrack, playBuffer } from '../engine/audio';
import { drawFrame, outputSize, syncClips, type RenderAssets } from '../engine/renderer';
import type { Aspect, AudioSettings, Scene } from '../lib/types';

export function usePlayer(scenes: Scene[], audio: AudioSettings, clipIds: string[] = []) {
  const total = useMemo(() => scenes.reduce((t, s) => t + s.duration, 0), [scenes]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mixing, setMixing] = useState(false);
  const mix = useRef<AudioBuffer | null>(null);
  const handle = useRef<{ stop: () => void; startedAt: number } | null>(null);
  const raf = useRef(0);
  const tRef = useRef(0);
  tRef.current = t;

  // re-mix soundtrack when timing/audio changes
  const mixKey = JSON.stringify([scenes.map((s) => [s.duration, s.sfx, s.product.mode, s.product.clip]), audio, clipIds]);
  useEffect(() => {
    let alive = true;
    setMixing(true);
    const id = window.setTimeout(async () => {
      try { const b = await mixSoundtrack(scenes, audio, clipIds); if (alive) mix.current = b; }
      catch (e) { console.warn('mix failed', e); if (alive) mix.current = null; }
      finally { if (alive) setMixing(false); }
    }, 250);
    return () => { alive = false; window.clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixKey]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    handle.current?.stop();
    handle.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback((from?: number) => {
    stop();
    let start = from ?? tRef.current;
    if (start >= total - 0.05) start = 0;
    const ctx = audioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    if (mix.current) handle.current = playBuffer(mix.current, start);
    else handle.current = { stop: () => {}, startedAt: ctx.currentTime - start };
    setPlaying(true);
    const loop = () => {
      const now = ctx.currentTime - handle.current!.startedAt;
      if (now >= total) { setT(total); stop(); return; }
      setT(now);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }, [stop, total]);

  const seek = useCallback((v: number) => {
    const c = Math.max(0, Math.min(total, v));
    setT(c);
    if (handle.current) play(c);
  }, [play, total]);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => { if (t > total) setT(total); }, [t, total]);

  return { t, total, playing, mixing, play, pause: stop, seek, toggle: () => (playing ? stop() : play()) };
}

export interface StageHandle { canvas: HTMLCanvasElement | null; size: { width: number; height: number } }

export const Stage = forwardRef<StageHandle, { scenes: Scene[]; assets: RenderAssets; aspect: Aspect; t: number; playing?: boolean; className?: string; children?: React.ReactNode }>(
  function Stage({ scenes, assets, aspect, t, playing = false, className = '', children }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const size = useMemo(() => outputSize(aspect, 540), [aspect]);
    useImperativeHandle(ref, () => ({ canvas: canvas.current, size }), [size]);
    useEffect(() => {
      const c = canvas.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      drawFrame(ctx, scenes, assets, t, size.width, size.height);
      if (assets.clips?.length) {
        let alive = true;
        syncClips(scenes, assets, t, false, playing).then(() => { if (alive) drawFrame(ctx, scenes, assets, t, size.width, size.height); });
        return () => { alive = false; };
      }
    }, [scenes, assets, t, size, playing]);
    const ar = aspect === '9:16' ? '9 / 16' : aspect === '1:1' ? '1 / 1' : '16 / 9';
    return (
      <div className={`relative overflow-hidden rounded-[26px] border border-white/10 bg-black shadow-card ${className}`} style={{ aspectRatio: ar }}>
        <canvas ref={canvas} width={size.width} height={size.height} className="w-full h-full block" />
        {children}
      </div>
    );
  },
);

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

/** Self-contained preview with play controls (used in the wizard). */
export function PreviewPlayer({ scenes, assets, aspect, audio, className, clipIds }: { scenes: Scene[]; assets: RenderAssets; aspect: Aspect; audio: AudioSettings; className?: string; clipIds?: string[] }) {
  const p = usePlayer(scenes, audio, clipIds);
  return (
    <div className={className}>
      <Stage scenes={scenes} assets={assets} aspect={aspect} t={p.t} playing={p.playing} className="mx-auto max-h-[62vh]">
        <button onClick={p.toggle} className="absolute inset-0 grid place-items-center group" aria-label={p.playing ? 'หยุด' : 'เล่น'}>
          {!p.playing && <span className="w-16 h-16 rounded-full glass grid place-items-center"><Play size={26} fill="currentColor" className="ml-1" /></span>}
        </button>
        <span className="absolute left-3 bottom-3 rounded-full bg-black/55 px-3 py-1 text-[12px] tabular-nums">{fmtTime(p.t)} / {fmtTime(p.total)}</span>
      </Stage>
      <div className="flex items-center gap-3 mt-3">
        <button className="icon-btn" onClick={p.toggle} aria-label="เล่น/หยุด">{p.playing ? <Pause size={18} /> : <Play size={18} />}</button>
        <input type="range" min={0} max={p.total} step={0.05} value={p.t} onChange={(e) => p.seek(+e.target.value)} />
        <button className="icon-btn" onClick={() => p.seek(0)} aria-label="เริ่มใหม่"><RotateCcw size={16} /></button>
      </div>
    </div>
  );
}
