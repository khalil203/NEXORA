// Local-first store. NEXORA shares the IndexedDB database "secondbrain" with the
// previous app (key "db"), so every existing note, file and sign-in carries over
// with no migration, and the classic tools keep working on the same data.
// NEXORA-only state lives under a separate key ("nexora") because the classic app
// rewrites "db" with only the fields it knows.
import { useSyncExternalStore } from 'react';

export type NoteType = 'note' | 'task' | 'idea' | 'link' | 'person' | 'journal';
export type Para = 'inbox' | 'projects' | 'areas' | 'resources' | 'archive';
export interface Note {
  id: string; title: string; body: string; type: NoteType; para: Para;
  pinned: boolean; done: boolean; due: string; files: string[]; created: number; updated: number;
  [k: string]: unknown;
}
export interface FileMeta { name: string; type: string; size: number; created?: number; cloud?: boolean; owner?: string; path?: string; [k: string]: unknown }
export interface Session { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email: string } }
export interface DB {
  notes: Note[]; files: Record<string, FileMeta>; cache: Record<string, unknown>;
  settings: Record<string, any>;
  cloud: { session: Session | null; dirty: string[]; lastPull: string; lastSync: number; lastBackup: number; error: string; lastUser?: string; [k: string]: unknown };
  [k: string]: unknown;
}
export type InboxStatus = 'received' | 'processing' | 'organized' | 'needs_review' | 'failed';
export interface InboxResult {
  title: string; summary: string; type: NoteType; para: Para; tags: string[]; people: string[]; projects: string[];
  dates: { date: string; what: string }[]; tasks: { title: string; due: string | null }[]; decisions: string[];
  memories: { id: string; content: string; kind: string; category: string; conflicts_with: string | null }[];
  related: { id: string; title: string }[]; needs_review: boolean; review_reason: string; duplicates: string[]; model?: string;
}
export interface InboxEntry { status: InboxStatus; source: string; result?: InboxResult; error?: string; applied?: Partial<Note> & { _tags?: string }; at: number; createdTasks?: string[] }
export interface NX {
  v: 1; name: string; theme: 'dark' | 'light' | 'auto';
  inbox: Record<string, InboxEntry>;
  briefing?: { date: string; data: Briefing; at: number };
  prefs: { ai_processing: boolean; auto_organize: boolean; memory_suggestions: boolean; task_creation: 'off' | 'suggest' | 'auto' };
  lastConversation?: string; onboarded?: boolean; welcomed?: boolean;
  bio?: { enabled: boolean; method?: 'native' | 'webauthn'; label?: string; credId?: string; savedLogin?: boolean; lockAfter: number }; recentSearches: string[];
}
export interface Briefing { headline: string; focus: { text: string; ref: string | null }[]; heads_up: string[]; evidence?: { tasks: number; inbox: number; recent: number } }

export const db: DB = {
  notes: [], files: {}, cache: {},
  settings: { name: 'NEXORA', theme: 'dark', accent: 'neural', v5: 1, autoUpdate: true, lastCheck: 0, autoBackup: true },
  cloud: { session: null, dirty: [], lastPull: '1970-01-01T00:00:00Z', lastSync: 0, lastBackup: 0, error: '' },
};
export const nx: NX = {
  v: 1, name: '', theme: 'dark', inbox: {}, recentSearches: [],
  prefs: { ai_processing: true, auto_organize: false, memory_suggestions: true, task_creation: 'suggest' },
};

