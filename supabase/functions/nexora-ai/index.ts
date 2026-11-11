// NEXORA AI orchestrator — one entry point, specialised agents per action.
// Every database read/write runs with the caller's JWT, so row-level security applies.
// Only usage counters use the service role (users can read but not edit their own usage).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

declare const Supabase: { ai: { Session: new (m: string) => { run: (t: string, o: Record<string, unknown>) => Promise<number[]> } } };

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? 300);
const MODEL_PREF = (Deno.env.get("GROQ_MODELS") ??
  "openai/gpt-oss-120b,moonshotai/kimi-k2-instruct-0905,llama-3.3-70b-versatile,qwen/qwen3-32b,openai/gpt-oss-20b,llama-3.1-8b-instant").split(",").map((s) => s.trim());
const FAST_PREF = ["openai/gpt-oss-20b", "llama-3.1-8b-instant", ...MODEL_PREF];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string, public code = "error") { super(msg); } }

// ---------------- providers ----------------
const embedder = new Supabase.ai.Session("gte-small");
async function embed(text: string): Promise<number[]> {
  return await embedder.run(text.slice(0, 2000), { mean_pool: true, normalize: true });
}
const vec = (v: number[] | null) => (v ? `[${v.join(",")}]` : null);

let modelCache: { at: number; ids: string[] } | null = null;
async function pickModel(fast = false): Promise<string> {
  if (!GROQ_KEY) throw new HttpError(503, "AI is not set up yet. Add the GROQ_API_KEY secret to the nexora-ai function.", "no_key");
  if (!modelCache || Date.now() - modelCache.at > 3600e3) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${GROQ_KEY}` } });
      const j = await r.json();
      modelCache = { at: Date.now(), ids: (j.data ?? []).map((m: { id: string }) => m.id) };
    } catch { modelCache = { at: Date.now(), ids: [] }; }
  }
  const pref = fast ? FAST_PREF : MODEL_PREF;
  return pref.find((m) => modelCache!.ids.includes(m)) ?? pref[0];
}
function modelOpts(m: string): Record<string, unknown> {
  if (/gpt-oss/.test(m)) return { reasoning_effort: "low" };
  if (/qwen3/.test(m)) return { reasoning_effort: "none" };
  return {};
}
type Msg = { role: "system" | "user" | "assistant"; content: string };
async function groq(body: Record<string, unknown>) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { authorization: `Bearer ${GROQ_KEY}`, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 429) throw new HttpError(429, "The AI provider is busy (rate limit). Try again in a minute.", "provider_busy");
    throw new HttpError(502, `AI provider error ${r.status}: ${t.slice(0, 200)}`, "provider_error");
  }
  return r;
}
async function completeJSON(messages: Msg[], fast = false): Promise<{ data: Record<string, any>; model: string; usage: { prompt_tokens?: number; completion_tokens?: number } }> {
  const model = await pickModel(fast);
  const base = { model, messages, temperature: 0.2, max_completion_tokens: 2000, ...modelOpts(model) };
  let r: Response;
  try { r = await groq({ ...base, response_format: { type: "json_object" } }); }
  catch (e) { if (e instanceof HttpError && e.code === "provider_error") r = await groq(base); else throw e; }
  const j = await r.json();
  const txt: string = (j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new HttpError(502, "The AI returned an unreadable answer.", "bad_output");
  return { data: JSON.parse(m[0]), model, usage: j.usage ?? {} };
}

// ---------------- usage & audit ----------------
async function checkLimit(admin: SupabaseClient, uid: string) {
  const { data } = await admin.from("ai_usage").select("requests").eq("user_id", uid).eq("day", today());
  const used = (data ?? []).reduce((s, r) => s + (r.requests ?? 0), 0);
  if (used >= DAILY_LIMIT) throw new HttpError(429, `Daily AI limit reached (${DAILY_LIMIT} requests). It resets at midnight UTC.`, "limit");
}
async function track(admin: SupabaseClient, uid: string, feature: string, u: { prompt_tokens?: number; completion_tokens?: number } = {}) {
  const day = today();
  const { data } = await admin.from("ai_usage").select("*").eq("user_id", uid).eq("day", day).eq("feature", feature).maybeSingle();
  await admin.from("ai_usage").upsert({
    user_id: uid, day, feature, requests: (data?.requests ?? 0) + 1,
    tokens_in: (data?.tokens_in ?? 0) + (u.prompt_tokens ?? 0), tokens_out: (data?.tokens_out ?? 0) + (u.completion_tokens ?? 0),
  });
}
const today = () => new Date().toISOString().slice(0, 10);
async function audit(db: SupabaseClient, uid: string, action: string, target_type: string | null, target_id: string | null, details: Record<string, unknown>) {
  await db.from("audit_logs").insert({ user_id: uid, actor: "ai", action, target_type, target_id, details });
}

// ---------------- helpers ----------------
type Note = { id: string; title?: string; body?: string; type?: string; para?: string; due?: string; done?: boolean; updated?: number; created?: number };
function noteText(n: Note): string {
  const meta = [n.type, n.para, n.due ? `due ${n.due}` : "", n.type === "task" ? (n.done ? "done" : "open") : ""].filter(Boolean).join(", ");
  return `${n.title ?? ""}\n[${meta}]\n${n.body ?? ""}`.trim();
}
function chunk(text: string, size = 900, max = 8): string[] {
  const out: string[] = []; let cur = "";
  for (const p of text.split(/\n{2,}/)) {
    if ((cur + "\n\n" + p).length > size && cur) { out.push(cur); cur = ""; }
    if (p.length > size) { for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size)); }
    else cur = cur ? cur + "\n\n" + p : p;
    if (out.length >= max) break;
  }
  if (cur && out.length < max) out.push(cur);
  return out.length ? out : [text.slice(0, size)];
}
async function sha(s: string) {
  const h = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const STOP = new Set("a an the and or but of to in on at for with about from by is are was were be been am do does did i me my we our you your it this that what which who whom when where why how can could should would will shall have has had any all some tell show find give list please there their them they".split(" "));
function keywordQuery(q: string): string {
  const words = q.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, 12).join(" or ");
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

// ---------------- agents ----------------
// Knowledge indexing: chunk + embed notes that changed (queue filled by a DB trigger).
async function indexQueue(db: SupabaseClient, uid: string, limit = 25) {
  const { data: q } = await db.from("index_queue").select("source_type,source_id").eq("source_type", "note").order("queued_at").limit(limit);
  if (!q?.length) return { indexed: 0, remaining: 0 };
  const ids = q.map((r) => r.source_id);
  const { data: rows } = await db.from("notes").select("id,data,updated,deleted").in("id", ids);
  let indexed = 0;
  for (const row of rows ?? []) {
    await db.from("knowledge_chunks").delete().eq("source_type", "note").eq("source_id", row.id);
    if (!row.deleted) {
      const n = { ...(row.data as Note), id: row.id };
      const text = noteText(n);
      if (text.length > 2) {
        const parts = chunk(text);
        const recs = [];
        for (let i = 0; i < parts.length; i++) {
          recs.push({ user_id: uid, source_type: "note", source_id: row.id, chunk_index: i, title: n.title ?? "", content: parts[i], content_hash: await sha(parts[i]), embedding: vec(await embed(`${n.title ?? ""}\n${parts[i]}`)), source_updated: row.updated });
        }
        await db.from("knowledge_chunks").insert(recs);
        indexed++;
      }
    }
  }
  await db.from("index_queue").delete().eq("source_type", "note").in("source_id", ids);
  const { count } = await db.from("index_queue").select("*", { count: "exact", head: true });
  return { indexed, remaining: count ?? 0 };
}

async function embedMemories(db: SupabaseClient) {
  const { data } = await db.from("memories").select("id,content").is("embedding", null).is("deleted_at", null).limit(50);
  for (const m of data ?? []) await db.from("memories").update({ embedding: vec(await embed(m.content)) }).eq("id", m.id);
  return { embedded: data?.length ?? 0 };
}

type Source = { n: number; type: "note" | "memory" | "message"; id: string; title: string; excerpt: string; status?: string };
async function retrieve(db: SupabaseClient, query: string, qv: number[], limit = 10): Promise<Source[]> {
  const [{ data: hits }, { data: mems }] = await Promise.all([
    db.rpc("nexora_search", { q: keywordQuery(query), q_embedding: vec(qv), n: limit + 6 }),
    db.rpc("nexora_match_memories", { q_embedding: vec(qv), n: 8, min_sim: 0.3 }),
  ]);
  const out: Source[] = []; const seen = new Map<string, Source>();
  for (const m of mems ?? []) {
    const s: Source = { n: 0, type: "memory", id: m.id, title: `${m.category} memory`, excerpt: m.content, status: m.status };
    out.push(s);
  }
  for (const h of hits ?? []) {
    const key = h.source_type + ":" + h.source_id;
    const prev = seen.get(key);
    if (prev) { if (prev.excerpt.length < 1600) prev.excerpt += "\n…\n" + h.content; continue; }
    const s: Source = { n: 0, type: h.source_type, id: h.source_id, title: h.title || (h.source_type === "message" ? "Earlier conversation" : "Untitled"), excerpt: h.content };
    seen.set(key, s); out.push(s);
    if (seen.size >= limit) break;
  }
  out.forEach((s, i) => (s.n = i + 1));
  return out;
}

async function liveContext(db: SupabaseClient) {
  const [{ data: tasks }, { data: recent }, { count: inbox }, { data: profile }] = await Promise.all([
    db.from("notes").select("id,data").eq("deleted", false).eq("data->>type", "task").or("data->>done.is.null,data->>done.eq.false").limit(40),
    db.from("notes").select("id,data,updated").eq("deleted", false).order("updated", { ascending: false }).limit(8),
    db.from("inbox_items").select("*", { count: "exact", head: true }).in("status", ["received", "needs_review", "failed"]),
    db.from("profiles").select("display_name,timezone").maybeSingle(),
  ]);
  const t = (tasks ?? []).map((r) => ({ id: r.id, ...(r.data as Note) }))
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 15);
  return { tasks: t, recent: (recent ?? []).map((r) => ({ id: r.id, ...(r.data as Note) })), inbox: inbox ?? 0, profile };
}

function chatSystem(ctx: Awaited<ReturnType<typeof liveContext>>, sources: Source[], tz: string) {
  const now = new Date().toLocaleString("en-GB", { timeZone: tz, dateStyle: "full", timeStyle: "short" });
  const src = sources.map((s) => `[${s.n}] (${s.type}${s.status ? ", " + s.status : ""}) ${s.title}\n${clip(s.excerpt, 1400)}`).join("\n\n");
  const tasks = ctx.tasks.map((t) => `- ${t.title || "Untitled"}${t.due ? ` (due ${t.due})` : ""} {note:${t.id}}`).join("\n") || "(none)";
  return `You are NEXORA, the user's personal AI operating system and second brain. Tagline: "Your Mind. Amplified."
Now: ${now} (${tz}). User: ${ctx.profile?.display_name || "the user"}.

RULES
- Answer personal questions ONLY from the SOURCES and OPEN TASKS below. They come from the user's own database.
- Cite every fact you take from a source with its number in square brackets, like [2]. Never cite a number that is not listed.
- If the sources don't contain the answer, say plainly that you don't have it stored yet, and suggest capturing it. Never invent memories, decisions, dates, people or events.
- Memories marked "suggested" are unconfirmed: say so if you rely on them. Prefer "confirmed" ones and newer information.
- General knowledge questions (not about the user) may be answered normally, without citations.
- Be concise, warm and practical. Use short paragraphs or bullets. End with one useful next step when it helps.
- Reply in the language the user writes in (English, Thai, French or Arabic).
- If the user asks you to do something you cannot do from chat (send email, buy, delete), explain that it needs their approval in the app.

OPEN TASKS (${ctx.tasks.length}):
${tasks}
Items waiting in the inbox: ${ctx.inbox}

SOURCES:
${src || "(no stored information matched this question)"}`;
}

// ---------------- actions ----------------
async function actChat(req: Body, db: SupabaseClient, admin: SupabaseClient, uid: string): Promise<Response> {
  const message = String(req.message ?? "").trim();
  if (!message) throw new HttpError(400, "Empty message");
  if (message.length > 8000) throw new HttpError(400, "Message is too long");
  await checkLimit(admin, uid);
  const model = await pickModel();

  let convId = req.conversation_id as string | undefined;
  if (convId) {
    const { data } = await db.from("conversations").select("id").eq("id", convId).maybeSingle();
    if (!data) convId = undefined;
  }
  if (!convId) {
    const { data, error } = await db.from("conversations").insert({ user_id: uid, title: clip(message.replace(/\s+/g, " "), 60) }).select("id").single();
    if (error) throw new HttpError(500, error.message);
    convId = data.id;
  }
  const { data: history } = await db.from("messages").select("role,content").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(12);
  const { data: userMsg } = await db.from("messages").insert({ conversation_id: convId, user_id: uid, role: "user", content: message }).select("id").single();

  await indexQueue(db, uid, 15).catch(() => null);
  const qv = await embed(message);
  if (userMsg) await db.from("knowledge_chunks").insert({ user_id: uid, source_type: "message", source_id: userMsg.id, title: "You said (chat)", content: message, content_hash: await sha(message), embedding: vec(qv) });
  const [sources, ctx] = await Promise.all([retrieve(db, message, qv), liveContext(db)]);
  const sourcesClean = sources.filter((s) => !(s.type === "message" && s.id === userMsg?.id));
  sourcesClean.forEach((s, i) => (s.n = i + 1));
  const tz = (req.timezone as string) || ctx.profile?.timezone || "Asia/Bangkok";

  const msgs: Msg[] = [{ role: "system", content: chatSystem(ctx, sourcesClean, tz) }, ...((history ?? []).reverse() as Msg[]), { role: "user", content: message }];
  const upstream = await groq({ model, messages: msgs, stream: true, temperature: 0.4, max_completion_tokens: 1800, stream_options: { include_usage: true }, ...modelOpts(model) });

  const enc = new TextEncoder();
  const send = (c: ReadableStreamDefaultController, o: unknown) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
  const stream = new ReadableStream({
    async start(c) {
      send(c, { type: "meta", conversation_id: convId, model, sources: sourcesClean.map((s) => ({ ...s, excerpt: clip(s.excerpt, 300) })) });
      let full = ""; let usage: Record<string, number> = {}; let buf = "";
      const reader = upstream.body!.getReader(); const dec = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const d = line.slice(6).trim(); if (d === "[DONE]") continue;
            try {
              const j = JSON.parse(d);
              const delta = j.choices?.[0]?.delta?.content;
              if (delta) { full += delta; send(c, { type: "delta", text: delta }); }
              if (j.usage || j.x_groq?.usage) usage = j.usage ?? j.x_groq.usage;
            } catch { /* partial line */ }
          }
        }
        full = full.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        const used = new Set([...full.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])));
        const cites = sourcesClean.filter((s) => used.has(s.n)).map((s) => ({ n: s.n, type: s.type, id: s.id, title: s.title, excerpt: clip(s.excerpt, 300), status: s.status }));
        const { data: saved } = await db.from("messages").insert({ conversation_id: convId, user_id: uid, role: "assistant", content: full, citations: cites, model, tokens_in: usage.prompt_tokens, tokens_out: usage.completion_tokens }).select("id").single();
        await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
        await track(admin, uid, "chat", usage);
        send(c, { type: "done", message_id: saved?.id, citations: cites });
      } catch (e) {
        send(c, { type: "error", error: (e as Error).message });
      } finally { c.close(); }
    },
  });
  return new Response(stream, { headers: { ...CORS, "content-type": "text/event-stream", "cache-control": "no-cache" } });
}

const PROCESS_PROMPT = `You are NEXORA's capture processor. Read ONE captured item from the user's inbox and return a JSON object that organises it.
Only extract what the item actually says. Never invent people, dates, tasks or facts. Dates must be absolute (YYYY-MM-DD) using TODAY to resolve words like "tomorrow".

Return exactly this shape:
{
 "title": "short clear title (keep the user's language)",
 "summary": "1-2 sentence summary",
 "type": "note|task|idea|link|person|journal",
 "para": "projects|areas|resources|archive|inbox",   // PARA: projects = active goal with an end; areas = ongoing responsibility; resources = reference/learning; archive = finished; inbox = unclear
 "tags": ["lowercase-tags", "max 5"],
 "people": ["names mentioned"],
 "projects": ["project or business names mentioned"],
 "dates": [{"date":"YYYY-MM-DD","what":"..."}],
 "tasks": [{"title":"actionable task","due":"YYYY-MM-DD or null"}],
 "decisions": ["decisions the user states they made"],
 "memories": [{"content":"durable fact about the user or their world, as a standalone sentence","kind":"fact|preference|temporary|assumption","category":"personal|preference|work|business|project|person|goal|skill|decision|commitment","importance":1-5,"confidence":0-1,"conflicts_with":null or index of EXISTING MEMORY it contradicts}],
 "related": [indexes of RELATED NOTES that are truly about the same subject],
 "needs_review": true|false,
 "review_reason": "why the user should check (contradiction, unclear, sensitive) or empty"
}
Memories: only durable information worth remembering for months (goals, preferences, relationships, business facts, commitments, decisions). Skip trivia. Max 5. Do not store passwords, ID numbers or bank details. Set needs_review true when a memory conflicts with an existing one.`;

async function actProcess(req: Body, db: SupabaseClient, admin: SupabaseClient, uid: string) {
  const noteId = String(req.note_id ?? "");
  if (!noteId) throw new HttpError(400, "note_id is required");
  const { data: row } = await db.from("notes").select("id,data,deleted").eq("id", noteId).maybeSingle();
  if (!row || row.deleted) throw new HttpError(404, "This item hasn't reached the cloud yet. Sync and try again.", "not_synced");
  const { data: prefs } = await db.from("user_preferences").select("*").maybeSingle();
  const { data: prev } = await db.from("inbox_items").select("attempts,source").eq("note_id", noteId).maybeSingle();
  await db.from("inbox_items").upsert({ note_id: noteId, user_id: uid, status: "processing", source: (req.source as string) || prev?.source || "text", attempts: (prev?.attempts ?? 0) + 1, error: null });
  try {
    await checkLimit(admin, uid);
    const n = { ...(row.data as Note), id: noteId };
    const text = noteText(n);
    const extra = typeof req.extra_text === "string" ? `\n\nTEXT FROM ATTACHMENTS:\n${clip(req.extra_text, 6000)}` : "";
    const qv = await embed(text + extra);
    const [{ data: hits }, { data: mems }] = await Promise.all([
      db.rpc("nexora_search", { q: "", q_embedding: vec(qv), n: 8 }),
      db.rpc("nexora_match_memories", { q_embedding: vec(qv), n: 6, min_sim: 0.35 }),
    ]);
    const related = (hits ?? []).filter((h: any) => h.source_type === "note" && h.source_id !== noteId)
      .filter((h: any, i: number, a: any[]) => a.findIndex((x) => x.source_id === h.source_id) === i).slice(0, 5);
    const tz = (req.timezone as string) || "Asia/Bangkok";
    const todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    const user = `TODAY: ${todayLocal}
ITEM:
${clip(text, 6000)}${extra}

EXISTING MEMORIES:
${(mems ?? []).map((m: any, i: number) => `${i}. (${m.status}) ${m.content}`).join("\n") || "(none)"}

RELATED NOTES:
${related.map((h: any, i: number) => `${i}. ${h.title}: ${clip(h.content, 200)}`).join("\n") || "(none)"}`;
    const { data: r, usage, model } = await completeJSON([{ role: "system", content: PROCESS_PROMPT }, { role: "user", content: user }], true);
    await track(admin, uid, "process", usage);

    const result: Record<string, any> = {
      title: String(r.title ?? n.title ?? "").slice(0, 140), summary: String(r.summary ?? ""),
      type: ["note", "task", "idea", "link", "person", "journal"].includes(r.type) ? r.type : n.type || "note",
      para: ["projects", "areas", "resources", "archive", "inbox"].includes(r.para) ? r.para : "inbox",
      tags: (Array.isArray(r.tags) ? r.tags : []).map((t: unknown) => String(t).toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "-")).filter(Boolean).slice(0, 5),
      people: (r.people ?? []).slice(0, 10), projects: (r.projects ?? []).slice(0, 10), dates: (r.dates ?? []).slice(0, 10),
      tasks: (r.tasks ?? []).filter((t: any) => t?.title).slice(0, 8), decisions: (r.decisions ?? []).slice(0, 8),
      related: (r.related ?? []).map((i: number) => related[i]).filter(Boolean).map((h: any) => ({ id: h.source_id, title: h.title })),
      needs_review: !!r.needs_review, review_reason: String(r.review_reason ?? ""), model, memories: [] as unknown[], duplicates: [] as string[],
    };

    // Memory suggestions — always "suggested", the user confirms them.
    if (prefs?.memory_suggestions !== false) {
      for (const m of (r.memories ?? []).slice(0, 5)) {
        const content = String(m?.content ?? "").trim(); if (content.length < 6) continue;
        const mv = await embed(content);
        const { data: near } = await db.rpc("nexora_match_memories", { q_embedding: vec(mv), n: 1, min_sim: 0.9 });
        if (near?.length) { result.duplicates.push(content); continue; }
        const conflict = Number.isInteger(m.conflicts_with) ? mems?.[m.conflicts_with] : null;
        const { data: mem } = await db.from("memories").insert({
          user_id: uid, layer: "knowledge", content, status: "suggested", created_by: "ai",
          kind: ["fact", "preference", "temporary", "assumption"].includes(m.kind) ? m.kind : "fact",
          category: String(m.category ?? "personal").slice(0, 30), importance: Math.min(5, Math.max(1, Number(m.importance) || 3)),
          confidence: Math.min(1, Math.max(0, Number(m.confidence) || 0.6)),
          expires_at: m.kind === "temporary" ? new Date(Date.now() + 14 * 864e5).toISOString() : null,
          source_type: "note", source_id: noteId, source_excerpt: clip(text, 400), conflicts_with: conflict?.id ?? null, embedding: vec(mv),
        }).select("id,content,kind,category,conflicts_with").single();
        if (mem) {
          await db.from("memory_sources").insert({ memory_id: mem.id, user_id: uid, source_type: "note", source_id: noteId, excerpt: clip(text, 400) });
          await db.from("memory_versions").insert({ memory_id: mem.id, user_id: uid, version: 1, content, status: "suggested", changed_by: "ai", reason: "Extracted from inbox item" });
          result.memories.push(mem);
          if (conflict) result.needs_review = true;
        }
      }
    }
    // Knowledge graph: people and projects mentioned, related notes.
    for (const [kind, names] of [["person", result.people], ["project", result.projects]] as const) {
      for (const name of names as string[]) {
        const { data: ent } = await db.from("entities").upsert({ user_id: uid, kind, name: String(name).slice(0, 80) }, { onConflict: "user_id,kind,normalized" }).select("id").single();
        if (ent) await db.from("relationships").upsert({ user_id: uid, from_type: "note", from_id: noteId, to_type: "entity", to_id: ent.id, rel: "mentions", strength: 0.8, explanation: `Mentions ${kind} ${name}` }, { onConflict: "user_id,from_type,from_id,to_type,to_id,rel" });
      }
    }
    for (const rel of result.related) await db.from("relationships").upsert({ user_id: uid, from_type: "note", from_id: noteId, to_type: "note", to_id: rel.id, rel: "related", strength: 0.6, explanation: "Same subject (AI)" }, { onConflict: "user_id,from_type,from_id,to_type,to_id,rel" });

    const status = result.needs_review ? "needs_review" : "organized";
    await db.from("inbox_items").update({ status, result, processed_at: new Date().toISOString() }).eq("note_id", noteId);
    await audit(db, uid, "inbox.processed", "note", noteId, { status, memories: result.memories.length, tasks: result.tasks.length, model });
    return json({ status, result });
  } catch (e) {
    await db.from("inbox_items").update({ status: "failed", error: (e as Error).message }).eq("note_id", noteId);
    throw e;
  }
}

async function actBriefing(req: Body, db: SupabaseClient, admin: SupabaseClient, uid: string) {
  await checkLimit(admin, uid);
  const ctx = await liveContext(db);
  const { data: mems } = await db.from("memories").select("id,content,category").eq("status", "confirmed").is("deleted_at", null).order("importance", { ascending: false }).limit(8);
  const tz = (req.timezone as string) || ctx.profile?.timezone || "Asia/Bangkok";
  const todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const user = `TODAY: ${todayLocal}
OPEN TASKS:
${ctx.tasks.map((t) => `- id:${t.id} | ${t.title} | due:${t.due || "none"}`).join("\n") || "(none)"}
RECENT NOTES:
${ctx.recent.map((n) => `- id:${n.id} | ${n.type} | ${n.title}`).join("\n") || "(none)"}
INBOX WAITING: ${ctx.inbox}
CONFIRMED GOALS/MEMORIES:
${(mems ?? []).map((m) => `- ${m.content}`).join("\n") || "(none)"}`;
  const sys = `You write the user's short daily briefing for NEXORA. Use ONLY the data given. Never invent tasks or events.
Return JSON: {"headline":"one encouraging sentence about today, max 14 words","focus":[{"text":"what to focus on and why (max 18 words)","ref":"note id from the data or null"}],"heads_up":["overdue items, inbox to clear, or deadlines (max 3)"]}
Pick at most 3 focus items: overdue first, then due today, then due soon, then important goals. If there is no data, say so kindly and suggest capturing a first idea.`;
  const { data, usage } = await completeJSON([{ role: "system", content: sys }, { role: "user", content: user }], true);
  await track(admin, uid, "briefing", usage);
  return json({ ...data, date: todayLocal, evidence: { tasks: ctx.tasks.length, inbox: ctx.inbox, recent: ctx.recent.length } });
}

async function actTranscribe(form: FormData, admin: SupabaseClient, uid: string) {
  if (!GROQ_KEY) throw new HttpError(503, "AI is not set up yet.", "no_key");
  await checkLimit(admin, uid);
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No audio");
  if (file.size > 20e6) throw new HttpError(400, "Recording is too long (max 20 MB)");
  const fd = new FormData();
  fd.append("file", file, file.name || "audio.webm");
  fd.append("model", "whisper-large-v3-turbo");
  const lang = form.get("language"); if (typeof lang === "string" && lang) fd.append("language", lang);
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${GROQ_KEY}` }, body: fd });
  if (!r.ok) throw new HttpError(502, `Transcription failed (${r.status})`);
  const j = await r.json();
  await track(admin, uid, "transcribe");
  return json({ text: String(j.text ?? "").trim() });
}

