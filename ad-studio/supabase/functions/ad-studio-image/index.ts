// AI AD STUDIO — free AI "ad photo" generation on Hugging Face ZeroGPU (owner's HF token).
// actions:
//   kontext — FLUX.1 Kontext [dev] repaints the product photo into an ad scene, then Gemini (free) checks
//             that the product/label was not changed; returns 422 {changed:true} if it was.
//   scene   — Z-Image-Turbo makes an empty backdrop (the app composites the real product cut-out on top).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-studio-pass, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-ai-model, x-ai-check',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const KONTEXT = Deno.env.get('KONTEXT_SPACE') || 'black-forest-labs/FLUX.1-Kontext-Dev';
const ZIMAGE = Deno.env.get('ZIMAGE_SPACE') || 'Tongyi-MAI/Z-Image-Turbo';
const host = (id: string) => `https://${id.replace(/[/_.]/g, '-').toLowerCase()}.hf.space/gradio_api`;
const GEM = 'https://generativelanguage.googleapis.com/v1beta';

async function vault(name: string) {
  const url = Deno.env.get('SUPABASE_URL'), sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/rpc/ad_studio_secret`, { method: 'POST', headers: { apikey: sk!, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ secret_name: name }) });
  const x = r.ok ? await r.json() : null;
  return typeof x === 'string' && x ? x : null;
}

// Uses the queue API (not /call) because it returns the real error text (e.g. "ZeroGPU quota exceeded ... try again in 3:20:11").
async function gradio(space: string, endpoint: string, token: string, data: unknown[]) {
  const base = host(space);
  const auth = { Authorization: `Bearer ${token}` };
  const cfg = await fetch(base.replace('/gradio_api', '/config'), { headers: auth }).then((r) => r.json());
  const dep = (cfg.dependencies ?? []).find((d: { api_name?: string }) => d.api_name === endpoint);
  if (!dep) throw new Error(`endpoint ${endpoint} not found`);
  const session_hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const join = await fetch(`${base}/queue/join`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ data, fn_index: dep.id, session_hash }) });
  if (!join.ok) throw new Error(`join ${join.status}`);
  const res = await fetch(`${base}/queue/data?session_hash=${session_hash}`, { headers: auth });
  if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const m = JSON.parse(line.slice(5));
      if (m.msg === 'process_completed') {
        if (!m.success) {
          const t = `${m.title || ''} ${m.output?.error || ''}`.trim();
          throw new Error(/zerogpu|quota|gpu/i.test(t) ? `ZeroGPU: ${t}` : `Space error: ${t || 'unknown'}`);
        }
        return { out: m.output.data, base, auth };
      }
    }
  }
  throw new Error('stream ended without result');
}

async function download(f: { url?: string; path?: string } | undefined, base: string, auth: Record<string, string>) {
  const url = f?.url || (f?.path ? `${base}/file=${f.path}` : null);
  if (!url) throw new Error('no image in result');
  const r = await fetch(url, { headers: auth });
  if (!r.ok) throw new Error(`download ${r.status}`);
  return { bytes: new Uint8Array(await r.arrayBuffer()), type: r.headers.get('content-type') || 'image/png' };
}

async function upload(space: string, token: string, img: Uint8Array) {
  const fd = new FormData();
  fd.append('files', new Blob([img], { type: 'image/jpeg' }), 'product.jpg');
  const up = await fetch(`${host(space)}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  if (!up.ok) throw new Error(`upload ${up.status}`);
  const [path] = await up.json();
  return { path, meta: { _type: 'gradio.FileData' } };
}

const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

/** Free Gemini check: is the product (shape, label text, logo) unchanged? Returns true/false, or null if no verdict. */
async function sameProduct(orig: Uint8Array, edited: Uint8Array, editedType: string) {
  const k = Deno.env.get('GEMINI_API_KEY') || await vault('ad_studio_gemini_key');
  if (!k) return null;
  for (const model of ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite']) {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(`${GEM}/models/${model}:generateContent`, {
        method: 'POST', signal: ctl.signal, headers: { 'x-goog-api-key': k, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: 'Image 1 is the original product photo. Image 2 is an AI-edited advertising photo. Is the product in image 2 the same product with the same shape, colors, logo and the same readable label text (no misspelled, garbled or invented text)? Answer JSON {"same": true|false, "reason": "short"}.' },
            { inlineData: { mimeType: 'image/jpeg', data: b64(orig) } },
            { inlineData: { mimeType: editedType.split(';')[0], data: b64(edited) } },
          ] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      const d = await r.json().catch(() => ({}));
      const t = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (r.ok && t) { const v = JSON.parse(t); return { same: !!v.same, reason: String(v.reason || '') }; }
    } catch { /* try next */ } finally { clearTimeout(to); }
  }
  return null;
}

