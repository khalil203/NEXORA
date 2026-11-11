import {
  ArrowLeft, ArrowRight, BookmarkPlus, ChevronLeft, Copy, Download, Image as ImageIcon, Loader2, Music2, Pause, Play, Plus, Redo2,
  Scissors, Shapes, Trash2, Type, Undo2, Upload, Film,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AssetImg } from '../components/ProjectThumb';
import { fmtTime, Stage, usePlayer } from '../components/Player';
import { Field, Segmented, Sheet, useToast } from '../components/ui';
import { GENERATED_LICENSE, MOODS, SFX } from '../engine/audio';
import { elementBox, ensureFonts, measureText, outputSize, sceneAt } from '../engine/renderer';
import { listAssets, putAsset, uid } from '../lib/db';
import { ELEMENT_LABEL, ELEMENT_LIBRARY } from '../lib/elements';
import { useProject, useRenderAssets } from '../lib/hooks';
import { FONTS } from '../lib/settings';
import { KIND_LABEL, LOOKS, textStyle } from '../lib/storyboard';
import type { Asset, Camera, ElementLayer, Project, Scene, SfxId, TextAnim, TextLayer, TextPreset, Transition } from '../lib/types';
import { addPersonalTemplate } from './Templates';
import { createAiClip } from '../lib/aivideo';
import { Sparkles } from 'lucide-react';

type Tab = 'scene' | 'text' | 'graphic' | 'audio';
type Sel = { kind: 'text' | 'el'; id: string } | null;
type Upd = (fn: (d: Project) => void, o?: { history?: boolean }) => void;

const CAMERAS: { v: Camera; l: string }[] = [
  { v: 'zoom-in', l: 'ซูมเข้า' }, { v: 'zoom-out', l: 'ซูมออก' }, { v: 'pan-left', l: 'แพนซ้าย' }, { v: 'pan-right', l: 'แพนขวา' },
  { v: 'pan-up', l: 'เลื่อนขึ้น' }, { v: 'float', l: 'ลอย' }, { v: 'static', l: 'นิ่ง' },
];
const TRANS: { v: Transition; l: string }[] = [
  { v: 'none', l: 'ไม่มี' }, { v: 'fade', l: 'จางหาย' }, { v: 'slide', l: 'สไลด์' }, { v: 'zoom', l: 'ซูม' }, { v: 'wipe', l: 'กวาด' }, { v: 'flash', l: 'แฟลช' },
];
const ANIMS: { v: TextAnim; l: string }[] = [
  { v: 'fade-up', l: 'ลอยขึ้น' }, { v: 'pop', l: 'เด้ง' }, { v: 'typewriter', l: 'พิมพ์ทีละตัว' }, { v: 'slide-left', l: 'สไลด์' }, { v: 'glow', l: 'เรืองแสง' }, { v: 'none', l: 'ไม่มี' },
];
const PRESETS: { v: TextPreset; l: string }[] = [
  { v: 'cine', l: 'ภาพยนตร์' }, { v: 'bold', l: 'ตัวหนา' }, { v: 'gold', l: 'ทองหรู' }, { v: 'neon', l: 'นีออน' }, { v: 'outline', l: 'ขอบดำ' }, { v: 'label', l: 'ป้ายพื้นสี' }, { v: '3d', l: '3 มิติ' }, { v: 'soft', l: 'ละมุน' },
];

