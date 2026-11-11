// Install support: the browser's "install app" prompt (Android Chrome, desktop
// Chrome/Edge) and device detection for the right download.
import { emit } from './store';
import { NATIVE } from './update';

export const DOWNLOAD_URL = 'https://khalil203.github.io/second-brain/download.html';
export const WEB_URL = 'https://khalil203.github.io/second-brain/';

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIP | null = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; emit(); });
addEventListener('appinstalled', () => { deferred = null; emit(); });

export const canPrompt = () => !!deferred;
export async function promptInstall() { if (!deferred) return false; await deferred.prompt(); const c = await deferred.userChoice; deferred = null; emit(); return c.outcome === 'accepted'; }

export function device(): { os: 'android' | 'ios' | 'windows' | 'mac' | 'linux' | 'other'; installed: boolean; desktopApp: boolean } {
  const ua = navigator.userAgent; const plat = (navigator as any).userAgentData?.platform || navigator.platform || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (plat === 'MacIntel' && navigator.maxTouchPoints > 1);
  const os = /Android/i.test(ua) ? 'android' : ios ? 'ios' : /Win/i.test(plat) ? 'windows' : /Mac/i.test(plat) ? 'mac' : /Linux|CrOS/i.test(plat) ? 'linux' : 'other';
  const desktopApp = /Electron/i.test(ua);
  const installed = NATIVE() || desktopApp || matchMedia('(display-mode: standalone)').matches || !!(navigator as any).standalone;
  return { os, installed, desktopApp };
}
