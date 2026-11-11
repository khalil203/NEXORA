import { useEffect, useRef, useState } from 'react';
import { Pin, Archive, Trash2, Eye, PenLine, Paperclip, FileText, Image as ImageI, Music, Download, Link2, Check, Inbox as InboxI, ArchiveRestore } from 'lucide-react';
import { useStore, byId, byTitle, updateNote, removeNote, restoreNote, newNote, addFile, backlinks, db, nx, Files, toast, type NoteType, type Para } from '../lib/store';
import { go, back } from '../lib/nav';
import { Cloud } from '../lib/cloud';
import { md, ago, TYPES, PARAS } from '../lib/format';
import { Page, Empty } from '../components/ui';
import { NoteRow } from './Home';

export default function NoteScreen({ id, edit }: { id: string; edit?: boolean }) {
  useStore();
  const n = byId(id);
  const [editing, setEditing] = useState<boolean>(!!edit || (!!n && !n.body && !n.title));
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) setTimeout(() => bodyRef.current?.focus(), 100); }, [editing]);

  if (!n) return <Page backBtn title="Not found"><Empty icon={<FileText size={26} />} title="This item is gone" text="It may have been deleted on another device." /></Page>;
  const links = backlinks(n);
  const ib = nx.inbox[n.id];

  function onPreviewClick(e: React.MouseEvent) {
    const el = e.target as HTMLElement;
    if (el.dataset.tag) go({ name: 'vault', tag: el.dataset.tag });
    else if (el.dataset.wl) {
      const t = decodeURIComponent(el.dataset.wl); const target = byTitle(t) ?? newNote({ title: t, para: 'resources' });
      go({ name: 'note', id: target.id });
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      const boxes = [...(e.currentTarget as HTMLElement).querySelectorAll('input[type=checkbox]')]; const idx = boxes.indexOf(el);
      let i = -1; updateNote(n!.id, { body: n!.body.replace(/^(\s*[-*+] )\[( |x|X)\]/gm, (m, a, c) => (++i === idx ? `${a}[${c === ' ' ? 'x' : ' '}]` : m)) });
    } else if (el.tagName === 'A') { e.preventDefault(); window.open((el as HTMLAnchorElement).href, '_blank'); }
  }
  function del() {
    const gone = removeNote(n!.id); back();
    if (gone) toast('Deleted', 'Undo', () => restoreNote(gone));
  }
  async function attach(list: FileList | null) {
    if (!list) return;
    try { const ids: string[] = []; for (const f of Array.from(list)) ids.push(await addFile(f)); updateNote(n!.id, { files: [...(n!.files || []), ...ids] }); }
    catch (e) { toast((e as Error).message); }
  }

  return (
    <Page backBtn wide={false}
      title={<span className="text-[13px] text-muted font-medium">{PARAS[n.para]} · {TYPES[n.type]?.label}</span>}
      actions={<div className="flex items-center">
        <button className={`icon-btn ${n.pinned ? 'text-primary' : ''}`} onClick={() => updateNote(n.id, { pinned: !n.pinned })} aria-label="Pin"><Pin size={19} /></button>
        <button className="icon-btn" onClick={() => setEditing(!editing)} aria-label={editing ? 'Preview' : 'Edit'}>{editing ? <Eye size={19} /> : <PenLine size={19} />}</button>
        {n.para === 'archive'
          ? <button className="icon-btn" onClick={() => { updateNote(n.id, { para: 'resources' }); toast('Restored to Resources'); }} aria-label="Unarchive"><ArchiveRestore size={19} /></button>
          : <button className="icon-btn" onClick={() => { const p = n.para; updateNote(n.id, { para: 'archive' }); toast('Archived', 'Undo', () => updateNote(n.id, { para: p })); }} aria-label="Archive"><Archive size={19} /></button>}
        <button className="icon-btn hover:text-bad" onClick={del} aria-label="Delete"><Trash2 size={19} /></button>
      </div>}>
      <div className="flex items-start gap-3">
        {n.type === 'task' && (
          <button onClick={() => updateNote(n.id, { done: !n.done, doneAt: n.done ? undefined : Date.now() })} aria-label="Done"
            className={`mt-2 w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 ${n.done ? 'grad border-transparent text-white' : 'border-muted/50'}`}>{n.done && <Check size={16} strokeWidth={3} />}</button>
        )}
        <textarea value={n.title} onChange={(e) => updateNote(n.id, { title: e.target.value.replace(/\n/g, ' ') })} placeholder="Title" rows={1}
          className={`flex-1 bg-transparent outline-none resize-none text-[26px] font-bold tracking-tight leading-tight ${n.done ? 'line-through text-muted' : ''}`}
          style={{ fieldSizing: 'content' } as React.CSSProperties} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={n.type} onChange={(e) => updateNote(n.id, { type: e.target.value as NoteType })} className="chip h-8 pr-2 outline-none" aria-label="Type">
          {(Object.keys(TYPES) as NoteType[]).map((k) => <option key={k} value={k}>{TYPES[k].label}</option>)}
        </select>
        <select value={n.para} onChange={(e) => updateNote(n.id, { para: e.target.value as Para })} className="chip h-8 pr-2 outline-none" aria-label="Area">
          {(Object.keys(PARAS) as Para[]).map((k) => <option key={k} value={k}>{PARAS[k]}</option>)}
        </select>
        {(n.type === 'task' || n.due) && <input type="date" value={n.due} onChange={(e) => updateNote(n.id, { due: e.target.value })} className="chip h-8 outline-none" aria-label="Due date" />}
        {n.para === 'inbox' && <button className="chip h-8 text-primary" onClick={() => go({ name: 'inbox' })}><InboxI size={13} /> {ib ? ib.status.replace('_', ' ') : 'In inbox'}</button>}
      </div>

      <div className="mt-5">
        {editing ? (
          <textarea ref={bodyRef} value={n.body} onChange={(e) => updateNote(n.id, { body: e.target.value })}
            placeholder={'Write in Markdown…\n\n# Heading  **bold**  - [ ] checklist\nLink notes with [[Title]] and tag with #tag'}
            className="w-full min-h-[50vh] bg-transparent outline-none resize-none text-[16px] leading-relaxed font-[inherit]" />
        ) : n.body ? (
          <div className="prose-nx" onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: md(n.body) }} />
        ) : (
          <button className="text-muted text-[15px]" onClick={() => setEditing(true)}>Tap to write…</button>
        )}
      </div>

      {(n.files?.length ?? 0) > 0 && (
        <div className="mt-6"><h2 className="label px-1 mb-2.5">Attachments</h2><div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{n.files.map((f) => <FileTile key={f} id={f} onRemove={() => updateNote(n.id, { files: n.files.filter((x) => x !== f) })} />)}</div></div>
      )}
      <button className="mt-4 btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><Paperclip size={15} /> Attach file</button>
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />

      {links.length > 0 && <div className="mt-6"><h2 className="label px-1 mb-2.5 flex items-center gap-1.5"><Link2 size={12} /> Linked from</h2><div className="card divide-y hair">{links.map((x) => <NoteRow key={x.id} n={x} />)}</div></div>}
      <p className="mt-8 text-[12px] text-muted px-1">Created {new Date(n.created).toLocaleString()} · edited {ago(n.updated)}{db.cloud.dirty.includes(n.id) && Cloud.on() ? ' · waiting to sync' : ''}</p>
    </Page>
  );
}

