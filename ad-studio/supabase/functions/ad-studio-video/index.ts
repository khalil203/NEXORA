// AI AD STUDIO — free AI image-to-video via Hugging Face ZeroGPU Spaces (LTX-2.3 first, Wan 2.2 fallback).
// Uses the owner's HF token (Vault: ad_studio_hf_token) so generations count against
// their free daily ZeroGPU quota. Returns the MP4 bytes directly.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-studio-pass, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-ai-space, x-ai-seconds',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SPACES = (Deno.env.get('VIDEO_SPACES') || 'zerogpu-aoti/wan2-2-fp8da-aoti-faster,r3gm/wan2-2-fp8da-aoti-preview').split(',');
const NEGATIVE = 'hands, fingers, arms, people, person, touching the product, product moving, product rotating, morphing, changing text, distorted label, garbled letters, warped logo, deformed packaging, extra objects, blurry, low quality, static frame, 手, 手指, 人, 文字变化, 变形';
const BASE_PROMPT = 'Professional product commercial. The product stays completely still and unchanged in the center; its label, logo and text remain sharp, readable and identical. Only the camera moves: a very slow smooth dolly-in. Soft studio light sweeps across the product, subtle glossy reflections, gentle floating light particles in the background. No hands, no people.';
const LTX_SPACES = (Deno.env.get('LTX_SPACES') || 'Lightricks/LTX-2-3').split(',');
const LTX_GUARD = ' The product, its label, logo and text stay identical and sharp; the product does not deform. No on-screen text, no subtitles, no dialogue, no speech. Photorealistic premium commercial, vertical 9:16.';
const host = (id: string) => `https://${id.replace(/[/_.]/g, '-').toLowerCase()}.hf.space/gradio_api`;

async function vaultSecret(name: string) {
  const url = Deno.env.get('SUPABASE_URL'), sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !sk) return null;
  const r = await fetch(`${url}/rest/v1/rpc/ad_studio_secret`, {
    method: 'POST',
    headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret_name: name }),
  });
  const v = r.ok ? await r.json() : null;
  return typeof v === 'string' && v ? v : null;
}

async function generate(space: string, token: string, img: Uint8Array, prompt: string, seconds: number, ltx = false) {
  const base = host(space);
  const auth = { Authorization: `Bearer ${token}` };
  // 1) upload image
  const fd = new FormData();
  fd.append('files', new Blob([img], { type: 'image/jpeg' }), 'product.jpg');
  const up = await fetch(`${base}/upload`, { method: 'POST', headers: auth, body: fd });
  if (!up.ok) throw new Error(`upload ${up.status}`);
  const [path] = await up.json();
  // 2) start job
  const call = await fetch(`${base}/call/generate_video`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    // LTX-2.3: [image, prompt, duration, enhance_prompt, seed, randomize_seed, height, width] · Wan: [image, prompt, steps, negative, seconds, guidance, guidance2, seed, randomize]
    body: JSON.stringify({ data: ltx
      ? [{ path, meta: { _type: 'gradio.FileData' } }, prompt, seconds, false, 42, true, 768, 512]
      : [{ path, meta: { _type: 'gradio.FileData' } }, prompt, 6, NEGATIVE, seconds, 1, 1, 42, true] }),
  });
  if (!call.ok) throw new Error(`call ${call.status}`);
  const { event_id } = await call.json();
  // 3) read the SSE result stream
  const res = await fetch(`${base}/call/generate_video/${event_id}`, { headers: auth });
  if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '', event = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (event === 'error') throw new Error(`ZeroGPU: ${data && data !== 'null' ? data : 'โควตาฟรีวันนี้อาจหมด หรือเซิร์ฟเวอร์ไม่ว่าง'}`);
        if (event === 'complete') {
          const out = JSON.parse(data);
          const f = out[0]?.video ?? out[0];
          const url = f?.url || (f?.path ? `${base}/file=${f.path}` : null);
          if (!url) throw new Error('no video in result');
          const v = await fetch(url, { headers: auth });
          if (!v.ok) throw new Error(`download ${v.status}`);
          return new Uint8Array(await v.arrayBuffer());
        }
      }
    }
  }
  throw new Error('stream ended without result');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'https://khalil203.github.io,http://localhost:4173,http://localhost:5173').split(',');
  const pass = Deno.env.get('STUDIO_PASS');
  if (!allowed.includes(origin) && !(pass && req.headers.get('x-studio-pass') === pass)) return json({ error: 'ไม่อนุญาต' }, 401);

  let body: { image?: string; prompt?: string; seconds?: number; ping?: boolean; engine?: 'ltx' | 'wan' | 'auto'; scene?: string };
  try { body = await req.json(); } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400); }
  const token = Deno.env.get('HF_TOKEN') || await vaultSecret('ad_studio_hf_token');
  if (body.ping) return json({ ok: true, hf: !!token, spaces: SPACES, ltx: LTX_SPACES });
  if (!token) return json({ error: 'ยังไม่ได้ตั้งค่า Hugging Face token' }, 503);
  if (!body.image) return json({ error: 'ไม่มีรูปภาพ' }, 400);
  const img = Uint8Array.from(atob(body.image), (c) => c.charCodeAt(0));
  const engine = body.engine || 'wan';
  const errors: string[] = [];
  const jobs: { space: string; ltx: boolean; prompt: string; seconds: number }[] = [];
  if (engine === 'ltx' || engine === 'auto') {
    const p = `${(body.scene || body.prompt || 'Slow cinematic dolly-in on the product, soft studio light sweep, gentle particles.').slice(0, 900)}${LTX_GUARD}`;
    for (const space of LTX_SPACES) jobs.push({ space, ltx: true, prompt: p, seconds: Math.min(6, Math.max(2, body.seconds ?? 5)) });
  }
  if (engine === 'wan' || engine === 'auto') {
    for (const space of SPACES) jobs.push({ space, ltx: false, prompt: `${BASE_PROMPT} ${(body.prompt || '').slice(0, 300)}`, seconds: Math.min(5, Math.max(2, body.seconds ?? 3.5)) });
  }
  const t0 = Date.now();
  for (const { space, ltx, prompt, seconds } of jobs) {
    if (Date.now() - t0 > 75_000) { errors.push(`${space}: ข้าม (ใกล้หมดเวลา)`); continue; }
    const t = Date.now();
    try {
      const mp4 = await generate(space, token, img, prompt, seconds, ltx);
      return new Response(mp4, { headers: { ...CORS, 'Content-Type': 'video/mp4', 'x-ai-space': space, 'x-ai-seconds': String(Math.round((Date.now() - t) / 1000)) } });
    } catch (e) {
      errors.push(`${space}: ${(e as Error).message}`.slice(0, 220));
    }
  }
  return json({ error: `สร้างวิดีโอ AI ไม่สำเร็จ — ${errors.join(' | ')}` }, 502);
});
