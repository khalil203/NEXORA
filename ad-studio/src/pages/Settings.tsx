import { Bot, Download, HardDrive, Loader2, Lock, Trash2, Upload } from 'lucide-react';
import { pingAi } from '../lib/ai';
import { proStatus } from '../lib/pro';
import { useEffect, useRef, useState } from 'react';
import { Confirm, Field, fmtBytes, PageHeader, Segmented, useToast } from '../components/ui';
import { clearAll, exportBackup, importBackup, storageInfo } from '../lib/db';
import { useBrandKits } from '../lib/hooks';
import { FONTS, getSettings, setSettings, type Settings as S } from '../lib/settings';
import type { Aspect, Duration } from '../lib/types';

export default function Settings() {
  const toast = useToast();
  const [s, setS] = useState<S>(getSettings());
  const [store, setStore] = useState<{ used: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [clearing, setClearing] = useState(false);
  const { kits } = useBrandKits();
  const file = useRef<HTMLInputElement>(null);
  const [testing, setTesting] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  async function testAi() {
    setTesting(true); setAiStatus(null);
    try {
      const [pr, ps] = await Promise.all([pingAi(), proStatus()]);
      const parts = [
        `วิเคราะห์สินค้า: ${pr.gemini ? 'Gemini ✓' : pr.groq ? 'Groq ✓' : '✗'}`,
        `ผู้กำกับ AI: ${ps.claude ? 'Claude ✓ (+Gemini สำรอง)' : ps.gemini ? 'Gemini ✓ (Claude: ไม่มีคีย์)' : '✗'}`,
        `วิดีโอ AI: ${ps.hf ? 'Hugging Face ✓' : '✗'}`,
      ];
      setAiStatus(parts.join(' · '));
    } catch (e) { setAiStatus(`✗ ${(e as Error).message}`); }
    finally { setTesting(false); }
  }
  const set = (patch: Partial<S>) => setS(setSettings(patch));
  useEffect(() => {
    storageInfo().then(setStore);
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);
  useEffect(() => { document.documentElement.style.setProperty('--app-font', `'${s.font}'`); }, [s.font]);

  return (
    <div className="animate-in space-y-4">
      <PageHeader title="ตั้งค่า" back />
      <section className="card p-4 space-y-4">
        <h2 className="section-title">ทั่วไป</h2>
        <Field label="ชื่อของคุณ (แสดงในหน้าแรก)"><input className="input" value={s.ownerName} onChange={(e) => set({ ownerName: e.target.value })} /></Field>
        <Field label="ภาษา"><div className="input !py-3 text-white/70">ไทย (ค่าเริ่มต้น)</div></Field>
        <Field label="ฟอนต์อินเทอร์เฟซ">
          <div className="flex flex-wrap gap-2">{FONTS.map((f) => <button key={f} style={{ fontFamily: f }} className={`chip ${s.font === f ? 'chip-on' : ''}`} onClick={() => set({ font: f })}>{f}</button>)}</div>
        </Field>
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="section-title flex items-center gap-2"><Bot size={18} /> AI วิเคราะห์สินค้าอัตโนมัติ</h2>
        <p className="text-[13px] text-white/55">อัปโหลดรูปอย่างเดียว แล้ว AI จะอ่านฉลาก ระบุชื่อสินค้า และค้นข้อมูลในอินเทอร์เน็ตมากรอกให้ ใช้บริการภายนอก (Gemini/Groq ระดับฟรี) ผ่านเซิร์ฟเวอร์ Supabase ของคุณ คีย์ API อยู่บนเซิร์ฟเวอร์เท่านั้น และจะส่งรูปไปวิเคราะห์เฉพาะเมื่อเปิดใช้</p>
        <label className="flex items-center gap-3 text-[15px]"><input type="checkbox" className="w-5 h-5" checked={s.aiOn} onChange={(e) => set({ aiOn: e.target.checked })} /> เปิดใช้ AI วิเคราะห์อัตโนมัติ</label>
        <Field label="รหัสผ่านสตูดิโอ (ไม่บังคับ — เว้นว่างได้)"><input className="input" type="password" autoComplete="off" value={s.aiPass} onChange={(e) => set({ aiPass: e.target.value.trim() })} /></Field>
        <label className="flex items-start gap-3 text-[14px]"><input type="checkbox" className="w-5 h-5 mt-0.5" checked={s.aiAutoVideo} onChange={(e) => set({ aiAutoVideo: e.target.checked })} />
          <span>อัตโนมัติเต็มรูปแบบ<span className="block text-[12px] text-white/45">วิเคราะห์เสร็จแล้วสร้างวิดีโอต่อทันที โดยไม่หยุดให้ตรวจข้อมูล (ยังกลับไปแก้ได้ภายหลัง)</span></span></label>
        <label className="flex items-start gap-3 text-[14px]"><input type="checkbox" className="w-5 h-5 mt-0.5" checked={s.aiClip} onChange={(e) => set({ aiClip: e.target.checked })} />
          <span>สร้างวิดีโอ AI เคลื่อนไหวจริง (ฟรี มีโควตาต่อวัน)<span className="block text-[12px] text-white/45">ใช้ Wan 2.2 ผ่าน Hugging Face ประมาณ 1 นาทีต่อสินค้า ถ้าโควตาหมดจะใช้ภาพเคลื่อนไหวจากรูปแทนอัตโนมัติ</span></span></label>
        <Field label="เครื่องสร้างวิดีโอ">
          <Segmented value={s.videoEngine} options={[{ value: 'ltx' as const, label: 'AI ฟรี' }, { value: 'veo' as const, label: 'Veo $' }, { value: 'flow' as const, label: 'Flow' }, { value: 'wan' as const, label: 'Wan' }, { value: 'basic' as const, label: 'พื้นฐาน' }]} onChange={(v) => set({ videoEngine: v, aiClip: v !== 'basic' })} />
          <span className="block text-[12px] text-white/45 mt-1">{s.videoEngine === 'ltx' ? 'อัตโนมัติ 100% ฟรี: AI ผู้กำกับเขียนสคริปต์ → วิดีโอ LTX-2.3 (สำรอง Wan 2.2) → เสียงพากย์ไทย Gemini TTS → ประกอบ+เรนเดอร์ · โควตา GPU ฟรี ~3–4 คลิป/วัน เกินแล้วใช้ภาพเคลื่อนไหวแทน' : s.videoEngine === 'veo' ? 'Veo 3.1 ตัวเดียวกับ Flow ผ่าน API · อัตโนมัติทั้งหมดในแอป มีเสียงพากย์ไทย · เสียเงิน (~$0.40/คลิป 8 วิ ด้วย Lite) แอปแสดงราคาและถามก่อนทุกครั้ง · ต้องเปิด Billing ใน Google AI Studio' : s.videoEngine === 'flow' ? 'Veo 3.1 คุณภาพสูงสุด + เสียงพากย์ไทย · ฟรี 50 เครดิต/วัน · คุณกดสร้างใน Flow เอง (Flow ไม่มี API) แอปเตรียม prompt และประกอบโฆษณาให้' : s.videoEngine === 'wan' ? 'อัตโนมัติ 100% ด้วย Wan 2.2 (Hugging Face ฟรี ~1 โฆษณาโปร/วัน)' : 'ภาพเคลื่อนไหวจากรูป ไม่ใช้ AI วิดีโอ ไม่จำกัดจำนวน'}</span>
        </Field>
        <label className="flex items-start gap-3 text-[14px]"><input type="checkbox" className="w-5 h-5 mt-0.5" checked={s.proMode} onChange={(e) => set({ proMode: e.target.checked })} />
          <span>โหมดโปร: AI ผู้กำกับ + หลายช็อตวิดีโอ AI<span className="block text-[12px] text-white/45">AI เขียนสคริปต์และ prompt ให้ทุกช็อต แล้วสร้างวิดีโอ AI สูงสุด 3 ช็อต (~3–4 นาทีต่อสินค้า) โควตาฟรีพอประมาณ 1 โฆษณาโปรต่อวัน เกินแล้วจะใช้โหมดมาตรฐานอัตโนมัติ</span></span></label>
        <label className="flex items-start gap-3 text-[14px]"><input type="checkbox" className="w-5 h-5 mt-0.5" checked={s.aiScenes} onChange={(e) => set({ aiScenes: e.target.checked })} />
          <span>ฉากไลฟ์สไตล์ AI (ทดลอง)<span className="block text-[12px] text-white/45">AI วางสินค้าจริงลงฉากใหม่ เปิดใช้เองอัตโนมัติเมื่อโมเดลฟรีพร้อม ถ้าไม่พร้อมจะใช้รูปจริงแทน</span></span></label>
        <label className="flex items-start gap-3 text-[14px]"><input type="checkbox" className="w-5 h-5 mt-0.5" checked={s.useClaude} onChange={(e) => set({ useClaude: e.target.checked })} />
          <span>ใช้ Claude เขียนสคริปต์เมื่อมีคีย์<span className="block text-[12px] text-white/45">Claude API ไม่มีแบบฟรี ใส่คีย์เป็น Secret ชื่อ ANTHROPIC_API_KEY ใน Supabase (โปรเจกต์ shop-pos → Edge Functions → Secrets) แล้วแอปจะใช้ให้อัตโนมัติ ถ้าไม่มีคีย์หรือเครดิตหมดจะใช้ Gemini ฟรีแทน</span></span></label>
        <button className="btn-glass w-full" disabled={testing} onClick={testAi}>{testing ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />} ทดสอบการเชื่อมต่อ</button>
        {aiStatus && <p className="text-[13px] text-white/75">{aiStatus}</p>}
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="section-title">ค่าเริ่มต้นวิดีโอ</h2>
        <Field label="รูปแบบ"><Segmented value={s.aspect} options={(['9:16', '1:1', '16:9'] as Aspect[]).map((a) => ({ value: a, label: a }))} onChange={(v) => set({ aspect: v })} /></Field>
        <Field label="ความยาว (วินาที)"><Segmented value={s.duration} options={([10, 15, 30, 45, 60] as Duration[]).map((d) => ({ value: d, label: `${d}` }))} onChange={(v) => set({ duration: v })} /></Field>
        <Field label={`ระดับเสียงเพลง ${Math.round(s.musicVolume * 100)}%`} hint="แนะนำ 25–35%"><input type="range" min={0} max={1} step={0.01} value={s.musicVolume} onChange={(e) => set({ musicVolume: +e.target.value })} /></Field>
        <Field label={`ระดับเสียงเอฟเฟกต์ ${Math.round(s.sfxVolume * 100)}%`} hint="แนะนำ 40–60%"><input type="range" min={0} max={1} step={0.01} value={s.sfxVolume} onChange={(e) => set({ sfxVolume: +e.target.value })} /></Field>
        <Field label="ความละเอียดส่งออก"><Segmented value={s.exportRes} options={[{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }]} onChange={(v) => set({ exportRes: v })} /></Field>
        <Field label="เฟรมเรต"><Segmented value={s.exportFps} options={[{ value: 24, label: '24' }, { value: 30, label: '30' }, { value: 60, label: '60' }]} onChange={(v) => set({ exportFps: v })} /></Field>
        <Field label="คุณภาพ"><Segmented value={s.exportQuality} options={[{ value: 'standard', label: 'มาตรฐาน' }, { value: 'high', label: 'สูง' }]} onChange={(v) => set({ exportQuality: v })} /></Field>
        <Field label="แบรนด์คิทเริ่มต้น">
          <select className="input" value={s.defaultBrandKit ?? ''} onChange={(e) => set({ defaultBrandKit: e.target.value || undefined })}>
            <option value="">ไม่มี</option>{kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </Field>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="section-title flex items-center gap-2"><HardDrive size={18} /> พื้นที่และการสำรองข้อมูล</h2>
        {store && <p className="text-[14px] text-white/65">ใช้ไป {fmtBytes(store.used)} / {fmtBytes(store.quota)}</p>}
        <p className="text-[13px] text-white/50">{persisted ? 'เบราว์เซอร์ล็อกข้อมูลไว้ถาวรแล้ว' : 'เบราว์เซอร์อาจล้างข้อมูลเมื่อพื้นที่เต็ม — กดปุ่มด้านล่างเพื่อขอเก็บถาวร'}</p>
        {!persisted && <button className="btn-glass w-full" onClick={async () => { const ok = await navigator.storage?.persist?.(); setPersisted(!!ok); toast(ok ? 'เก็บข้อมูลถาวรแล้ว' : 'เบราว์เซอร์ไม่อนุญาต (ลองติดตั้งแอปลงหน้าจอหลัก)', ok ? 'ok' : 'info'); }}>ขอเก็บข้อมูลถาวร</button>}
        <button className="btn-glass w-full" onClick={async () => {
          const b = await exportBackup();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(b);
          a.download = `ai-ad-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          toast(`สร้างไฟล์สำรอง ${fmtBytes(b.size)} แล้ว`);
        }}><Download size={16} /> สำรองข้อมูลทั้งหมด (ไฟล์)</button>
        <button className="btn-glass w-full" onClick={() => file.current?.click()}><Upload size={16} /> กู้คืนจากไฟล์สำรอง</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { const r = await importBackup(f); toast(`กู้คืน ${r.projects} โปรเจกต์แล้ว`); } catch (err) { toast((err as Error).message, 'err'); }
        }} />
        <button className="btn-danger w-full" onClick={() => setClearing(true)}><Trash2 size={16} /> ล้างข้อมูลโปรเจกต์ทั้งหมดในเครื่อง</button>
      </section>

      <section className="card p-4 space-y-2">
        <h2 className="section-title flex items-center gap-2"><Lock size={18} /> ความเป็นส่วนตัวและบริการภายนอก</h2>
        <ul className="text-[14px] text-white/65 space-y-1.5 list-disc pl-5">
          <li>โปรเจกต์ รูป เพลง และวิดีโอ เก็บใน IndexedDB ของเครื่องนี้เท่านั้น ไม่มีการอัปโหลด</li>
          <li>แอปนี้ไม่มี API key ในโค้ด และไม่เรียกบริการที่มีค่าใช้จ่าย</li>
          <li><b>AI วิเคราะห์สินค้า:</b> {s.aiOn ? 'เปิดอยู่ — ส่งรูป (ย่อขนาด) ไปวิเคราะห์ที่เซิร์ฟเวอร์ของคุณเมื่อสร้างโปรเจกต์ใหม่' : 'ปิดอยู่ — ไม่มีการส่งรูปออกนอกเครื่อง'}</li>
          <li><b>AI สร้างวิดีโอ (ภายนอก):</b> ยังไม่ได้เชื่อมต่อ — ใช้เครื่องมือสร้างวิดีโอฟรีในเครื่องแทน</li>
          <li><b>สำรองบนคลาวด์ (Supabase):</b> ยังไม่ได้เชื่อมต่อ — ใช้ไฟล์สำรองด้านบนแทนได้</li>
        </ul>
      </section>
      <Confirm open={clearing} danger title="ล้างข้อมูลทั้งหมด" confirmText="ล้างทั้งหมด" message="โปรเจกต์ รูป เพลงที่อัปโหลด และแบรนด์คิททั้งหมดในเครื่องนี้จะถูกลบถาวร แนะนำให้สำรองข้อมูลก่อน"
        onClose={() => setClearing(false)} onConfirm={async () => { await clearAll(); toast('ล้างข้อมูลแล้ว'); }} />
    </div>
  );
}
