// AI AD STUDIO — Veo 3.1 (Gemini API) image-to-video, fully automatic. PAID: requires billing on the Gemini key.
// actions: status (discover Veo models) · start (begin a generation) · poll (check; returns MP4 bytes when done)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-studio-pass, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-veo-model',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const API = 'https://generativelanguage.googleapis.com/v1beta';

async function vault(name: string) {
  const url = Deno.env.get('SUPABASE_URL'), sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/rpc/ad_studio_secret`, { method: 'POST', headers: { apikey: sk!, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ secret_name: name }) });
  const x = r.ok ? await r.json() : null;
  return typeof x === 'string' && x ? x : null;
}
// paid Veo key is kept separate so free-tier analysis/scripts never bill the paid project
async function key() {
  return Deno.env.get('VEO_API_KEY') || await vault('ad_studio_veo_key') || Deno.env.get('GEMINI_API_KEY') || await vault('ad_studio_gemini_key');
}

async function veoModels(k: string) {
  const out: string[] = [];
  let token = '';
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`${API}/models?pageSize=100${token ? `&pageToken=${token}` : ''}`, { headers: { 'x-goog-api-key': k } });
    const d = await r.json();
    for (const m of d.models ?? []) if (/veo/i.test(m.name) && (m.supportedGenerationMethods ?? []).includes('predictLongRunning')) out.push(m.name.replace('models/', ''));
    token = d.nextPageToken;
    if (!token) break;
  }
  // cheapest first: lite → fast → standard
  const rank = (n: string) => (/lite/.test(n) ? 0 : /fast/.test(n) ? 1 : 2) + (/3\.1/.test(n) ? 0 : 0.5);
  return out.sort((a, b) => rank(a) - rank(b));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'https://khalil203.github.io,http://localhost:4173,http://localhost:5173').split(',');
  const pass = Deno.env.get('STUDIO_PASS');
  if (!allowed.includes(origin) && !(pass && req.headers.get('x-studio-pass') === pass)) return json({ error: 'ไม่อนุญาต' }, 401);
  const k = await key();
  if (!k) return json({ error: 'ยังไม่ได้ตั้งค่า Gemini API key' }, 503);
  let b: { action?: string; image?: string; prompt?: string; model?: string; op?: string; seconds?: number };
  try { b = await req.json(); } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400); }

  if (b.action === 'status') {
    const models = await veoModels(k);
    if (!models.length) {
      // probe with an empty request (cannot generate anything, never billed) to see why Veo is unavailable
      const probe: string[] = [];
      for (const m of ['veo-3.1-lite-generate-preview', 'veo-3.1-fast-generate-preview']) {
        const r = await fetch(`${API}/models/${m}:predictLongRunning`, { method: 'POST', headers: { 'x-goog-api-key': k, 'Content-Type': 'application/json' }, body: JSON.stringify({ instances: [] }) });
        const d = await r.json().catch(() => ({}));
        probe.push(`${m}: ${r.status} ${String(d?.error?.message || '').slice(0, 200)}`);
      }
      return json({ ok: true, models, ready: false, probe, hint: 'คีย์นี้ยังใช้ Veo ไม่ได้ — ต้องเปิด Billing (Paid tier) ใน Google AI Studio' });
    }
    return json({ ok: true, models, ready: models.length > 0, hint: models.length ? undefined : 'คีย์นี้ยังใช้ Veo ไม่ได้ — ต้องเปิด Billing (Paid tier) ใน Google AI Studio' });
  }

  if (b.action === 'start') {
    if (!b.prompt) return json({ error: 'ไม่มี prompt' }, 400);
    const models = b.model ? [b.model] : await veoModels(k);
    if (!models.length) return json({ error: 'Veo ใช้ไม่ได้กับคีย์นี้ — ต้องเปิด Billing (Paid tier) ใน Google AI Studio ก่อน', code: 'NO_BILLING' }, 402);
    const errs: string[] = [];
    for (const model of models) {
      const instance: Record<string, unknown> = { prompt: b.prompt.slice(0, 2000) };
      if (b.image) instance.image = { bytesBase64Encoded: b.image, mimeType: 'image/jpeg' };
      const r = await fetch(`${API}/models/${model}:predictLongRunning`, {
        method: 'POST', headers: { 'x-goog-api-key': k, 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [instance], parameters: { aspectRatio: '9:16', durationSeconds: b.seconds ?? 8, resolution: '720p', personGeneration: 'allow_adult' } }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.name) return json({ op: d.name, model });
      errs.push(`${model}: ${String(d?.error?.message || r.status).slice(0, 160)}`);
    }
    const billing = errs.some((e) => /billing|quota|paid|429|403/i.test(e));
    return json({ error: `Veo เริ่มสร้างไม่สำเร็จ — ${errs.join(' | ')}`, code: billing ? 'NO_BILLING' : 'FAILED' }, 502);
  }

  if (b.action === 'poll') {
    if (!b.op || !/^models\/[\w.-]+\/operations\/[\w-]+$/.test(b.op)) return json({ error: 'op ไม่ถูกต้อง' }, 400);
    const r = await fetch(`${API}/${b.op}`, { headers: { 'x-goog-api-key': k } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: d?.error?.message || `poll ${r.status}` }, 502);
    if (!d.done) return json({ done: false });
    if (d.error) return json({ error: `Veo: ${d.error.message}` }, 502);
    const sample = d.response?.generateVideoResponse?.generatedSamples?.[0];
    const filtered = d.response?.generateVideoResponse?.raiMediaFilteredReasons;
    if (!sample?.video?.uri) return json({ error: `Veo ไม่ได้ส่งวิดีโอกลับมา${filtered ? ` (ถูกกรอง: ${JSON.stringify(filtered).slice(0, 160)})` : ''}` }, 502);
    const v = await fetch(sample.video.uri, { headers: { 'x-goog-api-key': k }, redirect: 'follow' });
    if (!v.ok) return json({ error: `ดาวน์โหลดวิดีโอไม่สำเร็จ ${v.status}` }, 502);
    return new Response(v.body, { headers: { ...CORS, 'Content-Type': 'video/mp4' } });
  }
  return json({ error: 'unknown action' }, 400);
});
