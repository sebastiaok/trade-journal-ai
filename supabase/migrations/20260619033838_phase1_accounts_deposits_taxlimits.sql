-- Phase 1: 계좌 관리 확장 + 입출금 기록 + 세제 한도 테이블
-- 다계좌 투자관리 앱 확장의 기반 마이그레이션

-- ─────────────────────────────────────────────
-- 1. accounts 테이블에 cash_balance(예수금) 컬럼 추가
-- ─────────────────────────────────────────────
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS cash_balance bigint NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────
-- 2. account_deposits (입출금 기록)
--    계좌별 입금/출금 이벤트를 기록하고 cash_balance와 연동
-- ─────────────────────────────────────────────
CREATE TABLE public.account_deposits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  amount      bigint NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('deposit', 'withdraw')),
  memo        text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX deposits_owner_idx ON public.account_deposits (owner, occurred_at DESC);
CREATE INDEX deposits_account_idx ON public.account_deposits (account_id);

-- RLS
ALTER TABLE public.account_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deposits_select_own" ON public.account_deposits
  FOR SELECT USING (auth.uid() = owner);
CREATE POLICY "deposits_insert_own" ON public.account_deposits
  FOR INSERT WITH CHECK (auth.uid() = owner);
CREATE POLICY "deposits_update_own" ON public.account_deposits
  FOR UPDATE USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "deposits_delete_own" ON public.account_deposits
  FOR DELETE USING (auth.uid() = owner);

-- ─────────────────────────────────────────────
-- 3. tax_limits (연도별 법정 한도 참조 테이블)
--    tax_config(개인 설정)과 공존 — tax_limits는 법정 기준값
--    ⚠️ 참고용 자동 집계이며 세무 자문이 아님
-- ─────────────────────────────────────────────
CREATE TABLE public.tax_limits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type    text NOT NULL CHECK (account_type IN ('isa', 'pension', 'irp')),
  year            int NOT NULL,
  annual_limit    bigint,         -- 연간 납입 한도
  cumulative_limit bigint,        -- 누적 납입 한도 (ISA 등)
  deduction_limit bigint,         -- 세액공제 한도
  note            text,
  UNIQUE(account_type, year)
);

-- tax_limits는 공개 참조 데이터 — RLS는 SELECT만 허용 (owner 컬럼 없음)
ALTER TABLE public.tax_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_limits_select_all" ON public.tax_limits
  FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE는 service_role 또는 대시보드에서만

-- 2026년 기본 한도값 시드 (참고용)
INSERT INTO public.tax_limits (account_type, year, annual_limit, cumulative_limit, deduction_limit, note) VALUES
  ('isa',     2026, 20000000,  100000000, NULL,    '현행 ISA 기준. 슈퍼ISA 시행 시 40000000/200000000'),
  ('pension', 2026, 18000000,  NULL,      6000000, '연금저축 단독 세액공제 한도 600만. 합산(연금저축+IRP) 900만'),
  ('irp',     2026, 18000000,  NULL,      9000000, 'IRP 자기부담 포함 합산 세액공제 한도 900만')
ON CONFLICT (account_type, year) DO NOTHING;
