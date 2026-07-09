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

    if (url.pathname === '/favicon.ico') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0a0a18"/><rect x="8" y="4" width="16" height="20" fill="#222845" rx="2"/><rect x="10" y="6" width="12" height="2" fill="#ff3864"/><rect x="10" y="10" width="10" height="2" fill="#21e6c4"/><rect x="10" y="14" width="8" height="2" fill="#ffd23f"/><rect x="10" y="18" width="6" height="2" fill="#b15cff"/><rect x="14" y="24" width="4" height="2" fill="#ececff"/><rect x="10" y="26" width="12" height="2" fill="#222845"/></svg>`;
      return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
    }

    // Route handling
    if (url.pathname === '/') {
      return await renderHomepage(env, headers, url);
    }
    if (url.pathname === '/sitemap.xml') {
      return await renderSitemap(env, headers);
    }
    if (url.pathname === '/robots.txt') {
      return await renderRobots(env, headers);
    }
    if (url.pathname === '/googleda99782c94638a72.html') {
      return new Response('google-site-verification: googleda99782c94638a72.html', { headers: { 'Content-Type': 'text/html' } });
    }
    if (url.pathname === '/tentang') {
      return await renderAbout(env, headers);
    }
    if (url.pathname === '/docs') {
      return await renderDocs(env, headers);
    }
    if (url.pathname === '/admin' || url.pathname === '/rahasia-admin') {
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
          return new Response(null, { status: 302, headers: { 'Location': url.pathname, 'Set-Cookie': cookie } });
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

function isAdmin(request, env) {
  return getCookie(request, 'admin_session') === env.ADMIN_SESSION;
}

async function sbGet(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` }
  });
  return res.json();
}

async function getAgentConfig(env, category) {
  try {
    const rows = await sbGet(env, `agent_config?category=eq.${encodeURIComponent(category)}&limit=1`);
    if (rows && rows[0]) return rows[0];
  } catch (e) {}
  return null;
}

async function getTopicPools(env) {
  try {
    const rows = await sbGet(env, `settings?key=eq.topic_pools&limit=1`);
    if (rows && rows[0] && rows[0].value) return rows[0].value;
  } catch (e) {}
  return null;
}

async function getProviderConfig(env) {
  const defaults = {
    openrouter: { baseUrl: 'https://openrouter.ai/api/v1/chat/completions', key: env.OPENROUTER_API_KEY || '' },
    deepseek: { baseUrl: 'https://api.deepseek.com/v1/chat/completions', key: '' }
  };
  try {
    const rows = await sbGet(env, 'settings?key=eq.providers&limit=1');
    if (rows && rows[0] && rows[0].value) {
      const saved = rows[0].value;
      for (const k of Object.keys(defaults)) {
        if (saved[k]) {
          defaults[k] = { ...defaults[k], ...saved[k] };
        }
      }
    }
  } catch (e) {}
  return defaults;
}

// ============================================================
// API HANDLERS
// ============================================================

async function handleAPI(request, env, url, headers) {
  headers['Content-Type'] = 'application/json';
  const auth = request.headers.get('Authorization');

  // POST /api/generate - Trigger article generation (protected by CRON_SECRET)
  if (url.pathname === '/api/generate' && request.method === 'POST') {
    if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }
    let body = {};
    try { body = await request.json(); } catch (e) { body = {}; }
    const { topic, keywords, category } = body;
    const categories = ['ai', 'marketing', 'freelance', 'coding', 'crypto'];
    const finalCategory = category || categories[Math.floor(Math.random() * categories.length)];
    const pools = await getTopicPools(env);
    const defaultPool = {
      ai: ['Masa Depan AI Generatif di Indonesia', 'Cara Kerja LLM untuk Pemula', 'Etika AI: Antara Manfaat dan Risiko'],
      marketing: ['Strategi Content Marketing ala 90an', 'Membangun Brand Personality', 'Psychology of Nostalgia dalam Iklan'],
      freelance: ['Tips Negosiasi Rate Freelancer', 'Membangun Portfolio Menonjol', 'Manajemen Waktu ala Gamer'],
      coding: ['Belajar Coding dari Nol', 'Debugging itu Seni', 'Clean Code untuk Pemula'],
      crypto: ['Blockchain dalam Bahasa Sehari-hari', 'Manajemen Risiko Crypto', 'NFT dan Masa Depan Kepemilikan Digital']
    };
    const pool = (pools && pools[finalCategory] && pools[finalCategory].length) ? pools[finalCategory] : (defaultPool[finalCategory] || defaultPool.ai);
    const finalTopic = topic || pool[Math.floor(Math.random() * pool.length)];
    const pipeline = new ArticlePipeline(env);
    const result = await pipeline.generateArticle(finalTopic, keywords, finalCategory);
    return new Response(JSON.stringify(result), { headers });
  }

  // GET /api/models - List OpenRouter models (admin or cron)
  if (url.pathname === '/api/models' && request.method === 'GET') {
    if (!isAdmin(request, env) && auth !== `Bearer ${env.CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}` }
      });
      const data = await res.json();
      const models = (data.data || []).map(m => ({ id: m.id, name: m.name || m.id }));
      return new Response(JSON.stringify(models), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  // GET /api/agents - Read agent config + topic pools (admin)
  if (url.pathname === '/api/agents' && request.method === 'GET') {
    if (!isAdmin(request, env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    const [agents, poolRows] = await Promise.all([
      sbGet(env, 'agent_config?order=category'),
      sbGet(env, 'settings?key=eq.topic_pools&limit=1')
    ]);
    const topic_pools = (poolRows && poolRows[0] && poolRows[0].value) ? poolRows[0].value : {};
    return new Response(JSON.stringify({ agents: agents || [], topic_pools }), { headers });
  }

  // POST /api/agents - Save agent config + topic pools (admin)
  if (url.pathname === '/api/agents' && request.method === 'POST') {
    if (!isAdmin(request, env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    let body = {};
    try { body = await request.json(); } catch (e) { body = {}; }
    const agents = body.agents || [];
    for (const a of agents) {
      if (!a.category) continue;
      await fetch(`${env.SUPABASE_URL}/rest/v1/agent_config?on_conflict=category`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ category: a.category, model: a.model || null, role_prompt: a.role_prompt || null, provider: a.provider || 'openrouter' })
      });
    }
    if (body.topic_pools) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/settings?key=eq.topic_pools`, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ value: body.topic_pools })
      });
    }
    return new Response(JSON.stringify({ success: true }), { headers });
  }

  // GET /api/providers - Read provider config (admin, keys masked)
  if (url.pathname === '/api/providers' && request.method === 'GET') {
    if (!isAdmin(request, env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    const config = await getProviderConfig(env);
    const masked = {};
    for (const [k, v] of Object.entries(config)) {
      masked[k] = { baseUrl: v.baseUrl, hasKey: !!v.key };
    }
    return new Response(JSON.stringify(masked), { headers });
  }

  // POST /api/providers - Save provider config (admin)
  if (url.pathname === '/api/providers' && request.method === 'POST') {
    if (!isAdmin(request, env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    let body = {};
    try { body = await request.json(); } catch (e) { body = {}; }
    const current = await getProviderConfig(env);
    for (const [k, v] of Object.entries(body)) {
      if (current[k]) {
        current[k].baseUrl = v.baseUrl || current[k].baseUrl;
        if (v.key) current[k].key = v.key;
      }
    }
    await fetch(`${env.SUPABASE_URL}/rest/v1/settings?on_conflict=key`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ key: 'providers', value: current })
    });
    return new Response(JSON.stringify({ success: true }), { headers });
  }

  // POST /api/manual - Manual article (admin). write_by_ai toggles AI generation.
  if (url.pathname === '/api/manual' && request.method === 'POST') {
    if (!isAdmin(request, env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    let body = {};
    try { body = await request.json(); } catch (e) { body = {}; }
    const { title, category, content, write_by_ai, topic, keywords } = body;
    if (!title) return new Response(JSON.stringify({ error: 'Title required' }), { status: 400, headers });
    const pipeline = new ArticlePipeline(env);
    if (write_by_ai) {
      const result = await pipeline.generateArticle(topic || title, keywords || [], category || 'general');
      const status = result.success ? 200 : 500;
      return new Response(JSON.stringify(result), { status, headers });
    }
    const article = {
      title,
      slug: pipeline.slugify(title),
      content: content || '',
      excerpt: (content || '').substring(0, 200) + ((content && content.length > 200) ? '...' : ''),
      meta_description: `Artikel tentang ${title}`,
      keywords: keywords || [],
      category: category || 'general',
      status: 'published',
      word_count: (content || '').split(/\s+/).filter(Boolean).length,
      ai_model: 'manual',
      write_by_ai: false,
      published_at: new Date().toISOString()
    };
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/articles`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation'
      },
      body: JSON.stringify(article)
    });
    const data = await res.json();
    return new Response(JSON.stringify({ success: true, articleId: data[0] && data[0].id }), { headers });
  }

  // POST /api/retry/:id - Re-run generation for a failed/needs_review queue item (admin)
  if (url.pathname.match(/^\/api\/retry\/[\w-]+$/) && request.method === 'POST') {
    if (!isAdmin(request, env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    const id = url.pathname.split('/').pop();
    const rows = await sbGet(env, `article_queue?id=eq.${id}&limit=1`);
    if (!rows || !rows[0]) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
    const item = rows[0];
    const pipeline = new ArticlePipeline(env);
    const result = await pipeline.generateArticle(item.topic, item.keywords || [], item.category);
    if (result.success) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/article_queue?id=eq.${id}`, {
        method: 'DELETE',
        headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`, 'Prefer': 'return=minimal' }
      });
    }
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

  // DELETE /api/articles/:id - Delete published article
  if (url.pathname.match(/^\/api\/articles\/[\w-]+$/) && request.method === 'DELETE') {
    if (getCookie(request, 'admin_session') !== env.ADMIN_SESSION) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    const id = url.pathname.split('/').pop();
    await fetch(`${env.SUPABASE_URL}/rest/v1/articles?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`, 'Prefer': 'return=minimal' }
    });
    return new Response(JSON.stringify({ success: true }), { headers });
  }

  // PATCH /api/articles/:id - Edit published article
  if (url.pathname.match(/^\/api\/articles\/[\w-]+$/) && request.method === 'PATCH') {
    if (getCookie(request, 'admin_session') !== env.ADMIN_SESSION) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    const id = url.pathname.split('/').pop();
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const allowed = {};
    ['title','content','category','meta_description','keywords','slug','status'].forEach(k => { if (k in body) allowed[k] = body[k]; });
    if (Object.keys(allowed).length === 0) return new Response(JSON.stringify({ error: 'No fields' }), { status: 400, headers });
    await fetch(`${env.SUPABASE_URL}/rest/v1/articles?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(allowed)
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
    this.providers = {};
    this.activeProvider = 'openrouter';
    this.fallbackModels = [
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-4-26b-a4b-it:free',
      'openai/gpt-oss-120b:free'
    ];
    this.models = [...this.fallbackModels];
    this.defaultSystem = 'Kamu adalah penulis artikel profesional Indonesia. Hindari pengulangan. Gunakan contoh konkret. Tulis dengan gaya yang informatif, jelas, dan enak dibaca.';
    this.systemPrompt = this.defaultSystem;
    this.maxRetries = 3;
  }

  async generateArticle(topic, keywords, category) {
    const queueId = await this.createQueue(topic, keywords, category);

    // Load provider configs + per-category agent config
    this.providers = await getProviderConfig(this.env);
    const cfg = category ? await getAgentConfig(this.env, category) : null;
    this.activeProvider = (cfg && cfg.provider) ? cfg.provider : 'openrouter';
    if (cfg && cfg.model) {
      this.models = this.activeProvider === 'openrouter'
        ? [cfg.model, ...this.fallbackModels.filter(m => m !== cfg.model)]
        : [cfg.model];
    } else {
      this.models = [...this.fallbackModels];
    }
    this.systemPrompt = (cfg && cfg.role_prompt) ? cfg.role_prompt : this.defaultSystem;

    // STEP 1: Outline (MUST PASS)
    const step1 = await this.runStep(queueId, 1, 'outline', topic, keywords, null);
    if (!step1.success) {
      await this.updateQueue(queueId, { status: 'failed', last_error: step1.error, error_step: 1 });
      return { success: false, error: step1.error, queueId };
    }

    // STEP 2: Draft (MUST PASS - only runs if Step 1 valid)
    await this.sleep(2000);
    const step2 = await this.runStep(queueId, 2, 'draft', topic, keywords, step1.data);
    if (!step2.success) {
      await this.updateQueue(queueId, { status: 'needs_review', last_error: step2.error, error_step: 2 });
      return { success: false, error: step2.error, queueId, needsReview: true };
    }

    // STEP 3: Polish (MUST PASS - only runs if Step 2 valid)
    await this.sleep(2000);
    const step3 = await this.runStep(queueId, 3, 'polish', topic, keywords, step2.data);
    if (!step3.success) {
      try {
        const articleId = await this.publishDraft(queueId, step1.data, step2.data, category);
        return { success: true, warning: 'Polish failed, published as draft', articleId, queueId };
      } catch (e) {
        await this.updateQueue(queueId, { status: 'failed', last_error: 'publishDraft gagal: ' + e.message, error_step: 3 });
        return { success: false, error: 'publishDraft gagal: ' + e.message, queueId };
      }
    }

    // ALL PASSED - Publish
    try {
      const articleId = await this.publishArticle(queueId, step1.data, step2.data, step3.data, category);
      await this.updateQueue(queueId, { status: 'published', article_id: articleId, completed_at: new Date().toISOString() });
      return { success: true, articleId, queueId };
    } catch (e) {
      const articleId = await this.publishDraft(queueId, step1.data, step2.data, category);
      return { success: true, warning: 'Publish gagal, fallback ke draft: ' + e.message, articleId, queueId };
    }
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
        const data = await this.callLLM(this.activeProvider, model, this.systemPrompt, this.buildPrompt(stepName, topic, keywords, previousData), stepName === 'polish' ? 17000 : stepName === 'draft' ? 8192 : 4000);

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
         const wait = lastError.includes('429') ? 15000 : 2000 * Math.pow(2, attempt);
         await this.sleep(wait);
       }
    }

    // Fallback models
    for (let i = 1; i < this.models.length; i++) {
      try {
        const data = await this.callLLM(this.activeProvider, this.models[i], this.systemPrompt, this.buildPrompt(stepName, topic, keywords, previousData), stepName === 'polish' ? 17000 : stepName === 'draft' ? 8192 : 4000);
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
        if (words < 950) return { valid: false, error: `Too few words: ${words}` };
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
        const unique = new Set(sentences.map(s => s.trim().toLowerCase()));
        if (unique.size < sentences.length * 0.7) return { valid: false, error: 'Too much repetition' };
        return { valid: true, sanitized: content };
      },
      polish: (d) => {
        try {
          const parsed = JSON.parse(d);
          if (!parsed.content || parsed.content.length < 2500) return { valid: false, error: 'Content too short' };
          const md = (parsed.metaDescription || '').replace(/<[^>]+>/g, '').replace(/[*_#`]+/g, '').trim();
          if (md.length < 150 || md.length > 160) {
            return { valid: false, error: `Meta description harus 150-160 karakter (saat ini ${md.length})` };
          }
          parsed.metaDescription = md;
          return { valid: true, sanitized: parsed };
        } catch (e) { return { valid: false, error: 'Invalid format' }; }
      }
    };
    return validators[stepName](data);
  }

  buildPrompt(step, topic, keywords, previousData) {
    const prompts = {
      outline: `Buat outline artikel dalam Bahasa Indonesia tentang "${topic}". Keywords: ${keywords && keywords.length ? keywords.join(', ') : 'tutorial, panduan'}. Output JSON: {"title": "...", "sections": [{"name": "...", "keyPoints": ["..."]}]}`,
      draft: `Tulis artikel kreatif dalam Bahasa Indonesia tentang "${topic}". Outline: ${JSON.stringify(previousData)}. Panjang minimal 1000 kata. Gunakan **bold** untuk tekanan, *italic* untuk kutipan/ucapan orang. Selipkan nama tokoh terkenal (dunia atau Indonesia) dengan referensi temporal seperti "5 tahun lalu", "pada 2023". Tone santai seperti ngobrol sama teman. Gunakan "kamu" bukan "Anda".`,
      polish: `Perbaiki artikel ini untuk SEO Indonesia. Pertahankan **bold** dan *italic* yang sudah ada di konten. metaDescription: 150-160 karakter, 1 kalimat ajakan, tanpa HTML/markdown, mengandung kata kunci utama. Output JSON: {"title": "...", "content": "...", "metaDescription": "...", "excerpt": "..."}. Artikel: ${typeof previousData === 'string' ? previousData.substring(0, 5000) : JSON.stringify(previousData)}`
    };
    return prompts[step];
  }

  async callLLM(providerName, model, systemPrompt, userContent, maxTokens) {
    const prov = (this.providers && this.providers[providerName]) || {};
    let key = prov.key;
    if (providerName === 'openrouter' && !key && this.env.OPENROUTER_API_KEY) key = this.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('No API key for ' + providerName);
    const url = prov.baseUrl;
    if (!url) throw new Error('No base URL for ' + providerName);

    if (providerName === 'anthropic') {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens,
          system: systemPrompt || this.defaultSystem,
          messages: [{ role: 'user', content: userContent }]
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.content && data.content[0] ? data.content[0].text : '';
    }

    // OpenAI-compatible (openrouter, openai, deepseek, opencode, ...)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt || this.defaultSystem },
          { role: 'user', content: userContent }
        ],
        max_tokens: maxTokens,
        temperature: 0.75
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
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
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = attempt === 0
        ? this.slugify(polish.title || outline.title)
        : this.slugify(polish.title || outline.title) + '-' + Math.random().toString(36).substring(2, 6);
      const article = {
        title: polish.title || outline.title,
        slug,
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
      if (response.ok) {
        const data = await response.json();
        return data[0].id;
      }
      if (response.status === 409 && attempt < 2) continue;
      throw new Error(`publishArticle gagal (${response.status}): ${await response.text()}`);
    }
  }

  async publishDraft(queueId, outline, draft, category) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = attempt === 0
        ? this.slugify(outline.title)
        : this.slugify(outline.title) + '-' + Math.random().toString(36).substring(2, 6);
      const article = {
        title: outline.title,
        slug,
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
      if (response.ok) {
        const data = await response.json();
        return data[0].id;
      }
      if (response.status === 409 && attempt < 2) continue;
      throw new Error(`publishDraft gagal (${response.status}): ${await response.text()}`);
    }
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

async function renderHomepage(env, headers, url) {
  const cat = url && url.searchParams.get('cat');
  const q = url && url.searchParams.get('q');
  const page = parseInt((url && url.searchParams.get('page')) || '1') || 1;
  const validCats = ['ai','marketing','freelance','coding','crypto'];
  const activeCat = (cat && validCats.includes(cat)) ? cat : null;
  const limit = 12;
  const offset = (page - 1) * limit;
  let apiUrl = `${env.SUPABASE_URL}/rest/v1/articles?status=eq.published&order=published_at.desc&limit=${limit}&offset=${offset}`;
  if (activeCat) apiUrl += `&category=eq.${encodeURIComponent(activeCat)}`;
  if (q) apiUrl += `&or=(title.ilike.*${encodeURIComponent(q)}*,content.ilike.*${encodeURIComponent(q)}*)`;
  const response = await fetch(apiUrl, {
    headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` }
  });
  const articles = await response.json();
  const featured = (!activeCat && !q && page === 1 && articles[0]) ? articles[0] : null;
  const gridArticles = featured ? articles.slice(1) : articles;
  const qs = (p) => {
    const parts = [];
    if (activeCat) parts.push('cat=' + encodeURIComponent(activeCat));
    if (q) parts.push('q=' + encodeURIComponent(q));
    parts.push('page=' + p);
    return parts.join('&');
  };
  const hasNext = articles.length === limit;

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<link rel="icon" href="/favicon.ico">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PromptLab Studio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
  :root { --bg-dark:#080814; --bg-panel:#141430; --accent:#ff3864; --accent2:#21e6c1; --accent3:#ffd23f; --accent4:#b15cff; --text:#ececff; --text-dim:#7a7aa8; --border:#2a2a52; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Press Start 2P',monospace; background:var(--bg-dark); color:var(--text); line-height:1.8; font-size:10px; overflow-x:hidden; image-rendering:pixelated; }
  body::before { content:''; position:fixed; inset:0; z-index:0; pointer-events:none; background-image:linear-gradient(rgba(33,230,193,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(33,230,193,0.04) 1px,transparent 1px); background-size:28px 28px; }
  body::after { content:''; position:fixed; inset:0; z-index:9999; pointer-events:none; background:repeating-linear-gradient(0deg,rgba(0,0,0,0.18),rgba(0,0,0,0.18) 1px,transparent 1px,transparent 3px); animation:scanline-flicker 0.13s infinite; }
  @keyframes scanline-flicker { 0%{opacity:0.96} 50%{opacity:0.93} 100%{opacity:0.96} }
  .glow { position:fixed; inset:0; z-index:0; pointer-events:none; background:radial-gradient(700px 380px at 78% 12%, rgba(255,56,100,0.13), transparent 60%),radial-gradient(550px 300px at 22% 82%, rgba(33,230,193,0.13), transparent 60%); }

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
  .logo { font-size:34px; color:var(--accent3); text-shadow:3px 3px 0 var(--accent),0 0 16px rgba(255,210,63,0.55); margin-bottom:10px; position:relative; letter-spacing:1px; }
  .chip { display:inline-block; background:var(--accent4); color:var(--bg-dark); padding:4px 10px; margin-right:12px; border:2px solid var(--accent3); box-shadow:3px 3px 0 var(--accent); font-size:20px; vertical-align:middle; }
  .caret { display:inline-block; color:var(--accent3); animation:blink 1s steps(1) infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  .tagline { font-size:10px; color:var(--accent2); text-shadow:0 0 8px rgba(33,230,193,0.4); }

  .nav { background:var(--bg-panel); padding:14px; border-bottom:2px solid var(--border); display:flex; justify-content:center; gap:14px; flex-wrap:wrap; position:relative; z-index:2; }
  .nav a { color:var(--text); text-decoration:none; padding:9px 14px; border:2px solid var(--border); background:var(--bg-dark); transition:all 0.12s; font-size:10px; box-shadow:3px 3px 0 rgba(0,0,0,0.5); }
  .nav a:hover { background:var(--accent); color:var(--bg-dark); border-color:var(--accent3); transform:translateY(-2px); box-shadow:4px 6px 0 var(--accent3); }
  .nav a.active { background:var(--accent); color:var(--bg-dark); border-color:var(--accent3); box-shadow:4px 6px 0 var(--accent3); }
  .cat-banner { background:var(--bg-panel); border:3px solid var(--accent3); padding:16px 20px; margin-bottom:24px; color:var(--accent3); font-size:12px; text-shadow:1px 1px 0 var(--accent); box-shadow:4px 4px 0 rgba(0,0,0,0.5); }
  .empty { text-align:center; padding:40px 16px; color:var(--text-dim); font-size:11px; border:3px dashed var(--border); margin-top:10px; }

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

  .article-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:22px; }
  .article-card { background:var(--bg-panel); border:3px solid var(--border); padding:22px; position:relative; transition:transform 0.18s, border-color 0.18s, box-shadow 0.18s; overflow:hidden; box-shadow:5px 5px 0 rgba(0,0,0,0.5); display:flex; flex-direction:column; }
  .article-card::after { content:''; position:absolute; top:0; left:0; right:0; height:5px; background:linear-gradient(90deg,var(--accent),var(--accent2)); opacity:0.9; }
  .article-card:hover { transform:translateY(-5px); border-color:var(--accent2); box-shadow:7px 7px 0 rgba(33,230,193,0.45); }
  .article-card .category { display:inline-block; font-size:8px; color:var(--accent2); margin-bottom:12px; text-transform:uppercase; letter-spacing:1px; border:2px solid var(--accent2); padding:3px 8px; align-self:flex-start; }
  .article-card h3 { font-size:13px; color:var(--text); margin-bottom:14px; line-height:1.6; flex:1; }
  .article-card h3 a { color:var(--text); text-decoration:none; }
  .article-card h3 a:hover { color:var(--accent3); }
  .article-card .meta { font-family:'VT323',monospace; font-size:18px; color:var(--text-dim); display:flex; justify-content:space-between; gap:8px; }
  .article-card .read { margin-top:14px; font-size:9px; color:var(--accent); display:flex; align-items:center; gap:6px; transition:gap 0.15s, color 0.15s; }
  .article-card:hover .read { gap:12px; color:var(--accent2); }

  .marquee { overflow:hidden; white-space:nowrap; position:relative; background:var(--bg-dark); padding:12px; border:3px solid var(--border); margin-top:30px; box-shadow:4px 4px 0 rgba(0,0,0,0.5); }
  .marquee span { display:inline-block; animation:marquee-scroll 12s linear infinite; padding-left:100%; font-size:10px; color:var(--accent3); }
  @keyframes marquee-scroll { 0%{transform:translateX(0)} 100%{transform:translateX(-100%)} }

  .footer { background:var(--bg-panel); border-top:4px solid var(--accent); padding:22px; text-align:center; font-size:8px; color:var(--text-dim); margin-top:34px; position:relative; z-index:2; }
  .pixel-art { font-size:22px; margin-bottom:12px; filter:drop-shadow(0 0 6px rgba(177,92,255,0.5)); }
  .cursor-blink::after { content:'▋'; animation:blink 1s infinite; color:var(--accent3); }
  @keyframes blink { 0%,50%{opacity:1} 51%,100%{opacity:0} }
  .rainbow-text { background:linear-gradient(90deg,var(--accent),var(--accent2),var(--accent3),var(--accent4),var(--accent)); background-size:300% 100%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; animation:rainbow-shift 3s ease infinite; }
  @keyframes rainbow-shift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  .search { display:flex; gap:10px; margin:24px 0; flex-wrap:wrap; }
  .search input[type=text] { flex:1; min-width:200px; font-family:'VT323',monospace; font-size:18px; padding:12px 14px; background:var(--bg-dark); color:var(--text); border:3px solid var(--accent2); }
  .search button { font-family:'Press Start 2P',monospace; font-size:9px; padding:12px 18px; background:var(--accent); color:var(--bg-dark); border:3px solid var(--accent3); cursor:pointer; }
  .featured { display:block; text-decoration:none; background:var(--bg-panel); border:4px solid var(--accent3); padding:28px; margin-bottom:28px; box-shadow:6px 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(255,210,63,0.18); transition:transform 0.15s, box-shadow 0.15s; }
  .featured:hover { transform:translateY(-4px); box-shadow:8px 8px 0 var(--accent3); }
  .featured .tag { font-size:8px; color:var(--accent3); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; }
  .featured h2 { font-size:20px; color:var(--text); margin-bottom:14px; line-height:1.5; text-shadow:1px 1px 0 rgba(0,0,0,0.5); }
  .featured .meta { display:flex; gap:16px; flex-wrap:wrap; font-family:'VT323',monospace; font-size:18px; color:var(--text-dim); }
  .featured .read { margin-top:14px; font-size:10px; color:var(--accent2); display:inline-block; }
  .pager { display:flex; justify-content:center; gap:14px; margin:26px 0; flex-wrap:wrap; }
  .pager a { font-family:'Press Start 2P',monospace; font-size:9px; padding:10px 14px; border:3px solid var(--accent2); background:var(--bg-dark); color:var(--text); text-decoration:none; box-shadow:3px 3px 0 rgba(0,0,0,0.5); }
  .pager a:hover { background:var(--accent); color:var(--bg-dark); border-color:var(--accent3); }
  .footer a { color:var(--accent2); text-decoration:none; }
  .footer a:hover { color:var(--accent3); }
  .footer .flinks { display:flex; justify-content:center; gap:16px; flex-wrap:wrap; font-size:9px; margin:10px 0; }
  .footer .copy { margin-top:8px; }
  @media(max-width:600px){ .article-grid{grid-template-columns:1fr} .logo{font-size:16px} .stats{flex-direction:column} .header .hud{font-size:7px} .search{flex-direction:column} .search button{padding:12px} }
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
  <div class="logo"><span class="chip">🧪</span><span id="type-text"></span><span class="caret">▋</span></div>
  <div class="tagline">◀ Articles generated by • AI Agent Autonomous ▶</div>
</header>
<nav class="nav">
  <a href="/" class="nav-link ${!activeCat?'active':''}">🏠 HOME</a>
  <a href="/?cat=ai" class="nav-link ${activeCat==='ai'?'active':''}">🤖 AI</a>
  <a href="/?cat=marketing" class="nav-link ${activeCat==='marketing'?'active':''}">📢 MARKETING</a>
  <a href="/?cat=freelance" class="nav-link ${activeCat==='freelance'?'active':''}">💼 FREELANCE</a>
  <a href="/?cat=coding" class="nav-link ${activeCat==='coding'?'active':''}">💻 CODING</a>
  <a href="/?cat=crypto" class="nav-link ${activeCat==='crypto'?'active':''}">₿ CRYPTO</a>
  <a href="/tentang" class="nav-link">📖 TENTANG</a>
  <a href="/docs" class="nav-link">📚 DOCS</a>
</nav>
<main class="main">
  <section class="hero">
    <h1>▶ WELCOME TO PROMPTLAB STUDIO ◀</h1>
    <span class="press-start">▶ PRESS START TO READ ARTICLES ◀</span>
  </section>
  <form class="search" action="/" method="get">
    ${activeCat ? `<input type="hidden" name="cat" value="${activeCat}">` : ''}
    <input type="text" name="q" placeholder="🔍 CARI ARTIKEL..." value="${escapeHtml(q || '')}">
    <button type="submit">CARI</button>
  </form>
  <div class="stats">
    <div class="stat-box">
      <div class="label">ARTIKEL</div>
      <div class="value">${articles.length}</div>
    </div>
    <div class="stat-box">
      <div class="label">KATEGORI</div>
      <div class="value">${(activeCat || 'ALL').toUpperCase()}</div>
    </div>
    <div class="stat-box">
      <div class="label">HALAMAN</div>
      <div class="value">${page}</div>
    </div>
  </div>
  ${activeCat ? `<section class="cat-banner">► KATEGORI: ${activeCat.toUpperCase()} — ${articles.length} ARTIKEL</section>` : ''}
  ${q ? `<section class="cat-banner">► HASIL CARI: "${escapeHtml(q)}" — ${articles.length} ARTIKEL</section>` : ''}
  ${featured ? `<a class="featured" href="/${featured.slug}"><div class="tag">► ${featured.category?.toUpperCase() || 'GENERAL'} • FEATURED</div><h2>${escapeHtml(featured.title)}</h2><div class="meta"><span>📅 ${new Date(featured.published_at).toLocaleDateString('id-ID')}</span><span>📝 ${featured.word_count} kata</span><span>⏱ ${Math.max(1, Math.round((featured.word_count||0)/200))} mnt</span></div><span class="read">► BACA ARTIKEL →</span></a>` : ''}
  <div class="article-grid">
    ${gridArticles.map(a => `
      <article class="article-card">
        <div class="category">► ${a.category?.toUpperCase() || 'GENERAL'}</div>
        <h3><a href="/${a.slug}">${a.title}</a></h3>
        <div class="meta">
          <span>📅 ${new Date(a.published_at).toLocaleDateString('id-ID')}</span>
          <span>📝 ${a.word_count} kata</span>
        </div>
        <div class="read">► BACA ARTIKEL →</div>
      </article>
    `).join('')}
  </div>
  ${articles.length === 0 ? `<div class="empty">► ${q ? 'TIDAK ADA HASIL UNTUK PENCARIAN.' : 'BELUM ADA ARTIKEL DI KATEGORI INI.'}</div>` : ''}
  ${(page > 1 || hasNext) ? `<div class="pager">${page > 1 ? `<a href="/?${qs(page-1)}">◀ SEBELUMNYA</a>` : ''}${hasNext ? `<a href="/?${qs(page+1)}">BERIKUTNYA ▶</a>` : ''}</div>` : ''}
  <div class="marquee">
    <span>🎮 PROMPTLAB STUDIO 🎮 ARTIKEL TENTANG AI • MARKETING • FREELANCE • CODING • CRYPTO 🤖 DITULIS OTOMATIS OLEH AI AGENT ✨ KONTEN BARU SETIAP HARI 👾 </span>
  </div>
</main>
  <footer class="footer">
    <div class="pixel-art">👾 🕹️ 🎮 👾</div>
    <div class="flinks">
      <a href="/">🏠 Home</a>
      <a href="/tentang">📖 Tentang</a>
      <a href="/docs">📚 Docs</a>
      <a href="/sitemap.xml">🗺️ Sitemap</a>
      <a href="/?cat=ai">🤖 AI</a>
      <a href="/?cat=marketing">📢 Marketing</a>
      <a href="/?cat=crypto">₿ Crypto</a>
    </div>
    <p class="copy">© 2026 PromptLab Studio • Powered by AI Agent</p>
    <p style="margin-top:5px;">INSERT COIN TO CONTINUE... <span class="cursor-blink"></span></p>
  </footer>
  <script>
    (function(){
      var el = document.getElementById('type-text');
      if (!el) return;
      var phrases = ['PromptLab Studio', 'AI Agent Autonomous'];
      var p = 0, i = 0, deleting = false;
      function tick(){
        var full = phrases[p];
        if (!deleting) {
          el.textContent = full.slice(0, i + 1);
          i++;
          if (i === full.length) { deleting = true; return setTimeout(tick, 1500); }
        } else {
          el.textContent = full.slice(0, i - 1);
          i--;
          if (i === 0) { deleting = false; p = (p + 1) % phrases.length; }
        }
        setTimeout(tick, deleting ? 55 : 110);
      }
      tick();
    })();
    document.addEventListener('keydown', function(e){
      if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        window.location.href = '/admin';
      }
    });
  </script>
  <script src="https://pl30244763.effectivecpmnetwork.com/fb/f9/61/fbf96105e95070c88ecdab8a2e410dc4.js"></script>
  <script>
    setInterval(function(){
      var s=document.createElement('script');
      s.src='https://pl30244763.effectivecpmnetwork.com/fb/f9/61/fbf96105e95070c88ecdab8a2e410dc4.js?cb='+Date.now();
      document.body.appendChild(s);
    }, 900000);
  </script>
</body>
</html>`;

  return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html' } });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripInline(s) {
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim();
}

function stripMd(s) {
  return String(s || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/#{1,6}\s?/g, '')
    .replace(/>(.+)/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/[-*]\s+/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugId(s) {
  return String(s).toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function buildToc(md) {
  if (!md) return [];
  const toc = [];
  const lines = String(md).split('\n');
  for (const line of lines) {
    const t = line.trim();
    const m2 = t.match(/^##\s+(.*)$/);
    const m3 = t.match(/^###\s+(.*)$/);
    if (m2) toc.push({ lvl: 2, text: stripInline(m2[1]), id: slugId(m2[1]) });
    else if (m3) toc.push({ lvl: 3, text: stripInline(m3[1]), id: slugId(m3[1]) });
  }
  return toc;
}

function inlineMd(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

function renderMarkdown(md) {
  if (!md) return '';
  const lines = md.split('\n');
  let html = '';
  let para = [];

  function flushPara() {
    if (para.length) {
      html += '<p>' + inlineMd(para.join(' ')) + '</p>';
      para = [];
    }
  }

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i].trim();
    if (raw === '') { flushPara(); i++; continue; }
    if (/^---+$/.test(raw)) { flushPara(); html += '<hr>'; i++; continue; }

    const h = raw.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      const lvl = h[1].length;
      const txt = h[2];
      html += `<h${lvl} id="${slugId(txt)}" class="h${lvl}">${inlineMd(txt)}</h${lvl}>`;
      i++; continue;
    }
    if (/^[-*]\s+/.test(raw)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push('<li>' + inlineMd(lines[i].trim().replace(/^[-*]\s+/, '')) + '</li>');
        i++;
      }
      html += '<ul>' + items.join('') + '</ul>';
      continue;
    }
    if (/^\d+\.\s+/.test(raw)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push('<li>' + inlineMd(lines[i].trim().replace(/^\d+\.\s+/, '')) + '</li>');
        i++;
      }
      html += '<ol>' + items.join('') + '</ol>';
      continue;
    }
    if (/^>\s?/.test(raw)) {
      flushPara();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(inlineMd(lines[i].trim().replace(/^>\s?/, '')));
        i++;
      }
      html += '<blockquote>' + quote.join(' ') + '</blockquote>';
      continue;
    }
    para.push(raw);
    i++;
  }
  flushPara();
  return html;
}

async function renderSitemap(env, headers) {
  let articles = [];
  try {
    const rows = await sbGet(env, 'articles?status=eq.published&select=slug,published_at&order=published_at.desc');
    articles = rows || [];
  } catch (e) {}
  const base = 'https://jemioktavian.my.id';
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  xml += '  <url><loc>' + base + '/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n';
  for (const a of articles) {
    if (!a.slug) continue;
    const loc = base + '/' + encodeURIComponent(a.slug);
    const lastmod = a.published_at ? new Date(a.published_at).toISOString() : '';
    xml += '  <url><loc>' + loc + '</loc>' + (lastmod ? '<lastmod>' + lastmod + '</lastmod>' : '') + '<changefreq>weekly</changefreq><priority>0.8</priority></url>\n';
  }
  xml += '</urlset>';
  return new Response(xml, { headers: { ...headers, 'Content-Type': 'application/xml' } });
}

async function renderRobots(env, headers) {
  const txt = 'User-agent: *\nAllow: /\n\nSitemap: https://jemioktavian.my.id/sitemap.xml\n';
  return new Response(txt, { headers: { ...headers, 'Content-Type': 'text/plain' } });
}

async function renderAbout(env, headers) {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<link rel="icon" href="/favicon.ico">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tentang | PromptLab Studio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
  :root { --bg-dark:#080814; --bg-panel:#141430; --accent:#ff3864; --accent2:#21e6c1; --accent3:#ffd23f; --accent4:#b15cff; --text:#ececff; --text-dim:#7a7aa8; --border:#2a2a52; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Press Start 2P',monospace; background:var(--bg-dark); color:var(--text); line-height:1.8; font-size:10px; overflow-x:hidden; }
  body::after { content:''; position:fixed; inset:0; z-index:9999; pointer-events:none; background:repeating-linear-gradient(0deg,rgba(0,0,0,0.18),rgba(0,0,0,0.18) 1px,transparent 1px,transparent 3px); animation:sf 0.13s infinite; }
  @keyframes sf { 0%{opacity:0.96} 50%{opacity:0.93} 100%{opacity:0.96} }
  .header { background:var(--bg-panel); border-bottom:4px solid var(--accent); padding:18px 20px; text-align:center; }
  .logo { font-size:28px; color:var(--accent3); text-shadow:3px 3px 0 var(--accent); }
  .nav { background:var(--bg-panel); padding:14px; border-bottom:2px solid var(--border); display:flex; justify-content:center; gap:14px; flex-wrap:wrap; }
  .nav a { color:var(--text); text-decoration:none; padding:9px 14px; border:2px solid var(--border); background:var(--bg-dark); font-size:10px; box-shadow:3px 3px 0 rgba(0,0,0,0.5); }
  .nav a:hover, .nav a.active { background:var(--accent); color:var(--bg-dark); border-color:var(--accent3); }
  .main { max-width:820px; margin:0 auto; padding:28px 22px 50px; position:relative; z-index:2; }
  .panel { background:var(--bg-panel); border:3px solid var(--accent2); padding:28px; margin-bottom:24px; box-shadow:5px 5px 0 rgba(0,0,0,0.5); }
  .panel h1 { font-size:18px; color:var(--accent3); text-shadow:2px 2px 0 var(--accent); margin-bottom:18px; line-height:1.6; }
  .panel h2 { font-size:12px; color:var(--accent2); margin:22px 0 12px; }
  .panel p { font-family:'VT323',monospace; font-size:19px; color:var(--text-dim); line-height:1.5; margin-bottom:14px; }
  .cats { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:14px; margin-top:10px; }
  .cat { border:2px solid var(--border); padding:14px; text-align:center; font-size:9px; color:var(--text); background:var(--bg-dark); }
  .cat .ic { font-size:18px; display:block; margin-bottom:8px; }
  .footer { background:var(--bg-panel); border-top:4px solid var(--accent); text-align:center; padding:22px; color:var(--text-dim); font-size:8px; margin-top:30px; }
  @media(max-width:600px){ .logo{font-size:16px} .cats{grid-template-columns:1fr 1fr} }
</style>
</head>
<body>
<header class="header"><div class="logo"><span>🧪</span> PromptLab Studio</div></header>
<nav class="nav">
  <a href="/">🏠 HOME</a>
  <a href="/?cat=ai">🤖 AI</a>
  <a href="/?cat=marketing">📢 MARKETING</a>
  <a href="/?cat=freelance">💼 FREELANCE</a>
  <a href="/?cat=coding">💻 CODING</a>
  <a href="/?cat=crypto">₿ CRYPTO</a>
  <a href="/tentang" class="active">📖 TENTANG</a>
  <a href="/docs">📚 DOCS</a>
</nav>
<main class="main">
  <section class="panel">
    <h1>► TENTANG PROMPTLAB STUDIO</h1>
    <p>PromptLab Studio adalah blog yang diisi otomatis oleh AI Agent. Setiap hari, agen AI menyusun topik, menulis artikel, lalu menerbitkannya ke situs ini tanpa campur tangan manual.</p>
    <p>Tujuan kami sederhana: menyajikan artikel praktis dan informatif seputar teknologi &amp; produktivitas dalam bahasa Indonesia yang mudah dipahami.</p>
    <h2>► TOPIK YANG KAMI ANGKAT</h2>
    <div class="cats">
      <div class="cat"><span class="ic">🤖</span>AI</div>
      <div class="cat"><span class="ic">📢</span>MARKETING</div>
      <div class="cat"><span class="ic">💼</span>FREELANCE</div>
      <div class="cat"><span class="ic">💻</span>CODING</div>
      <div class="cat"><span class="ic">₿</span>CRYPTO</div>
    </div>
    <h2>► JADWAL TERBIT</h2>
    <p>Artikel baru otomatis muncul 2x sehari pada pukul 15.00 &amp; 18.00 WIB.</p>
  </section>
</main>
<footer class="footer">© 2026 PromptLab Studio • Powered by AI Agent</footer>
</body>
</html>`;
  return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html' } });
}

async function renderDocs(env, headers) {
  const steps = [
    { ic:'🤖', t:'AI AGENT BANGUN TOPIK', d:'Agen memilih topik relevan dari kategori yang tersedia.' },
    { ic:'✍️', t:'TULIS ARTIKEL', d:'Konten ditulis menggunakan model AI dengan gaya bahasa Indonesia yang natural.' },
    { ic:'🔍', t:'REVIEW & FORMAT', d:'Teks ditinjau, dipastikan rapi, lalu diubah dari Markdown ke HTML.' },
    { ic:'🗄️', t:'SIMPAN KE DATABASE', d:'Artikel disimpan ke penyimpanan data dan ditandai sebagai draft.' },
    { ic:'🌐', t:'TERBIT DI BLOG', d:'Artikel dipublikasikan dan langsung tampil di halaman utama.' },
    { ic:'⏰', t:'CRON OTOMATIS', d:'Proses berulang otomatis setiap 15.00 & 18.00 WIB tanpa intervensi.' }
  ];
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<link rel="icon" href="/favicon.ico">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Docs | PromptLab Studio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
  :root { --bg-dark:#080814; --bg-panel:#141430; --accent:#ff3864; --accent2:#21e6c1; --accent3:#ffd23f; --accent4:#b15cff; --text:#ececff; --text-dim:#7a7aa8; --border:#2a2a52; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Press Start 2P',monospace; background:var(--bg-dark); color:var(--text); line-height:1.8; font-size:10px; overflow-x:hidden; }
  body::after { content:''; position:fixed; inset:0; z-index:9999; pointer-events:none; background:repeating-linear-gradient(0deg,rgba(0,0,0,0.18),rgba(0,0,0,0.18) 1px,transparent 1px,transparent 3px); animation:sf 0.13s infinite; }
  @keyframes sf { 0%{opacity:0.96} 50%{opacity:0.93} 100%{opacity:0.96} }
  .header { background:var(--bg-panel); border-bottom:4px solid var(--accent); padding:18px 20px; text-align:center; }
  .logo { font-size:28px; color:var(--accent3); text-shadow:3px 3px 0 var(--accent); }
  .nav { background:var(--bg-panel); padding:14px; border-bottom:2px solid var(--border); display:flex; justify-content:center; gap:14px; flex-wrap:wrap; }
  .nav a { color:var(--text); text-decoration:none; padding:9px 14px; border:2px solid var(--border); background:var(--bg-dark); font-size:10px; box-shadow:3px 3px 0 rgba(0,0,0,0.5); }
  .nav a:hover, .nav a.active { background:var(--accent); color:var(--bg-dark); border-color:var(--accent3); }
  .main { max-width:760px; margin:0 auto; padding:28px 22px 50px; position:relative; z-index:2; }
  .panel { background:var(--bg-panel); border:3px solid var(--accent2); padding:28px; box-shadow:5px 5px 0 rgba(0,0,0,0.5); }
  .panel h1 { font-size:18px; color:var(--accent3); text-shadow:2px 2px 0 var(--accent); margin-bottom:10px; line-height:1.6; }
  .panel .sub { font-family:'VT323',monospace; font-size:19px; color:var(--text-dim); margin-bottom:26px; }
  .flow { position:relative; padding-left:42px; }
  .flow::before { content:''; position:absolute; left:19px; top:6px; bottom:6px; width:4px; border-radius:4px; background:linear-gradient(180deg,var(--accent),var(--accent2),var(--accent3),var(--accent4),var(--accent)); background-size:100% 280%; animation:flow-move 3.5s linear infinite; }
  @keyframes flow-move { 0%{background-position:0 0} 100%{background-position:0 280%} }
  .step { position:relative; background:var(--bg-dark); border:3px solid var(--border); border-radius:12px; padding:16px 18px; margin-bottom:20px; box-shadow:4px 4px 0 rgba(0,0,0,0.5); opacity:0; transform:translateX(-14px); animation:step-in 0.5s ease forwards; }
  .step:nth-child(1){ animation-delay:0.2s }
  .step:nth-child(2){ animation-delay:0.5s }
  .step:nth-child(3){ animation-delay:0.8s }
  .step:nth-child(4){ animation-delay:1.1s }
  .step:nth-child(5){ animation-delay:1.4s }
  .step:nth-child(6){ animation-delay:1.7s }
  @keyframes step-in { to { opacity:1; transform:translateX(0); } }
  .step .node { position:absolute; left:-37px; top:16px; width:22px; height:22px; border-radius:50%; background:var(--accent); border:3px solid var(--bg-dark); box-shadow:0 0 0 3px var(--accent2); animation:node-pulse 1.6s ease-in-out infinite; }
  @keyframes node-pulse { 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.3); } }
  .step h3 { font-size:11px; color:var(--accent3); margin-bottom:8px; }
  .step p { font-family:'VT323',monospace; font-size:18px; color:var(--text-dim); line-height:1.4; }
  .footer { background:var(--bg-panel); border-top:4px solid var(--accent); text-align:center; padding:22px; color:var(--text-dim); font-size:8px; margin-top:30px; }
  @media(max-width:600px){ .logo{font-size:16px} }
</style>
</head>
<body>
<header class="header"><div class="logo"><span>🧪</span> PromptLab Studio</div></header>
<nav class="nav">
  <a href="/">🏠 HOME</a>
  <a href="/?cat=ai">🤖 AI</a>
  <a href="/?cat=marketing">📢 MARKETING</a>
  <a href="/?cat=freelance">💼 FREELANCE</a>
  <a href="/?cat=coding">💻 CODING</a>
  <a href="/?cat=crypto">₿ CRYPTO</a>
  <a href="/tentang">📖 TENTANG</a>
  <a href="/docs" class="active">📚 DOCS</a>
</nav>
<main class="main">
  <section class="panel">
    <h1>► DOKUMENTASI ALUR</h1>
    <div class="sub">Cara artikel dibuat dari awal sampai terbit secara otomatis:</div>
    <div class="flow">
      ${steps.map(s => `<div class="step"><span class="node">${s.ic}</span><h3>${s.t}</h3><p>${s.d}</p></div>`).join('')}
    </div>
  </section>
</main>
<footer class="footer">© 2026 PromptLab Studio • Powered by AI Agent</footer>
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
  let md = article.content || '';
  // Strip a leading H1 if it duplicates the article title (avoids double title)
  md = md.replace(/^\s*#\s+.*$(\n)?/m, '');
  const contentHtml = renderMarkdown(md);
  const toc = buildToc(md);
  const readMins = Math.max(1, Math.round((article.word_count || 0) / 200));

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<link rel="icon" href="/favicon.ico">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="${escapeHtml(article.meta_description || article.title)}">
<title>${escapeHtml(article.title)} | PromptLab Studio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap');
  :root {
    --bg:#0a0a18; --bg-soft:#1a1a3a; --panel:#141430; --panel-2:#222845;
    --text:#ececff; --muted:#9a9ac8; --primary:#8b93ff; --primary-soft:rgba(139,147,255,0.14);
    --secondary:#21e6c4; --border:#2a2a52; --shadow:0 18px 50px rgba(0,0,0,0.45);
    --accent:#ff3864; --accent2:#21e6c4; --accent3:#ffd23f; --accent4:#b15cff;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  html { scroll-behavior:smooth; }
  body {
    font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    background:var(--bg);
    background-image:radial-gradient(720px 380px at 80% 6%, rgba(255,56,100,0.10), transparent 60%), radial-gradient(620px 340px at 10% 94%, rgba(33,230,193,0.10), transparent 60%);
    background-attachment:fixed; color:var(--text); line-height:1.85; font-size:17px;
    -webkit-font-smoothing:antialiased; min-height:100vh;
  }
  body::after { content:''; position:fixed; inset:0; z-index:9999; pointer-events:none; background:repeating-linear-gradient(0deg, rgba(0,0,0,0.05), rgba(0,0,0,0.05) 1px, transparent 1px, transparent 3px); }
  .header {
    background:var(--panel); border-bottom:4px solid var(--accent); padding:16px 20px;
    text-align:center; position:sticky; top:0; z-index:20;
  }
  .logo {
    font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:700; letter-spacing:0.4px;
    color:var(--accent3); text-shadow:2px 2px 0 var(--accent);
  }
  .logo span { -webkit-text-fill-color:initial; }
  .progress { position:fixed; top:0; left:0; height:4px; width:0; background:linear-gradient(90deg,var(--accent),var(--accent2),var(--accent3)); z-index:100; transition:width 0.08s linear; }
  .main { max-width:1080px; margin:0 auto; padding:34px 22px 60px; position:relative; z-index:1; }
  .article-wrap { display:grid; grid-template-columns:240px 1fr; gap:34px; align-items:start; }
  .toc-col { position:sticky; top:90px; }
  .toc { background:var(--panel); border:3px solid var(--accent2); border-radius:14px; padding:20px; box-shadow:5px 5px 0 rgba(0,0,0,0.5); max-height:calc(100vh - 120px); overflow:auto; }
  .toc-title { font-family:'Space Grotesk',sans-serif; font-size:13px; font-weight:700; color:var(--accent3); text-transform:uppercase; letter-spacing:1px; margin-bottom:16px; padding-bottom:10px; border-bottom:2px dashed var(--border); }
  .toc ul { list-style:none; }
  .toc li { margin-bottom:6px; line-height:1.5; }
  .toc li.lvl-3 { padding-left:16px; font-size:13px; }
  .toc a { color:var(--muted); text-decoration:none; font-size:14px; display:block; padding:7px 11px; border-left:3px solid transparent; border-radius:0 8px 8px 0; transition:all 0.15s; }
  .toc a:hover { color:var(--accent3); background:rgba(255,210,63,0.08); }
  .toc a.active { color:#fff; background:rgba(255,56,100,0.16); border-left-color:var(--accent); font-weight:600; }
  .article-col { min-width:0; }
  .article-header {
    background:linear-gradient(160deg,var(--bg-soft),var(--panel));
    border:3px solid var(--border); border-radius:16px; padding:34px 32px; margin-bottom:24px;
    box-shadow:5px 5px 0 rgba(0,0,0,0.5); position:relative; overflow:hidden;
  }
  .article-header::before {
    content:''; position:absolute; left:0; top:0; bottom:0; width:6px;
    background:linear-gradient(180deg,var(--accent),var(--accent2));
  }
  .article-header h1 {
    font-family:'Space Grotesk',sans-serif; font-size:30px; line-height:1.3; color:#fff; margin-bottom:18px; font-weight:700;
    text-shadow:1px 1px 0 rgba(0,0,0,0.4);
  }
  .article-meta { display:flex; gap:18px; flex-wrap:wrap; font-size:13px; color:var(--muted); }
  .article-meta span { display:inline-flex; align-items:center; gap:6px; }
  .article-meta .pill {
    background:rgba(33,230,193,0.14); color:var(--accent2); padding:4px 12px; border-radius:999px;
    font-weight:600; font-size:12px; letter-spacing:0.3px; border:1px solid rgba(33,230,193,0.3);
  }
  .article-content {
    background:var(--panel); border:3px solid var(--border); border-radius:16px; padding:36px 34px;
    box-shadow:5px 5px 0 rgba(0,0,0,0.5); font-size:17px; color:var(--text);
  }
  .article-content h2 {
    font-family:'Space Grotesk',sans-serif; font-size:23px; color:#fff; margin:34px 0 14px; font-weight:700;
    padding-bottom:10px; border-bottom:2px solid var(--accent2); scroll-margin-top:90px;
  }
  .article-content h3 { font-family:'Space Grotesk',sans-serif; font-size:19px; color:var(--accent3); margin:26px 0 12px; font-weight:600; scroll-margin-top:90px; }
  .article-content h4 { font-size:16px; color:var(--text); margin:22px 0 10px; font-weight:600; scroll-margin-top:90px; }
  .article-content p { margin-bottom:20px; color:#d6d9ee; }
  .article-content ul, .article-content ol { margin:0 0 22px 22px; }
  .article-content li { margin-bottom:11px; color:#d6d9ee; }
  .article-content li::marker { color:var(--accent2); }
  .article-content a { color:var(--accent2); text-decoration:none; border-bottom:1px solid rgba(33,230,193,0.4); }
  .article-content a:hover { border-bottom-color:var(--accent2); }
  .article-content code {
    background:var(--bg-soft); border:1px solid var(--border); border-radius:6px; padding:2px 7px;
    font-family:'JetBrains Mono',ui-monospace,monospace; font-size:14px; color:var(--accent2);
  }
  .article-content blockquote {
    border-left:4px solid var(--accent); background:rgba(255,56,100,0.08); border-radius:0 12px 12px 0;
    padding:14px 20px; margin:0 0 22px; color:#cfd3f2; font-style:italic;
  }
  .article-content hr { border:none; border-top:1px solid var(--border); margin:30px 0; }
  .tags { margin-top:28px; display:flex; gap:10px; flex-wrap:wrap; }
  .tag {
    background:var(--bg-soft); border:1px solid var(--border); border-radius:999px; padding:6px 14px;
    font-size:13px; color:var(--muted);
  }
  .back {
    display:inline-flex; align-items:center; gap:8px; margin-top:34px; color:#fff; text-decoration:none;
    font-size:14px; font-weight:600; background:var(--accent);
    padding:12px 22px; border-radius:12px; box-shadow:4px 4px 0 rgba(0,0,0,0.5); transition:transform 0.15s, box-shadow 0.15s;
  }
  .back:hover { transform:translate(-2px,-2px); box-shadow:6px 6px 0 var(--accent3); }
  .footer { background:var(--panel); border-top:4px solid var(--accent); text-align:center; padding:26px 20px; color:var(--muted); font-size:13px; margin-top:50px; }
  .nav { background:var(--panel); padding:12px; border-bottom:2px solid var(--border); display:flex; justify-content:center; gap:10px; flex-wrap:wrap; }
  .nav a { color:var(--text); text-decoration:none; padding:8px 12px; border:2px solid var(--border); background:var(--bg-dark); font-family:'Space Grotesk',sans-serif; font-size:13px; font-weight:600; border-radius:10px; transition:all 0.12s; }
  .nav a:hover { background:var(--accent); color:var(--bg-dark); border-color:var(--accent3); }
  @media(max-width:860px){
    .article-wrap{ grid-template-columns:1fr; }
    .toc-col{ position:static; }
    .article-header h1{font-size:24px} .article-content{padding:26px 20px} .main{padding:22px 14px 50px}
  }
</style>
</head>
<body>
<div class="progress" id="progress"></div>
<header class="header">
  <div class="logo"><span>🧪</span> PromptLab Studio</div>
</header>
<nav class="nav">
  <a href="/">🏠 Home</a>
  <a href="/?cat=ai">🤖 AI</a>
  <a href="/?cat=marketing">📢 Marketing</a>
  <a href="/?cat=freelance">💼 Freelance</a>
  <a href="/?cat=coding">💻 Coding</a>
  <a href="/?cat=crypto">₿ Crypto</a>
  <a href="/tentang">📖 Tentang</a>
  <a href="/docs">📚 Docs</a>
</nav>
<main class="main">
  <div class="article-wrap">
    <aside class="toc-col">
      ${toc.length ? `<nav class="toc"><div class="toc-title">📑 Daftar Isi</div><ul>${toc.map(t => `<li class="lvl-${t.lvl}"><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`).join('')}</ul></nav>` : ''}
    </aside>
    <div class="article-col">
      <article class="article-header">
        <h1>${escapeHtml(article.title)}</h1>
        <div class="article-meta">
          <span>📅 ${new Date(article.published_at).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</span>
          <span>📝 ${article.word_count} kata</span>
          <span>⏱ ${readMins} mnt baca</span>
          <span class="pill">${(article.category || 'GENERAL').toUpperCase()}</span>
        </div>
      </article>
      <div class="article-content">
        ${contentHtml}
      </div>
      <div class="tags">
        ${(article.keywords || []).map(k => `<span class="tag">#${escapeHtml(k)}</span>`).join('')}
      </div>
      <a href="/" class="back">← Kembali ke Beranda</a>
    </div>
  </div>
</main>
<footer class="footer">
  <p>© 2026 PromptLab Studio • Ditulis otomatis oleh AI Agent</p>
</footer>
<script>
  var bar = document.getElementById('progress');
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  var targets = links.map(function(a){ return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
  function onScroll(){
    var el = document.documentElement;
    var sc = el.scrollTop || document.body.scrollTop;
    var max = el.scrollHeight - el.clientHeight;
    var p = max > 0 ? (sc / max * 100) : 0;
    if (bar) bar.style.width = p + '%';
    var pos = sc + 120, current = null;
    for (var i=0;i<targets.length;i++){ if (targets[i].offsetTop <= pos) current = links[i]; }
    links.forEach(function(l){ l.classList.remove('active'); });
    if (current) current.classList.add('active');
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('load', onScroll);
  onScroll();
  </script>
  <script src="https://pl30244763.effectivecpmnetwork.com/fb/f9/61/fbf96105e95070c88ecdab8a2e410dc4.js"></script>
  <script>
    setInterval(function(){
      var s=document.createElement('script');
      s.src='https://pl30244763.effectivecpmnetwork.com/fb/f9/61/fbf96105e95070c88ecdab8a2e410dc4.js?cb='+Date.now();
      document.body.appendChild(s);
    }, 900000);
  </script>
  </body>
</html>`;

  return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html' } });
}

async function renderLogin(env, headers, wrong) {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<link rel="icon" href="/favicon.ico">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🔐 ADMIN LOGIN | PromptLab Studio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap');
  :root {
    --bg:#0b0e1f; --panel:#171c3a; --primary:#8b93ff; --secondary:#46d6c4;
    --text:#e9ebf7; --muted:#9aa1c4; --border:rgba(255,255,255,0.08);
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  body {
    font-family:'Plus Jakarta Sans',system-ui,sans-serif; background:radial-gradient(1100px 600px at 50% -12%, #1a1f4d 0%, var(--bg) 60%);
    background-attachment:fixed; color:var(--text); min-height:100vh; display:flex; align-items:center; justify-content:center; -webkit-font-smoothing:antialiased;
  }
  .box { position:relative; z-index:2; background:var(--panel); border:1px solid var(--border); border-radius:24px; padding:40px; width:min(90vw,420px); text-align:center; box-shadow:0 24px 60px rgba(0,0,0,0.5); }
  .box .logo { font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:700; margin-bottom:6px; display:flex; align-items:center; justify-content:center; gap:8px;
    background:linear-gradient(90deg,var(--primary),var(--secondary)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
  .box .sub { font-size:14px; color:var(--muted); margin-bottom:26px; }
  .box .err { font-size:14px; color:#ff6b8a; margin-bottom:16px; }
  .box input { width:100%; font-size:15px; padding:14px 16px; background:rgba(11,14,31,0.6); color:var(--text); border:1px solid var(--border); border-radius:12px; margin-bottom:18px; outline:none; transition:border-color 0.15s; }
  .box input:focus { border-color:var(--primary); box-shadow:0 0 0 3px rgba(139,147,255,0.15); }
  .box button { width:100%; font-size:15px; font-weight:600; padding:14px; background:linear-gradient(90deg,var(--primary),#7b83f0); color:#0b0e1f; border:none; border-radius:12px; cursor:pointer; transition:transform 0.15s, box-shadow 0.15s; }
  .box button:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(139,147,255,0.35); }
  .box .hint { font-size:13px; color:var(--muted); margin-top:18px; }
</style>
</head>
<body>
  <div class="box">
    <div class="logo"><span>🧪</span> PromptLab Studio</div>
    <div class="sub">Masuk ke panel admin</div>
    ${wrong ? '<div class="err">❌ Password salah!</div>' : ''}
    <form method="POST" action="/rahasia-admin">
      <input type="password" name="password" placeholder="Password admin" autofocus>
      <button type="submit">Masuk</button>
    </form>
    <div class="hint">Buka /rahasia-admin atau tekan CTRL+SHIFT+A</div>
  </div>
</body>
</html>`;
  return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html' } });
}

async function renderAdmin(env, headers) {
  const queue = await sbGet(env, 'article_queue?order=created_at.desc&limit=20');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<link rel="icon" href="/favicon.ico">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>⚙️ ADMIN PANEL | PromptLab Studio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  :root{--bg-dark:#0f0f23;--bg-panel:#1a1a2e;--accent:#ff6b6b;--accent2:#4ecdc4;--accent3:#ffe66d;--text:#e0e0e0;--text-dim:#888;--border:#333;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Press Start 2P',monospace;background:var(--bg-dark);color:var(--text);font-size:12px;}
  body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.15),rgba(0,0,0,0.15)1px,transparent 1px,transparent 2px);pointer-events:none;z-index:9999;}
  .layout{display:flex;min-height:calc(100vh-80px);position:relative;z-index:2;}
  .sidebar{width:220px;background:var(--bg-panel);border-right:4px solid var(--accent);padding:20px;flex-shrink:0;}
  .sidebar .logo{font-size:14px;color:var(--accent3);text-shadow:2px 2px 0 var(--accent);margin-bottom:25px;text-align:center;}
  .nav-item{padding:16px;border:2px solid var(--border);margin-bottom:10px;cursor:pointer;text-align:center;font-size:10px;transition:all 0.1s;background:var(--bg-dark);letter-spacing:0.5px;}
  .nav-item:hover,.nav-item.active{background:var(--accent);color:var(--bg-dark);border-color:var(--accent3);transform:translateY(-2px);box-shadow:4px 4px 0 var(--accent3);}
  .content{flex:1;padding:28px;overflow-y:auto;min-width:0;}
  .section{display:none;}
  .section.active{display:block;}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:28px;}
  .stat-box{background:var(--bg-panel);border:2px solid var(--accent2);padding:18px;text-align:center;}
  .stat-box .label{font-size:9px;color:var(--accent2);margin-bottom:8px;}
  .stat-box .value{font-size:20px;color:var(--text);}
  .panel{background:var(--bg-panel);border:2px solid var(--accent);padding:24px;margin-bottom:22px;}
  .panel h2{font-size:13px;color:var(--accent);margin-bottom:16px;border-bottom:2px solid var(--border);padding-bottom:10px;}
  .queue-item{display:flex;justify-content:space-between;align-items:center;padding:16px;border:1px solid var(--border);margin-bottom:10px;background:var(--bg-dark);flex-wrap:wrap;gap:12px;}
  .queue-item .info{flex:1;min-width:240px;}
  .queue-item .title{font-size:11px;color:var(--text);margin-bottom:8px;}
  .queue-item .status{font-size:9px;color:var(--text-dim);}
  .steps{display:flex;gap:6px;margin:10px 0;}
  .step{width:28px;height:28px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:9px;}
  .step-done{background:var(--accent2);border-color:var(--accent2);color:var(--bg-dark);}
  .step-current{background:var(--accent3);border-color:var(--accent3);color:var(--bg-dark);animation:pulse 1s infinite;}
  .step-pending{color:var(--text-dim);}
  .step-failed{background:var(--accent);border-color:var(--accent);color:var(--bg-dark);}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
  .btn{padding:10px 14px;border:2px solid;background:var(--bg-dark);color:var(--text);font-family:inherit;font-size:9px;cursor:pointer;transition:all 0.1s;white-space:nowrap;}
  .btn:hover{transform:translateY(-2px);}
  .btn-approve{border-color:var(--accent2);color:var(--accent2);}
  .btn-approve:hover{background:var(--accent2);color:var(--bg-dark);}
  .btn-reject{border-color:var(--accent);color:var(--accent);}
  .btn-reject:hover{background:var(--accent);color:var(--bg-dark);}
  .btn-retry{border-color:var(--accent3);color:var(--accent3);}
  .btn-retry:hover{background:var(--accent3);color:var(--bg-dark);}
  .provider-card{background:var(--bg-dark);border:2px solid var(--border);padding:18px;margin-bottom:12px;}
  .provider-card h3{font-size:12px;color:var(--accent3);margin-bottom:10px;}
  .provider-card label{font-size:9px;color:var(--text-dim);display:block;margin-bottom:6px;margin-top:10px;}
  .provider-card input{width:100%;font-family:inherit;font-size:10px;padding:10px;background:var(--bg-panel);color:var(--text);border:2px solid var(--border);}
  .badge{display:inline-block;font-size:9px;padding:5px 10px;margin-bottom:10px;}
  .badge-ok{background:var(--accent2);color:var(--bg-dark);}
  .badge-no{background:var(--accent);color:var(--text);}
  input,select,textarea{outline:none;}
  input:focus,select:focus,textarea:focus{border-color:var(--accent3) !important;}
  .footer{background:var(--bg-panel);border-top:4px solid var(--accent);padding:16px;text-align:center;font-size:9px;color:var(--text-dim);}
  @media(max-width:720px){.layout{flex-direction:column}.sidebar{width:100%;border-right:none;border-bottom:4px solid var(--accent);display:flex;gap:10px;flex-wrap:wrap;padding:14px;}.sidebar .logo{width:100%;margin-bottom:12px;}.nav-item{flex:1;min-width:90px;font-size:9px;padding:10px;}}
</style>
</head>
<body>
<header class="header" style="background:var(--bg-panel);border-bottom:4px solid var(--accent);padding:20px;text-align:center;">
  <div class="logo" style="font-size:18px;color:var(--accent3);text-shadow:3px 3px 0 var(--accent);">⚙️ ADMIN • PromptLab Studio</div>
</header>
<div class="layout">
  <nav class="sidebar">
    <div class="logo">⚙️ MENU</div>
    <div class="nav-item active" data-target="section-stats" onclick="showSection('section-stats')">📊 DASHBOARD</div>
    <div class="nav-item" data-target="section-provider" onclick="showSection('section-provider')">🔌 PROVIDER</div>
    <div class="nav-item" data-target="section-agent" onclick="showSection('section-agent')">🤖 AGENT CONFIG</div>
    <div class="nav-item" data-target="section-queue" onclick="showSection('section-queue')">📋 PIPELINE QUEUE</div>
    <div class="nav-item" data-target="section-articles" onclick="showSection('section-articles')">📚 ARTICLES</div>
    <div class="nav-item" data-target="section-write" onclick="showSection('section-write')">✍️ WRITE MANUAL</div>
    <div style="margin-top:20px;padding:10px;border-top:2px solid var(--border);text-align:center;">
      <a href="/admin?logout=1" style="color:var(--accent);text-decoration:none;font-size:8px;">⏻ LOGOUT</a>
    </div>
  </nav>
  <main class="content">
    <!-- SECTION: DASHBOARD -->
    <div id="section-stats" class="section active">
      <div class="stats">
        <div class="stat-box"><div class="label">TOTAL QUEUED</div><div class="value">${queue.length}</div></div>
        <div class="stat-box"><div class="label">PUBLISHED</div><div class="value">${queue.filter(q=>q.status==='published').length}</div></div>
        <div class="stat-box"><div class="label">FAILED</div><div class="value">${queue.filter(q=>q.status==='failed').length}</div></div>
        <div class="stat-box"><div class="label">NEEDS REVIEW</div><div class="value">${queue.filter(q=>q.status==='needs_review').length}</div></div>
      </div>
      <div class="panel"><h2>► SYSTEM STATUS</h2><p style="font-size:8px;color:var(--text-dim);line-height:2;">Pipeline: Sequential 3-Step (Outline → Draft → Polish)<br>Fallback: 3 free OpenRouter models<br>Providers: OpenRouter, DeepSeek</p>
        <div style="margin-top:12px;"><button class="btn btn-approve" onclick="genTest()">► GENERATE TEST ARTICLE</button> <span id="gen-msg" style="font-size:8px;color:var(--accent2);"></span></div>
      </div>
    </div>

    <!-- SECTION: PROVIDER -->
    <div id="section-provider" class="section">
      <div class="panel"><h2>🔌 PROVIDER CONFIGURATION</h2>
        <div id="provider-forms"></div>
        <div style="margin-top:12px;"><button class="btn btn-approve" onclick="saveProviders()">► SAVE PROVIDERS</button></div>
        <div id="provider-msg" style="font-size:10px;color:var(--accent2);margin-top:12px;"></div>
      </div>
    </div>

    <!-- SECTION: AGENT CONFIG -->
    <div id="section-agent" class="section">
      <div class="panel"><h2>🤖 AGENT CONFIG</h2>
        <label style="font-size:10px;color:var(--accent2);display:block;margin-bottom:14px;"><input type="checkbox" id="free-only"> ALL FREE (hanya model :free)</label>
        <div id="agent-forms"><p style="color:var(--text-dim);font-size:8px;">Loading agents...</p></div>
        <div id="agent-msg" style="font-size:10px;color:var(--accent2);margin-top:12px;"></div>
      </div>
    </div>

    <!-- SECTION: QUEUE -->
    <div id="section-queue" class="section">
      <div class="panel"><h2>📋 PIPELINE QUEUE</h2>
        ${queue.map(q=>{
          const s1=q.step1_validated?'step-done':q.current_step===1?'step-current':q.error_step===1?'step-failed':'step-pending';
          const s2=q.step2_validated?'step-done':q.current_step===2?'step-current':q.error_step===2?'step-failed':'step-pending';
          const s3=q.step3_validated?'step-done':q.current_step===3?'step-current':q.error_step===3?'step-failed':'step-pending';
          const s4=q.status==='published'?'step-done':'step-pending';
          return '<div class="queue-item"><div class="info"><div class="title">'+q.topic+'</div><div class="status" style="color:'+(q.status==='published'?'var(--accent2)':q.status==='failed'?'var(--accent)':q.status==='needs_review'?'var(--accent3)':'var(--text-dim)')+'"><div class="steps"><div class="step '+s1+'">1</div><div class="step '+s2+'">2</div><div class="step '+s3+'">3</div><div class="step '+s4+'">✓</div></div>'+q.status.toUpperCase()+(q.last_error?' • ERR: '+q.last_error:'')+'</div></div><div style="display:flex;gap:6px;">'+(q.status==='polish_done'||q.status==='draft_done'?'<button class="btn btn-approve" onclick="publish(\''+q.id+'\')">✓ PUB</button>':'')+(q.status==='failed'||q.status==='needs_review'?'<button class="btn btn-retry" onclick="retry(\''+q.id+'\')">↻ RETRY</button>':'')+'<button class="btn btn-reject" onclick="reject(\''+q.id+'\')">✗ DEL</button></div></div>';
        }).join('')}
      </div>
    </div>

    <!-- SECTION: ARTICLES -->
    <div id="section-articles" class="section">
      <div class="panel"><h2>📚 MANAGE ARTICLES</h2>
        <div id="articles-list"><p style="color:var(--text-dim);font-size:8px;">Loading articles...</p></div>
        <div id="article-editor" style="display:none;margin-top:18px;border:2px solid var(--accent2);padding:18px;">
          <div style="font-size:11px;color:var(--accent3);margin-bottom:12px;">✎ EDIT ARTIKEL</div>
          <input id="ed-title" placeholder="JUDUL" style="width:100%;font-family:inherit;font-size:11px;padding:12px;background:var(--bg-dark);color:var(--text);border:2px solid var(--accent2);margin-bottom:10px;">
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
            <select id="ed-category" style="font-family:inherit;font-size:11px;padding:12px;background:var(--bg-dark);color:var(--text);border:2px solid var(--accent2);">
              <option value="ai">AI</option><option value="marketing">MARKETING</option><option value="freelance">FREELANCE</option><option value="coding">CODING</option><option value="crypto">CRYPTO</option>
            </select>
            <input id="ed-slug" placeholder="SLUG (url)" style="flex:1;min-width:160px;font-family:inherit;font-size:11px;padding:12px;background:var(--bg-dark);color:var(--text);border:2px solid var(--accent2);">
          </div>
          <input id="ed-meta" placeholder="META DESCRIPTION" style="width:100%;font-family:inherit;font-size:11px;padding:12px;background:var(--bg-dark);color:var(--text);border:2px solid var(--accent2);margin-bottom:10px;">
          <textarea id="ed-content" rows="10" placeholder="KONTEN (Markdown)" style="width:100%;font-family:inherit;font-size:11px;padding:12px;background:var(--bg-dark);color:var(--text);border:2px solid var(--accent2);margin-bottom:10px;"></textarea>
          <button class="btn btn-approve" onclick="saveArticle()">► SAVE</button>
          <button class="btn btn-reject" onclick="cancelEdit()">✗ CANCEL</button>
        </div>
      </div>
    </div>

    <!-- SECTION: WRITE MANUAL -->
    <div id="section-write" class="section">
      <div class="panel"><h2>✍️ MANUAL WRITE</h2>
        <form id="manual-form" style="display:flex;flex-direction:column;gap:8px;">
          <input name="title" placeholder="JUDUL ARTIKEL" style="font-family:inherit;font-size:11px;padding:14px;background:var(--bg-dark);color:var(--text);border:2px solid var(--accent2);">
          <select name="category" style="font-family:inherit;font-size:11px;padding:14px;background:var(--bg-dark);color:var(--text);border:2px solid var(--accent2);">
            <option value="ai">AI</option><option value="marketing">MARKETING</option><option value="freelance">FREELANCE</option><option value="coding">CODING</option><option value="crypto">CRYPTO</option>
          </select>
          <label style="font-size:10px;color:var(--accent2);"><input type="checkbox" name="write_by_ai" checked> WRITE BY AI (generate otomatis)</label>
          <textarea name="content" placeholder="KONTEN (kosongkan jika WRITE BY AI aktif)" rows="6" style="font-family:inherit;font-size:11px;padding:14px;background:var(--bg-dark);color:var(--text);border:2px solid var(--accent2);"></textarea>
          <button type="submit" class="btn btn-approve" style="align-self:flex-start;">► PUBLISH</button>
        </form>
        <div id="manual-msg" style="font-size:10px;color:var(--accent3);margin-top:12px;"></div>
      </div>
    </div>
  </main>
</div>
<footer class="footer">
  <p>PromptLab Studio ADMIN • Multi-Provider Pipeline</p>
</footer>
<script>
var PROV_NAMES = ['openrouter','deepseek'];
var PROV_LABELS = {openrouter:'OpenRouter',deepseek:'DeepSeek'};
var PROV_DEFAULTS = {openrouter:'https://openrouter.ai/api/v1/chat/completions',deepseek:'https://api.deepseek.com/v1/chat/completions'};
  var PROV_MODELS = {openrouter:'',deepseek:'deepseek-v4-flash'};
  var PROV_MODEL_LISTS = {deepseek:[{id:'deepseek-v4-flash',name:'DeepSeek V4 Flash (deepseek-v4-flash)'},{id:'deepseek-v4-pro',name:'DeepSeek V4 Pro (deepseek-v4-pro)'},{id:'deepseek-chat',name:'DeepSeek Chat (deepseek-chat) — deprecated 2026/07/24'},{id:'deepseek-reasoner',name:'DeepSeek Reasoner (deepseek-reasoner) — deprecated 2026/07/24'}]};
  function modelCtrl(cat, prov, current){
    var sel='font-family:inherit;font-size:10px;padding:10px;width:100%;background:var(--bg-panel);color:var(--text);border:2px solid var(--accent2);margin-bottom:8px;';
    if(prov==='openrouter'){var o='<option value="">-- default model --</option>';ALL_MODELS.forEach(function(m){o+='<option value="'+m.id+'"'+(m.id===current?' selected':'')+'>'+m.name+'</option>'});return '<select class="agent-model-select" data-cat="'+cat+'" onchange="applyFreeFilter()">'+o+'</select>';}
    if(PROV_MODEL_LISTS[prov]){var o2='';PROV_MODEL_LISTS[prov].forEach(function(m){o2+='<option value="'+m.id+'"'+(m.id===current?' selected':'')+'>'+m.name+'</option>'});return '<select class="agent-model-fixed" data-cat="'+cat+'" style="'+sel+'">'+o2+'</select>';}
    return '<input class="agent-model-input" data-cat="'+cat+'" placeholder="Model name" value="'+(current||'')+'" style="'+sel+'">';
  }

  function showSection(id){document.querySelectorAll('.section').forEach(function(s){s.classList.remove('active')});var sec=document.getElementById(id);if(sec)sec.classList.add('active');document.querySelectorAll('.nav-item').forEach(function(n){n.classList.toggle('active',n.getAttribute('data-target')===id)});if(id==='section-articles')loadArticles();}

  // PROVIDERS
  async function loadProviders(){try{var r=await fetch('/api/providers');return await r.json()}catch(e){return{}}}
  function renderProviders(){var provsP=loadProviders();var wrap=document.getElementById('provider-forms');wrap.innerHTML='<p style="color:var(--text-dim);font-size:8px;">Loading providers...</p>';provsP.then(function(provs){wrap.innerHTML='';PROV_NAMES.forEach(function(pn){var p=provs[pn]||{};var card=document.createElement('div');card.className='provider-card';card.innerHTML='<h3>'+PROV_LABELS[pn]+' <span class="badge '+(p.hasKey?'badge-ok':'badge-no')+'">'+(p.hasKey?'✓ CONFIGURED':'✗ NO KEY')+'</span></h3><label>BASE URL</label><input class="prov-url" data-prov="'+pn+'" value="'+(p.baseUrl||PROV_DEFAULTS[pn])+'" placeholder="https://..."><label>API KEY</label><input class="prov-key" data-prov="'+pn+'" type="password" placeholder="sk-... (kosongkan jika tidak diubah)">';wrap.appendChild(card);});});}
  async function saveProviders(){var payload={};document.querySelectorAll('.prov-url').forEach(function(inp){var pn=inp.dataset.prov;if(!payload[pn])payload[pn]={};payload[pn].baseUrl=inp.value;});document.querySelectorAll('.prov-key').forEach(function(inp){var pn=inp.dataset.prov;if(inp.value){if(!payload[pn])payload[pn]={};payload[pn].key=inp.value;}});var res=await fetch('/api/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});document.getElementById('provider-msg').textContent=res.ok?'✔ PROVIDERS SAVED':'✗ GAGAL';if(res.ok)renderProviders();}

  // AGENT
  var CATS=['ai','marketing','freelance','coding','crypto'];
  var ALL_MODELS=[];
  async function loadModels(){try{var r=await fetch('/api/models');if(!r.ok)return [];return await r.json()}catch(e){return []}}
  async function loadAgents(){try{var r=await fetch('/api/agents');return await r.json()}catch(e){return {agents:[],topic_pools:{}}}}
  function applyFreeFilter(){var freeOnly=document.getElementById('free-only').checked;var models=freeOnly?ALL_MODELS.filter(function(m){return m.id.indexOf(':free')!==-1}):ALL_MODELS;document.querySelectorAll('.agent-model-select').forEach(function(sel){var cur=sel.value;var opts='<option value="">-- default model --</option>';models.forEach(function(m){opts+='<option value="'+m.id+'">'+m.name+'</option>'});sel.innerHTML=opts;sel.value=cur;});}
  function onProviderChange(sel){var cat=sel.dataset.cat;var prov=sel.value;var c=document.getElementById('model-container-'+cat);if(!c)return;var prev=(c.querySelector('.agent-model-select')||c.querySelector('.agent-model-fixed')||c.querySelector('.agent-model-input')||{}).value||'';c.innerHTML=modelCtrl(cat,prov,prev);if(prov==='openrouter')applyFreeFilter();}
  async function renderAgentConfig(){ALL_MODELS=await loadModels();var agentsData=await loadAgents();var agents={};(agentsData.agents||[]).forEach(function(a){agents[a.category]=a;});var wrap=document.getElementById('agent-forms');wrap.innerHTML='';CATS.forEach(function(cat){var a=agents[cat]||{};var prov=a.provider||'openrouter';var provOpts='';PROV_NAMES.forEach(function(pn){provOpts+='<option value="'+pn+'"'+(prov===pn?' selected':'')+'>'+PROV_LABELS[pn]+'</option>'});var row=document.createElement('div');row.style.cssText='border:1px solid var(--border);padding:14px;margin-bottom:10px;background:var(--bg-dark);';var defModel=(prov!=='openrouter'?PROV_MODELS[prov]||'':a.model||'');row.innerHTML='<div style="font-size:11px;color:var(--accent3);margin-bottom:10px;">'+cat.toUpperCase()+'</div><select class="agent-prov" data-cat="'+cat+'" onchange="onProviderChange(this)" style="font-family:inherit;font-size:10px;padding:10px;width:100%;background:var(--bg-panel);color:var(--text);border:2px solid var(--accent2);margin-bottom:8px;">'+provOpts+'</select><div id="model-container-'+cat+'">'+modelCtrl(cat,prov,defModel)+'</div><textarea class="agent-role" data-cat="'+cat+'" rows="4" placeholder="Role / persona..." style="font-family:inherit;font-size:10px;padding:10px;width:100%;background:var(--bg-panel);color:var(--text);border:2px solid var(--accent2);">'+(a.role_prompt||'')+'</textarea>';wrap.appendChild(row);});var save=document.createElement('button');save.className='btn btn-approve';save.textContent='► SAVE AGENTS';save.onclick=saveAgents;wrap.appendChild(save);applyFreeFilter();}
  async function saveAgents(){var agents=[];document.querySelectorAll('.agent-prov').forEach(function(sel){var cat=sel.dataset.cat;var prov=sel.value;var c=document.getElementById('model-container-'+cat);var model='';var os=c.querySelector('.agent-model-select');var fs=c.querySelector('.agent-model-fixed');var ip=c.querySelector('.agent-model-input');if(os&&os.style.display!=='none')model=os.value;else if(fs&&fs.style.display!=='none')model=fs.value;else if(ip)model=ip.value;var role=document.querySelector('.agent-role[data-cat="'+cat+'"]');agents.push({category:cat,model:model||null,role_prompt:(role?role.value:'')||null,provider:prov});});var res=await fetch('/api/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agents:agents})});document.getElementById('agent-msg').textContent=res.ok?'✔ TERSIMPAN':'✗ GAGAL';}

  // QUEUE ACTIONS
  async function genTest(){var cats=['ai','marketing','freelance','coding','crypto'];var c=cats[Math.floor(Math.random()*cats.length)];var m=document.getElementById('gen-msg');m.textContent='⏳ Generating...';try{var res=await fetch('/api/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'',category:c,content:'',write_by_ai:true,topic:''})});var data=await res.json();if(data.success){m.textContent='✔ Done ('+(data.warning||'published')+')';setTimeout(function(){location.reload()},2000);}else{m.textContent='✗ '+(data.error||'GAGAL');}}catch(e){m.textContent='✗ NETWORK ERROR';}}
  async function retry(id){await fetch('/api/retry/'+id,{method:'POST'});location.reload();}
  async function reject(id){if(confirm('Delete this item?')){await fetch('/api/delete/'+id,{method:'DELETE'});location.reload();}}

  // ARTICLES MANAGEMENT
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  async function loadArticles(){var wrap=document.getElementById('articles-list');wrap.innerHTML='<p style="color:var(--text-dim);font-size:8px;">Loading articles...</p>';try{var r=await fetch('/api/articles?limit=100&page=1');var list=await r.json();if(!Array.isArray(list)||!list.length){wrap.innerHTML='<p style="color:var(--text-dim);font-size:8px;">Tidak ada artikel.</p>';return;}wrap.innerHTML='';list.forEach(function(a){var div=document.createElement('div');div.className='queue-item';var info=document.createElement('div');info.className='info';var title=document.createElement('div');title.className='title';title.textContent=a.title||'(tanpa judul)';var status=document.createElement('div');status.className='status';status.textContent=(a.category||'GENERAL').toUpperCase()+' • '+new Date(a.published_at).toLocaleDateString('id-ID')+' • '+(a.word_count||0)+' kata';info.appendChild(title);info.appendChild(status);var actions=document.createElement('div');actions.style.cssText='display:flex;gap:6px;';var bEdit=document.createElement('button');bEdit.className='btn btn-approve';bEdit.textContent='✎ EDIT';bEdit.onclick=function(){editArticle(a.id);};var bDel=document.createElement('button');bDel.className='btn btn-reject';bDel.textContent='✗ DEL';bDel.onclick=function(){delArticle(a.id);};actions.appendChild(bEdit);actions.appendChild(bDel);div.appendChild(info);div.appendChild(actions);wrap.appendChild(div);});}catch(e){wrap.innerHTML='<p style="color:var(--accent);font-size:8px;">Gagal memuat.</p>';}}
  var editId=null;
  async function editArticle(id){editId=id;var r=await fetch('/api/articles?limit=200&page=1');var list=await r.json();var a=(list||[]).find(function(x){return x.id===id;});if(!a)return;document.getElementById('ed-title').value=a.title||'';document.getElementById('ed-category').value=a.category||'ai';document.getElementById('ed-slug').value=a.slug||'';document.getElementById('ed-meta').value=a.meta_description||'';document.getElementById('ed-content').value=typeof a.content==='string'?a.content:'';document.getElementById('article-editor').style.display='block';}
  async function saveArticle(){var payload={title:document.getElementById('ed-title').value,category:document.getElementById('ed-category').value,slug:document.getElementById('ed-slug').value,meta_description:document.getElementById('ed-meta').value,content:document.getElementById('ed-content').value};try{var res=await fetch('/api/articles/'+editId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(res.ok){document.getElementById('article-editor').style.display='none';loadArticles();}else{alert('Gagal menyimpan');}}catch(e){alert('Network error');}}
  function cancelEdit(){document.getElementById('article-editor').style.display='none';}
  async function delArticle(id){if(confirm('Hapus artikel ini secara permanen?')){await fetch('/api/articles/'+id,{method:'DELETE'});loadArticles();}}

  // MANUAL WRITE
  document.getElementById('manual-form').addEventListener('submit',async function(e){e.preventDefault();var f=e.target;var payload={title:f.title.value,category:f.category.value,content:f.content.value,write_by_ai:f.write_by_ai.checked};try{var res=await fetch('/api/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});var data=await res.json();if(data.success){document.getElementById('manual-msg').textContent='✔ '+(payload.write_by_ai?'AI generate diproses':'Artikel dipublish');f.reset()}else{document.getElementById('manual-msg').textContent='✗ '+(data.error||'GAGAL')}}catch(e){document.getElementById('manual-msg').textContent='✗ NETWORK ERROR'}});

  document.getElementById('free-only').addEventListener('change',applyFreeFilter);
  renderProviders();
  renderAgentConfig();
</script>
</body>
</html>`;

  return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html' } });
}
