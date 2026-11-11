// AI AD STUDIO — product analysis proxy (Supabase Edge Function).
// Keeps API keys server-side. Identifies the product from photos, searches the web,
// and returns structured Thai product info with sources.
//
// Secrets:
//   STUDIO_PASS     — passcode the app must send (protects your free quota)
//   GEMINI_API_KEY  — preferred: Gemini vision + Google Search grounding (one call)
//   GROQ_API_KEY    — alternative: Groq vision + Groq compound web search

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-studio-pass, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const CATEGORIES = ['beauty', 'food', 'fashion', 'tech', 'health', 'home', 'luxury', 'general'];

const PROMPT = `คุณคือผู้เชี่ยวชาญวิเคราะห์สินค้าสำหรับทำโฆษณา ดูรูปสินค้าที่แนบมา
1) อ่านข้อความบนฉลาก/บรรจุภัณฑ์ทั้งหมดที่มองเห็น
2) ระบุชื่อสินค้าและแบรนด์ให้แม่นยำที่สุด
3) ค้นหาข้อมูลสินค้านี้ในอินเทอร์เน็ต (เว็บแบรนด์ ร้านค้าออนไลน์ที่น่าเชื่อถือ) เพื่อหาคุณสมบัติจริง
กฎสำคัญ: ห้ามแต่งข้อมูลเอง ใส่เฉพาะสิ่งที่เห็นบนฉลากหรือพบจากแหล่งข้อมูลจริง ห้ามใส่คำรับรอง/รีวิว/ส่วนลดที่ไม่มีหลักฐาน ถ้าไม่แน่ใจให้บอกใน notes
ตอบเป็น JSON อย่างเดียว (ไม่มีข้อความอื่น ไม่มี markdown) ตามรูปแบบนี้:
{"name":"ชื่อสินค้า","brand":"แบรนด์","category":"หนึ่งใน ${CATEGORIES.join('|')}","description":"คำอธิบายสั้น 1-2 ประโยคภาษาไทย","features":["คุณสมบัติจริงข้อละบรรทัด ภาษาไทย สูงสุด 6 ข้อ"],"audience":"กลุ่มลูกค้าเป้าหมายภาษาไทย","label_text":"ข้อความที่อ่านได้จากฉลาก","price_hint":"ช่วงราคาที่พบออนไลน์ถ้ามี (ไม่ใช่ราคาขายของผู้ใช้)","confidence":"high|medium|low","notes":"ข้อควรตรวจสอบภาษาไทย"}`;

