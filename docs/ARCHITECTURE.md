# NEXORA — Architecture (v6, Phase 1)

> **Your Mind. Amplified.** — Everything connected. Nothing forgotten.

NEXORA is the next generation of the Second Brain app. It keeps the same Android app ID
(`com.khalil.secondbrain`), the same Supabase project and the same self-update channel, so
existing installs upgrade in place and every note is preserved.

## 1. System overview

```
┌──────────────────────── Phone / Browser ────────────────────────┐
│  index.html (loader) ──► app.html  = NEXORA (React + TS, 1 file) │
│        │                    │                                    │
│        │                    ├─ Local store (IndexedDB "secondbrain") — offline first
│        │                    ├─ Sync engine  ⇄  Supabase REST (notes, files)
│        │                    ├─ AI client    ⇄  Edge function nexora-ai
│        │                    └─ Classic tools (classic.html in an iframe, same data)
└──────────────────────────────────────────────────────────────────┘
                                   │ HTTPS + user JWT (RLS)
┌──────────────────────────── Supabase (Singapore) ───────────────┐
│ Auth · Postgres 17 + pgvector · Storage bucket "brain"           │
│ Edge functions:                                                  │
│   nexora-ai  → orchestrator: chat, process, index, briefing,     │
│                transcribe. Server-side Groq key. gte-small embeds │
│   web        → link previews and RSS (existing)                  │
└──────────────────────────────────────────────────────────────────┘
```

### Why one HTML file
The installed APK (1.4.0) and the web app load `app.html` through `index.html`, and the update
button downloads a newer `app.html` from GitHub. NEXORA is written in React + TypeScript under
`web/` and Vite compiles it into a single self-contained `app.html` (vite-plugin-singlefile).
The modern codebase and the zero-install update channel both keep working. The build embeds
`APP_VERSION = 'x.y.z'`, which the existing loader and updater look for.

### Offline first
All notes live in IndexedDB first (same `secondbrain` database the previous app used — no
migration step, nothing can be lost). Changes are queued (`cloud.dirty`) and pushed when
online. Capture works with no connection; AI processing runs when the item reaches the cloud.

### Classic tools bridge
Features not yet rebuilt (Converter, Jarvis voice, My Voice, Imagine, 3D Brain map, Discover)
stay available from **More → Classic tools**. They run the previous app (`classic.html`) in a
full-screen frame on the same origin, so they read and write the same notes and sign-in.
NEXORA saves before opening them and reloads when they close. Each phase replaces some of them.

## 2. AI intelligence architecture

One edge function, `nexora-ai`, is the orchestrator. Each action is a specialised agent with its
own prompt and structured (JSON) output. All of them share the user's JWT (so RLS applies to
every query), the usage limiter and the audit log.

| Action | Agent (spec §6) | What it does |
|---|---|---|
| `chat` | Personal Assistant + Knowledge Retrieval | Hybrid search (keyword + vector) over notes, memories and past messages → grounded answer streamed back with numbered citations. Never invents memories. |
| `process` | Memory Extraction + Document Understanding + Task | Classifies an inbox item: summary, type, PARA area, tags, people, dates, possible tasks, decisions, memory candidates. |
| `index` | Memory Consolidation (indexing part) | Chunks changed notes and stores 384-dim gte-small embeddings in `knowledge_chunks`. |
| `briefing` | Planning + Insight | Daily briefing from real tasks, inbox and recent notes, with evidence. |
| `transcribe` | Audio | Groq Whisper speech-to-text for voice capture and voice chat. |

**Model layer.** Text reasoning: Groq (OpenAI-compatible API), model chosen from a preference
list (`GROQ_MODELS` env to override). Embeddings: Supabase built-in `gte-small` (free, runs inside
the edge runtime). Transcription: Groq Whisper. Providers sit behind small adapter functions,
so swapping one is a change to a single file. Keys exist only as Supabase secrets.

**Cost and abuse control.** `ai_usage` keeps per-user daily counters; the function refuses
past `AI_DAILY_LIMIT` (default 300 requests/day) with a clear message.

**Autonomy levels (spec §5).**
- Level 1, automatic: indexing, summaries, classification suggestions.
- Level 2, managed: applying an AI suggestion (move to area, add tags) when *Auto-organize* is
  on; every change is logged in `audit_logs` and can be undone from the item.
- Level 3, approval: memories are saved as **suggested** and only become **confirmed** when you
  approve them. Tasks the AI finds are proposed and created when you tap them. Nothing is sent,
  shared, bought or deleted by the AI.

## 3. Database schema

PostgreSQL 17 + `vector`. Every table has `user_id uuid references auth.users on delete cascade`,
row-level security on, and the single policy `user_id = auth.uid()` for all operations.
Full DDL: `supabase/migrations/`.

