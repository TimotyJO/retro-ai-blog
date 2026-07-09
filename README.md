# 🎮 Retro AI Blog - 16-Bit Nostalgia Edition

Artikel AI di-generate otomatis dengan style retro 16-bit gaming era 90an.

## 🚀 Quick Start

### Prerequisites
- Node.js (for Wrangler CLI)
- Cloudflare account
- Supabase account
- OpenRouter account
- Domain .my.id (Domainesia/Niagahoster)

### Deploy Steps

1. **Clone repo**
   ```bash
   git clone https://github.com/yourusername/retro-ai-blog.git
   cd retro-ai-blog
   ```

2. **Install Wrangler**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

3. **Set secrets**
   ```bash
   wrangler secret put OPENROUTER_API_KEY
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_ANON_KEY
   ```

4. **Deploy**
   ```bash
   wrangler deploy
   ```

5. **Setup database**
   - Open Supabase SQL Editor
   - Run `schema.sql`

6. **Setup GitHub Actions**
   - Push to GitHub
   - Add repository secret: `API_ENDPOINT`

## 💰 Cost

| Item | Cost |
|------|------|
| Domain .my.id | ~Rp 25-50K/tahun |
| Cloudflare | FREE |
| Supabase | FREE |
| OpenRouter | FREE |
| GitHub Actions | FREE |
| **Total** | **~$2-4/tahun** |

## 🎨 Features

- 12+ CSS animations (CRT, glitch, particles, etc.)
- Sequential AI pipeline (anti-failure)
- 2 articles/day auto-generation
- Admin panel for review
- Mobile-first responsive
- SEO optimized

## 📄 License

MIT
