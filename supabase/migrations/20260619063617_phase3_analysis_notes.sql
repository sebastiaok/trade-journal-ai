-- Phase 3: 종목 분석 — analysis_notes + trades.analysis_id
-- 매매 전 분석(목표가·손절가·근거·체크리스트)을 실현손익과 대조해 회고.

-- ─────────────────────────────────────────────
-- 1. analysis_notes (분석 노트)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analysis_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  symbol       text NOT NULL,
  code         text,
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'active', 'closed')),
  thesis       text,                       -- 투자 논리
  target_price numeric(18,4),              -- 목표가
  stop_price   numeric(18,4),              -- 손절가
  target_pct   numeric(5,2),               -- 목표 비중 (%)
  checklist    jsonb DEFAULT '[]'::jsonb,   -- [{id, label, checked}]
  retro_memo   text,                       -- 회고 메모
  retro_label  text,                       -- 자동 판정 라벨
  analyzed_at  date NOT NULL DEFAULT current_date,
  closed_at    timestamptz,                -- 종료 시점
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_owner_status
  ON public.analysis_notes(owner, status);
CREATE INDEX IF NOT EXISTS idx_analysis_symbol
  ON public.analysis_notes(symbol);

ALTER TABLE public.analysis_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analysis_select_own" ON public.analysis_notes
  FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "analysis_insert_own" ON public.analysis_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "analysis_update_own" ON public.analysis_notes
  FOR UPDATE TO authenticated USING (auth.uid() = owner);
CREATE POLICY "analysis_delete_own" ON public.analysis_notes
  FOR DELETE TO authenticated USING (auth.uid() = owner);

-- ─────────────────────────────────────────────
-- 2. trades에 analysis_id FK 추가
-- ─────────────────────────────────────────────
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS analysis_id uuid
  REFERENCES public.analysis_notes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trades_analysis
  ON public.trades(analysis_id)
  WHERE analysis_id IS NOT NULL;
