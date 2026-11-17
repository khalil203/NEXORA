import { MonitorSmartphone, Clapperboard, Repeat, Mic2, AudioLines, Palette, Orbit, Compass, ChevronRight } from 'lucide-react';
import { useStore, inboxNotes } from '../lib/store';
import { go, openOverlay } from '../lib/nav';
import { MODULES } from '../App';
import { Page, Section } from '../components/ui';

export const CLASSIC = [
  { tool: 'adStudio', label: 'AD Studio', hint: 'Turn product photos into Thai ad videos', icon: Clapperboard },
  { tool: 'convert', label: 'Converter', hint: 'Photos, PDF, video, audio, Word, Excel', icon: Repeat },
  { tool: 'jarvis', label: 'Jarvis', hint: 'Voice assistant for notes and tasks', icon: Mic2 },
  { tool: 'voice', label: 'My Voice', hint: 'Voice-overs in your own voice', icon: AudioLines },
  { tool: 'imagine', label: 'Imagine', hint: 'Create images from text', icon: Palette },
  { tool: 'openMap', label: 'Brain map', hint: '3D map of linked notes', icon: Orbit },
  { tool: 'discover', label: 'Discover', hint: 'Weather, currency, news, Wikipedia', icon: Compass },
];

export default function More() {
  useStore();
  const ready = MODULES.filter((m) => m.route && !['home', 'brain', 'tasks'].includes(m.key));
  const later = MODULES.filter((m) => m.phase);
  const inbox = inboxNotes().length;
  return (
    <Page title="More" sub="Modules, tools and what’s coming next">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 stagger">
        {ready.map((m) => (
          <button key={m.key} onClick={() => go(m.route!)} className="card card-hover tap p-4 text-left flex flex-col gap-3 min-h-[112px]">
            <div className="w-10 h-10 rounded-xl grad text-white flex items-center justify-center shadow-glow"><m.icon size={20} /></div>
            <div className="font-semibold text-[15px] flex items-center gap-2 mt-auto">{m.label}{m.key === 'inbox' && inbox > 0 && <span className="pill bg-primary text-white">{inbox}</span>}</div>
          </button>
        ))}
      </div>

      <a href="https://khalil203.github.io/NEXORA/download.html" target="_blank" rel="noreferrer" className="mt-4 card card-hover grad-border p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl grad text-white flex items-center justify-center shadow-glow"><MonitorSmartphone size={20} /></div>
        <div className="flex-1"><div className="font-semibold text-[15px]">Get NEXORA on all your devices</div><div className="text-[12px] text-muted">Android, iPhone, iPad, Windows, Mac, Linux, web</div></div>
        <ChevronRight size={18} className="text-muted" />
      </a>

      <Section title="Classic tools">
        <div className="card divide-y hair">
          {CLASSIC.map((c) => (
            <button key={c.tool} onClick={() => openOverlay({ name: 'classic', tool: c.tool })} className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-raised/50 transition tap">
              <div className="w-9 h-9 rounded-xl bg-violet/12 text-violet flex items-center justify-center shrink-0"><c.icon size={18} /></div>
              <div className="flex-1 min-w-0"><div className="font-medium text-[15px]">{c.label}</div><div className="text-[12px] text-muted truncate">{c.hint}</div></div>
              <ChevronRight size={18} className="text-muted" />
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted mt-2 px-1">These run from the previous Second Brain app, on the same notes and account. They get rebuilt inside NEXORA in later phases.</p>
      </Section>

      <Section title="On the roadmap">
        <div className="card divide-y hair">
          {later.map((m) => (
            <div key={m.key} className="px-4 py-3.5 flex items-center gap-3 text-muted">
              <m.icon size={18} /><span className="flex-1 text-[14px]">{m.label}</span><span className="pill bg-raised border hair">Phase {m.phase}</span>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}
