// Rule-based Thai marketing engine (free, offline).
// It ONLY uses facts the user entered. It never invents specs, ingredients,
// certifications, discounts, reviews or performance claims.
import type { Captions, CategoryId, MusicMood, ProductInfo, StyleId, Strategy } from './types';

interface CategoryProfile {
  label: string;
  noun: string;            // generic Thai noun for the product type
  audience: string;
  pains: string[];
  emotional: string;
  functional: string;
  hooks: string[];
  mood: MusicMood;
  style: StyleId;
  tags: string[];
}

export const CATEGORIES: Record<CategoryId, CategoryProfile> = {
  beauty: {
    label: 'ความงาม / สกินแคร์',
    noun: 'ผลิตภัณฑ์ดูแลตัวเอง',
    audience: 'ผู้หญิงและผู้ชายวัย 18–40 ที่ใส่ใจการดูแลผิวและภาพลักษณ์',
    pains: ['หาผลิตภัณฑ์ที่เข้ากับตัวเองได้ยาก', 'ไม่มีเวลาดูแลตัวเองหลายขั้นตอน', 'กังวลว่าจะเลือกผิดแล้วเสียเงินเปล่า'],
    emotional: 'ความมั่นใจและความรู้สึกดีกับตัวเองในทุกวัน',
    functional: 'ใช้งานง่าย เข้ากับกิจวัตรประจำวัน',
    hooks: ['ช่วงเวลาดูแลตัวเองที่คุณควรได้', 'อีกหนึ่งตัวเลือกสำหรับคนรักผิว', 'กิจวัตรง่าย ๆ ที่ทำให้วันของคุณดีขึ้น'],
    mood: 'soft', style: 'beauty',
    tags: ['#สกินแคร์', '#บิวตี้', '#ดูแลตัวเอง', '#รีวิวบิวตี้'],
  },
  food: {
    label: 'อาหาร / เครื่องดื่ม',
    noun: 'เมนูอร่อย',
    audience: 'คนรักการกิน คนทำงานที่อยากได้ของอร่อยสะดวก และครอบครัว',
    pains: ['หิวแต่ไม่รู้จะกินอะไร', 'อยากได้ของอร่อยที่หาซื้อง่าย', 'อยากหาของฝากหรือของกินเล่นใหม่ ๆ'],
    emotional: 'ความสุขเล็ก ๆ จากของอร่อยที่แชร์กับคนที่รัก',
    functional: 'สะดวก พร้อมเสิร์ฟ เหมาะกับทุกโอกาส',
    hooks: ['หิวเมื่อไหร่ นึกถึงเมนูนี้', 'ของอร่อยที่ต้องลองสักครั้ง', 'ใครชอบสายกิน ห้ามพลาด'],
    mood: 'upbeat', style: 'food',
    tags: ['#ของอร่อย', '#อาหาร', '#ของกิน', '#ร้านอร่อย'],
  },
  fashion: {
    label: 'แฟชั่น / เครื่องแต่งกาย',
    noun: 'ไอเท็มแฟชั่น',
    audience: 'คนรุ่นใหม่ที่ชอบแต่งตัวและอยากมีสไตล์เป็นของตัวเอง',
    pains: ['ไม่มีอะไรใส่ทั้งที่ตู้เต็ม', 'อยากได้ชิ้นที่แมทช์ได้หลายลุค', 'หาไซซ์และสไตล์ที่ใช่ไม่ค่อยเจอ'],
    emotional: 'ความมั่นใจที่ได้เป็นตัวเองในทุกลุค',
    functional: 'แมทช์ง่าย ใส่ได้หลายโอกาส',
    hooks: ['ลุคใหม่ที่คุณต้องมี', 'แต่งง่าย ดูดีทุกวัน', 'ไอเท็มเดียว แมทช์ได้หลายสไตล์'],
    mood: 'trendy', style: 'fashion',
    tags: ['#แฟชั่น', '#ootd', '#แต่งตัว', '#สไตล์'],
  },
  tech: {
    label: 'เทคโนโลยี / แกดเจ็ต',
    noun: 'แกดเจ็ต',
    audience: 'คนทำงาน นักเรียน และสายเทคที่อยากให้ชีวิตสะดวกขึ้น',
    pains: ['อุปกรณ์เดิมใช้งานไม่สะดวก', 'อยากได้ของที่คุ้มค่ากับราคา', 'กลัวซื้อแล้วใช้งานไม่ตรงความต้องการ'],
    emotional: 'ความสะดวกและความรู้สึกว่าชีวิตง่ายขึ้น',
    functional: 'ใช้งานสะดวก ตอบโจทย์การใช้งานประจำวัน',
    hooks: ['อัปเกรดชีวิตประจำวันให้ง่ายขึ้น', 'แกดเจ็ตที่สายเทคต้องดู', 'ตัวช่วยเล็ก ๆ ที่เปลี่ยนวันของคุณ'],
    mood: 'electronic', style: 'tech',
    tags: ['#แกดเจ็ต', '#ไอที', '#เทคโนโลยี', '#ของมันต้องมี'],
  },
  health: {
    label: 'สุขภาพ / ฟิตเนส',
    noun: 'ผลิตภัณฑ์เพื่อสุขภาพ',
    audience: 'คนที่ใส่ใจสุขภาพ ออกกำลังกาย และอยากมีไลฟ์สไตล์ที่ดีขึ้น',
    pains: ['อยากดูแลสุขภาพแต่ไม่รู้จะเริ่มตรงไหน', 'ไม่มีเวลามาก', 'อยากได้ตัวช่วยที่ใช้ได้จริงในชีวิตประจำวัน'],
    emotional: 'ความรู้สึกดีที่ได้ดูแลตัวเอง',
    functional: 'ใช้ง่าย เข้ากับไลฟ์สไตล์',
    hooks: ['เริ่มดูแลตัวเองได้ตั้งแต่วันนี้', 'ตัวช่วยสำหรับคนรักสุขภาพ', 'ไลฟ์สไตล์ดี ๆ เริ่มจากสิ่งเล็ก ๆ'],
    mood: 'upbeat', style: 'minimal',
    tags: ['#สุขภาพ', '#ดูแลตัวเอง', '#ออกกำลังกาย', '#healthy'],
  },
  home: {
    label: 'บ้าน / ไลฟ์สไตล์',
    noun: 'ของใช้ในบ้าน',
    audience: 'คนที่รักบ้าน ชอบแต่งบ้าน และอยากให้ชีวิตในบ้านสะดวกขึ้น',
    pains: ['บ้านรก จัดเก็บยาก', 'อยากได้ของใช้ที่ทั้งสวยและใช้งานได้', 'งานบ้านกินเวลา'],
    emotional: 'ความอบอุ่นและความสบายใจเมื่ออยู่บ้าน',
    functional: 'ใช้งานสะดวก ช่วยให้ชีวิตในบ้านง่ายขึ้น',
    hooks: ['ทำให้บ้านน่าอยู่ขึ้นอีกนิด', 'ของใช้ในบ้านที่คุณจะรัก', 'ไอเดียดี ๆ สำหรับบ้านของคุณ'],
    mood: 'soft', style: 'minimal',
    tags: ['#ของใช้ในบ้าน', '#แต่งบ้าน', '#ไลฟ์สไตล์', '#บ้านน่าอยู่'],
  },
  luxury: {
    label: 'สินค้าพรีเมียม / ลักชัวรี',
    noun: 'สินค้าพรีเมียม',
    audience: 'ผู้ที่ชื่นชอบความหรูหรา คุณภาพ และรายละเอียด',
    pains: ['อยากได้ของที่สะท้อนตัวตน', 'มองหาของขวัญที่มีความหมาย', 'ต้องการคุณภาพที่คุ้มค่า'],
    emotional: 'ความภูมิใจและความพิเศษในทุกรายละเอียด',
    functional: 'งานละเอียด ดีไซน์โดดเด่น',
    hooks: ['ความพิเศษที่อยู่ในทุกรายละเอียด', 'สำหรับคนที่เลือกแต่สิ่งที่ดีที่สุด', 'นิยามใหม่ของความหรูหรา'],
    mood: 'elegant', style: 'luxury',
    tags: ['#ลักชัวรี', '#พรีเมียม', '#ของขวัญ', '#luxury'],
  },
  general: {
    label: 'สินค้าทั่วไป',
    noun: 'สินค้า',
    audience: 'ผู้ที่กำลังมองหาสินค้าคุณภาพในราคาที่เหมาะสม',
    pains: ['หาของที่ตรงความต้องการไม่เจอ', 'อยากได้ของคุ้มค่า', 'ไม่แน่ใจว่าควรเลือกแบบไหน'],
    emotional: 'ความพอใจที่ได้ของที่ใช่',
    functional: 'ตอบโจทย์การใช้งาน',
    hooks: ['ของดีที่อยากให้คุณได้รู้จัก', 'ตัวเลือกใหม่ที่น่าสนใจ', 'กำลังมองหาของแบบนี้อยู่หรือเปล่า?'],
    mood: 'upbeat', style: 'viral',
    tags: ['#ของดีบอกต่อ', '#ช้อปออนไลน์', '#รีวิว', '#แนะนำ'],
  },
};

