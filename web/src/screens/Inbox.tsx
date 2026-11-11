import { useState } from 'react';
import { Inbox as InboxI, Sparkles, RotateCcw, AlertTriangle, CheckCircle2, Clock, Loader2, Plus, Users, CalendarDays, Link2, Mic, Camera, FileText, Type, Check, X, FolderInput, Wand2 } from 'lucide-react';
import { useStore, nx, save, byId, newNote, updateNote, inboxNotes, toast, type Note, type InboxStatus, type Para } from '../lib/store';
import { go, openOverlay } from '../lib/nav';
import { Cloud, AI, Inbox, applySuggestion, undoSuggestion, logAudit } from '../lib/cloud';
import { ago, TYPES, PARAS, snippet } from '../lib/format';
import { Page, Empty, Seg, Spinner } from '../components/ui';

const STATUS: Record<InboxStatus, { label: string; cls: string; icon: typeof Clock }> = {
  received: { label: 'Received', cls: 'bg-raised text-muted', icon: Clock },
  processing: { label: 'Processing', cls: 'bg-primary/15 text-primary', icon: Loader2 },
  organized: { label: 'Organized', cls: 'bg-ok/15 text-ok', icon: CheckCircle2 },
  needs_review: { label: 'Needs review', cls: 'bg-warn/15 text-warn', icon: AlertTriangle },
  failed: { label: 'Failed', cls: 'bg-bad/15 text-bad', icon: AlertTriangle },
};
const SRC: Record<string, typeof Type> = { voice: Mic, photo: Camera, camera: Camera, file: FileText, link: Link2, text: Type, paste: Type };

export default function InboxScreen() {
  useStore();
  const [f, setF] = useState<'all' | InboxStatus>('all');
  const items = inboxNotes().sort((a, b) => b.created - a.created);
  const st = (n: Note): InboxStatus => nx.inbox[n.id]?.status ?? 'received';
  const shown = items.filter((n) => f === 'all' || st(n) === f);
  const filed = Object.entries(nx.inbox).filter(([id, e]) => e.applied && byId(id) && byId(id)!.para !== 'inbox').sort((a, b) => b[1].at - a[1].at).slice(0, 5);
  const waiting = items.filter((n) => st(n) === 'received' || st(n) === 'failed');

  function organizeAll() {
    if (!Cloud.on()) { toast('Sign in first so AI can organize your inbox'); go({ name: 'settings' }); return; }
    if (!nx.prefs.ai_processing) { toast('AI processing is off. Turn it on in Settings.'); return; }
    waiting.forEach((n) => { nx.inbox[n.id] = { ...(nx.inbox[n.id] ?? { source: 'text' }), status: 'received', at: Date.now() }; });
    save(); toast(`Organizing ${waiting.length} item${waiting.length > 1 ? 's' : ''}…`);
    (async () => { await Cloud.sync(); for (const n of waiting) await Inbox.process(n.id, true); })();
  }

  return (
    <Page title="Inbox" backBtn={false} sub="Everything you capture lands here first"
      actions={waiting.length > 0 && <button className="btn-primary btn-sm" onClick={organizeAll}><Wand2 size={15} /> Organize {waiting.length}</button>}>
      <Seg value={f} onChange={setF} options={[['all', `All ${items.length || ''}`], ['needs_review', 'Needs review'], ['organized', 'Organized'], ['received', 'Received'], ['failed', 'Failed']]} />
      <div className="mt-4 space-y-3">
        {shown.length ? shown.map((n) => <Item key={n.id} n={n} />)
          : <Empty icon={<InboxI size={26} />} title={f === 'all' ? 'Inbox zero' : 'Nothing here'}
              text={f === 'all' ? 'Capture anything with the + button: text, voice, photos, files or links. NEXORA reads it, finds tasks, dates and people, and suggests where it belongs.' : 'No items with this status.'}
              action={f === 'all' && <button className="btn-primary" onClick={() => openOverlay({ name: 'capture' })}><Plus size={18} /> Capture</button>} />}
      </div>
      {filed.length > 0 && (
        <div className="mt-8">
          <h2 className="label px-1 mb-2.5">Recently filed</h2>
          <div className="card divide-y hair">
            {filed.map(([id, e]) => { const n = byId(id)!; return (
              <div key={id} className="px-4 py-3 flex items-center gap-3">
                <CheckCircle2 size={18} className="text-ok shrink-0" />
                <button className="flex-1 min-w-0 text-left" onClick={() => go({ name: 'note', id })}><div className="truncate text-[14px] font-medium">{n.title || 'Untitled'}</div><div className="text-[12px] text-muted">Filed to {PARAS[n.para]} · {ago(e.at)}</div></button>
                <button className="btn-ghost btn-sm" onClick={() => undoSuggestion(id)}><RotateCcw size={14} /> Undo</button>
              </div>); })}
          </div>
        </div>
      )}
    </Page>
  );
}

