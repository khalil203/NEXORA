import { AlertTriangle, CheckCircle2, Clock, Download, Film, Loader2, Plus, RefreshCw, Share2, Sparkles, Image as ImageIcon, Square, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AssetImg } from '../components/ProjectThumb';
import { Confirm, Empty, fmtBytes, PageHeader, useToast } from '../components/ui';
import { approveJob, batchState, clearFinished, regenerateJob, retryJob, runVeoBatch, stopBatch, subscribeBatch, veoPending, type Job } from '../lib/pipeline';
import { getSettings } from '../lib/settings';
import { getAsset } from '../lib/db';
import { estimateCost, fmtCost, veoStatus } from '../lib/veo';

const LABEL: Record<Job['status'], string> = {
  waiting: 'รอคิว', analyzing: 'AI วิเคราะห์', building: 'สร้างสตอรี่บอร์ด', rendering: 'กำลังเรนเดอร์', review: 'ตรวจสตอรี่บอร์ด', completed: 'เสร็จแล้ว', failed: 'ล้มเหลว',
};

function useBatch() {
  const [, force] = useState(0);
  useEffect(() => subscribeBatch(() => force((n) => n + 1)), []);
  return batchState();
}

function fileName(j: Job) {
  return `${(j.name || j.label).replace(/[\\/:*?"<>|·]/g, '').replace(/\s+/g, '-').slice(0, 50)}.${j.format ?? 'mp4'}`;
}
function download(j: Job) {
  if (!j.blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(j.blob);
  a.download = fileName(j);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function saveFrames(j: Job) {
  const ids = j.frames?.length ? j.frames : j.adPhoto ? [j.adPhoto] : [];
  const files: File[] = [];
  for (const [i, id] of ids.entries()) {
    const a = await getAsset(id);
    if (a) files.push(new File([a.blob], fileName(j).replace(/\.(mp4|webm)$/, `-ad-${i + 1}.jpg`), { type: a.blob.type || 'image/jpeg' }));
  }
  if (!files.length) return;
  try { if (navigator.canShare?.({ files })) { await navigator.share({ files }); return; } } catch { return; }
  files.forEach((f, i) => setTimeout(() => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(f); link.download = f.name;
    document.body.appendChild(link); link.click(); link.remove();
  }, i * 600));
}

export default function Batch() {
  const s = useBatch();
  const nav = useNavigate();
  const toast = useToast();
  const done = s.jobs.filter((j) => j.status === 'completed');
  // single product in Flow mode: go straight to Flow Studio when the script is ready
  useEffect(() => {
    if (getSettings().videoEngine !== 'veo' && s.jobs.length === 1 && s.jobs[0].flow && s.jobs[0].projectId && !s.running) nav(`/flow/${s.jobs[0].projectId}`, { replace: true });
  }, [s.jobs, s.running, nav]);
  const [veoModel, setVeoModel] = useState('');
  const [pending, setPending] = useState<{ ids: string[]; clips: number }>({ ids: [], clips: 0 });
  const [ask, setAsk] = useState(false);
  const engine = getSettings().videoEngine;
  useEffect(() => {
    if (s.running) return;
    veoPending().then((l) => setPending({ ids: l.map((x) => x.job.id), clips: l.reduce((t, x) => t + x.missing, 0) }));
  }, [s.jobs, s.running]);
  useEffect(() => {
    if (engine === 'veo' && pending.clips && !veoModel) veoStatus().then((v) => v.models[0] && setVeoModel(v.models[0])).catch(() => {});
  }, [engine, pending.clips, veoModel]);
  const veoCost = veoModel ? estimateCost(veoModel, pending.clips) : null;
  const total = s.jobs.length;
  const overall = total ? s.jobs.reduce((t, j) => t + (j.status === 'failed' ? 1 : j.progress), 0) / total : 0;

  async function shareAll() {
    const files = done.filter((j) => j.blob).map((j) => new File([j.blob!], fileName(j), { type: j.blob!.type }));
    try {
      if (files.length && navigator.canShare?.({ files })) await navigator.share({ files });
      else toast('อุปกรณ์นี้แชร์หลายไฟล์ไม่ได้ ใช้ดาวน์โหลดทั้งหมดแทน', 'info');
    } catch { /* cancelled */ }
  }

  return (
    <div className="animate-in space-y-4">
      <PageHeader title="สร้างวิดีโออัตโนมัติ" back="/" sub={total ? `${done.length}/${total} เสร็จแล้ว` : 'คิวงาน'}
        right={<button className="icon-btn" aria-label="เพิ่มรูปอีก" onClick={() => nav('/create')}><Plus size={20} /></button>} />

      {total === 0 ? (
        <Empty icon={<Film />} title="ยังไม่มีงานในคิว" text="อัปโหลดรูปสินค้า (ได้หลายรูป) แล้ว AI จะสร้างวิดีโอให้ทั้งหมด" action={<Link to="/create" className="btn-primary mt-2">อัปโหลดรูป</Link>} />
      ) : (
        <>
          <section className="card p-4">
            <div className="flex justify-between text-[14px] mb-2">
              <span>{s.running ? 'กำลังทำงาน… เปิดหน้าจอค้างไว้' : s.jobs.some((j) => j.status === 'review') ? 'สตอรี่บอร์ดพร้อมให้ตรวจ 👇' : done.length === total ? 'เสร็จทั้งหมดแล้ว 🎉' : 'หยุดแล้ว'}</span>
              <span className="tabular-nums">{Math.round(overall * 100)}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-ink-600 overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${overall * 100}%` }} /></div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button className="btn-primary !h-11" disabled={!done.some((j) => j.blob)} onClick={() => done.forEach((j, i) => setTimeout(() => download(j), i * 700))}><Download size={16} /> ดาวน์โหลดทั้งหมด</button>
              <button className="btn-glass !h-11" disabled={!done.some((j) => j.blob)} onClick={shareAll}><Share2 size={16} /> แชร์ทั้งหมด</button>
              {s.running && <button className="btn-ghost !h-10 col-span-2" onClick={stopBatch}><Square size={14} /> หยุดคิว</button>}
              {!s.running && done.length > 0 && <button className="btn-ghost !h-10 col-span-2" onClick={clearFinished}>ล้างรายการที่เสร็จแล้ว</button>}
            </div>
          </section>

          {pending.clips > 0 && !s.running && (
            <section className="card p-4 space-y-2 border-accent/40">
              <div className="font-semibold flex items-center gap-2"><Sparkles size={17} className="text-accent" /> สคริปต์พร้อมแล้ว {pending.ids.length} โฆษณา ({pending.clips} คลิป)</div>
              {veoModel ? (
                <button className="btn-primary w-full !h-12" onClick={() => setAsk(true)}><Sparkles size={16} /> สร้างทั้งหมดอัตโนมัติด้วย Veo · {veoCost && fmtCost(veoCost)}</button>
              ) : (
                <p className="text-[13px] text-white/60">{engine === 'veo' ? 'Veo API ยังใช้ไม่ได้ (ต้องเปิด Billing ใน Google AI Studio) — ' : ''}เปิด Flow Studio ในแต่ละโฆษณาเพื่อสร้างคลิป</p>
              )}
              <p className="text-[11px] text-white/40">เสียเงินตามจริงกับ Google (720p · 8 วิ/คลิป) · แอปจะถามยืนยันก่อนทุกครั้ง</p>
            </section>
          )}

          <div className="space-y-3">
            {s.jobs.map((j) => (
              <div key={j.id} className="card p-3 flex gap-3">
                <AssetImg id={j.adPhoto ?? j.images[0]} className="w-16 h-20 rounded-2xl shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{j.name || j.label}</div>
                  <div className="text-[12px] text-white/45 truncate">{j.label} · {j.images.length} รูป</div>
                  <div className={`mt-1 text-[12px] flex items-center gap-1 ${j.status === 'completed' ? 'text-emerald-300' : j.status === 'failed' ? 'text-red-300' : 'text-white/70'}`}>
                    {j.status === 'completed' ? <CheckCircle2 size={13} /> : j.status === 'failed' ? <XCircle size={13} /> : j.status === 'waiting' ? <Clock size={13} /> : j.status === 'review' ? <ImageIcon size={13} /> : <Loader2 size={13} className="animate-spin" />}
                    {LABEL[j.status]}{j.stage && j.status !== 'completed' && j.status !== 'waiting' ? ` · ${j.stage}` : ''}
                    {j.blob && <span className="text-white/40"> · {fmtBytes(j.blob.size)}</span>}
                  </div>
                  {j.status !== 'completed' && j.status !== 'failed' && j.status !== 'waiting' && j.status !== 'review' && (
                    <div className="h-1.5 mt-1.5 rounded-full bg-ink-600 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${j.progress * 100}%` }} /></div>
                  )}
                  {j.error && <p className="text-[12px] text-red-200 mt-1">{j.error}</p>}
                  {j.status === 'review' && !!j.frames?.length && (
                    <div className="mt-2 space-y-2 -ml-[76px]">
                      <div className="grid grid-cols-3 gap-1.5">
                        {j.frames.map((id, i) => (
                          <div key={id} className="relative">
                            <AssetImg id={id} className="w-full aspect-[9/16] rounded-xl" />
                            <span className="absolute top-1 left-1 text-[10px] font-semibold bg-black/60 rounded-full px-1.5">{i + 1}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-white/45">{j.baked ? 'ช่องจากสตอรี่บอร์ดที่คุณอัปโหลด — ตรวจว่าตัดช่องถูกและเรียงลำดับถูก' : 'สินค้าเป็นรูปจริงของคุณ (ไดคัท) · ฉากวาดโดย AI ฟรี · ข้อความไทยและเสียงพากย์จะใส่ในวิดีโอ'}</p>
                      <button className="btn-primary w-full !h-12" disabled={s.running} onClick={() => approveJob(j.id)}><Film size={16} /> ใช้สตอรี่บอร์ดนี้ → ทำวิดีโอ</button>
                      {!j.baked && <button className="btn-glass w-full !h-11" disabled={s.running} onClick={() => regenerateJob(j.id)}><RefreshCw size={15} /> สร้างสตอรี่บอร์ดใหม่</button>}
                    </div>
                  )}
                  {!!j.frames?.length && j.status !== 'review' && (
                    <div className="flex gap-1.5 mt-2">{j.frames.map((id) => <AssetImg key={id} id={id} className="w-12 aspect-[9/16] rounded-lg" />)}</div>
                  )}
                  {j.note && <p className="text-[11px] text-amber-200 mt-1 flex gap-1"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{j.note}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {j.blob && <button className="chip !h-8" onClick={() => download(j)}><Download size={13} /> ดาวน์โหลด</button>}
                    {(j.frames?.length || j.adPhoto) && <button className="chip !h-8" onClick={() => saveFrames(j)}><ImageIcon size={13} /> สตอรี่บอร์ด</button>}
                    {j.flow && j.projectId && <button className="chip chip-on !h-8" onClick={() => nav(`/flow/${j.projectId}`)}><Film size={13} /> เปิด Flow Studio</button>}
                    {!j.flow && j.projectId && <button className="chip !h-8" onClick={() => nav(`/editor/${j.projectId}`)}><Film size={13} /> แก้ไข</button>}
                    {j.projectId && j.status === 'completed' && <button className="chip !h-8" onClick={() => nav(`/publish/${j.projectId}`)}>แคปชัน</button>}
                    {j.status === 'failed' && <button className="chip !h-8" onClick={() => retryJob(j.id)}><RefreshCw size={13} /> ลองใหม่</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-white/35 text-center">เรนเดอร์ทีละวิดีโอบนเครื่องนี้ · ความเร็วขึ้นกับสเปกมือถือ · ไม่มีการจำกัดจำนวนต่อวันในแอป (AI ฟรีมีโควตาของผู้ให้บริการ)</p>
        </>
      )}
      <Confirm open={ask} onClose={() => setAsk(false)} confirmText={`ยืนยัน · ${veoCost ? fmtCost(veoCost) : ''}`}
        onConfirm={() => runVeoBatch(veoModel, pending.ids)}
        title="ยืนยันค่าใช้จ่าย Veo"
        message={`จะสร้าง ${pending.clips} คลิปสำหรับ ${pending.ids.length} โฆษณา ด้วย ${veoModel} ประมาณ ${veoCost ? fmtCost(veoCost) : ''} เรียกเก็บจากบัญชี Google ของ Gemini API key แล้วแอปจะประกอบและเรนเดอร์ให้อัตโนมัติ`} />
    </div>
  );
}