export const STYLE_LABEL: Record<StyleId, string> = {
  luxury: 'หรูหรา พรีเมียม',
  viral: 'ไวรัลโซเชียล',
  minimal: 'มินิมอล',
  sales: 'เน้นขาย',
  food: 'อาหารน่ากิน',
  beauty: 'บิวตี้ละมุน',
  fashion: 'แฟชั่นทันสมัย',
  tech: 'เทคล้ำยุค',
  cinematic: 'ภาพยนตร์',
  affiliate: 'รีวิวแอฟฟิลิเอต',
};

export const MOOD_FOR_STYLE: Record<StyleId, MusicMood> = {
  luxury: 'elegant', viral: 'trendy', minimal: 'soft', sales: 'upbeat', food: 'upbeat',
  beauty: 'soft', fashion: 'trendy', tech: 'electronic', cinematic: 'cinematic', affiliate: 'upbeat',
};

export function featureList(p: ProductInfo): string[] {
  return p.features.split('\n').map((s) => s.replace(/^[-•*\d.\s]+/, '').trim()).filter(Boolean);
}

const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

/** What's missing before a strong, honest ad can be made. */
export function missingInfo(p: ProductInfo): string[] {
  const m: string[] = [];
  if (!p.name.trim()) m.push('ชื่อสินค้า');
  if (featureList(p).length === 0) m.push('จุดเด่นหรือคุณสมบัติของสินค้า (อย่างน้อย 1 ข้อ)');
  if (!p.description.trim()) m.push('คำอธิบายสินค้าสั้น ๆ');
  return m;
}

