# PRODUCT REQUIREMENTS DOCUMENT (PRD)
# Retro AI Blog - 16-Bit Nostalgia Edition
# Version: 1.0
# Date: 2026-07-09
# Budget: $5/year (Rp 80,000/tahun)
# Domain: .my.id

================================================================================
1. EXECUTIVE SUMMARY
================================================================================

Product Name: Retro AI Blog (16-Bit Nostalgia Edition)
Tagline: "Artikel AI di-generate otomatis dengan style retro 90s gaming"

Core Value Proposition:
- Website artikel otomatis yang menulis 2 artikel/hari menggunakan AI agent
- Style visual 16-bit pixel art / retro gaming era 90an (CRT scanlines, glitch effects, chiptune vibe)
- 100% free infrastructure (hosting, database, AI, cron)
- Hanya bayar domain .my.id (~Rp 25-50K/tahun)
- Sequential pipeline anti-failure dengan validation per step

Target Market: Indonesia (Bahasa Indonesia)
Primary Niche: Teknologi & AI (start), expandable ke 5 niche

================================================================================
2. TECHNICAL ARCHITECTURE
================================================================================

┌─────────────────────────────────────────────────────────────────────────────┐
│                              TECH STACK                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   FRONTEND   │    │   BACKEND    │    │   DATABASE   │              │
│  │              │    │              │    │              │              │
│  │ HTML/CSS/JS  │◄──►│ Cloudflare   │◄──►│  Supabase    │              │
│  │ (16-bit      │    │ Workers      │    │  PostgreSQL  │              │
│  │  retro style)│    │ (API + AI    │    │  (500MB free)│              │
│  │              │    │  pipeline)   │    │              │              │
│  └──────────────┘    └──────┬───────┘    └──────────────┘              │
│                             │                                              │
│                             ▼                                              │
│                      ┌──────────────┐                                      │
│                      │   AI ENGINE  │                                      │
│                      │              │                                      │
│                      │ OpenRouter   │                                      │
│                      │ (Free models)│                                      │
│                      │              │                                      │
│                      └──────────────┘                                      │
│                             ▲                                              │
│                             │                                              │
│                      ┌──────────────┐                                      │
│                      │   CRON JOB   │                                      │
│                      │              │                                      │
│                      │ GitHub       │                                      │
│                      │ Actions      │                                      │
│                      │ (2x/day)     │                                      │
│                      └──────────────┘                                      │
│                                                                             │
│  ┌──────────────┐                                                         │
│  │   DOMAIN     │    yourname.my.id (Rp 25-50K/tahun ≈ $2-4/tahun)      │
│  │   .my.id     │    Managed via Domainesia/Niagahoster                 │
│  └──────────────┘                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

================================================================================
3. DETAILED COMPONENT SPECIFICATIONS
================================================================================

3.1 FRONTEND (HTML/CSS/JS - Pure, No Framework)
--------------------------------------------------------------------------------

Technology: Vanilla HTML5 + CSS3 + ES6 JavaScript
Framework: NONE (React/Vue/Next.js = overkill for this use case)

Rationale:
- Cloudflare Pages = static hosting optimized for HTML/CSS/JS
- No build step required = instant deploy, no build minutes quota
- 16-bit retro style = easier with pure CSS than framework overrides
- SEO = perfect (server-rendered HTML, no hydration needed)
- Performance = fastest possible (0KB JavaScript bundle)

Visual Style: 16-Bit Nostalgia Gaming
- Font: Press Start 2P (Google Fonts) - pixel font
- Color Palette: 16-bit era colors
  --bg-dark: #0f0f23 (navy dark)
  --bg-panel: #1a1a2e (panel background)
  --accent: #ff6b6b (red pixel)
  --accent2: #4ecdc4 (cyan pixel)
  --accent3: #ffe66d (yellow pixel)
  --text: #e0e0e0 (light gray)
  --text-dim: #888 (dark gray)
  --border: #333 (dark border)

Animations (12+ effects, all CSS @keyframes):
1. CRT Scanline + Flicker Effect - monitor retro berkedip
2. Glitch Text Effect - teks error seperti hacker
3. Floating Pixel Particles - partikel pixel berjatuhan
4. Typing Cursor Blink - kursor berkedip
5. 8-Bit Loading Bar - progress bar retro
6. Hover Glow Border - card glow saat hover
7. Marquee Scrolling Text - teks berjalan
8. Pulse Glow - elemen berdenyut
9. Pixel Sprite Bounce - sprite 32px melompat
10. Rainbow Text Shift - warna pelangi bergerak
11. Scanline Wipe - transisi halaman
12. Noise Texture - grain film vintage

