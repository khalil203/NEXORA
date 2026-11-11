import { uid } from './db';
import { featureList } from './marketing';
import type {
  Camera, Duration, ElementLayer, ProductInfo, Scene, SceneKind, SfxId, Strategy, StyleId,
  TextAnim, TextLayer, TextPreset, TextStyle, Transition,
} from './types';

export interface StyleLook {
  bg: [string, string][];
  bgType: Scene['background']['type'];
  font: string;
  headPreset: TextPreset;
  bodyPreset: TextPreset;
  accent: string;
  textColor: string;
  cameras: Camera[];
  transitions: Transition[];
  anims: TextAnim[];
  effects: Scene['effects'];
  sfx: SfxId[];
}

export const LOOKS: Record<StyleId, StyleLook> = {
  luxury: {
    bg: [['#0d0a07', '#3a2a12'], ['#08080a', '#2a2216'], ['#120d06', '#4a3615']],
    bgType: 'gradient', font: 'Prompt', headPreset: 'gold', bodyPreset: 'soft', accent: '#d9b46a', textColor: '#f6ecd6',
    cameras: ['zoom-in', 'float', 'pan-up', 'zoom-out'], transitions: ['fade', 'zoom', 'fade'], anims: ['fade-up', 'glow'],
    effects: { particles: true, rays: true, glow: true, spotlight: true }, sfx: ['shimmer', 'whoosh'],
  },
  viral: {
    bg: [['#ff3d7f', '#7b2ff7'], ['#00c6ff', '#7b2ff7'], ['#ff9a00', '#ff3d7f']],
    bgType: 'gradient', font: 'Kanit', headPreset: '3d', bodyPreset: 'label', accent: '#ffe14d', textColor: '#ffffff',
    cameras: ['zoom-in', 'pan-left', 'zoom-out', 'pan-right'], transitions: ['flash', 'slide', 'zoom'], anims: ['pop', 'slide-left'],
    effects: { particles: true, rays: false, glow: true, spotlight: false }, sfx: ['pop', 'whoosh', 'impact'],
  },
  minimal: {
    bg: [['#f4f1ec', '#e3ded6'], ['#eef0f3', '#dfe3e9'], ['#f6f3ef', '#e8e2da']],
    bgType: 'gradient', font: 'IBM Plex Sans Thai', headPreset: 'soft', bodyPreset: 'soft', accent: '#1f1f24', textColor: '#1f1f24',
    cameras: ['float', 'zoom-in', 'static'], transitions: ['fade', 'wipe'], anims: ['fade-up'],
    effects: { particles: false, rays: false, glow: false, spotlight: true }, sfx: ['whoosh'],
  },
  sales: {
    bg: [['#c4001d', '#ff5a1f'], ['#1a1a2e', '#c4001d'], ['#ff5a1f', '#ffb000']],
    bgType: 'gradient', font: 'Kanit', headPreset: 'outline', bodyPreset: 'label', accent: '#ffe600', textColor: '#ffffff',
    cameras: ['zoom-in', 'pan-right', 'zoom-in'], transitions: ['flash', 'slide', 'zoom'], anims: ['pop', 'slide-left'],
    effects: { particles: true, rays: true, glow: true, spotlight: false }, sfx: ['impact', 'pop', 'ding'],
  },
  food: {
    bg: [['#3b1405', '#c2410c'], ['#4a1d0a', '#ea8a1a'], ['#2a0f04', '#b8360a']],
    bgType: 'blur', font: 'Kanit', headPreset: 'bold', bodyPreset: 'label', accent: '#ffcc33', textColor: '#ffffff',
    cameras: ['zoom-in', 'pan-left', 'float'], transitions: ['slide', 'fade', 'zoom'], anims: ['pop', 'fade-up'],
    effects: { particles: true, rays: true, glow: true, spotlight: false }, sfx: ['pop', 'whoosh', 'ding'],
  },
  beauty: {
    bg: [['#f9d8e4', '#e7c6f3'], ['#fde6ee', '#f3d9f7'], ['#f6e1d8', '#efc9de']],
    bgType: 'gradient', font: 'Prompt', headPreset: 'soft', bodyPreset: 'soft', accent: '#c2457a', textColor: '#5a1f3b',
    cameras: ['float', 'zoom-in', 'pan-up'], transitions: ['fade', 'zoom'], anims: ['fade-up', 'glow'],
    effects: { particles: true, rays: false, glow: true, spotlight: true }, sfx: ['shimmer', 'whoosh'],
  },
  fashion: {
    bg: [['#111111', '#3d3d3d'], ['#e8e3da', '#b9b1a3'], ['#1b1b1b', '#5a4a3a']],
    bgType: 'blur', font: 'Anuphan', headPreset: 'bold', bodyPreset: 'label', accent: '#ffffff', textColor: '#ffffff',
    cameras: ['pan-left', 'zoom-in', 'pan-right'], transitions: ['wipe', 'slide', 'flash'], anims: ['slide-left', 'pop'],
    effects: { particles: false, rays: false, glow: false, spotlight: true }, sfx: ['whoosh', 'impact'],
  },
  tech: {
    bg: [['#030b1a', '#0b3d91'], ['#050510', '#3a1c71'], ['#02101c', '#0e6b8a']],
    bgType: 'gradient', font: 'Kanit', headPreset: 'neon', bodyPreset: 'soft', accent: '#38e1ff', textColor: '#e8fbff',
    cameras: ['zoom-in', 'float', 'pan-up'], transitions: ['zoom', 'flash', 'wipe'], anims: ['glow', 'typewriter'],
    effects: { particles: true, rays: true, glow: true, spotlight: false }, sfx: ['riser', 'whoosh', 'impact'],
  },
  cinematic: {
    bg: [['#05070d', '#1c2433'], ['#0a0606', '#33201a'], ['#040608', '#18242c']],
    bgType: 'blur', font: 'Prompt', headPreset: 'soft', bodyPreset: 'soft', accent: '#e9d9b8', textColor: '#f2efe8',
    cameras: ['zoom-in', 'pan-right', 'zoom-out', 'pan-up'], transitions: ['fade', 'fade', 'zoom'], anims: ['fade-up', 'typewriter'],
    effects: { particles: true, rays: true, glow: false, spotlight: true }, sfx: ['riser', 'impact', 'whoosh'],
  },
  affiliate: {
    bg: [['#ff6a00', '#ee0979'], ['#11998e', '#38ef7d'], ['#7f00ff', '#e100ff']],
    bgType: 'gradient', font: 'Kanit', headPreset: 'label', bodyPreset: 'label', accent: '#fff200', textColor: '#ffffff',
    cameras: ['zoom-in', 'pan-left', 'zoom-out'], transitions: ['slide', 'flash', 'zoom'], anims: ['pop', 'slide-left'],
    effects: { particles: true, rays: false, glow: true, spotlight: false }, sfx: ['pop', 'ding', 'whoosh'],
  },
};

