// Self-update from GitHub — same channel and IndexedDB slot ("sb-updater") the loader reads.
import { db, save, emit, toast } from './store';

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;
export const REPO = 'khalil203/NEXORA';
export const RAW = `https://raw.githubusercontent.com/${REPO}/main/`;
export const APK_URL = `https://github.com/${REPO}/raw/main/dist/second-brain.apk`;
export const NATIVE = () => !!(window as any).Capacitor?.isNativePlatform?.();

function updIDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open('sb-updater', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function put(v: unknown) { const d = await updIDB(); return new Promise<void>((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'app'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
export const newer = (a: string, b: string) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

export const upd: { ready?: { version: string; notes?: string }; available?: { version: string }; apk?: { apk_version: string }; checking?: boolean } = {};

export async function checkUpdate(manual = false) {
  if (!navigator.onLine) { if (manual) toast("You're offline"); return; }
  upd.checking = true; emit();
  try {
    const r = await fetch(RAW + 'version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('update server answered ' + r.status);
    const v = await r.json(); db.settings.lastCheck = Date.now(); save();
    const shell = (window as any).SB_SHELL || {};
    upd.apk = NATIVE() && v.apk_version && shell.apk && newer(v.apk_version, shell.apk) ? v : undefined;
    if (!newer(v.version, APP_VERSION) || upd.ready?.version === v.version) {
      if (manual) toast(upd.ready ? `Version ${upd.ready.version} is ready — restart to use it` : `You have the latest version (${APP_VERSION})`);
    } else if (manual || db.settings.autoUpdate !== false) {
      if (manual) toast(`Downloading version ${v.version}…`);
      const h = await (await fetch(RAW + 'app.html?t=' + Date.now(), { cache: 'no-store' })).text();
      if (!h.includes(`APP_VERSION = '${v.version}'`)) throw new Error('the download was incomplete, try again in a few minutes');
      await put({ version: v.version, html: h, at: Date.now() });
      upd.ready = v; upd.available = undefined;
      toast(`Version ${v.version} is ready`, 'Restart', () => location.reload());
    } else upd.available = v;
  } catch (e) { if (manual) toast('Update failed: ' + (e as Error).message); }
  finally { upd.checking = false; emit(); }
}
export function scheduleUpdateChecks() {
  const due = () => db.settings.autoUpdate !== false && Date.now() - (db.settings.lastCheck || 0) > 15 * 60e3;
  if (due()) setTimeout(() => checkUpdate(false), 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && due()) checkUpdate(false); });
}
