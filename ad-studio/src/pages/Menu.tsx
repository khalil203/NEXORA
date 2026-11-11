import { BarChart3, ChevronRight, Clapperboard, FolderOpen, LayoutGrid, Music2, Palette, Settings, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

const BUILD = __BUILD_TIME__;

async function hardUpdate() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
    const keys = await caches?.keys();
    await Promise.all((keys ?? []).map((k) => caches.delete(k)));
  } finally {
    location.reload();
  }
}
import { PageHeader } from '../components/ui';

const ITEMS = [
  { to: '/create', label: 'สร้างโฆษณาใหม่', icon: Clapperboard },
  { to: '/projects', label: 'โปรเจกต์ทั้งหมด', icon: FolderOpen },
  { to: '/templates', label: 'เทมเพลต', icon: LayoutGrid },
  { to: '/brand', label: 'แบรนด์คิท', icon: Palette },
  { to: '/music', label: 'คลังเพลงและเสียง', icon: Music2 },
  { to: '/affiliate', label: 'สตูดิโอแอฟฟิลิเอต', icon: Store, soon: true },
  { to: '/analytics', label: 'สถิติผลงาน', icon: BarChart3, soon: true },
  { to: '/settings', label: 'ตั้งค่าและความเป็นส่วนตัว', icon: Settings },
];

export default function Menu() {
  return (
    <div className="animate-in">
      <PageHeader title="สตูดิโอของฉัน" sub="AI AD STUDIO · Personal Edition" />
      <div className="card divide-y divide-white/5 overflow-hidden">
        {ITEMS.map((i) => (
          <Link key={i.to} to={i.to} className="flex items-center gap-3 px-4 h-16 active:bg-white/5">
            <span className="w-10 h-10 rounded-2xl bg-accent/20 text-violet-glow grid place-items-center"><i.icon size={19} /></span>
            <span className="flex-1">{i.label}</span>
            {i.soon && <span className="text-[11px] rounded-full bg-white/10 px-2 py-0.5 text-white/60">เฟส 6</span>}
            <ChevronRight size={18} className="text-white/30" />
          </Link>
        ))}
      </div>
      <button className="btn-glass w-full mt-5" onClick={hardUpdate}><RefreshCw size={16} /> อัปเดตแอปตอนนี้</button>
      <p className="text-center text-[12px] text-white/30 mt-3">เวอร์ชัน {BUILD} · ข้อมูลโปรเจกต์เก็บในเครื่องนี้ (อัปเดตแอปไม่ลบโปรเจกต์)</p>
    </div>
  );
}
