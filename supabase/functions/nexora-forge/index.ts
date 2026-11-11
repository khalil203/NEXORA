// NEXORA Prompt Forge — writes Stable Diffusion recipes for the Local Dream app
// (the images themselves are made offline on the phone, unlimited and free).
// Separate from nexora-ai so it can ship without touching the main AI server.
// Shares the same GROQ_API_KEY secret and the same daily limit (ai_usage table).
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? 300);
const MODELS = ["openai/gpt-oss-20b", "llama-3.1-8b-instant", "llama-3.3-70b-versatile", "openai/gpt-oss-120b"];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string, public code = "error") { super(msg); } }
const today = () => new Date().toISOString().slice(0, 10);
const clean = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

let modelCache: { at: number; ids: string[] } | null = null;
async function pickModel(): Promise<string> {
  if (!modelCache || Date.now() - modelCache.at > 3600e3) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${GROQ_KEY}` } });
      const j = await r.json();
      modelCache = { at: Date.now(), ids: (j.data ?? []).map((m: { id: string }) => m.id) };
    } catch { modelCache = { at: Date.now(), ids: [] }; }
  }
  return MODELS.find((m) => modelCache!.ids.includes(m)) ?? MODELS[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!GROQ_KEY) throw new HttpError(503, "AI is not set up yet.", "no_key");
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) throw new HttpError(401, "Sign in to use NEXORA AI", "auth");
    const db = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u, error } = await db.auth.getUser(auth.slice(7));
    if (error || !u?.user) throw new HttpError(401, "Your session expired. Sign in again.", "auth");
    const uid = u.user.id;
    const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const idea = String(body.idea ?? "").trim();
    if (!idea) throw new HttpError(400, "Describe your image first");
    if (idea.length > 600) throw new HttpError(400, "Idea is too long (max 600 characters)");
    const style = String(body.style ?? "Photoreal").slice(0, 200);
    const model = body.model === "SDXL" ? "SDXL" : "SD1.5";
    const size = model === "SDXL" ? 1024 : 512;

    const { data: usage } = await admin.from("ai_usage").select("requests").eq("user_id", uid).eq("day", today());
    const used = (usage ?? []).reduce((s, r) => s + (r.requests ?? 0), 0);
    if (used >= DAILY_LIMIT) throw new HttpError(429, `Daily AI limit reached (${DAILY_LIMIT} requests). It resets at midnight UTC.`, "limit");

    const llm = await pickModel();
    const sys = `You write prompts for Stable Diffusion ${model} running offline in the Local Dream Android app at ${size}x${size}.
The user's idea may be in Thai, Arabic, French or any language: translate it to English.
Rules for "prompt": English, comma-separated descriptive phrases; subject first, then setting, lighting, camera or medium, style, quality tags; under 70 words; no artist names, no real people's names, no brands or logos, nothing sexual involving minors.
"negative": comma-separated things to avoid for this subject, under 35 words.
"steps": integer ${model === "SDXL" ? "20-30" : "18-28"}. "cfg": number 6-8.
"note": one short practical tip in plain English for getting this image right on a phone.
Return only JSON: {"prompt": string, "negative": string, "steps": number, "cfg": number, "note": string}`;
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${GROQ_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: llm, temperature: 0.6, max_completion_tokens: 900, response_format: { type: "json_object" },
        ...(/gpt-oss/.test(llm) ? { reasoning_effort: "low" } : {}),
        messages: [{ role: "system", content: sys }, { role: "user", content: `Idea: ${idea}\nStyle: ${style}` }],
      }),
    });
    if (!r.ok) {
      if (r.status === 429) throw new HttpError(429, "The AI provider is busy. Try again in a minute.", "provider_busy");
      throw new HttpError(502, `AI provider error ${r.status}`, "provider_error");
    }
    const j = await r.json();
    const txt = String(j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) throw new HttpError(502, "The AI returned an unreadable answer.", "bad_output");
    const d = JSON.parse(m[0]);

    const { data: row } = await admin.from("ai_usage").select("*").eq("user_id", uid).eq("day", today()).eq("feature", "prompt").maybeSingle();
    await admin.from("ai_usage").upsert({
      user_id: uid, day: today(), feature: "prompt", requests: (row?.requests ?? 0) + 1,
      tokens_in: (row?.tokens_in ?? 0) + (j.usage?.prompt_tokens ?? 0), tokens_out: (row?.tokens_out ?? 0) + (j.usage?.completion_tokens ?? 0),
    });

    return json({ recipe: {
      prompt: clean(d.prompt, 700), negative: clean(d.negative, 400),
      steps: Math.min(40, Math.max(10, Math.round(Number(d.steps) || 20))), cfg: Math.min(10, Math.max(4, Number(d.cfg) || 7)),
      note: clean(d.note, 240), model: llm,
    } });
  } catch (e) {
    const he = e instanceof HttpError ? e : new HttpError(500, (e as Error).message || "Server error");
    console.error(he.code, he.message);
    return json({ error: he.message, code: he.code }, he.status);
  }
});
