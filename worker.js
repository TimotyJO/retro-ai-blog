// ============================================================
// RETRO AI BLOG - Cloudflare Worker (Production Ready)
// 16-Bit Nostalgia Edition
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'text/html'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // Route handling
    if (url.pathname === '/') {
      return await renderHomepage(env, headers);
    }
    if (url.pathname === '/admin') {
      if (url.searchParams.get('logout')) {
        const cookie = `admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
        return new Response(null, { status: 302, headers: { 'Location': '/', 'Set-Cookie': cookie } });
      }
      const session = getCookie(request, 'admin_session');
      if (session === env.ADMIN_SESSION) {
        return await renderAdmin(env, headers);
      }
      if (request.method === 'POST') {
        let pwd = '';
        try { const form = await request.formData(); pwd = form.get('password') || ''; } catch (e) {}
        if (pwd === env.ADMIN_PASSWORD) {
          const cookie = `admin_session=${env.ADMIN_SESSION}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`;
          return new Response(null, { status: 302, headers: { 'Location': '/admin', 'Set-Cookie': cookie } });
        }
        return renderLogin(env, headers, true);
      }
      return renderLogin(env, headers, false);
    }
    if (url.pathname.startsWith('/api/')) {
      return await handleAPI(request, env, url, headers);
    }
    // Article page: /:slug
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/' && url.pathname !== '/admin') {
      return await renderArticle(env, headers, url.pathname.slice(1));
    }

    return new Response('404 NOT FOUND', { status: 404, headers });
  }
};

function getCookie(request, name) {
  const raw = request.headers.get('Cookie');
  if (!raw) return null;
  const match = raw.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

// ============================================================
// API HANDLERS
// ============================================================

async function handleAPI(request, env, url, headers) {
  headers['Content-Type'] = 'application/json';

  // POST /api/generate - Trigger article generation (protected by CRON_SECRET)
  if (url.pathname === '/api/generate' && request.method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }
    let body = {};
    try { body = await request.json(); } catch (e) { body = {}; }
    const { topic, keywords, category } = body;
    const topics = [
      'Sejarah Evolusi Konsol Game 16-Bit',
      'Mengapa Pixel Art Tetap Relevan di Era Modern',
      'Kisah Lahirnya Soundtrack Chiptune',
      'Perbandingan RPG Klasik vs RPG Modern',
      'Filosofi Game Arcade Tahun 90an',
      'Nostalgia Cartridge vs CD-ROM',
      'Desain Level Game Retro yang Jenius',
      'Budaya Gaming Anak 90an di Indonesia'
    ];
    const finalTopic = topic || topics[Math.floor(Math.random() * topics.length)];
    const pipeline = new ArticlePipeline(env);
    const result = await pipeline.generateArticle(finalTopic, keywords, category);
    return new Response(JSON.stringify(result), { headers });
  }

  // GET /api/articles - List published articles
  if (url.pathname === '/api/articles' && request.method === 'GET') {
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 10;
    const category = url.searchParams.get('category');

    let query = `${env.SUPABASE_URL}/rest/v1/articles?status=eq.published&order=published_at.desc&limit=${limit}&offset=${(page-1)*limit}`;
    if (category) query += `&category=eq.${category}`;

    const response = await fetch(query, {
      headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` }
    });
    const articles = await response.json();
    return new Response(JSON.stringify(articles), { headers });
  }

  // GET /api/queue - Admin queue status
  if (url.pathname === '/api/queue' && request.method === 'GET') {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/article_queue?order=created_at.desc&limit=20`,
      { headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` }}
    );
    const queue = await response.json();
    return new Response(JSON.stringify(queue), { headers });
  }

  // POST /api/publish/:id - Publish from queue
  if (url.pathname.match(/^\/api\/publish\/[\w-]+$/) && request.method === 'POST') {
    const id = url.pathname.split('/').pop();
    await fetch(`${env.SUPABASE_URL}/rest/v1/article_queue?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: 'published', completed_at: new Date().toISOString() })
    });
    return new Response(JSON.stringify({ success: true }), { headers });
  }

  // DELETE /api/delete/:id - Delete queue item
  if (url.pathname.match(/^\/api\/delete\/[\w-]+$/) && request.method === 'DELETE') {
    const id = url.pathname.split('/').pop();
    await fetch(`${env.SUPABASE_URL}/rest/v1/article_queue?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      }
    });
    return new Response(JSON.stringify({ success: true }), { headers });
  }

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
}

// ============================================================
// SEQUENTIAL PIPELINE CLASS (Anti-Failure)
// ============================================================

class ArticlePipeline {
  constructor(env) {
    this.env = env;
    this.models = [
      'deepseek/deepseek-chat-v3-0324:free',
      'meta-llama/llama-4-maverick:free',
      'mistralai/mistral-small-3.1-24b-instruct:free'
    ];
    this.maxRetries = 3;
  }

