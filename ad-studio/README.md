# AI AD STUDIO

Personal, mobile-first PWA that turns product photos into Thai advertising videos.
**Upload product → analyze → strategy → storyboard → generate video → edit → export → publish.**

Everything runs in the browser on your phone. It's free, it works offline, it needs no API keys, and your projects never leave your device.

## What works now (Phases 1–5 + part of 6)

| Area | Status |
|---|---|
| Installable PWA, offline UI, dark studio design, bottom nav | ✅ |
| Upload 1–5 photos (camera or gallery, JPG/PNG/WebP), dominant colours from the photo | ✅ |
| Editable product info, with warnings when information is missing (no invented claims) | ✅ |
| Rule-based Thai marketing brain: 10-part strategy, hooks, CTA, captions for 4 platforms, 1–4 hashtags | ✅ free and offline |
| Storyboard director for 10/15/30/45/60 s and 9:16, 1:1, 16:9, in 10 styles | ✅ |
| Canvas photo-to-video engine: Ken Burns, pans, glow, light rays, particles, spotlight, 6 transitions, Thai text animations (balanced Thai line breaks), badges, price tags, arrows… | ✅ |
| Music generated in the app (6 moods, royalty-free), 6 synthesized SFX, user-uploaded audio with a rights confirmation, fades, trim, volume | ✅ |
| Editor: preview, timeline (6 tracks), split, reorder, duplicate, delete, durations, drag text and graphics on the video, text styles and fonts, graphics library, undo/redo, autosave | ✅ |
| Export: **MP4 (H.264, WebCodecs)** rendered faster than realtime, with a **WebM/MediaRecorder** fallback; 720p/1080p, 24/30/60 fps, quality check, progress, cancel, aspect-ratio check | ✅ |
| Multi-version generator (A Luxury / B Viral / C Minimal / D Sales) with a queue and retry | ✅ |
| Projects (search, filter, rename, duplicate, delete, export history), Brand Kit, Templates (+ personal), Settings, backup and restore | ✅ |
| Affiliate Studio page, Analytics dashboard | ⏳ Phase 6 (honest placeholder, no fake data) |
| External AI image analysis / AI video, Supabase cloud backup | ⏳ needs a backend adapter (keys must never be in the frontend) |

## Develop

```bash
npm install
npm run dev      # local dev
npm run build    # type-check + production build to dist/
```

## Deploy

Every push to `main` builds and deploys automatically (`.github/workflows/deploy.yml`).
The workflow publishes `dist/` to the `gh-pages` branch → https://khalil203.github.io/ai-ad-studio/

## Architecture

- `src/engine/renderer.ts`: one `drawFrame(t)` used by the preview, the editor and the export, so what you see is exactly what gets exported
- `src/engine/exporter.ts`: WebCodecs + mp4-muxer, falling back to MediaRecorder
- `src/engine/audio.ts`: procedural music, SFX and an offline mixer (Web Audio)
- `src/lib/marketing.ts`, `storyboard.ts`: the rule-based marketing brain and director (swap in an AI provider later)
- `src/lib/db.ts`: IndexedDB (projects, assets, brand kits, activity); settings live in localStorage