Pages:
1. Homepage (/)
   - Hero section dengan glitch text
   - Article grid dengan hover effects
   - Category navigation
   - Stats bar (total articles, this month, success rate)

2. Article Page (/:slug)
   - Full article content
   - Meta info (date, word count, category, AI model)
   - Tags
   - Related articles
   - Back to home button

3. Admin Panel (/admin)
   - Pipeline queue status
   - Step indicators (1-2-3-4)
   - Publish/Edit/Delete buttons
   - Stats dashboard
   - Failed items review

Responsive: Mobile-first (90% Indonesia traffic via mobile)
- Font size minimum 16px for readability
- Single column on mobile
- Touch-friendly buttons (min 44px)

3.2 BACKEND (Cloudflare Workers)
--------------------------------------------------------------------------------

Technology: Cloudflare Workers (Serverless Edge Computing)
Runtime: JavaScript/TypeScript
Cost: FREE (100,000 requests/day)

API Endpoints:

POST /api/generate
  - Trigger article generation pipeline
  - Body: { topic, keywords, category }
  - Returns: { success, articleId, queueId, status }
  - Authentication: None (protected by cron only)

GET /api/articles
  - List published articles
  - Query params: page, limit, category
  - Returns: Array of articles
  - Public access (no auth)

GET /api/articles/:slug
  - Get single article by slug
  - Returns: Article object
  - Public access

GET /api/queue
  - Admin: List pipeline queue items
  - Returns: Array of queue items with status
  - Protected: Simple token or IP whitelist

POST /api/publish/:id
  - Admin: Publish article from queue
  - Updates queue status to 'published'
  - Protected: Admin token

Sequential Pipeline (Anti-Failure):

Step 1: Outline Generation
  - Input: topic, keywords
  - Output: JSON { title, sections: [{name, keyPoints}] }
  - Validation: Valid JSON, title >= 10 chars, sections >= 2, no generic text
  - Retry: 3x with exponential backoff (2s, 4s, 8s)
  - Fallback: Switch to backup model
  - On fail: Save to queue as 'failed_step1'

Step 2: Draft Generation
  - Input: outline from Step 1
  - Output: Article content (800-1000 words)
  - Validation: Content >= 2000 chars, >= 400 words, no repetition > 30%, contains keywords
  - Retry: 3x with exponential backoff
  - Fallback: Switch to backup model
  - On fail: Save to queue as 'needs_review'

Step 3: Polish Generation
  - Input: draft from Step 2
  - Output: JSON { title, content, metaDescription, excerpt }
  - Validation: Content >= 2500 chars, metaDescription 100-170 chars, excerpt >= 100 chars
  - Retry: 3x with exponential backoff
  - Fallback: Switch to backup model
  - On fail: Publish draft as-is (without polish)

Final: Save to Database
  - Insert into articles table with status 'published'
  - Update queue status to 'published'

3.3 DATABASE (Supabase Free Tier)
--------------------------------------------------------------------------------

Technology: Supabase (PostgreSQL + PostgREST API)
Plan: Free Tier
Cost: $0/month
Limits: 500MB database, 1GB file storage, 50K MAU, 500K edge function invocations

Tables:

articles (Published Articles)
  - id: UUID PRIMARY KEY DEFAULT gen_random_uuid()
  - title: TEXT NOT NULL
  - slug: TEXT UNIQUE NOT NULL
  - content: TEXT NOT NULL
  - excerpt: TEXT
  - meta_description: TEXT
  - keywords: TEXT[]
  - category: TEXT
  - status: TEXT DEFAULT 'draft' CHECK ('draft', 'published')
  - featured_image: TEXT
  - word_count: INTEGER
  - ai_model: TEXT
  - created_at: TIMESTAMP DEFAULT NOW()
  - published_at: TIMESTAMP
  - views: INTEGER DEFAULT 0

