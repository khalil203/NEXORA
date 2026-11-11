import { useEffect, useState } from 'react';
import { Fingerprint, KeyRound, LogOut } from 'lucide-react';
import { nx, save, toast } from '../lib/store';
import { Cloud, displayUser, loginEmail } from '../lib/cloud';
import { verify, unlock } from '../lib/biometric';
import { Spinner } from '../components/ui';

/** Shown over the whole app when fingerprint lock is on and the app opens or comes back. */
export default function Lock() {
  const [state, setState] = useState<'idle' | 'asking' | 'failed'>('idle');
  const [pwMode, setPwMode] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const user = displayUser(Cloud.user()?.email);
  const label = nx.bio?.label ?? 'fingerprint';

  async function ask() {
    setState('asking'); setErr('');
    const ok = await verify();
    if (ok) unlock(); else setState('failed');
  }
  // The Android prompt can open by itself; browsers need a tap first.
  useEffect(() => { if (nx.bio?.method === 'native') setTimeout(ask, 450); }, []);

  async function withPassword(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await Cloud.auth('token?grant_type=password', { email: loginEmail(Cloud.user()!.email), password: pw }); unlock(); }
    catch { setErr('Wrong password'); }
    setBusy(false);
  }
  function signOut() {
    if (!confirm('Sign out? Notes on this device stay here.')) return;
    Cloud.signOut(); nx.welcomed = false; save(); unlock(); toast('Signed out');
  }

  return (
    <div className="dark fixed inset-0 z-[95] flex flex-col items-center justify-center px-6 text-white anim-fade" style={{ background: '#000211' }}>
      <img src="icons/launch-logo.webp" alt="NEXORA" className="w-[min(52vw,220px)] rounded-[26px]" style={{ boxShadow: '0 30px 80px -24px rgba(100,139,255,.55)' }} />
      <p className="mt-6 text-[15px] text-[#A7B0C2]">Welcome back{user ? `, ${nx.name || user}` : ''}</p>

      {!pwMode ? (
        <>
          <button onClick={ask} disabled={state === 'asking' && nx.bio?.method !== 'webauthn'} aria-label={`Unlock with ${label}`}
            className="mt-8 w-24 h-24 rounded-[30px] grad shadow-glow flex items-center justify-center active:scale-95 transition">
            <Fingerprint size={52} strokeWidth={1.5} className={state === 'asking' ? 'animate-pulse' : ''} />
          </button>
          <p className="mt-4 text-[15px] font-semibold">{state === 'failed' ? 'Not recognized. Tap to try again' : state === 'asking' ? 'Touch the sensor…' : `Unlock with ${label}`}</p>
          <button className="mt-8 text-[14px] text-[#c9d4ff] flex items-center gap-2" onClick={() => setPwMode(true)}><KeyRound size={15} /> Use password instead</button>
        </>
      ) : (
        <form onSubmit={withPassword} className="mt-8 w-full max-w-xs">
          <input type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} className="input" autoComplete="current-password" />
          {err && <p className="text-[13px] text-bad mt-2">{err}</p>}
          <button className="btn-primary w-full mt-3" disabled={!pw || busy}>{busy ? <Spinner /> : 'Unlock'}</button>
          <button type="button" className="mt-4 w-full text-[14px] text-[#c9d4ff] flex items-center justify-center gap-2" onClick={() => { setPwMode(false); setErr(''); }}><Fingerprint size={15} /> Use {label}</button>
        </form>
      )}
      <button className="absolute bottom-[max(24px,env(safe-area-inset-bottom))] text-[13px] text-[#A7B0C2] flex items-center gap-1.5" onClick={signOut}><LogOut size={14} /> Sign out</button>
    </div>
  );
}
