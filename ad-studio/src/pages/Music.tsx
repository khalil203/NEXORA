import { Loader2, Music2, Pause, Play, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Confirm, Empty, PageHeader, useToast } from '../components/ui';
import { decodeAsset, generateMusic, GENERATED_LICENSE, getSfx, MOODS, playBuffer, SFX } from '../engine/audio';
import { deleteAsset, listAssets, putAsset } from '../lib/db';
import type { Asset, MusicMood, SfxId } from '../lib/types';

const RECOMMEND: [string, MusicMood][] = [['หรูหรา', 'elegant'], ['อาหาร', 'upbeat'], ['บิวตี้', 'soft'], ['เทคโนโลยี', 'electronic'], ['แฟชั่น', 'trendy'], ['ภาพยนตร์', 'cinematic']];

export default function Music() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [mood, setMood] = useState<MusicMood | 'all'>('all');
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [vol, setVol] = useState(0.6);
  const [uploads, setUploads] = useState<Asset[]>([]);
  const [rights, setRights] = useState(false);
  const [del, setDel] = useState<Asset | null>(null);
  const handle = useRef<{ stop: () => void } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { listAssets('audio').then(setUploads); return () => handle.current?.stop(); }, []);

  async function toggle(key: string, get: () => Promise<AudioBuffer | null>) {
    handle.current?.stop();
    if (playing === key) { setPlaying(null); return; }
    setLoading(key);
    try {
      const b = await get();
      if (!b) throw new Error('โหลดเสียงไม่ได้');
      const h = playBuffer(b, 0, vol);
      handle.current = h;
      h.src.onended = () => setPlaying((p) => (p === key ? null : p));
      setPlaying(key);
    } catch (e) { toast((e as Error).message, 'err'); }
    finally { setLoading(null); }
  }

  const moods = MOODS.filter((m) => (mood === 'all' || m.id === mood) && (!q || `${m.label} ${m.desc}`.includes(q)));
  const ups = uploads.filter((u) => !q || u.name.toLowerCase().includes(q.toLowerCase()));
  const icon = (k: string) => (loading === k ? <Loader2 size={18} className="animate-spin" /> : playing === k ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />);

  return (
    <div className="animate-in space-y-4">
      <PageHeader title="คลังเพลงและเสียง" back sub="เพลงที่ใช้ในเชิงพาณิชย์ได้เท่านั้น" />
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
        <input className="input !pl-11" placeholder="ค้นหาเพลงหรืออารมณ์" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <button className={`chip ${mood === 'all' ? 'chip-on' : ''}`} onClick={() => setMood('all')}>ทุกอารมณ์</button>
        {RECOMMEND.map(([l, m]) => <button key={m} className={`chip ${mood === m ? 'chip-on' : ''}`} onClick={() => setMood(m)}>{l}</button>)}
      </div>
      <label className="block text-[13px] text-white/55">ระดับเสียงพรีวิว {Math.round(vol * 100)}%<input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => setVol(+e.target.value)} /></label>

      <h2 className="section-title">เพลงสร้างโดยแอป</h2>
      <p className="text-[12px] text-white/45 -mt-2">{GENERATED_LICENSE}</p>
      <div className="space-y-2">
        {moods.map((m) => (
          <div key={m.id} className="card p-3 flex items-center gap-3">
            <button className="w-11 h-11 rounded-full bg-accent shadow-glow grid place-items-center shrink-0" aria-label="พรีวิว" onClick={() => toggle(`gen:${m.id}`, () => generateMusic(m.id, 30))}>{icon(`gen:${m.id}`)}</button>
            <div className="min-w-0"><div className="font-medium">{m.label}</div><div className="text-[12px] text-white/45">{m.desc} · {m.bpm} BPM</div></div>
          </div>
        ))}
      </div>

      <h2 className="section-title pt-2">เอฟเฟกต์เสียง</h2>
      <div className="grid grid-cols-2 gap-2">
        {SFX.map((s) => (
          <button key={s.id} className="card p-3 flex items-center gap-3 text-left" onClick={() => toggle(`sfx:${s.id}`, () => getSfx(s.id as SfxId))}>
            <span className="w-9 h-9 rounded-full glass grid place-items-center shrink-0">{icon(`sfx:${s.id}`)}</span><span className="text-[14px]">{s.label}</span>
          </button>
        ))}
      </div>

      <h2 className="section-title pt-2">เพลงของฉัน</h2>
      <div className="card p-4 space-y-3">
        <label className="flex gap-2 text-[13px] text-white/70"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1" /> ฉันมีสิทธิ์ใช้เพลงที่อัปโหลดในเชิงพาณิชย์ (เช่น แต่งเอง ซื้อลิขสิทธิ์ หรือเพลง Royalty-free ที่อนุญาตเชิงพาณิชย์)</label>
        <button className="btn-glass w-full" onClick={() => (rights ? file.current?.click() : toast('กรุณาติ๊กยืนยันสิทธิ์ก่อน', 'err'))}><Upload size={16} /> อัปโหลดไฟล์เสียง</button>
        <input ref={file} type="file" accept="audio/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const a = await putAsset(f, f.name, 'audio', 'ผู้ใช้ยืนยันว่ามีสิทธิ์ใช้งานเชิงพาณิชย์');
          setUploads((l) => [...l, a]);
          toast('เพิ่มเพลงแล้ว — เลือกใช้ได้ในแท็บเสียงของ Editor');
        }} />
      </div>
      {ups.length === 0 ? <Empty icon={<Music2 />} title="ยังไม่มีเพลงที่อัปโหลด" text="เพลงที่อัปโหลดจะเก็บในเครื่องนี้เท่านั้น" /> : (
        <div className="space-y-2">
          {ups.map((u) => (
            <div key={u.id} className="card p-3 flex items-center gap-3">
              <button className="w-11 h-11 rounded-full glass grid place-items-center shrink-0" onClick={() => toggle(`asset:${u.id}`, () => decodeAsset(u.id))}>{icon(`asset:${u.id}`)}</button>
              <div className="min-w-0 flex-1"><div className="font-medium truncate">{u.name}</div><div className="text-[11px] text-white/45">สิทธิ์: {u.license}</div></div>
              <button className="icon-btn !w-9 !h-9 text-red-300" aria-label="ลบ" onClick={() => setDel(u)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[12px] text-white/35">แหล่งเพลงฟรีเชิงพาณิชย์ภายนอก (ผ่านตัวเชื่อมต่อ) ยังไม่ได้ตั้งค่า · ห้ามดาวน์โหลดหรือใช้เพลงฮิตติดลิขสิทธิ์โดยไม่ได้รับอนุญาต</p>
      <Confirm open={!!del} danger title="ลบเพลง" message={`ลบ “${del?.name}”? โปรเจกต์ที่ใช้เพลงนี้จะไม่มีเพลง`} confirmText="ลบ" onClose={() => setDel(null)}
        onConfirm={async () => { if (del) { await deleteAsset(del.id); setUploads((l) => l.filter((x) => x.id !== del.id)); } }} />
    </div>
  );
}