article_queue (Pipeline Queue)
  - id: UUID PRIMARY KEY DEFAULT gen_random_uuid()
  - topic: TEXT NOT NULL
  - keywords: TEXT[]
  - category: TEXT
  - current_step: INTEGER DEFAULT 0
  - status: TEXT DEFAULT 'pending' CHECK ('pending', 'processing', 'outline_done', 'draft_done', 'polish_done', 'published', 'failed', 'needs_review')
  - step1_data: JSONB
  - step2_data: JSONB
  - step3_data: JSONB
  - step1_validated: BOOLEAN DEFAULT FALSE
  - step2_validated: BOOLEAN DEFAULT FALSE
  - step3_validated: BOOLEAN DEFAULT FALSE
  - step1_retries: INTEGER DEFAULT 0
  - step2_retries: INTEGER DEFAULT 0
  - step3_retries: INTEGER DEFAULT 0
  - last_error: TEXT
  - error_step: INTEGER
  - model_used: TEXT
  - created_at: TIMESTAMP DEFAULT NOW()
  - updated_at: TIMESTAMP DEFAULT NOW()
  - completed_at: TIMESTAMP
  - article_id: UUID REFERENCES articles(id)

settings (Configuration)
  - key: TEXT PRIMARY KEY
  - value: JSONB
  - created_at: TIMESTAMP DEFAULT NOW()
  - updated_at: TIMESTAMP DEFAULT NOW()

Row Level Security (RLS):
  - articles: Public read for published articles only
  - article_queue: Public insert (for cron), admin read/update
  - settings: Admin only

3.4 AI ENGINE (OpenRouter)
--------------------------------------------------------------------------------

Technology: OpenRouter API (Unified LLM API)
Plan: Free Tier (50 requests/hour)
Optional: $10 deposit → 1,000 requests/hour
Cost: $0/month (free tier sufficient for 2 articles/day)

Models (Primary + Fallbacks):
1. Primary: deepseek/deepseek-chat-v3-0324:free
   - Context: 64K tokens
   - Strength: Coding, structured output
   - Cost: $0 (free tier)

2. Fallback 1: meta-llama/llama-4-maverick:free
   - Context: 1M tokens
   - Strength: Long context, natural writing
   - Cost: $0 (free tier)

3. Fallback 2: mistralai/mistral-small-3.1-24b-instruct:free
   - Context: 128K tokens
   - Strength: Balanced speed/quality
   - Cost: $0 (free tier)

Token Usage per Article (3-step pipeline):
  Step 1 (Outline): Input 2K tokens, Output 1K tokens
  Step 2 (Draft): Input 3K tokens, Output 5K tokens
  Step 3 (Polish): Input 5K tokens, Output 3K tokens
  Total per article: ~19K tokens

Daily usage: 2 articles × 19K = 38K tokens
Monthly usage: 60 articles × 19K = 1.14M tokens

API Calls per Article: 3 calls (outline + draft + polish)
Daily API calls: 2 articles × 3 = 6 calls
Monthly API calls: 60 × 3 = 180 calls

Free tier limit: 50 requests/hour = 1,200/day = 36,000/month
Usage: 180/month = 0.5% of limit ✓

3.5 CRON JOB (GitHub Actions)
--------------------------------------------------------------------------------

Technology: GitHub Actions (Workflow Scheduler)
Plan: Free (public repo)
Cost: $0/month
Limits: 2,000 minutes/month, 20 concurrent jobs

Schedule:
  - 08:00 WIB (01:00 UTC): Article #1
  - 20:00 WIB (13:00 UTC): Article #2
  - Total: 2 runs/day = 60 runs/month
  - Duration: ~1 minute per run
  - Total minutes: 60/month = 3% of limit ✓

Workflow: .github/workflows/generate-articles.yml
  - Trigger: schedule (cron) + manual (workflow_dispatch)
  - Runner: ubuntu-latest
  - Steps:
    1. Checkout code
    2. Call API endpoint /api/generate with topic
    3. Log response
    4. On failure: retry once, then alert

3.6 DOMAIN & DNS
--------------------------------------------------------------------------------

Domain: yourname.my.id
Registrar: Domainesia or Niagahoster
Cost: ~Rp 25,000-50,000/year ($2-4/year)

DNS Setup:
  1. Purchase domain from registrar
  2. Add site to Cloudflare
  3. Copy Cloudflare nameservers
  4. Paste nameservers to registrar
  5. Wait for propagation (24-48 hours)
  6. Configure DNS records in Cloudflare:
     - Type: CNAME
     - Name: @ (root) or www
     - Target: your-worker.your-subdomain.workers.dev
     - Proxy: Enabled (orange cloud)

