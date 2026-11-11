import { type ReactNode, useEffect } from 'react';
import markUrl from '../assets/mark.png';
import { X, ChevronLeft } from 'lucide-react';
import { toasts, dismissToast, useStore } from '../lib/store';
import { back } from '../lib/nav';

export function Logo({ size = 28 }: { size?: number }) {
  return <img src={markUrl} width={size} height={size} alt="NEXORA" className="shrink-0 select-none" style={{ borderRadius: size * 0.24 }} draggable={false} />;
}
export function Wordmark() {
  return <div className="flex items-center gap-2.5"><Logo /><span className="text-[17px] font-bold tracking-[0.18em]">NEXORA</span></div>;
}

export function Page({ title, sub, actions, children, backBtn = false, wide = false }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; backBtn?: boolean; wide?: boolean }) {
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} px-4 lg:px-8 pb-32 lg:pb-12 anim-in`}>
      {(title || backBtn) && (
        <header className="safe-t sticky top-0 z-20 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-3 mb-2 bg-bg/80 backdrop-blur-xl">
          <div className="flex items-center gap-2 min-h-[44px]">
            {backBtn && <button className="icon-btn -ml-2" onClick={back} aria-label="Back"><ChevronLeft size={22} /></button>}
            <div className="flex-1 min-w-0">
              {typeof title === 'string' ? <h1 className="h1 truncate">{title}</h1> : title}
              {sub && <p className="text-[13px] text-muted mt-0.5">{sub}</p>}
            </div>
            {actions}
          </div>
        </header>
      )}
      {children}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-2.5 px-1"><h2 className="label">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center flex flex-col items-center anim-in">
      <div className="w-14 h-14 rounded-2xl grad flex items-center justify-center text-white shadow-glow mb-4">{icon}</div>
      <h3 className="h2">{title}</h3>
      <p className="text-muted text-[14px] mt-1.5 max-w-sm leading-relaxed">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Sheet({ open, onClose, title, children, full = false }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; full?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 anim-fade" onClick={onClose} />
      <div className={`relative w-full lg:max-w-xl ${full ? 'h-[92dvh]' : 'max-h-[92dvh]'} flex flex-col bg-surface rounded-t-[28px] lg:rounded-[28px] border hair shadow-soft anim-up safe-b`}>
        <div className="flex items-center gap-2 px-5 pt-3 pb-2">
          <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-muted/30 lg:hidden" />
          <div className="flex-1 pt-2 h2">{title}</div>
          <button className="icon-btn -mr-2 mt-1" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 flex-1">{children}</div>
      </div>
    </div>
  );
}

export function Toasts() {
  useStore();
  return (
    <div className="fixed z-[70] left-0 right-0 bottom-24 lg:bottom-6 flex flex-col items-center gap-2 pointer-events-none px-4">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto glass rounded-2xl px-4 py-3 shadow-soft flex items-center gap-3 max-w-md w-full anim-in">
          <span className="text-[14px] flex-1">{t.text}</span>
          {t.action && <button className="text-primary font-semibold text-[14px]" onClick={() => { dismissToast(t.id); t.fn?.(); }}>{t.action}</button>}
        </div>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
      {options.map(([k, l]) => <button key={k} className={`chip ${value === k ? 'chip-on' : ''}`} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 py-3 cursor-pointer">
      <div className="flex-1"><div className="text-[15px] font-medium">{label}</div>{hint && <div className="text-[13px] text-muted mt-0.5 leading-snug">{hint}</div>}</div>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative mt-0.5 w-12 h-7 rounded-full transition shrink-0 ${on ? 'grad' : 'bg-raised'}`}>
        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
      </button>
    </label>
  );
}

export const Thinking = () => <span className="dot-pulse inline-flex items-center"><span /><span /><span /></span>;
export const Spinner = ({ size = 16 }: { size?: number }) => <span className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin" style={{ width: size, height: size }} />;
