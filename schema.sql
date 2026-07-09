-- ============================================================
-- RETRO AI BLOG - Supabase Database Schema
-- 16-Bit Nostalgia Edition
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: articles (Published Articles)
-- ============================================================
CREATE TABLE articles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT,
    meta_description TEXT,
    keywords TEXT[],
    category TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    featured_image TEXT,
    word_count INTEGER,
    ai_model TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,
    views INTEGER DEFAULT 0
);

-- ============================================================
-- TABLE: article_queue (Pipeline Queue)
-- ============================================================
CREATE TABLE article_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    topic TEXT NOT NULL,
    keywords TEXT[],
    category TEXT,
    current_step INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending',
        'processing',
        'outline_done',
        'draft_done',
        'polish_done',
        'published',
        'failed',
        'needs_review'
    )),
    step1_data JSONB,
    step2_data JSONB,
    step3_data JSONB,
    step1_validated BOOLEAN DEFAULT FALSE,
    step2_validated BOOLEAN DEFAULT FALSE,
    step3_validated BOOLEAN DEFAULT FALSE,
    step1_retries INTEGER DEFAULT 0,
    step2_retries INTEGER DEFAULT 0,
    step3_retries INTEGER DEFAULT 0,
    last_error TEXT,
    error_step INTEGER,
    model_used TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    article_id UUID REFERENCES articles(id)
);

-- ============================================================
-- TABLE: settings (Configuration)
-- ============================================================
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_slug ON articles(slug);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_article_queue_status ON article_queue(status);
CREATE INDEX idx_article_queue_step ON article_queue(current_step);
CREATE INDEX idx_article_queue_created ON article_queue(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Public can read published articles
CREATE POLICY "public_read_articles" ON articles
    FOR SELECT USING (status = 'published');

-- Public can insert to queue (for cron)
CREATE POLICY "public_insert_queue" ON article_queue
    FOR INSERT WITH CHECK (true);

-- Public can read queue status (for monitoring)
CREATE POLICY "public_read_queue" ON article_queue
    FOR SELECT USING (true);

-- Only authenticated can update queue
CREATE POLICY "authenticated_update_queue" ON article_queue
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Settings: admin only
CREATE POLICY "admin_settings" ON settings
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply auto-update to all tables
CREATE TRIGGER update_articles_updated_at
    BEFORE UPDATE ON articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_article_queue_updated_at
    BEFORE UPDATE ON article_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VIEWS (For Monitoring)
-- ============================================================

-- Pipeline success rate (last 7 days)
CREATE VIEW pipeline_stats_7d AS
SELECT
    status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM article_queue
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status;

-- Average generation time per step
CREATE VIEW pipeline_timing AS
SELECT
    AVG(CASE WHEN step1_validated THEN EXTRACT(EPOCH FROM (updated_at - created_at)) END) as step1_avg_seconds,
    AVG(CASE WHEN step2_validated THEN EXTRACT(EPOCH FROM (updated_at - created_at)) END) as step2_avg_seconds,
    AVG(CASE WHEN step3_validated THEN EXTRACT(EPOCH FROM (updated_at - created_at)) END) as step3_avg_seconds
FROM article_queue
WHERE status = 'published';

-- Articles by category
CREATE VIEW articles_by_category AS
SELECT
    category,
    COUNT(*) as count,
    AVG(word_count) as avg_words,
    MAX(published_at) as last_published
FROM articles
WHERE status = 'published'
GROUP BY category;

-- ============================================================
-- SEED DATA (Optional)
-- ============================================================

-- Insert default settings
INSERT INTO settings (key, value) VALUES
('site_name', '"Retro AI Blog"'),
('site_description', '"Artikel AI di-generate otomatis dengan style retro 16-bit"'),
('default_category', '"ai"'),
('articles_per_day', '2'),
('pipeline_enabled', 'true'),
('fallback_models', '["meta-llama/llama-4-maverick:free", "mistralai/mistral-small-3.1-24b-instruct:free"]')
ON CONFLICT (key) DO NOTHING;