SSL: Auto (Cloudflare provides free SSL/TLS)
CDN: Auto (Cloudflare global CDN, 300+ locations)

================================================================================
4. USER INTERFACE DESIGN
================================================================================

4.1 HOMEPAGE (/)
--------------------------------------------------------------------------------

Layout Structure:
┌─────────────────────────────────────────┐
│  HEADER (CRT scanline + flicker)        │
│  ┌─────────────────────────────────┐   │
│  │  🎮 RETRO AI BLOG               │   │
│  │  ◄ Articles by AI • 16-Bit ►   │   │
│  └─────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  NAVIGATION (Pixel buttons)             │
│  [HOME] [AI] [MARKETING] [FREELANCE]  │
│  [CODING] [CRYPTO] [ADMIN]              │
├─────────────────────────────────────────┤
│  HERO SECTION (Glitch text)             │
│  ┌─────────────────────────────────┐   │
│  │  ► SELAMAT DATANG ◄            │   │
│  │  Artikel di-generate otomatis   │   │
│  │  Press START to read ▶           │   │
│  └─────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  STATS BAR (Pixel boxes)                │
│  ┌────────┐ ┌────────┐ ┌────────┐    │
│  │ 142    │ │ 28     │ │ 94%    │    │
│  │ARTICLES│ │MONTH   │ │SUCCESS │    │
│  └────────┘ └────────┘ └────────┘    │
├─────────────────────────────────────────┤
│  ARTICLE GRID (Hover glow cards)        │
│  ┌────────────┐ ┌────────────┐         │
│  │ ► AI       │ │ ► MARKETING│         │
│  │ ChatGPT... │ │ SEO untuk..│         │
│  │ 📅 09 Jul  │ │ 📅 08 Jul  │         │
│  │ ● PUBLISHED│ │ ● PUBLISHED│         │
│  └────────────┘ └────────────┘         │
│  ┌────────────┐ ┌────────────┐         │
│  │ ► FREELANCE│ │ ► CODING   │         │
│  │ ...        │ │ ...        │         │
│  └────────────┘ └────────────┘         │
├─────────────────────────────────────────┤
│  MARQUEE (Scrolling text)               │
│  ◄ WELCOME TO RETRO AI BLOG ► ...     │
├─────────────────────────────────────────┤
│  FOOTER (Pixel art + cursor blink)      │
│  👾 🕹️ 🎮 👾                            │
│  © 2026 RETRO AI BLOG                   │
│  INSERT COIN TO CONTINUE... ▋           │
└─────────────────────────────────────────┘

4.2 ARTICLE PAGE (/:slug)
--------------------------------------------------------------------------------

Layout Structure:
┌─────────────────────────────────────────┐
│  HEADER (Same as homepage)              │
├─────────────────────────────────────────┤
│  ARTICLE HEADER (Pixel border)          │
│  ┌─────────────────────────────────┐   │
│  │  ► Article Title Here           │   │
│  │  📅 09 Jul 2026 • 📝 2,450 kata │   │
│  │  🏷️ AI • 🤖 deepseek-v3         │   │
│  └─────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  ARTICLE CONTENT (Pixel panel)            │
│  ┌─────────────────────────────────┐   │
│  │  [Content text here...]         │   │
│  │  [H2 headings]                  │   │
│  │  [Paragraphs]                   │   │
│  │  [Lists]                        │   │
│  └─────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  TAGS (Pixel badges)                      │
│  [ai] [chatgpt] [produktivitas]         │
├─────────────────────────────────────────┤
│  BACK BUTTON (Retro style)              │
│  [← BACK TO HOME]                       │
├─────────────────────────────────────────┤
│  FOOTER (Same as homepage)              │
└─────────────────────────────────────────┘

4.3 ADMIN PANEL (/admin)
--------------------------------------------------------------------------------

