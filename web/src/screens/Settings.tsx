import { useEffect, useState } from 'react';
import { RefreshCw, CloudUpload, LogOut, Download, ShieldCheck, Trash2, Activity, Smartphone, Sparkles } from 'lucide-react';
import { useStore, db, nx, save, toast, today } from '../lib/store';
import { Cloud, Profile, AI } from '../lib/cloud';
import { APP_VERSION, APK_URL, checkUpdate, upd, NATIVE } from '../lib/update';
import { ago } from '../lib/format';
import { Page, Section, Toggle, Seg, Spinner, Sheet, Logo } from '../components/ui';
import { SB_URL } from '../lib/cloud';

export default function Settings() {
  useStore();
  const u = Cloud.user();
  const [name, setName] = useState(nx.name);
  const [usage, setUsage] = useState<{ requests: number; feature: string }[] | null>(null);
  const [log, setLog] = useState<{ open: boolean; rows: any[] | null }>({ open: false, rows: null });

  useEffect(() => {
    if (!u) return;
    AI.loadStatus();
    Cloud.rest<any[]>(`ai_usage?select=feature,requests&day=eq.${new Date().toISOString().slice(0, 10)}`).then(setUsage).catch(() => setUsage([]));
  }, [u?.id]);

  const setPref = (k: keyof typeof nx.prefs, v: any) => { (nx.prefs as any)[k] = v; save(); Profile.pushPrefs(); };
  const used = (usage ?? []).reduce((s, r) => s + r.requests, 0);

  async function openLog() {
    setLog({ open: true, rows: null });
    try { setLog({ open: true, rows: await Cloud.rest<any[]>('audit_logs?select=actor,action,target_id,details,created_at&order=created_at.desc&limit=40') }); }
    catch { setLog({ open: true, rows: [] }); }
  }
  async function exportAll() {
    const out: Record<string, unknown> = { app: 'nexora', version: APP_VERSION, exported: new Date().toISOString(), notes: db.notes, files: db.files, profile: { name: nx.name }, preferences: nx.prefs };
    if (Cloud.on()) {
      try {
        out.memories = await Cloud.rest('memories?select=id,content,category,kind,status,importance,confidence,source_type,source_id,created_at,updated_at&deleted_at=is.null');
        out.conversations = await Cloud.rest('conversations?select=id,title,created_at,messages(role,content,citations,created_at)&deleted_at=is.null');
      } catch (e) { toast('Cloud part of the export failed: ' + (e as Error).message); }
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nexora-export-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    db.settings.lastExport = Date.now(); save();
  }
  async function deleteCloud() {
    const typed = prompt('This permanently deletes ALL your NEXORA data in the cloud: notes, files, memories, conversations and backups. Notes on this device are kept.\n\nType DELETE to confirm.');
    if (typed !== 'DELETE') return;
    try {
      const me = u!.id;
      await Cloud.rest('rpc/nexora_delete_my_data', { method: 'POST', body: '{}' });
      for (const prefix of [`${me}/files/`, `${me}/backups/`]) {
        const r = await fetch(`${SB_URL}/storage/v1/object/list/brain`, { method: 'POST', headers: await Cloud.headers({ 'content-type': 'application/json' }), body: JSON.stringify({ prefix, limit: 1000 }) });
        const items = r.ok ? await r.json() : [];
        if (items.length) await fetch(`${SB_URL}/storage/v1/object/brain`, { method: 'DELETE', headers: await Cloud.headers({ 'content-type': 'application/json' }), body: JSON.stringify({ prefixes: items.map((o: { name: string }) => prefix + o.name) }) });
      }
      Cloud.signOut(); db.cloud.lastPull = '1970-01-01T00:00:00Z'; nx.inbox = {}; save();
      toast('Your cloud data was deleted. You have been signed out.');
    } catch (e) { toast('Delete failed: ' + (e as Error).message); }
  }

  return (
    <Page title="Settings">
      <div className="card p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl grad text-white text-[22px] font-bold flex items-center justify-center">{(name || u?.email || 'N')[0].toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { nx.name = name.trim(); save(); Profile.push(); }} placeholder="Your name" className="w-full bg-transparent outline-none text-[18px] font-semibold" />
          <div className="text-[13px] text-muted truncate">{u ? u.email : 'Not signed in · notes are on this device only'}</div>
        </div>
      </div>

      <Section title="Account & sync">{u ? <Account /> : <SignIn />}</Section>

      <Section title="AI & autonomy">
        <div className="card px-4 divide-y hair">
          <div className="py-3 flex items-center gap-3">
            <Sparkles size={18} className="text-violet" />
            <div className="flex-1 text-[14px]">{!u ? 'Sign in to use AI' : !AI.status ? 'Checking AI…' : AI.status.ai ? <>AI is on · <span className="text-muted">{AI.status.model}</span></> : <span className="text-warn">AI key not configured on the server yet</span>}</div>
            {u && usage && <span className="text-[12px] text-muted">{used}/{AI.status?.limit ?? 300} today</span>}
          </div>
          <Toggle label="Process captures automatically" hint="Read new inbox items, summarize them, and find tasks, dates, people and things worth remembering." on={nx.prefs.ai_processing} onChange={(v) => setPref('ai_processing', v)} />
          <Toggle label="File items automatically" hint="Move organized items into the suggested area and add tags. Each move is logged and can be undone from the Inbox." on={nx.prefs.auto_organize} onChange={(v) => setPref('auto_organize', v)} />
          <Toggle label="Suggest memories" hint="Propose long-term memories from what you capture. They're only kept once you approve them." on={nx.prefs.memory_suggestions} onChange={(v) => setPref('memory_suggestions', v)} />
          <div className="py-3"><div className="text-[15px] font-medium mb-2">Tasks found by AI</div><Seg value={nx.prefs.task_creation === 'auto' ? 'suggest' : nx.prefs.task_creation} onChange={(v) => setPref('task_creation', v)} options={[['suggest', 'Suggest, I add them'], ['off', "Don't suggest"]]} /></div>
          <div className="py-3 flex gap-3 text-[13px] text-muted"><ShieldCheck size={18} className="text-ok shrink-0" /><span>NEXORA never sends messages, spends money, shares files, publishes, or deletes important information without asking you first.</span></div>
          {u && <button className="py-3 w-full flex items-center gap-3 text-[15px]" onClick={openLog}><Activity size={18} className="text-primary" /><span className="flex-1 text-left">What the AI did, and why</span></button>}
        </div>
      </Section>

      <Section title="Appearance">
        <div className="card p-4"><Seg value={nx.theme} onChange={(v) => { nx.theme = v; save(); }} options={[['dark', 'Dark'], ['light', 'Light'], ['auto', 'Auto']]} /></div>
      </Section>

      <Section title="Your data">
        <div className="card divide-y hair">
          <button className="w-full px-4 py-3 flex items-center gap-3 text-left" onClick={exportAll}><Download size={18} className="text-primary" /><div className="flex-1"><div className="text-[15px]">Export everything</div><div className="text-[12px] text-muted">{db.settings.lastExport ? `Last export ${ago(db.settings.lastExport)}` : 'Notes, memories and conversations as one JSON file'}</div></div></button>
          {u && <button className="w-full px-4 py-3 flex items-center gap-3 text-left text-bad" onClick={deleteCloud}><Trash2 size={18} /><div className="flex-1"><div className="text-[15px]">Delete all my cloud data</div><div className="text-[12px] opacity-80">Permanent. Notes on this device stay.</div></div></button>}
        </div>
        <p className="text-[12px] text-muted mt-2 px-1">Your data is private to your account (row-level security), encrypted in transit and at rest, and never used to train AI models. Restore from a file and Google Drive backup are in More → Classic tools.</p>
      </Section>

      <Section title="Updates">
        <div className="card px-4 divide-y hair">
          <div className="py-3 flex items-center gap-3"><Logo size={30} /><div className="flex-1"><div className="font-semibold text-[15px]">NEXORA {APP_VERSION}</div><div className="text-[12px] text-muted">{upd.ready ? `Version ${upd.ready.version} ready` : db.settings.lastCheck ? `Checked ${ago(db.settings.lastCheck)}` : 'Updates come from GitHub'}</div></div>
            {upd.ready ? <button className="btn-primary btn-sm" onClick={() => location.reload()}>Restart</button> : <button className="btn-soft btn-sm" onClick={() => checkUpdate(true)} disabled={upd.checking}>{upd.checking ? <Spinner /> : <RefreshCw size={14} />} Check</button>}</div>
          <Toggle label="Install updates automatically" on={db.settings.autoUpdate !== false} onChange={(v) => { db.settings.autoUpdate = v; save(); }} />
          {upd.apk && <a href={APK_URL} target="_blank" rel="noreferrer" className="py-3 flex items-center gap-3 text-[15px] text-primary"><Smartphone size={18} /> New Android app {upd.apk.apk_version} available</a>}
          {!NATIVE() && <a href={APK_URL} target="_blank" rel="noreferrer" className="py-3 flex items-center gap-3 text-[14px] text-muted"><Smartphone size={18} /> Get the Android app</a>}
        </div>
      </Section>

      <Sheet open={log.open} onClose={() => setLog({ open: false, rows: null })} title="Activity log">
        {log.rows === null ? <Spinner /> : !log.rows.length ? <p className="text-muted text-[14px]">Nothing recorded yet.</p> : (
          <ul className="space-y-2">{log.rows.map((r, i) => (
            <li key={i} className="rounded-xl bg-raised/60 px-3 py-2 text-[13px]"><div className="flex justify-between gap-2"><b className={r.actor === 'ai' ? 'text-violet' : ''}>{r.actor === 'ai' ? 'AI' : 'You'} · {r.action.replace(/[._]/g, ' ')}</b><span className="text-muted">{ago(r.created_at)}</span></div>
              <div className="text-muted mt-0.5 break-words">{Object.entries(r.details || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') || '–' : v}`).join(' · ')}</div></li>
          ))}</ul>
        )}
      </Sheet>
    </Page>
  );
}

function Account() {
  const s = Cloud.state;
  return (
    <div className="card px-4 divide-y hair">
      <div className="py-3 text-[14px] flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${s === 'err' || db.cloud.error ? 'bg-bad' : s === 'busy' ? 'bg-warn' : 'bg-ok'}`} />
        <span className="flex-1">{s === 'busy' ? 'Syncing…' : s === 'offline' ? 'Offline. Changes sync when you are back online.' : db.cloud.error ? db.cloud.error : `Synced ${db.cloud.lastSync ? ago(db.cloud.lastSync) : ''}`}{db.cloud.dirty.length ? ` · ${db.cloud.dirty.length} waiting` : ''}</span>
      </div>
      <div className="py-3 flex flex-wrap gap-2">
        <button className="btn-soft btn-sm" onClick={() => Cloud.sync(true)}><RefreshCw size={14} /> Sync now</button>
        <button className="btn-soft btn-sm" onClick={() => Cloud.autoBackup(true)}><CloudUpload size={14} /> Back up now</button>
        <div className="flex-1" />
        <button className="btn-ghost btn-sm" onClick={() => { if (confirm('Sign out? Notes stay on this device.')) Cloud.signOut(); }}><LogOut size={14} /> Sign out</button>
      </div>
      <Toggle label="Daily cloud backup" hint={db.cloud.lastBackup ? `Last backup ${ago(db.cloud.lastBackup)} · the last 14 days are kept` : 'No cloud backup yet'} on={db.settings.autoBackup !== false} onChange={(v) => { db.settings.autoBackup = v; save(); }} />
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  async function go(mode: 'in' | 'up') {
    setBusy(true); setMsg('');
    try {
      if (mode === 'in') { await Cloud.signIn(email.trim(), pw); toast('Signed in. Your notes are syncing.'); AI.loadStatus(); }
      else { const r = await Cloud.signUp(email.trim(), pw); if (r === 'confirm') setMsg('Check your email to confirm your account, then sign in here.'); else toast('Account created'); }
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  return (
    <form className="card p-4" onSubmit={(e) => { e.preventDefault(); go('in'); }}>
      <p className="text-[14px] text-muted mb-3">Sign in to sync across devices, back up daily, and switch on AI chat, memories and auto-organizing. Notes already on this device are uploaded to your private account.</p>
      <input className="input" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="input mt-2" type="password" placeholder="Password (6+ characters)" autoComplete="current-password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required />
      {msg && <p className="text-[13px] mt-2 text-warn">{msg}</p>}
      <div className="mt-3 flex gap-2"><button className="btn-primary flex-1" disabled={busy}>{busy ? <Spinner /> : 'Sign in'}</button><button type="button" className="btn-soft flex-1" disabled={busy || !email || pw.length < 6} onClick={() => go('up')}>Create account</button></div>
      <button type="button" className="mt-3 text-[13px] text-primary" onClick={async () => { if (!email) { setMsg('Type your email first'); return; } try { await Cloud.reset(email.trim()); setMsg('Password reset email sent.'); } catch (e) { setMsg((e as Error).message); } }}>Forgot password?</button>
    </form>
  );
}