function FileTile({ id, onRemove }: { id: string; onRemove: () => void }) {
  const meta = db.files[id];
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined; let off = false;
    (async () => {
      let b = await Files.get(id).catch(() => undefined);
      if (!b && meta?.path && Cloud.on()) { b = (await Cloud.download(meta.path).catch(() => null)) ?? undefined; if (b) Files.put(id, b).catch(() => null); }
      if (b && !off) { u = URL.createObjectURL(b); setUrl(u); }
    })();
    return () => { off = true; if (u) URL.revokeObjectURL(u); };
  }, [id, meta?.path]);
  if (!meta) return null;
  const img = meta.type.startsWith('image/'); const audio = meta.type.startsWith('audio/');
  return (
    <div className="card overflow-hidden flex flex-col">
      {img && url ? <img src={url} alt={meta.name} className="h-28 w-full object-cover" /> : (
        <div className="h-28 flex items-center justify-center text-muted bg-raised/50">{img ? <ImageI size={28} /> : audio ? <Music size={28} /> : <FileText size={28} />}</div>
      )}
      {audio && url && <audio src={url} controls className="w-full h-9" />}
      <div className="p-2 flex items-center gap-1">
        <span className="text-[12px] truncate flex-1" title={meta.name}>{meta.name}</span>
        {url ? <a href={url} download={meta.name} className="icon-btn w-7 h-7" aria-label="Download"><Download size={14} /></a> : <span className="text-[11px] text-muted">{meta.cloud ? 'in cloud' : 'missing'}</span>}
        <button className="icon-btn w-7 h-7" onClick={onRemove} aria-label="Remove attachment"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}