/** Scene plan per duration (kinds + share of total time). */
const PLANS: Record<Duration, [SceneKind, number][]> = {
  10: [['hook', 0.3], ['intro', 0.35], ['cta', 0.35]],
  15: [['hook', 0.2], ['intro', 0.27], ['features', 0.27], ['cta', 0.26]],
  30: [['hook', 0.13], ['intro', 0.17], ['features', 0.2], ['benefit', 0.17], ['promo', 0.16], ['cta', 0.17]],
  45: [['hook', 0.1], ['intro', 0.13], ['features', 0.17], ['features', 0.15], ['benefit', 0.15], ['promo', 0.14], ['cta', 0.16]],
  60: [['hook', 0.08], ['intro', 0.12], ['features', 0.14], ['features', 0.13], ['benefit', 0.14], ['benefit', 0.12], ['promo', 0.12], ['cta', 0.15]],
};

export const KIND_LABEL: Record<SceneKind, string> = {
  hook: 'ฮุก', intro: 'แนะนำสินค้า', features: 'จุดเด่น', benefit: 'ประโยชน์', promo: 'ไฮไลต์/โปร', cta: 'CTA',
};

export function textStyle(look: StyleLook, preset: TextPreset, size: number, font?: string): TextStyle {
  const base: TextStyle = {
    preset, font: font || look.font, size, weight: 700, color: look.textColor, align: 'center', letterSpacing: 0,
  };
  switch (preset) {
    case 'gold': return { ...base, color: '#f8e3a3', color2: '#b8862b', weight: 600 };
    case 'neon': return { ...base, color: look.accent, weight: 700 };
    case 'outline': return { ...base, color: '#ffffff', weight: 800 };
    case 'label': return { ...base, color: '#111111', bg: look.accent, weight: 700 };
    case '3d': return { ...base, color: '#ffffff', color2: look.accent, weight: 800 };
    case 'soft': return { ...base, weight: 600 };
    default: return { ...base, weight: 800 };
  }
}

const tl = (text: string, x: number, y: number, style: TextStyle, anim: TextAnim): TextLayer => ({ id: uid(), text, x, y, style, anim });

export interface StoryInput {
  product: ProductInfo;
  strategy: Strategy | null;
  style: StyleId;
  duration: Duration;
  imageCount: number;
  font?: string;
  brandColors?: [string, string];
}

