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
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🧪</text></svg>`;
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
    this.defaultSystem = 'Kamu adalah penulis artikel profesional Indonesia. Hindari pengulangan. Gunakan contoh konkret. Tulis dengan gaya retro 16-bit yang menghibur namun informatif.';
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
        const data = await this.callLLM(this.activeProvider, model, this.systemPrompt, this.buildPrompt(stepName, topic, keywords, previousData), stepName === 'polish' ? 17000 : 4000);

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
        const data = await this.callLLM(this.activeProvider, this.models[i], this.systemPrompt, this.buildPrompt(stepName, topic, keywords, previousData), stepName === 'polish' ? 17000 : 4000);
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

  buildPrompt(step, topic, keywords, previousData) {
    const prompts = {
      outline: `Buat outline artikel dalam Bahasa Indonesia tentang "${topic}". Keywords: ${keywords && keywords.length ? keywords.join(', ') : 'tutorial, panduan'}. Output JSON: {"title": "...", "sections": [{"name": "...", "keyPoints": ["..."]}]}`,
      draft: `Tulis artikel lengkap dalam Bahasa Indonesia tentang "${topic}". Outline: ${JSON.stringify(previousData)}. Panjang 800-1000 kata. Tone: santai seperti ngobrol sama teman. Gunakan "kamu" bukan "Anda".`,
      polish: `Polish artikel ini. Output JSON: {"title": "...", "content": "...", "metaDescription": "...", "excerpt": "..."}. Artikel: ${typeof previousData === 'string' ? previousData.substring(0, 5000) : JSON.stringify(previousData)}`
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

async function renderHomepage(env, headers, url) {
  const cat = url && url.searchParams.get('cat');
  const validCats = ['ai','marketing','freelance','coding','crypto'];
  const activeCat = (cat && validCats.includes(cat)) ? cat : null;
  const q = activeCat
    ? `${env.SUPABASE_URL}/rest/v1/articles?status=eq.published&category=eq.${encodeURIComponent(activeCat)}&order=published_at.desc&limit=13`
    : `${env.SUPABASE_URL}/rest/v1/articles?status=eq.published&order=published_at.desc&limit=13`;
  const response = await fetch(q, {
    headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` }
  });
  const articles = await response.json();
  const featured = articles[0];
  const grid = articles.slice(1);
  function fmtDate(d){ try { return new Date(d).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}); } catch(e){ return ''; } }
  function readMins(wc){ return Math.max(1, Math.round((wc||0)/200)); }
  function excerptOf(md, n){ const t = stripMd(md||''); return t.length > n ? t.slice(0,n).trim() + '…' : t; }
  const cats = [{k:'ai',label:'AI',icon:'🤖'},{k:'marketing',label:'Marketing',icon:'📈'},{k:'freelance',label:'Freelance',icon:'💼'},{k:'coding',label:'Coding',icon:'💻'},{k:'crypto',label:'Crypto',icon:'₿'}];
  const navLinks = [{k:'',label:'Beranda',icon:'🏠'}].concat(cats);
  const navHtml = navLinks.map(c => {
    const href = c.k ? `/?cat=${c.k}` : '/';
    const active = (c.k === activeCat) ? ' active' : '';
    return `<a href="${href}" class="nav-link${active}">${c.icon} ${c.label}</a>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PromptLab Studio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap');
  :root {
    --bg:#0b0e1f; --bg-soft:#141833; --panel:#171c3a; --panel-2:#1f2547;
    --text:#e9ebf7; --muted:#9aa1c4; --primary:#8b93ff; --primary-soft:rgba(139,147,255,0.14);
    --secondary:#46d6c4; --border:rgba(255,255,255,0.08); --shadow:0 18px 50px rgba(0,0,0,0.40);
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  html { scroll-behavior:smooth; }
  body { font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; background:radial-gradient(1200px 700px at 50% -15%, #1a1f4d 0%, var(--bg) 60%); background-attachment:fixed; color:var(--text); line-height:1.7; font-size:16px; -webkit-font-smoothing:antialiased; min-height:100vh; }
  body::before { content:''; position:fixed; inset:0; z-index:0; pointer-events:none; background:radial-gradient(600px 320px at 85% 8%, rgba(139,147,255,0.10), transparent 60%),radial-gradient(520px 300px at 12% 88%, rgba(70,214,196,0.08), transparent 60%); }

  .header { position:sticky; top:0; z-index:20; background:rgba(11,14,31,0.72); backdrop-filter:blur(12px); border-bottom:1px solid var(--border); padding:15px 22px; }
  .header-inner { max-width:1080px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:16px; }
  .logo { font-family:'Space Grotesk',sans-serif; font-size:21px; font-weight:700; letter-spacing:0.4px; display:flex; align-items:center; gap:10px; background:linear-gradient(90deg,var(--primary),var(--secondary)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
  .tagline { font-size:13px; color:var(--muted); }

  .nav { max-width:1080px; margin:18px auto 0; display:flex; gap:10px; flex-wrap:wrap; padding:0 22px; }
  .nav-link { color:var(--muted); text-decoration:none; padding:9px 16px; border:1px solid var(--border); border-radius:999px; font-size:14px; font-weight:500; transition:all 0.18s; background:rgba(255,255,255,0.02); }
  .nav-link:hover { color:#fff; border-color:var(--primary); transform:translateY(-1px); }
  .nav-link.active { background:linear-gradient(90deg,var(--primary),#7b83f0); color:#0b0e1f; border-color:transparent; font-weight:600; box-shadow:0 8px 20px rgba(139,147,255,0.35); }

  .main { max-width:1080px; margin:0 auto; padding:30px 22px 60px; position:relative; z-index:1; }
  .section-title { font-family:'Space Grotesk',sans-serif; font-size:14px; font-weight:600; color:var(--muted); letter-spacing:1px; text-transform:uppercase; margin:30px 4px 16px; display:flex; align-items:center; gap:10px; }
  .section-title::before { content:''; width:18px; height:2px; background:var(--secondary); border-radius:2px; }

  .featured { display:block; text-decoration:none; color:inherit; background:linear-gradient(135deg,var(--panel-2),var(--panel)); border:1px solid var(--border); border-radius:24px; padding:38px 36px; margin-bottom:14px; box-shadow:var(--shadow); position:relative; overflow:hidden; transition:transform 0.2s, box-shadow 0.2s, border-color 0.2s; }
  .featured::after { content:''; position:absolute; right:-60px; top:-60px; width:240px; height:240px; background:radial-gradient(circle, rgba(139,147,255,0.18), transparent 70%); pointer-events:none; }
  .featured:hover { transform:translateY(-4px); border-color:rgba(139,147,255,0.5); box-shadow:0 26px 60px rgba(0,0,0,0.5); }
  .featured .pill { margin-bottom:14px; }
  .featured h2 { font-family:'Space Grotesk',sans-serif; font-size:30px; line-height:1.25; color:#fff; margin-bottom:14px; font-weight:700; max-width:760px; }
  .featured .excerpt { font-size:17px; color:var(--muted); line-height:1.65; max-width:720px; margin-bottom:18px; }
  .featured .meta { display:flex; gap:16px; flex-wrap:wrap; font-size:13px; color:var(--muted); margin-bottom:16px; }
  .read-btn { display:inline-block; color:var(--secondary); font-weight:600; font-size:14px; transition:gap 0.2s; }

  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:20px; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:20px; padding:24px; box-shadow:var(--shadow); transition:transform 0.18s, box-shadow 0.18s, border-color 0.18s; }
  .card:hover { transform:translateY(-5px); border-color:rgba(139,147,255,0.5); box-shadow:0 22px 50px rgba(0,0,0,0.5); }
  .card-link { text-decoration:none; color:inherit; display:block; }
  .card .pill { margin-bottom:12px; }
  .card h3 { font-family:'Space Grotesk',sans-serif; font-size:19px; font-weight:600; color:#fff; margin-bottom:12px; line-height:1.4; min-height:52px; }
  .card .excerpt { font-size:14px; color:var(--muted); line-height:1.6; margin-bottom:14px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .card .meta { display:flex; gap:12px; flex-wrap:wrap; font-size:12px; color:var(--muted); }

  .pill { display:inline-block; background:var(--primary-soft); color:var(--primary); padding:5px 12px; border-radius:999px; font-weight:600; font-size:12px; letter-spacing:0.3px; }
  .pill.small { font-size:11px; padding:4px 10px; }

  .empty { color:var(--muted); text-align:center; padding:60px 20px; font-size:15px; }

  .footer { margin-top:50px; border-top:1px solid var(--border); background:rgba(11,14,31,0.6); backdrop-filter:blur(10px); }
  .footer-inner { max-width:1080px; margin:0 auto; padding:42px 22px; display:grid; grid-template-columns:1.5fr 1fr 1fr; gap:30px; }
  .footer .logo { font-size:18px; margin-bottom:12px; }
  .footer p { color:var(--muted); font-size:14px; line-height:1.65; }
  .footer h4 { font-family:'Space Grotesk',sans-serif; font-size:13px; text-transform:uppercase; letter-spacing:1px; color:var(--text); margin-bottom:14px; }
  .footer ul { list-style:none; }
  .footer li { margin-bottom:9px; }
  .footer a { color:var(--muted); text-decoration:none; font-size:14px; transition:color 0.15s; }
  .footer a:hover { color:var(--secondary); }
  .footer-bottom { border-top:1px solid var(--border); text-align:center; padding:18px; color:var(--muted); font-size:13px; }
  @media(max-width:760px){
    .footer-inner{ grid-template-columns:1fr; }
    .featured h2{ font-size:24px; }
    .header-inner{ flex-direction:column; align-items:flex-start; }
    .tagline{ display:none; }
  }
</style>
</head>
<body>
<header class="header">
  <div class="header-inner">
    <div class="logo"><span>🧪</span> PromptLab Studio</div>
    <div class="tagline">Ditulis otomatis oleh AI Agent • artikel segar setiap hari</div>
  </div>
</header>
<nav class="nav">
  ${navHtml}
</nav>
<main class="main">
  ${featured ? `
  <a class="featured" href="/${featured.slug}">
    <span class="pill">${(featured.category||'GENERAL').toUpperCase()}</span>
    <h2>${escapeHtml(featured.title)}</h2>
    <p class="excerpt">${escapeHtml(excerptOf(featured.content, 200))}</p>
    <div class="meta">
      <span>📅 ${fmtDate(featured.published_at)}</span>
      <span>📝 ${featured.word_count} kata</span>
      <span>⏱ ${readMins(featured.word_count)} mnt baca</span>
    </div>
    <span class="read-btn">Baca Selengkapnya →</span>
  </a>` : ''}
  <div class="section-title">${activeCat ? 'Kategori: ' + activeCat.toUpperCase() : 'Artikel Terbaru'}</div>
  <div class="grid">
    ${grid.map(a => `
      <article class="card">
        <a class="card-link" href="/${a.slug}">
          <span class="pill small">${(a.category||'GENERAL').toUpperCase()}</span>
          <h3>${escapeHtml(a.title)}</h3>
          <p class="excerpt">${escapeHtml(excerptOf(a.content, 110))}</p>
          <div class="meta">
            <span>📅 ${fmtDate(a.published_at)}</span>
            <span>⏱ ${readMins(a.word_count)} mnt</span>
          </div>
        </a>
      </article>
    `).join('')}
  </div>
  ${grid.length === 0 && !featured ? '<p class="empty">Belum ada artikel di kategori ini.</p>' : ''}
</main>
  <footer class="footer">
    <div class="footer-inner">
      <div>
        <div class="logo"><span>🧪</span> PromptLab Studio</div>
        <p>Blog yang diisi otomatis oleh AI Agent. Artikel segar setiap hari tentang AI, marketing, freelance, coding, dan crypto — ditulis rapi untuk kamu.</p>
      </div>
      <div>
        <h4>Kategori</h4>
        <ul>
          <li><a href="/?cat=ai">🤖 AI</a></li>
          <li><a href="/?cat=marketing">📈 Marketing</a></li>
          <li><a href="/?cat=freelance">💼 Freelance</a></li>
          <li><a href="/?cat=coding">💻 Coding</a></li>
          <li><a href="/?cat=crypto">₿ Crypto</a></li>
        </ul>
      </div>
      <div>
        <h4>Tautan</h4>
        <ul>
          <li><a href="/">🏠 Beranda</a></li>
          <li><a href="/sitemap.xml">🗺️ Sitemap</a></li>
          <li><a href="https://jemioktavian.my.id">🌐 jemioktavian.my.id</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">© 2026 PromptLab Studio • Ditulis otomatis oleh AI Agent • Dibangun dengan Cloudflare Workers &amp; Supabase</div>
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
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="${escapeHtml(article.meta_description || article.title)}">
<title>${escapeHtml(article.title)} | PromptLab Studio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap');
  :root {
    --bg:#0e1020; --bg-soft:#161a30; --panel:#1b2040; --panel-2:#222845;
    --text:#e8eaf6; --muted:#9aa1c4; --primary:#8b93ff; --primary-soft:rgba(139,147,255,0.14);
    --secondary:#46d6c4; --border:rgba(255,255,255,0.08); --shadow:0 18px 50px rgba(0,0,0,0.40);
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  html { scroll-behavior:smooth; }
  body {
    font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    background:radial-gradient(1100px 600px at 50% -12%, #1b2150 0%, var(--bg) 58%);
    background-attachment:fixed; color:var(--text); line-height:1.85; font-size:17px;
    -webkit-font-smoothing:antialiased; min-height:100vh;
  }
  .header {
    background:rgba(20,24,48,0.72); backdrop-filter:blur(10px);
    border-bottom:1px solid var(--border); padding:18px 20px; text-align:center; position:sticky; top:0; z-index:10;
  }
  .logo {
    font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:700; letter-spacing:0.5px;
    background:linear-gradient(90deg,var(--primary),var(--secondary)); -webkit-background-clip:text;
    -webkit-text-fill-color:transparent; background-clip:text;
  }
  .logo span { -webkit-text-fill-color:initial; }
  .main { max-width:760px; margin:0 auto; padding:34px 22px 60px; }
  .article-header {
    background:linear-gradient(160deg,var(--panel),var(--bg-soft));
    border:1px solid var(--border); border-radius:20px; padding:34px 32px; margin-bottom:30px;
    box-shadow:var(--shadow); position:relative; overflow:hidden;
  }
  .article-header::before {
    content:''; position:absolute; left:0; top:0; bottom:0; width:5px;
    background:linear-gradient(180deg,var(--primary),var(--secondary));
  }
  .article-header h1 {
    font-family:'Space Grotesk',sans-serif; font-size:30px; line-height:1.3; color:#fff; margin-bottom:18px; font-weight:700;
  }
  .article-meta { display:flex; gap:18px; flex-wrap:wrap; font-size:13px; color:var(--muted); }
  .article-meta span { display:inline-flex; align-items:center; gap:6px; }
  .article-meta .pill {
    background:var(--primary-soft); color:var(--primary); padding:4px 12px; border-radius:999px;
    font-weight:600; font-size:12px; letter-spacing:0.3px;
  }
  .article-content {
    background:var(--panel); border:1px solid var(--border); border-radius:20px; padding:36px 34px;
    box-shadow:var(--shadow); font-size:17px; color:var(--text);
  }
  .article-content h2 {
    font-family:'Space Grotesk',sans-serif; font-size:23px; color:#fff; margin:34px 0 14px; font-weight:700;
    padding-bottom:10px; border-bottom:2px solid var(--border);
  }
  .article-content h3 { font-family:'Space Grotesk',sans-serif; font-size:19px; color:var(--primary); margin:26px 0 12px; font-weight:600; }
  .article-content h4 { font-size:16px; color:var(--text); margin:22px 0 10px; font-weight:600; }
  .article-content p { margin-bottom:20px; color:#d6d9ee; }
  .article-content ul, .article-content ol { margin:0 0 22px 22px; }
  .article-content li { margin-bottom:11px; color:#d6d9ee; }
  .article-content li::marker { color:var(--secondary); }
  .article-content a { color:var(--secondary); text-decoration:none; border-bottom:1px solid rgba(70,214,196,0.4); }
  .article-content a:hover { border-bottom-color:var(--secondary); }
  .article-content code {
    background:var(--bg-soft); border:1px solid var(--border); border-radius:6px; padding:2px 7px;
    font-family:'JetBrains Mono',ui-monospace,monospace; font-size:14px; color:var(--secondary);
  }
  .article-content blockquote {
    border-left:4px solid var(--primary); background:var(--primary-soft); border-radius:0 12px 12px 0;
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
    font-size:14px; font-weight:600; background:linear-gradient(90deg,var(--primary),#7b83f0);
    padding:12px 22px; border-radius:999px; box-shadow:0 10px 26px rgba(139,147,255,0.35); transition:transform 0.15s, box-shadow 0.15s;
  }
  .back:hover { transform:translateY(-2px); box-shadow:0 14px 32px rgba(139,147,255,0.5); }
  .footer { text-align:center; padding:30px 20px; color:var(--muted); font-size:13px; border-top:1px solid var(--border); margin-top:40px; }
  @media(max-width:600px){
    .article-header h1{font-size:24px} .article-content{padding:26px 20px} .main{padding:22px 14px 50px}
  }
</style>
</head>
<body>
<header class="header">
  <div class="logo"><span>🧪</span> PromptLab Studio</div>
</header>
<main class="main">
  <article class="article-header">
    <h1>${escapeHtml(article.title)}</h1>
    <div class="article-meta">
      <span>📅 ${new Date(article.published_at).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</span>
      <span>📝 ${article.word_count} kata</span>
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
</main>
<footer class="footer">
  <p>© 2026 PromptLab Studio • Ditulis otomatis oleh AI • Tampilan 32-bit</p>
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
    <form method="POST" action="/rahasia-admin">
      <input type="password" name="password" placeholder="PASSWORD" autofocus>
      <button type="submit">► LOGIN</button>
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
    <div class="nav-item active" onclick="showSection('section-stats')">📊 DASHBOARD</div>
    <div class="nav-item" onclick="showSection('section-provider')">🔌 PROVIDER</div>
    <div class="nav-item" onclick="showSection('section-agent')">🤖 AGENT CONFIG</div>
    <div class="nav-item" onclick="showSection('section-queue')">📋 PIPELINE QUEUE</div>
    <div class="nav-item" onclick="showSection('section-write')">✍️ WRITE MANUAL</div>
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

  function showSection(id){document.querySelectorAll('.section').forEach(function(s){s.classList.remove('active')});document.getElementById(id).classList.add('active');document.querySelectorAll('.nav-item').forEach(function(n,i){n.classList.toggle('active',(i===0&&id==='section-stats')||(i===1&&id==='section-provider')||(i===2&&id==='section-agent')||(i===3&&id==='section-queue')||(i===4&&id==='section-write'))});}

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
