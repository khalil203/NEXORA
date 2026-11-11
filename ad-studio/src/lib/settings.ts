import type { Aspect, Duration } from './types';

export interface Settings {
  aspect: Aspect;
  duration: Duration;
  musicVolume: number;
  sfxVolume: number;
  font: string;
  exportRes: 720 | 1080;
  exportFps: 24 | 30 | 60;
  exportQuality: 'standard' | 'high';
  defaultBrandKit?: string;
  ownerName: string;
  aiOn: boolean;
  aiPass: string;
  aiUrl: string;
  aiAutoVideo: boolean;
  aiClip: boolean;
  proMode: boolean;
  aiScenes: boolean;
  useClaude: boolean;
  videoEngine: 'ltx' | 'veo' | 'flow' | 'wan' | 'basic';
  engineV?: number;
}

const KEY = 'ads.settings.v1';
export const defaultSettings: Settings = {
  aspect: '9:16',
  duration: 15,
  musicVolume: 0.3,
  sfxVolume: 0.5,
  font: 'IBM Plex Sans Thai',
  exportRes: 720,
  exportFps: 30,
  exportQuality: 'high',
  ownerName: '',
  aiOn: true,
  aiPass: '',
  aiUrl: '',
  aiAutoVideo: true,
  aiClip: true,
  proMode: true,
  aiScenes: true,
  useClaude: true,
  videoEngine: 'ltx',
  engineV: 2,
};

export function getSettings(): Settings {
  try {
    const s: Settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    // v2: owner switched to the free LTX-2.3 engine (Veo API was not available on his key)
    if ((s.engineV ?? 0) < 2) { s.videoEngine = 'ltx'; s.engineV = 2; localStorage.setItem(KEY, JSON.stringify(s)); }
    return s;
  } catch {
    return defaultSettings;
  }
}
export function setSettings(s: Partial<Settings>) {
  const next = { ...getSettings(), ...s };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export const FONTS = ['Kanit', 'Prompt', 'Noto Sans Thai', 'IBM Plex Sans Thai', 'Anuphan', 'Sarabun'];