async function actSearch(req: Body, db: SupabaseClient) {
  const q = String(req.q ?? "").trim(); if (!q) return json({ results: [] });
  const qv = await embed(q);
  const [{ data: hits }, { data: mems }] = await Promise.all([
    db.rpc("nexora_search", { q: keywordQuery(q) || q, q_embedding: vec(qv), n: 20 }),
    db.rpc("nexora_match_memories", { q_embedding: vec(qv), n: 5, min_sim: 0.4 }),
  ]);
  return json({ results: hits ?? [], memories: mems ?? [] });
}

// ---------------- router ----------------
type Body = Record<string, unknown>;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) throw new HttpError(401, "Sign in to use NEXORA AI", "auth");
    const db = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u, error } = await db.auth.getUser(auth.slice(7));
    if (error || !u?.user) throw new HttpError(401, "Your session expired. Sign in again.", "auth");
    const uid = u.user.id;
    const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return await actTranscribe(await req.formData(), admin, uid);
    const body = (await req.json().catch(() => ({}))) as Body;
    switch (body.action) {
      case "chat": return await actChat(body, db, admin, uid);
      case "process": return await actProcess(body, db, admin, uid);
      case "briefing": return await actBriefing(body, db, admin, uid);
      case "index": return json({ ...(await indexQueue(db, uid, 40)), ...(await embedMemories(db)) });
      case "search": return await actSearch(body, db);
      case "status": return json({ ai: !!GROQ_KEY, limit: DAILY_LIMIT, model: GROQ_KEY ? await pickModel().catch(() => null) : null });
      default: throw new HttpError(400, "Unknown action");
    }
  } catch (e) {
    const he = e instanceof HttpError ? e : new HttpError(500, (e as Error).message || "Server error");
    console.error(he.code, he.message);
    return json({ error: he.message, code: he.code }, he.status);
  }
});
