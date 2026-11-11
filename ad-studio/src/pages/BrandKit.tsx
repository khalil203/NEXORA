import { ImagePlus, Palette, Plus, Star, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { AssetImg } from '../components/ProjectThumb';
import { Confirm, Empty, Field, PageHeader, Sheet, useToast } from '../components/ui';
import { deleteBrandKit, putAsset, saveBrandKit, uid } from '../lib/db';
import { useBrandKits } from '../lib/hooks';
import { ACCEPT, normalizeImage } from '../lib/images';
import { STYLE_LABEL } from '../lib/marketing';
import { FONTS, getSettings, setSettings } from '../lib/settings';
import type { BrandKit, StyleId } from '../lib/types';

const blank = (): BrandKit => ({ id: uid(), name: '', primary: '#6d5ae6', secondary: '#5aa8f5', font: 'Kanit', cta: '', contact: '', socials: '', style: 'viral' });

export default function BrandKitPage() {
  const { kits, reload } = useBrandKits();
  const toast = useToast();
  const [edit, setEdit] = useState<BrandKit | null>(null);
  const [del, setDel] = useState<BrandKit | null>(null);
  const [def, setDef] = useState(getSettings().defaultBrandKit);
  const logo = useRef<HTMLInputElement>(null);

  async function onLogo(f?: File) {
    if (!f || !edit) return;
    try {
      const a = await putAsset(await normalizeImage(f), f.name, 'logo');
      setEdit({ ...edit, logo: a.id });
    } catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <div className="animate-in space-y-4">
      <PageHeader title="แบรนด์คิท" back sub="โลโก้ สี ฟอนต์ และ CTA ประจำแบรนด์" right={<button className="icon-btn" aria-label="เพิ่ม" onClick={() => setEdit(blank())}><Plus size={20} /></button>} />
      {kits.length === 0 ? (
        <Empty icon={<Palette />} title="ยังไม่มีแบรนด์คิท" text="บันทึกโลโก้และสีของแบรนด์ แล้วเลือกใช้ได้ทุกโปรเจกต์ โฆษณาจะดูเป็นแบรนด์เดียวกัน"
          action={<button className="btn-primary mt-2" onClick={() => setEdit(blank())}><Plus size={18} /> สร้างแบรนด์คิท</button>} />
      ) : kits.map((k) => (
        <div key={k.id} className="card p-4 flex items-center gap-3">
          {k.logo ? <AssetImg id={k.logo} className="w-14 h-14 rounded-2xl !object-contain bg-white/5" /> : <div className="w-14 h-14 rounded-2xl" style={{ background: `linear-gradient(135deg, ${k.primary}, ${k.secondary})` }} />}
          <button className="flex-1 text-left min-w-0" onClick={() => setEdit(k)}>
            <div className="font-semibold truncate flex items-center gap-1.5">{k.name || 'ไม่มีชื่อ'} {def === k.id && <Star size={14} className="text-amber-300" fill="currentColor" />}</div>
            <div className="text-[12px] text-white/45" style={{ fontFamily: k.font }}>{k.font} · {STYLE_LABEL[k.style]}</div>
          </button>
          <span className="w-6 h-6 rounded-full" style={{ background: k.primary }} />
          <span className="w-6 h-6 rounded-full" style={{ background: k.secondary }} />
        </div>
      ))}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit && kits.some((k) => k.id === edit.id) ? 'แก้ไขแบรนด์คิท' : 'แบรนด์คิทใหม่'}>
        {edit && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {edit.logo ? <AssetImg id={edit.logo} className="w-20 h-20 rounded-2xl !object-contain bg-white/5" /> : <div className="w-20 h-20 rounded-2xl bg-white/5 grid place-items-center text-white/30"><ImagePlus /></div>}
              <div className="space-y-2">
                <button className="btn-glass !h-10" onClick={() => logo.current?.click()}><ImagePlus size={16} /> อัปโหลดโลโก้</button>
                {edit.logo && <button className="text-[13px] text-red-300 block" onClick={() => setEdit({ ...edit, logo: undefined })}>เอาโลโก้ออก</button>}
              </div>
              <input ref={logo} type="file" accept={ACCEPT} hidden onChange={(e) => onLogo(e.target.files?.[0])} />
            </div>
            <Field label="ชื่อแบรนด์"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="flex gap-6">
              <Field label="สีหลัก"><input type="color" value={edit.primary} onChange={(e) => setEdit({ ...edit, primary: e.target.value })} /></Field>
              <Field label="สีรอง"><input type="color" value={edit.secondary} onChange={(e) => setEdit({ ...edit, secondary: e.target.value })} /></Field>
            </div>
            <Field label="ฟอนต์">
              <div className="flex flex-wrap gap-2">{FONTS.map((f) => <button key={f} style={{ fontFamily: f }} className={`chip ${edit.font === f ? 'chip-on' : ''}`} onClick={() => setEdit({ ...edit, font: f })}>{f}</button>)}</div>
            </Field>
            <Field label="สไตล์ที่ชอบ">
              <select className="input" value={edit.style} onChange={(e) => setEdit({ ...edit, style: e.target.value as StyleId })}>
                {(Object.keys(STYLE_LABEL) as StyleId[]).map((s) => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="CTA ประจำแบรนด์"><input className="input" value={edit.cta} onChange={(e) => setEdit({ ...edit, cta: e.target.value })} placeholder="เช่น ทักไลน์ @ร้านของฉัน" /></Field>
            <Field label="ข้อมูลติดต่อ"><input className="input" value={edit.contact} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} /></Field>
            <Field label="โซเชียลมีเดีย"><input className="input" value={edit.socials} onChange={(e) => setEdit({ ...edit, socials: e.target.value })} placeholder="TikTok @… · FB …" /></Field>
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={def === edit.id} onChange={(e) => { const v = e.target.checked ? edit.id : undefined; setSettings({ defaultBrandKit: v }); setDef(v); }} /> ใช้เป็นค่าเริ่มต้นของโปรเจกต์ใหม่</label>
            <div className="flex gap-3">
              {kits.some((k) => k.id === edit.id) && <button className="btn-danger" onClick={() => { setDel(edit); setEdit(null); }}><Trash2 size={16} /></button>}
              <button className="btn-primary flex-1" disabled={!edit.name.trim()} onClick={async () => { await saveBrandKit(edit); await reload(); setEdit(null); toast('บันทึกแบรนด์คิทแล้ว'); }}>บันทึก</button>
            </div>
          </div>
        )}
      </Sheet>
      <Confirm open={!!del} danger title="ลบแบรนด์คิท" message={`ลบ “${del?.name}” ใช่ไหม? โปรเจกต์เดิมจะไม่แสดงโลโก้นี้อีก`} confirmText="ลบ" onClose={() => setDel(null)}
        onConfirm={async () => { if (del) { await deleteBrandKit(del.id); reload(); } }} />
    </div>
  );
}
