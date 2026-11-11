// AI AD STUDIO — "pro" tools:
//   action "plan": AI director writes a multi-shot commercial (Claude if a key is available, else Gemini).
//   action "edit": places the REAL product photo into a new realistic scene (Qwen-Image-Edit on HF ZeroGPU).
// Keys: env ANTHROPIC_API_KEY / GEMINI_API_KEY / HF_TOKEN, or Vault ad_studio_* secrets.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-studio-pass, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-ai-model',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function secret(env: string, vault: string) {
  const v = Deno.env.get(env);
  if (v) return v;
  const url = Deno.env.get('SUPABASE_URL'), sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !sk) return null;
  const r = await fetch(`${url}/rest/v1/rpc/ad_studio_secret`, {
    method: 'POST', headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret_name: vault }),
  });
  const x = r.ok ? await r.json() : null;
  return typeof x === 'string' && x ? x : null;
}

// ------------------------------------------------------------------ director
const DIRECTOR = (product: string, seconds: number, shots: number) => `You are an award-winning commercial director and Thai copywriter making a premium ${seconds}-second vertical (9:16) social ad for this product.
Product facts (verified; never invent claims, prices, discounts or certifications beyond these):
${product}

Design exactly ${shots} shots that mix a luxury studio look and realistic lifestyle scenes:
- shot 1 "hero": premium studio hero shot.
- middle shots: realistic lifestyle / in-use environments that fit the target customer (home, cafe, bathroom vanity, kitchen, desk, outdoor golden hour...), plus one macro detail shot.
- last shot "cta": clean elegant end frame with space for text.

For EACH shot write:
- "scene_prompt": English instruction for an image-editing model that keeps the EXACT same product (shape, colors, label, logo, text unchanged) and only changes the surroundings/lighting/camera angle. Photorealistic, commercial photography, 3:4 portrait framing, product clearly visible and in focus.
- "motion_prompt": English prompt for an image-to-video model: subtle, premium camera motion (slow dolly-in, gentle orbit, parallax, rack focus, light sweep, steam, water droplets, fabric movement...). The product itself must not deform; no hands unless natural for lifestyle; label stays sharp.
- "headline": short punchy Thai on-screen text (max 22 characters), natural Thai.
- "sub": optional short Thai supporting line (max 30 characters) or "".
STRICT HONESTY: headline/sub/caption may state product facts ONLY if they appear in the facts above. Do not claim texture, absorption, results, benefits, ingredients or effects that are not listed. When you need more copy, use emotional/lifestyle wording that makes no factual claim (e.g. "ช่วงเวลาดูแลตัวเอง", "เติมความมั่นใจให้วันใหม่" is NOT allowed if it implies an effect — prefer mood words like "ช่วงเวลาของคุณ", "เรียบง่ายแต่พิเศษ").
- "seconds": shot length (they must add up to ${seconds}).

Also return "hook" (Thai, first-2-second hook), "cta" (Thai call to action), "music" one of elegant|upbeat|soft|electronic|trendy|cinematic, "caption" (Thai social caption, 2-4 lines, honest) and "hashtags" (1-4 Thai/English hashtags).
Answer with JSON only: {"hook":"","cta":"","music":"","caption":"","hashtags":[],"shots":[{"type":"hero|lifestyle|macro|usage|cta","scene_prompt":"","motion_prompt":"","headline":"","sub":"","seconds":0}]}`;

