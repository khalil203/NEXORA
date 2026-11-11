import { useEffect, useState } from 'react';
import { ArrowUp, Brain, CheckSquare, Mic, Camera, Link2, StickyNote, Sparkles, Inbox as InboxI, RefreshCw, ChevronRight, Pin, CloudOff, AlertTriangle } from 'lucide-react';
import { useStore, db, nx, save, openTasks, today, addDays, inboxNotes, type Note } from '../lib/store';
import { go, openOverlay } from '../lib/nav';
import { Cloud, AI, AIError } from '../lib/cloud';
import { greeting, ago, TYPES, snippet } from '../lib/format';
import { Section, Spinner, Logo } from '../components/ui';
import { TaskRow } from './Tasks';

export default function Home() {
  useStore();
  const [ask, setAsk] = useState('');
  const [brief, setBrief] = useState<{ busy: boolean; err?: string }>({ busy: false });
  const [mems, setMems] = useState<{ id: string; content: string }[]>([]);
  const signedIn = Cloud.on();
  const t = today();

  useEffect(() => {
    if (!signedIn) return;
    Cloud.rest<any[]>('memories?select=id,content&status=eq.suggested&deleted_at=is.null&order=created_at.desc&limit=3').then((r) => setMems(r || [])).catch(() => null);
  }, [signedIn]);

  const tasks = openTasks();
  const overdue = tasks.filter((n) => n.due && n.due < t);
  const dueToday = tasks.filter((n) => n.due === t);
  const soon = tasks.filter((n) => n.due > t && n.due <= addDays(7)).sort((a, b) => a.due.localeCompare(b.due));
  const priorities = [...overdue, ...dueToday, ...(overdue.length + dueToday.length < 3 ? soon.slice(0, 3) : [])];
  const inbox = inboxNotes();
  const review = inbox.filter((n) => ['needs_review', 'organized'].includes(nx.inbox[n.id]?.status ?? ''));
  const pinned = db.notes.filter((n) => n.pinned && n.para !== 'archive').slice(0, 6);
  const recent = db.notes.filter((n) => n.para !== 'archive' && n.type !== 'task').sort((a, b) => b.updated - a.updated).slice(0, 5);
  const b = nx.briefing?.date === t ? nx.briefing.data : null;
  const empty = db.notes.length === 0;

  async function makeBriefing() {
    setBrief({ busy: true });
    try { await Cloud.sync(); const data = await AI.call('briefing'); nx.briefing = { date: t, data, at: Date.now() }; save(); setBrief({ busy: false }); }
    catch (e) { setBrief({ busy: false, err: (e as AIError).message }); }
  }
  const submit = () => { const q = ask.trim(); if (!q) return; setAsk(''); go({ name: 'brain', ask: q }); };
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 lg:px-8 pb-32 lg:pb-12 anim-in">
      <header className="safe-t pt-5 flex items-center gap-3">
        <div className="lg:hidden"><Logo size={34} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-muted">{dateStr}</p>
          <h1 className="text-[24px] sm:text-[28px] leading-tight font-bold tracking-tight">{greeting()}{nx.name ? `, ${nx.name}` : ''}</h1>
        </div>
        <button onClick={() => go({ name: 'settings' })} className="relative w-10 h-10 rounded-full grad text-white font-semibold" aria-label="Account">
          {(nx.name || Cloud.user()?.email || 'N')[0].toUpperCase()}
          <span className={`absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full ring-2 ring-bg ${!signedIn ? 'bg-muted' : Cloud.state === 'err' ? 'bg-bad' : Cloud.state === 'busy' ? 'bg-warn' : 'bg-ok'}`} />
        </button>
      </header>

      {/* Ask */}
      <form className="mt-5 card p-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="w-10 h-10 rounded-xl grad flex items-center justify-center text-white shrink-0"><Brain size={20} /></div>
        <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask your brain anything…" className="flex-1 bg-transparent outline-none text-[15px] h-10 min-w-0" />
        <button className="icon-btn text-primary disabled:opacity-30" disabled={!ask.trim()} aria-label="Ask"><ArrowUp size={20} /></button>
      </form>
      <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        <QuickBtn icon={StickyNote} label="Note" onClick={() => openOverlay({ name: 'capture', preset: { type: 'note' } })} />
        <QuickBtn icon={CheckSquare} label="Task" onClick={() => openOverlay({ name: 'capture', preset: { type: 'task', due: t } })} />
        <QuickBtn icon={Mic} label="Voice" onClick={() => openOverlay({ name: 'capture', preset: { mode: 'voice' } })} />
        <QuickBtn icon={Camera} label="Photo" onClick={() => openOverlay({ name: 'capture', preset: { mode: 'camera' } })} />
        <QuickBtn icon={Link2} label="Link" onClick={() => openOverlay({ name: 'capture', preset: { type: 'link' } })} />
      </div>

      {!signedIn && (
        <button onClick={() => go({ name: 'settings' })} className="mt-5 w-full card p-4 flex items-center gap-3 text-left">
          <CloudOff size={22} className="text-violet shrink-0" />
          <div className="flex-1"><div className="font-semibold text-[15px]">Switch on your AI brain</div><div className="text-[13px] text-muted">Sign in to sync across devices and use AI chat, memories and auto-organizing. Notes stay on this phone until then.</div></div>
          <ChevronRight size={18} className="text-muted" />
        </button>
      )}

      {empty ? (
        <div className="mt-6 card p-6">
          <div className="grad-text text-[22px] font-bold">Everything connected. Nothing forgotten.</div>
          <p className="text-muted mt-2 text-[14px] leading-relaxed">Capture anything: a thought, a task, a photo of a receipt, a voice memo. NEXORA files it, finds the tasks and dates in it, and remembers what matters, so you can ask about it later.</p>
          <button className="btn-primary mt-4" onClick={() => openOverlay({ name: 'capture' })}>Capture your first idea</button>
        </div>
      ) : (
        <>
          {signedIn && (
            <Section title="Today's briefing" action={b && <button className="icon-btn w-8 h-8" onClick={makeBriefing} aria-label="Refresh briefing">{brief.busy ? <Spinner /> : <RefreshCw size={15} />}</button>}>
              {b ? (
                <div className="card p-5 relative overflow-hidden">
                  <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full grad opacity-15 blur-2xl" />
                  <p className="text-[17px] font-semibold leading-snug">{b.headline}</p>
                  {b.focus?.length > 0 && <ul className="mt-3 space-y-2">{b.focus.map((f, i) => (
                    <li key={i} className="flex gap-3 text-[14px]"><span className="w-6 h-6 shrink-0 rounded-lg bg-primary/15 text-primary text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="flex-1 pt-0.5">{f.text}{f.ref && db.notes.some((n) => n.id === f.ref) && <button className="ml-1 text-primary text-[13px] font-medium" onClick={() => go({ name: 'note', id: f.ref! })}>Open</button>}</span></li>
                  ))}</ul>}
                  {b.heads_up?.length > 0 && <div className="mt-3 pt-3 border-t hair space-y-1">{b.heads_up.map((h, i) => <p key={i} className="text-[13px] text-muted flex gap-2"><AlertTriangle size={14} className="text-warn mt-0.5 shrink-0" />{h}</p>)}</div>}
                  {b.evidence && <p className="mt-3 text-[11px] text-muted/80">Based on {b.evidence.tasks} open tasks, {b.evidence.recent} recent notes and {b.evidence.inbox} inbox items.</p>}
                </div>
              ) : (
                <button onClick={makeBriefing} disabled={brief.busy} className="w-full card p-4 flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-xl grad text-white flex items-center justify-center">{brief.busy ? <Spinner size={18} /> : <Sparkles size={20} />}</div>
                  <div className="flex-1"><div className="font-semibold text-[15px]">{brief.busy ? 'Preparing your briefing…' : "Prepare today's briefing"}</div><div className="text-[13px] text-muted">{brief.err || 'Your focus for today, from your real tasks and notes'}</div></div>
                </button>
              )}
            </Section>
          )}

          {priorities.length > 0 && (
            <Section title="Priorities" action={<button className="text-[13px] text-primary font-medium" onClick={() => go({ name: 'tasks' })}>All tasks</button>}>
              <div className="card divide-y hair">{priorities.slice(0, 6).map((n) => <TaskRow key={n.id} n={n} />)}</div>
            </Section>
          )}

          {(inbox.length > 0 || mems.length > 0) && (
            <Section title="Waiting for you">
              <div className="grid sm:grid-cols-2 gap-3">
                {inbox.length > 0 && (
                  <button onClick={() => go({ name: 'inbox' })} className="card p-4 text-left flex items-center gap-3">
                    <InboxI size={22} className="text-primary" />
                    <div className="flex-1"><div className="font-semibold">{inbox.length} in Inbox</div><div className="text-[13px] text-muted">{review.length ? `${review.length} organized, ready to review` : 'Captured, not filed yet'}</div></div>
                    <ChevronRight size={18} className="text-muted" />
                  </button>
                )}
                {mems.length > 0 && (
                  <button onClick={() => go({ name: 'memories' })} className="card p-4 text-left flex items-center gap-3">
                    <Sparkles size={22} className="text-violet" />
                    <div className="flex-1 min-w-0"><div className="font-semibold">Memories to confirm</div><div className="text-[13px] text-muted truncate">{mems[0].content}</div></div>
                    <ChevronRight size={18} className="text-muted" />
                  </button>
                )}
              </div>
            </Section>
          )}

          {pinned.length > 0 && (
            <Section title="Pinned">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{pinned.map((n) => <MiniCard key={n.id} n={n} pin />)}</div>
            </Section>
          )}

          {recent.length > 0 && (
            <Section title="Recent" action={<button className="text-[13px] text-primary font-medium" onClick={() => go({ name: 'vault' })}>Vault</button>}>
              <div className="card divide-y hair">{recent.map((n) => <NoteRow key={n.id} n={n} />)}</div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function QuickBtn({ icon: Icon, label, onClick }: { icon: typeof Mic; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="chip h-9 px-3.5 bg-surface border hair text-ink"><Icon size={15} className="text-primary" />{label}</button>;
}
function MiniCard({ n, pin }: { n: Note; pin?: boolean }) {
  return (
    <button onClick={() => go({ name: 'note', id: n.id })} className="card p-3.5 text-left h-28 flex flex-col">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: TYPES[n.type]?.color }}>{pin && <Pin size={11} />}{TYPES[n.type]?.label}</div>
      <div className="font-semibold text-[14px] mt-1 line-clamp-2">{n.title || 'Untitled'}</div>
      <div className="text-[12px] text-muted mt-auto line-clamp-1">{snippet(n, 60)}</div>
    </button>
  );
}
export function NoteRow({ n, right }: { n: Note; right?: React.ReactNode }) {
  return (
    <button onClick={() => go({ name: 'note', id: n.id })} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-raised/50 first:rounded-t-xl2 last:rounded-b-xl2">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TYPES[n.type]?.color }} />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[15px] truncate">{n.title || snippet(n, 50) || 'Untitled'}</div>
        <div className="text-[12px] text-muted truncate">{TYPES[n.type]?.label} · {ago(n.updated)}{snippet(n, 80) && n.title ? ` · ${snippet(n, 80)}` : ''}</div>
      </div>
      {right}
    </button>
  );
}