// ---------------- IndexedDB ----------------
let idb: IDBDatabase | null = null;
function openIDB(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      const r = indexedDB.open('secondbrain', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('files'); };
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    } catch { res(null); }
  });
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return new Promise((res, rej) => {
    if (!idb) return res(undefined);
    const t = idb.transaction(store, mode); const r = fn(t.objectStore(store));
    t.oncomplete = () => res(r ? (r.result as T) : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
async function kvGet<T>(k: string): Promise<T | undefined> {
  if (idb) return tx<T>('kv', 'readonly', (s) => s.get(k));
  const v = localStorage.getItem('sb2.' + k); return v ? JSON.parse(v) : undefined;
}
async function kvSet(k: string, v: unknown) {
  if (idb) return tx('kv', 'readwrite', (s) => s.put(v, k));
  localStorage.setItem('sb2.' + k, JSON.stringify(v));
}
export const Files = {
  put: (id: string, b: Blob) => tx('files', 'readwrite', (s) => s.put(b, id)),
  get: (id: string) => tx<Blob>('files', 'readonly', (s) => s.get(id)),
  del: (id: string) => tx('files', 'readwrite', (s) => s.delete(id)),
};

export async function load() {
  if (!idb) idb = await openIDB();
  let d: Partial<DB> | undefined;
  try { d = await kvGet<DB>('db'); } catch { /* empty */ }
  if (!d) { try { const r = localStorage.getItem('secondbrain.v1'); if (r) d = JSON.parse(r); } catch { /* empty */ } }
  if (d) {
    for (const k of Object.keys(d)) if (!['notes', 'files', 'cache', 'settings', 'cloud'].includes(k)) db[k] = d[k];
    db.notes = (d.notes ?? []).map(normalize); db.files = d.files ?? {}; db.cache = d.cache ?? {};
    Object.assign(db.settings, d.settings ?? {}); Object.assign(db.cloud, d.cloud ?? {});
  }
  try { const n = await kvGet<NX>('nexora'); if (n) Object.assign(nx, n, { prefs: { ...nx.prefs, ...(n.prefs ?? {}) } }); } catch { /* empty */ }
  if (!nx.name && db.settings.name && db.settings.name !== 'Second Brain' && db.settings.name !== 'NEXORA') nx.name = db.settings.name;
  emit();
}
function normalize(n: Partial<Note>): Note {
  return { title: '', body: '', type: 'note', para: 'inbox', pinned: false, done: false, due: '', files: [], created: Date.now(), updated: Date.now(), ...n } as Note;
}

let saveT: ReturnType<typeof setTimeout> | undefined;
export function save() { clearTimeout(saveT); saveT = setTimeout(flush, 250); emit(); }
export async function flush() {
  clearTimeout(saveT);
  try { await kvSet('db', JSON.parse(JSON.stringify(db))); await kvSet('nexora', JSON.parse(JSON.stringify(nx))); }
  catch { toast('Could not save on this device. Export a backup from Settings.'); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
addEventListener('pagehide', () => { flush(); });

// ---------------- reactivity ----------------
let version = 0; const subs = new Set<() => void>();
export function emit() { version++; subs.forEach((f) => f()); }
export function useStore() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version); }

// ---------------- notes API ----------------
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const byId = (id: string) => db.notes.find((n) => n.id === id);
export const byTitle = (t: string) => db.notes.find((n) => (n.title || '').trim().toLowerCase() === t.trim().toLowerCase());
export function markDirty(id: string) { if (!db.cloud.dirty.includes(id)) db.cloud.dirty.push(id); }
let onChange: (() => void) | null = null;
export function setChangeHook(f: () => void) { onChange = f; }
export function newNote(o: Partial<Note> = {}): Note {
  const n = normalize({ id: uid(), created: Date.now(), updated: Date.now(), ...o });
  db.notes.unshift(n); markDirty(n.id); save(); onChange?.(); return n;
}
export function changed(n: Note) { n.updated = Date.now(); markDirty(n.id); save(); onChange?.(); }
export function updateNote(id: string, patch: Partial<Note>) { const n = byId(id); if (!n) return; Object.assign(n, patch); changed(n); }
export function removeNote(id: string): Note | undefined {
  const n = byId(id); if (!n) return;
  db.notes = db.notes.filter((x) => x !== n); markDirty(id); delete nx.inbox[id]; save(); onChange?.(); return n;
}
export function restoreNote(n: Note) { db.notes.unshift(n); n.updated = Date.now(); markDirty(n.id); save(); onChange?.(); }

export async function addFile(f: File | Blob, name = (f as File).name || 'file'): Promise<string> {
  let blob: Blob = f;
  if ((f.type || '').startsWith('image/') && !/gif|svg/.test(f.type)) {
    try { blob = await resizeImage(f, 2048); name = name.replace(/\.[^.]+$/, '') + '.jpg'; } catch { /* keep original */ }
  }
  if (blob.size > 80e6) throw new Error(`${name}: too large (max 80 MB)`);
  const id = uid(); await Files.put(id, blob);
  db.files[id] = { name, type: blob.type || 'application/octet-stream', size: blob.size, created: Date.now(), cloud: false };
  save(); return id;
}
function resizeImage(f: Blob, max: number): Promise<Blob> {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(f); const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); }; img.src = u;
  });
}

// ---------------- derived ----------------
export const TAGRE = /(^|\s)#([\p{L}\p{M}\p{N}_-]+)/gu;
export const tagsOf = (n: Note) => [...new Set([...`${n.title} ${n.body}`.matchAll(TAGRE)].map((m) => m[2].toLowerCase()))];
export const live = () => db.notes.filter((n) => n.para !== 'archive');
export function allTags() { const m: Record<string, number> = {}; live().forEach((n) => tagsOf(n).forEach((t) => (m[t] = (m[t] || 0) + 1))); return Object.entries(m).sort((a, b) => b[1] - a[1]); }
export const dstr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => dstr(new Date());
export const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
export const openTasks = () => db.notes.filter((n) => n.type === 'task' && !n.done && n.para !== 'archive');
export function backlinks(n: Note) { const t = (n.title || '').trim().toLowerCase(); if (!t) return []; return db.notes.filter((x) => x.id !== n.id && (x.body || '').toLowerCase().includes(`[[${t}]]`)); }
export const inboxNotes = () => db.notes.filter((n) => n.para === 'inbox');

// ---------------- toast ----------------
export interface Toast { id: number; text: string; action?: string; fn?: () => void }
export const toasts: Toast[] = [];
export function toast(text: string, action?: string, fn?: () => void) {
  const t = { id: Date.now() + Math.random(), text, action, fn }; toasts.push(t); emit();
  setTimeout(() => { const i = toasts.indexOf(t); if (i >= 0) { toasts.splice(i, 1); emit(); } }, action ? 5000 : 2800);
}
export function dismissToast(id: number) { const i = toasts.findIndex((t) => t.id === id); if (i >= 0) { toasts.splice(i, 1); emit(); } }