const FLOW_DIRECTOR = (product: string, shots: number) => `You are an award-winning commercial director and Thai copywriter. Plan a premium vertical (9:16) social video ad that will be generated in Google Flow with Veo 3.1 (each clip is 8 seconds, with native audio).
Product facts (verified; never invent claims, results, ingredients, prices, discounts or certifications beyond these):
${product}

Plan exactly ${shots} clips: 1 "hero" studio shot, then realistic lifestyle / in-use clip(s) that fit the target customer, last one "cta" end shot.
For EACH clip return:
- "method": "frames" (animate the uploaded product photo as the first frame) or "ingredients" (use the product photo as a reference ingredient inside a new scene). Use "frames" for hero and cta.
- "image_prompt": English prompt to create a photorealistic first frame in Flow with the product photo as reference (keep the exact product, label and logo unchanged), 9:16 vertical. Use "" for frames clips.
- "veo_prompt": a complete, production-quality English Veo 3.1 prompt (80-140 words): subject (the exact product, label unchanged, not deforming), setting, lighting, lens/camera movement, mood, pacing, and an AUDIO section: background music style + ambient sound + a Thai voice-over. Write the Thai voice-over line inside the prompt like: A warm Thai female voice-over says in Thai: "<voice_th>". No on-screen text, no subtitles, no hands unless natural.
- "voice_th": the Thai voice-over line only (natural spoken Thai, max 60 characters, honest, fits 8 seconds).
- "headline": short Thai on-screen text (max 22 characters).
STRICT HONESTY: Thai copy may state facts ONLY from the facts above; otherwise use mood/lifestyle wording that makes no claim about effects or results.
Also return "hook" (Thai), "cta" (Thai), "caption" (Thai social caption 2-4 lines, honest), "hashtags" (exactly 4 relevant hashtags mixing Thai and English, include one brand/product tag).
Answer with JSON only: {"hook":"","cta":"","caption":"","hashtags":[],"shots":[{"type":"hero|lifestyle|usage|cta","method":"frames|ingredients","image_prompt":"","veo_prompt":"","voice_th":"","headline":""}]}`;

function parseJson(text: string) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI ไม่ได้ส่ง JSON');
  return JSON.parse(m[0]);
}

async function planClaude(key: string, prompt: string, img?: string) {
  const model = Deno.env.get('CLAUDE_MODEL') || 'claude-sonnet-5-5';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 3000,
      messages: [{ role: 'user', content: [...(img ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } }] : []), { type: 'text', text: prompt }] }],
    }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`Claude: ${b?.error?.message || r.status}`);
  return { plan: parseJson((b.content ?? []).map((c: { text?: string }) => c.text ?? '').join('')), model: `Claude (${model})` };
}

