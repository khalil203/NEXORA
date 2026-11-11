import { AlertTriangle, ArrowRight, Bot, ExternalLink, Zap, Camera, Check, ChevronDown, ChevronUp, Clapperboard, ImagePlus, Info, Loader2, Palette, RefreshCw, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { aiReady, analyzeProduct, applyAi } from '../lib/ai';
import { AssetImg } from '../components/ProjectThumb';
import { PreviewPlayer } from '../components/Player';
import { Field, PageHeader, Segmented, Sheet, useToast } from '../components/ui';
import { getAsset, logActivity, putAsset, saveProject, uid } from '../lib/db';
import { useBrandKits, useProject, useRenderAssets } from '../lib/hooks';
import { ACCEPT, darken, dominantColors, normalizeImage } from '../lib/images';
import { CATEGORIES, generateCaptions, generateStrategy, missingInfo, MOOD_FOR_STYLE, STYLE_LABEL, VERSION_PRESETS } from '../lib/marketing';
import { newProject } from '../lib/project';
import { getSettings } from '../lib/settings';
import { generateStoryboard, KIND_LABEL } from '../lib/storyboard';
import type { Aspect, BrandKit, CategoryId, Duration, Project, Strategy, StyleId } from '../lib/types';
import { personalTemplates, TEMPLATES } from './Templates';
import { startBatch, startBoardJob, type StyleChoice } from '../lib/pipeline';

const DURATIONS: Duration[] = [10, 15, 30, 45, 60];
const ASPECTS: { value: Aspect; label: string }[] = [{ value: '9:16', label: '9:16 แนวตั้ง' }, { value: '1:1', label: '1:1' }, { value: '16:9', label: '16:9' }];

export default function Create() {
  const { id } = useParams();
  return id ? <Wizard id={id} /> : <NewSetup />;
}

// ---------------------------------------------------------------- step 0: setup + upload
const MAX_AUTO = 20;

function NewSetup() {
  const nav = useNavigate();
  const toast = useToast();
  const [q] = useSearchParams();
  const s = getSettings();
  const tpl = TEMPLATES.find((t) => t.id === q.get('template'));
  const mine = personalTemplates().find((t) => t.id === q.get('mine'));
  const [style, setStyle] = useState<StyleChoice>(mine?.style ?? tpl?.style ?? 'auto');
  const [aspect, setAspect] = useState<Aspect>(mine?.aspect ?? s.aspect);
  const [duration, setDuration] = useState<Duration>(mine?.duration ?? tpl?.duration ?? s.duration);
  const [versions, setVersions] = useState(q.get('multi') ? 4 : 1);
  const [autoExport, setAutoExport] = useState(true);
  const [showOpts, setShowOpts] = useState(false);
  const { kits } = useBrandKits();
  const [kitId, setKitId] = useState<string>(s.defaultBrandKit ?? '');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string[] | null>(null); // uploaded ids awaiting "same or different?"
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const board = useRef<HTMLInputElement>(null);
  const hasPass = aiReady();
  const auto = hasPass && !mine;

  async function store(files: File[]) {
    const ids: string[] = [];
    for (const f of files) ids.push((await putAsset(await normalizeImage(f), f.name, 'image')).id);
    return ids;
  }

  function launch(groups: string[][]) {
    startBatch(groups, versions, style, { aspect, duration, kitId: kitId || undefined, autoExport });
    setPending(null);
    nav('/batch');
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const max = auto ? MAX_AUTO : 5;
      const files = [...list].slice(0, max);
      if (list.length > max) toast(`ใช้ได้สูงสุด ${max} รูป ระบบเลือก ${max} รูปแรกให้`, 'info');
      const ids = await store(files);
      if (auto) {
        if (ids.length === 1) launch([ids]);
        else setPending(ids);
        return;
      }
      // manual (no AI) — single project wizard
      const kit = kits.find((k) => k.id === kitId) ?? null;
      const st: StyleId = style === 'auto' ? 'viral' : style;
      const p = newProject(st, kit);
      p.style = st; p.aspect = aspect; p.duration = duration; p.audio.music = `gen:${MOOD_FOR_STYLE[st]}`;
      p.images = ids.slice(0, 5);
      if (mine) {
        p.scenes = structuredClone(mine.scenes).map((sc) => ({ ...sc, id: uid(), imageIndex: Math.min(sc.imageIndex, p.images.length - 1) }));
        p.audio = { ...mine.audio };
      }
      p.name = `โฆษณา ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`;
      await saveProject(p);
      await logActivity(`สร้างโปรเจกต์ใหม่ (${ids.length} รูป)`, p.id);
      nav(`/create/${p.id}?step=info${versions > 1 ? '&multi=1' : ''}`, { replace: true });
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  const videosFor = (n: number) => n * versions;

  return (
    <div className="animate-in space-y-5">
      <PageHeader title="สร้างโฆษณาใหม่" back sub={mine ? `จากเทมเพลต: ${mine.name}` : tpl ? `เทมเพลต: ${tpl.name}` : auto ? 'อัปโหลดรูป แล้ว AI ทำให้ทั้งหมด' : 'อัปโหลดรูปสินค้า'} />

      <section className="rounded-[28px] bg-hero p-5 text-center shadow-glow">
        <div className="w-16 h-16 rounded-2xl bg-white/25 grid place-items-center mx-auto mb-3"><ImagePlus size={30} /></div>
        <h2 className="thai-display text-xl font-semibold">{auto ? `อัปโหลดรูปสินค้า (สูงสุด ${MAX_AUTO} รูป)` : 'อัปโหลดรูปสินค้า 1–5 รูป'}</h2>
        <p className="text-white/85 text-[14px] mt-1">{auto ? 'เลือกหลายรูปพร้อมกันได้ — AI จะวิเคราะห์ สร้าง และส่งออกวิดีโอให้ทุกตัว' : 'JPG, PNG, WebP · ใช้รูปจริงโดยไม่แก้โลโก้หรือฉลาก'}</p>
        <p className="text-[13px] mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1">
          <Bot size={14} /> {auto ? `อัตโนมัติ 100% · ${versions} วิดีโอต่อสินค้า` : hasPass ? 'โหมดเทมเพลต' : 'AI อัตโนมัติปิดอยู่ (เปิดในตั้งค่า)'}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button disabled={busy} onClick={() => cam.current?.click()} className="h-14 rounded-full bg-white/25 border border-white/40 font-semibold flex items-center justify-center gap-2"><Camera size={18} /> ถ่ายรูป</button>
          <button disabled={busy} onClick={() => gal.current?.click()} className="h-14 rounded-full bg-white text-ink-900 font-semibold flex items-center justify-center gap-2">
            {busy ? <Loader2 className="animate-spin" size={18} /> : <ImagePlus size={18} />} เลือกรูป
          </button>
        </div>
        <input ref={cam} type="file" accept={ACCEPT} capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        <input ref={gal} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        <input ref={board} type="file" accept={ACCEPT} hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          setBusy(true);
          try {
            const a = await putAsset(f, f.name, 'image'); // keep full resolution: panels are small
            startBoardJob(a.id, { aspect: '9:16', duration, kitId: kitId || undefined, autoExport: true });
            nav('/batch');
          } catch (err) { toast((err as Error).message, 'err'); } finally { setBusy(false); }
        }} />
        {auto && <button disabled={busy} onClick={() => board.current?.click()} className="mt-3 w-full h-12 rounded-full bg-black/25 border border-white/30 text-[14px] font-medium flex items-center justify-center gap-2"><ImagePlus size={16} /> มีสตอรี่บอร์ดแล้ว (เช่น จาก ChatGPT) → ทำวิดีโอเลย</button>}
      </section>

      <section className="card p-4 space-y-3">
        <Field label="จำนวนวิดีโอต่อสินค้า (คนละสไตล์)">
          <Segmented value={versions} options={[1, 2, 3, 4].map((n) => ({ value: n, label: n === 1 ? '1 วิดีโอ' : `${n}` }))} onChange={setVersions} />
        </Field>
        <button className="w-full flex items-center justify-between text-[14px] text-white/70 pt-1" onClick={() => setShowOpts((v) => !v)}>
          ตัวเลือกเพิ่มเติม (ไม่บังคับ — AI เลือกให้) {showOpts ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showOpts && (
          <div className="space-y-4 pt-1">
            <Field label="รูปแบบวิดีโอ"><Segmented value={aspect} options={ASPECTS} onChange={setAspect} /></Field>
            <Field label="ความยาว (วินาที)"><Segmented value={duration} options={DURATIONS.map((d) => ({ value: d, label: `${d}` }))} onChange={setDuration} /></Field>
            <Field label="สไตล์โฆษณา">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setStyle('auto')} className={`chip ${style === 'auto' ? 'chip-on' : ''}`}><Bot size={14} /> AI เลือกให้</button>
                {(Object.keys(STYLE_LABEL) as StyleId[]).map((k) => (
                  <button key={k} onClick={() => setStyle(k)} className={`chip ${style === k ? 'chip-on' : ''}`}>{STYLE_LABEL[k]}</button>
                ))}
              </div>
              {versions > 1 && <p className="text-[12px] text-white/40 mt-1">หลายวิดีโอต่อสินค้าจะใช้สไตล์ หรูหรา / ไวรัล / มินิมอล / เน้นขาย</p>}
            </Field>
            <Field label="แบรนด์คิท">
              <select className="input" value={kitId} onChange={(e) => setKitId(e.target.value)}>
                <option value="">ไม่ใช้แบรนด์คิท</option>
                {kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-3 text-[14px]"><input type="checkbox" className="w-5 h-5" checked={autoExport} onChange={(e) => setAutoExport(e.target.checked)} /> ส่งออกเป็นไฟล์วิดีโอ MP4 อัตโนมัติ</label>
          </div>
        )}
      </section>

      <Sheet open={!!pending} onClose={() => setPending(null)} title={`อัปโหลด ${pending?.length ?? 0} รูป — รูปเหล่านี้คือ?`}>
        {pending && (
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">{pending.map((id) => <AssetImg key={id} id={id} className="w-14 h-16 rounded-xl shrink-0" />)}</div>
            <button className="card w-full p-4 text-left active:scale-[.98] transition" onClick={() => launch(pending.map((id) => [id]))}>
              <div className="font-semibold">สินค้าคนละชิ้น</div>
              <div className="text-[13px] text-white/55">1 รูป = 1 สินค้า → ได้ {videosFor(pending.length)} วิดีโอ</div>
            </button>
            <button className="card w-full p-4 text-left active:scale-[.98] transition" onClick={() => launch([pending.slice(0, 5)])}>
              <div className="font-semibold">สินค้าเดียวกัน (หลายมุม)</div>
              <div className="text-[13px] text-white/55">ใช้รูปทั้งหมดในวิดีโอเดียว → ได้ {videosFor(1)} วิดีโอ{pending.length > 5 ? ' (ใช้ 5 รูปแรก)' : ''}</div>
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- wizard
type Step = 'info' | 'strategy' | 'story';
const STEPS: { id: Step; label: string }[] = [{ id: 'info', label: 'ข้อมูลสินค้า' }, { id: 'strategy', label: 'กลยุทธ์' }, { id: 'story', label: 'สตอรี่บอร์ด' }];

function Wizard({ id }: { id: string }) {
  const nav = useNavigate();
  const [q, setQ] = useSearchParams();
  const step = (q.get('step') as Step) || 'info';
  const { project, missing, update, saveNow } = useProject(id);
  const { kits } = useBrandKits();
  const kit = kits.find((k) => k.id === project?.brandKitId) ?? null;
  if (missing) return <div className="pt-10 text-center text-white/60">ไม่พบโปรเจกต์นี้</div>;
  if (!project) return <div className="pt-10 text-center text-white/40"><Loader2 className="animate-spin mx-auto" /></div>;
  const go = (s: Step) => { saveNow(); setQ({ step: s, ...(q.get('multi') ? { multi: '1' } : {}) }); window.scrollTo(0, 0); };
  const idx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="animate-in space-y-5">
      <PageHeader title={project.name} back="/" sub={`ขั้นที่ ${idx + 2} จาก 4 · ${STEPS[idx].label}`} />
      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <button key={s.id} onClick={() => go(s.id)} className={`flex-1 h-1.5 rounded-full ${i <= idx ? 'bg-accent' : 'bg-white/10'}`} aria-label={s.label} />
        ))}
      </div>
      {step === 'info' && <InfoStep p={project} update={update} kit={kit} auto={!!q.get('auto')} onNext={() => go('strategy')} onQuick={() => go('story')} />}
      {step === 'strategy' && <StrategyStep p={project} update={update} kit={kit} onNext={() => go('story')} />}
      {step === 'story' && <StoryStep p={project} update={update} kit={kit} multi={!!q.get('multi')} onEdit={async () => { await saveNow(); nav(`/editor/${project.id}`); }} />}
    </div>
  );
}

