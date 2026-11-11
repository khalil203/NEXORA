import { Copy, Download, FolderOpen, MoreVertical, Pencil, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ProjectThumb } from '../components/ProjectThumb';
import { Confirm, Empty, fmtBytes, fmtDate, PageHeader, Sheet, useToast } from '../components/ui';
import { deleteProject, listProjects, logActivity, saveProject, uid } from '../lib/db';
import { STATUS_LABEL } from '../lib/project';
import type { Project, ProjectStatus } from '../lib/types';

export default function Projects() {
  const nav = useNavigate();
  const toast = useToast();
  const [all, setAll] = useState<Project[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const [range, setRange] = useState<'all' | '7' | '30'>('all');
  const [menu, setMenu] = useState<Project | null>(null);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const reload = () => listProjects().then(setAll);
  useEffect(() => { reload(); }, []);

  const list = useMemo(() => all.filter((p) =>
    (status === 'all' || p.status === status) &&
    (range === 'all' || p.updatedAt > Date.now() - +range * 86400000) &&
    (!q.trim() || `${p.name} ${p.product.name} ${p.product.brand}`.toLowerCase().includes(q.trim().toLowerCase())),
  ), [all, q, status, range]);

  async function duplicate(p: Project) {
    const c = structuredClone(p);
    c.id = uid(); c.name = `${p.name} (สำเนา)`; c.createdAt = Date.now(); c.exports = []; c.status = p.scenes.length ? 'ready' : 'draft';
    await saveProject(c);
    await logActivity(`ทำสำเนา “${p.name}”`, c.id);
    toast('ทำสำเนาแล้ว');
    reload();
  }

  return (
    <div className="animate-in space-y-4">
      <PageHeader title="โปรเจกต์" sub={`${all.length} โปรเจกต์ · เก็บไว้ในเครื่องนี้เท่านั้น`} />
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
        <input className="input !pl-11" placeholder="ค้นหาโปรเจกต์หรือชื่อสินค้า" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {([['all', 'ทั้งหมด'], ['draft', 'ฉบับร่าง'], ['ready', 'พร้อมส่งออก'], ['exported', 'ส่งออกแล้ว']] as const).map(([k, l]) => (
          <button key={k} className={`chip ${status === k ? 'chip-on' : ''}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
        <span className="w-px bg-white/10 mx-1" />
        {([['all', 'ทุกช่วงเวลา'], ['7', '7 วัน'], ['30', '30 วัน']] as const).map(([k, l]) => (
          <button key={k} className={`chip ${range === k ? 'chip-on' : ''}`} onClick={() => setRange(k)}>{l}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty icon={<FolderOpen />} title={all.length ? 'ไม่พบโปรเจกต์ที่ตรงกับตัวกรอง' : 'ยังไม่มีโปรเจกต์'} text="กดปุ่ม + ด้านล่างเพื่อสร้างโฆษณาใหม่" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {list.map((p) => (
            <div key={p.id} className="relative">
              <Link to={p.scenes.length ? `/editor/${p.id}` : `/create/${p.id}`}>
                <ProjectThumb p={p} className="aspect-[3/4]" />
              </Link>
              <button className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 grid place-items-center" aria-label="ตัวเลือก" onClick={() => setMenu(p)}><MoreVertical size={16} /></button>
              <div className="mt-2 px-1">
                <div className="text-[14px] font-medium truncate">{p.name}</div>
                <div className="text-[12px] text-white/45">{STATUS_LABEL[p.status]} · {fmtDate(p.updatedAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name ?? ''}>
        {menu && (
          <div className="space-y-2">
            <button className="btn-glass w-full justify-start" onClick={() => nav(menu.scenes.length ? `/editor/${menu.id}` : `/create/${menu.id}`)}><Pencil size={16} /> แก้ไขต่อ</button>
            <button className="btn-glass w-full justify-start" onClick={() => nav(`/create/${menu.id}?step=info`)}><Pencil size={16} /> แก้ข้อมูลสินค้าและกลยุทธ์</button>
            <button className="btn-glass w-full justify-start" disabled={!menu.scenes.length} onClick={() => nav(`/publish/${menu.id}`)}><Download size={16} /> ส่งออก / แคปชัน</button>
            <button className="btn-glass w-full justify-start" onClick={() => { setRenaming(menu); setMenu(null); }}><Pencil size={16} /> เปลี่ยนชื่อ</button>
            <button className="btn-glass w-full justify-start" onClick={() => { duplicate(menu); setMenu(null); }}><Copy size={16} /> ทำสำเนา</button>
            <button className="btn-danger w-full justify-start" onClick={() => { setDeleting(menu); setMenu(null); }}><Trash2 size={16} /> ลบ</button>
            {menu.exports.length > 0 && (
              <div className="pt-3 text-[13px] text-white/55">
                <div className="font-medium text-white/80 mb-1">ประวัติการส่งออก</div>
                {menu.exports.slice(0, 5).map((e) => <div key={e.at}>{fmtDate(e.at)} · {e.format.toUpperCase()} {e.width}×{e.height} · {fmtBytes(e.bytes)}</div>)}
              </div>
            )}
          </div>
        )}
      </Sheet>
      <Sheet open={!!renaming} onClose={() => setRenaming(null)} title="เปลี่ยนชื่อโปรเจกต์">
        {renaming && (
          <form onSubmit={async (e) => { e.preventDefault(); const n = (new FormData(e.currentTarget).get('n') as string).trim(); if (n) { await saveProject({ ...renaming, name: n }); reload(); } setRenaming(null); }}>
            <input name="n" defaultValue={renaming.name} className="input mb-4" autoFocus />
            <button className="btn-primary w-full">บันทึก</button>
          </form>
        )}
      </Sheet>
      <Confirm open={!!deleting} danger title="ลบโปรเจกต์" confirmText="ลบถาวร" message={`ลบ “${deleting?.name}” และรูปที่ใช้เฉพาะโปรเจกต์นี้ ไม่สามารถกู้คืนได้`} onClose={() => setDeleting(null)}
        onConfirm={async () => { if (deleting) { await deleteProject(deleting.id); await logActivity(`ลบโปรเจกต์ “${deleting.name}”`); toast('ลบแล้ว'); reload(); } }} />
    </div>
  );
}