Layout Structure:
┌─────────────────────────────────────────┐
│  HEADER: ⚙️ ADMIN PANEL                 │
├─────────────────────────────────────────┤
│  STATS DASHBOARD (4 pixel boxes)        │
│  ┌────────┐ ┌────────┐ ┌────────┐      │
│  │ 142    │ │ 28     │ │ 5      │      │
│  │ QUEUED │ │PUBLISH │ │ FAILED │      │
│  └────────┘ └────────┘ └────────┘      │
├─────────────────────────────────────────┤
│  PIPELINE QUEUE (List view)             │
│  ┌─────────────────────────────────┐   │
│  │ Topic: AI for Productivity      │   │
│  │ [1]✓ [2]✓ [3]○ [4]○           │   │
│  │ Status: PROCESSING              │   │
│  │ [✓ PUBLISH] [✎ EDIT] [✗ DEL]  │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ Topic: SEO for UMKM             │   │
│  │ [1]✓ [2]✓ [3]✓ [4]✓           │   │
│  │ Status: READY TO PUBLISH        │   │
│  │ [✓ PUBLISH] [✎ EDIT] [✗ DEL]  │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ Topic: Crypto Basics            │   │
│  │ [1]✓ [2]✗ [3]○ [4]○           │   │
│  │ Status: NEEDS REVIEW            │   │
│  │ Error: Content too short        │   │
│  │ [↻ RETRY] [✎ EDIT] [✗ SKIP]   │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘

Step Indicator:
  [1] = Outline (○ = pending, ◐ = processing, ✓ = done, ✗ = failed)
  [2] = Draft
  [3] = Polish
  [4] = Publish

================================================================================
5. DATA FLOW & WORKFLOW
================================================================================

5.1 ARTICLE GENERATION WORKFLOW
--------------------------------------------------------------------------------

┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  CRON   │────►│  STEP 1 │────►│  STEP 2 │────►│  STEP 3 │────►│  SAVE   │
│ TRIGGER │     │ OUTLINE │     │  DRAFT  │     │ POLISH  │     │ TO DB   │
│(GitHub) │     │         │     │         │     │         │     │         │
└─────────┘     └────┬────┘     └────┬────┘     └────┬────┘     └─────────┘
                     │               │               │
                     ▼               ▼               ▼
                ┌─────────┐    ┌─────────┐    ┌─────────┐
                │VALIDATE?│    │VALIDATE?│    │VALIDATE?│
                │  ✓PASS  │    │  ✓PASS  │    │  ✓PASS  │
                │    ↓    │    │    ↓    │    │    ↓    │
                │  NEXT   │    │  NEXT   │    │  SAVE   │
                │         │    │         │    │         │
                │  ✗FAIL  │    │  ✗FAIL  │    │  ✗FAIL  │
                │ RETRY 3x│    │ RETRY 3x│    │ RETRY 3x│
                │         │    │         │    │         │
                │ ✗✗✗     │    │ ✗✗✗     │    │ ✗✗✗     │
                │ FALLBACK│    │ FALLBACK│    │ FALLBACK│
                │ MODEL   │    │ MODEL   │    │ MODEL   │
                │         │    │         │    │         │
                │ ✗✗✗✗    │    │ ✗✗✗✗    │    │ ✗✗✗✗    │
                │ QUEUE   │    │ QUEUE   │    │ SAVE    │
                │ FAILED  │    │ REVIEW  │    │ DRAFT   │
                └─────────┘    └─────────┘    └─────────┘

5.2 USER JOURNEY
--------------------------------------------------------------------------------

Visitor Journey:
1. User visits yourname.my.id
2. Cloudflare Worker serves HTML/CSS/JS
3. Browser renders retro 16-bit UI
4. JavaScript fetches articles from /api/articles
5. Articles displayed in grid with hover effects
6. User clicks article → navigates to /:slug
7. Article content displayed with pixel styling
8. User reads, clicks back, or shares

Admin Journey:
1. Admin visits yourname.my.id/admin
2. Sees pipeline queue status
3. Reviews articles in 'needs_review' status
4. Clicks 'PUBLISH' to approve
5. Article goes live instantly

================================================================================
6. MONETIZATION STRATEGY
================================================================================

Phase 1: Month 1-3 (Build Content)
- Goal: 60+ articles published
- Revenue: $0
- Focus: Quality, SEO, AdSense application

Phase 2: Month 4-6 (AdSense + Affiliate)
- Google AdSense (display ads)
- Affiliate links (AI tools, hosting, courses)
- Revenue target: $10-50/month

Phase 3: Month 7-12 (Scale)
- Multiple affiliate programs
- Sponsored posts (optional)
- Newsletter/mailing list
- Revenue target: $50-300/month

