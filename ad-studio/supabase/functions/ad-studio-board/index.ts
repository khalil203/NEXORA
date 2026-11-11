// AI AD STUDIO — storyboard brain (Gemini free tier).
//   plan  — product facts (+photo) → 6-panel Thai ad storyboard: scene prompts, Thai headlines, Thai voice-over.
//   scene — free text-to-image backdrop (Pollinations) proxied server-side.
//   split — an uploaded storyboard sheet (e.g. made in ChatGPT) → panel boxes in playback order + Thai voice-over per panel.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-studio-pass, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const GEM = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = (Deno.env.get('BOARD_MODELS') || 'gemini-flash-latest,gemini-3.5-flash,gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-2.5-flash-lite').split(',');

async function vault(name: string) {
  const url = Deno.env.get('SUPABASE_URL'), sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/rpc/ad_studio_secret`, { method: 'POST', headers: { apikey: sk!, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ secret_name: name }) });
  const x = r.ok ? await r.json() : null;
  return typeof x === 'string' && x ? x : null;
}

async function gemini(k: string, parts: unknown[], t0: number) {
  const errs: string[] = [];
  for (const model of MODELS) {
    if (Date.now() - t0 > 100_000) break;
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch(`${GEM}/models/${model}:generateContent`, {
        method: 'POST', signal: ctl.signal, headers: { 'x-goog-api-key': k, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } } }),
      });
      const d = await r.json().catch(() => ({}));
      const t = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('');
      if (r.ok && t) { try { return { data: JSON.parse(t), model }; } catch { errs.push(`${model}: bad json`); continue; } }
      errs.push(`${model}: ${String(d?.error?.message || r.status).slice(0, 100)}`);
    } catch (e) { errs.push(`${model}: ${(e as Error).message}`); } finally { clearTimeout(to); }
  }
  throw new Error(errs.join(' | '));
}

const HONEST = `STRICT HONESTY: use ONLY facts given in the product facts or clearly printed on the product label in the photo. Never invent benefits, numbers, test results, certifications, prices, discounts, medical or "100%/kills 99.9%" claims. If the label says "antibacterial", you may say it is an antibacterial product, nothing stronger. Sensory/lifestyle words about the scene are fine.`;

const PLAN = (n: number) => `You are a Thai advertising creative director making a storyboard for a vertical 9:16 brand-shoot video ad of the product below.
${HONEST}
Return JSON: {"hook": Thai hook line max 8 words, "cta": Thai call to action max 6 words, "caption": Thai social caption 2-3 short lines without hashtags, "hashtags": [4 Thai/English hashtags], "palette": [2 hex colors that match the product packaging],
"panels": [exactly ${n} panels in playback order]}.
Each panel: {"role": one of "hook","product","feature","benefit","closing", "product": true if the real product pack must be the star of this frame (ALWAYS true for role product and closing, false for hook and at least two others), "bg": English image prompt for a photorealistic premium advertising photo, vertical, bright and clean, matching the product colors. If product is true describe ONLY an empty set/backdrop with free space in the lower center (e.g. bathroom counter with water splash), never mention the product. If product is false describe the scene itself (e.g. close-up of hands washing with rich foam under a tap). Never ask for text, logos, brand names or packaging in the image. "motion": short English camera/motion direction for animating this still, "headline": Thai on-screen text, max 5 words, "voice": one natural spoken Thai voice-over sentence, max 16 words}.
Panel 1 is the hook (a relatable problem or question), panel 2 introduces the product by its real name, the middle panels each show ONE real feature from the label/facts, the last panel is the closing with the call to action.`;

const SPLIT = `This image is an advertising storyboard sheet for a short vertical video ad (it may contain a title banner and several scene panels, often numbered, with Thai text).
${HONEST} Use only what is written or shown in the storyboard.
Return JSON: {"product": product name as written, "brand": brand as written or "", "hook": Thai, "cta": Thai, "caption": Thai social caption 2-3 short lines without hashtags built only from the storyboard's own claims, "hashtags": [4 hashtags],
"panels": [the scene panels in playback order (numbered order if numbered). Do NOT include the big title/hero banner unless there are no other panels]}.
Each panel: {"box_2d": [ymin, xmin, ymax, xmax] of the whole panel normalized to 0-1000, tight on the panel edges, "title": the panel's label if any, "text": the Thai text shown in the panel, "motion": short English camera/motion direction for animating this still, "voice": one natural spoken Thai voice-over sentence (max 16 words) that says what this panel communicates}.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'https://khalil203.github.io,http://localhost:4173,http://localhost:5173').split(',');
  const pass = Deno.env.get('STUDIO_PASS');
  if (!allowed.includes(origin) && !(pass && req.headers.get('x-studio-pass') === pass)) return json({ error: 'ไม่อนุญาต' }, 401);
  let b: { action?: string; image?: string; mime?: string; product?: unknown; panels?: number; prompt?: string; seed?: number };
  try { b = await req.json(); } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400); }
  if (b.action === 'scene') {
    // free text-to-image backdrop (Pollinations) fetched server-side; no key, no GPU quota
    if (!b.prompt) return json({ error: 'ไม่มี prompt' }, 400);
    const u = `https://image.pollinations.ai/prompt/${encodeURIComponent(b.prompt.slice(0, 700))}?width=720&height=1280&nologo=true&seed=${Number(b.seed) || 1}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 50000);
      try {
        const r = await fetch(u, { signal: ctl.signal });
        if (r.ok && (r.headers.get('content-type') || '').startsWith('image')) return new Response(r.body, { headers: { ...CORS, 'Content-Type': r.headers.get('content-type')! } });
        await r.body?.cancel();
      } catch { /* retry */ } finally { clearTimeout(to); }
      await new Promise((res) => setTimeout(res, 3000));
    }
    return json({ error: 'ฉาก AI ฟรีไม่ว่าง' }, 502);
  }
  const k = Deno.env.get('GEMINI_API_KEY') || await vault('ad_studio_gemini_key');
  if (!k) return json({ error: 'ยังไม่ได้ตั้งค่า Gemini API key' }, 503);
  const t0 = Date.now();
  try {
    if (b.action === 'plan') {
      const n = Math.min(8, Math.max(4, b.panels ?? 6));
      const parts: unknown[] = [{ text: `${PLAN(n)}\n\nPRODUCT FACTS:\n${JSON.stringify(b.product ?? {}).slice(0, 3000)}` }];
      if (b.image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: b.image } });
      const r = await gemini(k, parts, t0);
      if (!Array.isArray(r.data?.panels) || r.data.panels.length < 3) throw new Error('no panels');
      return json({ plan: r.data, model: r.model });
    }
    if (b.action === 'split') {
      if (!b.image) return json({ error: 'ไม่มีรูปภาพ' }, 400);
      const r = await gemini(k, [{ text: SPLIT }, { inlineData: { mimeType: b.mime || 'image/jpeg', data: b.image } }], t0);
      if (!Array.isArray(r.data?.panels) || !r.data.panels.length) throw new Error('no panels');
      return json({ board: r.data, model: r.model });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: `AI สตอรี่บอร์ดไม่สำเร็จ — ${(e as Error).message.slice(0, 220)}` }, 502);
  }
});