  async generateArticle(topic, keywords, category) {
    const queueId = await this.createQueue(topic, keywords, category);

    // STEP 1: Outline (MUST PASS)
    const step1 = await this.runStep(queueId, 1, 'outline', topic, keywords, null);
    if (!step1.success) {
      await this.updateQueue(queueId, { status: 'failed', last_error: step1.error, error_step: 1 });
      return { success: false, error: step1.error, queueId };
    }

    // STEP 2: Draft (MUST PASS - only runs if Step 1 valid)
    const step2 = await this.runStep(queueId, 2, 'draft', topic, keywords, step1.data);
    if (!step2.success) {
      await this.updateQueue(queueId, { status: 'needs_review', last_error: step2.error, error_step: 2 });
      return { success: false, error: step2.error, queueId, needsReview: true };
    }

    // STEP 3: Polish (MUST PASS - only runs if Step 2 valid)
    const step3 = await this.runStep(queueId, 3, 'polish', topic, keywords, step2.data);
    if (!step3.success) {
      const articleId = await this.publishDraft(queueId, step1.data, step2.data, category);
      return { success: true, warning: 'Polish failed, published as draft', articleId, queueId };
    }

    // ALL PASSED - Publish
    const articleId = await this.publishArticle(queueId, step1.data, step2.data, step3.data, category);
    await this.updateQueue(queueId, { status: 'published', article_id: articleId, completed_at: new Date().toISOString() });

    return { success: true, articleId, queueId };
  }

