import { ChevronLeft, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

export function PageHeader({ title, back, right, sub }: { title: string; back?: boolean | string; right?: ReactNode; sub?: string }) {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-30 -mx-4 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 bg-ink-900/80 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {back && (
          <button aria-label="ย้อนกลับ" className="icon-btn shrink-0" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}>
            <ChevronLeft size={22} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold thai-display truncate">{title}</h1>
          {sub && <p className="text-[13px] text-white/50 truncate">{sub}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="block" role="group" aria-label={label}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-white/40 mt-1">{hint}</span>}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex p-1 rounded-full bg-ink-700/80 border border-white/10">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`flex-1 h-10 rounded-full text-[14px] font-medium transition ${value === o.value ? 'bg-accent shadow-glow text-white' : 'text-white/60'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  // portal: ancestors with transform (page animations) would otherwise trap position:fixed and push the sheet off-screen
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[88vh] overflow-y-auto no-scrollbar rounded-t-[28px] sm:rounded-[28px] bg-ink-800 border border-white/10 p-5 safe-bottom animate-in">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/15 sm:hidden" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">{title}</h2>
          <button className="icon-btn !w-9 !h-9" onClick={onClose} aria-label="ปิด"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ open, title, message, confirmText = 'ยืนยัน', danger, onConfirm, onClose }: {
  open: boolean; title: string; message: string; confirmText?: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="text-white/70 mb-5">{message}</p>
      <div className="flex gap-3">
        <button className="btn-glass flex-1" onClick={onClose}>ยกเลิก</button>
        <button className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1`} onClick={() => { onConfirm(); onClose(); }}>{confirmText}</button>
      </div>
    </Sheet>
  );
}

// ---------- toast ----------
type Toast = { id: number; text: string; kind: 'ok' | 'err' | 'info' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, kind }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), kind === 'err' ? 5000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed top-[max(env(safe-area-inset-top),12px)] inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {list.map((t) => (
          <div key={t.id} className={`animate-in pointer-events-auto max-w-md w-full rounded-2xl px-4 py-3 text-[14px] shadow-card border ${t.kind === 'err' ? 'bg-red-950/95 border-red-400/30 text-red-100' : t.kind === 'info' ? 'bg-ink-700/95 border-white/10' : 'bg-ink-700/95 border-violet-glow/40'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

export function useObjectUrl(blob?: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-accent/20 grid place-items-center text-violet-glow">{icon}</div>
      <h3 className="font-semibold thai-display">{title}</h3>
      <p className="text-white/55 text-[14px]">{text}</p>
      {action}
    </div>
  );
}

export const fmtBytes = (n: number) =>
  n > 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n > 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export const fmtDate = (t: number) =>
  new Date(t).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
