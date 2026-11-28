// NEXORA Studio — AI images and videos through Muapi (the API behind Open Generative AI).
// The Muapi key lives only as the MUAPI_KEY Supabase secret; the app never sees it.
// Signed-in NEXORA users only. Only the models in MODELS can be called, so credits
// can't be spent on anything else.
//   POST { action: "submit", model, prompt, ratio }  -> { id }
//   POST { action: "status", id }                    -> { status: "working" | "done" | "failed", url?, error? }
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const MUAPI_KEY = Deno.env.get("MUAPI_KEY") ?? "";
const MUAPI = "https://api.muapi.ai/api/v1";

// Keep in sync with MODELS in web/src/screens/Studio.tsx
const MODELS = new Set([
  "bytedance-seedream-image",
  "gpt-image-2-text-to-image",
  "flux-3-text-to-image",
  "flux-3-text-to-video",
  "grok-imagine-video-1-5-text-to-video",
  "happy-horse-1.1-text-to-video-720p",
]);
const RATIOS = new Set(["9:16", "1:1", "16:9", "4:5"]);
const DONE = new Set(["completed", "succeeded", "success"]);
const FAIL = new Set(["failed", "error", "cancelled", "canceled"]);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string, public code = "error") { super(msg); } }

async function muapi(path: string, init: RequestInit = {}) {
  const r = await fetch(`${MUAPI}/${path}`, { ...init, headers: { "x-api-key": MUAPI_KEY, "content-type": "application/json" } });
  const j = await r.json().catch(() => ({})) as Record<string, any>;
  if (r.status === 401 || r.status === 403) throw new HttpError(503, "The Muapi key was refused. Set a new MUAPI_KEY secret.", "no_key");
  if (r.status === 402) throw new HttpError(402, "Muapi is out of credits. Top up at muapi.ai.", "credits");
  if (!r.ok) throw new HttpError(502, String(j.message ?? j.error ?? j.detail ?? `Muapi error ${r.status}`).slice(0, 200), "provider");
  return j;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!MUAPI_KEY) throw new HttpError(503, "Studio is not set up yet (MUAPI_KEY secret missing).", "no_key");
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) throw new HttpError(401, "Sign in to use Studio", "auth");
    const db = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u, error } = await db.auth.getUser(auth.slice(7));
    if (error || !u?.user) throw new HttpError(401, "Your session expired. Sign in again.", "auth");

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    if (body.action === "submit") {
      const model = String(body.model ?? "");
      if (!MODELS.has(model)) throw new HttpError(400, "That model isn't available in Studio");
      const prompt = String(body.prompt ?? "").replace(/\s+/g, " ").trim();
      if (!prompt) throw new HttpError(400, "Describe what to make first");
      if (prompt.length > 1500) throw new HttpError(400, "Prompt is too long (max 1500 characters)");
      const ratio = RATIOS.has(String(body.ratio)) ? String(body.ratio) : "9:16";
      const j = await muapi(model, { method: "POST", body: JSON.stringify({ prompt, aspect_ratio: ratio }) });
      const id = j.request_id ?? j.id;
      if (!id) throw new HttpError(502, "Muapi didn't return a job id", "provider");
      return json({ id });
    }

    if (body.action === "status") {
      const id = String(body.id ?? "");
      if (!/^[\w-]{6,80}$/.test(id)) throw new HttpError(400, "Bad job id");
      const j = await muapi(`predictions/${id}/result`);
      const s = String(j.status ?? "").toLowerCase();
      const url = j.outputs?.[0] ?? j.url ?? j.output?.url;
      if (DONE.has(s) && url) return json({ status: "done", url });
      if (FAIL.has(s)) return json({ status: "failed", error: String(j.error?.message ?? j.error ?? "Generation failed").slice(0, 200) });
      return json({ status: "working" });
    }

    throw new HttpError(400, "Unknown action");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
    console.error(e);
    return json({ error: "Studio server error", code: "error" }, 500);
  }
});