  async runStep(queueId, stepNum, stepName, topic, keywords, previousData) {
    let lastError = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.updateQueue(queueId, {
          status: 'processing',
          current_step: stepNum,
          [`step${stepNum}_retries`]: attempt + 1
        });

        const model = this.models[0];
        const data = await this.callOpenRouter(stepName, topic, keywords, model, previousData);

        const validation = this.validate(stepName, data);
        if (validation.valid) {
          await this.updateQueue(queueId, {
            [`step${stepNum}_data`]: validation.sanitized,
            [`step${stepNum}_validated`]: true
          });
          return { success: true, data: validation.sanitized };
        }

        lastError = validation.error;
        await this.sleep(2000 * Math.pow(2, attempt));

      } catch (error) {
        lastError = error.message;
        await this.sleep(2000 * Math.pow(2, attempt));
      }
    }

    // Fallback models
    for (let i = 1; i < this.models.length; i++) {
      try {
        const data = await this.callOpenRouter(stepName, topic, keywords, this.models[i], previousData);
        const validation = this.validate(stepName, data);
        if (validation.valid) {
          await this.updateQueue(queueId, {
            [`step${stepNum}_data`]: validation.sanitized,
            [`step${stepNum}_validated`]: true,
            model_used: this.models[i]
          });
          return { success: true, data: validation.sanitized };
        }
        lastError = validation.error;
      } catch (error) {
        lastError = error.message;
      }
    }

    return { success: false, error: lastError };
  }

  validate(stepName, data) {
    const validators = {
      outline: (d) => {
        try {
          const parsed = JSON.parse(d);
          if (!parsed.title || parsed.title.length < 10) return { valid: false, error: 'Title too short' };
          if (!parsed.sections || parsed.sections.length < 2) return { valid: false, error: 'Insufficient sections' };
          const content = JSON.stringify(parsed).toLowerCase();
          if (content.includes('lorem ipsum') || content.includes('placeholder')) return { valid: false, error: 'Generic text' };
          return { valid: true, sanitized: parsed };
        } catch (e) { return { valid: false, error: 'Invalid JSON' }; }
      },
      draft: (d) => {
        const content = typeof d === 'string' ? d : d.content || '';
        if (content.length < 2000) return { valid: false, error: `Too short: ${content.length}` };
        const words = content.split(/\s+/).length;
        if (words < 400) return { valid: false, error: `Too few words: ${words}` };
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
        const unique = new Set(sentences.map(s => s.trim().toLowerCase()));
        if (unique.size < sentences.length * 0.7) return { valid: false, error: 'Too much repetition' };
        return { valid: true, sanitized: content };
      },
      polish: (d) => {
        try {
          const parsed = JSON.parse(d);
          if (!parsed.content || parsed.content.length < 2500) return { valid: false, error: 'Content too short' };
          if (!parsed.metaDescription || parsed.metaDescription.length < 100 || parsed.metaDescription.length > 170) {
            return { valid: false, error: 'Invalid meta description' };
          }
          return { valid: true, sanitized: parsed };
        } catch (e) { return { valid: false, error: 'Invalid format' }; }
      }
    };
    return validators[stepName](data);
  }

  async callOpenRouter(step, topic, keywords, model, previousData) {
    const prompts = {
      outline: `Buat outline artikel dalam Bahasa Indonesia tentang "${topic}". Keywords: ${keywords?.join(', ') || 'tutorial, panduan'}. Output JSON: {"title": "...", "sections": [{"name": "...", "keyPoints": ["..."]}]}`,
      draft: `Tulis artikel lengkap dalam Bahasa Indonesia tentang "${topic}". Outline: ${JSON.stringify(previousData)}. Panjang 800-1000 kata. Tone: santai seperti ngobrol sama teman. Gunakan "kamu" bukan "Anda".`,
      polish: `Polish artikel ini. Output JSON: {"title": "...", "content": "...", "metaDescription": "...", "excerpt": "..."}. Artikel: ${typeof previousData === 'string' ? previousData.substring(0, 5000) : JSON.stringify(previousData)}`
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://retroai.my.id',
        'X-Title': 'Retro AI Blog'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'Kamu adalah penulis artikel profesional Indonesia. Hindari pengulangan. Gunakan contoh konkret.' },
          { role: 'user', content: prompts[step] }
        ],
        max_tokens: step === 'polish' ? 14000 : 4000,
        temperature: 0.75
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
  }

  async createQueue(topic, keywords, category) {
    const response = await fetch(`${this.env.SUPABASE_URL}/rest/v1/article_queue`, {
      method: 'POST',
      headers: {
        'apikey': this.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${this.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ topic, keywords, category, status: 'pending' })
    });
    const data = await response.json();
    return data[0].id;
  }

  async updateQueue(id, updates) {
    await fetch(`${this.env.SUPABASE_URL}/rest/v1/article_queue?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': this.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${this.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(updates)
    });
  }

  async publishArticle(queueId, outline, draft, polish, category) {
    const article = {
      title: polish.title || outline.title,
      slug: this.slugify(polish.title || outline.title),
      content: polish.content,
      excerpt: polish.excerpt,
      meta_description: polish.metaDescription,
      keywords: polish.keywords || [],
      category: category || 'general',
      status: 'published',
      word_count: polish.content.split(/\s+/).length,
      ai_model: 'sequential-pipeline',
      published_at: new Date().toISOString()
    };

    const response = await fetch(`${this.env.SUPABASE_URL}/rest/v1/articles`, {
      method: 'POST',
      headers: {
        'apikey': this.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${this.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(article)
    });
    const data = await response.json();
    return data[0].id;
  }

  async publishDraft(queueId, outline, draft, category) {
    const article = {
      title: outline.title,
      slug: this.slugify(outline.title),
      content: typeof draft === 'string' ? draft : draft.content || JSON.stringify(draft),
      excerpt: draft.substring ? draft.substring(0, 200) + '...' : '',
      meta_description: `Artikel tentang ${outline.title}`,
      keywords: [],
      category: category || 'general',
      status: 'published',
      word_count: (typeof draft === 'string' ? draft : '').split(/\s+/).length,
      ai_model: 'sequential-pipeline-draft',
      published_at: new Date().toISOString()
    };

    const response = await fetch(`${this.env.SUPABASE_URL}/rest/v1/articles`, {
      method: 'POST',
      headers: {
        'apikey': this.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${this.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(article)
    });
    const data = await response.json();
    return data[0].id;
  }

  slugify(text) {
    return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').substring(0, 100);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// HTML RENDERERS (16-Bit Retro Style)
// ============================================================

async function renderHomepage(env, headers) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/articles?status=eq.published&order=published_at.desc&limit=12`,
    { headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` }}
  );
  const articles = await response.json();

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🎮 RETRO AI BLOG</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
  :root { --bg-dark:#080814; --bg-panel:#141430; --accent:#ff3864; --accent2:#21e6c1; --accent3:#ffd23f; --accent4:#b15cff; --text:#ececff; --text-dim:#7a7aa8; --border:#2a2a52; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Press Start 2P',monospace; background:var(--bg-dark); color:var(--text); line-height:1.9; font-size:12px; image-rendering:pixelated; overflow-x:hidden; }

  /* Pixel-grid background */
  body::before { content:''; position:fixed; inset:0; z-index:0; pointer-events:none;
    background-image:linear-gradient(rgba(33,230,193,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(33,230,193,0.05) 1px,transparent 1px);
    background-size:28px 28px; }
  /* CRT scanlines + flicker + vignette curvature */
  body::after { content:''; position:fixed; inset:0; z-index:9999; pointer-events:none;
    background:repeating-linear-gradient(0deg,rgba(0,0,0,0.22),rgba(0,0,0,0.22) 1px,transparent 1px,transparent 3px);
    box-shadow:inset 0 0 140px rgba(0,0,0,0.65), inset 0 0 40px rgba(177,92,255,0.12);
    animation:flicker 0.13s infinite; }
  @keyframes flicker { 0%{opacity:0.96} 50%{opacity:0.93} 100%{opacity:0.96} }

  /* Floating pixel particles */
  .fx { position:fixed; inset:0; z-index:1; pointer-events:none; overflow:hidden; }
  .pix { position:absolute; bottom:-12px; width:6px; height:6px; opacity:0.8; image-rendering:pixelated; animation:float-up linear infinite; }
  .pix:nth-child(1){ left:4%; background:var(--accent); animation-duration:11s; animation-delay:0s; }
  .pix:nth-child(2){ left:12%; background:var(--accent3); animation-duration:9s; animation-delay:2s; }
  .pix:nth-child(3){ left:21%; background:var(--accent2); animation-duration:13s; animation-delay:1s; }
  .pix:nth-child(4){ left:31%; background:var(--accent4); animation-duration:10s; animation-delay:3s; }
  .pix:nth-child(5){ left:42%; background:var(--accent); animation-duration:12s; animation-delay:0.5s; }
  .pix:nth-child(6){ left:53%; background:var(--accent3); animation-duration:8s; animation-delay:4s; }
  .pix:nth-child(7){ left:63%; background:var(--accent2); animation-duration:14s; animation-delay:1.5s; }
  .pix:nth-child(8){ left:72%; background:var(--accent4); animation-duration:9.5s; animation-delay:2.5s; }
  .pix:nth-child(9){ left:81%; background:var(--accent); animation-duration:11.5s; animation-delay:0.8s; }
  .pix:nth-child(10){ left:89%; background:var(--accent3); animation-duration:10.5s; animation-delay:3.5s; }
  .pix:nth-child(11){ left:95%; background:var(--accent2); animation-duration:12.5s; animation-delay:1.2s; }
  .pix:nth-child(12){ left:17%; background:var(--accent4); animation-duration:13.5s; animation-delay:5s; }
  @keyframes float-up { 0%{ transform:translateY(0) } 100%{ transform:translateY(-110vh) } }

  .header { background:var(--bg-panel); border-bottom:4px solid var(--accent); padding:18px 20px; text-align:center; position:relative; z-index:2; }
  .header .hud { display:flex; justify-content:space-between; font-size:8px; color:var(--accent2); margin-bottom:12px; }
  .logo { font-size:26px; color:var(--accent3); text-shadow:3px 3px 0 var(--accent),0 0 14px rgba(255,210,63,0.5); margin-bottom:10px; animation:glitch-skew 1s infinite; position:relative; letter-spacing:1px; }
  .chip { display:inline-block; background:var(--accent4); color:var(--bg-dark); padding:2px 7px; margin-right:10px; border:2px solid var(--accent3); box-shadow:2px 2px 0 var(--accent); font-size:15px; vertical-align:middle; }
  .logo::before,.logo::after { content:attr(data-text); position:absolute; top:0; left:0; width:100%; height:100%; }
  .logo::before { left:2px; text-shadow:-2px 0 var(--accent); clip:rect(44px,450px,56px,0); animation:glitch-anim 5s infinite linear alternate-reverse; }
  .logo::after { left:-2px; text-shadow:-2px 0 var(--accent2); clip:rect(44px,450px,56px,0); animation:glitch-anim2 5s infinite linear alternate-reverse; }
  @keyframes glitch-anim { 0%{clip:rect(14px,9999px,76px,0)} 20%{clip:rect(68px,9999px,6px,0)} 40%{clip:rect(3px,9999px,95px,0)} 60%{clip:rect(89px,9999px,23px,0)} 80%{clip:rect(34px,9999px,67px,0)} 100%{clip:rect(56px,9999px,12px,0)} }
  @keyframes glitch-anim2 { 0%{clip:rect(65px,9999px,99px,0)} 20%{clip:rect(12px,9999px,45px,0)} 40%{clip:rect(78px,9999px,3px,0)} 60%{clip:rect(23px,9999px,89px,0)} 80%{clip:rect(91px,9999px,34px,0)} 100%{clip:rect(45px,9999px,56px,0)} }
  @keyframes glitch-skew { 0%{transform:skew(0deg)} 10%{transform:skew(-2deg)} 20%{transform:skew(2deg)} 30%{transform:skew(0deg)} 100%{transform:skew(0deg)} }
  .tagline { font-size:10px; color:var(--accent2); text-shadow:0 0 8px rgba(33,230,193,0.4); }

  .nav { background:var(--bg-panel); padding:14px; border-bottom:2px solid var(--border); display:flex; justify-content:center; gap:14px; flex-wrap:wrap; position:relative; z-index:2; }
  .nav a { color:var(--text); text-decoration:none; padding:9px 14px; border:2px solid var(--border); background:var(--bg-dark); transition:all 0.12s; font-size:10px; box-shadow:3px 3px 0 rgba(0,0,0,0.5); }
  .nav a:hover { background:var(--accent); color:var(--bg-dark); border-color:var(--accent3); transform:translateY(-2px); box-shadow:4px 6px 0 var(--accent3); }

  .main { max-width:920px; margin:0 auto; padding:24px; position:relative; z-index:2; }
  .hero { background:var(--bg-panel); border:4px solid var(--accent2); padding:32px; margin-bottom:30px; position:relative; box-shadow:6px 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(33,230,193,0.18); }
  .hero::before { content:'▶ SYSTEM READY'; position:absolute; top:-12px; left:20px; background:var(--accent2); color:var(--bg-dark); padding:4px 10px; font-size:8px; font-family:'Press Start 2P'; }
  .hero h1 { font-size:17px; color:var(--accent3); margin-bottom:16px; line-height:1.6; text-shadow:2px 2px 0 var(--accent); }
  .hero p { font-family:'VT323',monospace; font-size:20px; color:var(--text-dim); line-height:1.4; }
  .press-start { display:inline-block; margin-top:14px; font-size:11px; color:var(--accent); animation:pulse 1s steps(2) infinite; }
  @keyframes pulse { 0%,100%{ opacity:1 } 50%{ opacity:0.15 } }

  .stats { display:flex; gap:18px; margin-bottom:30px; flex-wrap:wrap; }
  .stat-box { background:var(--bg-panel); border:3px solid var(--accent2); padding:16px; flex:1; text-align:center; min-width:120px; box-shadow:4px 4px 0 rgba(0,0,0,0.5); }
  .stat-box .label { font-size:8px; color:var(--accent2); margin-bottom:10px; }
  .stat-box .value { font-size:22px; color:var(--accent3); text-shadow:2px 2px 0 var(--accent); }

  .article-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:20px; }
  .article-card { background:var(--bg-panel); border:3px solid var(--border); padding:20px; position:relative; transition:all 0.15s; overflow:hidden; box-shadow:5px 5px 0 rgba(0,0,0,0.5); }
  .article-card::before { content:''; position:absolute; top:-2px; left:-2px; right:-2px; bottom:-2px; background:linear-gradient(45deg,var(--accent),var(--accent2),var(--accent3),var(--accent4),var(--accent)); background-size:400% 400%; opacity:0; z-index:-1; transition:opacity 0.3s; animation:gradient-shift 3s ease infinite; }
  .article-card:hover::before { opacity:1; }
  .article-card:hover { transform:translateY(-5px) scale(1.02); border-color:var(--accent); box-shadow:8px 8px 0 var(--accent), 0 0 18px rgba(255,56,100,0.3); }
  @keyframes gradient-shift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  .article-card .category { font-size:8px; color:var(--accent2); margin-bottom:10px; text-transform:uppercase; text-shadow:1px 1px 0 rgba(0,0,0,0.6); }
  .article-card h3 { font-size:12px; color:var(--text); margin-bottom:12px; line-height:1.6; }
  .article-card h3 a { color:var(--text); text-decoration:none; }
  .article-card h3 a:hover { color:var(--accent3); }
  .article-card .meta { font-family:'VT323',monospace; font-size:18px; color:var(--text-dim); display:flex; justify-content:space-between; }
  .badge { display:inline-block; padding:5px 9px; font-size:8px; border:2px solid; margin-top:12px; }
  .badge-published { border-color:var(--accent2); color:var(--accent2); box-shadow:0 0 8px rgba(33,230,193,0.3); }

  .marquee { overflow:hidden; white-space:nowrap; position:relative; background:var(--bg-dark); padding:12px; border:3px solid var(--border); margin-top:30px; box-shadow:4px 4px 0 rgba(0,0,0,0.5); }
  .marquee span { display:inline-block; animation:marquee-scroll 12s linear infinite; padding-left:100%; font-size:10px; color:var(--accent3); }
  @keyframes marquee-scroll { 0%{transform:translateX(0)} 100%{transform:translateX(-100%)} }

  .footer { background:var(--bg-panel); border-top:4px solid var(--accent); padding:22px; text-align:center; font-size:8px; color:var(--text-dim); margin-top:34px; position:relative; z-index:2; }
  .pixel-art { font-size:22px; margin-bottom:12px; filter:drop-shadow(0 0 6px rgba(177,92,255,0.5)); }
  .cursor-blink::after { content:'▋'; animation:blink 1s infinite; color:var(--accent3); }
  @keyframes blink { 0%,50%{opacity:1} 51%,100%{opacity:0} }
  .rainbow-text { background:linear-gradient(90deg,var(--accent),var(--accent2),var(--accent3),var(--accent4),var(--accent)); background-size:300% 100%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; animation:rainbow-shift 3s ease infinite; }
  @keyframes rainbow-shift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  @media(max-width:600px){ .article-grid{grid-template-columns:1fr} .logo{font-size:16px} .stats{flex-direction:column} .header .hud{font-size:7px} }
</style>
</head>
<body>
<div class="fx">
  <span class="pix"></span><span class="pix"></span><span class="pix"></span><span class="pix"></span>
  <span class="pix"></span><span class="pix"></span><span class="pix"></span><span class="pix"></span>
  <span class="pix"></span><span class="pix"></span><span class="pix"></span><span class="pix"></span>
</div>
<header class="header">
  <div class="hud"><span>1UP</span><span>HI-SCORE 999999</span><span>CREDIT 99</span></div>
  <div class="logo" data-text="PromptLab Studio"><span class="chip">🧪</span>PromptLab Studio</div>
  <div class="tagline">◀ Articles generated by • AI Agent Autonomous ▶</div>
</header>
<nav class="nav">
  <a href="/">🏠 HOME</a>
  <a href="/?cat=ai">🤖 AI</a>
  <a href="/?cat=marketing">📢 MARKETING</a>
  <a href="/?cat=freelance">💼 FREELANCE</a>
  <a href="/?cat=coding">💻 CODING</a>
  <a href="/?cat=crypto">₿ CRYPTO</a>
</nav>
<main class="main">
  <section class="hero">
    <h1>▶ WELCOME TO PROMPTLAB STUDIO ◀</h1>
    <span class="press-start">▶ PRESS START TO READ ARTICLES ◀</span>
  </section>
  <div class="stats">
    <div class="stat-box">
      <div class="label">TOTAL ARTICLES</div>
      <div class="value">${articles.length}</div>
    </div>
    <div class="stat-box">
      <div class="label">THIS MONTH</div>
      <div class="value">${articles.filter(a => new Date(a.published_at).getMonth() === new Date().getMonth()).length}</div>
    </div>
    <div class="stat-box">
      <div class="label">SUCCESS RATE</div>
      <div class="value">94%</div>
    </div>
  </div>
  <div class="article-grid">
    ${articles.map(a => `
      <article class="article-card">
        <div class="category">► ${a.category?.toUpperCase() || 'GENERAL'}</div>
        <h3><a href="/${a.slug}">${a.title}</a></h3>
        <div class="meta">
          <span>📅 ${new Date(a.published_at).toLocaleDateString('id-ID')}</span>
          <span>📝 ${a.word_count} kata</span>
        </div>
        <span class="badge badge-published">● PUBLISHED</span>
      </article>
    `).join('')}
  </div>
  <div class="marquee">
    <span>🎮 WELCOME TO RETRO AI BLOG 🎮 ARTICLES GENERATED BY AI 🤖 POWERED BY OPENROUTER ⚡ HOSTED ON CLOUDFLARE ☁️ DATABASE BY SUPABASE 🗄️ STYLED WITH 16-BIT PIXEL ART 👾 </span>
  </div>
</main>
  <footer class="footer">
    <div class="pixel-art">👾 🕹️ 🎮 👾</div>
    <p>© 2026 PromptLab Studio. All rights reserved. • Powered by AI</p>
    <p style="margin-top:5px;">INSERT COIN TO CONTINUE... <span class="cursor-blink"></span></p>
  </footer>
  <script>
    document.addEventListener('keydown', function(e){
      if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        window.location.href = '/admin';
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html' } });
}

async function renderArticle(env, headers, slug) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/articles?slug=eq.${slug}&status=eq.published&limit=1`,
    { headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` }}
  );
  const articles = await response.json();

  if (articles.length === 0) {
    return new Response('404 NOT FOUND', { status: 404, headers });
  }

  const article = articles[0];

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="${article.meta_description}">
<title>${article.title} | 🎮 RETRO AI BLOG</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  :root { --bg-dark:#0f0f23; --bg-panel:#1a1a2e; --accent:#ff6b6b; --accent2:#4ecdc4; --accent3:#ffe66d; --text:#e0e0e0; --text-dim:#888; --border:#333; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Press Start 2P',monospace; background:var(--bg-dark); color:var(--text); line-height:1.8; font-size:12px; }
  body::before { content:''; position:fixed; top:0;left:0;right:0;bottom:0; background:repeating-linear-gradient(0deg,rgba(0,0,0,0.15),rgba(0,0,0,0.15) 1px,transparent 1px,transparent 2px); pointer-events:none; z-index:9999; animation:flicker 0.15s infinite; }
  @keyframes flicker { 0%{opacity:0.97} 5%{opacity:0.95} 10%{opacity:0.97} 100%{opacity:0.97} }
  .header { background:var(--bg-panel); border-bottom:4px solid var(--accent); padding:20px; text-align:center; }
  .logo { font-size:20px; color:var(--accent3); text-shadow:3px 3px 0 var(--accent); }
  .main { max-width:800px; margin:0 auto; padding:20px; position:relative; z-index:2; }
  .article-header { background:var(--bg-panel); border:4px solid var(--accent2); padding:25px; margin-bottom:25px; }
  .article-header h1 { font-size:16px; color:var(--accent3); line-height:1.5; margin-bottom:15px; }
  .article-meta { font-size:8px; color:var(--text-dim); display:flex; gap:15px; flex-wrap:wrap; }
  .article-content { background:var(--bg-panel); border:2px solid var(--border); padding:25px; line-height:2; }
  .article-content h2 { font-size:14px; color:var(--accent2); margin-top:30px; margin-bottom:15px; border-bottom:2px solid var(--border); padding-bottom:10px; }
  .article-content p { margin-bottom:20px; font-size:11px; }
  .article-content ul { margin-left:20px; margin-bottom:20px; }
  .article-content li { margin-bottom:10px; font-size:11px; }
  .tags { margin-top:25px; display:flex; gap:10px; flex-wrap:wrap; }
  .tag { background:var(--bg-dark); border:2px solid var(--accent); padding:5px 10px; font-size:8px; color:var(--accent); }
  .back { display:inline-block; margin-top:25px; color:var(--accent2); text-decoration:none; font-size:10px; border:2px solid var(--accent2); padding:10px 20px; transition:all 0.1s; }
  .back:hover { background:var(--accent2); color:var(--bg-dark); transform:translateY(-2px); box-shadow:4px 4px 0 var(--accent3); }
  .footer { background:var(--bg-panel); border-top:4px solid var(--accent); padding:20px; text-align:center; font-size:8px; color:var(--text-dim); margin-top:30px; position:relative; z-index:2; }
  @media(max-width:600px){ .article-header h1{font-size:14px} }
</style>
</head>
<body>
<header class="header">
  <div class="logo">🎮 RETRO AI BLOG</div>
</header>
<main class="main">
  <article class="article-header">
    <h1>► ${article.title}</h1>
    <div class="article-meta">
      <span>📅 ${new Date(article.published_at).toLocaleDateString('id-ID')}</span>
      <span>📝 ${article.word_count} kata</span>
      <span>🏷️ ${article.category?.toUpperCase() || 'GENERAL'}</span>
      <span>🤖 ${article.ai_model}</span>
    </div>
  </article>
  <div class="article-content">
    ${article.content.replace(/\n/g, '<br>')}
  </div>
  <div class="tags">
    ${(article.keywords || []).map(k => `<span class="tag">${k}</span>`).join('')}
  </div>
  <a href="/" class="back">← BACK TO HOME</a>
</main>
<footer class="footer">
  <p>© 2026 RETRO AI BLOG • Generated by AI • Styled by 16-Bit</p>
</footer>
</body>
</html>`;

  return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html' } });
}

async function renderLogin(env, headers, wrong) {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🔐 ADMIN LOGIN | PromptLab Studio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  :root { --bg-dark:#080814; --bg-panel:#141430; --accent:#ff3864; --accent2:#21e6c1; --accent3:#ffd23f; --text:#ececff; --text-dim:#7a7aa8; --border:#2a2a52; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Press Start 2P',monospace; background:var(--bg-dark); color:var(--text); min-height:100vh; display:flex; align-items:center; justify-content:center; image-rendering:pixelated; }
  body::before { content:''; position:fixed; inset:0; z-index:0; pointer-events:none; background-image:linear-gradient(rgba(33,230,193,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(33,230,193,0.05) 1px,transparent 1px); background-size:28px 28px; }
  body::after { content:''; position:fixed; inset:0; z-index:9999; pointer-events:none; background:repeating-linear-gradient(0deg,rgba(0,0,0,0.22),rgba(0,0,0,0.22) 1px,transparent 1px,transparent 3px); animation:flicker 0.13s infinite; }
  @keyframes flicker { 0%{opacity:0.96} 50%{opacity:0.93} 100%{opacity:0.96} }
  .box { position:relative; z-index:2; background:var(--bg-panel); border:4px solid var(--accent); padding:36px; width:min(90vw,420px); text-align:center; box-shadow:6px 6px 0 rgba(0,0,0,0.5); }
  .box h1 { font-size:16px; color:var(--accent3); text-shadow:2px 2px 0 var(--accent); margin-bottom:8px; }
  .box .sub { font-size:9px; color:var(--accent2); margin-bottom:24px; }
  .box .err { font-size:9px; color:var(--accent); margin-bottom:16px; }
  .box input { width:100%; font-family:'Press Start 2P',monospace; font-size:11px; padding:12px; background:var(--bg-dark); color:var(--text); border:3px solid var(--accent2); margin-bottom:18px; }
  .box button { width:100%; font-family:'Press Start 2P',monospace; font-size:11px; padding:12px; background:var(--accent); color:var(--bg-dark); border:3px solid var(--accent3); cursor:pointer; box-shadow:4px 4px 0 var(--accent3); }
  .box button:hover { transform:translateY(-2px); }
  .box .hint { font-size:8px; color:var(--text-dim); margin-top:18px; }
</style>
</head>
<body>
  <div class="box">
    <h1>🔐 ADMIN LOGIN</h1>
    <div class="sub">PromptLab Studio • AI Agent Autonomous</div>
    ${wrong ? '<div class="err">❌ PASSWORD SALAH!</div>' : ''}
    <form method="POST" action="/admin">
      <input type="password" name="password" placeholder="PASSWORD" autofocus>
      <button type="submit">► LOGIN</button>
    </form>
    <div class="hint">Tekan CTRL+SHIFT+A untuk buka panel ini</div>
  </div>
</body>
</html>`;
  return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html' } });
}

async function renderAdmin(env, headers) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/article_queue?order=created_at.desc&limit=20`,
    { headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` }}
  );
  const queue = await response.json();

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>⚙️ ADMIN PANEL | RETRO AI BLOG</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  :root { --bg-dark:#0f0f23; --bg-panel:#1a1a2e; --accent:#ff6b6b; --accent2:#4ecdc4; --accent3:#ffe66d; --text:#e0e0e0; --text-dim:#888; --border:#333; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Press Start 2P',monospace; background:var(--bg-dark); color:var(--text); font-size:10px; }
  body::before { content:''; position:fixed; top:0;left:0;right:0;bottom:0; background:repeating-linear-gradient(0deg,rgba(0,0,0,0.15),rgba(0,0,0,0.15) 1px,transparent 1px,transparent 2px); pointer-events:none; z-index:9999; }
  .header { background:var(--bg-panel); border-bottom:4px solid var(--accent); padding:20px; text-align:center; }
  .logo { font-size:18px; color:var(--accent3); text-shadow:3px 3px 0 var(--accent); }
  .main { max-width:1000px; margin:0 auto; padding:20px; position:relative; z-index:2; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:15px; margin-bottom:20px; }
  .stat-box { background:var(--bg-panel); border:2px solid var(--accent2); padding:15px; text-align:center; }
  .stat-box .label { font-size:8px; color:var(--accent2); margin-bottom:8px; }
  .stat-box .value { font-size:18px; color:var(--text); }
  .panel { background:var(--bg-panel); border:2px solid var(--accent); padding:20px; margin-bottom:20px; }
  .panel h2 { font-size:12px; color:var(--accent); margin-bottom:15px; border-bottom:2px solid var(--border); padding-bottom:10px; }
  .queue-item { display:flex; justify-content:space-between; align-items:center; padding:15px; border:1px solid var(--border); margin-bottom:10px; background:var(--bg-dark); flex-wrap:wrap; gap:10px; }
  .queue-item .info { flex:1; min-width:250px; }
  .queue-item .title { font-size:10px; color:var(--text); margin-bottom:8px; }
  .queue-item .status { font-size:8px; color:var(--text-dim); }
  .steps { display:flex; gap:5px; margin:8px 0; }
  .step { width:25px; height:25px; border:2px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:8px; }
  .step-done { background:var(--accent2); border-color:var(--accent2); color:var(--bg-dark); }
  .step-current { background:var(--accent3); border-color:var(--accent3); color:var(--bg-dark); animation:pulse 1s infinite; }
  .step-pending { color:var(--text-dim); }
  .step-failed { background:var(--accent); border-color:var(--accent); color:var(--bg-dark); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
  .btn { padding:8px 12px; border:2px solid; background:var(--bg-dark); color:var(--text); font-family:inherit; font-size:8px; cursor:pointer; transition:all 0.1s; }
  .btn:hover { transform:translateY(-2px); }
  .btn-approve { border-color:var(--accent2); color:var(--accent2); }
  .btn-approve:hover { background:var(--accent2); color:var(--bg-dark); }
  .btn-reject { border-color:var(--accent); color:var(--accent); }
  .btn-reject:hover { background:var(--accent); color:var(--bg-dark); }
  .btn-retry { border-color:var(--accent3); color:var(--accent3); }
  .btn-retry:hover { background:var(--accent3); color:var(--bg-dark); }
  .footer { background:var(--bg-panel); border-top:4px solid var(--accent); padding:15px; text-align:center; font-size:8px; color:var(--text-dim); margin-top:20px; position:relative; z-index:2; }
  @media(max-width:600px){ .queue-item{flex-direction:column;align-items:flex-start} }
</style>
</head>
<body>
<header class="header">
  <div class="logo">⚙️ ADMIN • PromptLab Studio</div>
</header>
<main class="main">
  <div class="stats">
    <div class="stat-box">
      <div class="label">TOTAL QUEUED</div>
      <div class="value">${queue.length}</div>
    </div>
    <div class="stat-box">
      <div class="label">PUBLISHED</div>
      <div class="value">${queue.filter(q => q.status === 'published').length}</div>
    </div>
    <div class="stat-box">
      <div class="label">FAILED</div>
      <div class="value">${queue.filter(q => q.status === 'failed').length}</div>
    </div>
    <div class="stat-box">
      <div class="label">NEEDS REVIEW</div>
      <div class="value">${queue.filter(q => q.status === 'needs_review').length}</div>
    </div>
  </div>
  <div class="panel">
    <h2>► PIPELINE QUEUE</h2>
    ${queue.map(q => {
      const step1Class = q.step1_validated ? 'step-done' : q.current_step === 1 ? 'step-current' : q.error_step === 1 ? 'step-failed' : 'step-pending';
      const step2Class = q.step2_validated ? 'step-done' : q.current_step === 2 ? 'step-current' : q.error_step === 2 ? 'step-failed' : 'step-pending';
      const step3Class = q.step3_validated ? 'step-done' : q.current_step === 3 ? 'step-current' : q.error_step === 3 ? 'step-failed' : 'step-pending';
      const step4Class = q.status === 'published' ? 'step-done' : 'step-pending';

      return `
        <div class="queue-item">
          <div class="info">
            <div class="title">${q.topic}</div>
            <div class="status" style="color:${q.status === 'published' ? 'var(--accent2)' : q.status === 'failed' ? 'var(--accent)' : q.status === 'needs_review' ? 'var(--accent3)' : 'var(--text-dim)'}">
              <div class="steps">
                <div class="step ${step1Class}">1</div>
                <div class="step ${step2Class}">2</div>
                <div class="step ${step3Class}">3</div>
                <div class="step ${step4Class}">✓</div>
              </div>
              ${q.status.toUpperCase()}${q.last_error ? ` • ERROR: ${q.last_error}` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            ${q.status === 'polish_done' || q.status === 'draft_done' ? `
              <button class="btn btn-approve" onclick="publish('${q.id}')">✓ PUBLISH</button>
            ` : ''}
            ${q.status === 'failed' || q.status === 'needs_review' ? `
              <button class="btn btn-retry" onclick="retry('${q.id}')">↻ RETRY</button>
            ` : ''}
            <button class="btn btn-reject" onclick="reject('${q.id}')">✗ DELETE</button>
          </div>
        </div>
      `;
    }).join('')}
  </div>
</main>
<footer class="footer">
  <p>RETRO AI BLOG ADMIN • Sequential Pipeline Control</p>
  <p style="margin-top:8px;"><a href="/admin?logout=1" style="color:var(--accent);text-decoration:none;">⏻ LOGOUT</a></p>
</footer>
<script>
  async function publish(id) {
    await fetch('/api/publish/' + id, { method: 'POST' });
    location.reload();
  }
  async function retry(id) {
    await fetch('/api/retry/' + id, { method: 'POST' });
    location.reload();
  }
  async function reject(id) {
    if(confirm('Delete this item?')) {
      await fetch('/api/delete/' + id, { method: 'DELETE' });
      location.reload();
    }
  }
</script>
</body>
</html>`;

  return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html' } });
}