type Upd = (fn: (d: Project) => void, o?: { history?: boolean }) => void;

// ---------------------------------------------------------------- info
function InfoStep({ p, update, kit, auto, onNext, onQuick }: { p: Project; update: Upd; kit: BrandKit | null; auto: boolean; onNext: () => void; onQuick: () => void }) {
  const toast = useToast();
  const [ai, setAi] = useState<'idle' | 'running' | 'error'>('idle');
  const [aiErr, setAiErr] = useState('');
  const ran = useRef(false);

  // One tap: strategy + storyboard + captions, straight to the video preview.
  const quick = () => {
    update((d) => {
      d.strategy = generateStrategy(d.product, d.style, kit?.cta);
      d.scenes = generateStoryboard({ product: d.product, strategy: d.strategy, style: d.style, duration: d.duration, imageCount: d.images.length, font: kit?.font, brandColors: kit ? [kit.primary, kit.secondary] : undefined });
      d.captions = generateCaptions(d.product, d.style, d.strategy);
      d.status = 'ready';
    });
    setTimeout(onQuick, 50);
  };

  async function runAi() {
    setAi('running'); setAiErr('');
    try {
      const r = await analyzeProduct(p.images);
      update((d) => { d.product = applyAi(d.product, r); if (d.name.startsWith('โฆษณา ') && r.name) d.name = r.name; });
      setAi('idle');
      toast(`AI ระบุสินค้าแล้ว: ${r.name}`);
      if (getSettings().aiAutoVideo && r.name) setTimeout(quick, 300);
    } catch (e) {
      setAi('error'); setAiErr((e as Error).message);
    }
  }
  useEffect(() => {
    if (auto && !ran.current && aiReady() && !p.product.ai && !p.product.name) { ran.current = true; runAi(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);
  const gal = useRef<HTMLInputElement>(null);
  const [colors, setColors] = useState<string[]>([]);
  const set = (k: keyof Project['product']) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    update((d) => { (d.product as unknown as Record<string, string>)[k] = e.target.value; }, { history: false });
  const miss = missingInfo(p.product);

  useEffect(() => {
    if (!p.images[0]) return;
    getAsset(p.images[0]).then((a) => a && dominantColors(a.blob).then(setColors)).catch(() => {});
  }, [p.images]);

  async function addMore(files: FileList | null) {
    if (!files) return;
    const room = 5 - p.images.length;
    if (room <= 0) { toast('มีครบ 5 รูปแล้ว', 'info'); return; }
    const ids: string[] = [];
    try {
      for (const f of [...files].slice(0, room)) ids.push((await putAsset(await normalizeImage(f), f.name, 'image')).id);
      update((d) => { d.images.push(...ids); });
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  const move = (i: number, dir: -1 | 1) => update((d) => { const j = i + dir; if (j < 0 || j >= d.images.length) return; [d.images[i], d.images[j]] = [d.images[j], d.images[i]]; });

  return (
    <>
      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">รูปสินค้า ({p.images.length}/5)</h3>
          <button className="chip" onClick={() => gal.current?.click()} disabled={p.images.length >= 5}><ImagePlus size={15} /> เพิ่มรูป</button>
          <input ref={gal} type="file" accept={ACCEPT} multiple hidden onChange={(e) => addMore(e.target.files)} />
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar">
          {p.images.map((img, i) => (
            <div key={img} className="relative shrink-0">
              <AssetImg id={img} className="w-24 h-28 rounded-2xl" />
              {i === 0 && <span className="absolute top-1.5 left-1.5 text-[10px] bg-accent rounded-full px-2">รูปหลัก</span>}
              <div className="flex justify-center gap-1 mt-1">
                <button className="w-7 h-7 rounded-full bg-white/10 grid place-items-center" onClick={() => move(i, -1)} aria-label="เลื่อนซ้าย"><ChevronUp size={14} className="-rotate-90" /></button>
                <button className="w-7 h-7 rounded-full bg-white/10 grid place-items-center" onClick={() => move(i, 1)} aria-label="เลื่อนขวา"><ChevronDown size={14} className="-rotate-90" /></button>
                <button className="w-7 h-7 rounded-full bg-red-500/20 text-red-300 grid place-items-center" disabled={p.images.length <= 1} onClick={() => update((d) => { d.images.splice(i, 1); })} aria-label="ลบรูป"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
        {colors.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-white/60">
            <Palette size={15} /> สีหลักจากรูปสินค้า:
            {colors.map((c) => <span key={c} className="w-6 h-6 rounded-full border border-white/20" style={{ background: c }} title={c} />)}
          </div>
        )}
      </section>

      {ai === 'running' ? (
        <section className="rounded-3xl bg-hero p-5 shadow-glow text-center">
          <Loader2 className="animate-spin mx-auto mb-2" size={28} />
          <div className="thai-display font-semibold text-lg">AI กำลังวิเคราะห์สินค้า…</div>
          <p className="text-white/85 text-[13px] mt-1">อ่านฉลาก → ระบุชื่อสินค้า → ค้นข้อมูลในอินเทอร์เน็ต (ประมาณ 5–20 วินาที)</p>
        </section>
      ) : p.product.ai ? (
        <section className="rounded-2xl border border-violet-glow/40 bg-violet-glow/10 p-3 text-[13px] text-white/85 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold"><Bot size={16} className="text-violet-glow" /> AI กรอกข้อมูลให้แล้ว — โปรดตรวจความถูกต้อง
            {p.product.ai.confidence && <span className={`ml-auto text-[11px] rounded-full px-2 py-0.5 ${p.product.ai.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-200' : p.product.ai.confidence === 'medium' ? 'bg-amber-500/20 text-amber-200' : 'bg-red-500/20 text-red-200'}`}>ความมั่นใจ {({ high: 'สูง', medium: 'กลาง', low: 'ต่ำ' } as const)[p.product.ai.confidence]}</span>}
          </div>
          {p.product.ai.notes && <p className="text-amber-100/90">⚠ {p.product.ai.notes}</p>}
          {p.product.ai.priceHint && <p className="text-white/60">ราคาที่พบออนไลน์: {p.product.ai.priceHint} (ใส่ราคาขายของคุณเองด้านล่าง)</p>}
          {p.product.ai.sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {p.product.ai.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="chip !h-7 text-[11px] max-w-[200px]"><ExternalLink size={11} /><span className="truncate">{s.title || s.url}</span></a>)}
            </div>
          )}
          <p className="text-[11px] text-white/40">{p.product.ai.provider}</p>
          <button className="chip !h-8 text-[12px]" onClick={runAi}><RefreshCw size={13} /> วิเคราะห์ใหม่</button>
        </section>
      ) : aiReady() ? (
        <button className="btn-glass w-full" onClick={runAi}><Bot size={18} /> ให้ AI อ่านรูปและค้นข้อมูลอัตโนมัติ</button>
      ) : (
        <section className="rounded-2xl border border-sky-glow/30 bg-sky-glow/10 p-3 text-[13px] text-white/80 flex gap-2">
          <Info size={18} className="shrink-0 text-sky-glow mt-0.5" />
          <span>อยากอัปโหลดรูปอย่างเดียวแล้วให้ AI กรอกข้อมูลให้? <Link to="/settings" className="underline text-sky-glow">เปิด AI วิเคราะห์อัตโนมัติในตั้งค่า</Link> — ระบบจะไม่เดาสเปก ส่วนผสม หรือคำรับรองที่ไม่มีหลักฐาน</span>
        </section>
      )}
      {ai === 'error' && <p className="rounded-2xl bg-red-500/10 border border-red-400/30 text-red-200 text-[13px] p-3">AI วิเคราะห์ไม่สำเร็จ: {aiErr} — กรอกเองได้ หรือกด “ให้ AI อ่านรูป” อีกครั้ง</p>}

      {ai !== 'running' && (<>
      <section className="card p-4 space-y-4">
        <Field label="ชื่อสินค้า *"><input className="input" value={p.product.name} onChange={set('name')} placeholder="เช่น เซรั่มวิตามินซี" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="แบรนด์"><input className="input" value={p.product.brand} onChange={set('brand')} /></Field>
          <Field label="หมวดหมู่">
            <select className="input" value={p.product.category} onChange={set('category')}>
              {(Object.keys(CATEGORIES) as CategoryId[]).map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="คำอธิบายสินค้า *"><textarea rows={2} className="input" value={p.product.description} onChange={set('description')} placeholder="สินค้าคืออะไร ใช้ทำอะไร" /></Field>
        <Field label="จุดเด่น/คุณสมบัติจริง * (บรรทัดละ 1 ข้อ)" hint="ใส่เฉพาะข้อมูลที่ถูกต้อง เช่น สิ่งที่เขียนบนฉลาก — ข้อมูลนี้จะถูกใช้ในวิดีโอและแคปชัน">
          <textarea rows={4} className="input" value={p.product.features} onChange={set('features')} placeholder={'ขนาด 30 มล.\nเนื้อบางเบา ซึมไว\nมีเลข อย.'} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ราคา (บาท)"><input className="input" inputMode="decimal" value={p.product.price} onChange={set('price')} placeholder="ไม่บังคับ" /></Field>
          <Field label="โปรโมชั่น (ถ้ามีจริง)"><input className="input" value={p.product.promo} onChange={set('promo')} placeholder="เช่น ซื้อ 1 แถม 1" /></Field>
        </div>
        <Field label="กลุ่มลูกค้าเป้าหมาย" hint="เว้นว่างได้ ระบบจะแนะนำจากหมวดหมู่"><input className="input" value={p.product.audience} onChange={set('audience')} /></Field>
        <Field label="ลิงก์สินค้า / ลิงก์แอฟฟิลิเอต"><input className="input" type="url" inputMode="url" value={p.product.url} onChange={set('url')} placeholder="https://" /></Field>
        <Field label="ชื่อโปรเจกต์"><input className="input" value={p.name} onChange={(e) => update((d) => { d.name = e.target.value; }, { history: false })} /></Field>
      </section>

      {miss.length > 0 && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-[13px] text-amber-100 flex gap-2">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>ข้อมูลที่ยังขาด: {miss.join(', ')} — กรอกเพื่อให้โฆษณาชัดเจนและซื่อสัตย์</span>
        </div>
      )}
      <button className="btn-primary w-full !h-14 text-base" disabled={!p.product.name.trim()} onClick={quick}><Zap size={18} /> สร้างวิดีโอเลย</button>
      <button className="btn-glass w-full" disabled={!p.product.name.trim()} onClick={onNext}>ปรับกลยุทธ์ทีละขั้น <ArrowRight size={18} /></button>
      </>)}
    </>
  );
}

// ---------------------------------------------------------------- strategy
const STRAT_FIELDS: [keyof Strategy, string, number][] = [
  ['positioning', '1. การวางตำแหน่งสินค้า', 2], ['audience', '2. กลุ่มเป้าหมาย', 2], ['usp', '3. จุดขายหลัก (USP)', 2],
  ['painPoints', '4. ปัญหาของลูกค้า', 3], ['emotional', '5. มุมขายเชิงอารมณ์', 2], ['functional', '6. มุมขายเชิงประโยชน์', 3],
  ['hook', '7. ฮุกโฆษณา', 1], ['structure', '8. โครงสร้างวิดีโอที่แนะนำ', 4], ['cta', '9. Call to Action', 1], ['caption', '10. แคปชันการตลาด', 4],
];

function StrategyStep({ p, update, kit, onNext }: { p: Project; update: Upd; kit: BrandKit | null; onNext: () => void }) {
  const gen = () => update((d) => { d.strategy = generateStrategy(d.product, d.style, kit?.cta); });
  useEffect(() => { if (!p.strategy) gen(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  if (!p.strategy) return null;
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="chip !h-8 text-[12px]"><Sparkles size={14} /> สร้างด้วยกฎการตลาด (ฟรี ออฟไลน์)</span>
        <button className="chip !h-8 text-[12px] ml-auto" onClick={gen}><RefreshCw size={14} /> สร้างใหม่</button>
      </div>
      <Field label="สไตล์โฆษณา">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STYLE_LABEL) as StyleId[]).map((k) => (
            <button key={k} onClick={() => update((d) => { d.style = k; d.audio.music = `gen:${MOOD_FOR_STYLE[k]}`; d.strategy = generateStrategy(d.product, k, kit?.cta); })} className={`chip ${p.style === k ? 'chip-on' : ''}`}>{STYLE_LABEL[k]}</button>
          ))}
        </div>
      </Field>
      <section className="card p-4 space-y-4">
        {STRAT_FIELDS.map(([k, label, rows]) => (
          <Field key={k} label={label}>
            <textarea rows={rows} className="input" value={p.strategy![k]} onChange={(e) => update((d) => { d.strategy![k] = e.target.value; }, { history: false })} />
          </Field>
        ))}
      </section>
      <p className="text-[12px] text-white/40">ทุกช่องแก้ไขได้ · ระบบไม่สร้างความเร่งด่วนปลอม รีวิวปลอม หรือคำกล่าวอ้างที่ไม่มีข้อมูลรองรับ</p>
      <button className="btn-primary w-full" onClick={onNext}>ต่อไป: สตอรี่บอร์ด <ArrowRight size={18} /></button>
    </>
  );
}

// ---------------------------------------------------------------- storyboard + versions
type Job = { style: StyleId; label: string; status: 'waiting' | 'processing' | 'completed' | 'failed'; projectId?: string; error?: string };

function StoryStep({ p, update, kit, multi, onEdit }: { p: Project; update: Upd; kit: BrandKit | null; multi: boolean; onEdit: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const { assets, ready } = useRenderAssets(p);
  const [colorsFromProduct, setCFP] = useState<[string, string] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [picked, setPicked] = useState<StyleId[]>(multi ? VERSION_PRESETS.map((v) => v.style) : []);

  useEffect(() => {
    if (!p.images[0]) return;
    getAsset(p.images[0]).then((a) => a && dominantColors(a.blob, 2)).then((c) => c && c[0] && setCFP([darken(c[0], 0.3), c[0]])).catch(() => {});
  }, [p.images]);

  const brandColors = kit ? ([kit.primary, kit.secondary] as [string, string]) : null;
  const build = (d: Project, style: StyleId, useProductColors = false) => {
    d.scenes = generateStoryboard({
      product: d.product, strategy: d.strategy, style, duration: d.duration, imageCount: d.images.length,
      font: kit?.font, brandColors: useProductColors && colorsFromProduct ? colorsFromProduct : brandColors ?? undefined,
    });
    d.captions = generateCaptions(d.product, style, d.strategy);
    d.status = 'ready';
  };
  useEffect(() => { if (!p.scenes.length) update((d) => build(d, d.style)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function runVersions() {
    const list: Job[] = VERSION_PRESETS.filter((v) => picked.includes(v.style)).map((v) => ({ ...v, status: 'waiting' }));
    setJobs(list);
    for (let i = 0; i < list.length; i++) await runJob(list, i);
  }
  async function runJob(list: Job[], i: number) {
    list[i] = { ...list[i], status: 'processing', error: undefined };
    setJobs([...list]);
    try {
      await new Promise((r) => setTimeout(r, 120));
      const v = structuredClone(p);
      v.id = uid();
      v.createdAt = Date.now();
      v.style = list[i].style;
      v.versionLabel = list[i].label;
      v.name = `${p.product.name || p.name} — ${list[i].label}`;
      v.exports = [];
      v.audio.music = `gen:${MOOD_FOR_STYLE[v.style]}`;
      v.strategy = generateStrategy(v.product, v.style, kit?.cta);
      build(v, v.style);
      await saveProject(v);
      await logActivity(`สร้างเวอร์ชัน ${list[i].label}`, v.id);
      list[i] = { ...list[i], status: 'completed', projectId: v.id };
    } catch (e) {
      list[i] = { ...list[i], status: 'failed', error: (e as Error).message };
    }
    setJobs([...list]);
  }

  const total = useMemo(() => p.scenes.reduce((t, s) => t + s.duration, 0), [p.scenes]);
  if (!p.scenes.length) return null;

  return (
    <>
      <PreviewPlayer scenes={p.scenes} assets={assets} aspect={p.aspect} audio={p.audio} clipIds={p.aiClips} />
      {!ready && <p className="text-center text-white/40 text-[13px]">กำลังโหลดรูป…</p>}
      <div className="flex flex-wrap gap-2">
        <button className="chip" onClick={() => { update((d) => build(d, d.style)); toast('สร้างสตอรี่บอร์ดใหม่แล้ว'); }}><RefreshCw size={14} /> สร้างใหม่</button>
        {colorsFromProduct && <button className="chip" onClick={() => update((d) => build(d, d.style, true))}><Palette size={14} /> ใช้สีจากสินค้า</button>}
        <span className="chip !border-transparent !bg-transparent">{p.scenes.length} ฉาก · {total.toFixed(1)} วิ</span>
      </div>

      <section className="space-y-2">
        {p.scenes.map((s, i) => (
          <div key={s.id} className="card p-3">
            <div className="flex items-center gap-2 text-[13px] mb-2">
              <span className="w-6 h-6 rounded-full bg-accent grid place-items-center text-[12px] font-bold">{i + 1}</span>
              <span className="font-semibold">{KIND_LABEL[s.kind]}</span>
              <span className="text-white/45">{s.duration.toFixed(1)} วิ · กล้อง {s.camera} · ทรานซิชัน {s.transition}</span>
            </div>
            {s.texts.map((t, k) => (
              <input key={t.id} className="input !py-2 mb-1.5" value={t.text} onChange={(e) => update((d) => { d.scenes[i].texts[k].text = e.target.value; }, { history: false })} />
            ))}
            {s.texts.length === 0 && <p className="text-[13px] text-white/40">ฉากนี้ไม่มีข้อความ (แก้ไขเพิ่มได้ใน Editor)</p>}
          </div>
        ))}
      </section>

      <section className="card p-4">
        <h3 className="font-semibold mb-1 flex items-center gap-2"><Wand2 size={17} className="text-violet-glow" /> สร้างหลายเวอร์ชันจากสินค้าเดียว</h3>
        <p className="text-[13px] text-white/50 mb-3">แต่ละเวอร์ชันมีฮุก ดีไซน์ ลำดับฉาก ตัวอักษร เพลง และ CTA ต่างกัน · บันทึกเป็นโปรเจกต์แยก</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {VERSION_PRESETS.map((v) => {
            const on = picked.includes(v.style);
            return (
              <button key={v.style} onClick={() => setPicked((l) => (on ? l.filter((x) => x !== v.style) : [...l, v.style]))} className={`chip justify-start !h-11 ${on ? 'chip-on' : ''}`}>
                {on && <Check size={14} />} {v.label}
              </button>
            );
          })}
        </div>
        <button className="btn-glass w-full" disabled={!picked.length || jobs.some((j) => j.status === 'processing')} onClick={runVersions}>สร้าง {picked.length} เวอร์ชัน</button>
        {jobs.length > 0 && (
          <ul className="mt-3 space-y-2">
            {jobs.map((j, i) => (
              <li key={j.style} className="flex items-center gap-3 text-[14px] rounded-2xl bg-ink-700/60 px-3 py-2">
                <span className="flex-1">{j.label}</span>
                <span className={`text-[12px] ${j.status === 'completed' ? 'text-emerald-300' : j.status === 'failed' ? 'text-red-300' : 'text-white/50'}`}>
                  {{ waiting: 'รอคิว', processing: 'กำลังสร้าง…', completed: 'เสร็จแล้ว', failed: 'ล้มเหลว' }[j.status]}
                </span>
                {j.status === 'completed' && <button className="chip !h-8" onClick={() => nav(`/editor/${j.projectId}`)}>เปิด</button>}
                {j.status === 'failed' && <button className="chip !h-8" onClick={() => runJob([...jobs], i)}>ลองใหม่</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button className="btn-primary w-full" onClick={onEdit}><Clapperboard size={18} /> เปิดใน Video Editor</button>
      <button className="btn-glass w-full" onClick={() => nav(`/publish/${p.id}`)}>ข้ามไปส่งออกวิดีโอ</button>
    </>
  );
}