export default function Editor() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { project: p, missing, update, undo, redo, canUndo, canRedo, saving, saveNow } = useProject(id);
  const { assets } = useRenderAssets(p);
  const player = usePlayer(p?.scenes ?? [], p?.audio ?? { music: null, musicVolume: 0, sfxVolume: 0, fadeIn: 0, fadeOut: 0, musicStart: 0 }, p?.aiClips);
  const [tab, setTab] = useState<Tab>('scene');
  const [sceneIdx, setSceneIdx] = useState(0);
  const [sel, setSel] = useState<Sel>(null);
  const [tplOpen, setTplOpen] = useState(false);

  // keep selected scene in sync with playhead while playing
  useEffect(() => {
    if (!p || !player.playing) return;
    const i = sceneAt(p.scenes, player.t).index;
    if (i !== sceneIdx) setSceneIdx(i);
  }, [player.t, player.playing, p, sceneIdx]);

  useEffect(() => { if (p) ensureFonts(p.scenes); }, [p]);
  const opened = useRef(false);
  useEffect(() => {
    if (!p?.scenes.length || opened.current) return;
    opened.current = true;
    player.seek(Math.min(1.3, p.scenes[0].duration * 0.6));
  }, [p, player]);

  // keyboard undo/redo
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [undo, redo]);

  const starts = useMemo(() => {
    const out: number[] = [];
    let a = 0;
    p?.scenes.forEach((s) => { out.push(a); a += s.duration; });
    return out;
  }, [p?.scenes]);

  const selectScene = useCallback((i: number) => {
    if (!p) return;
    setSceneIdx(i);
    setSel(null);
    const s = p.scenes[i];
    player.pause();
    player.seek(starts[i] + Math.min(1.3, s.duration * 0.6));
  }, [p, player, starts]);

  if (missing) return <div className="p-10 text-center text-white/60">ไม่พบโปรเจกต์ <button className="btn-glass mt-4" onClick={() => nav('/projects')}>ไปที่โปรเจกต์</button></div>;
  if (!p) return <div className="p-10 grid place-items-center"><Loader2 className="animate-spin text-white/40" /></div>;
  if (!p.scenes.length) {
    return (
      <div className="p-6 text-center space-y-4 pt-20">
        <p className="text-white/60">โปรเจกต์นี้ยังไม่มีสตอรี่บอร์ด</p>
        <button className="btn-primary" onClick={() => nav(`/create/${p.id}?step=story`)}>สร้างสตอรี่บอร์ด</button>
      </div>
    );
  }
  const si = Math.min(sceneIdx, p.scenes.length - 1);
  const scene = p.scenes[si];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-ink-950 lg:max-w-5xl lg:mx-auto">
      {/* top bar */}
      <div className="flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),10px)] pb-2">
        <button className="icon-btn" aria-label="ย้อนกลับ" onClick={async () => { await saveNow(); nav(-1); }}><ChevronLeft size={22} /></button>
        <div className="flex-1 min-w-0 text-center">
          <div className="font-semibold thai-display truncate">{p.name}</div>
          <div className="text-[11px] text-white/40">{saving === 'pending' ? 'กำลังบันทึก…' : saving === 'saved' ? 'บันทึกอัตโนมัติแล้ว' : `${p.aspect} · ${player.total.toFixed(1)} วิ`}</div>
        </div>
        <button className="icon-btn" aria-label="บันทึกเป็นเทมเพลต" onClick={() => setTplOpen(true)}><BookmarkPlus size={18} /></button>
        <button className="h-11 px-4 rounded-full bg-accent shadow-glow font-semibold flex items-center gap-1.5 text-[14px]" onClick={async () => { await saveNow(); nav(`/publish/${p.id}`); }}>
          <Download size={16} /> ส่งออก
        </button>
      </div>

      <div className="flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-4 lg:px-3">
        <div className="px-3 lg:px-0">
          {/* tabs like the reference "Frames / Elements" segmented control */}
          <div className="flex p-1 rounded-full glass mb-3">
            {([['scene', 'ฉาก', Film], ['text', 'ข้อความ', Type], ['graphic', 'กราฟิก', Shapes], ['audio', 'เสียง', Music2]] as const).map(([k, l, I]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex-1 h-10 rounded-full text-[13px] font-medium flex items-center justify-center gap-1.5 transition ${tab === k ? 'bg-accent shadow-glow' : 'text-white/60'}`}>
                <I size={15} /> {l}
              </button>
            ))}
          </div>

          {/* stage */}
          <div className="relative mx-auto" style={{ maxWidth: p.aspect === '9:16' ? 'min(100%, 46vh)' : p.aspect === '1:1' ? 'min(100%, 52vh)' : '100%' }}>
            <Stage scenes={p.scenes} assets={assets} aspect={p.aspect} t={player.t} playing={player.playing}>
              <DragLayer p={p} si={si} sel={sel} setSel={(s) => { setSel(s); if (s) setTab(s.kind === 'text' ? 'text' : 'graphic'); }} update={update} />
              <span className="absolute left-3 bottom-3 rounded-full bg-black/55 backdrop-blur px-3 py-1 text-[12px] tabular-nums pointer-events-none">{fmtTime(player.t)}</span>
            </Stage>
            {/* floating tool column */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-2">
              <button className="icon-btn !bg-black/40" aria-label="ย้อนกลับ" disabled={!canUndo} onClick={undo}><Undo2 size={18} className={canUndo ? '' : 'opacity-30'} /></button>
              <button className="icon-btn !bg-black/40" aria-label="ทำซ้ำ" disabled={!canRedo} onClick={redo}><Redo2 size={18} className={canRedo ? '' : 'opacity-30'} /></button>
              <button className="icon-btn !bg-black/40" aria-label="เพิ่มข้อความ" onClick={() => { addText(update, p, si, setSel); setTab('text'); }}><Type size={18} /></button>
              {sel && <button className="icon-btn !bg-black/40 text-red-300" aria-label="ลบที่เลือก" onClick={() => { removeSel(update, si, sel); setSel(null); }}><Trash2 size={18} /></button>}
            </div>
          </div>

          {/* transport */}
          <div className="flex items-center gap-3 mt-3">
            <button className="w-12 h-12 rounded-full bg-accent shadow-glow grid place-items-center shrink-0" aria-label={player.playing ? 'หยุด' : 'เล่น'} onClick={player.toggle}>
              {player.playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" fill="currentColor" />}
            </button>
            <Timeline p={p} t={player.t} si={si} starts={starts} onScene={selectScene} onSeek={(t) => { player.seek(t); setSceneIdx(sceneAt(p.scenes, t).index); }} />
          </div>
          {player.mixing && <p className="text-[11px] text-white/35 mt-1">กำลังมิกซ์เสียง…</p>}
        </div>

        {/* panel */}
        <div className="px-3 lg:px-0 pt-4 pb-10 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-accent grid place-items-center text-[13px] font-bold">{si + 1}</span>
            <span className="font-semibold">ฉาก {si + 1}: {KIND_LABEL[scene.kind]}</span>
            <span className="text-white/40 text-[13px]">{scene.duration.toFixed(1)} วิ</span>
          </div>
          {tab === 'scene' && <ScenePanel p={p} si={si} update={update} t={player.t} start={starts[si]} setSceneIdx={setSceneIdx} toast={toast} />}
          {tab === 'text' && <TextPanel p={p} si={si} update={update} sel={sel} setSel={setSel} />}
          {tab === 'graphic' && <GraphicPanel p={p} si={si} update={update} sel={sel} setSel={setSel} />}
          {tab === 'audio' && <AudioPanel p={p} si={si} update={update} />}
        </div>
      </div>

      <Sheet open={tplOpen} onClose={() => setTplOpen(false)} title="บันทึกเป็นเทมเพลตส่วนตัว">
        <form onSubmit={(e) => {
          e.preventDefault();
          const name = (new FormData(e.currentTarget).get('n') as string) || p.name;
          addPersonalTemplate({ name, style: p.style, aspect: p.aspect, duration: p.duration, scenes: p.scenes, audio: p.audio });
          setTplOpen(false);
          toast('บันทึกเทมเพลตแล้ว ดูได้ที่หน้าเทมเพลต');
        }}>
          <p className="text-[13px] text-white/55 mb-3">บันทึกฉาก สไตล์ ตัวอักษร และการตั้งค่าเสียงไว้ใช้กับสินค้าอื่น (รูปสินค้าไม่ถูกบันทึกในเทมเพลต)</p>
          <input name="n" defaultValue={`${p.name} (เทมเพลต)`} className="input mb-4" />
          <button className="btn-primary w-full">บันทึก</button>
        </form>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- helpers
function addText(update: Upd, p: Project, si: number, setSel: (s: Sel) => void) {
  const look = LOOKS[p.style];
  const id = uid();
  update((d) => { d.scenes[si].texts.push({ id, text: 'ข้อความใหม่', x: 0.5, y: 0.5, style: textStyle(look, look.bodyPreset, 0.06), anim: 'fade-up' }); });
  setSel({ kind: 'text', id });
}
function removeSel(update: Upd, si: number, sel: NonNullable<Sel>) {
  update((d) => {
    const s = d.scenes[si];
    if (sel.kind === 'text') s.texts = s.texts.filter((t) => t.id !== sel.id);
    else s.elements = s.elements.filter((e) => e.id !== sel.id);
  });
}

// ---------------------------------------------------------------- drag & select on canvas
function DragLayer({ p, si, sel, setSel, update }: { p: Project; si: number; sel: Sel; setSel: (s: Sel) => void; update: Upd }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = outputSize(p.aspect, 540);
  const mctx = useMemo(() => document.createElement('canvas').getContext('2d')!, []);
  const drag = useRef<{ kind: 'text' | 'el'; id: string; dx: number; dy: number } | null>(null);
  const scene = p.scenes[si];

  const boxes = useMemo(() => {
    const b: { kind: 'text' | 'el'; id: string; x: number; y: number; w: number; h: number }[] = [];
    scene.elements.forEach((e) => { const r = elementBox(e, size.width, size.height); b.push({ kind: 'el', id: e.id, ...r }); });
    scene.texts.forEach((t) => { const r = measureText(mctx, t, size.width, size.height); b.push({ kind: 'text', id: t.id, x: r.x, y: r.y, w: r.w, h: r.h }); });
    return b;
  }, [scene, size, mctx]);

  const toLocal = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size.width, y: ((e.clientY - r.top) / r.height) * size.height };
  };
  const onDown = (e: React.PointerEvent) => {
    const pt = toLocal(e);
    const hit = [...boxes].reverse().find((b) => pt.x >= b.x - 8 && pt.x <= b.x + b.w + 8 && pt.y >= b.y - 8 && pt.y <= b.y + b.h + 8);
    if (!hit) { setSel(null); return; }
    setSel({ kind: hit.kind, id: hit.id });
    const item = hit.kind === 'text' ? scene.texts.find((t) => t.id === hit.id)! : scene.elements.find((x) => x.id === hit.id)!;
    drag.current = { kind: hit.kind, id: hit.id, dx: pt.x / size.width - item.x, dy: pt.y / size.height - item.y };
    update(() => {}); // history checkpoint before moving
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const pt = toLocal(e);
    const d0 = drag.current;
    const nx = Math.max(0.02, Math.min(0.98, pt.x / size.width - d0.dx));
    const ny = Math.max(0.03, Math.min(0.97, pt.y / size.height - d0.dy));
    update((d) => {
      const s = d.scenes[si];
      const it: TextLayer | ElementLayer | undefined = d0.kind === 'text' ? s.texts.find((t) => t.id === d0.id) : s.elements.find((x) => x.id === d0.id);
      if (it) { it.x = Math.round(nx * 1000) / 1000; it.y = Math.round(ny * 1000) / 1000; }
    }, { history: false });
  };
  const onUp = () => { drag.current = null; };
  const sb = sel && boxes.find((b) => b.id === sel.id);

  return (
    <div ref={ref} className="absolute inset-0 touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {sb && (
        <div className="absolute border-2 border-dashed border-sky-glow rounded-lg pointer-events-none"
          style={{ left: `${(sb.x / size.width) * 100}%`, top: `${(sb.y / size.height) * 100}%`, width: `${(sb.w / size.width) * 100}%`, height: `${(sb.h / size.height) * 100}%` }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- timeline with 6 tracks
function Timeline({ p, t, si, starts, onScene, onSeek }: { p: Project; t: number; si: number; starts: number[]; onScene: (i: number) => void; onSeek: (t: number) => void }) {
  const total = p.scenes.reduce((a, s) => a + s.duration, 0);
  const ref = useRef<HTMLDivElement>(null);
  const seekFrom = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onSeek(((e.clientX - r.left) / r.width) * total);
  };
  const pct = (v: number) => `${(v / total) * 100}%`;
  const rows: [string, (s: Scene, i: number) => React.ReactNode][] = [
    ['ภาพ', (s) => <span className="truncate">รูป {s.imageIndex + 1}</span>],
    ['ข้อความ', (s) => <span className="truncate">{s.texts.map((x) => x.text).join(' · ') || '—'}</span>],
    ['กราฟิก', (s) => <span className="truncate">{s.elements.map((e) => ELEMENT_LABEL[e.type]).join(', ') || '—'}</span>],
    ['เอฟเฟกต์เสียง', (s) => (s.sfx ? <span>♪ {s.sfx}</span> : <span className="opacity-30">—</span>)],
  ];
  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between text-[10px] text-white/35 tabular-nums mb-1">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{Math.round(total * f)}s</span>)}
      </div>
      <div ref={ref} className="relative select-none" onPointerDown={(e) => { if ((e.target as HTMLElement).dataset.scene === undefined) seekFrom(e); }}>
        {/* video track */}
        <div className="flex h-12 rounded-xl overflow-hidden gap-[2px]">
          {p.scenes.map((s, i) => (
            <button key={s.id} data-scene={i} onClick={() => onScene(i)} style={{ width: pct(s.duration), background: `linear-gradient(135deg, ${s.background.colors[0]}, ${s.background.colors[1]})` }}
              className={`relative h-full min-w-[18px] text-[11px] font-bold ${i === si ? 'ring-2 ring-white ring-inset' : 'opacity-80'}`}>
              {p.images[s.imageIndex] && <AssetImg id={p.images[s.imageIndex]} className="absolute inset-y-1.5 left-1/2 -translate-x-1/2 h-[calc(100%-12px)] w-7 rounded-md opacity-90 pointer-events-none" />}
              <span className="absolute left-1 top-0.5 drop-shadow pointer-events-none">{i + 1}</span>
            </button>
          ))}
        </div>
        {/* other tracks */}
        <div className="mt-1 space-y-[2px]">
          {rows.map(([label, render]) => (
            <div key={label} className="flex h-4 gap-[2px] text-[9px] text-white/55">
              {p.scenes.map((s, i) => (
                <div key={s.id} style={{ width: pct(s.duration) }} className={`rounded px-1 flex items-center overflow-hidden whitespace-nowrap ${i === si ? 'bg-violet-glow/30' : 'bg-white/[0.06]'}`}>{render(s, i)}</div>
              ))}
            </div>
          ))}
          <div className="h-4 rounded bg-sky-glow/25 text-[9px] text-white/70 px-1 flex items-center">
            {p.audio.music ? `♫ ${p.audio.music.startsWith('gen:') ? MOODS.find((m) => `gen:${m.id}` === p.audio.music)?.label : 'เพลงที่อัปโหลด'} · ${Math.round(p.audio.musicVolume * 100)}%` : 'ไม่มีเพลง'}
          </div>
        </div>
        {/* playhead */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_white] pointer-events-none" style={{ left: pct(Math.min(t, total)) }} />
        {starts.length === 0 && null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- scene panel
function ScenePanel({ p, si, update, t, start, setSceneIdx, toast }: { p: Project; si: number; update: Upd; t: number; start: number; setSceneIdx: (i: number) => void; toast: (s: string, k?: 'ok' | 'err' | 'info') => void }) {
  const s = p.scenes[si];
  const up = (fn: (s: Scene) => void, history = true) => update((d) => fn(d.scenes[si]), { history });
  const local = t - start;
  const canSplit = local > 0.4 && local < s.duration - 0.4;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <ToolBtn icon={<ArrowLeft size={16} />} label="ย้ายซ้าย" disabled={si === 0} onClick={() => { update((d) => { [d.scenes[si - 1], d.scenes[si]] = [d.scenes[si], d.scenes[si - 1]]; }); setSceneIdx(si - 1); }} />
        <ToolBtn icon={<ArrowRight size={16} />} label="ย้ายขวา" disabled={si === p.scenes.length - 1} onClick={() => { update((d) => { [d.scenes[si + 1], d.scenes[si]] = [d.scenes[si], d.scenes[si + 1]]; }); setSceneIdx(si + 1); }} />
        <ToolBtn icon={<Scissors size={16} />} label="แยกฉาก" disabled={!canSplit} onClick={() => {
          update((d) => {
            const a = d.scenes[si];
            const b: Scene = { ...structuredClone(a), id: uid(), transition: 'none', sfx: null, texts: [], elements: [] };
            b.duration = Math.round((a.duration - local) * 10) / 10;
            a.duration = Math.round(local * 10) / 10;
            b.texts = structuredClone(a.texts).map((x) => ({ ...x, id: uid(), anim: 'none' as TextAnim }));
            d.scenes.splice(si + 1, 0, b);
          });
          toast('แยกฉากที่ตำแหน่งหัวเล่นแล้ว');
        }} />
        <ToolBtn icon={<Copy size={16} />} label="ทำสำเนา" onClick={() => update((d) => { const c = structuredClone(d.scenes[si]); c.id = uid(); c.texts.forEach((x) => (x.id = uid())); c.elements.forEach((x) => (x.id = uid())); d.scenes.splice(si + 1, 0, c); })} />
      </div>
      <Field label={`ความยาวฉาก: ${s.duration.toFixed(1)} วินาที (ตัด/ขยาย)`}>
        <input type="range" min={0.5} max={15} step={0.1} value={s.duration} onChange={(e) => up((x) => { x.duration = +e.target.value; }, false)} onPointerDown={() => update(() => {})} />
      </Field>
      <Field label="ภาพสินค้า">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {p.images.map((img, i) => (
            <button key={img} onClick={() => up((x) => { x.imageIndex = i; })} className={`shrink-0 rounded-xl overflow-hidden border-2 ${s.imageIndex === i ? 'border-violet-glow' : 'border-transparent'}`}>
              <AssetImg id={img} className="w-14 h-16" />
            </button>
          ))}
        </div>
      </Field>
      <Field label="การแสดงสินค้า">
        <Segmented value={s.product.mode} options={[{ value: 'card' as const, label: 'การ์ด' }, { value: 'full' as const, label: 'เต็มจอ' }, ...(p.aiClips?.length ? [{ value: 'ai' as const, label: 'วิดีโอ AI' }] : []), { value: 'hidden' as const, label: 'ซ่อน' }]} onChange={(v) => up((x) => { x.product.mode = v; })} />
      </Field>
      {s.product.mode === 'ai' && (p.aiClips?.length ?? 0) > 1 && (
        <Field label="เลือกคลิป AI">
          <div className="flex flex-wrap gap-2">{p.aiClips!.map((_, k) => <button key={k} className={`chip ${(s.product.clip ?? 0) === k ? 'chip-on' : ''}`} onClick={() => up((x) => { x.product.clip = k; })}>คลิป {k + 1}</button>)}</div>
        </Field>
      )}
      <AiClipButton p={p} si={si} update={update} toast={toast} />
      {s.product.mode === 'card' && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="ขนาด"><input type="range" min={0.25} max={1} step={0.01} value={s.product.scale} onChange={(e) => up((x) => { x.product.scale = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
          <Field label="แนวนอน"><input type="range" min={0.1} max={0.9} step={0.01} value={s.product.x} onChange={(e) => up((x) => { x.product.x = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
          <Field label="แนวตั้ง"><input type="range" min={0.15} max={0.85} step={0.01} value={s.product.y} onChange={(e) => up((x) => { x.product.y = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
        </div>
      )}
      <Field label="การเคลื่อนกล้อง">
        <div className="flex flex-wrap gap-2">{CAMERAS.map((c) => <button key={c.v} className={`chip ${s.camera === c.v ? 'chip-on' : ''}`} onClick={() => up((x) => { x.camera = c.v; })}>{c.l}</button>)}</div>
      </Field>
      <Field label="ทรานซิชันเข้าฉากนี้">
        <div className="flex flex-wrap gap-2">{TRANS.map((c) => <button key={c.v} disabled={si === 0 && c.v !== 'none'} className={`chip ${s.transition === c.v ? 'chip-on' : ''}`} onClick={() => up((x) => { x.transition = c.v; })}>{c.l}</button>)}</div>
      </Field>
      <Field label="พื้นหลัง">
        <div className="flex items-center gap-3">
          <Segmented value={s.background.type} options={[{ value: 'gradient', label: 'ไล่สี' }, { value: 'blur', label: 'เบลอรูป' }, { value: 'solid', label: 'สีเดียว' }]} onChange={(v) => up((x) => { x.background.type = v; })} />
          <input type="color" value={s.background.colors[0]} onChange={(e) => up((x) => { x.background.colors[0] = e.target.value; }, false)} aria-label="สีพื้นหลัง 1" />
          <input type="color" value={s.background.colors[1]} onChange={(e) => up((x) => { x.background.colors[1] = e.target.value; }, false)} aria-label="สีพื้นหลัง 2" />
        </div>
      </Field>
      <Field label="เอฟเฟกต์">
        <div className="flex flex-wrap gap-2">
          {([['particles', 'อนุภาคประกาย'], ['rays', 'ลำแสง'], ['glow', 'เรืองแสง'], ['spotlight', 'สปอตไลต์']] as const).map(([k, l]) => (
            <button key={k} className={`chip ${s.effects[k] ? 'chip-on' : ''}`} onClick={() => up((x) => { x.effects[k] = !x.effects[k]; })}>{l}</button>
          ))}
        </div>
      </Field>
      <button className="btn-danger w-full" disabled={p.scenes.length <= 1} onClick={() => { update((d) => { d.scenes.splice(si, 1); }); setSceneIdx(Math.max(0, si - 1)); }}><Trash2 size={16} /> ลบฉากนี้</button>
      <button className="btn-glass w-full" onClick={() => update((d) => {
        const look = LOOKS[d.style];
        d.scenes.splice(si + 1, 0, {
          ...structuredClone(d.scenes[si]), id: uid(), kind: 'features', duration: 3, texts: [{ id: uid(), text: 'ข้อความ', x: 0.5, y: 0.15, style: textStyle(look, look.headPreset, 0.07), anim: look.anims[0] }], elements: [], transition: look.transitions[0], sfx: look.sfx[0],
        });
      })}><Plus size={16} /> เพิ่มฉากใหม่ต่อจากนี้</button>
    </div>
  );
}

function AiClipButton({ p, si, update, toast }: { p: Project; si: number; update: Upd; toast: (s: string, k?: 'ok' | 'err' | 'info') => void }) {
  const [busy, setBusy] = useState(false);
  const s = p.scenes[si];
  return (
    <div className="card p-3 space-y-2">
      <button className="btn-glass w-full" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const a = await createAiClip(p.images[s.imageIndex] ?? p.images[0], p.product.category);
          update((d) => { d.aiClips = [...(d.aiClips ?? []), a.id]; d.scenes[si].product.mode = 'ai'; d.scenes[si].product.clip = d.aiClips.length - 1; });
          toast('สร้างวิดีโอ AI แล้ว');
        } catch (e) { toast((e as Error).message, 'err'); }
        finally { setBusy(false); }
      }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {busy ? 'AI กำลังสร้างวิดีโอ… (~1 นาที)' : p.aiClips?.length ? 'สร้างวิดีโอ AI ใหม่จากรูปฉากนี้' : 'สร้างวิดีโอ AI จากรูปฉากนี้'}</button>
      <p className="text-[11px] text-white/40">AI ฟรี (Wan 2.2 ผ่าน Hugging Face) มีโควตาจำกัดต่อวัน · AI อาจขยับรายละเอียดเล็กน้อย ฉากที่ต้องเห็นฉลากชัดควรใช้ “การ์ด”</p>
    </div>
  );
}

function ToolBtn({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className="card !rounded-2xl h-16 flex flex-col items-center justify-center gap-1 text-[12px] disabled:opacity-30 active:scale-95 transition">
      {icon}{label}
    </button>
  );
}

// ---------------------------------------------------------------- text panel
function TextPanel({ p, si, update, sel, setSel }: { p: Project; si: number; update: Upd; sel: Sel; setSel: (s: Sel) => void }) {
  const s = p.scenes[si];
  const tx = sel?.kind === 'text' ? s.texts.find((t) => t.id === sel.id) : undefined;
  const look = LOOKS[p.style];
  const up = (fn: (t: TextLayer) => void, history = true) => update((d) => { const t = d.scenes[si].texts.find((x) => x.id === tx!.id); if (t) fn(t); }, { history });
  const overflow = useMemo(() => {
    if (!tx) return false;
    const sz = outputSize(p.aspect, 540);
    return measureText(document.createElement('canvas').getContext('2d')!, tx, sz.width, sz.height).overflow;
  }, [tx, p.aspect]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {s.texts.map((t) => (
          <button key={t.id} onClick={() => setSel({ kind: 'text', id: t.id })} className={`chip max-w-[180px] ${tx?.id === t.id ? 'chip-on' : ''}`}><span className="truncate">{t.text || '(ว่าง)'}</span></button>
        ))}
        <button className="chip" onClick={() => addText(update, p, si, setSel)}><Plus size={14} /> เพิ่มข้อความ</button>
      </div>
      {!tx ? <p className="text-white/45 text-[14px]">แตะข้อความบนวิดีโอหรือเลือกจากรายการเพื่อแก้ไข · ลากเพื่อย้ายตำแหน่ง</p> : (
        <>
          <Field label="ข้อความ (ขึ้นบรรทัดใหม่ได้)">
            <textarea rows={2} className="input" value={tx.text} onChange={(e) => up((t) => { t.text = e.target.value; }, false)} onFocus={() => update(() => {})} />
          </Field>
          {overflow && <p className="text-amber-300 text-[13px]">⚠ ข้อความเกินขอบวิดีโอ ลองลดขนาดหรือย้ายตำแหน่ง</p>}
          <Field label="สไตล์ข้อความสำเร็จรูป">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((pr) => <button key={pr.v} className={`chip ${tx.style.preset === pr.v ? 'chip-on' : ''}`} onClick={() => up((t) => { t.style = { ...textStyle(look, pr.v, t.style.size, t.style.font), align: t.style.align }; })}>{pr.l}</button>)}
            </div>
          </Field>
          <Field label="ฟอนต์">
            <div className="flex flex-wrap gap-2">
              {FONTS.map((f) => <button key={f} style={{ fontFamily: f }} className={`chip ${tx.style.font === f ? 'chip-on' : ''}`} onClick={() => { document.fonts?.load(`700 30px "${f}"`); up((t) => { t.style.font = f; }); }}>{f} กขค</button>)}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`ขนาด ${Math.round(tx.style.size * 1000) / 10}%`}><input type="range" min={0.025} max={0.16} step={0.001} value={tx.style.size} onChange={(e) => up((t) => { t.style.size = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
            <Field label={`น้ำหนัก ${tx.style.weight}`}><input type="range" min={400} max={800} step={100} value={tx.style.weight} onChange={(e) => up((t) => { t.style.weight = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
            <Field label={`ระยะห่างตัวอักษร ${tx.style.letterSpacing}`}><input type="range" min={-4} max={30} step={1} value={tx.style.letterSpacing} onChange={(e) => up((t) => { t.style.letterSpacing = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
            <Field label="จัดตำแหน่ง">
              <Segmented value={tx.style.align} options={[{ value: 'left', label: 'ซ้าย' }, { value: 'center', label: 'กลาง' }, { value: 'right', label: 'ขวา' }]} onChange={(v) => up((t) => { t.style.align = v; })} />
            </Field>
          </div>
          <div className="flex items-end gap-4 flex-wrap">
            <Field label="สีตัวอักษร"><input type="color" value={tx.style.color} onChange={(e) => up((t) => { t.style.color = e.target.value; }, false)} /></Field>
            <Field label="สีไล่ระดับ">
              <div className="flex items-center gap-2">
                <input type="color" value={tx.style.color2 || '#ffffff'} onChange={(e) => up((t) => { t.style.color2 = e.target.value; }, false)} />
                {tx.style.color2 && <button className="chip !h-8" onClick={() => up((t) => { delete t.style.color2; })}>ล้าง</button>}
              </div>
            </Field>
            {tx.style.preset === 'label' && <Field label="สีป้าย"><input type="color" value={tx.style.bg || '#ffe14d'} onChange={(e) => up((t) => { t.style.bg = e.target.value; }, false)} /></Field>}
          </div>
          <Field label="แอนิเมชัน">
            <div className="flex flex-wrap gap-2">{ANIMS.map((a) => <button key={a.v} className={`chip ${tx.anim === a.v ? 'chip-on' : ''}`} onClick={() => up((t) => { t.anim = a.v; })}>{a.l}</button>)}</div>
          </Field>
          <button className="btn-danger w-full" onClick={() => { removeSel(update, si, { kind: 'text', id: tx.id }); setSel(null); }}><Trash2 size={16} /> ลบข้อความนี้</button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- graphics panel
function GraphicPanel({ p, si, update, sel, setSel }: { p: Project; si: number; update: Upd; sel: Sel; setSel: (s: Sel) => void }) {
  const s = p.scenes[si];
  const el = sel?.kind === 'el' ? s.elements.find((e) => e.id === sel.id) : undefined;
  const up = (fn: (e: ElementLayer) => void, history = true) => update((d) => { const e = d.scenes[si].elements.find((x) => x.id === el!.id); if (e) fn(e); }, { history });
  const add = (type: ElementLayer['type'], color: string, text?: string) => {
    const id = uid();
    const scale = type === 'badge' ? 0.18 : type === 'price' ? 0.11 : type === 'stars' ? 0.06 : 0.08;
    const label = type === 'price' ? (p.product.price ? `฿${p.product.price.replace(/[^\d,.]/g, '')}` : '฿—') : text;
    update((d) => { d.scenes[si].elements.push({ id, type, x: 0.5, y: 0.3, scale, color, text: label }); });
    setSel({ kind: 'el', id });
  };
  return (
    <div className="space-y-4">
      {el && (
        <div className="card p-4 space-y-3">
          <div className="font-semibold">{ELEMENT_LABEL[el.type]}</div>
          {(el.type === 'badge' || el.type === 'price' || el.type === 'ribbon') && (
            <Field label="ข้อความบนกราฟิก"><input className="input" value={el.text || ''} onChange={(e) => up((x) => { x.text = e.target.value; }, false)} onFocus={() => update(() => {})} /></Field>
          )}
          <div className="flex items-end gap-4">
            <Field label="สี"><input type="color" value={el.color} onChange={(e) => up((x) => { x.color = e.target.value; }, false)} /></Field>
            <div className="flex-1"><Field label="ขนาด"><input type="range" min={0.03} max={0.35} step={0.005} value={el.scale} onChange={(e) => up((x) => { x.scale = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field></div>
          </div>
          <button className="btn-danger w-full" onClick={() => { removeSel(update, si, { kind: 'el', id: el.id }); setSel(null); }}><Trash2 size={16} /> ลบกราฟิก</button>
        </div>
      )}
      {s.elements.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {s.elements.map((e) => <button key={e.id} className={`chip ${el?.id === e.id ? 'chip-on' : ''}`} onClick={() => setSel({ kind: 'el', id: e.id })}>{ELEMENT_LABEL[e.type]}</button>)}
        </div>
      )}
      <p className="text-[13px] text-white/50">คลังกราฟิก — แตะเพื่อเพิ่ม แล้วลากบนวิดีโอเพื่อจัดตำแหน่ง</p>
      {ELEMENT_LIBRARY.map((g) => (
        <div key={g.cat}>
          <div className="text-[13px] text-white/60 mb-1.5 flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: g.color }} />{g.cat}</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {g.items.map((it, k) => (
              <button key={k} className="chip !h-10" onClick={() => add(it.type, g.color, it.text)}>{ELEMENT_LABEL[it.type]}{it.text ? ` “${it.text}”` : ''}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- audio panel
function AudioPanel({ p, si, update }: { p: Project; si: number; update: Upd }) {
  const toast = useToast();
  const [uploads, setUploads] = useState<Asset[]>([]);
  const [rights, setRights] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { listAssets('audio').then(setUploads); }, []);
  const a = p.audio;
  const up = (fn: (a: Project['audio']) => void, history = true) => update((d) => fn(d.audio), { history });
  async function onFile(f?: File) {
    if (!f) return;
    if (!rights) { toast('กรุณายืนยันสิทธิ์การใช้งานเพลงก่อน', 'err'); return; }
    const asset = await putAsset(f, f.name, 'audio', 'ผู้ใช้ยืนยันว่ามีสิทธิ์ใช้งานเชิงพาณิชย์');
    setUploads((l) => [...l, asset]);
    up((x) => { x.music = `asset:${asset.id}`; x.musicStart = 0; });
    toast('เพิ่มเพลงแล้ว');
  }
  const s = p.scenes[si];
  return (
    <div className="space-y-4">
      <Field label="เพลงประกอบ (สร้างโดยแอป ใช้เชิงพาณิชย์ได้)">
        <div className="grid grid-cols-2 gap-2">
          {MOODS.map((m) => (
            <button key={m.id} onClick={() => up((x) => { x.music = `gen:${m.id}`; })} className={`chip !h-auto py-2 flex-col !items-start text-left ${a.music === `gen:${m.id}` ? 'chip-on' : ''}`}>
              <span className="font-medium">{m.label}</span><span className="text-[11px] opacity-70 whitespace-normal">{m.desc}</span>
            </button>
          ))}
        </div>
      </Field>
      <p className="text-[11px] text-white/40">สิทธิ์: {GENERATED_LICENSE}</p>
      {uploads.length > 0 && (
        <Field label="เพลงที่อัปโหลด">
          <div className="flex flex-wrap gap-2">
            {uploads.map((u) => <button key={u.id} className={`chip ${a.music === `asset:${u.id}` ? 'chip-on' : ''}`} onClick={() => up((x) => { x.music = `asset:${u.id}`; })}><span className="truncate max-w-[160px]">{u.name}</span></button>)}
          </div>
        </Field>
      )}
      <div className="card p-3 space-y-2">
        <label className="flex gap-2 text-[13px] text-white/70"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1" /> ฉันมีสิทธิ์ใช้เพลงนี้ในเชิงพาณิชย์ (ห้ามใช้เพลงติดลิขสิทธิ์/เพลงฮิตโดยไม่ได้รับอนุญาต)</label>
        <button className="btn-glass w-full" onClick={() => (rights ? file.current?.click() : toast('กรุณาติ๊กยืนยันสิทธิ์ก่อน', 'err'))}><Upload size={16} /> อัปโหลดเพลงของฉัน</button>
        <input ref={file} type="file" accept="audio/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <button className={`chip ${!a.music ? 'chip-on' : ''}`} onClick={() => up((x) => { x.music = null; })}>ไม่ใช้เพลง</button>
      <Field label={`ระดับเสียงเพลง ${Math.round(a.musicVolume * 100)}%`}><input type="range" min={0} max={1} step={0.01} value={a.musicVolume} onChange={(e) => up((x) => { x.musicVolume = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
      {(p.aiClips?.length ?? 0) > 0 && (
        <Field label={`เสียงจากคลิป AI/Flow (เสียงพากย์ไทย) ${Math.round((a.clipVolume ?? 1) * 100)}%`}><input type="range" min={0} max={1} step={0.01} value={a.clipVolume ?? 1} onChange={(e) => up((x) => { x.clipVolume = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
      )}
      <Field label={`ระดับเสียงเอฟเฟกต์ ${Math.round(a.sfxVolume * 100)}%`}><input type="range" min={0} max={1} step={0.01} value={a.sfxVolume} onChange={(e) => up((x) => { x.sfxVolume = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`เฟดเข้า ${a.fadeIn.toFixed(1)} วิ`}><input type="range" min={0} max={4} step={0.1} value={a.fadeIn} onChange={(e) => up((x) => { x.fadeIn = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
        <Field label={`เฟดออก ${a.fadeOut.toFixed(1)} วิ`}><input type="range" min={0} max={4} step={0.1} value={a.fadeOut} onChange={(e) => up((x) => { x.fadeOut = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
      </div>
      {a.music?.startsWith('asset:') && (
        <Field label={`ตัดเพลง: เริ่มที่วินาที ${a.musicStart.toFixed(1)}`}><input type="range" min={0} max={120} step={0.5} value={a.musicStart} onChange={(e) => up((x) => { x.musicStart = +e.target.value; }, false)} onPointerDown={() => update(() => {})} /></Field>
      )}
      <Field label={`เอฟเฟกต์เสียงตอนเริ่มฉาก ${si + 1}`}>
        <div className="flex flex-wrap gap-2">
          <button className={`chip ${!s.sfx ? 'chip-on' : ''}`} onClick={() => update((d) => { d.scenes[si].sfx = null; })}>ไม่มี</button>
          {SFX.map((x) => <button key={x.id} className={`chip ${s.sfx === x.id ? 'chip-on' : ''}`} onClick={() => update((d) => { d.scenes[si].sfx = x.id as SfxId; })}>{x.label}</button>)}
        </div>
      </Field>
      <p className="text-[12px] text-white/40 flex items-center gap-1"><ImageIcon size={12} /> เสียงพากย์: ปิดไว้ (ยังไม่รองรับในเวอร์ชันนี้)</p>
    </div>
  );
}
