import { Check, Clapperboard, Sparkles, CreditCard, Copy, Download, ExternalLink, Film, Loader2, RefreshCw, Share2, Trash2, Upload, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AssetImg } from '../components/ProjectThumb';
import { Confirm, copyText, PageHeader, useToast } from '../components/ui';
import { getAsset, logActivity, putAsset } from '../lib/db';
import { assembleFlowAd, FLOW_URL, requestFlowPlan } from '../lib/flow';
import { useBrandKits, useProject } from '../lib/hooks';
import { loadClips, videoFromBlob } from '../lib/aivideo';
import { generateStrategy } from '../lib/marketing';
import { estimateCost, fmtCost, generateFlowClips, veoStatus, type VeoStatus } from '../lib/veo';
import type { FlowShot } from '../lib/types';

const TYPE: Record<string, string> = { hero: 'ฮีโร่ช็อต', lifestyle: 'ไลฟ์สไตล์', usage: 'การใช้งาน', cta: 'ปิดท้าย CTA', macro: 'มาโคร' };

export default function Flow() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { project: p, update, saveNow } = useProject(id);
  const { kits } = useBrandKits();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [veo, setVeo] = useState<VeoStatus | null>(null);
  const [veoModel, setVeoModel] = useState('');
  const [ask, setAsk] = useState(false);
  const [stage, setStage] = useState('');
  const abort = useRef<AbortController | null>(null);

  async function checkVeo() {
    setVeo(null);
    try {
      const v = await veoStatus();
      setVeo(v);
      if (v.models.length && !v.models.includes(veoModel)) setVeoModel(v.models[0]);
    } catch (e) { setVeo({ ready: false, models: [], hint: (e as Error).message }); }
  }
  useEffect(() => { checkVeo(); /* free check, no credits */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    if (!p?.flow) return;
    p.flow.shots.forEach(async (s) => {
      if (s.clip && !urls[s.clip]) {
        const a = await getAsset(s.clip);
        if (a) setUrls((u) => ({ ...u, [s.clip!]: URL.createObjectURL(a.blob) }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.flow]);

  if (!p) return <div className="pt-10 grid place-items-center"><Loader2 className="animate-spin text-white/40" /></div>;
  const kit = kits.find((k) => k.id === p.brandKitId) ?? null;

  async function plan() {
    if (!p) return;
    setBusy(true);
    try {
      const fp = await requestFlowPlan(p.product, p.images[0], 3);
      update((d) => { d.flow = fp; });
      toast(`AI ผู้กำกับเขียนสคริปต์แล้ว (${fp.model})`);
    } catch (e) { toast((e as Error).message, 'err'); }
    finally { setBusy(false); }
  }

  async function sharePhoto() {
    const a = p && await getAsset(p.images[0]);
    if (!a) return;
    const f = new File([a.blob], 'product.jpg', { type: a.blob.type || 'image/jpeg' });
    try {
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f] }); return; }
    } catch { return; }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(f); link.download = 'product.jpg';
    document.body.appendChild(link); link.click(); link.remove();
  }

  async function importClip(i: number, file?: File) {
    if (!file) return;
    try {
      await videoFromBlob(file); // validate
      const a = await putAsset(file, file.name, 'video', 'Google Flow (Veo 3.1) — สร้างโดยเจ้าของบัญชี');
      update((d) => { d.flow!.shots[i].clip = a.id; });
      setUrls((u) => ({ ...u, [a.id]: URL.createObjectURL(file) }));
      toast(`นำเข้าคลิปช็อต ${i + 1} แล้ว`);
    } catch (e) { toast((e as Error).message, 'err'); }
  }

  async function assemble(shots?: FlowShot[]) {
    if (!p?.flow) return;
    const list = shots ?? p.flow.shots;
    setBusy(true);
    try {
      const clips = await loadClips(list.map((s) => s.clip).filter(Boolean) as string[]);
      let k = 0;
      const info = list.map((s) => (s.clip ? clips[k++] : null));
      update((d) => {
        if (!d.strategy) d.strategy = generateStrategy(d.product, d.style, kit?.cta);
        if (shots) d.flow!.shots = shots;
        assembleFlowAd(d, info, kit);
      });
      await saveNow();
      await logActivity(`ประกอบโฆษณาจาก Google Flow “${p.product.name}”`, p.id);
      nav(`/editor/${p.id}`);
    } catch (e) { toast((e as Error).message, 'err'); }
    finally { setBusy(false); }
  }

  async function runVeo() {
    if (!p?.flow || !veoModel) return;
    setAsk(false); setBusy(true);
    const ctrl = new AbortController(); abort.current = ctrl;
    const shots = p.flow.shots.map((s) => ({ ...s }));
    try {
      await generateFlowClips(shots, p.images[0], veoModel, (i, assetId) => {
        shots[i].clip = assetId;
        update((d) => { d.flow!.shots[i].clip = assetId; });
        getAsset(assetId).then((a) => a && setUrls((u) => ({ ...u, [assetId]: URL.createObjectURL(a.blob) })));
      }, setStage, ctrl.signal);
      await logActivity(`สร้างคลิป Veo อัตโนมัติ (${veoModel}) “${p.product.name}”`, p.id);
      setStage('กำลังประกอบโฆษณา…');
      await assemble(shots);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast((e as Error).message, 'err');
    } finally { setBusy(false); setStage(''); abort.current = null; }
  }

  const copy = (key: string, text: string) => copyText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); });
  const done = p.flow?.shots.filter((s) => s.clip).length ?? 0;
  const missing = (p.flow?.shots.length ?? 0) - done;
  const cost = veoModel ? estimateCost(veoModel, missing) : null;

  return (
    <div className="animate-in space-y-4">
      <PageHeader title="Flow Studio" back sub={p.product.name || p.name} />

      <section className="rounded-[26px] bg-hero p-4 shadow-glow">
        <div className="flex items-center gap-3">
          <AssetImg id={p.images[0]} className="w-16 h-20 rounded-2xl shrink-0" />
          <div className="min-w-0">
            <div className="thai-display font-semibold text-lg leading-tight">วิดีโอ Veo 3.1 ผ่าน Google Flow</div>
            <p className="text-[13px] text-white/85">ฟรี 50 เครดิต/วัน · คลิปละ 8 วิ · มีเสียงพากย์ไทย</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <a href={FLOW_URL} target="_blank" rel="noreferrer" className="h-11 rounded-full bg-white text-ink-900 font-semibold flex items-center justify-center gap-1.5 text-[14px]"><ExternalLink size={16} /> เปิด Google Flow</a>
          <button onClick={sharePhoto} className="h-11 rounded-full bg-white/25 border border-white/40 font-semibold flex items-center justify-center gap-1.5 text-[14px]"><Share2 size={16} /> บันทึกรูปสินค้า</button>
        </div>
      </section>

      <details className="card p-4 text-[13px] text-white/70">
        <summary className="font-semibold text-white cursor-pointer">วิธีใช้ (ทำครั้งละช็อต)</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
          <li>กด <b>บันทึกรูปสินค้า</b> แล้วกด <b>เปิด Google Flow</b></li>
          <li>ใน Flow เลือก <b>Frames to Video</b> (ช็อต “ภาพแรก”) หรือ <b>Ingredients to Video</b> (ช็อต “ส่วนผสม”) แล้วอัปโหลดรูปสินค้า</li>
          <li>ตั้งสัดส่วน <b>9:16</b> · เลือก Veo 3.1 Lite/Fast (ประหยัดเครดิต)</li>
          <li>กด <b>คัดลอก prompt</b> ด้านล่าง วางใน Flow แล้วสร้าง</li>
          <li>ดาวน์โหลดคลิป แล้วกด <b>นำเข้าคลิป</b> ในช็อตนั้น</li>
          <li>ครบแล้วกด <b>ประกอบโฆษณา</b> — แอปใส่ข้อความไทย CTA ราคา แคปชันและแฮชแท็กให้</li>
        </ol>
      </details>

      {!p.flow ? (
        <button className="btn-primary w-full !h-14" disabled={busy} onClick={plan}>{busy ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />} {busy ? 'AI ผู้กำกับกำลังเขียนสคริปต์…' : 'ให้ AI ผู้กำกับเขียนสคริปต์ Flow'}</button>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[12px] text-white/50">
            <span>สคริปต์โดย {p.flow.model}</span>
            <button className="chip !h-8 ml-auto" disabled={busy} onClick={plan}><RefreshCw size={13} /> เขียนใหม่</button>
          </div>
          <section className="card p-4 space-y-3 border-accent/40">
            <div className="flex items-center gap-2 font-semibold"><Sparkles size={17} className="text-accent" /> อัตโนมัติทั้งหมดด้วย Veo API <span className="chip !h-6 text-[11px] ml-auto"><CreditCard size={12} /> เสียเงิน</span></div>
            {!veo ? (
              <p className="text-[13px] text-white/50 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> กำลังตรวจสอบ Veo (ฟรี ไม่ใช้เครดิต)…</p>
            ) : !veo.ready ? (
              <div className="space-y-2 text-[13px] text-white/70">
                <p>{veo.hint || 'Veo ยังใช้ไม่ได้'}</p>
                <p className="text-white/50">เปิด Billing ให้โปรเจกต์ของ Gemini API key ใน Google AI Studio แล้วกดตรวจสอบอีกครั้ง — แอปจะไม่ตัดเงินจนกว่าคุณจะกดยืนยันราคาแต่ละครั้ง</p>
                <div className="flex gap-2">
                  <a className="chip" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"><ExternalLink size={13} /> เปิด Google AI Studio</a>
                  <button className="chip" onClick={checkVeo}><RefreshCw size={13} /> ตรวจสอบอีกครั้ง</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <select className="input !py-2" value={veoModel} disabled={busy} onChange={(e) => setVeoModel(e.target.value)}>
                  {veo.models.map((m) => <option key={m} value={m}>{m} · {fmtCost(estimateCost(m, 1))}/คลิป</option>)}
                </select>
                {stage ? (
                  <div className="flex items-center gap-2 text-[13px]"><Loader2 size={15} className="animate-spin" /> {stage}
                    <button className="chip !h-7 ml-auto" onClick={() => abort.current?.abort()}>หยุด</button></div>
                ) : missing > 0 ? (
                  <button className="btn-primary w-full !h-12" disabled={busy} onClick={() => setAsk(true)}><Sparkles size={17} /> สร้าง {missing} คลิป + ประกอบอัตโนมัติ · {cost && fmtCost(cost)}</button>
                ) : <p className="text-[13px] text-emerald-300">ครบทุกช็อตแล้ว — กดประกอบโฆษณาด้านล่าง</p>}
                <p className="text-[11px] text-white/40">ราคาประมาณจากราคา Gemini API (720p, {missing || 0} × 8 วิ) · เรียกเก็บโดย Google ตามจริง · Veo ใช้เวลาประมาณ 1–3 นาที/คลิป</p>
              </div>
            )}
          </section>
          <p className="text-[12px] text-white/40 text-center">หรือทำเองฟรีใน Google Flow ทีละช็อต ↓</p>

          {p.flow.shots.map((s, i) => (
            <section key={i} className={`card p-4 space-y-3 ${s.clip ? 'border-emerald-400/30' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`w-7 h-7 rounded-full grid place-items-center text-[13px] font-bold ${s.clip ? 'bg-emerald-500' : 'bg-accent'}`}>{s.clip ? <Check size={15} /> : i + 1}</span>
                <span className="font-semibold">{TYPE[s.type] ?? s.type}</span>
                <span className="chip !h-7 text-[11px]">{s.method === 'ingredients' ? 'Ingredients to Video' : 'Frames to Video'}</span>
              </div>
              {s.voice_th && <p className="text-[14px]">🎙️ <span className="text-white/80">“{s.voice_th}”</span></p>}
              {s.method === 'ingredients' && s.image_prompt && (
                <div>
                  <div className="text-[12px] text-white/50 mb-1">Prompt ภาพฉาก (ถ้าอยากสร้างภาพแรกใน Flow ก่อน)</div>
                  <div className="rounded-2xl bg-ink-700/70 p-3 text-[12px] text-white/70 max-h-24 overflow-y-auto">{s.image_prompt}</div>
                  <button className="chip !h-8 mt-1.5" onClick={() => copy(`img${i}`, s.image_prompt)}>{copied === `img${i}` ? <Check size={13} /> : <Copy size={13} />} คัดลอก prompt ภาพ</button>
                </div>
              )}
              <div>
                <div className="text-[12px] text-white/50 mb-1">Prompt วิดีโอ Veo (แก้ได้)</div>
                <textarea rows={5} className="input !text-[12px] !leading-relaxed" value={s.veo_prompt} onChange={(e) => update((d) => { d.flow!.shots[i].veo_prompt = e.target.value; }, { history: false })} />
                <button className="btn-primary w-full !h-11 mt-2" onClick={() => copy(`veo${i}`, s.veo_prompt)}>{copied === `veo${i}` ? <Check size={16} /> : <Copy size={16} />} {copied === `veo${i}` ? 'คัดลอกแล้ว' : 'คัดลอก prompt วิดีโอ'}</button>
              </div>
              <input className="input !py-2" value={s.headline} placeholder="ข้อความบนจอ (ไทย)" onChange={(e) => update((d) => { d.flow!.shots[i].headline = e.target.value; }, { history: false })} />
              {s.clip && urls[s.clip] ? (
                <div className="flex gap-3 items-center">
                  <video src={urls[s.clip]} className="w-24 aspect-[9/16] rounded-xl bg-black object-cover" muted playsInline loop autoPlay />
                  <div className="space-y-2">
                    <button className="chip" onClick={() => fileRefs.current[i]?.click()}><Upload size={14} /> เปลี่ยนคลิป</button>
                    <button className="chip text-red-300" onClick={() => update((d) => { d.flow!.shots[i].clip = null; })}><Trash2 size={14} /> เอาออก</button>
                  </div>
                </div>
              ) : (
                <button className="btn-glass w-full" onClick={() => fileRefs.current[i]?.click()}><Download size={16} /> นำเข้าคลิปจาก Flow</button>
              )}
              <input ref={(el) => (fileRefs.current[i] = el)} type="file" accept="video/*" hidden onChange={(e) => { importClip(i, e.target.files?.[0]); e.target.value = ''; }} />
            </section>
          ))}

          <section className="card p-4 space-y-2">
            <div className="font-semibold">แคปชันและแฮชแท็ก</div>
            <textarea rows={4} className="input text-[14px]" value={p.flow.caption} onChange={(e) => update((d) => { d.flow!.caption = e.target.value; }, { history: false })} />
            <input className="input" value={p.flow.hashtags.join(' ')} onChange={(e) => update((d) => { d.flow!.hashtags = e.target.value.split(/\s+/).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`)).slice(0, 4); }, { history: false })} />
            <button className="chip" onClick={() => copy('cap', `${p.flow!.caption}\n\n${p.flow!.hashtags.join(' ')}`)}>{copied === 'cap' ? <Check size={13} /> : <Copy size={13} />} คัดลอกแคปชัน + แฮชแท็ก</button>
          </section>

          <button className="btn-primary w-full !h-14 text-base" disabled={!done || busy} onClick={() => assemble()}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Clapperboard size={18} />} ประกอบโฆษณา ({done}/{p.flow.shots.length} คลิป)
          </button>
          <p className="text-[12px] text-white/40 flex gap-1"><Film size={13} className="shrink-0 mt-0.5" /> คลิปจาก Flow แบบฟรีมีลายน้ำ · เสียงพากย์ไทยมาจาก Veo ควรฟังตรวจก่อนโพสต์</p>
        </>
      )}
      <Confirm open={ask} onClose={() => setAsk(false)} onConfirm={runVeo} confirmText={`ยืนยัน · ${cost ? fmtCost(cost) : ''}`}
        title="ยืนยันค่าใช้จ่าย Veo"
        message={`จะสร้าง ${missing} คลิป ด้วย ${veoModel} (คลิปละ 8 วิ 720p) ประมาณ ${cost ? fmtCost(cost) : ''} เรียกเก็บจากบัญชี Google ของ Gemini API key · คลิปที่ถูกกรองหรือผิดพลาดอาจยังถูกคิดเงิน`} />
    </div>
  );
}
