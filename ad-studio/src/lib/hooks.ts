import { useCallback, useEffect, useRef, useState } from 'react';
import { getAsset, getProject, listBrandKits, saveProject } from './db';
import type { BrandKit, Project } from './types';
import { ensureFonts, loadImage, type RenderAssets } from '../engine/renderer';
import { loadClips } from './aivideo';

/** Loads a project, autosaves changes (debounced) and keeps undo/redo history. */
export function useProject(id: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'pending' | 'saved'>('idle');
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const timer = useRef<number>();
  const latest = useRef<Project | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    if (!id) return;
    getProject(id).then((p) => {
      if (!p) setMissing(true);
      else { setProject(p); latest.current = p; }
    });
  }, [id]);

  const persist = useCallback((p: Project) => {
    latest.current = p;
    setSaving('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await saveProject(structuredClone(p));
      setSaving('saved');
    }, 500);
  }, []);

  // flush on unmount / tab hide
  useEffect(() => {
    const flush = () => { if (latest.current) { window.clearTimeout(timer.current); saveProject(structuredClone(latest.current)); } };
    const vis = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); flush(); };
  }, []);

  const update = useCallback((fn: (draft: Project) => void, opts: { history?: boolean } = { history: true }) => {
    setProject((cur) => {
      if (!cur) return cur;
      const next = structuredClone(cur);
      fn(next);
      if (opts.history !== false) {
        past.current.push(cur);
        if (past.current.length > 60) past.current.shift();
        future.current = [];
      }
      persist(next);
      return next;
    });
  }, [persist]);

  const undo = useCallback(() => {
    setProject((cur) => {
      const prev = past.current.pop();
      if (!cur || !prev) return cur;
      future.current.push(cur);
      persist(prev);
      return prev;
    });
    force((n) => n + 1);
  }, [persist]);

  const redo = useCallback(() => {
    setProject((cur) => {
      const nxt = future.current.pop();
      if (!cur || !nxt) return cur;
      past.current.push(cur);
      persist(nxt);
      return nxt;
    });
    force((n) => n + 1);
  }, [persist]);

  const saveNow = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (latest.current) await saveProject(structuredClone(latest.current));
    setSaving('saved');
  }, []);

  return { project, missing, update, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, saving, saveNow };
}

/** Decoded images + brand logo for the renderer. */
export function useRenderAssets(project: Project | null) {
  const [assets, setAssets] = useState<RenderAssets>({ images: [] });
  const [ready, setReady] = useState(false);
  const key = project ? project.images.join(',') + '|' + (project.brandKitId ?? '') + '|' + (project.aiClips ?? []).join(',') : '';
  useEffect(() => {
    if (!project) return;
    let alive = true;
    (async () => {
      const images = await Promise.all(project.images.map(async (id) => {
        const a = await getAsset(id);
        return a ? loadImage(a.blob).catch(() => null) : null;
      }));
      let logo = null;
      if (project.brandKitId) {
        const kit = (await listBrandKits()).find((k) => k.id === project.brandKitId);
        if (kit?.logo) {
          const a = await getAsset(kit.logo);
          if (a) logo = await loadImage(a.blob).catch(() => null);
        }
      }
      const clips = await loadClips(project.aiClips);
      await ensureFonts(project.scenes);
      if (alive) { setAssets({ images, logo, clips }); setReady(true); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { assets, ready };
}

export function useBrandKits() {
  const [kits, setKits] = useState<BrandKit[]>([]);
  const reload = useCallback(() => listBrandKits().then(setKits), []);
  useEffect(() => { reload(); }, [reload]);
  return { kits, reload };
}
