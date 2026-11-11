import { useEffect } from 'react';
import { Home as HomeI, Brain, Plus, CheckSquare, LayoutGrid, Sparkles, Inbox as InboxI, Library, Network, CalendarCheck, FolderKanban, Briefcase, GraduationCap, Users, Calendar, Wallet, Workflow, LineChart, Settings as SettingsI, WandSparkles, type LucideIcon } from 'lucide-react';
import { useStore, nx, db, inboxNotes } from './lib/store';
import { nav, route, go, openOverlay, type Route } from './lib/nav';
import { Cloud, displayUser } from './lib/cloud';
import { upd } from './lib/update';
import { Toasts, Wordmark } from './components/ui';
import Home from './screens/Home';
import BrainScreen from './screens/Brain';
import Tasks from './screens/Tasks';
import More from './screens/More';
import InboxScreen from './screens/Inbox';
import Vault from './screens/Vault';
import NoteScreen from './screens/Note';
import Memories from './screens/Memories';
import Settings from './screens/Settings';
import Capture from './screens/Capture';
import Classic from './screens/Classic';
import Welcome from './screens/Welcome';
import Forge from './screens/Forge';

export interface Module { key: string; label: string; icon: LucideIcon; route?: Route; phase?: number }
export const MODULES: Module[] = [
  { key: 'home', label: 'Home', icon: HomeI, route: { name: 'home' } },
  { key: 'brain', label: 'AI Brain', icon: Brain, route: { name: 'brain' } },
  { key: 'memories', label: 'My Memories', icon: Sparkles, route: { name: 'memories' } },
  { key: 'inbox', label: 'Inbox', icon: InboxI, route: { name: 'inbox' } },
  { key: 'vault', label: 'Knowledge Vault', icon: Library, route: { name: 'vault' } },
  { key: 'tasks', label: 'Tasks', icon: CheckSquare, route: { name: 'tasks' } },
  { key: 'forge', label: 'Prompt Forge', icon: WandSparkles, route: { name: 'forge' } },
  { key: 'graph', label: 'Knowledge Graph', icon: Network, phase: 5 },
  { key: 'life', label: 'Life Manager', icon: CalendarCheck, phase: 3 },
  { key: 'projects', label: 'Projects', icon: FolderKanban, phase: 3 },
  { key: 'business', label: 'Business HQ', icon: Briefcase, phase: 3 },
  { key: 'learning', label: 'Learning Hub', icon: GraduationCap, phase: 3 },
  { key: 'people', label: 'People', icon: Users, phase: 3 },
  { key: 'calendar', label: 'Calendar', icon: Calendar, phase: 3 },
  { key: 'finance', label: 'Finance', icon: Wallet, phase: 3 },
  { key: 'automations', label: 'Automations', icon: Workflow, phase: 4 },
  { key: 'insights', label: 'Insights', icon: LineChart, phase: 4 },
  { key: 'settings', label: 'Settings', icon: SettingsI, route: { name: 'settings' } },
];

