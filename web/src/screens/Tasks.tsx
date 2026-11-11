import { useState } from 'react';
import { Check, Plus, CalendarDays, CheckSquare } from 'lucide-react';
import { useStore, db, newNote, updateNote, today, addDays, type Note } from '../lib/store';
import { go } from '../lib/nav';
import { dueLabel } from '../lib/format';
import { Page, Seg, Empty } from '../components/ui';

type View = 'today' | 'upcoming' | 'anytime' | 'done';

export function TaskRow({ n }: { n: Note }) {
  const t = today();
  const late = !n.done && n.due && n.due < t;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button aria-label={n.done ? 'Mark not done' : 'Mark done'} onClick={() => updateNote(n.id, { done: !n.done, doneAt: n.done ? undefined : Date.now() })}
        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${n.done ? 'grad border-transparent text-white' : 'border-muted/50 hover:border-primary'}`}>
        {n.done && <Check size={14} strokeWidth={3} />}
      </button>
      <button className="flex-1 min-w-0 text-left" onClick={() => go({ name: 'note', id: n.id })}>
        <div className={`text-[15px] truncate ${n.done ? 'line-through text-muted' : ''}`}>{n.title || 'Untitled task'}</div>
        {n.due && <div className={`text-[12px] flex items-center gap-1 ${late ? 'text-bad' : 'text-muted'}`}><CalendarDays size={12} />{dueLabel(n.due, t, addDays(1), addDays(-1))}{late ? ' · overdue' : ''}</div>}
      </button>
    </div>
  );
}

export default function Tasks() {
  useStore();
  const [view, setView] = useState<View>('today');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today());
  const t = today();
  const all = db.notes.filter((n) => n.type === 'task' && n.para !== 'archive');
  const open = all.filter((n) => !n.done);
  const lists: Record<View, Note[]> = {
    today: open.filter((n) => n.due && n.due <= t).sort((a, b) => a.due.localeCompare(b.due)),
    upcoming: open.filter((n) => n.due > t).sort((a, b) => a.due.localeCompare(b.due)),
    anytime: open.filter((n) => !n.due).sort((a, b) => b.updated - a.updated),
    done: all.filter((n) => n.done).sort((a, b) => ((b.doneAt as number) || b.updated) - ((a.doneAt as number) || a.updated)).slice(0, 100),
  };
  const list = lists[view];

  function add(e: React.FormEvent) {
    e.preventDefault(); const v = title.trim(); if (!v) return;
    newNote({ type: 'task', para: 'areas', title: v, due: view === 'anytime' ? '' : due });
    setTitle('');
  }

  return (
    <Page title="Tasks" sub={`${lists.today.length} for today · ${open.length} open`}>
      <Seg value={view} onChange={setView} options={[['today', `Today ${lists.today.length || ''}`], ['upcoming', 'Upcoming'], ['anytime', 'Anytime'], ['done', 'Done']]} />
      {view !== 'done' && (
        <form onSubmit={add} className="mt-4 card p-2 flex items-center gap-2">
          <Plus size={20} className="text-primary ml-2 shrink-0" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" className="flex-1 bg-transparent outline-none h-10 min-w-0 text-[15px]" />
          {view !== 'anytime' && <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="bg-raised rounded-lg h-9 px-2 text-[13px] outline-none" aria-label="Due date" />}
          <button className="btn-primary btn-sm" disabled={!title.trim()}>Add</button>
        </form>
      )}
      <div className="mt-4">
        {list.length ? <div className="card divide-y hair">{list.map((n) => <TaskRow key={n.id} n={n} />)}</div>
          : <Empty icon={<CheckSquare size={26} />} title={view === 'done' ? 'Nothing finished yet' : 'All clear'}
              text={view === 'today' ? 'No tasks due today. Add one above, or capture a thought and NEXORA will pull out the tasks for you.' : view === 'done' ? 'Completed tasks show up here.' : 'Nothing here yet. Add a task above.'} />}
      </div>
    </Page>
  );
}
