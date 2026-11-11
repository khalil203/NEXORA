import { useEffect, useState } from 'react';
import { Sparkles, Check, X, PenLine, History, Trash2, Plus, FileText, AlertTriangle, Search, Clock3 } from 'lucide-react';
import { useStore, byId, toast } from '../lib/store';
import { go } from '../lib/nav';
import { Cloud, AI } from '../lib/cloud';
import { ago } from '../lib/format';
import { Page, Empty, Seg, Spinner, Sheet } from '../components/ui';

type Mem = { id: string; content: string; category: string; kind: string; status: string; importance: number; confidence: number; source_type: string | null; source_id: string | null; source_excerpt: string | null; conflicts_with: string | null; created_by: string; version: number; created_at: string; updated_at: string; expires_at: string | null };
type Ver = { version: number; content: string; status: string | null; changed_by: string; reason: string | null; created_at: string };
const CATS = ['personal', 'preference', 'work', 'business', 'project', 'person', 'goal', 'skill', 'decision', 'commitment'];
const KINDS: Record<string, string> = { fact: 'Fact', preference: 'Preference', temporary: 'Temporary', suggestion: 'AI suggestion', assumption: 'Unverified' };

export default function Memories({ focus }: { focus?: string }) {
  useStore();
  const [list, setList] = useState<Mem[] | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'suggested' | 'confirmed' | 'all'>('confirmed');
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(false);
  const [hist, setHist] = useState<{ m: Mem; v: Ver[] | null } | null>(null);

  async function load() {
    try {
      const r = await Cloud.rest<Mem[]>('memories?select=id,content,category,kind,status,importance,confidence,source_type,source_id,source_excerpt,conflicts_with,created_by,version,created_at,updated_at,expires_at&deleted_at=is.null&order=updated_at.desc&limit=500');
      setList(r || []); setErr('');
      if (r?.some((m) => m.status === 'suggested') && !focus) setTab('suggested');
      if (focus) setTab('all');
    } catch (e) { setErr((e as Error).message); setList([]); }
  }
  useEffect(() => { if (Cloud.on()) load(); }, []);
  useEffect(() => { if (focus && list) setTimeout(() => document.getElementById('m-' + focus)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200); }, [focus, list]);

  if (!Cloud.on()) return <Page title="My Memories"><Empty icon={<Sparkles size={26} />} title="Your long-term memory" text="NEXORA remembers durable things about you: goals, preferences, people, decisions. Every memory shows where it came from, and you approve, edit or delete each one. Sign in to switch it on." action={<button className="btn-primary" onClick={() => go({ name: 'settings' })}>Sign in</button>} /></Page>;

  async function patch(m: Mem, body: Partial<Mem>, reason: string) {
    const version = body.content && body.content !== m.content ? m.version + 1 : m.version;
    try {
      await Cloud.rest(`memories?id=eq.${m.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...body, version, ...(body.content ? { embedding: null } : {}) }) });
      await Cloud.rest('memory_versions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ memory_id: m.id, version, content: body.content ?? m.content, status: body.status ?? m.status, changed_by: 'user', reason }) });
      if (body.content) AI.indexSoon();
      setList((l) => l!.map((x) => (x.id === m.id ? { ...x, ...body, version, updated_at: new Date().toISOString() } : x)));
    } catch (e) { toast((e as Error).message); }
  }
  async function forget(m: Mem) {
    if (!confirm('Forget this memory permanently? It cannot be recovered.')) return;
    try { await Cloud.rest(`memories?id=eq.${m.id}`, { method: 'DELETE' }); setList((l) => l!.filter((x) => x.id !== m.id)); toast('Forgotten'); }
    catch (e) { toast((e as Error).message); }
  }
  async function showHist(m: Mem) {
    setHist({ m, v: null });
    try { const v = await Cloud.rest<Ver[]>(`memory_versions?select=version,content,status,changed_by,reason,created_at&memory_id=eq.${m.id}&order=created_at.desc`); setHist({ m, v: v || [] }); }
    catch { setHist({ m, v: [] }); }
  }

  const count = (s: string) => (list ?? []).filter((m) => m.status === s).length;
  const shown = (list ?? []).filter((m) => (tab === 'all' ? true : m.status === tab) && (!q || m.content.toLowerCase().includes(q.toLowerCase()) || m.category.includes(q.toLowerCase())));
  const byCat = shown.reduce<Record<string, Mem[]>>((a, m) => { (a[m.category] ||= []).push(m); return a; }, {});

  return (
    <Page title="My Memories" sub="What NEXORA remembers about you, and why"
      actions={<button className="btn-primary btn-sm" onClick={() => setAdd(true)}><Plus size={16} /> Add</button>}>
      <Seg value={tab} onChange={setTab} options={[['suggested', `To review ${count('suggested') || ''}`], ['confirmed', `Confirmed ${count('confirmed') || ''}`], ['all', 'All']]} />
      {(list?.length ?? 0) > 6 && <div className="relative mt-3"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter memories" className="input h-10 pl-10" /></div>}
      {err && <p className="mt-3 text-bad text-[14px]">{err}</p>}
      <div className="mt-4">
        {list === null ? <div className="py-10 flex justify-center text-muted"><Spinner size={22} /></div>
          : !shown.length ? <Empty icon={<Sparkles size={26} />} title={tab === 'suggested' ? 'Nothing to review' : 'No memories yet'}
              text={tab === 'suggested' ? 'When NEXORA reads your captures, it suggests things worth remembering. They wait here for your OK.' : 'Add something you want NEXORA to always know, like your goals, how you like to work, or key facts about your business. Or capture notes and approve its suggestions.'}
              action={<button className="btn-primary" onClick={() => setAdd(true)}><Plus size={18} /> Add a memory</button>} />
          : Object.entries(byCat).map(([cat, ms]) => (
            <div key={cat} className="mb-5">
              <h2 className="label px-1 mb-2 capitalize">{cat}</h2>
              <div className="space-y-2.5">{ms.map((m) => <MemCard key={m.id} m={m} focus={m.id === focus} onPatch={patch} onForget={forget} onHist={showHist} conflict={list.find((x) => x.id === m.conflicts_with)} />)}</div>
            </div>
          ))}
      </div>

      <AddMemory open={add} onClose={() => setAdd(false)} onAdded={(m) => { setList((l) => [m, ...(l ?? [])]); setTab('confirmed'); }} />
      <Sheet open={!!hist} onClose={() => setHist(null)} title="Version history">
        {hist?.v === null ? <Spinner /> : !hist?.v?.length ? <p className="text-muted text-[14px]">No history recorded.</p> : (
          <ol className="space-y-3">{hist.v.map((v, i) => (
            <li key={i} className="rounded-xl bg-raised/60 p-3"><div className="text-[12px] text-muted">v{v.version} · {v.changed_by === 'ai' ? 'AI' : 'You'} · {new Date(v.created_at).toLocaleString()}{v.status ? ` · ${v.status}` : ''}</div><div className="text-[14px] mt-1">{v.content}</div>{v.reason && <div className="text-[12px] text-muted mt-1">{v.reason}</div>}</li>
          ))}</ol>
        )}
      </Sheet>
    </Page>
  );
}

function MemCard({ m, focus, onPatch, onForget, onHist, conflict }: { m: Mem; focus: boolean; onPatch: (m: Mem, b: Partial<Mem>, r: string) => void; onForget: (m: Mem) => void; onHist: (m: Mem) => void; conflict?: Mem }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(m.content);
  const [why, setWhy] = useState(false);
  const src = m.source_type === 'note' && m.source_id ? byId(m.source_id) : null;
  return (
    <div id={'m-' + m.id} className={`card p-4 ${focus ? 'ring-2 ring-primary' : ''} ${m.status === 'rejected' || m.status === 'outdated' ? 'opacity-60' : ''}`}>
      {edit ? (
        <div><textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="w-full rounded-xl bg-raised p-3 outline-none text-[15px]" />
          <div className="mt-2 flex gap-2"><button className="btn-primary btn-sm" onClick={() => { onPatch(m, { content: text.trim(), status: 'confirmed' }, 'Edited by you'); setEdit(false); }} disabled={!text.trim()}>Save</button><button className="btn-ghost btn-sm" onClick={() => { setText(m.content); setEdit(false); }}>Cancel</button></div></div>
      ) : <p className="text-[15px] leading-relaxed">{m.content}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={`pill ${m.status === 'confirmed' ? 'bg-ok/15 text-ok' : m.status === 'suggested' ? 'bg-warn/15 text-warn' : 'bg-raised text-muted'}`}>{m.status === 'suggested' ? 'Needs your OK' : m.status}</span>
        <span className="pill bg-raised text-muted">{KINDS[m.kind] ?? m.kind}</span>
        {m.created_by === 'ai' && <span className="pill bg-violet/15 text-violet">AI · {Math.round(m.confidence * 100)}% sure</span>}
        {m.expires_at && <span className="pill bg-raised text-muted"><Clock3 size={10} /> until {new Date(m.expires_at).toLocaleDateString()}</span>}
        <span className="text-muted">{ago(m.updated_at)}{m.version > 1 ? ` · v${m.version}` : ''}</span>
      </div>
      {conflict && <p className="mt-2 text-[13px] text-warn flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />Conflicts with: "{conflict.content}"</p>}
      {(src || m.source_excerpt) && (
        <div className="mt-2 text-[13px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {src && <button className="text-primary flex items-center gap-1.5" onClick={() => go({ name: 'note', id: src.id })}><FileText size={13} /> From: {src.title || 'Untitled note'}</button>}
            {m.source_excerpt && <button className="text-muted" onClick={() => setWhy(!why)}>{why ? 'Hide source text' : 'Why was this saved?'}</button>}
          </div>
          {why && m.source_excerpt && <p className="mt-1 text-muted italic">"{m.source_excerpt}"</p>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1 -ml-2">
        {m.status === 'suggested' && <><button className="btn-ghost btn-sm h-8 text-ok" onClick={() => onPatch(m, { status: 'confirmed' }, 'Approved')}><Check size={15} /> Remember</button><button className="btn-ghost btn-sm h-8" onClick={() => onPatch(m, { status: 'rejected' }, 'Rejected')}><X size={15} /> Dismiss</button></>}
        {m.status === 'confirmed' && <button className="btn-ghost btn-sm h-8" onClick={() => onPatch(m, { status: 'outdated' }, 'Marked outdated')}>Outdated</button>}
        {(m.status === 'rejected' || m.status === 'outdated') && <button className="btn-ghost btn-sm h-8" onClick={() => onPatch(m, { status: 'confirmed' }, 'Restored')}>Restore</button>}
        <button className="btn-ghost btn-sm h-8" onClick={() => setEdit(true)}><PenLine size={14} /> Edit</button>
        <button className="btn-ghost btn-sm h-8" onClick={() => onHist(m)}><History size={14} /></button>
        <button className="btn-ghost btn-sm h-8 hover:text-bad" onClick={() => onForget(m)} aria-label="Forget"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function AddMemory({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (m: Mem) => void }) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('personal');
  const [kind, setKind] = useState('fact');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const [m] = await Cloud.rest<Mem[]>('memories?select=*', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ content: content.trim(), category, kind, status: 'confirmed', created_by: 'user', confidence: 1, importance: 3, source_type: 'manual' }) });
      await Cloud.rest('memory_versions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ memory_id: m.id, version: 1, content: m.content, status: 'confirmed', changed_by: 'user', reason: 'Added by you' }) });
      AI.indexSoon(); onAdded(m); setContent(''); onClose(); toast('Remembered');
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add a memory">
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="e.g. I prefer short morning briefings. My main goal this year is to grow Solar Rooftop." className="w-full rounded-2xl bg-raised p-4 outline-none text-[15px]" />
      <div className="label mt-4 mb-2">Category</div>
      <div className="flex flex-wrap gap-1.5">{CATS.map((c) => <button key={c} className={`chip capitalize ${category === c ? 'chip-on' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}</div>
      <div className="label mt-4 mb-2">Type</div>
      <div className="flex flex-wrap gap-1.5">{['fact', 'preference', 'temporary'].map((k) => <button key={k} className={`chip ${kind === k ? 'chip-on' : ''}`} onClick={() => setKind(k)}>{KINDS[k]}</button>)}</div>
      <button className="btn-primary w-full mt-5" disabled={!content.trim() || busy} onClick={save}>{busy ? <Spinner /> : 'Remember this'}</button>
    </Sheet>
  );
}
