import { useMemo, useState } from 'react';
import { Search, Sparkles, Plus, Library, X, Pin } from 'lucide-react';
import { useStore, db, nx, save, allTags, tagsOf, byId, type Note, type NoteType, type Para } from '../lib/store';
import { go, openOverlay } from '../lib/nav';
import { Cloud, AI } from '../lib/cloud';
import { PARAS, TYPES } from '../lib/format';
import { Page, Empty, Seg, Spinner } from '../components/ui';
import { NoteRow } from './Home';

export default function Vault({ tag: tag0, para: para0 }: { tag?: string; para?: string }) {
  const v = useStore();
  const [q, setQ] = useState('');
  const [para, setPara] = useState<'all' | Para>((para0 as Para) ?? 'all');
  const [type, setType] = useState<'all' | NoteType>('all');
  const [tag, setTag] = useState<string | undefined>(tag0);
  const [sem, setSem] = useState<{ busy: boolean; ids?: string[]; mems?: { id: string; content: string }[]; err?: string }>({ busy: false });

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return db.notes.filter((n) =>
      (para === 'all' ? n.para !== 'archive' : n.para === para) && (type === 'all' || n.type === type) && (!tag || tagsOf(n).includes(tag)) &&
      (!words.length || words.every((w) => `${n.title} ${n.body}`.toLowerCase().includes(w))),
    ).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated);
  }, [q, para, type, tag, v]);
  const tags = allTags().slice(0, 24);

  async function meaning() {
    const query = q.trim(); if (!query) return;
    setSem({ busy: true });
    try {
      await Cloud.sync();
      const r = await AI.call<{ results: { source_type: string; source_id: string }[]; memories: { id: string; content: string }[] }>('search', { q: query });
      const ids = [...new Set(r.results.filter((x) => x.source_type === 'note').map((x) => x.source_id))].filter((id) => byId(id));
      setSem({ busy: false, ids, mems: r.memories });
      nx.recentSearches = [query, ...nx.recentSearches.filter((x) => x !== query)].slice(0, 8); save();
    } catch (e) { setSem({ busy: false, err: (e as Error).message }); }
  }
  const semNotes = (sem.ids ?? []).map((id) => byId(id)).filter(Boolean) as Note[];

  return (
    <Page title="Knowledge Vault" sub={`${db.notes.filter((n) => n.para !== 'archive').length} items`}
      actions={<button className="btn-primary btn-sm" onClick={() => openOverlay({ name: 'capture' })}><Plus size={16} /> New</button>}>
      <form className="relative" onSubmit={(e) => { e.preventDefault(); if (Cloud.on()) meaning(); }}>
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setSem({ busy: false }); }} placeholder="Search notes, tasks, ideas…" className="input pl-11 pr-11" />
        {q && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn w-8 h-8" onClick={() => { setQ(''); setSem({ busy: false }); }} aria-label="Clear"><X size={16} /></button>}
      </form>
      {q.trim().length > 1 && Cloud.on() && !sem.ids && (
        <button onClick={meaning} disabled={sem.busy} className="mt-2 text-[13px] text-primary font-medium flex items-center gap-1.5 px-1">{sem.busy ? <Spinner size={13} /> : <Sparkles size={14} />} Search by meaning across everything</button>
      )}
      {sem.err && <p className="mt-2 text-[13px] text-bad px-1">{sem.err}</p>}

      <div className="mt-4 space-y-2">
        <Seg value={para} onChange={setPara} options={[['all', 'All'], ['inbox', 'Inbox'], ['projects', 'Projects'], ['areas', 'Areas'], ['resources', 'Resources'], ['archive', 'Archive']]} />
        <Seg value={type} onChange={setType} options={[['all', 'Any type'], ...(Object.keys(TYPES) as NoteType[]).map((k) => [k, TYPES[k].label] as [NoteType, string])]} />
        {tags.length > 0 && <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">{tags.map(([t, c]) => <button key={t} className={`chip h-7 ${tag === t ? 'chip-on' : ''}`} onClick={() => setTag(tag === t ? undefined : t)}>#{t} <span className="opacity-60">{c}</span></button>)}</div>}
      </div>

      {sem.ids && (
        <div className="mt-5">
          <h2 className="label px-1 mb-2.5 flex items-center gap-1.5"><Sparkles size={12} /> By meaning</h2>
          {sem.mems && sem.mems.length > 0 && <div className="card p-3 mb-3 space-y-1">{sem.mems.map((m) => <button key={m.id} onClick={() => go({ name: 'memories', focus: m.id })} className="block text-left text-[14px] w-full"><span className="text-violet">Memory · </span>{m.content}</button>)}</div>}
          {semNotes.length ? <div className="card divide-y hair">{semNotes.map((n) => <NoteRow key={n.id} n={n} />)}</div> : <p className="text-[14px] text-muted px-1">Nothing similar found in the cloud index yet. New notes are indexed a few seconds after they sync.</p>}
        </div>
      )}

      <div className="mt-5">
        {sem.ids && <h2 className="label px-1 mb-2.5">Matching words</h2>}
        {list.length ? <div className="card divide-y hair">{list.slice(0, 300).map((n) => <NoteRow key={n.id} n={n} right={n.pinned ? <Pin size={14} className="text-muted" /> : <span className="text-[11px] text-muted">{PARAS[n.para]}</span>} />)}</div>
          : <Empty icon={<Library size={26} />} title={q || tag ? 'No matches' : 'Your vault is empty'}
              text={q || tag ? 'Try other words, clear the filters, or search by meaning.' : 'Notes, ideas, links and documents live here, organized into Projects, Areas, Resources and Archive. You never need to make folders first.'}
              action={!q && !tag && <button className="btn-primary" onClick={() => openOverlay({ name: 'capture' })}><Plus size={18} /> Add something</button>} />}
      </div>
    </Page>
  );
}
