import type { ElementType } from './types';

export const ELEMENT_LABEL: Record<ElementType, string> = {
  badge: 'ป้ายโปรโมชั่น', price: 'ป้ายราคา', arrow: 'ลูกศร CTA', stars: 'ดาว 5 ดวง', ribbon: 'ริบบิ้น', heart: 'หัวใจ', spark: 'ประกาย', check: 'เครื่องหมายถูก',
};

export const ELEMENT_LIBRARY: { cat: string; color: string; items: { type: ElementType; text?: string }[] }[] = [
  { cat: 'หรูหรา', color: '#d9b46a', items: [{ type: 'spark' }, { type: 'ribbon', text: 'Premium' }, { type: 'badge', text: 'พิเศษ' }] },
  { cat: 'บิวตี้', color: '#ff8fb8', items: [{ type: 'heart' }, { type: 'spark' }, { type: 'ribbon', text: 'ใหม่' }] },
  { cat: 'อาหาร', color: '#ffcc33', items: [{ type: 'badge', text: 'อร่อย' }, { type: 'stars' }, { type: 'price' }] },
  { cat: 'แฟชั่น', color: '#ffffff', items: [{ type: 'ribbon', text: 'NEW' }, { type: 'arrow' }, { type: 'spark' }] },
  { cat: 'เทคโนโลยี', color: '#38e1ff', items: [{ type: 'spark' }, { type: 'check' }, { type: 'arrow' }] },
  { cat: 'สุขภาพ', color: '#5ee6a8', items: [{ type: 'check' }, { type: 'heart' }, { type: 'stars' }] },
  { cat: 'บ้าน', color: '#f2c879', items: [{ type: 'check' }, { type: 'ribbon', text: 'แนะนำ' }, { type: 'heart' }] },
  { cat: 'โปรโมชั่น', color: '#ffe600', items: [{ type: 'badge', text: 'SALE' }, { type: 'price' }, { type: 'ribbon', text: 'โปร' }] },
  { cat: 'มินิมอล', color: '#1f1f24', items: [{ type: 'check' }, { type: 'arrow' }, { type: 'ribbon', text: 'New' }] },
  { cat: 'เทศกาล', color: '#ff4d4d', items: [{ type: 'spark' }, { type: 'badge', text: 'ฉลอง' }, { type: 'heart' }] },
  { cat: 'CTA', color: '#8b7cf6', items: [{ type: 'arrow' }, { type: 'ribbon', text: 'กดเลย' }, { type: 'badge', text: 'คลิก' }] },
];