| Table | Purpose | Phase |
|---|---|---|
| `notes` *(existing)* | Every vault item (note, task, idea, link, person, journal), JSON `data`, offline sync | 1 |
| `files` *(existing)* | Attachment index; blobs in storage `brain/{uid}/files/…` | 1 |
| `profiles` | Display name, timezone, locale | 1 |
| `user_preferences` | AI autonomy and notification settings | 1 |
| `inbox_items` | Processing status per captured note (received → processing → organized / needs_review / failed), AI result, errors, attempts | 1 |
| `conversations`, `messages` | AI Brain chat history with citations, model and token counts | 1 |
| `memories` | Experience + knowledge layers; kind (fact, preference, temporary, suggestion, assumption), status (suggested, confirmed, rejected, outdated), importance, confidence, expiry, source, embedding | 1–2 |
| `memory_versions` | Every change to a memory, by whom and why | 1–2 |
| `memory_sources` | Links a memory to the notes/messages that support it | 1–2 |
| `knowledge_chunks` | Text chunks + embedding + full-text vector for hybrid search (also serves as the spec's `embeddings` table) | 1 |
| `entities`, `relationships` | Knowledge graph nodes and typed, weighted edges with explanations | 2–5 |
| `workspaces`, `businesses`, `projects`, `tasks`, `goals`, `habits`, `contacts`, `calendar_events`, `financial_records` | Structured modules | 3 |
| `automations`, `automation_runs`, `notifications`, `integrations`, `user_permissions` | Autonomy and integrations | 4–5 |
| `ai_usage`, `audit_logs` | Cost tracking and "what did the AI do and why" | 1 |

Search RPC `nexora_search(q, q_embedding, n)` merges full-text rank and cosine similarity
(reciprocal-rank fusion) and only ever sees the caller's rows.

## 4. Design system

| Token | Dark | Light |
|---|---|---|
| `bg` | `#101626` deep midnight navy | `#F5F7FC` |
| `surface` | `#171D2B` dark graphite | `#FFFFFF` |
| `primary` | `#648BFF` electric blue | `#3F68E8` |
| `violet` | `#927BFF` soft violet | `#7158F0` |
| `text` | `#FFFFFF` | `#101626` |
| `muted` | `#A7B0C2` | `#5B6478` |

- **Type:** Inter / system UI; 28/22/17/15/13 scale; tight tracking on headings.
- **Surfaces:** 16–24 px radius cards; subtle glass (`backdrop-blur`, 6 % white border) only on
  floating layers (nav, sheets, capture button); soft long shadows; one blue→violet gradient
  reserved for the brand mark, the Capture button and AI moments.
- **Motion:** 150–250 ms ease-out for sheets and fades; nothing loops except the AI "thinking"
  indicator; honours `prefers-reduced-motion`.
- **Icons:** lucide line icons, 1.75 stroke.
- **Empty states:** every module explains itself and offers one first action.

## 5. Navigation

- **Mobile (bottom bar):** Home · Brain · **Capture** (raised gradient button) · Tasks · More.
- **Desktop (≥1024 px sidebar):** Home, AI Brain, My Memories, Inbox, Knowledge Vault, Knowledge
  Graph, Life Manager, Projects, Business HQ, Learning Hub, People, Calendar, Finance, Automations,
  Insights, Settings. Modules from later phases appear with their phase label and are not clickable,
  so there are no buttons that do nothing.

## 6. Phase 1 plan and checklist

| # | Item | Status |
|---|---|---|
| 1 | App shell, routing, responsive layout, dark/light theme | ✅ |
| 2 | Authentication: sign up, sign in, password reset, sign out, session refresh (shared with classic tools) | ✅ |
| 3 | User profile (name, timezone) synced to `profiles` | ✅ |
| 4 | Home dashboard: greeting, AI briefing, ask box, priorities, inbox, recent memories, recent notes (empty widgets hidden) | ✅ |
| 5 | AI Brain chat: streaming, citations to notes and memories, conversation history, suggested prompts, voice input, save answer as note, create task | ✅ |
| 6 | Database architecture: all tables, RLS, indexes, search RPC | ✅ |
| 7 | Secure file storage: per-user folders, authenticated download | ✅ (existing, reused) |
| 8 | Universal capture: text, voice, photo/camera, files, links, paste, offline queue | ✅ |
| 9 | Inbox processing pipeline with statuses and review | ✅ |
| 10 | Knowledge Vault: search, filters, tags, markdown editor + preview, pin, archive, delete with undo, attachments, backlinks | ✅ |
| 11 | My Memories: list, approve/reject suggestions, edit with version history, source ("why saved"), forget | ✅ (basic; consolidation is Phase 2) |
| 12 | Settings: AI autonomy controls, export, delete cloud data, updates, usage | ✅ |

### Known limitations (honest list)
- The APK is a web app in a native shell (Capacitor), not a fully native app. Share-sheet intake
  and home-screen shortcuts need native plugins → Phase 5.
- AI features need a sign-in and an internet connection; capture and the vault work offline.
- Memory consolidation (merging duplicates, contradiction detection across all memories) is
  Phase 2. In Phase 1 the extractor flags conflicts against the closest existing memories only.
- Google Calendar, Gmail and other integrations are not connected yet and are not shown as
  connected anywhere.
