export type Aspect = '9:16' | '1:1' | '16:9';
export type Duration = 10 | 15 | 30 | 45 | 60;

export type CategoryId =
  | 'beauty' | 'food' | 'fashion' | 'tech' | 'health' | 'home' | 'luxury' | 'general';

export type StyleId =
  | 'luxury' | 'viral' | 'minimal' | 'sales' | 'food' | 'beauty'
  | 'fashion' | 'tech' | 'cinematic' | 'affiliate';

export type SceneKind = 'hook' | 'intro' | 'features' | 'benefit' | 'promo' | 'cta';
export type Camera = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'static' | 'float';
export type Transition = 'none' | 'fade' | 'slide' | 'zoom' | 'wipe' | 'flash';
export type TextAnim = 'none' | 'fade-up' | 'pop' | 'typewriter' | 'slide-left' | 'glow';
export type TextPreset = 'bold' | 'gold' | 'neon' | 'outline' | 'label' | '3d' | 'soft' | 'cine';
export type ElementType = 'badge' | 'price' | 'arrow' | 'stars' | 'ribbon' | 'heart' | 'spark' | 'check';
export type SfxId = 'whoosh' | 'pop' | 'ding' | 'riser' | 'impact' | 'shimmer';
export type MusicMood = 'elegant' | 'upbeat' | 'soft' | 'electronic' | 'trendy' | 'cinematic';

export interface TextStyle {
  preset: TextPreset;
  font: string;
  size: number;        // relative to min(W,H): 0.06 = 6%
  weight: number;
  color: string;
  color2?: string;     // gradient end
  align: 'left' | 'center' | 'right';
  letterSpacing: number; // px at 1080 scale
  bg?: string;         // label background
}

export interface TextLayer {
  id: string;
  text: string;
  x: number; // 0..1 (center)
  y: number;
  style: TextStyle;
  anim: TextAnim;
}

export interface ElementLayer {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  scale: number;   // relative size
  color: string;
  text?: string;
}

export interface Scene {
  id: string;
  kind: SceneKind;
  duration: number; // seconds
  imageIndex: number;
  background: { type: 'gradient' | 'blur' | 'solid'; colors: [string, string] };
  camera: Camera;
  product: { x: number; y: number; scale: number; mode: 'card' | 'full' | 'hidden' | 'ai'; clip?: number; clean?: boolean };
  effects: { particles: boolean; rays: boolean; glow: boolean; spotlight: boolean };
  texts: TextLayer[];
  elements: ElementLayer[];
  transition: Transition;
  sfx: SfxId | null;
  voice?: string | null; // asset id of a voice-over line played from the scene start
}

export interface ProductInfo {
  name: string;
  brand: string;
  category: CategoryId;
  description: string;
  features: string;     // one per line, entered/confirmed by user
  price: string;
  promo: string;
  audience: string;
  url: string;
  ai?: {
    provider: string;
    sources: { title: string; url: string }[];
    confidence?: 'high' | 'medium' | 'low';
    notes?: string;
    labelText?: string;
    priceHint?: string;
    at: number;
  };
}

export interface Strategy {
  positioning: string;
  audience: string;
  usp: string;
  painPoints: string;
  emotional: string;
  functional: string;
  hook: string;
  structure: string;
  cta: string;
  caption: string;
}

export interface Captions {
  tiktok: string;
  facebook: string;
  instagram: string;
  youtube: string;
  hashtags: string[];
}

export interface AudioSettings {
  music: string | null; // 'gen:<mood>' or 'asset:<id>'
  musicVolume: number;  // 0..1
  sfxVolume: number;
  fadeIn: number;       // seconds
  fadeOut: number;
  musicStart: number;   // trim offset (seconds) into uploaded track
  clipVolume?: number;  // volume of audio that comes with AI/Flow clips (0..1)
  voiceVolume?: number; // Thai voice-over (0..1)
}

export interface ExportRecord {
  at: number;
  format: 'mp4' | 'webm';
  width: number;
  height: number;
  fps: number;
  bytes: number;
}

export interface Affiliate {
  url: string;
  disclose: boolean;
  disclosureText: string;
}

export type ProjectStatus = 'draft' | 'ready' | 'exported';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  aspect: Aspect;
  duration: Duration;
  style: StyleId;
  versionLabel?: string;
  brandKitId?: string;
  images: string[]; // asset ids
  aiClips?: string[]; // AI-generated video clip asset ids
  product: ProductInfo;
  strategy: Strategy | null;
  scenes: Scene[];
  audio: AudioSettings;
  captions: Captions | null;
  exports: ExportRecord[];
  affiliate?: Affiliate;
  flow?: FlowPlan;
  adPhoto?: { assetId: string; method: string; approved?: boolean; prompt?: string };
}

export interface FlowShot { type: string; method: 'frames' | 'ingredients'; image_prompt: string; veo_prompt: string; voice_th: string; headline: string; clip?: string | null; voice?: string | null; frame?: string | null; product?: boolean }
export interface FlowPlan { hook: string; cta: string; caption: string; hashtags: string[]; shots: FlowShot[]; model: string; createdAt: number; baked?: boolean; palette?: string[] }

export interface BrandKit {
  id: string;
  name: string;
  logo?: string; // asset id
  primary: string;
  secondary: string;
  font: string;
  cta: string;
  contact: string;
  socials: string;
  style: StyleId;
}

export interface Asset {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  kind: 'image' | 'audio' | 'logo' | 'video';
  createdAt: number;
  license?: string;
}

export interface Activity {
  id: string;
  at: number;
  text: string;
  projectId?: string;
}