export function ctaFor(style: StyleId, p: ProductInfo, brandCta?: string) {
  if (brandCta) return brandCta;
  const hasLink = !!p.url.trim();
  if (style === 'affiliate') return hasLink ? 'กดลิงก์ดูรายละเอียดได้เลย' : 'ดูรายละเอียดเพิ่มเติมได้ที่ช่องทางของเรา';
  if (style === 'sales') return hasLink ? 'สั่งซื้อเลยที่ลิงก์' : 'ทักแชทสั่งซื้อได้เลย';
  if (style === 'luxury') return 'สัมผัสความพิเศษได้แล้ววันนี้';
  return hasLink ? 'กดลิงก์เพื่อดูเพิ่มเติม' : 'ทักมาสอบถามได้เลย';
}

export function generateStrategy(p: ProductInfo, style: StyleId, brandCta?: string): Strategy {
  const c = CATEGORIES[p.category];
  const f = featureList(p);
  const name = p.name.trim() || c.noun;
  const seed = hash(name + style);
  const audience = p.audience.trim() || c.audience;
  const top = f[0];
  const hook = styleHook(style, c, name, seed);
  const usp = top
    ? `${name} — ${top}${f[1] ? ` และ${f[1]}` : ''}`
    : `${name} ${c.functional}`;
  const cta = ctaFor(style, p, brandCta);
  const sceneNames = ['ฮุกดึงความสนใจ', 'แนะนำสินค้า', 'จุดเด่น', 'ประโยชน์และอารมณ์', p.promo ? 'โปรโมชั่น' : 'ไฮไลต์สินค้า', 'ปิดด้วย CTA'];

  return {
    positioning: `${name} — ${c.noun}สำหรับ${audience}\nจุดยืน: ${c.functional}`,
    audience,
    usp,
    painPoints: c.pains.map((x) => `• ${x}`).join('\n'),
    emotional: c.emotional,
    functional: f.length ? f.map((x) => `• ${x}`).join('\n') : `• ${c.functional} (เพิ่มคุณสมบัติจริงของสินค้าเพื่อให้ชัดเจนขึ้น)`,
    hook,
    structure: sceneNames.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    cta,
    caption: buildCaption(p, style, hook, cta, 'tiktok'),
  };
}

