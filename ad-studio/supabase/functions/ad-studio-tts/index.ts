// AI AD STUDIO — Thai voice-over via Gemini TTS (free tier key). Returns a WAV file.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-studio-pass, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-tts-model',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = (Deno.env.get('TTS_MODELS') || 'gemini-2.5-flash-preview-tts,gemini-3.1-flash-tts-preview,gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts').split(',');

async function vault(name: string) {
  const url = Deno.env.get('SUPABASE_URL'), sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/rpc/ad_studio_secret`, { method: 'POST', headers: { apikey: sk!, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ secret_name: name }) });
  const x = r.ok ? await r.json() : null;
  return typeof x === 'string' && x ? x : null;
}

function wav(pcm: Uint8Array, rate = 24000) {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt ');
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, rate, true);
  h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(h.buffer), 0); out.set(pcm, 44);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'https://khalil203.github.io,http://localhost:4173,http://localhost:5173').split(',');
  const pass = Deno.env.get('STUDIO_PASS');
  if (!allowed.includes(origin) && !(pass && req.headers.get('x-studio-pass') === pass)) return json({ error: 'ไม่อนุญาต' }, 401);
  // free key only — never the paid Veo key
  const k = Deno.env.get('GEMINI_API_KEY') || await vault('ad_studio_gemini_key');
  if (!k) return json({ error: 'ยังไม่ได้ตั้งค่า Gemini API key' }, 503);
  let b: { text?: string; voice?: string; style?: string };
  try { b = await req.json(); } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400); }
  const text = (b.text || '').trim().slice(0, 600);
  if (!text) return json({ error: 'ไม่มีข้อความ' }, 400);
  const style = b.style || 'พูดภาษาไทยด้วยน้ำเสียงผู้หญิงอบอุ่น สดใส มั่นใจ แบบโฆษณาสินค้า จังหวะเป็นธรรมชาติ';
  const errs: string[] = [];
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 40000);
      try {
        const r = await fetch(`${API}/models/${model}:generateContent`, {
          method: 'POST', signal: ctl.signal, headers: { 'x-goog-api-key': k, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${style}:\n${text}` }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: b.voice || 'Kore' } } } },
          }),
        });
        const d = await r.json().catch(() => ({}));
        const part = d?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData);
        if (r.ok && part) {
          const pcm = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
          const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1] || 24000);
          return new Response(wav(pcm, rate), { headers: { ...CORS, 'Content-Type': 'audio/wav', 'x-tts-model': model } });
        }
        errs.push(`${model}: ${String(d?.error?.message || r.status).slice(0, 120)}`);
        if (r.status !== 503 && r.status !== 500) break;
      } catch (e) { errs.push(`${model}: ${(e as Error).message}`); }
      finally { clearTimeout(to); }
      await new Promise((res) => setTimeout(res, 2000));
    }
  }
  return json({ error: `สร้างเสียงพากย์ไม่สำเร็จ — ${errs.join(' | ')}` }, 502);
});