// Keys can live in env secrets or in Supabase Vault (read via a service-role-only RPC).
const vaultCache = new Map<string, string | null>();
async function vaultSecret(name: string) {
  if (vaultCache.has(name)) return vaultCache.get(name)!;
  const url = Deno.env.get('SUPABASE_URL'), sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !sk) return null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/ad_studio_secret`, {
      method: 'POST',
      headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret_name: name }),
    });
    const v = r.ok ? await r.json() : null;
    const out = typeof v === 'string' && v ? v : null;
    vaultCache.set(name, out);
    return out;
  } catch { return null; }
}

function parseJson(text: string) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI ไม่ได้ส่งข้อมูลรูปแบบ JSON');
  return JSON.parse(m[0]);
}

async function gemini(key: string, images: { mime: string; data: string }[]) {
  // Fast path first (label reading, no search), then one search attempt if time allows.
  // Whole function must finish well inside the 150 s edge limit.
  const started = Date.now();
  const budget = 100_000;
  const tries: [string, boolean][] = [
    ['gemini-flash-latest', true],
    ['gemini-flash-lite-latest', false], ['gemini-3.5-flash', false], ['gemini-3.1-flash-lite', false], ['gemini-2.5-flash-lite', false],
  ];
  const errs: string[] = [];
  for (const [model, search] of tries) {
    const left = budget - (Date.now() - started);
    if (left < 8000) break;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } })), { text: search ? PROMPT : PROMPT + '\n(ไม่มีการค้นเว็บในครั้งนี้ ใช้เฉพาะข้อมูลจากรูป และบอกใน notes ว่าไม่ได้ค้นเว็บ)' }] }],
        ...(search ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 256 } },
      }),
      signal: AbortSignal.timeout(Math.min(search ? 30000 : 35000, left)),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: (e as Error).name === 'TimeoutError' ? 'timeout' : String(e) } }) }) as unknown as Response);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { errs.push(`${model}${search ? '+search' : ''}: ${String(body?.error?.message || r.status).slice(0, 70)}`); continue; }
    const cand = body.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
    const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
      .map((c: { web?: { uri: string; title: string } }) => c.web && { url: c.web.uri, title: c.web.title })
      .filter(Boolean).slice(0, 6);
    try { return { ...parseJson(text), sources, provider: `Gemini (${model})${search ? ' + Google Search' : ' — อ่านจากรูป'}` }; }
    catch (e) { errs.push(`${model}: ${(e as Error).message}`); }
  }
  throw new Error(errs.join(' || ') || 'timeout');
}

async function groq(key: string, images: { mime: string; data: string }[]) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  // step 1: vision — read label + identify
  const v = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers,
    body: JSON.stringify({
      model: Deno.env.get('GROQ_VISION_MODEL') || 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.2,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Read all visible label text and identify this product (name, brand, type). Answer briefly in English with the exact label text.' },
        ...images.slice(0, 3).map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } })),
      ] }],
    }),
  });
  const vb = await v.json();
  if (!v.ok) throw new Error(vb?.error?.message || `Groq vision error ${v.status}`);
  const seen = vb.choices?.[0]?.message?.content ?? '';
  // step 2: web search + structured Thai answer
  const s = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers,
    body: JSON.stringify({
      model: Deno.env.get('GROQ_SEARCH_MODEL') || 'groq/compound-mini',
      temperature: 0.2,
      messages: [{ role: 'user', content: `สิ่งที่อ่านได้จากรูปสินค้า:\n${seen}\n\n${PROMPT}\nเพิ่ม "sources":[{"title":"","url":""}] จากเว็บที่ค้นเจอ` }],
    }),
  });
  const sb = await s.json();
  if (!s.ok) throw new Error(sb?.error?.message || `Groq search error ${s.status}`);
  const out = parseJson(sb.choices?.[0]?.message?.content ?? '');
  return { ...out, sources: (out.sources ?? []).slice(0, 6), provider: 'Groq (Llama 4 vision + Compound web search)' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  // Access: requests from the owner's app origin are allowed without a passcode;
  // anything else needs STUDIO_PASS. (Free-tier keys only — worst case is quota use.)
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'https://khalil203.github.io,http://localhost:4173,http://localhost:5173').split(',');
  const pass = Deno.env.get('STUDIO_PASS');
  const passOk = !!pass && req.headers.get('x-studio-pass') === pass;
  if (!passOk && !allowed.includes(origin)) return json({ error: 'ไม่อนุญาต — ใช้ผ่านแอป AI AD STUDIO เท่านั้น' }, 401);

  let body: { images?: { mime: string; data: string }[]; ping?: boolean };
  try { body = await req.json(); } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400); }
  const gk = Deno.env.get('GEMINI_API_KEY') || await vaultSecret('ad_studio_gemini_key');
  const qk = Deno.env.get('GROQ_API_KEY') || await vaultSecret('ad_studio_groq_key');
  if (body.ping) return json({ ok: true, providers: { gemini: !!gk, groq: !!qk } });
  const images = (body.images ?? []).slice(0, 5).filter((i) => i?.data && /^image\//.test(i.mime));
  if (!images.length) return json({ error: 'ไม่มีรูปภาพ' }, 400);
  if (images.reduce((n, i) => n + i.data.length, 0) > 8_000_000) return json({ error: 'รูปใหญ่เกินไป' }, 413);
  if (!gk && !qk) return json({ error: 'ยังไม่ได้ตั้งค่า API key ของ AI บนเซิร์ฟเวอร์ (GEMINI_API_KEY หรือ GROQ_API_KEY)' }, 503);

  const errors: string[] = [];
  for (const [name, fn, key] of [['gemini', gemini, gk], ['groq', groq, qk]] as const) {
    if (!key) continue;
    try {
      const r = await fn(key, images);
      if (!CATEGORIES.includes(r.category)) r.category = 'general';
      if (!Array.isArray(r.features)) r.features = [];
      return json(r);
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  return json({ error: `AI วิเคราะห์ไม่สำเร็จ — ${errors.join(' | ')}` }, 502);
});
