# Checkpoint — Retro AI Blog

## Ringkasan

Proyek blog retro dengan pipeline AI multi-step (outline → draft → polish) di Cloudflare Workers + Supabase. Admin panel retro 90s, GitHub Actions untuk jadwal harian, OpenRouter/DeepSeek V4 Flash sebagai engine.

## Yang sudah selesai

### Website (worker.js)
- Landing page retro (CRT scanline, menu, hero, timeline animasi)
- Admin panel (`/admin`) — login via `rahasia-admin`, menu navigasi, daftar artikel, edit/hapus inline
- API endpoints: `/api/articles`, `/api/generate`, `/api/models`, `/api/topic-pools`, `/api/sitemap`
- Pipeline AI:
  - **Step 1**: Outline (generate kerangka artikel + judul + meta)
  - **Step 2**: Draft (tulis artikel penuh berdasarkan outline)
  - **Step 3**: Polish (perbaiki konten, meta description, keywords)
  - Retry + fallback model jika step gagal
  - Queue database (`article_queue`) untuk tracking status tiap artikel
- Sitemap generator (`/sitemap.xml`)

### Bug yang sudah diperbaiki
1. **Content-Type ganda** → parsing menggunakan `String.fromCharCode(...)` dari array kustom
2. **Admin JS syntax error** → `loadArticles` di-refactor pakai DOM API (createElement, onclick) agar tidak ada escaping quote bermasalah
3. **Pipeline publish silent error** → `publishArticle` & `publishDraft` sekarang:
   - Cek `response.ok` → throw error jika gagal
   - Retry slug dengan random suffix jika 409 (slug duplikat)
   - Pipeline catch error → fallback ke draft; jika semua gagal → queue status `failed`
4. **Admin nav tidak bisa diklik** → akibat syntax error di #2, sekarang berfungsi

### SQL (Supabase)
- `schema.sql` — tabel `articles`, `article_queue`, `agent_configs`, `topic_pools`, `visitors`
- `migrations.sql` — RLS policies untuk anon key
- **Perlu dijalankan**: `anon_insert_articles` policy (izin INSERT via anon key)

### GitHub Actions
- `.github/workflows/daily-article.yml` — trigger `/api/generate` tiap 8 jam via cron
- `.github/workflows/manual-generate.yml` — trigger manual via workflow_dispatch

### Agent Config
- Per-category agent di `agent_configs` (role prompt, provider, model)
- `topic_pools` untuk random topic per kategori
- Provider config di tabel `providers` (API key, base URL, model list)

### Lainnya
- Workers Analytics Engine untuk visitor dan artikel
- wrangler.jsonc dengan binding yang lengkap (KV, D1, Analytics, Vectorize)
- `AGENTS.md` — catatan konteks untuk Claude
- ESLint + Prettier config

## Yang belum / perlu dikerjakan
- [ ] Verifikasi apakah pending articles di queue perlu dibersihkan
- [ ] Tambah notifikasi kalau pipeline gagal (email/webhook)
- [ ] Gambar/thumbnail artikel (masih placeholder)
- [x] **Optimasi meta description panjang** — validasi 150-160 karakter (SEO), strip HTML/markdown, prompt diperjelas
- [x] **Gaya tulisan kreatif** — bold/italic, tokoh terkenal (dunia/Indonesia) + referensi temporal, minimal 1000 kata (validasi 950)
- [x] **Favicon** — pixel-art CRT retro di `/favicon.ico`, link di semua halaman
- [x] **Popunder ad** — interval 10 menit → 15 menit (homepage + artikel)
- [ ] Rate limiting / anti-abuse di API generate

## Catatan teknis
- **Worker**: Cloudflare Workers (ES modules)
- **Database**: Supabase PostgreSQL (via REST API, bukan binding langsung)
- **AI**: OpenRouter (DeepSeek V4 Flash, fallback: Gemini Flash, Llama, Qwen)
- **Admin**: Inline HTML/JS di worker.js (non-SPA, retro style)
- **Domain**: jemioktavian.my.id (Cloudflare DNS + Tunnel, worker di route)

## Deploy terkini
- Worker URL: `https://retro-ai-blog.jemioktavian23.workers.dev`
- Dashboard: `jemioktavian.my.id/admin`
- API: `jemioktavian.my.id/api/`
