import { FolderOpen, Home as HomeIcon, LayoutGrid, Plus, UserRound } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Home from './pages/Home';

const Create = lazy(() => import('./pages/Create'));
const Projects = lazy(() => import('./pages/Projects'));
const Editor = lazy(() => import('./pages/Editor'));
const Publish = lazy(() => import('./pages/Publish'));
const Templates = lazy(() => import('./pages/Templates'));
const BrandKitPage = lazy(() => import('./pages/BrandKit'));
const Music = lazy(() => import('./pages/Music'));
const Menu = lazy(() => import('./pages/Menu'));
const Settings = lazy(() => import('./pages/Settings'));
const Upcoming = lazy(() => import('./pages/Upcoming'));
const Batch = lazy(() => import('./pages/Batch'));
const FlowPage = lazy(() => import('./pages/Flow'));

function BottomNav() {
  const nav = useNavigate();
  const item = (to: string, label: string, Icon: typeof HomeIcon) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `flex flex-col items-center gap-0.5 w-16 py-1 text-[11px] ${isActive ? 'text-white' : 'text-white/45'}`}
    >
      {({ isActive }) => (
        <>
          <span className={`grid place-items-center w-9 h-9 rounded-full transition ${isActive ? 'bg-accent shadow-glow' : ''}`}>
            <Icon size={20} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 safe-bottom px-3">
      <div className="relative mx-auto max-w-md glass !bg-ink-800/75 rounded-[26px] h-[68px] flex items-center justify-around px-1">
        {item('/', 'หน้าแรก', HomeIcon)}
        {item('/templates', 'เทมเพลต', LayoutGrid)}
        <button
          aria-label="สร้างโฆษณาใหม่"
          onClick={() => nav('/create')}
          className="-mt-9 w-[58px] h-[58px] rounded-full bg-accent shadow-glow grid place-items-center ring-4 ring-ink-900 active:scale-95 transition"
        >
          <Plus size={28} />
        </button>
        {item('/projects', 'โปรเจกต์', FolderOpen)}
        {item('/menu', 'สตูดิโอ', UserRound)}
      </div>
    </nav>
  );
}

export default function App() {
  const loc = useLocation();
  const fullscreen = loc.pathname.startsWith('/editor');
  return (
    <div className={`mx-auto max-w-3xl ${fullscreen ? '' : 'px-4 pb-32'}`}>
      <Suspense fallback={<div className="p-10 text-center text-white/40">กำลังโหลด…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<Create />} />
          <Route path="/create/:id" element={<Create />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/batch" element={<Batch />} />
          <Route path="/flow/:id" element={<FlowPage />} />
          <Route path="/editor/:id" element={<Editor />} />
          <Route path="/publish/:id" element={<Publish />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/brand" element={<BrandKitPage />} />
          <Route path="/music" element={<Music />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/affiliate" element={<Upcoming kind="affiliate" />} />
          <Route path="/analytics" element={<Upcoming kind="analytics" />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
      {!fullscreen && <BottomNav />}
    </div>
  );
}
