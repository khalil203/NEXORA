// Tiny router with a back stack wired to the Android back button / browser history.
import { emit } from './store';

export type Route =
  | { name: 'home' } | { name: 'brain'; conv?: string; ask?: string } | { name: 'tasks' } | { name: 'more' }
  | { name: 'inbox' } | { name: 'vault'; tag?: string; para?: string } | { name: 'note'; id: string; edit?: boolean }
  | { name: 'memories'; focus?: string } | { name: 'settings' } | { name: 'account' };
export type Overlay = null | { name: 'capture'; preset?: Record<string, unknown> } | { name: 'classic'; tool: string };

export const nav = { stack: [{ name: 'home' }] as Route[], overlay: null as Overlay };
export const route = () => nav.stack[nav.stack.length - 1];
const TOP = new Set(['home', 'brain', 'tasks', 'more', 'inbox', 'vault', 'memories', 'settings']);

export function go(r: Route) {
  if (TOP.has(r.name)) nav.stack = r.name === 'home' ? [r] : [{ name: 'home' }, r];
  else nav.stack.push(r);
  history.pushState({ n: nav.stack.length }, '');
  window.scrollTo({ top: 0 }); emit();
}
export function back() { if (nav.overlay) { nav.overlay = null; emit(); return; } if (nav.stack.length > 1) { nav.stack.pop(); emit(); } }
export function openOverlay(o: Overlay) { nav.overlay = o; history.pushState({ o: 1 }, ''); emit(); }
export function closeOverlay() { if (nav.overlay) { nav.overlay = null; emit(); } }

addEventListener('popstate', () => {
  if (nav.overlay) { nav.overlay = null; emit(); return; }
  if (nav.stack.length > 1) { nav.stack.pop(); emit(); return; }
});
history.replaceState({ n: 1 }, '');
