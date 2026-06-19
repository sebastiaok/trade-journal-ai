-- Phase 4: 포트폴리오 점검 — portfolio_snapshots + target_allocation
-- holdings 기반 배분 진단 + 리스크 지표 + 리밸런싱 제안.

-- ─────────────────────────────────────────────
-- 1. portfolio_snapshots (일별 자산 스냅샷)
--    매일 보유현황 × 가격을 적재해 MDD·추이 산출.
--    details에 종목별 내역(jsonb)을 저장해 과거 분석 가능.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  total_value   numeric(18,2) NOT NULL,
  total_cost    numeric(18,2) NOT NULL,
  cash          numeric(18,2) NOT NULL DEFAULT 0,
  details       jsonb DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_owner_date
  ON public.portfolio_snapshots(owner, snapshot_date DESC);

ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_select_own" ON public.portfolio_snapshots
  FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "snapshots_insert_own" ON public.portfolio_snapshots
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "snapshots_update_own" ON public.portfolio_snapshots
  FOR UPDATE TO authenticated USING (auth.uid() = owner);
CREATE POLICY "snapshots_delete_own" ON public.portfolio_snapshots
  FOR DELETE TO authenticated USING (auth.uid() = owner);

-- ─────────────────────────────────────────────
-- 2. target_allocation (목표 배분)
--    사용자별 섹터 목표 비중. 리밸런싱 제안의 기준.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.target_allocation (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sector      text NOT NULL,
  target_pct  numeric(5,2) NOT NULL,
  UNIQUE (owner, sector)
);

ALTER TABLE public.target_allocation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allocation_select_own" ON public.target_allocation
  FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "allocation_insert_own" ON public.target_allocation
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "allocation_update_own" ON public.target_allocation
  FOR UPDATE TO authenticated USING (auth.uid() = owner);
CREATE POLICY "allocation_delete_own" ON public.target_allocation
  FOR DELETE TO authenticated USING (auth.uid() = owner);