/** Free, fast product cut-out: Gemini segmentation mask (box 0..1000 + PNG probability mask). */
async function geminiMask(image: string) {
  const k = Deno.env.get('GEMINI_API_KEY') || await vault('ad_studio_gemini_key');
  if (!k) return null;
  const models = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.5-flash-lite'];
  for (const model of models) {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(`${GEM}/models/${model}:generateContent`, {
        method: 'POST', signal: ctl.signal, headers: { 'x-goog-api-key': k, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: 'image/jpeg', data: image } },
            { text: 'Give the segmentation mask for the single main product in this photo (the whole product including cap/lid/packaging, nothing else). Output a JSON list with exactly one entry with the keys "box_2d", "mask" and "label".' },
          ] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      const d = await r.json().catch(() => ({}));
      const t = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (r.ok && t) {
        const list = JSON.parse(t);
        const e = Array.isArray(list) ? list[0] : list;
        if (e?.box_2d?.length === 4 && typeof e.mask === 'string' && e.mask.includes('base64')) return { box: e.box_2d, mask: e.mask, model };
      }
    } catch { /* next */ } finally { clearTimeout(to); }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'https://khalil203.github.io,http://localhost:4173,http://localhost:5173').split(',');
  const pass = Deno.env.get('STUDIO_PASS');
  if (!allowed.includes(origin) && !(pass && req.headers.get('x-studio-pass') === pass)) return json({ error: 'ไม่อนุญาต' }, 401);
  let b: { action?: string; image?: string; prompt?: string; check?: boolean };
  try { b = await req.json(); } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400); }
  if (b.action === 'cutout') {
    if (!b.image) return json({ error: 'ไม่มีรูปภาพ' }, 400);
    const m = await geminiMask(b.image);
    return m ? json(m) : json({ error: 'AI ตัดพื้นหลังไม่สำเร็จ' }, 502);
  }
  const token = Deno.env.get('HF_TOKEN') || await vault('ad_studio_hf_token');
  if (!token) return json({ error: 'ยังไม่ได้ตั้งค่า Hugging Face token' }, 503);
  if (!b.prompt) return json({ error: 'ไม่มี prompt' }, 400);
  try {
    if (b.action === 'kontext') {
      if (!b.image) return json({ error: 'ไม่มีรูปภาพ' }, 400);
      const img = Uint8Array.from(atob(b.image), (c) => c.charCodeAt(0));
      const file = await upload(KONTEXT, token, img);
      const { out, base, auth } = await gradio(KONTEXT, 'infer', token, [file, b.prompt.slice(0, 900), 42, true, 2.5, 20]);
      const f = await download(out[0], base, auth);
      let check = 'skipped';
      if (b.check !== false) {
        const v = await sameProduct(img, f.bytes, f.type);
        if (v && !v.same) return json({ error: `AI เปลี่ยนสินค้า/ฉลาก (${v.reason.slice(0, 120)}) — ใช้วิธีไดคัทแทน`, changed: true }, 422);
        check = v ? 'same' : 'unknown';
      }
      return new Response(f.bytes, { headers: { ...CORS, 'Content-Type': f.type, 'x-ai-model': 'FLUX.1 Kontext [dev]', 'x-ai-check': check } });
    }
    if (b.action === 'scene') {
      const { out, base, auth } = await gradio(ZIMAGE, 'generate', token, [b.prompt.slice(0, 900), '720x1280 ( 9:16 )', 42, 8, 3, true, []]);
      const first = Array.isArray(out[0]) ? out[0][0] : out[0];
      const f = await download(first?.image ?? first, base, auth);
      return new Response(f.bytes, { headers: { ...CORS, 'Content-Type': f.type, 'x-ai-model': 'Z-Image-Turbo' } });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: `สร้างภาพ AI ไม่สำเร็จ — ${(e as Error).message.slice(0, 200)}` }, 502);
  }
});
