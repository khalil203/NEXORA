import { Copy, LayoutGrid, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Confirm, Empty, PageHeader, Sheet, useToast } from '../components/ui';
import { uid } from '../lib/db';
import type { Aspect, AudioSettings, Duration, Scene, StyleId } from '../lib/types';

export interface TemplateDef { id: string; name: string; style: StyleId; desc: string; colors: [string, string]; duration: Duration }

export const TEMPLATES: TemplateDef[] = [
  { id: 'luxury', name: 'สินค้าหรูหรา', style: 'luxury', desc: 'โทนทอง-ดำ แสงประกาย ช้าและสง่างาม', colors: ['#120d06', '#4a3615'], duration: 15 },
  { id: 'showcase', name: 'โชว์สินค้า', style: 'minimal', desc: 'พื้นหลังสะอาด เน้นตัวสินค้าชัด ๆ', colors: ['#f4f1ec', '#cfc6b8'], duration: 15 },
  { id: 'food', name: 'โฆษณาอาหาร', style: 'food', desc: 'โทนอุ่น น่ากิน จังหวะสนุก', colors: ['#3b1405', '#ea8a1a'], duration: 15 },
  { id: 'fashion', name: 'โฆษณาแฟชั่น', style: 'fashion', desc: 'เท่ ทันสมัย ตัดต่อเร็ว', colors: ['#111111', '#5a4a3a'], duration: 15 },
  { id: 'beauty', name: 'โฆษณาบิวตี้', style: 'beauty', desc: 'ชมพู-ม่วงละมุน แสงนุ่ม', colors: ['#f9d8e4', '#c9a2e8'], duration: 15 },
  { id: 'sale', name: 'โปรโมชั่นลดราคา', style: 'sales', desc: 'แดง-ส้ม ป้ายราคาเด่น กระตุ้นการซื้อ', colors: ['#c4001d', '#ffb000'], duration: 10 },
  { id: 'discount', name: 'แคมเปญส่วนลด', style: 'viral', desc: 'สีสดไวรัล ตัวอักษร 3 มิติ', colors: ['#ff3d7f', '#7b2ff7'], duration: 15 },
  { id: 'minimal', name: 'มินิมอล', style: 'minimal', desc: 'เรียบ หรู อ่านง่าย', colors: ['#eef0f3', '#b9c0cc'], duration: 10 },
  { id: 'cinematic', name: 'ภาพยนตร์', style: 'cinematic', desc: 'มืด ลึก ดราม่า ค่อย ๆ เปิดเผยสินค้า', colors: ['#05070d', '#33201a'], duration: 30 },
  { id: 'affiliate', name: 'รีวิวแอฟฟิลิเอต', style: 'affiliate', desc: 'ป้ายยา ชวนกดลิงก์', colors: ['#ff6a00', '#ee0979'], duration: 15 },
];

export interface PersonalTemplate {
  id: string;
  name: string;
  style: StyleId;
  aspect: Aspect;
  duration: Duration;
  scenes: Scene[];
  audio: AudioSettings;
  createdAt: number;
}

const KEY = 'ads.templates.v1';
export const personalTemplates = (): PersonalTemplate[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
export const savePersonalTemplates = (l: PersonalTemplate[]) => localStorage.setItem(KEY, JSON.stringify(l));
export function addPersonalTemplate(t: Omit<PersonalTemplate, 'id' | 'createdAt'>) {
  const l = personalTemplates();
  l.unshift({ ...t, id: uid(), createdAt: Date.now() });
  savePersonalTemplates(l);
}

export default function Templates() {
  const nav = useNavigate();
  const toast = useToast();
  const [mine, setMine] = useState(personalTemplates());
  const [rename, setRename] = useState<PersonalTemplate | null>(null);
  const [del, setDel] = useState<PersonalTemplate | null>(null);
  const update = (l: PersonalTemplate[]) => { savePersonalTemplates(l); setMine(l); };

  return (
    <div className="animate-in">
      <PageHeader title="เทมเพลต" sub="เลือกสไตล์แล้วอัปโหลดรูปสินค้าได้เลย" />
      <div className="grid grid-cols-2 gap-3">
        {TEMPLATES.map((t) => (
          <button key={t.id} onClick={() => nav(`/create?template=${t.id}`)} className="text-left active:scale-[.98] transition">
            <div className="aspect-[4/5] rounded-[24px] border border-white/10 relative overflow-hidden p-3 flex flex-col justify-end" style={{ background: `linear-gradient(160deg, ${t.colors[0]}, ${t.colors[1]})` }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent" />
              <span className="relative thai-display font-semibold text-[17px] leading-tight">{t.name}</span>
              <span className="relative text-[12px] text-white/75 leading-snug mt-1">{t.desc}</span>
            </div>
          </button>
        ))}
      </div>

      <h2 className="section-title mt-8 mb-3">เทมเพลตของฉัน</h2>
      {mine.length === 0 ? (
        <Empty icon={<LayoutGrid />} title="ยังไม่มีเทมเพลตส่วนตัว" text="เปิดโปรเจกต์ใน Editor แล้วกดเมนู “บันทึกเป็นเทมเพลต” เพื่อเก็บสไตล์ที่ชอบไว้ใช้ซ้ำ" />
      ) : (
        <div className="space-y-2">
          {mine.map((t) => (
            <div key={t.id} className="card p-3 flex items-center gap-3">
              <div className="w-12 h-16 rounded-xl shrink-0" style={{ background: `linear-gradient(160deg, ${t.scenes[0]?.background.colors[0]}, ${t.scenes[0]?.background.colors[1]})` }} />
              <button className="flex-1 text-left min-w-0" onClick={() => nav(`/create?mine=${t.id}`)}>
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-[12px] text-white/45">{t.aspect} · {t.duration} วินาที · {t.scenes.length} ฉาก</div>
              </button>
              <button className="icon-btn !w-9 !h-9" aria-label="เปลี่ยนชื่อ" onClick={() => setRename(t)}><Pencil size={15} /></button>
              <button className="icon-btn !w-9 !h-9" aria-label="ทำสำเนา" onClick={() => { update([{ ...structuredClone(t), id: uid(), name: `${t.name} (สำเนา)`, createdAt: Date.now() }, ...mine]); toast('ทำสำเนาเทมเพลตแล้ว'); }}><Copy size={15} /></button>
              <button className="icon-btn !w-9 !h-9 text-red-300" aria-label="ลบ" onClick={() => setDel(t)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!rename} onClose={() => setRename(null)} title="เปลี่ยนชื่อเทมเพลต">
        {rename && (
          <form onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get('n') as string; update(mine.map((m) => (m.id === rename.id ? { ...m, name: v || m.name } : m))); setRename(null); }}>
            <input name="n" defaultValue={rename.name} className="input mb-4" autoFocus />
            <button className="btn-primary w-full">บันทึก</button>
          </form>
        )}
      </Sheet>
      <Confirm open={!!del} danger title="ลบเทมเพลต" message={`ลบ “${del?.name}” ใช่ไหม?`} confirmText="ลบ" onClose={() => setDel(null)} onConfirm={() => del && update(mine.filter((m) => m.id !== del.id))} />
    </div>
  );
}