Phase 4: Year 2+ (Expand)
- Additional niches/sites
- Premium content (optional)
- Digital products (templates, guides)
- Revenue target: $300-1000/month

Affiliate Programs for Indonesia:
- Hosting: Niagahoster (30%), DomaiNesia (25%)
- AI Tools: Jasper AI (30% recurring), Copy.ai (25%)
- Crypto: Binance (20-40%), Indodax (10-25%)
- Education: Hacktiv8 (Rp 500K-1M/sale), Dicoding (10-20%)
- Tools: Canva (up to $36/sale), Shopify ($58/sale)

================================================================================
7. DEPLOYMENT PLAN
================================================================================

7.1 PRE-DEPLOYMENT CHECKLIST
--------------------------------------------------------------------------------

□ Domain purchased (.my.id)
□ Cloudflare account created
□ Nameservers updated at registrar
□ DNS propagation confirmed (24-48h)
□ Supabase account created
□ Project created (region: Singapore)
□ SQL schema executed
□ API keys copied (URL + Anon Key)
□ OpenRouter account created
□ API key generated
□ GitHub account created
□ Repository created (public)

7.2 DEPLOYMENT STEPS
--------------------------------------------------------------------------------

STEP 1: Local Development Setup (10 minutes)
  1.1 Install Node.js (if not installed)
  1.2 Install Wrangler CLI:
      npm install -g wrangler
  1.3 Login to Cloudflare:
      wrangler login
  1.4 Create project directory:
      mkdir retro-ai-blog
      cd retro-ai-blog
  1.5 Initialize Wrangler:
      wrangler init

STEP 2: Code Implementation (30 minutes)
  2.1 Create worker.js (copy from PRD code)
  2.2 Create wrangler.toml (copy from PRD config)
  2.3 Set secrets:
      wrangler secret put OPENROUTER_API_KEY
      wrangler secret put SUPABASE_URL
      wrangler secret put SUPABASE_ANON_KEY
  2.4 Test locally:
      wrangler dev

STEP 3: Database Setup (10 minutes)
  3.1 Open Supabase SQL Editor
  3.2 Execute schema.sql (from PRD)
  3.3 Verify tables created
  3.4 Enable RLS policies

STEP 4: Deploy to Production (5 minutes)
  4.1 Deploy worker:
      wrangler deploy
  4.2 Copy worker URL
  4.3 Add CNAME record in Cloudflare:
      - Type: CNAME
      - Name: @
      - Target: your-worker.your-subdomain.workers.dev
      - Proxy: Enabled
  4.4 Verify: yourname.my.id loads

STEP 5: GitHub Actions Setup (10 minutes)
  5.1 Create .github/workflows/generate-articles.yml
  5.2 Add repository secret: API_ENDPOINT (yourname.my.id/api/generate)
  5.3 Push to GitHub
  5.4 Verify Actions tab shows workflow
  5.5 Test manual trigger

STEP 6: Testing & Verification (15 minutes)
  6.1 Visit homepage: yourname.my.id
  6.2 Check 16-bit retro styling loads
  6.3 Check articles load from API
  6.4 Test admin panel: yourname.my.id/admin
  6.5 Trigger manual generation via API
  6.6 Verify article appears in queue
  6.7 Publish test article
  6.8 Verify article appears on homepage

STEP 7: Post-Launch (Ongoing)
  7.1 Monitor GitHub Actions runs (daily)
  7.2 Review admin panel for failed items
  7.3 Apply for Google AdSense (month 2-3)
  7.4 Apply for affiliate programs
  7.5 Monitor traffic with Cloudflare Analytics

Total Setup Time: ~80 minutes (1 hour 20 minutes)

================================================================================
8. COST BREAKDOWN
================================================================================

