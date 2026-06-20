-- Phase 7: 증권사 API 연동 (조회 전용)
-- broker_credentials: 증권사 앱키/시크릿 암호화 저장
-- broker_token_cache: 접근 토큰 암호화 캐시

-- ───────── broker_credentials ─────────
CREATE TABLE IF NOT EXISTS broker_credentials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  broker      TEXT NOT NULL CHECK (broker IN ('kis', 'kiwoom')),
  app_key_enc TEXT NOT NULL,
  app_secret_enc TEXT NOT NULL,
  account_no_enc TEXT,
  extra       JSONB DEFAULT '{}',
  account_type TEXT NOT NULL DEFAULT 'VIRTUAL' CHECK (account_type IN ('VIRTUAL', 'REAL')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE broker_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_credentials_select" ON broker_credentials
  FOR SELECT USING (auth.uid() = owner);
CREATE POLICY "broker_credentials_insert" ON broker_credentials
  FOR INSERT WITH CHECK (auth.uid() = owner);
CREATE POLICY "broker_credentials_update" ON broker_credentials
  FOR UPDATE USING (auth.uid() = owner);
CREATE POLICY "broker_credentials_delete" ON broker_credentials
  FOR DELETE USING (auth.uid() = owner);

CREATE INDEX idx_broker_credentials_owner ON broker_credentials(owner);
CREATE INDEX idx_broker_credentials_account ON broker_credentials(account_id);

-- ───────── broker_token_cache ─────────
CREATE TABLE IF NOT EXISTS broker_token_cache (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cred_id          UUID NOT NULL REFERENCES broker_credentials(id) ON DELETE CASCADE,
  access_token_enc TEXT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE broker_token_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_token_cache_select" ON broker_token_cache
  FOR SELECT USING (auth.uid() = owner);
CREATE POLICY "broker_token_cache_insert" ON broker_token_cache
  FOR INSERT WITH CHECK (auth.uid() = owner);
CREATE POLICY "broker_token_cache_update" ON broker_token_cache
  FOR UPDATE USING (auth.uid() = owner);
CREATE POLICY "broker_token_cache_delete" ON broker_token_cache
  FOR DELETE USING (auth.uid() = owner);

CREATE UNIQUE INDEX idx_broker_token_cache_cred ON broker_token_cache(cred_id);
