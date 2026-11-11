import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Camera, Paperclip, X, ClipboardPaste, FileText, Image as ImageI, Music } from 'lucide-react';
import { nx, save, newNote, addFile, toast, today, db, type NoteType } from '../lib/store';
import { closeOverlay, go } from '../lib/nav';
import { Cloud, AI, Inbox } from '../lib/cloud';
import { Sheet, Spinner } from '../components/ui';
import { TYPES } from '../lib/format';

const KINDS: NoteType[] = ['note', 'task', 'idea', 'link', 'journal'];
type Att = { file: File; kind: 'image' | 'audio' | 'file' };

export default function Capture({ preset = {} }: { preset?: Record<string, any> }) {
  const [type, setType] = useState<NoteType>(preset.type ?? 'note');
  const [text, setText] = useState<string>(preset.text ?? '');
  const [due, setDue] = useState<string>(preset.due ?? (preset.type === 'task' ? today() : ''));
  const [atts, setAtts] = useState<Att[]>([]);
  const [rec, setRec] = useState<{ on: boolean; secs: number; busy: boolean }>({ on: false, secs: 0, busy: false });
  const [saving, setSaving] = useState(false);
  const mr = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const timer = useRef<ReturnType<typeof setInterval>>();
  const camRef = useRef<HTMLInputElement>(null); const fileRef = useRef<HTMLInputElement>(null); const taRef = useRef<HTMLTextAreaElement>(null);
  const source = useRef<string>(preset.mode ?? 'text');

  useEffect(() => {
    if (preset.mode === 'voice') startRec();
    else if (preset.mode === 'camera') setTimeout(() => camRef.current?.click(), 150);
    else setTimeout(() => taRef.current?.focus(), 200);
    return () => { clearInterval(timer.current); mr.current?.state === 'recording' && mr.current.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(list: FileList | null, from: string) {
    if (!list?.length) return; source.current = from;
    setAtts((a) => [...a, ...Array.from(list).map((file) => ({ file, kind: file.type.startsWith('image/') ? 'image' as const : file.type.startsWith('audio/') ? 'audio' as const : 'file' as const }))]);
  }
  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream); chunks.current = [];
      m.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      m.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); clearInterval(timer.current);
        const blob = new Blob(chunks.current, { type: m.mimeType || 'audio/webm' });
        const file = new File([blob], `voice-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`, { type: blob.type });
        setAtts((a) => [...a, { file, kind: 'audio' }]); source.current = 'voice';
        if (AI.ready()) {
          setRec({ on: false, secs: 0, busy: true });
          try { const t = await AI.transcribe(blob); if (t) setText((x) => (x ? x + '\n' : '') + t); }
          catch (e) { toast('Saved the recording. Transcription failed: ' + (e as Error).message); }
        } else toast('Recording attached. Sign in to turn speech into text.');
        setRec({ on: false, secs: 0, busy: false });
      };
      m.start(); mr.current = m; setRec({ on: true, secs: 0, busy: false });
      timer.current = setInterval(() => setRec((r) => ({ ...r, secs: r.secs + 1 })), 1000);
    } catch { toast('Microphone not available. Allow microphone access and try again.'); }
  }
  const stopRec = () => mr.current?.state === 'recording' && mr.current.stop();
  async function paste() {
    try { const t = await navigator.clipboard.readText(); if (t) { setText((x) => (x ? x + '\n' : '') + t); source.current = 'paste'; } }
    catch { toast('Paste is blocked here. Long-press the text box and choose Paste.'); }
  }

  async function saveIt() {
    const raw = text.trim();
    if (!raw && !atts.length) { toast('Type something or add a file first'); return; }
    setSaving(true);
    try {
      const files: string[] = [];
      for (const a of atts) files.push(await addFile(a.file));
      let kind = type;
      const isUrl = /^https?:\/\/\S+$/.test(raw);
      if (isUrl && kind === 'note') kind = 'link';
      const lines = raw.split('\n');
      let title = ''; let body = raw;
      if (kind === 'task' || (lines[0].length <= 80 && lines.length > 1)) { title = lines[0]; body = lines.slice(1).join('\n').trim(); }
      else if (raw.length <= 80 && !isUrl) { title = raw; body = ''; }
      if (!title && !raw && atts.length) title = atts.length === 1 ? atts[0].file.name : `${atts.length} files`;
      const n = newNote({ type: kind, para: 'inbox', title, body, due: kind === 'task' ? due : '', files, captured: source.current });
      nx.inbox[n.id] = { status: 'received', source: isUrl ? 'link' : source.current, at: Date.now() }; save();
      closeOverlay();
      const willProcess = Cloud.on() && nx.prefs.ai_processing;
      toast(willProcess ? 'Captured. NEXORA is organizing it…' : 'Captured to your Inbox', 'View', () => go({ name: 'inbox' }));
      if (Cloud.on()) Cloud.sync().then(() => Inbox.pump());
    } catch (e) { toast((e as Error).message); setSaving(false); }
  }

  const mmss = `${Math.floor(rec.secs / 60)}:${String(rec.secs % 60).padStart(2, '0')}`;
  return (
    <Sheet open onClose={closeOverlay} title="Capture">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {KINDS.map((k) => <button key={k} className={`chip ${type === k ? 'chip-on' : ''}`} onClick={() => { setType(k); if (k === 'task' && !due) setDue(today()); }}>{TYPES[k].label}</button>)}
      </div>
      <textarea ref={taRef} value={text} onChange={(e) => setText(e.target.value)} rows={6}
        placeholder={type === 'task' ? 'What needs doing?' : type === 'link' ? 'Paste a link and add a note…' : 'Write anything. NEXORA will organize it…'}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveIt(); }}
        className="mt-3 w-full rounded-2xl bg-raised p-4 text-[16px] leading-relaxed outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
      {type === 'task' && (
        <label className="mt-3 flex items-center gap-3 text-[14px]"><span className="text-muted">Due</span><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="bg-raised rounded-lg h-10 px-3 outline-none" /></label>
      )}

      {rec.on && (
        <div className="mt-3 rounded-2xl grad text-white p-4 flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-white animate-pulse" /><span className="flex-1 font-semibold">Recording {mmss}</span>
          <button className="btn btn-sm bg-white/20" onClick={stopRec}><Square size={14} fill="currentColor" /> Stop</button>
        </div>
      )}
      {rec.busy && <div className="mt-3 text-[14px] text-muted flex items-center gap-2"><Spinner /> Turning speech into text…</div>}

      {atts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {atts.map((a, i) => (
            <div key={i} className="chip bg-raised text-ink pr-1.5">
              {a.kind === 'image' ? <ImageI size={14} /> : a.kind === 'audio' ? <Music size={14} /> : <FileText size={14} />}
              <span className="max-w-[160px] truncate">{a.file.name}</span>
              <button aria-label="Remove" onClick={() => setAtts((x) => x.filter((_, j) => j !== i))}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-1">
        <button className="icon-btn" onClick={rec.on ? stopRec : startRec} aria-label="Record voice"><Mic size={20} className={rec.on ? 'text-bad' : ''} /></button>
        <button className="icon-btn" onClick={() => camRef.current?.click()} aria-label="Take photo"><Camera size={20} /></button>
        <button className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Attach file"><Paperclip size={20} /></button>
        <button className="icon-btn" onClick={paste} aria-label="Paste"><ClipboardPaste size={20} /></button>
        <div className="flex-1" />
        <button className="btn-primary px-6" onClick={saveIt} disabled={saving || rec.on || rec.busy}>{saving ? <Spinner /> : 'Save'}</button>
      </div>
      <p className="mt-3 text-[12px] text-muted">{!navigator.onLine ? 'Offline: saved on this device and organized when you reconnect.' : Cloud.on() ? (nx.prefs.ai_processing ? 'Goes to your Inbox, where AI suggests where it belongs. Your original is always kept.' : 'Goes to your Inbox. AI processing is off in Settings.') : 'Goes to your Inbox on this device. Sign in to let AI organize it.'}{db.cloud.dirty.length > 3 ? ` · ${db.cloud.dirty.length} changes waiting to sync` : ''}</p>

      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files, 'photo'); e.target.value = ''; }} />
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files, 'file'); e.target.value = ''; }} />
    </Sheet>
  );
}
