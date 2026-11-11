# NEXORA

**Your Mind. Amplified.** — Everything connected. Nothing forgotten.

NEXORA is a personal AI operating system and second brain (formerly *Second Brain*). Capture anything, and NEXORA organizes it, finds the tasks, dates and people in it, remembers what matters with your approval, and answers your questions from your own knowledge, with sources.

## Install — every device

**One page for all devices:** https://khalil203.github.io/NEXORA/download.html (it detects your device and has a QR code for phones).

| Device | How |
|---|---|
| Android | [NEXORA.apk](https://github.com/khalil203/NEXORA/raw/main/dist/NEXORA.apk). Allow "Install unknown apps" when asked |
| iPhone / iPad | Open https://khalil203.github.io/NEXORA/ in Safari → Share → **Add to Home Screen** |
| Windows | [NEXORA-Setup.exe](https://github.com/khalil203/NEXORA/releases/download/desktop-latest/NEXORA-Setup.exe) (SmartScreen: More info → Run anyway) |
| Mac | [NEXORA.dmg](https://github.com/khalil203/NEXORA/releases/download/desktop-latest/NEXORA.dmg) (first open: right-click → Open) |
| Linux | [NEXORA.AppImage](https://github.com/khalil203/NEXORA/releases/download/desktop-latest/NEXORA.AppImage) or [NEXORA.deb](https://github.com/khalil203/NEXORA/releases/download/desktop-latest/NEXORA.deb) |
| Web | https://khalil203.github.io/NEXORA/ (Chrome or Edge: Install in the address bar) |

All versions run the same app and update themselves; sign in once on each device to sync. The desktop apps (`desktop/`, Electron) open the hosted app, so they only need rebuilding when `desktop/` changes. The **Desktop apps** workflow builds them and publishes them to the `desktop-latest` release.

## What's in 6.0 (Phase 1)

| Module | What it does |
|---|---|
| **Home** | Greeting, AI daily briefing (from your real tasks, with evidence), ask box, quick capture, priorities, inbox and memories waiting for you, pinned and recent notes |
| **AI Brain** | Chat with your second brain. Streams answers grounded in your notes, memories and past chats, with numbered citations you can tap. History, voice input, save an answer as a note, turn it into a task |
| **Capture** | Text, voice (with transcription), camera, files, links and paste. Works offline; originals are always kept |
| **Inbox** | AI pipeline with statuses (Received → Processing → Organized / Needs review / Failed): summary, area, tags, people, dates, tasks, decisions, memory suggestions, related notes. File with one tap, undo any time |
| **Knowledge Vault** | Notes, tasks, ideas, links, people, journal in Projects / Areas / Resources / Archive. Instant search plus search by meaning, tags, `[[wiki links]]`, backlinks, Markdown with tappable checklists, attachments |
| **My Memories** | What NEXORA remembers, grouped by category: approve or dismiss suggestions, edit (with version history), see the source, mark outdated, forget permanently |
| **Tasks** | Today / Upcoming / Anytime / Done |
| **Settings** | Account and sync, AI autonomy controls, activity log ("what the AI did and why"), dark/light, export everything, delete all cloud data, updates |
| **Classic tools** | AD Studio, Converter, Jarvis, My Voice, Imagine, 3D Brain map and Discover from the previous app, on the same notes and account (More → Classic tools) |

Knowledge Graph, Life Manager, Projects, Business HQ, Learning Hub, People, Calendar, Finance, Automations and Insights arrive in Phases 3–5 (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

## AI

All AI runs on the server in the Supabase edge function `nexora-ai`. No key is stored in the app.

- **Reasoning:** Groq (OpenAI-compatible). The function picks the best available model from a preference list (`GROQ_MODELS` to override).
- **Embeddings:** Supabase built-in `gte-small`, used for search by meaning and memory matching (pgvector, hybrid with full-text search).
- **Speech-to-text:** Groq Whisper.
- **Limits:** `AI_DAILY_LIMIT` requests per user per day (default 300), tracked in `ai_usage`.

**Setup:** add the secret `GROQ_API_KEY` (free key from https://console.groq.com/keys) in Supabase → Edge Functions → Secrets.

**Autonomy:** NEXORA files and tags automatically only if you turn that on, and each move can be undone. Memories are only kept once you approve them. It never sends, buys, shares, publishes or deletes anything without asking.

## AD Studio

More → Classic tools → **AD Studio** turns product photos into Thai ad videos: product analysis, marketing strategy, storyboard, video, music, and MP4 export. Source: [`ad-studio/`](ad-studio) (React + Vite). GitHub Actions builds it and publishes it at https://khalil203.github.io/NEXORA/ad-studio/ with every push. Projects stay on the device. Server functions: [`ad-studio/supabase/functions`](ad-studio/supabase/functions).

## My Voice — Thai engine

For a closer Thai voice, make your own free Hugging Face Space from [`voice-engines/thai/`](voice-engines/thai) (F5-TTS-THAI by VIZINTZOR, CC-BY 4.0) and put its name in My Voice → Thai engine.

## Account

Sign in with username **Nexora** (Settings → Account & sync). Sign-ups are closed: the trigger `nexora_block_signups` on `auth.users` refuses every new account, including through the Supabase dashboard. To add an account on purpose, run the insert in SQL after `select set_config('nexora.allow_signup','on',true);` in the same transaction, or drop the trigger.

## Cloud and privacy

Supabase project `kshhznqxudcaipizpxvv` (Singapore). Every table has row-level security, so each account sees only its own rows. Files live in the private `brain` bucket under the user's own folder. There are daily backups (last 14 kept), export of everything, and permanent deletion. Private data is never used to train models. Schema: [supabase/migrations](supabase/migrations).

## Development

```bash
cd web
npm install
npm run dev        # local dev server
npm run build      # typecheck + build → ../app.html (one self-contained file)
```

The source is React + TypeScript + Tailwind in `web/src`. The build inlines everything into `app.html` and stamps `APP_VERSION = 'x.y.z'`, which the loader and the self-updater look for.

### Releasing a new version

1. Raise `"version"` in `web/package.json` and the same number in `version.json`.
2. `cd web && npm run build`.
3. Commit and push to `main`. Phones pick it up through the update button.

Only when the Android shell changes (plugins, icon, app name): raise `apk_version` in `version.json` and `SB_SHELL.apk` in `index.html`, and put `[apk]` in the commit message. GitHub Actions builds a signed APK.

## Files

| Path | What it is |
|---|---|
| `web/` | NEXORA source (React + TypeScript) |
| `desktop/` | Windows / Mac / Linux app (Electron shell) |
| `download.html` | Download page for every device |
| `app.html` | Built app (generated — don't edit by hand) |
| `classic.html` | The previous Second Brain 5.4 app, used by Classic tools |
| `ad-studio/` | AD Studio source (built and published by GitHub Actions) |
| `convert-windows/` | Second Brain Convert for Windows |
| `voice-engines/` | Self-hostable voice engines for My Voice |
| `index.html` | Loader that runs the newest downloaded version |
| `version.json` | Latest version numbers, read by the update button |
| `supabase/` | Database migrations and the `nexora-ai` edge function |
| `docs/ARCHITECTURE.md` | Architecture, schema, design system, roadmap |
| `sw.js`, `manifest.webmanifest`, `icons/`, `assets/` | Web app offline support and icons |
| `capacitor.config.json`, `.github/workflows/build.yml` | Android APK build |

The APK signing key is `signing/release.p12`, locked with the repository secret `KEYSTORE_PASSWORD`. Keep that password safe: without it, future APKs can't install over the old one.

Converter format picker inspired by [Filee](https://github.com/KnifeLemon/Filee) (MIT, © Myeonggu Kim).