function Item({ n }: { n: Note }) {
  const e = nx.inbox[n.id];
  const status: InboxStatus = e?.status ?? 'received';
  const S = STATUS[status]; const Src = SRC[e?.source ?? (n.captured as string) ?? 'text'] ?? Type;
  const r = e?.result;
  const [memState, setMemState] = useState<Record<string, 'confirmed' | 'rejected'>>({});
  const [move, setMove] = useState(false);

  function addTask(t: { title: string; due: string | null }, i: number) {
    const task = newNote({ type: 'task', para: 'areas', title: t.title, due: t.due || '', body: n.title ? `From [[${n.title}]]` : '' });
    e!.createdTasks = [...(e!.createdTasks ?? []), String(i)]; save();
    logAudit('user', 'task.created_from_suggestion', task.id, { from: n.id });
    toast('Task added', 'Open', () => go({ name: 'note', id: task.id }));
  }
  async function setMem(id: string, status: 'confirmed' | 'rejected') {
    try {
      await Cloud.rest(`memories?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status }) });
      await Cloud.rest('memory_versions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ memory_id: id, version: 1, content: r!.memories.find((m) => m.id === id)?.content ?? '', status, changed_by: 'user', reason: status === 'confirmed' ? 'Approved in Inbox' : 'Rejected in Inbox' }) });
      setMemState((s) => ({ ...s, [id]: status }));
    } catch (err) { toast((err as Error).message); }
  }
  function fileTo(para: Para) { updateNote(n.id, { para }); setMove(false); logAudit('user', 'inbox.filed_manually', n.id, { para }); toast(`Filed to ${PARAS[para]}`); }

  return (
    <div className="card p-4 anim-in">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center shrink-0 text-muted"><Src size={17} /></div>
        <button className="flex-1 min-w-0 text-left" onClick={() => go({ name: 'note', id: n.id })}>
          <div className="font-semibold text-[15px] truncate">{n.title || snippet(n, 60) || 'Untitled'}</div>
          <div className="text-[12px] text-muted">{TYPES[n.type]?.label} · {ago(n.created)}{n.files?.length ? ` · ${n.files.length} file${n.files.length > 1 ? 's' : ''}` : ''}</div>
        </button>
        <span className={`pill ${S.cls}`}><S.icon size={11} className={status === 'processing' ? 'animate-spin' : ''} />{S.label}</span>
      </div>

      {r && (
        <div className="mt-3 space-y-3">
          {r.summary && <p className="text-[14px] text-muted leading-relaxed">{r.summary}</p>}
          {status === 'needs_review' && r.review_reason && <p className="text-[13px] text-warn flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{r.review_reason}</p>}
          <div className="flex flex-wrap gap-1.5 text-[12px]">
            <span className="pill bg-primary/15 text-primary">{TYPES[r.type]?.label}</span>
            <span className="pill bg-violet/15 text-violet">→ {PARAS[r.para === 'inbox' ? 'resources' : r.para]}</span>
            {r.tags.map((t) => <span key={t} className="pill bg-raised text-muted">#{t}</span>)}
          </div>
          {(r.people.length > 0 || r.dates.length > 0) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
              {r.people.length > 0 && <span className="flex items-center gap-1.5"><Users size={13} />{r.people.join(', ')}</span>}
              {r.dates.map((d, i) => <span key={i} className="flex items-center gap-1.5"><CalendarDays size={13} />{d.date} · {d.what}</span>)}
            </div>
          )}
          {r.tasks.length > 0 && nx.prefs.task_creation !== 'off' && (
            <div className="rounded-xl bg-raised/60 p-3">
              <div className="label mb-2">Tasks found</div>
              {r.tasks.map((t, i) => { const done = e?.createdTasks?.includes(String(i)); return (
                <div key={i} className="flex items-center gap-2 py-1">
                  <span className="flex-1 text-[14px]">{t.title}{t.due && <span className="text-muted text-[12px]"> · {t.due}</span>}</span>
                  {done ? <span className="text-[12px] text-ok flex items-center gap-1"><Check size={13} /> Added</span> : <button className="btn-soft btn-sm h-8" onClick={() => addTask(t, i)}><Plus size={14} /> Add</button>}
                </div>); })}
            </div>
          )}
          {r.memories.length > 0 && (
            <div className="rounded-xl bg-raised/60 p-3">
              <div className="label mb-2 flex items-center gap-1.5"><Sparkles size={12} /> Remember this?</div>
              {r.memories.map((m) => { const s = memState[m.id]; return (
                <div key={m.id} className="flex items-center gap-2 py-1">
                  <span className={`flex-1 text-[14px] ${s === 'rejected' ? 'line-through text-muted' : ''}`}>{m.content}{m.conflicts_with && <span className="text-warn text-[12px]"> · conflicts with an existing memory</span>}</span>
                  {s ? <span className={`text-[12px] ${s === 'confirmed' ? 'text-ok' : 'text-muted'}`}>{s === 'confirmed' ? 'Saved' : 'Dismissed'}</span> : (<>
                    <button className="icon-btn w-8 h-8 text-ok" onClick={() => setMem(m.id, 'confirmed')} aria-label="Remember"><Check size={16} /></button>
                    <button className="icon-btn w-8 h-8" onClick={() => setMem(m.id, 'rejected')} aria-label="Dismiss"><X size={16} /></button></>)}
                </div>); })}
            </div>
          )}
          {r.related.length > 0 && <div className="flex flex-wrap gap-1.5 items-center text-[12px]"><span className="text-muted">Related:</span>{r.related.map((x) => <button key={x.id} className="pill bg-raised text-ink" onClick={() => go({ name: 'note', id: x.id })}>{x.title || 'Untitled'}</button>)}</div>}
        </div>
      )}
      {status === 'failed' && <p className="mt-3 text-[13px] text-bad">{e?.error || 'Processing failed.'}</p>}
      {status === 'received' && e?.error && <p className="mt-3 text-[13px] text-muted">{e.error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {r && <button className="btn-primary btn-sm" onClick={() => { applySuggestion(n.id); toast(`Filed to ${PARAS[byId(n.id)!.para]}`, 'Undo', () => undoSuggestion(n.id)); }}><Check size={15} /> File it</button>}
        {(status === 'failed' || (status === 'received' && Cloud.on())) && <button className="btn-soft btn-sm" disabled={!AI.ready()} onClick={() => Inbox.process(n.id)}><Sparkles size={14} /> {status === 'failed' ? 'Retry' : 'Organize'}</button>}
        {status === 'processing' && <span className="text-[13px] text-muted flex items-center gap-2"><Spinner size={14} /> Reading, linking, finding tasks…</span>}
        <button className="btn-ghost btn-sm" onClick={() => setMove(!move)}><FolderInput size={14} /> Move</button>
      </div>
      {move && <div className="mt-2 flex flex-wrap gap-1.5">{(['projects', 'areas', 'resources', 'archive'] as Para[]).map((p) => <button key={p} className="chip" onClick={() => fileTo(p)}>{PARAS[p]}</button>)}</div>}
      {!Cloud.on() && status === 'received' && <p className="mt-2 text-[12px] text-muted">Sign in to let AI organize this, or move it yourself.</p>}
    </div>
  );
}
