import { Captions, Clapperboard, Copy, HardDrive, Layers, Music2, Palette, Sparkles, Store, WandSparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ProjectThumb } from '../components/ProjectThumb';
import { fmtBytes, fmtDate } from '../components/ui';
import { listProjects, recentActivity, storageInfo } from '../lib/db';
import { getSettings } from '../lib/settings';
import { STATUS_LABEL } from '../lib/project';
import { TEMPLATES } from './Templates';
import type { Activity, Project } from '../lib/types';

export default function Home() {
  const nav = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [acts, setActs] = useState<Activity[]>([]);
  const [store, setStore] = useState<{ used: number; quota: number } | null>(null);
  const owner = getSettings().ownerName;
  useEffect(() => {
    listProjects().then(setProjects);
    recentActivity(6).then(setActs);
    storageInfo().then(setStore);
  }, []);
  const drafts = projects.filter((p) => p.status !== 'exported');
  const exportedCount = projects.reduce((n, p) => n + p.exports.length, 0);

  const tools = [
    { to: '/batch', label: 'คิววิดีโอ', icon: Clapperboard },
    { to: '/create?multi=1', label: 'หลายเวอร์ชัน', icon: Copy },
    { to: '/projects', label: 'แคปชันไทย', icon: Captions },
    { to: '/music', label: 'คลังเพลง', icon: Music2 },
    { to: '/brand', label: 'แบรนด์คิท', icon: Palette },
    { to: '/affiliate', label: 'แอฟฟิลิเอต', icon: Store },
  ];

  return (
    <div className="pt-[max(env(safe-area-inset-top),14px)] space-y-6 animate-in">
      {/* hero — mirrors the reference card */}
      <section className="rounded-[30px] bg-hero p-5 pb-4 shadow-glow relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/15 blur-2xl" />
        <div className="flex items-center justify-between relative">
          <div className="w-12 h-12 rounded-full bg-white/25 border-2 border-white/60 grid place-items-center text-lg font-bold">
            {(owner || 'A').slice(0, 1).toUpperCase()}
          </div>
          <Link to="/brand" className="h-10 px-4 rounded-full bg-white/25 border border-white/40 backdrop-blur flex items-center gap-2 text-[14px] font-medium">
            <Palette size={16} /> แบรนด์คิท
          </Link>
        </div>
        <h1 className="thai-display text-[28px] font-semibold leading-tight mt-5 relative">
          {owner ? `สวัสดี ${owner}` : 'สตูดิโอโฆษณา AI'}<br />เปลี่ยนรูปสินค้าเป็นวิดีโอขาย
        </h1>
        <div className="grid grid-cols-2 gap-3 mt-5 relative">
          <button onClick={() => nav('/create')} className="h-14 rounded-full bg-white/25 border border-white/40 backdrop-blur flex items-center gap-2 pl-2 pr-3 text-[13.5px] font-semibold whitespace-nowrap active:scale-[.97] transition">
            <span className="w-10 h-10 rounded-full bg-white/30 grid place-items-center"><Clapperboard size={18} /></span>
            สร้างโฆษณาใหม่
          </button>
          <button onClick={() => nav('/templates')} className="h-14 rounded-full bg-white/25 border border-white/40 backdrop-blur flex items-center gap-2 pl-2 pr-3 text-[13.5px] font-semibold whitespace-nowrap active:scale-[.97] transition">
            <span className="w-10 h-10 rounded-full bg-white/30 grid place-items-center"><WandSparkles size={18} /></span>
            เลือกเทมเพลต
          </button>
        </div>
      </section>

      {/* tool strip */}
      <section className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
        {tools.map((t) => (
          <Link key={t.label} to={t.to} className="card shrink-0 w-[104px] h-[84px] flex flex-col items-center justify-center gap-1.5 text-[13px] text-white/85 active:scale-95 transition">
            <t.icon size={20} className="text-violet-glow" /> {t.label}
          </Link>
        ))}
      </section>

      {/* stats */}
      <section className="grid grid-cols-4 gap-2">
        {[
          ['วิดีโอทั้งหมด', projects.length],
          ['ฉบับร่าง', drafts.length],
          ['ส่งออกแล้ว', exportedCount],
          ['พื้นที่ใช้', store ? fmtBytes(store.used) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="card p-3 text-center">
            <div className="text-lg font-semibold thai-display">{v}</div>
            <div className="text-[11px] text-white/50 leading-tight">{k}</div>
          </div>
        ))}
      </section>

      {/* recent projects */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">ทำต่อจากเดิม</h2>
          <Link to="/projects" className="text-[13px] text-white/50">ทั้งหมด</Link>
        </div>
        {projects.length === 0 ? (
          <button onClick={() => nav('/create')} className="card w-full p-6 text-center">
            <Sparkles className="mx-auto text-violet-glow mb-2" />
            <div className="font-semibold">ยังไม่มีโปรเจกต์</div>
            <div className="text-white/50 text-[14px]">อัปโหลดรูปสินค้าเพื่อเริ่มสร้างโฆษณาแรกของคุณ</div>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {projects.slice(0, 4).map((p) => (
              <Link key={p.id} to={p.scenes.length ? `/editor/${p.id}` : `/create/${p.id}`} className="block active:scale-[.98] transition">
                <ProjectThumb p={p} className={p.aspect === '16:9' ? 'aspect-video' : p.aspect === '1:1' ? 'aspect-square' : 'aspect-[3/4]'} />
                <div className="mt-2 px-1">
                  <div className="text-[14px] font-medium truncate">{p.name}</div>
                  <div className="text-[12px] text-white/45">{STATUS_LABEL[p.status]} · {fmtDate(p.updatedAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* quick templates */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">เทมเพลตด่วน</h2>
          <Link to="/templates" className="text-[13px] text-white/50">ดูเพิ่ม</Link>
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
          {TEMPLATES.slice(0, 6).map((t) => (
            <Link key={t.id} to={`/create?template=${t.id}`} className="shrink-0 w-32">
              <div className="aspect-[3/4] rounded-[20px] border border-white/10 relative overflow-hidden" style={{ background: `linear-gradient(160deg, ${t.colors[0]}, ${t.colors[1]})` }}>
                <Layers className="absolute right-3 top-3 opacity-60" size={18} />
                <span className="absolute bottom-3 left-3 right-3 thai-display font-semibold text-[15px] leading-tight drop-shadow">{t.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* activity + storage */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <h3 className="font-semibold mb-2">กิจกรรมล่าสุด</h3>
          {acts.length === 0 ? <p className="text-white/45 text-[14px]">ยังไม่มีกิจกรรม</p> : (
            <ul className="space-y-1.5">
              {acts.map((a) => (
                <li key={a.id} className="text-[13px] text-white/70 flex justify-between gap-3"><span className="truncate">{a.text}</span><span className="text-white/35 shrink-0">{fmtDate(a.at)}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <h3 className="font-semibold mb-2 flex items-center gap-2"><HardDrive size={16} /> พื้นที่เก็บข้อมูลในเครื่อง</h3>
          {store ? (
            <>
              <div className="h-2 rounded-full bg-ink-600 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${Math.min(100, (store.used / Math.max(1, store.quota)) * 100)}%` }} /></div>
              <p className="text-[13px] text-white/55 mt-2">ใช้ไป {fmtBytes(store.used)} จากที่เบราว์เซอร์อนุญาต {fmtBytes(store.quota)}</p>
            </>
          ) : <p className="text-white/45 text-[14px]">เบราว์เซอร์นี้ไม่แสดงข้อมูลพื้นที่</p>}
          <p className="text-[12px] text-white/35 mt-1">ข้อมูลทั้งหมดเก็บในเครื่องนี้เท่านั้น ไม่ถูกอัปโหลด</p>
        </div>
      </section>
    </div>
  );
}
