import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Activity, Asset, BrandKit, Project } from './types';

interface StudioDB extends DBSchema {
  projects: { key: string; value: Project; indexes: { updatedAt: number } };
  assets: { key: string; value: Asset };
  brandKits: { key: string; value: BrandKit };
  activity: { key: string; value: Activity; indexes: { at: number } };
}

let dbp: Promise<IDBPDatabase<StudioDB>> | null = null;
export function db() {
  if (!dbp) {
    dbp = openDB<StudioDB>('ai-ad-studio', 1, {
      upgrade(d) {
        const p = d.createObjectStore('projects', { keyPath: 'id' });
        p.createIndex('updatedAt', 'updatedAt');
        d.createObjectStore('assets', { keyPath: 'id' });
        d.createObjectStore('brandKits', { keyPath: 'id' });
        const a = d.createObjectStore('activity', { keyPath: 'id' });
        a.createIndex('at', 'at');
      },
    });
  }
  return dbp;
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

// ---------- projects ----------
export async function listProjects(): Promise<Project[]> {
  const all = await (await db()).getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getProject(id: string) {
  return (await db()).get('projects', id);
}
export async function saveProject(p: Project) {
  p.updatedAt = Date.now();
  await (await db()).put('projects', p);
  return p;
}
export async function deleteProject(id: string) {
  const d = await db();
  const p = await d.get('projects', id);
  await d.delete('projects', id);
  // remove assets no other project uses
  if (p) {
    const others = (await d.getAll('projects')).flatMap((o) => [...o.images, o.audio.music?.startsWith('asset:') ? o.audio.music.slice(6) : '']);
    const mine = [...p.images, p.audio.music?.startsWith('asset:') ? p.audio.music.slice(6) : ''];
    for (const a of mine) if (a && !others.includes(a)) await d.delete('assets', a);
  }
}

// ---------- assets ----------
export async function putAsset(blob: Blob, name: string, kind: Asset['kind'], license?: string) {
  const a: Asset = { id: uid(), blob, name, type: blob.type, kind, createdAt: Date.now(), license };
  await (await db()).put('assets', a);
  return a;
}
export async function getAsset(id: string) {
  return (await db()).get('assets', id);
}
export async function listAssets(kind?: Asset['kind']) {
  const all = await (await db()).getAll('assets');
  return kind ? all.filter((a) => a.kind === kind) : all;
}
export async function deleteAsset(id: string) {
  await (await db()).delete('assets', id);
}

const urlCache = new Map<string, string>();
export async function assetUrl(id: string) {
  if (urlCache.has(id)) return urlCache.get(id)!;
  const a = await getAsset(id);
  if (!a) return null;
  const u = URL.createObjectURL(a.blob);
  urlCache.set(id, u);
  return u;
}

// ---------- brand kits ----------
export async function listBrandKits() {
  return (await db()).getAll('brandKits');
}
export async function saveBrandKit(b: BrandKit) {
  await (await db()).put('brandKits', b);
}
export async function deleteBrandKit(id: string) {
  await (await db()).delete('brandKits', id);
}

// ---------- activity ----------
export async function logActivity(text: string, projectId?: string) {
  await (await db()).put('activity', { id: uid(), at: Date.now(), text, projectId });
}
export async function recentActivity(n = 8) {
  const all = await (await db()).getAllFromIndex('activity', 'at');
  return all.reverse().slice(0, n);
}

// ---------- backup / restore ----------
async function blobToDataUrl(b: Blob) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}
export async function exportBackup(): Promise<Blob> {
  const d = await db();
  const assets = await Promise.all(
    (await d.getAll('assets')).map(async (a) => ({ ...a, blob: undefined, data: await blobToDataUrl(a.blob) })),
  );
  const payload = {
    app: 'ai-ad-studio',
    version: 1,
    at: Date.now(),
    projects: await d.getAll('projects'),
    brandKits: await d.getAll('brandKits'),
    assets,
  };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}
export async function importBackup(file: File) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'ai-ad-studio') throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ AI AD STUDIO');
  const d = await db();
  for (const a of data.assets ?? []) {
    const blob = await (await fetch(a.data)).blob();
    const { data: _ignored, ...rest } = a;
    void _ignored;
    await d.put('assets', { ...rest, blob });
  }
  for (const p of data.projects ?? []) await d.put('projects', p);
  for (const b of data.brandKits ?? []) await d.put('brandKits', b);
  return { projects: data.projects?.length ?? 0 };
}
export async function clearAll() {
  const d = await db();
  await Promise.all([d.clear('projects'), d.clear('assets'), d.clear('brandKits'), d.clear('activity')]);
}

export async function storageInfo() {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { used: e.usage ?? 0, quota: e.quota ?? 0 };
}
