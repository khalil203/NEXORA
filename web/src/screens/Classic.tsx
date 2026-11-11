// Runs the previous Second Brain app (classic.html) full-screen on the same origin,
// so it shares the IndexedDB notes and sign-in. NEXORA saves before opening and
// reloads its data when the classic tool closes.
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { flush, load } from '../lib/store';
import { closeOverlay } from '../lib/nav';
import { RAW } from '../lib/update';
import { Spinner } from '../components/ui';
import { CLASSIC } from './More';

async function classicHtml(): Promise<string> {
  const ok = (h: string) => h.includes("APP_VERSION = '5.") && h.includes('Second Brain');
  try { const r = await fetch('classic.html', { cache: 'no-cache' }); if (r.ok) { const h = await r.text(); if (ok(h)) return h; } } catch { /* try GitHub */ }
  const cached = localStorage.getItem('nx.classic');
  try { const r = await fetch(RAW + 'classic.html?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) { const h = await r.text(); if (ok(h)) { try { localStorage.setItem('nx.classic', h); } catch { /* quota */ } return h; } } } catch { /* offline */ }
  if (cached) return cached;
  throw new Error('Classic tools need an internet connection the first time.');
}

export default function Classic({ tool }: { tool: string }) {
  const [html, setHtml] = useState<string>();
  const [err, setErr] = useState('');
  const label = CLASSIC.find((c) => c.tool === tool)?.label ?? 'Classic';
  useEffect(() => { flush().then(classicHtml).then(setHtml).catch((e) => setErr(e.message)); }, []);
  async function close() { await new Promise((r) => setTimeout(r, 400)); await load(); closeOverlay(); }
  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col">
      <div className="safe-t flex items-center gap-2 px-3 py-2 border-b hair glass">
        <span className="flex-1 font-semibold text-[15px] pl-1">{label} <span className="text-muted font-normal text-[12px]">· classic</span></span>
        <button className="btn-soft btn-sm" onClick={close}><X size={16} /> Close</button>
      </div>
      {err ? <p className="p-6 text-muted">{err}</p> : !html ? <div className="flex-1 flex items-center justify-center text-muted"><Spinner size={22} /></div> : (
        <iframe title={label} name={'tool:' + tool} srcDoc={html} className="flex-1 w-full border-0" allow="microphone; camera; clipboard-read; clipboard-write; autoplay" />
      )}
    </div>
  );
}