function styleHook(style: StyleId, c: CategoryProfile, name: string, seed: number) {
  switch (style) {
    case 'luxury': return `ความพิเศษที่คุณสัมผัสได้ — ${name}`;
    case 'viral': return pick(['หยุดเลื่อนก่อน! ของนี้ต้องดู', 'ใครยังไม่รู้จัก ต้องดูอันนี้', `เปิดตัว ${name}`], seed);
    case 'minimal': return name;
    case 'sales': return pick(['กำลังมองหาของแบบนี้อยู่ใช่ไหม?', `${name} มาแล้ว!`], seed);
    case 'affiliate': return `ป้ายยา ${name} 🛒`;
    case 'cinematic': return pick(c.hooks, seed);
    default: return pick(c.hooks, seed);
  }
}

const PLATFORM_TAIL: Record<keyof Omit<Captions, 'hashtags'>, number> = { tiktok: 150, instagram: 400, facebook: 600, youtube: 300 };

export function buildCaption(p: ProductInfo, style: StyleId, hook: string, cta: string, platform: keyof typeof PLATFORM_TAIL, disclosure?: string) {
  const f = featureList(p);
  const name = p.name.trim() || 'สินค้า';
  const lines: string[] = [];
  lines.push(hook.includes(name) ? hook : `${hook}`);
  if (platform === 'tiktok') {
    if (f[0]) lines.push(`✨ ${f[0]}`);
  } else {
    if (p.description.trim()) lines.push(p.description.trim());
    f.slice(0, platform === 'facebook' ? 5 : 3).forEach((x) => lines.push(`✅ ${x}`));
  }
  if (p.price.trim()) lines.push(`💰 ราคา ${p.price.trim()}${/บาท|฿/.test(p.price) ? '' : ' บาท'}`);
  if (p.promo.trim()) lines.push(`🎁 ${p.promo.trim()}`);
  lines.push(`👉 ${cta}`);
  if (p.url.trim() && platform !== 'instagram') lines.push(p.url.trim());
  if (p.url.trim() && platform === 'instagram') lines.push('🔗 ลิงก์อยู่ที่โปรไฟล์');
  if (disclosure) lines.push(disclosure);
  let text = lines.join('\n');
  const max = PLATFORM_TAIL[platform];
  if (text.length > max && platform === 'tiktok') text = lines.filter((l) => !l.startsWith('✨')).join('\n');
  void style;
  return text;
}

export function generateHashtags(p: ProductInfo, count = 3): string[] {
  const c = CATEGORIES[p.category];
  const tags: string[] = [];
  const nameTag = p.name.trim().replace(/[^\p{L}\p{N}]/gu, '');
  if (nameTag && nameTag.length <= 24) tags.push(`#${nameTag}`);
  for (const t of c.tags) if (tags.length < count && !tags.includes(t)) tags.push(t);
  return tags.slice(0, Math.max(1, Math.min(4, count)));
}

export function generateCaptions(p: ProductInfo, style: StyleId, s: Strategy | null, disclosure?: string): Captions {
  const hook = s?.hook || styleHook(style, CATEGORIES[p.category], p.name || 'สินค้า', 1);
  const cta = s?.cta || ctaFor(style, p);
  return {
    tiktok: buildCaption(p, style, hook, cta, 'tiktok', disclosure),
    facebook: buildCaption(p, style, hook, cta, 'facebook', disclosure),
    instagram: buildCaption(p, style, hook, cta, 'instagram', disclosure),
    youtube: buildCaption(p, style, hook, cta, 'youtube', disclosure),
    hashtags: generateHashtags(p, 3),
  };
}

export const VERSION_PRESETS: { style: StyleId; label: string }[] = [
  { style: 'luxury', label: 'A · หรูหรา' },
  { style: 'viral', label: 'B · ไวรัลโซเชียล' },
  { style: 'minimal', label: 'C · มินิมอลโชว์สินค้า' },
  { style: 'sales', label: 'D · เน้นยอดขาย' },
];
