// Image import helpers: downscale very large photos (keeps appearance, saves
// storage/memory on phones) and extract dominant colours from the product.
export const ACCEPT = 'image/jpeg,image/png,image/webp';
export const MAX_SIDE = 2048;

export async function normalizeImage(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`ไม่รองรับไฟล์ ${file.name} (รองรับ JPG, PNG, WebP)`);
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (r === 1) { bmp.close?.(); return file; }
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * r);
  c.height = Math.round(bmp.height * r);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('แปลงรูปไม่สำเร็จ'))), type, 0.92));
}

/** k-means-lite on a downsampled image → a few dominant colours (hex). */
export async function dominantColors(blob: Blob, n = 4): Promise<string[]> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, 48, 48);
  const d = ctx.getImageData(0, 0, 48, 48).data;
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 245 && min > 235) continue; // skip white backdrop
    const k = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = buckets.get(k) ?? { r: 0, g: 0, b: 0, n: 0 };
    e.r += r; e.g += g; e.b += b; e.n++;
    buckets.set(k, e);
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, n)
    .map((e) => `#${hex(e.r / e.n)}${hex(e.g / e.n)}${hex(e.b / e.n)}`);
}

export function darken(hex: string, f = 0.35) {
  const m = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => Math.round(parseInt(m.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0'));
  return `#${c.join('')}`;
}