Monthly Costs:
┌────────────────────────────────────────────────────────┐
│  Domain .my.id          │  $0.20  │  Rp 3,200   │
│  (Rp 25-50K/year)       │         │             │
├────────────────────────────────────────────────────────┤
│  Cloudflare Pages       │  $0     │  Rp 0       │
│  (Unlimited bandwidth)  │         │             │
├────────────────────────────────────────────────────────┤
│  Cloudflare Workers     │  $0     │  Rp 0       │
│  (100K requests/day)    │         │             │
├────────────────────────────────────────────────────────┤
│  Supabase Free          │  $0     │  Rp 0       │
│  (500MB + 1GB storage)  │         │             │
├────────────────────────────────────────────────────────┤
│  OpenRouter Free        │  $0     │  Rp 0       │
│  (50 req/hr)            │         │             │
├────────────────────────────────────────────────────────┤
│  GitHub Actions         │  $0     │  Rp 0       │
│  (2,000 min/month)      │         │             │
├────────────────────────────────────────────────────────┤
│  SSL Certificate        │  $0     │  Rp 0       │
│  (Auto by Cloudflare)   │         │             │
├────────────────────────────────────────────────────────┤
│  CDN                    │  $0     │  Rp 0       │
│  (300+ locations)       │         │             │
├────────────────────────────────────────────────────────┤
│  TOTAL                  │  $0.20  │  Rp 3,200   │
│  PER YEAR               │  $2.40  │  Rp 38,400  │
└────────────────────────────────────────────────────────┘

Budget: $5/year = Rp 80,000/year
Actual: $2.40/year = Rp 38,400/year
Sisa: $2.60/year = Rp 41,600/year (buffer/scale)

================================================================================
9. RISK ANALYSIS & MITIGATION
================================================================================

Risk 1: OpenRouter Rate Limit (50 req/hr)
  Impact: Pipeline fails if limit exceeded
  Probability: Low (only 6 req/day needed)
  Mitigation:
    - Stagger cron schedule (08:00 and 20:00)
    - Implement retry with exponential backoff
    - Fallback to backup models
    - Optional: $10 deposit for 1,000 req/hr

Risk 2: Supabase Pauses After 7 Days Inactivity
  Impact: Database unavailable
  Probability: Medium (free tier behavior)
  Mitigation:
    - Ping database every 6 hours via cron
    - Or: Use GitHub Actions to keep alive
    - Or: Upgrade to Pro ($25/month) when revenue comes

Risk 3: Content Quality Issues
  Impact: Google penalizes thin content
  Probability: Medium (AI-generated)
  Mitigation:
    - Sequential pipeline with validation
    - Human review in admin panel (month 1-2)
    - Minimum word count: 800+ words
    - No repetition > 30%
    - Unique titles and content

Risk 4: AdSense Rejection
  Impact: No ad revenue
  Probability: Medium (new site)
  Mitigation:
    - Build 30+ quality articles before applying
    - Ensure unique, valuable content
    - Proper About, Contact, Privacy pages
    - No placeholder content
    - Apply month 2-3

Risk 5: Cloudflare Workers Limits
  Impact: API unavailable
  Probability: Very Low (100K/day limit)
  Mitigation:
    - Current usage: ~200 requests/day
    - Limit: 100,000/day
    - Usage: 0.2% of limit
    - Upgrade path: Workers Paid ($5/month)

Risk 6: AI Model Downtime
  Impact: Article generation fails
  Probability: Low
  Mitigation:
    - 3 fallback models configured
    - Retry mechanism (3x per model)
    - Queue system for failed items
    - Manual retry via admin panel

================================================================================
10. SUCCESS METRICS
================================================================================

Technical Metrics:
- Pipeline success rate: > 90%
- Average generation time: < 5 minutes per article
- Website uptime: > 99% (Cloudflare SLA)
- Page load time: < 2 seconds (global CDN)
- API response time: < 500ms

Content Metrics:
- Articles published: 60/month (2/day)
- Average word count: 800-1000 words
- Unique content rate: 100% (no duplicates)
- Failed generation rate: < 10%

Business Metrics (Month 1-12):
- Month 1-3: 60 articles, 0-500 visitors/month, $0 revenue
- Month 4-6: 120 articles, 500-2,000 visitors/month, $0-10 revenue
- Month 7-9: 180 articles, 2,000-10,000 visitors/month, $10-50 revenue
- Month 10-12: 240 articles, 10,000-30,000 visitors/month, $50-150 revenue
- Year 2: 720+ articles, 30,000-100,000 visitors/month, $150-500 revenue

================================================================================
11. FUTURE ENHANCEMENTS (Post-MVP)
================================================================================

Phase 2 (Month 3-6):
- Multiple niches (5 sites network)
- Image generation (AI-generated featured images)
- Social media auto-post (Twitter/X, Facebook)
- Newsletter subscription (email list)
- Comment system (Disqus or native)

