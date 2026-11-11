# Second Brain 🧠

A personal second-brain app in the Neural Night design: notes, tasks with due dates, daily journal, tags, linked notes, a 3D Brain map of how your notes connect, focus card and streaks, photos and files, plus a Discover tab with weather, currency, news and Wikipedia search, and a file converter for photos, PDFs, video, music, Word and Excel files. Works offline, syncs to the cloud when you sign in, and backs up daily.

## Install

- **Android app:** download [second-brain.apk](https://github.com/khalil203/second-brain/raw/main/dist/second-brain.apk) and open it (allow "Install unknown apps" for your browser when asked).
- **Web app:** open https://khalil203.github.io/second-brain/ in Chrome, then menu ⋮ → **Install app**.

## Brain AI and Imagine

Open-source models that run on the phone, no AI company involved:

- **Brain AI** uses [Transformers.js](https://github.com/huggingface/transformers.js) with `Xenova/multilingual-e5-small` (Thai, English, French, Arabic) or `Xenova/all-MiniLM-L6-v2` (English) for search by meaning, similar notes, auto-organizing the inbox, summaries and semantic links in the Brain map. Text from photos uses [Tesseract.js](https://github.com/naptha/tesseract.js). Models download once and then work offline.
- **Imagine** creates images with the open [FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) model through Hugging Face, using a free Hugging Face key, or the free public FLUX Space when it has free time left.

## Jarvis voice assistant

Home → **Jarvis** (or Discover). Talk to your second brain: "add a task to call the customer tomorrow", "what's due today?", "search my notes for solar", "add to my journal…", "remember that…". It also checks the weather, searches the web, opens apps on the phone, sets reminders and runs your Make.com automations.

- Listening: Groq Whisper; answers: the best free Groq model (auto). Add a free key from https://console.groq.com/keys in Jarvis → ⚙️. The key stays on the phone and is never synced or backed up.
- What Jarvis remembers is kept in the note **🧠 Jarvis memory** (Areas), so it syncs like any note.
- The Android app needs version 1.4.0 or newer for the microphone and spoken replies.

## My Voice

Discover → **My Voice**. Record or upload about 10 seconds of your voice once (English and Thai are separate samples), type a script, and get an audio clip in your own voice for video voice-overs. Save it to a note, share it, or ask Jarvis: "say this in my voice: …".

- Runs on free Hugging Face Spaces: English uses the open-source [F5-TTS](https://github.com/SWivid/F5-TTS) (`mrfakename/E2-F5-TTS`), Thai uses [VachaSpeech](https://huggingface.co/spaces/VIZINTZOR/VachaSpeech) (`VIZINTZOR/VachaSpeech`, CPU, about 1–3 minutes per clip). Both are changeable in the tool. The sample and script are sent to those servers; they can be busy or out of free time.
- Voice samples stay on the phone and are not synced. Saved clips are normal notes (tag `#my-voice`).
- Clone only your own voice.

## Converter

The Convert tool (Home → Convert, or Discover) changes files on the device: images (JPG, PNG, WEBP, PDF), PDF (JPG, PNG, TXT), video and audio via ffmpeg.wasm (MP4, MP3, GIF, WEBM, M4A, WAV, OGG), spreadsheets via SheetJS, Word via mammoth. The donut format picker is inspired by [Filee](https://github.com/KnifeLemon/Filee) (MIT, © Myeonggu Kim). The desktop version is [Second Brain Convert](https://github.com/khalil203/second-brain-convert).

## Cloud

Sign-in, sync and daily backups use a Supabase project (`kshhznqxudcaipizpxvv`, Singapore). Each account can only read its own notes and files (row-level security). The `web` edge function powers link previews and news feeds.

## Updates

The app checks GitHub for new versions and downloads them by itself (Settings → Updates). Tap **Restart** when it says an update is ready. Your notes are never touched by updates.

## Releasing a new version

1. Edit `app.html` and raise `APP_VERSION` (for example `3.0.0` → `3.1.0`).
2. Put the same number in `version.json` → `"version"`.
3. Commit and push to `main`. Phones pick it up through the update button.

Only when the Android shell itself changes (new plugins, icon, app name): raise `apk_version` in `version.json` and in `index.html` (`SB_SHELL.apk`), and add `[apk]` to the commit message. GitHub Actions builds a new signed APK release.

## Files

| File | What it is |
|---|---|
| `app.html` | The whole app |
| `index.html` | Loader that runs the newest downloaded version |
| `version.json` | Latest version numbers, read by the update button |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and install icons for the web app |
| `capacitor.config.json`, `.github/workflows/build.yml` | Android APK build |

The APK signing key is `signing/release.p12` (new key since Android app 1.4.0, 11 Nov 2026; apps 1.3.0 and older must be uninstalled once before installing 1.4.0), locked with a long random password. To let GitHub build APKs, add that password as the repository secret `KEYSTORE_PASSWORD` (Settings → Secrets and variables → Actions). Keep the password private and saved somewhere safe — without it, future APKs can't install over the old one.
