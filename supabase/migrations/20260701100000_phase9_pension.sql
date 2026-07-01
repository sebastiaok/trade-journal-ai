-- Phase 9: 퇴직연금(DC/IRP) 포트폴리오 관리
-- pension_asset_classes: 표준 자산군 마스터 (위험/안전 분류, 설정 가능)
-- pension_holdings: 연금 상품별 현재 보유
-- pension_rebalance_plans: 리밸런싱 시뮬레이션 결과 (계획 저장, 실행 아님)
-- pension_risk_limits: 위험자산 비중 한도 설정 (연도·계좌유형별)

-- ───────── account_type enum 확장 ─────────
ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'dc';

-- ───────── pension_asset_classes (자산군 마스터) ─────────
CREATE TABLE IF NOT EXISTS pension_asset_classes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = 기본 제공
  name        TEXT NOT NULL,
  risk_type   TEXT NOT NULL CHECK (risk_type IN ('risky', 'safe')),
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pension_asset_classes ENABLE ROW LEVEL SECURITY;

-- 기본 제공(user_id IS NULL)은 모든 인증 사용자가 읽기 가능
CREATE POLICY "pac_select_default" ON pension_asset_classes
  FOR SELECT USING (user_id IS NULL AND auth.uid() IS NOT NULL);
-- 사용자 커스텀 자산군은 본인만
CREATE POLICY "pac_select_own" ON pension_asset_classes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pac_insert_own" ON pension_asset_classes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pac_update_own" ON pension_asset_classes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pac_delete_own" ON pension_asset_classes
  FOR DELETE USING (auth.uid() = user_id);

-- ───────── 표준 자산군 시드 데이터 ─────────
INSERT INTO pension_asset_classes (user_id, name, risk_type, sort_order) VALUES
  (NULL, '국내주식형', 'risky', 1),
  (NULL, '해외주식형', 'risky', 2),
  (NULL, '혼합형',     'risky', 3),
  (NULL, '채권형',     'safe',  4),
  (NULL, 'TDF',        'risky', 5),
  (NULL, '원리금보장', 'safe',  6),
  (NULL, '현금성',     'safe',  7);

-- ───────── pension_holdings (현재 보유) ─────────
CREATE TABLE IF NOT EXISTS pension_holdings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_name   TEXT NOT NULL,
  asset_class_id UUID REFERENCES pension_asset_classes(id),
  eval_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pension_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ph_select_own" ON pension_holdings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ph_insert_own" ON pension_holdings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ph_update_own" ON pension_holdings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ph_delete_own" ON pension_holdings
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_pension_holdings_account ON pension_holdings(account_id);
CREATE INDEX idx_pension_holdings_user ON pension_holdings(user_id);

-- ───────── pension_rebalance_plans (리밸런싱 계획) ─────────
CREATE TABLE IF NOT EXISTS pension_rebalance_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  total_amount   NUMERIC(18,2) NOT NULL,
  extra_contrib  NUMERIC(18,2) NOT NULL DEFAULT 0,
  target_alloc   JSONB NOT NULL,  -- [{asset_class_id, name, target_pct, target_amount, current_amount, adjust}]
  risky_ratio    NUMERIC(5,2),
  limit_pct      NUMERIC(5,2),
  limit_ok       BOOLEAN,
  memo           TEXT,
  planned_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pension_rebalance_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prp_select_own" ON pension_rebalance_plans
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "prp_insert_own" ON pension_rebalance_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "prp_update_own" ON pension_rebalance_plans
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "prp_delete_own" ON pension_rebalance_plans
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_pension_plans_account ON pension_rebalance_plans(account_id);
CREATE INDEX idx_pension_plans_user ON pension_rebalance_plans(user_id, planned_at DESC);

-- ───────── pension_risk_limits (위험자산 한도 설정) ─────────
CREATE TABLE IF NOT EXISTS pension_risk_limits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type    TEXT NOT NULL,  -- dc / irp
  year            INTEGER NOT NULL,
  risky_limit_pct NUMERIC(5,2) NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_type, year)
);

ALTER TABLE pension_risk_limits ENABLE ROW LEVEL SECURITY;

-- 위험자산 한도는 공용 참조 데이터 — 인증 사용자 누구나 읽기 가능
CREATE POLICY "prl_select_all" ON pension_risk_limits
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- 쓰기는 서비스 역할(관리자)만 — 사용자 직접 수정 불가
-- (필요 시 admin 정책 추가)

-- updated_at 트리거
CREATE TRIGGER pension_holdings_touch BEFORE UPDATE ON pension_holdings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