Phase 3 (Month 6-12):
- Multi-language support (English)
- Advanced SEO (schema markup, sitemap)
- Analytics dashboard (beyond Cloudflare)
- A/B testing for article titles
- Content calendar/scheduling

Phase 4 (Year 2+):
- Mobile app (PWA)
- Video content (AI-generated scripts)
- Podcast (AI-generated transcripts)
- Premium subscription (exclusive content)
- API for third-party access

================================================================================
12. APPENDIX: COMPLETE CODE
================================================================================

12.1 FULL WORKER.JS (Production Ready)
--------------------------------------------------------------------------------

[See file: worker.js - 35,673 characters]

12.2 WRANGLER.TOML (Cloudflare Config)
--------------------------------------------------------------------------------

[See file: wrangler.toml - 449 characters]

12.3 SCHEMA.SQL (Supabase Database)
--------------------------------------------------------------------------------

[See file: schema.sql - 6,377 characters]

12.4 GITHUB ACTIONS WORKFLOW
--------------------------------------------------------------------------------

[See file: .github/workflows/generate-articles.yml - 1,924 characters]

12.5 README.MD
--------------------------------------------------------------------------------

[See file: README.md - 1,321 characters]

================================================================================
13. PROJECT STRUCTURE
================================================================================

retro-ai-blog/
├── worker.js                          ← Main file (frontend + backend + API)
│                                       │  35,673 characters
│                                       │  Contains:
│                                       │  - API handlers (/api/generate, /api/articles, /api/queue, /api/publish, /api/delete)
│                                       │  - Sequential pipeline class (ArticlePipeline)
│                                       │  - HTML renderers (homepage, article, admin)
│                                       │  - 12+ CSS animations embedded
│                                       │  - Anti-failure validation per step
│                                       │  - Retry mechanism (3x + fallback models)
│                                       │  - Queue system for failed items
│                                       │
├── wrangler.toml                      ← Cloudflare Workers configuration
│                                       │  - Worker name: retro-ai-blog
│                                       │  - Entry point: worker.js
│                                       │  - Compatibility date: 2026-07-09
│                                       │  - Secrets: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
│                                       │
├── schema.sql                         ← Supabase PostgreSQL schema
│                                       │  - Table: articles (published articles)
│                                       │  - Table: article_queue (pipeline queue)
│                                       │  - Table: settings (configuration)
│                                       │  - Indexes for performance
│                                       │  - Row Level Security (RLS) policies
│                                       │  - Auto-update timestamps
│                                       │  - Views for monitoring
│                                       │
├── .github/
│   └── workflows/
│       └── generate-articles.yml      ← GitHub Actions cron workflow
│                                       │  - Trigger: 2x/day (08:00 & 20:00 WIB)
│                                       │  - Manual trigger: workflow_dispatch
│                                       │  - Generates 2 articles per run
│                                       │  - Retry mechanism (2 retries, 5s delay)
│                                       │  - Timeout: 5 minutes
│                                       │
└── README.md                          ← Project documentation
                                        │  - Quick start guide
                                        │  - Deploy steps
                                        │  - Cost breakdown
                                        │  - Features list
                                        │  - License (MIT)

================================================================================
14. SUMMARY
================================================================================

Product: Retro AI Blog - 16-Bit Nostalgia Edition
Budget: $5/year (Rp 80,000/tahun)
Actual Cost: $2.40/year (Rp 38,400/tahun)
Setup Time: ~80 minutes
Maintenance: ~5 minutes/day (review admin panel)

Key Features:
✅ 2 articles/day auto-generation
✅ 16-bit retro gaming style (12+ animations)
✅ Sequential pipeline (anti-failure)
✅ Human review gate (admin panel)
✅ 100% free infrastructure
✅ Mobile-first responsive
✅ SEO optimized
✅ Indonesia market (Bahasa Indonesia)

Revenue Potential:
Month 1-3: $0 (build phase)
Month 4-6: $10-50/month (AdSense + Affiliate)
Month 7-12: $50-300/month (scale)
Year 2+: $300-1000/month (expand)

Risk Level: LOW (sequential pipeline, validation, retry, fallback)
Scalability: HIGH (expand to 5 niches, multiple sites)

================================================================================
END OF PRD
================================================================================
