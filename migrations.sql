-- ============================================================
-- RETRO AI BLOG - Agent Config & Topic Pools Migration
-- Jalankan di Supabase SQL Editor (setelah schema.sql)
-- ============================================================

-- Agent config per category (model + role prompt)
CREATE TABLE IF NOT EXISTS agent_config (
    category TEXT PRIMARY KEY,
    model TEXT,
    role_prompt TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_agent_config" ON agent_config;
CREATE POLICY "public_read_agent_config" ON agent_config
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_agent_config" ON agent_config;
CREATE POLICY "admin_agent_config" ON agent_config
    FOR ALL USING (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS update_agent_config_updated_at ON agent_config;
CREATE TRIGGER update_agent_config_updated_at
    BEFORE UPDATE ON agent_config
    EXECUTE FUNCTION update_updated_at_column();

-- Add write_by_ai flag to articles
ALTER TABLE articles ADD COLUMN IF NOT EXISTS write_by_ai BOOLEAN DEFAULT TRUE;

-- Topic pools per category (used for daily random generation)
INSERT INTO settings (key, value) VALUES ('topic_pools', '{
  "ai": [
    "Masa Depan AI Generatif di Indonesia",
    "Cara Kerja Large Language Model untuk Pemula",
    "Etika AI: Antara Manfaat dan Risiko",
    "AI vs Manusia: Kolaborasi bukan Pengganti"
  ],
  "marketing": [
    "Strategi Content Marketing ala 90an yang Masih Relevan",
    "Membangun Brand Personality yang Menggugah",
    "Psychology of Nostalgia dalam Iklan Modern",
    "Funnel Marketing Sederhana untuk Pemula"
  ],
  "freelance": [
    "Tips Negosiasi Rate untuk Freelancer Pemula",
    "Membangun Portfolio yang Menonjol",
    "Manajemen Waktu ala Gamer: Level Up Produktivitas",
    "Cara Dapat Klien Pertama Tanpa Pengalaman"
  ],
  "coding": [
    "Belajar Coding dari Nol: Roadmap 2026",
    "Debugging itu Seni, Bukan Siksaan",
    "Clean Code: Tulis Kode yang Mudah Dicintai",
    "Otomasi Rutinitas dengan Script Sederhana"
  ],
  "crypto": [
    "Blockchain dalam Bahasa Sehari-hari",
    "Manajemen Risiko Crypto untuk Pemula",
    "NFT dan Masa Depan Kepemilikan Digital",
    "DeFi: Bank Tanpa Bank untuk Semua"
  ]
}') ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- RLS: allow the Worker (uses SUPABASE_ANON_KEY) to write.
-- The Worker is the only writer (server-side, secret key), so this is safe
-- for a personal automated blog. For stronger security, use a SERVICE_ROLE
-- key instead and keep these tables locked to authenticated role.
-- ============================================================

DROP POLICY IF EXISTS "anon_insert_articles" ON articles;
CREATE POLICY "anon_insert_articles" ON articles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_articles" ON articles;
CREATE POLICY "anon_update_articles" ON articles FOR UPDATE USING (true);

DROP POLICY IF EXISTS "authenticated_update_queue" ON article_queue;
DROP POLICY IF EXISTS "anon_update_queue" ON article_queue;
CREATE POLICY "anon_update_queue" ON article_queue FOR UPDATE USING (true);

DROP POLICY IF EXISTS "admin_agent_config" ON agent_config;
DROP POLICY IF EXISTS "anon_agent_config" ON agent_config;
CREATE POLICY "anon_agent_config" ON agent_config FOR ALL USING (true);

DROP POLICY IF EXISTS "admin_settings" ON settings;
DROP POLICY IF EXISTS "anon_settings" ON settings;
CREATE POLICY "anon_settings" ON settings FOR ALL USING (true);
