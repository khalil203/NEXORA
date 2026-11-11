import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Note, NoteType, Para } from './store';

marked.setOptions({ gfm: true, breaks: true });

/** Markdown → safe HTML, with #tags, [[wiki links]] and optional [n] citation chips. */
export function md(src: string, opts: { cites?: boolean } = {}): string {
  let s = src || '';
  s = s.replace(/\[\[([^\]\n]{1,120})\]\]/g, (_, t) => `<span class="wl" data-wl="${encodeURIComponent(t)}">${escapeHtml(t)}</span>`);
  let html = marked.parse(s, { async: false }) as string;
  html = html.replace(/(^|[\s>(])#([\p{L}\p{M}\p{N}_-]+)/gu, (_m, a, t) => `${a}<span class="tag" data-tag="${t.toLowerCase()}">#${t}</span>`);
  if (opts.cites) html = html.replace(/\[(\d{1,2})\]/g, (_, n) => `<span class="cite" data-cite="${n}">${n}</span>`);
  html = html.replace(/<input [^>]*type="checkbox"[^>]*>/g, (m) => m.replace(' disabled=""', ''));
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-wl', 'data-tag', 'data-cite', 'target'] });
}
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function ago(t: number | string): string {
  const ms = typeof t === 'string' ? Date.parse(t) : t; const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`; return new Date(ms).toLocaleDateString();
}
export function dueLabel(d: string, today: string, tomorrow: string, yesterday: string) {
  if (!d) return ''; if (d === today) return 'Today'; if (d === tomorrow) return 'Tomorrow'; if (d === yesterday) return 'Yesterday';
  return new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
export const TYPES: Record<NoteType, { label: string; color: string }> = {
  note: { label: 'Note', color: '#8FA3C4' }, task: { label: 'Task', color: '#648BFF' }, idea: { label: 'Idea', color: '#F5B942' },
  link: { label: 'Link', color: '#5EC8F0' }, person: { label: 'Person', color: '#C084FC' }, journal: { label: 'Journal', color: '#F472B6' },
};
export const PARAS: Record<Para, string> = { inbox: 'Inbox', projects: 'Projects', areas: 'Areas', resources: 'Resources', archive: 'Archive' };
export const snippet = (n: Note, len = 120) => (n.body || '').replace(/[#*_>`[\]-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, len);
export const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
