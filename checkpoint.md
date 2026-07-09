# Checkpoint — Retro AI Blog

## Ringkasan

Proyek blog retro dengan pipeline AI multi-step (outline → draft → polish) di Cloudflare Workers + Supabase. Admin panel retro 90s, GitHub Actions untuk jadwal harian, OpenRouter/DeepSeek V4 Flash sebagai engine.

## Yang sudah selesai

### Website (worker.js)
- Landing page retro (CRT scanline, menu, hero, timeline animasi)
- Admin panel (`/admin`) — login via `rahasia-admin`, menu navigasi, daftar artikel, edit/hapus inline
- API endpoints: `/api/articles`, `/api/generate`, `/api/models`, `/api/topic-pools`, `/api/sitemap`, `/api/manual`
- Pipeline AI:
  - **Pre-step**: AI generate topic (kalau topic kosong, 1 call LLM ringan → fallback pool)
  - **Step 1**: Outline (generate kerangka artikel + judul + meta)
  - **Step 2**: Draft (tulis artikel penuh 1000+ kata, bold/italic, tokoh terkenal + referensi temporal)
  - **Step 3**: Polish (perbaiki konten, meta description 150-160 karakter, SEO)
  - Retry + fallback model jika step gagal
  - Queue database (`article_queue`) untuk tracking status tiap artikel
- Favicon: pixel-art CRT retro di `/favicon.ico`, link di semua halaman
- Sitemap generator (`/sitemap.xml`)

### Bug yang sudah diperbaiki
1. **Content-Type ganda** → parsing menggunakan `String.fromCharCode(...)` dari array kustom
2. **Admin JS syntax error** → `loadArticles` di-refactor pakai DOM API (createElement, onclick) agar tidak ada escaping quote bermasalah
3. **Pipeline publish silent error** → `publishArticle` & `publishDraft` sekarang:
   - Cek `response.ok` → throw error jika gagal
   - Retry slug dengan random suffix jika 409 (slug duplikat)
   - Pipeline catch error → fallback ke draft; jika semua gagal → queue status `failed`
4. **Admin nav tidak bisa diklik** → akibat syntax error di #2, sekarang berfungsi
5. **Admin generate NETWORK ERROR** → `/api/manual` lama wajibkan `title` walau `write_by_ai:true`, dan browser timeout karena sync pipeline 60-120s. Sekarang:
   - `/api/manual` handle topic kosong (pilih random category + delegate ke pipeline)
   - `genTest` pakai smart polling: 30s AbortController → kalau timeout → auto cek queue baru → tampilkan progress step → refresh saat published

### Optimasi Konten
- **Gaya tulisan kreatif** — bold/italic, tokoh terkenal (dunia/Indonesia) + referensi temporal ("5 tahun lalu")
- **Panjang artikel** — minimal 1000 kata (validasi 950 kata), sebelumnya 800-1000
- **Meta description** — validasi ketat 150-160 karakter (SEO), strip HTML/markdown
- **Topic AI-generated** — kalau topic kosong, AI generate topic segar + unik (bukan dari pool statis)
- **Role prompts** — update di `agent_config` per category dengan instruksi kreatif lengkap
- **Popunder ad** — interval 10 menit → 15 menit (homepage + artikel)

### SQL (Supabase)
- `schema.sql` — tabel `articles`, `article_queue`, `agent_configs`, `topic_pools`, `visitors`
- `migrations.sql` — RLS policies untuk anon key (INSERT, UPDATE, DELETE)
- ✅ Semua RLS policy sudah aktif

### GitHub Actions
- `.github/workflows/daily-article.yml` — trigger `/api/generate` tiap 8 jam via cron
- `.github/workflows/manual-generate.yml` — trigger manual via workflow_dispatch

### Agent Config
- Per-category agent di `agent_configs` (role prompt, provider, model)
- `topic_pools` untuk fallback topic per kategori
- Provider config di tabel `providers` (API key, base URL, model list)

### Lainnya
- Workers Analytics Engine untuk visitor dan artikel
- wrangler.jsonc dengan binding yang lengkap (KV, D1, Analytics, Vectorize)
- `AGENTS.md` — catatan konteks untuk Claude
- ESLint + Prettier config

## Yang belum / perlu dikerjakan
- [ ] Tambah notifikasi kalau pipeline gagal (email/webhook)
- [ ] Gambar/thumbnail artikel (masih placeholder)
- [ ] Rate limiting / anti-abuse di API generate
- [ ] Bersihkan stuck queue items berkala (auto-cleanup)

## Catatan teknis
- **Worker**: Cloudflare Workers (ES modules)
- **Database**: Supabase PostgreSQL (via REST API, bukan binding langsung)
- **AI**: OpenRouter (DeepSeek V4 Flash, fallback: Gemini Flash, Llama, Qwen)
- **Admin**: Inline HTML/JS di worker.js (non-SPA, retro style)
- **Domain**: jemioktavian.my.id (Cloudflare DNS + Tunnel, worker di route)
- **Pipeline**: 4 LLM calls (topic + outline + draft + polish), ±120-180 detik

## Deploy terkini
- Worker URL: `https://retro-ai-blog.jemioktavian23.workers.dev`
- Dashboard: `jemioktavian.my.id/admin`
- API: `jemioktavian.my.id/api/`
- Version: `febeeae6`
