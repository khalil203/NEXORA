// Supabase client (auth, REST, storage, edge functions) + offline-first sync.
// The session is kept in db.cloud.session, the same place the classic app keeps it,
// so signing in once works for both.
import { db, nx, save, emit, byId, Files, toast, today, setChangeHook, type Note, type Session } from './store';

export const SB_URL = 'https://kshhznqxudcaipizpxvv.supabase.co';
export const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzaGh6bnF4dWRjYWlwaXpweHZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNzYwODYsImV4cCI6MjEwODc1MjA4Nn0._6bQRQh3jDap48iw_tfNnfGAkOPlWYeU4wHm_4BFmzU'; // public anon key (RLS protects data)
export const FN = `${SB_URL}/functions/v1/nexora-ai`;

async function getJSON(url: string, opt: RequestInit = {}, ms = 15000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { ...opt, signal: c.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error_description || j.msg || j.message || j.error || `Error ${r.status}`), { code: j.code, status: r.status });
    return j;
  } catch (e) {
    throw (e as Error).name === 'AbortError' ? new Error('Connection timed out') : e;
  } finally { clearTimeout(t); }
}

type SyncState = 'idle' | 'busy' | 'ok' | 'err' | 'offline';
export const Cloud = {
  busy: false, state: 'idle' as SyncState, t: undefined as ReturnType<typeof setTimeout> | undefined,
  on() { return !!db.cloud.session?.access_token; },
  user() { return db.cloud.session?.user ?? null; },
  async auth(path: string, body: unknown) {
    return getJSON(`${SB_URL}/auth/v1/${path}`, { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  },
  setSession(j: any) {
    db.cloud.session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user.id, email: j.user.email } } as Session;
    save();
  },
  async signUp(email: string, pw: string) {
    const j = await this.auth('signup', { email, password: pw });
    if (j.access_token) { this.setSession(j); await this.afterSignIn(); return 'in'; }
    return 'confirm';
  },
  async signIn(email: string, pw: string) {
    const prev = db.cloud.lastUser;
    this.setSession(await this.auth('token?grant_type=password', { email, password: pw }));
    await this.afterSignIn(prev);
  },
  async afterSignIn(prev?: string) {
    const me = this.user()!.id;
    if (prev && prev !== me) db.cloud.lastPull = '1970-01-01T00:00:00Z';
    db.cloud.lastUser = me;
    db.notes.forEach((n) => { if (!db.cloud.dirty.includes(n.id)) db.cloud.dirty.push(n.id); });
    Object.values(db.files).forEach((f) => { if (f.owner !== me) f.cloud = false; });
    save(); await this.sync(true); await Profile.pull();
  },
  async reset(email: string) { await this.auth('recover', { email }); },
  signOut() { db.cloud.session = null; db.cloud.error = ''; this.state = 'idle'; save(); },
  async token() {
    const s = db.cloud.session; if (!s) throw new Error('Not signed in');
    if (s.expires_at * 1000 - Date.now() < 90e3) {
      try { this.setSession(await this.auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token })); }
      catch (e) { if (/invalid|expired|not found/i.test((e as Error).message)) { this.signOut(); throw new Error('Session expired — please sign in again'); } throw e; }
    }
    return db.cloud.session!.access_token;
  },
  async headers(extra: Record<string, string> = {}) { return { apikey: SB_KEY, Authorization: 'Bearer ' + (await this.token()), ...extra }; },
  async rest<T = any>(path: string, opt: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}): Promise<T> {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opt, headers: await this.headers({ 'content-type': 'application/json', ...(opt.headers || {}) }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || `Server error ${r.status}`); }
    if (r.status === 204) return null as T;
    const t = await r.text(); return (t ? JSON.parse(t) : null) as T;
  },
  async upload(path: string, blob: Blob) {
    const r = await fetch(`${SB_URL}/storage/v1/object/brain/${path}`, { method: 'POST', headers: await this.headers({ 'content-type': blob.type || 'application/octet-stream', 'x-upsert': 'true' }), body: blob });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || j.error || `Upload error ${r.status}`); }
  },
  async download(path: string): Promise<Blob | null> {
    const r = await fetch(`${SB_URL}/storage/v1/object/authenticated/brain/${path}`, { headers: await this.headers() });
    return r.ok ? r.blob() : null;
  },
  soon(ms = 2500) { if (!this.on()) return; clearTimeout(this.t); this.t = setTimeout(() => this.sync(), ms); },
  async sync(force = false): Promise<boolean> {
    if (!this.on() || this.busy) return false;
    if (!navigator.onLine) { this.state = 'offline'; emit(); return false; }
    this.busy = true; this.state = 'busy'; emit();
    try {
      const me = this.user()!.id; let pulled = 0;
      for (let page = 0; page < 20; page++) {
        const rows = await this.rest<any[]>(`notes?select=id,data,updated,deleted,synced_at&synced_at=gt.${encodeURIComponent(db.cloud.lastPull)}&order=synced_at.asc&limit=500`);
        if (!rows?.length) break;
        for (const r of rows) {
          const local = byId(r.id); const pending = db.cloud.dirty.includes(r.id);
          db.cloud.lastPull = r.synced_at;
          if (pending && (!local || (local.updated || 0) >= r.updated)) continue;
          if (r.deleted) {
            if (local && (local.updated || 0) <= r.updated) { db.notes = db.notes.filter((x) => x !== local); db.cloud.dirty = db.cloud.dirty.filter((x) => x !== r.id); pulled++; }
          } else if (!local || r.updated > (local.updated || 0)) {
            const n = { files: [], ...r.data, id: r.id } as Note;
            if (local) Object.assign(local, n); else db.notes.push(n);
            db.cloud.dirty = db.cloud.dirty.filter((x) => x !== r.id); pulled++;
          }
        }
        if (rows.length < 500) break;
      }
      const frows = (await this.rest<any[]>('files?select=id,name,type,size,path&order=created.asc&limit=5000')) || [];
      for (const f of frows) {
        if (!db.files[f.id]) db.files[f.id] = { name: f.name, type: f.type, size: f.size, path: f.path, cloud: true, owner: me, created: Date.now() };
        else Object.assign(db.files[f.id], { path: f.path, cloud: true, owner: me });
      }
      for (const [id, f] of Object.entries(db.files)) {
        if (f.cloud && f.owner === me) continue;
        if (!db.notes.some((n) => (n.files || []).includes(id))) continue;
        const b = await Files.get(id).catch(() => undefined); if (!b || b.size > 50e6) continue;
        const path = `${me}/files/${id}`;
        await this.upload(path, b);
        await this.rest('files?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ id, name: f.name, type: f.type, size: f.size, path }]) });
        Object.assign(f, { path, cloud: true, owner: me });
      }
      const ids = db.cloud.dirty.slice();
      for (let i = 0; i < ids.length; i += 200) {
        const rows = ids.slice(i, i + 200).map((id) => { const n = byId(id); return n ? { id, data: n, updated: n.updated || Date.now(), deleted: false } : { id, data: {}, updated: Date.now(), deleted: true }; });
        await this.rest('notes?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
      }
      db.cloud.dirty = db.cloud.dirty.filter((id) => !ids.includes(id));
      db.cloud.lastSync = Date.now(); db.cloud.error = ''; this.state = 'ok';
      save();
      if (ids.length || pulled) AI.indexSoon();
      this.autoBackup();
      Inbox.pump();
      return true;
    } catch (e) {
      db.cloud.error = (e as Error).message; this.state = 'err'; save();
      if (force) toast('Sync problem: ' + (e as Error).message);
      return false;
    } finally { this.busy = false; emit(); }
  },
  async autoBackup(force = false) {
    if (!this.on() || (!force && (!db.settings.autoBackup || Date.now() - (db.cloud.lastBackup || 0) < 23 * 3600e3))) return;
    try {
      const me = this.user()!.id;
      await this.upload(`${me}/backups/backup-${today()}.json`, new Blob([JSON.stringify(backupData())], { type: 'application/json' }));
      db.cloud.lastBackup = Date.now(); save();
      const list = await getJSON(`${SB_URL}/storage/v1/object/list/brain`, { method: 'POST', headers: await this.headers({ 'content-type': 'application/json' }), body: JSON.stringify({ prefix: `${me}/backups/`, limit: 100, sortBy: { column: 'name', order: 'desc' } }) });
      const old = (list || []).map((o: { name: string }) => `${me}/backups/${o.name}`).slice(14);
      if (old.length) await fetch(`${SB_URL}/storage/v1/object/brain`, { method: 'DELETE', headers: await this.headers({ 'content-type': 'application/json' }), body: JSON.stringify({ prefixes: old }) });
      if (force) toast('Backup saved to your cloud');
    } catch (e) { if (force) toast('Cloud backup failed: ' + (e as Error).message); }
  },
};
export function backupData() { return { app: 'nexora', version: 6, exported: Date.now(), notes: db.notes, settings: db.settings, filesMeta: db.files, nexora: { name: nx.name, prefs: nx.prefs } }; }

setChangeHook(() => Cloud.soon());
addEventListener('online', () => Cloud.sync());
addEventListener('offline', () => { Cloud.state = 'offline'; emit(); });
setInterval(() => { if (!document.hidden) Cloud.sync(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) Cloud.sync(); });

// ---------------- profile & preferences ----------------
export const Profile = {
  async pull() {
    if (!Cloud.on()) return;
    try {
      const [p] = (await Cloud.rest<any[]>('profiles?select=display_name,timezone')) || [];
      if (p?.display_name && !nx.name) nx.name = p.display_name;
      if (!p) await this.push();
      const [pr] = (await Cloud.rest<any[]>('user_preferences?select=*')) || [];
      if (pr) nx.prefs = { ai_processing: pr.ai_processing, auto_organize: pr.auto_organize, memory_suggestions: pr.memory_suggestions, task_creation: pr.task_creation };
      else await this.pushPrefs();
      save();
    } catch { /* offline is fine */ }
  },
  async push() {
    if (!Cloud.on()) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await Cloud.rest('profiles?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: Cloud.user()!.id, display_name: nx.name || null, timezone }) }).catch(() => null);
  },
  async pushPrefs() {
    if (!Cloud.on()) return;
    await Cloud.rest('user_preferences?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: Cloud.user()!.id, ...nx.prefs }) }).catch((e) => toast('Could not save settings: ' + e.message));
  },
};

// ---------------- AI client ----------------
export class AIError extends Error { constructor(msg: string, public code = 'error') { super(msg); } }
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const AI = {
  status: null as null | { ai: boolean; model: string | null; limit: number },
  ready() { return Cloud.on() && navigator.onLine; },
  async call<T = any>(action: string, body: Record<string, unknown> = {}, ms = 60000): Promise<T> {
    if (!Cloud.on()) throw new AIError('Sign in to use NEXORA AI', 'auth');
    if (!navigator.onLine) throw new AIError("You're offline. AI works when you're back online.", 'offline');
    try { return await getJSON(FN, { method: 'POST', headers: await Cloud.headers({ 'content-type': 'application/json' }), body: JSON.stringify({ action, timezone: tz(), ...body }) }, ms); }
    catch (e) { throw new AIError((e as Error).message, (e as any).code || 'error'); }
  },
  async loadStatus() { try { this.status = await this.call('status', {}, 20000); emit(); } catch { /* ignore */ } return this.status; },
  it: undefined as ReturnType<typeof setTimeout> | undefined,
  indexSoon() { clearTimeout(this.it); this.it = setTimeout(() => this.call('index').catch(() => null), 3000); },
  async *chat(message: string, conversation_id?: string): AsyncGenerator<any> {
    if (!Cloud.on()) throw new AIError('Sign in to use NEXORA AI', 'auth');
    if (!navigator.onLine) throw new AIError("You're offline. AI works when you're back online.", 'offline');
    const r = await fetch(FN, { method: 'POST', headers: await Cloud.headers({ 'content-type': 'application/json' }), body: JSON.stringify({ action: 'chat', message, conversation_id, timezone: tz() }) });
    if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new AIError(j.error || `AI error ${r.status}`, j.code); }
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
      for (const p of parts) { if (p.startsWith('data: ')) { try { yield JSON.parse(p.slice(6)); } catch { /* skip */ } } }
    }
  },
  async transcribe(blob: Blob): Promise<string> {
    const fd = new FormData(); fd.append('file', blob, 'voice.' + (blob.type.includes('mp4') ? 'm4a' : 'webm'));
    const r = await fetch(FN, { method: 'POST', headers: await Cloud.headers(), body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new AIError(j.error || 'Transcription failed', j.code);
    return j.text as string;
  },
};

// ---------------- capture pipeline (Received → Processing → Organized / Needs review / Failed) ----------------
export const Inbox = {
  running: false,
  async pump() {
    if (this.running || !AI.ready() || !nx.prefs.ai_processing) return;
    const queue = Object.entries(nx.inbox).filter(([id, e]) => e.status === 'received' && byId(id) && !db.cloud.dirty.includes(id)).map(([id]) => id);
    if (!queue.length) return;
    this.running = true;
    try { for (const id of queue.slice(0, 5)) await this.process(id, true); }
    finally { this.running = false; }
  },
  async process(id: string, quiet = false) {
    const e = nx.inbox[id] ?? (nx.inbox[id] = { status: 'received', source: 'text', at: Date.now() });
    if (db.cloud.dirty.includes(id)) await Cloud.sync();
    e.status = 'processing'; e.error = undefined; emit();
    try {
      const r = await AI.call<{ status: 'organized' | 'needs_review'; result: any }>('process', { note_id: id, source: e.source }, 90000);
      e.status = r.status; e.result = r.result; e.at = Date.now();
      if (nx.prefs.auto_organize && r.status === 'organized') applySuggestion(id, false);
      save();
    } catch (err) {
      const ae = err as AIError;
      e.status = ae.code === 'not_synced' || ae.code === 'offline' ? 'received' : 'failed';
      e.error = ae.message; save();
      if (!quiet) toast(ae.message);
    }
  },
};

/** Apply the AI's filing suggestion to a note (Level 2 managed action — logged and undoable). */
export function applySuggestion(id: string, byUser = true) {
  const n = byId(id); const e = nx.inbox[id]; if (!n || !e?.result) return;
  const r = e.result;
  const before: Partial<Note> & { _tags?: string } = { title: n.title, type: n.type, para: n.para, body: n.body };
  if (!n.title?.trim() && r.title) n.title = r.title;
  n.type = r.type; n.para = r.para === 'inbox' ? 'resources' : r.para;
  const have = new Set([...`${n.title} ${n.body}`.matchAll(/(^|\s)#([\p{L}\p{M}\p{N}_-]+)/gu)].map((m) => m[2].toLowerCase()));
  const add = r.tags.filter((t) => !have.has(t));
  if (add.length) n.body = `${n.body || ''}${n.body ? '\n\n' : ''}${add.map((t) => '#' + t).join(' ')}`;
  e.applied = before; e.status = 'organized';
  n.updated = Date.now(); if (!db.cloud.dirty.includes(id)) db.cloud.dirty.push(id); save(); Cloud.soon();
  logAudit(byUser ? 'user' : 'ai', 'inbox.filed', id, { para: n.para, type: n.type, tags: add });
}
export function undoSuggestion(id: string) {
  const n = byId(id); const e = nx.inbox[id]; if (!n || !e?.applied) return;
  Object.assign(n, e.applied); e.applied = undefined; e.status = 'needs_review';
  n.updated = Date.now(); if (!db.cloud.dirty.includes(id)) db.cloud.dirty.push(id); save(); Cloud.soon();
  logAudit('user', 'inbox.undo', id, {});
}
export function logAudit(actor: 'user' | 'ai', action: string, target_id: string | null, details: Record<string, unknown>) {
  if (!Cloud.on()) return;
  Cloud.rest('audit_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor, action, target_type: 'note', target_id, details }) }).catch(() => null);
}