async function planGemini(key: string, prompt: string, img?: string) {
  const models = (Deno.env.get('PLAN_MODELS') || 'gemini-flash-lite-latest,gemini-3.5-flash,gemini-3.1-flash-lite,gemini-flash-latest,gemini-2.5-flash-lite,gemini-3.8-flash').split(',');
  const errs: string[] = [];
  for (const model of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [...(img ? [{ inline_data: { mime_type: 'image/jpeg', data: img } }] : []), { text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 512 } },
      }),
      signal: AbortSignal.timeout(45000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: (e as Error).name === 'TimeoutError' ? 'timeout 45s' : String(e) } }) }) as unknown as Response);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { errs.push(`${model}: ${String(b?.error?.message || r.status).slice(0, 80)}`); continue; }
    try { return { plan: parseJson((b.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')), model: `Gemini (${model})` }; }
    catch (e) { errs.push(`${model}: ${(e as Error).message}`); }
  }
  throw new Error(`Gemini: ${errs.join(' | ')}`);
}

// ------------------------------------------------------------------ image edit (HF ZeroGPU)
const EDIT_SPACES = (Deno.env.get('EDIT_SPACES') || 'linoyts/Qwen-Image-Edit-2511-Fast,multimodalart/Qwen-Image-Edit-Fast').split(',');
const host = (id: string) => `https://${id.replace(/[/_.]/g, '-').toLowerCase()}.hf.space/gradio_api`;

async function gradio(base: string, token: string, fn: string, data: unknown[]) {
  const auth = { Authorization: `Bearer ${token}` };
  const call = await fetch(`${base}/call/${fn}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
  if (!call.ok) throw new Error(`call ${call.status}`);
  const { event_id } = await call.json();
  const res = await fetch(`${base}/call/${fn}/${event_id}`, { headers: auth });
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
        const d = line.slice(5).trim();
        if (event === 'error') throw new Error(`ZeroGPU: ${d && d !== 'null' ? d : 'โควตาฟรีวันนี้อาจหมด หรือเซิร์ฟเวอร์ไม่ว่าง'}`);
        if (event === 'complete') return JSON.parse(d);
      }
    }
  }
  throw new Error('stream ended');
}

async function upload(base: string, token: string, img: Uint8Array) {
  const fd = new FormData();
  fd.append('files', new Blob([img], { type: 'image/jpeg' }), 'product.jpg');
  const up = await fetch(`${base}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  if (!up.ok) throw new Error(`upload ${up.status}`);
  return (await up.json())[0] as string;
}

async function editImage(token: string, img: Uint8Array, prompt: string) {
  const errs: string[] = [];
  for (const space of EDIT_SPACES) {
    const base = host(space);
    try {
      const path = await upload(base, token, img);
      const file = { path, meta: { _type: 'gradio.FileData' } };
      const out = space.startsWith('multimodalart/')
        ? await gradio(base, token, 'infer', [file, prompt, 0, true, 1, 8, false])
        : await gradio(base, token, 'infer', [[{ image: file, caption: null }], prompt, 0, true, 1, 4, 1024, 768, false]);
      const first = Array.isArray(out[0]) ? out[0][0] : out[0];
      const f = first?.image ?? first;
      const url = f?.url || (f?.path ? `${base}/file=${f.path}` : null);
      if (!url) throw new Error('no image');
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`download ${r.status}`);
      return { bytes: new Uint8Array(await r.arrayBuffer()), type: r.headers.get('content-type') || 'image/webp', space };
    } catch (e) { errs.push(`${space}: ${(e as Error).message}`.slice(0, 200)); }
  }
  throw new Error(errs.join(' | '));
}

// ------------------------------------------------------------------ server
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'https://khalil203.github.io,http://localhost:4173,http://localhost:5173').split(',');
  const pass = Deno.env.get('STUDIO_PASS');
  if (!allowed.includes(origin) && !(pass && req.headers.get('x-studio-pass') === pass)) return json({ error: 'ไม่อนุญาต' }, 401);

  let body: { action?: string; image?: string; product?: string; seconds?: number; shots?: number; prompt?: string; useClaude?: boolean; mode?: string };
  try { body = await req.json(); } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400); }

  if (body.action === 'ping') {
    const [c, g, h] = await Promise.all([secret('ANTHROPIC_API_KEY', 'ad_studio_anthropic_key'), secret('GEMINI_API_KEY', 'ad_studio_gemini_key'), secret('HF_TOKEN', 'ad_studio_hf_token')]);
    return json({ ok: true, claude: !!c, gemini: !!g, hf: !!h });
  }

  if (body.action === 'plan') {
    const seconds = Math.min(60, Math.max(10, body.seconds ?? 15));
    const shots = Math.min(6, Math.max(3, body.shots ?? 4));
    const prompt = body.mode === 'flow' ? FLOW_DIRECTOR(body.product || '', shots) : DIRECTOR(body.product || '', seconds, shots);
    const errs: string[] = [];
    if (body.useClaude !== false) {
      const ck = await secret('ANTHROPIC_API_KEY', 'ad_studio_anthropic_key');
      if (ck) { try { return json(await planClaude(ck, prompt, body.image)); } catch (e) { errs.push((e as Error).message); } }
    }
    const gk = await secret('GEMINI_API_KEY', 'ad_studio_gemini_key');
    if (gk) { try { const r = await planGemini(gk, prompt, body.image); return json({ ...r, fallback: errs[0] }); } catch (e) { errs.push((e as Error).message); } }
    return json({ error: `AI ผู้กำกับไม่สำเร็จ — ${errs.join(' | ') || 'ไม่มีคีย์ AI'}` }, 502);
  }

  if (body.action === 'edit') {
    const token = await secret('HF_TOKEN', 'ad_studio_hf_token');
    if (!token) return json({ error: 'ยังไม่ได้ตั้งค่า Hugging Face token' }, 503);
    if (!body.image || !body.prompt) return json({ error: 'ต้องมีรูปและ prompt' }, 400);
    const img = Uint8Array.from(atob(body.image), (c) => c.charCodeAt(0));
    const keep = ' Keep the exact same product: identical shape, colors, label, logo and printed text, unchanged and sharp. Photorealistic commercial photography.';
    try {
      const r = await editImage(token, img, body.prompt.slice(0, 700) + keep);
      return new Response(r.bytes, { headers: { ...CORS, 'Content-Type': r.type, 'x-ai-model': r.space } });
    } catch (e) { return json({ error: `แก้ภาพด้วย AI ไม่สำเร็จ — ${(e as Error).message}` }, 502); }
  }
  return json({ error: 'unknown action' }, 400);
});