function applyTheme() {
  const dark = nx.theme === 'dark' || (nx.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.body.classList.toggle('dark', dark);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#101626' : '#F5F7FC');
}

export default function App() {
  useStore();
  useEffect(applyTheme);
  const r = route();
  const active = r.name === 'note' ? 'vault' : r.name === 'account' ? 'settings' : r.name;
  const inboxCount = inboxNotes().length;

  let screen;
  switch (r.name) {
    case 'home': screen = <Home />; break;
    case 'brain': screen = <BrainScreen conv={r.conv} ask={r.ask} key={r.ask ?? r.conv ?? 'brain'} />; break;
    case 'tasks': screen = <Tasks />; break;
    case 'more': screen = <More />; break;
    case 'inbox': screen = <InboxScreen />; break;
    case 'vault': screen = <Vault tag={r.tag} para={r.para} key={(r.tag ?? '') + (r.para ?? '')} />; break;
    case 'note': screen = <NoteScreen id={r.id} edit={r.edit} key={r.id} />; break;
    case 'memories': screen = <Memories focus={r.focus} />; break;
    case 'settings': case 'account': screen = <Settings />; break;
    case 'forge': screen = <Forge />; break;
  }

  return (
    <div className="min-h-full lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 border-r hair px-3 py-5 bg-surface/40">
        <div className="px-3 mb-5"><Wordmark /></div>
        <button className="btn-primary mx-1 mb-4" onClick={() => openOverlay({ name: 'capture' })}><Plus size={18} /> Capture</button>
        <nav className="flex-1 overflow-y-auto no-scrollbar space-y-0.5">
          {MODULES.map((m) => {
            const on = active === m.key; const Icon = m.icon;
            return m.route ? (
              <button key={m.key} onClick={() => go(m.route!)} className={`w-full flex items-center gap-3 px-3 h-10 rounded-xl text-[14px] transition ${on ? 'bg-primary/15 text-ink font-semibold' : 'text-muted hover:text-ink hover:bg-raised'}`}>
                <Icon size={18} className={on ? 'text-primary' : ''} /><span className="flex-1 text-left">{m.label}</span>
                {m.key === 'inbox' && inboxCount > 0 && <span className="pill bg-primary/20 text-primary">{inboxCount}</span>}
              </button>
            ) : (
              <div key={m.key} className="w-full flex items-center gap-3 px-3 h-10 rounded-xl text-[14px] text-muted/50 cursor-default" title={`Arrives in Phase ${m.phase}`}>
                <Icon size={18} /><span className="flex-1">{m.label}</span><span className="text-[10px] font-semibold uppercase tracking-wide">P{m.phase}</span>
              </div>
            );
          })}
        </nav>
        <SyncFoot />
      </aside>

      <main className="flex-1 min-w-0">
        {upd.ready && (
          <div className="mx-auto max-w-3xl px-4 lg:px-8 pt-3 safe-t">
            <div className="card px-4 py-3 flex items-center gap-3 text-[14px]"><Sparkles size={18} className="text-primary" /><span className="flex-1">NEXORA {upd.ready.version} is ready</span><button className="btn-primary btn-sm" onClick={() => location.reload()}>Restart</button></div>
          </div>
        )}
        {screen}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-x-0 border-b-0 safe-b">
        <div className="grid grid-cols-5 h-16 max-w-lg mx-auto">
          <Tab icon={HomeI} label="Home" on={active === 'home'} onClick={() => go({ name: 'home' })} />
          <Tab icon={Brain} label="Brain" on={active === 'brain'} onClick={() => go({ name: 'brain' })} />
          <div className="flex items-start justify-center">
            <button aria-label="Capture" onClick={() => openOverlay({ name: 'capture' })} className="-mt-5 w-14 h-14 rounded-2xl grad text-white shadow-glow flex items-center justify-center active:scale-95 transition ring-4 ring-bg">
              <Plus size={28} strokeWidth={2.4} />
            </button>
          </div>
          <Tab icon={CheckSquare} label="Tasks" on={active === 'tasks'} onClick={() => go({ name: 'tasks' })} />
          <Tab icon={LayoutGrid} label="More" on={!['home', 'brain', 'tasks'].includes(active)} onClick={() => go({ name: 'more' })} badge={inboxCount} />
        </div>
      </nav>

      {nav.overlay?.name === 'capture' && <Capture preset={nav.overlay.preset} />}
      {nav.overlay?.name === 'classic' && <Classic tool={nav.overlay.tool} />}
      {!Cloud.on() && !nx.welcomed && <Welcome />}
      <Toasts />
    </div>
  );
}

function Tab({ icon: Icon, label, on, onClick, badge }: { icon: LucideIcon; label: string; on: boolean; onClick: () => void; badge?: number }) {
  return (
    <button onClick={onClick} className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${on ? 'text-ink' : 'text-muted'}`}>
      <Icon size={22} className={on ? 'text-primary' : ''} strokeWidth={on ? 2.2 : 1.75} />{label}
      {!!badge && <span className="absolute top-2 left-1/2 ml-2 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[10px] leading-4">{badge > 99 ? '99+' : badge}</span>}
    </button>
  );
}

function SyncFoot() {
  const u = Cloud.user();
  const label = !u ? 'On this device only' : Cloud.state === 'busy' ? 'Syncing…' : Cloud.state === 'offline' ? 'Offline' : db.cloud.error ? 'Sync problem' : 'Synced';
  const color = !u ? 'bg-muted' : Cloud.state === 'err' || db.cloud.error ? 'bg-bad' : Cloud.state === 'busy' ? 'bg-warn' : 'bg-ok';
  return (
    <button onClick={() => go({ name: 'settings' })} className="mt-3 mx-1 flex items-center gap-3 rounded-xl p-3 hover:bg-raised text-left">
      <div className="w-9 h-9 rounded-full grad flex items-center justify-center text-white font-semibold">{(nx.name || displayUser(u?.email) || 'N')[0].toUpperCase()}</div>
      <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold truncate">{nx.name || displayUser(u?.email) || 'Guest'}</div><div className="text-[12px] text-muted flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${color}`} />{label}</div></div>
    </button>
  );
}
