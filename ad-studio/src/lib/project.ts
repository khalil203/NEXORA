import { getSettings } from './settings';
import { uid } from './db';
import type { BrandKit, Project, StyleId } from './types';
import { MOOD_FOR_STYLE } from './marketing';

export function newProject(style: StyleId = 'viral', brand?: BrandKit | null): Project {
  const s = getSettings();
  const now = Date.now();
  return {
    id: uid(),
    name: 'โฆษณาใหม่',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    aspect: s.aspect,
    duration: s.duration,
    style: brand?.style ?? style,
    brandKitId: brand?.id,
    images: [],
    product: { name: '', brand: brand?.name ?? '', category: 'general', description: '', features: '', price: '', promo: '', audience: '', url: '' },
    strategy: null,
    scenes: [],
    audio: { music: `gen:${MOOD_FOR_STYLE[brand?.style ?? style]}`, musicVolume: s.musicVolume, sfxVolume: s.sfxVolume, fadeIn: 0.8, fadeOut: 1.2, musicStart: 0 },
    captions: null,
    exports: [],
  };
}

export const STATUS_LABEL: Record<Project['status'], string> = { draft: 'ฉบับร่าง', ready: 'พร้อมส่งออก', exported: 'ส่งออกแล้ว' };
