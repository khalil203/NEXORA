import { AlertTriangle, Check, CheckCircle2, Copy, Download, Film, Loader2, RefreshCw, Share2, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { copyText, Field, fmtBytes, fmtDate, PageHeader, Segmented, useObjectUrl, useToast } from '../components/ui';
import { mixSoundtrack, musicBuffer } from '../engine/audio';
import { estimateSizeMB, exportVideo, mediaRecorderMime, webCodecsSupport, type ExportResult } from '../engine/exporter';
import { ensureFonts, measureText, outputSize } from '../engine/renderer';
import { logActivity } from '../lib/db';
import { useProject, useRenderAssets } from '../lib/hooks';
import { generateCaptions, generateHashtags } from '../lib/marketing';
import { getSettings } from '../lib/settings';
import type { Captions, Project } from '../lib/types';

type Check = { label: string; ok: boolean | null; detail?: string; warn?: boolean };

const PLATFORMS: { k: keyof Omit<Captions, 'hashtags'>; name: string; rec: string }[] = [
  { k: 'tiktok', name: 'TikTok', rec: '9:16 · 1080×1920 · 15–60 วิ · ฮุกใน 2 วินาทีแรก' },
  { k: 'instagram', name: 'Instagram Reels', rec: '9:16 สำหรับ Reels · 1:1 สำหรับฟีด · ใส่ลิงก์ที่โปรไฟล์' },
  { k: 'facebook', name: 'Facebook', rec: '9:16 สำหรับ Reels · 1:1 หรือ 16:9 สำหรับฟีด' },
  { k: 'youtube', name: 'YouTube Shorts', rec: '9:16 · ไม่เกิน 60 วิ · ใส่ #Shorts ได้' },
];

export default function Publish() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { project: p, update, saveNow } = useProject(id);
  const { assets, ready } = useRenderAssets(p);
  const s = getSettings();
  const [res, setRes] = useState<720 | 1080>(s.exportRes);
  const [fps, setFps] = useState<24 | 30 | 60>(s.exportFps);
  const [quality, setQuality] = useState<'standard' | 'high'>(s.exportQuality);
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [checks, setChecks] = useState<Check[]>([]);
  const [progress, setProgress] = useState<{ p: number; stage: string } | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const url = useObjectUrl(result?.blob);
  const total = useMemo(() => p?.scenes.reduce((t, x) => t + x.duration, 0) ?? 0, [p?.scenes]);
  const size = p ? outputSize(p.aspect, res) : { width: 0, height: 0 };

  useEffect(() => { if (p && !p.captions && p.scenes.length) update((d) => { d.captions = generateCaptions(d.product, d.style, d.strategy); }, { history: false }); }, [p, update]);

  // quality checklist
  useEffect(() => {
    if (!p || !ready) return;
    let alive = true;
    (async () => {
      await ensureFonts(p.scenes);
      const c: Check[] = [];
      c.push({ label: 'มีรูปสินค้า', ok: p.images.length > 0 && assets.images.some(Boolean) });
      c.push({ label: 'ทุกฉากมีความยาวถูกต้อง', ok: p.scenes.length > 0 && p.scenes.every((x) => x.duration >= 0.5 && x.duration <= 30) });
      const m = document.createElement('canvas').getContext('2d')!;
      const over = p.scenes.flatMap((sc, i) => sc.texts.filter((t) => measureText(m, t, size.width, size.height).overflow).map(() => i + 1));
      c.push({ label: 'ข้อความอยู่ในกรอบวิดีโอ', ok: over.length === 0, detail: over.length ? `ฉากที่ ${[...new Set(over)].join(', ')} มีข้อความเกินขอบ` : undefined });
      const tiny = p.scenes.some((sc) => sc.texts.some((t) => t.style.size < 0.03 && t.text.trim()));
      c.push({ label: 'ข้อความภาษาไทยอ่านง่าย (ขนาดพอ)', ok: !tiny, detail: tiny ? 'มีข้อความขนาดเล็กเกินไปบนมือถือ' : undefined });
      let audioOk: boolean | null = true;
      let audioDetail: string | undefined;
      if (p.audio.music) {
        const b = await musicBuffer(p.audio.music, total).catch(() => null);
        audioOk = !!b;
        if (!b) audioDetail = 'โหลดไฟล์เพลงไม่ได้ ลองเลือกเพลงใหม่';
      }
      c.push({ label: 'ไฟล์เสียงพร้อมใช้', ok: audioOk, detail: audioDetail });
      const vol = [p.audio.musicVolume, p.audio.sfxVolume].every((v) => v >= 0 && v <= 1);
      c.push({ label: 'ระดับเสียงถูกต้อง', ok: vol });
      const missingImg = p.scenes.some((sc) => sc.product.mode !== 'hidden' && !assets.images[sc.imageIndex]);
      c.push({ label: 'ไม่มีไฟล์ภาพหาย', ok: !missingImg });
      const wc = format === 'mp4' ? await webCodecsSupport(size.width, size.height, fps) : null;
      const mr = mediaRecorderMime(format);
      c.push({
        label: 'อุปกรณ์รองรับการส่งออก', ok: !!(wc || mr),
        detail: wc ? 'MP4 (H.264) เรนเดอร์แบบเร็ว' : mr ? `บันทึกแบบเรียลไทม์ (${mr.split(';')[0]})` : 'ไม่รองรับ — ใช้ Chrome บน Android',
      });
      const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      const heavy = res === 1080 && mem !== undefined && mem <= 2;
      c.push({ label: 'หน่วยความจำเพียงพอ', ok: !heavy, warn: heavy, detail: heavy ? 'เครื่องมีหน่วยความจำน้อย แนะนำ 720p' : mem ? `ประมาณ ${mem} GB` : 'เบราว์เซอร์ไม่บอกข้อมูล — ถือว่าผ่าน' });
      if (alive) setChecks(c);
    })();
    return () => { alive = false; };
  }, [p, ready, assets, res, fps, format, size.width, size.height, total]);

  const blocking = checks.some((c) => c.ok === false && !c.warn && ['มีรูปสินค้า', 'ทุกฉากมีความยาวถูกต้อง', 'อุปกรณ์รองรับการส่งออก', 'ไม่มีไฟล์ภาพหาย'].includes(c.label));

  async function start() {
    if (!p) return;
    setError(null); setResult(null); setVerified(null);
    abort.current = new AbortController();
    setProgress({ p: 0, stage: 'กำลังเตรียมเสียง' });
    try {
      await saveNow();
      const audio = await mixSoundtrack(p.scenes, p.audio, p.aiClips);
      const r = await exportVideo(p.scenes, assets, audio, {
        width: size.width, height: size.height, fps, quality, preferFormat: format, signal: abort.current.signal,
        onProgress: (v, stage) => setProgress({ p: v, stage }),
      });
      setResult(r);
      update((d) => {
        d.exports.unshift({ at: Date.now(), format: r.format, width: size.width, height: size.height, fps, bytes: r.blob.size });
        d.status = 'exported';
      }, { history: false });
      await logActivity(`ส่งออกวิดีโอ ${r.format.toUpperCase()} ${size.width}×${size.height}`, p.id);
      toast('ส่งออกวิดีโอสำเร็จ');
    } catch (e) {
      const err = e as Error;
      setError(err.name === 'AbortError' ? 'ยกเลิกการส่งออกแล้ว' : `ส่งออกไม่สำเร็จ: ${err.message || err}. ลองลดความละเอียดเป็น 720p หรือ 30fps`);
    } finally {
      setProgress(null);
    }
  }

  function download() {
    if (!result || !url || !p) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(p.product.name || p.name).replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || 'ad'}-${p.aspect.replace(':', 'x')}-${res}p.${result.format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function share() {
    if (!result || !p) return;
    const f = new File([result.blob], `ad.${result.format}`, { type: result.blob.type });
    try {
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text: p.captions?.tiktok });
      else toast('อุปกรณ์นี้แชร์ไฟล์ตรงไม่ได้ กรุณาดาวน์โหลดแล้วอัปโหลดเอง', 'info');
    } catch { /* user cancelled */ }
  }

  if (!p) return <div className="pt-10 grid place-items-center"><Loader2 className="animate-spin text-white/40" /></div>;
  const caps = p.captions;
  const disclosure = p.affiliate?.disclose ? p.affiliate.disclosureText : '';
  const copy = (t: string, what: string) => copyText(t).then(() => toast(`คัดลอก${what}แล้ว`));

  return (
    <div className="animate-in space-y-5">
      <PageHeader title="ส่งออกและเผยแพร่" back sub={p.name} right={<button className="chip" onClick={() => nav(`/editor/${p.id}`)}><Film size={14} /> แก้ไข</button>} />

      {/* export settings */}
      <section className="card p-4 space-y-4">
        <h2 className="section-title">ศูนย์ส่งออกวิดีโอ</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ความละเอียด"><Segmented value={res} options={[{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }]} onChange={setRes} /></Field>
          <Field label="ไฟล์"><Segmented value={format} options={[{ value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM' }]} onChange={setFormat} /></Field>
          <Field label="เฟรมเรต"><Segmented value={fps} options={[{ value: 24, label: '24' }, { value: 30, label: '30' }, { value: 60, label: '60' }]} onChange={setFps} /></Field>
          <Field label="คุณภาพ"><Segmented value={quality} options={[{ value: 'standard', label: 'มาตรฐาน' }, { value: 'high', label: 'สูง' }]} onChange={setQuality} /></Field>
        </div>
        <div className="text-[13px] text-white/55 flex flex-wrap gap-x-4">
          <span>{p.aspect} · {size.width}×{size.height}</span>
          <span>{total.toFixed(1)} วินาที</span>
          <span>ขนาดไฟล์ประมาณ {estimateSizeMB(size.width, size.height, fps, quality, total).toFixed(1)} MB</span>
        </div>
      </section>

      {/* QC */}
      <section className="card p-4">
        <h3 className="font-semibold mb-2">ตรวจคุณภาพก่อนส่งออก</h3>
        {checks.length === 0 ? <p className="text-white/40 text-[14px] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> กำลังตรวจสอบ…</p> : (
          <ul className="space-y-1.5">
            {checks.map((c) => (
              <li key={c.label} className="flex gap-2 text-[14px]">
                {c.ok ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0" /> : c.warn ? <AlertTriangle size={18} className="text-amber-300 shrink-0" /> : <XCircle size={18} className="text-red-400 shrink-0" />}
                <span>{c.label}{c.detail && <span className="block text-[12px] text-white/45">{c.detail}</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {progress ? (
        <section className="card p-4">
          <div className="flex justify-between text-[14px] mb-2"><span>{progress.stage}</span><span className="tabular-nums">{Math.round(progress.p * 100)}%</span></div>
          <div className="h-2.5 rounded-full bg-ink-600 overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${progress.p * 100}%` }} /></div>
          <button className="btn-ghost w-full mt-3" onClick={() => abort.current?.abort()}><X size={16} /> ยกเลิก</button>
        </section>
      ) : (
        <button className="btn-primary w-full !h-14 text-base" disabled={blocking || !ready || checks.length === 0} onClick={start}>
          {result ? <RefreshCw size={18} /> : <Download size={18} />} {result ? 'ส่งออกอีกครั้ง' : 'เริ่มส่งออกวิดีโอ'}
        </button>
      )}
      {error && <p className="rounded-2xl bg-red-500/10 border border-red-400/30 text-red-200 text-[14px] p-3">{error}</p>}

      {result && url && (
        <section className="card p-4 space-y-3 animate-in">
          <video src={url} controls playsInline className="w-full max-h-[60vh] rounded-2xl bg-black"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              const ratio = v.videoWidth / v.videoHeight;
              const want = p.aspect === '9:16' ? 9 / 16 : p.aspect === '1:1' ? 1 : 16 / 9;
              setVerified(Math.abs(ratio - want) < 0.01 ? `✓ ตรวจแล้ว: ${v.videoWidth}×${v.videoHeight} ตรงสัดส่วน ${p.aspect}` : `⚠ สัดส่วนไม่ตรง: ${v.videoWidth}×${v.videoHeight}`);
            }} />
          <div className="text-[13px] text-white/60">{result.format.toUpperCase()} · {fmtBytes(result.blob.size)} {verified && <span className="block text-emerald-300">{verified}</span>}</div>
          {result.note && <p className="text-[13px] text-amber-200">{result.note}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-primary" onClick={download}><Download size={18} /> ดาวน์โหลด</button>
            <button className="btn-glass" onClick={share}><Share2 size={18} /> แชร์ไปแอป</button>
          </div>
        </section>
      )}

      {/* social workflow */}
      {caps && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">แคปชันและแฮชแท็ก</h2>
            <button className="chip" onClick={() => update((d) => { d.captions = generateCaptions(d.product, d.style, d.strategy, disclosure || undefined); })}><RefreshCw size={14} /> สร้างใหม่</button>
          </div>
          <div className="card p-4 space-y-2">
            <div className="flex items-center justify-between"><span className="font-medium">แฮชแท็ก ({caps.hashtags.length}/4)</span>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => <button key={n} className={`chip !h-8 !px-3 ${caps.hashtags.length === n ? 'chip-on' : ''}`} onClick={() => update((d) => { d.captions!.hashtags = generateHashtags(d.product, n); })}>{n}</button>)}
              </div>
            </div>
            <input className="input" value={caps.hashtags.join(' ')} onChange={(e) => update((d) => { d.captions!.hashtags = e.target.value.split(/\s+/).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`)).slice(0, 4); }, { history: false })} />
            <button className="btn-glass w-full !h-10" onClick={() => copy(caps.hashtags.join(' '), 'แฮชแท็ก')}><Copy size={15} /> คัดลอกแฮชแท็ก</button>
          </div>
          {PLATFORMS.map((pl) => (
            <div key={pl.k} className="card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{pl.name}</span>
                <button className="chip !h-8" onClick={() => copy(`${caps[pl.k]}\n\n${caps.hashtags.join(' ')}${pl.k === 'youtube' ? ' #Shorts' : ''}`, `แคปชัน ${pl.name} `)}><Copy size={14} /> คัดลอก</button>
              </div>
              <p className="text-[12px] text-white/45">แนะนำ: {pl.rec}</p>
              <textarea rows={5} className="input text-[14px]" value={caps[pl.k]} onChange={(e) => update((d) => { d.captions![pl.k] = e.target.value; }, { history: false })} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-glass" onClick={() => copy(p.strategy?.cta || '', ' CTA ')}><Copy size={15} /> คัดลอก CTA</button>
            <button className="btn-glass" disabled={!p.product.url} onClick={() => copy(p.product.url, 'ลิงก์')}><Copy size={15} /> คัดลอกลิงก์</button>
          </div>
          <label className="card p-4 flex gap-3 items-start">
            <input type="checkbox" className="mt-1" checked={!!p.affiliate?.disclose} onChange={(e) => update((d) => { d.affiliate = { url: d.product.url, disclose: e.target.checked, disclosureText: d.affiliate?.disclosureText || '#โฆษณา มีลิงก์แอฟฟิลิเอต ผู้โพสต์อาจได้รับค่าคอมมิชชั่นเมื่อมีการสั่งซื้อ' }; })} />
            <span className="text-[14px]">แสดงการเปิดเผยความสัมพันธ์แอฟฟิลิเอต
              <span className="block text-[12px] text-white/45">{p.affiliate?.disclosureText || '#โฆษณา มีลิงก์แอฟฟิลิเอต ผู้โพสต์อาจได้รับค่าคอมมิชชั่นเมื่อมีการสั่งซื้อ'} — กด “สร้างใหม่” เพื่อใส่ลงแคปชัน</span>
            </span>
          </label>
          <p className="text-[12px] text-white/40 flex gap-1"><Check size={13} /> เวอร์ชันนี้ไม่โพสต์อัตโนมัติ: ดาวน์โหลดหรือแชร์วิดีโอ แล้ววางแคปชันในแอปโซเชียลเอง</p>
        </section>
      )}

      {p.exports.length > 0 && (
        <section className="card p-4">
          <h3 className="font-semibold mb-2">ประวัติการส่งออก</h3>
          <ul className="space-y-1 text-[13px] text-white/65">
            {p.exports.slice(0, 8).map((e) => <li key={e.at}>{fmtDate(e.at)} · {e.format.toUpperCase()} {e.width}×{e.height} {e.fps}fps · {fmtBytes(e.bytes)}</li>)}
          </ul>
        </section>
      )}
      <ProjectFooter p={p} />
    </div>
  );
}

function ProjectFooter({ p }: { p: Project }) {
  return <p className="text-center text-[11px] text-white/25 pb-4">วิดีโอเรนเดอร์บนเครื่องนี้ทั้งหมด ไม่มีการอัปโหลดไปที่ใด · {p.id.slice(0, 8)}</p>;
}
