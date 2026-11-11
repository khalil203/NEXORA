import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Mic, Square, History, Plus, Trash2, Copy, FilePlus2, ListPlus, Brain as BrainI, Sparkles, FileText, MessageSquare } from 'lucide-react';
import { useStore, nx, save, newNote, byId, toast } from '../lib/store';
import { go, openOverlay } from '../lib/nav';
import { Cloud, AI } from '../lib/cloud';
import { md, ago } from '../lib/format';
import { Page, Empty, Sheet, Thinking, Spinner, Logo } from '../components/ui';

type Cite = { n: number; type: 'note' | 'memory' | 'message'; id: string; title: string; excerpt: string; status?: string };
type Msg = { id?: string; role: 'user' | 'assistant'; content: string; citations?: Cite[]; sources?: Cite[]; streaming?: boolean; error?: string };
type Conv = { id: string; title: string; updated_at: string };

const PROMPTS = [
  'What should I focus on today?',
  'What do you know about my current projects?',
  'What have I forgotten to follow up on?',
  'What did I decide last week?',
  'Find the business idea I wrote about before',
  'What do you remember about me?',
];

export default function BrainScreen({ conv: conv0, ask }: { conv?: string; ask?: string }) {
  useStore();
  const [convId, setConvId] = useState<string | undefined>(conv0);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hist, setHist] = useState<{ open: boolean; list: Conv[]; loading: boolean }>({ open: false, list: [], loading: false });
  const [rec, setRec] = useState<'off' | 'on' | 'busy'>('off');
  const mr = useRef<MediaRecorder | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const signedIn = Cloud.on();

  useEffect(() => {
    if (!signedIn) return;
    if (ask) { send(ask); return; }
    const id = conv0 ?? nx.lastConversation;
    if (id) openConv(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs]);
  useEffect(() => { if (signedIn) loadHist(); }, [signedIn]); // desktop panel

  async function loadHist() {
    setHist((h) => ({ ...h, loading: true }));
    try { const list = await Cloud.rest<Conv[]>('conversations?select=id,title,updated_at&deleted_at=is.null&order=updated_at.desc&limit=60'); setHist((h) => ({ ...h, list: list || [], loading: false })); }
    catch { setHist((h) => ({ ...h, loading: false })); }
  }
  async function openConv(id: string) {
    setLoading(true); setConvId(id); setHist((h) => ({ ...h, open: false }));
    try {
      const rows = await Cloud.rest<any[]>(`messages?select=id,role,content,citations&conversation_id=eq.${id}&order=created_at.asc&limit=300`);
      setMsgs((rows || []).map((r) => ({ id: r.id, role: r.role, content: r.content, citations: r.citations })));
      nx.lastConversation = id; save();
    } catch { setMsgs([]); setConvId(undefined); }
    setLoading(false);
  }
  function newChat() { setConvId(undefined); setMsgs([]); nx.lastConversation = undefined; save(); setHist((h) => ({ ...h, open: false })); }
  async function delConv(id: string) {
    if (!confirm('Delete this conversation permanently?')) return;
    try { await Cloud.rest(`conversations?id=eq.${id}`, { method: 'DELETE' }); if (id === convId) newChat(); loadHist(); toast('Conversation deleted'); }
    catch (e) { toast((e as Error).message); }
  }

  async function send(text?: string) {
    const q = (text ?? input).trim(); if (!q || busy) return;
    setInput(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '', streaming: true }]);
    const patch = (f: (a: Msg) => Msg) => setMsgs((m) => { const c = m.slice(); c[c.length - 1] = f(c[c.length - 1]); return c; });
    try {
      if (Cloud.state !== 'busy') await Cloud.sync();
      for await (const ev of AI.chat(q, convId)) {
        if (ev.type === 'meta') { setConvId(ev.conversation_id); nx.lastConversation = ev.conversation_id; save(); patch((a) => ({ ...a, sources: ev.sources })); }
        else if (ev.type === 'delta') patch((a) => ({ ...a, content: a.content + ev.text }));
        else if (ev.type === 'done') patch((a) => ({ ...a, id: ev.message_id, citations: ev.citations, streaming: false }));
        else if (ev.type === 'error') patch((a) => ({ ...a, streaming: false, error: ev.error }));
      }
      patch((a) => ({ ...a, streaming: false }));
      loadHist();
    } catch (e) {
      patch((a) => ({ ...a, streaming: false, error: (e as Error).message }));
    } finally { setBusy(false); }
  }

  async function toggleRec() {
    if (rec === 'on') { mr.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream); const chunks: Blob[] = [];
      m.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      m.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setRec('busy');
        try { const t = await AI.transcribe(new Blob(chunks, { type: m.mimeType || 'audio/webm' })); if (t) setInput((x) => (x ? x + ' ' : '') + t); }
        catch (e) { toast((e as Error).message); }
        setRec('off');
      };
      m.start(); mr.current = m; setRec('on');
    } catch { toast('Microphone not available'); }
  }

  function openCite(c: Cite) {
    if (c.type === 'note') { if (byId(c.id)) go({ name: 'note', id: c.id }); else toast('That note is not on this device yet. Sync and try again.'); }
    else if (c.type === 'memory') go({ name: 'memories', focus: c.id });
    else toast(c.excerpt);
  }
  function onMsgClick(e: React.MouseEvent, m: Msg) {
    const el = e.target as HTMLElement;
    if (el.dataset.cite) { const c = (m.citations ?? m.sources ?? []).find((x) => x.n === Number(el.dataset.cite)); if (c) openCite(c); }
    else if (el.dataset.tag) go({ name: 'vault', tag: el.dataset.tag });
    else if (el.tagName === 'A') { e.preventDefault(); window.open((el as HTMLAnchorElement).href, '_blank'); }
  }
  function saveAsNote(i: number) {
    const a = msgs[i]; const qn = msgs[i - 1]?.content ?? 'AI answer';
    const refs = (a.citations ?? []).map((c) => `- [${c.n}] ${c.type === 'note' ? `[[${c.title}]]` : c.title}`).join('\n');
    const n = newNote({ type: 'note', para: 'resources', title: qn.slice(0, 80), body: `${a.content}${refs ? `\n\n**Sources**\n${refs}` : ''}\n\n#ai-answer` });
    toast('Saved to your vault', 'Open', () => go({ name: 'note', id: n.id }));
  }

  if (!signedIn) {
    return <Page title="AI Brain"><Empty icon={<BrainI size={26} />} title="Talk to your second brain" text="Ask about your projects, decisions, ideas and plans. NEXORA answers from your own notes and memories and shows where each answer came from. Sign in to switch it on." action={<button className="btn-primary" onClick={() => go({ name: 'settings' })}>Sign in</button>} /></Page>;
  }

  const HistList = (
    <div className="space-y-0.5">
      <button className="w-full btn-soft btn-sm justify-start mb-2" onClick={newChat}><Plus size={15} /> New conversation</button>
      {hist.loading && !hist.list.length && <div className="p-3 text-muted"><Spinner /></div>}
      {!hist.loading && !hist.list.length && <p className="text-[13px] text-muted px-2 py-3">No conversations yet.</p>}
      {hist.list.map((c) => (
        <div key={c.id} className={`group flex items-center rounded-xl ${c.id === convId ? 'bg-primary/15' : 'hover:bg-raised'}`}>
          <button onClick={() => openConv(c.id)} className="flex-1 min-w-0 text-left px-3 py-2"><div className="text-[14px] truncate">{c.title}</div><div className="text-[11px] text-muted">{ago(c.updated_at)}</div></button>
          <button className="icon-btn w-8 h-8 opacity-60 group-hover:opacity-100" onClick={() => delConv(c.id)} aria-label="Delete conversation"><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-[100dvh] lg:h-screen">
      <aside className="hidden xl:block w-72 shrink-0 border-r hair p-3 overflow-y-auto">{HistList}</aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="safe-t px-4 lg:px-8 pt-3 pb-2 flex items-center gap-2 border-b hair bg-bg/80 backdrop-blur-xl">
          <div className="flex-1 min-w-0"><h1 className="h2 flex items-center gap-2"><BrainI size={18} className="text-primary" /> AI Brain</h1>
            <p className="text-[12px] text-muted truncate">{AI.status && !AI.status.ai ? 'AI is not configured on the server yet' : 'Answers from your notes and memories, with sources'}</p></div>
          <button className="icon-btn xl:hidden" onClick={() => { setHist((h) => ({ ...h, open: true })); loadHist(); }} aria-label="History"><History size={20} /></button>
          <button className="icon-btn" onClick={newChat} aria-label="New conversation"><Plus size={20} /></button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 lg:px-8 py-4 space-y-5 pb-44 lg:pb-32">
            {loading && <div className="flex justify-center py-10 text-muted"><Spinner size={22} /></div>}
            {!loading && !msgs.length && (
              <div className="pt-6 lg:pt-12 anim-in">
                <div className="flex flex-col items-center text-center"><Logo size={56} /><h2 className="mt-4 text-[22px] font-bold">What's on your mind?</h2><p className="text-muted text-[14px] mt-1 max-w-sm">I answer from what you've captured, and say so when I don't know.</p></div>
                <div className="mt-6 grid sm:grid-cols-2 gap-2">{PROMPTS.map((p) => <button key={p} onClick={() => send(p)} className="card px-4 py-3 text-left text-[14px] hover:border-primary/40 flex items-center gap-2"><Sparkles size={14} className="text-violet shrink-0" />{p}</button>)}</div>
              </div>
            )}
            {msgs.map((m, i) => m.role === 'user' ? (
              <div key={i} className="flex justify-end anim-in"><div className="max-w-[85%] rounded-2xl rounded-br-md grad text-white px-4 py-2.5 text-[15px] whitespace-pre-wrap">{m.content}</div></div>
            ) : (
              <div key={i} className="anim-in">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl grad shrink-0 flex items-center justify-center text-white mt-0.5"><BrainI size={16} /></div>
                  <div className="flex-1 min-w-0">
                    {m.content ? <div className="prose-nx" onClick={(e) => onMsgClick(e, m)} dangerouslySetInnerHTML={{ __html: md(m.content, { cites: true }) }} /> : m.streaming && <div className="pt-2"><Thinking /></div>}
                    {m.error && <div className="mt-2 rounded-xl bg-bad/10 text-bad text-[14px] px-3 py-2">{m.error}</div>}
                    {!m.streaming && (m.citations?.length ?? 0) > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">{m.citations!.map((c) => (
                        <button key={c.n} onClick={() => openCite(c)} title={c.excerpt} className="pill bg-raised text-ink h-7 px-2.5 max-w-[240px]">
                          <span className="text-primary font-bold">{c.n}</span>{c.type === 'memory' ? <Sparkles size={11} className="text-violet" /> : c.type === 'message' ? <MessageSquare size={11} /> : <FileText size={11} />}<span className="truncate">{c.title}</span>{c.status === 'suggested' && <span className="text-warn">· unconfirmed</span>}
                        </button>))}</div>
                    )}
                    {!m.streaming && m.content && (
                      <div className="mt-2 flex gap-1 -ml-2">
                        <button className="btn-ghost btn-sm h-8" onClick={() => saveAsNote(i)}><FilePlus2 size={14} /> Save</button>
                        <button className="btn-ghost btn-sm h-8" onClick={() => openOverlay({ name: 'capture', preset: { type: 'task', text: m.content.split('\n').find((l) => l.trim())?.replace(/[#*>\-[\]\d]/g, '').trim().slice(0, 80) ?? '' } })}><ListPlus size={14} /> Task</button>
                        <button className="btn-ghost btn-sm h-8" onClick={() => { navigator.clipboard?.writeText(m.content); toast('Copied'); }}><Copy size={14} /></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>

        <div className="fixed lg:sticky bottom-16 lg:bottom-0 inset-x-0 lg:inset-x-auto px-3 lg:px-8 pb-3 pt-2 bg-gradient-to-t from-bg via-bg/95 to-transparent">
          <form className="mx-auto max-w-3xl card p-1.5 flex items-end gap-1" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <button type="button" className={`icon-btn ${rec === 'on' ? 'text-bad' : ''}`} onClick={toggleRec} disabled={rec === 'busy'} aria-label="Voice">{rec === 'busy' ? <Spinner /> : rec === 'on' ? <Square size={18} fill="currentColor" /> : <Mic size={20} />}</button>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} placeholder={rec === 'on' ? 'Listening… tap stop when done' : 'Ask anything about your life, work or ideas…'}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send(); } }}
              className="flex-1 bg-transparent outline-none resize-none py-2.5 text-[15px] max-h-40" style={{ fieldSizing: 'content' } as React.CSSProperties} />
            <button className="w-10 h-10 rounded-xl grad text-white flex items-center justify-center disabled:opacity-40 shrink-0" disabled={!input.trim() || busy} aria-label="Send">{busy ? <Spinner /> : <ArrowUp size={20} />}</button>
          </form>
        </div>
      </div>
      <Sheet open={hist.open} onClose={() => setHist((h) => ({ ...h, open: false }))} title="Conversations">{HistList}</Sheet>
    </div>
  );
}