export function generateStoryboard(inp: StoryInput): Scene[] {
  const look = LOOKS[inp.style];
  const plan = PLANS[inp.duration];
  const feats = featureList(inp.product);
  const name = inp.product.name.trim() || 'สินค้าของคุณ';
  const hook = inp.strategy?.hook || name;
  const cta = inp.strategy?.cta || 'สั่งซื้อได้เลย';
  const emotional = inp.strategy?.emotional || '';
  let featIdx = 0;
  let benefitIdx = 0;
  const H = (s: string, y = 0.16, size = 0.085) => tl(s, 0.5, y, textStyle(look, look.headPreset, size, inp.font), look.anims[0]);
  const B = (s: string, y = 0.82, size = 0.05) => tl(s, 0.5, y, textStyle(look, look.bodyPreset, size, inp.font), look.anims[1] || look.anims[0]);

  return plan.map(([kind, share], i) => {
    const bg = inp.brandColors && i % 2 === 1 ? inp.brandColors : look.bg[i % look.bg.length];
    const texts: TextLayer[] = [];
    const elements: ElementLayer[] = [];
    let product: Scene['product'] = { x: 0.5, y: 0.5, scale: 0.62, mode: 'card' };
    switch (kind) {
      case 'hook':
        product = { x: 0.5, y: 0.5, scale: 1, mode: inp.style === 'minimal' ? 'card' : 'full' };
        texts.push(H(hook, 0.17, 0.085));
        break;
      case 'intro':
        texts.push(H(name, 0.15, 0.08));
        if (inp.product.brand.trim()) texts.push(B(inp.product.brand.trim(), 0.84, 0.045));
        break;
      case 'features': {
        const chunk = feats.slice(featIdx, featIdx + 2);
        featIdx += 2;
        if (chunk.length) {
          texts.push(H('จุดเด่น', 0.12, 0.06));
          chunk.forEach((f, k) => {
            texts.push(B(f, 0.76 + k * 0.08, 0.042));
            elements.push({ id: uid(), type: 'check', x: 0.1, y: 0.76 + k * 0.08, scale: 0.05, color: look.accent });
          });
          product = { x: 0.5, y: 0.43, scale: 0.55, mode: 'card' };
        } else {
          texts.push(H(name, 0.15, 0.07));
        }
        break;
      }
      case 'benefit': {
        const line = benefitIdx === 0 ? emotional : feats[feats.length - 1] || emotional;
        benefitIdx++;
        if (line) texts.push(H(line, 0.16, 0.06));
        elements.push({ id: uid(), type: 'heart', x: 0.85, y: 0.3, scale: 0.08, color: look.accent });
        break;
      }
      case 'promo':
        if (inp.product.promo.trim()) {
          texts.push(H(inp.product.promo.trim(), 0.15, 0.07));
          elements.push({ id: uid(), type: 'badge', x: 0.8, y: 0.32, scale: 0.17, color: look.accent, text: 'โปร' });
        } else texts.push(H(name, 0.15, 0.07));
        if (inp.product.price.trim()) elements.push({ id: uid(), type: 'price', x: 0.5, y: 0.83, scale: 0.12, color: look.accent, text: fmtPrice(inp.product.price) });
        break;
      case 'cta':
        texts.push(H(cta, 0.8, 0.065));
        if (inp.product.price.trim() && inp.duration <= 15) elements.push({ id: uid(), type: 'price', x: 0.5, y: 0.14, scale: 0.11, color: look.accent, text: fmtPrice(inp.product.price) });
        elements.push({ id: uid(), type: 'arrow', x: 0.5, y: 0.91, scale: 0.07, color: look.accent });
        product = { x: 0.5, y: 0.46, scale: 0.6, mode: 'card' };
        break;
    }
    const scene: Scene = {
      id: uid(),
      kind,
      duration: Math.round(inp.duration * share * 10) / 10,
      imageIndex: inp.imageCount ? i % inp.imageCount : 0,
      background: { type: look.bgType, colors: bg },
      camera: look.cameras[i % look.cameras.length],
      product,
      effects: { ...look.effects },
      texts,
      elements,
      transition: i === 0 ? 'none' : look.transitions[i % look.transitions.length],
      sfx: i === 0 ? null : look.sfx[i % look.sfx.length],
    };
    return scene;
  }).map((s, _, arr) => {
    // make total exactly the duration
    void arr;
    return s;
  }).reduce<Scene[]>((acc, s, i, arr) => {
    acc.push(s);
    if (i === arr.length - 1) {
      const sum = acc.reduce((t, x) => t + x.duration, 0);
      s.duration = Math.round((s.duration + (inp.duration - sum)) * 10) / 10;
    }
    return acc;
  }, []);
}

export function fmtPrice(p: string) {
  const t = p.trim();
  if (/บาท|฿/.test(t)) return t;
  return /^\d[\d,.]*$/.test(t) ? `฿${t}` : t;
}

export function totalDuration(scenes: Scene[]) {
  return scenes.reduce((t, s) => t + s.duration, 0);
}
