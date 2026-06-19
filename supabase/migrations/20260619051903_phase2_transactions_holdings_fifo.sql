-- Phase 2: 매매내역 모듈 — tickers, holdings, realized_pnl + calc_fifo_on_sell
-- 기존 trades 테이블은 유지. holdings와 realized_pnl로 서버사이드 FIFO를 추가.

-- ─────────────────────────────────────────────
-- 1. tickers (종목 마스터, 공유 읽기전용)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tickers (
  code       text PRIMARY KEY,
  name       text NOT NULL,
  market     text,            -- KOSPI, KOSDAQ, US 등
  sector     text,            -- 섹터 (Phase 2 추가)
  currency   text NOT NULL DEFAULT 'KRW',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickers_select_authenticated" ON public.tickers
  FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────
-- 2. holdings (계좌별 보유현황 캐시)
--    거래 저장 시 upsert — 실시간 보유 수량·평균단가 추적
-- ─────────────────────────────────────────────
CREATE TABLE public.holdings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  symbol     text NOT NULL,
  code       text,
  quantity   bigint NOT NULL DEFAULT 0,
  avg_cost   numeric(14, 2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, symbol)
);

CREATE INDEX holdings_owner_idx ON public.holdings (owner);
CREATE INDEX holdings_account_idx ON public.holdings (account_id);

ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holdings_select_own" ON public.holdings
  FOR SELECT USING (auth.uid() = owner);
CREATE POLICY "holdings_insert_own" ON public.holdings
  FOR INSERT WITH CHECK (auth.uid() = owner);
CREATE POLICY "holdings_update_own" ON public.holdings
  FOR UPDATE USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "holdings_delete_own" ON public.holdings
  FOR DELETE USING (auth.uid() = owner);

CREATE TRIGGER holdings_touch BEFORE UPDATE ON public.holdings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────
-- 3. realized_pnl (매도 FIFO 매칭 결과)
--    매도 거래 1건당 1~N행 생성 (FIFO 매칭 로트별)
-- ─────────────────────────────────────────────
CREATE TABLE public.realized_pnl (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  symbol      text NOT NULL,
  sell_trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  buy_trade_id  uuid REFERENCES public.trades(id) ON DELETE SET NULL,
  matched_qty bigint NOT NULL,
  buy_price   numeric(14, 2) NOT NULL,
  sell_price  numeric(14, 2) NOT NULL,
  pnl_amount  bigint NOT NULL,     -- (sell_price - buy_price) * matched_qty - 비례배분 수수료/세금
  fee_amount  bigint NOT NULL DEFAULT 0,
  tax_amount  bigint NOT NULL DEFAULT 0,
  realized_at timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rpnl_owner_idx ON public.realized_pnl (owner, realized_at DESC);
CREATE INDEX rpnl_account_idx ON public.realized_pnl (account_id);
CREATE INDEX rpnl_sell_trade_idx ON public.realized_pnl (sell_trade_id);

ALTER TABLE public.realized_pnl ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rpnl_select_own" ON public.realized_pnl
  FOR SELECT USING (auth.uid() = owner);
CREATE POLICY "rpnl_insert_own" ON public.realized_pnl
  FOR INSERT WITH CHECK (auth.uid() = owner);
CREATE POLICY "rpnl_delete_own" ON public.realized_pnl
  FOR DELETE USING (auth.uid() = owner);

-- ─────────────────────────────────────────────
-- 4. calc_fifo_on_sell — 매도 거래에 대한 FIFO 매칭 함수
--    매도 거래 ID를 받아 같은 (account_id, symbol)의 매수 거래를
--    FIFO 순서로 매칭하여 realized_pnl 행을 생성한다.
--
--    매칭 키: account_id + symbol (계좌별 FIFO 큐 분리)
--    정렬 기준: executed_at ASC, created_at ASC (FIFO)
--    매수 잔량: 해당 매수의 총 수량 - 이미 realized_pnl에서 사용된 수량
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calc_fifo_on_sell(p_sell_trade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sell      RECORD;
  v_buy       RECORD;
  v_remaining bigint;
  v_take      bigint;
  v_buy_remaining bigint;
  v_fee_per_share numeric;
  v_tax_per_share numeric;
  v_pnl       bigint;
  v_fee_alloc bigint;
  v_tax_alloc bigint;
BEGIN
  -- 매도 거래 정보 조회
  SELECT id, owner, account_id, symbol, side, price, quantity, fee, tax, executed_at
    INTO v_sell
    FROM public.trades
   WHERE id = p_sell_trade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '매도 거래를 찾을 수 없습니다: %', p_sell_trade_id;
  END IF;

  IF v_sell.side != 'sell' THEN
    RAISE EXCEPTION '매도 거래만 FIFO 매칭 가능합니다 (현재: %)', v_sell.side;
  END IF;

  -- 매도 수수료/세금 비례 배분용
  v_fee_per_share := CASE WHEN v_sell.quantity > 0 THEN v_sell.fee::numeric / v_sell.quantity ELSE 0 END;
  v_tax_per_share := CASE WHEN v_sell.quantity > 0 THEN v_sell.tax::numeric / v_sell.quantity ELSE 0 END;

  v_remaining := v_sell.quantity;

  -- 같은 계좌·종목의 매수 거래를 FIFO 순서로 순회
  FOR v_buy IN
    SELECT t.id, t.price, t.quantity, t.fee, t.executed_at,
           COALESCE(SUM(rp.matched_qty), 0) AS already_matched
      FROM public.trades t
      LEFT JOIN public.realized_pnl rp ON rp.buy_trade_id = t.id
     WHERE t.account_id = v_sell.account_id
       AND t.symbol = v_sell.symbol
       AND t.side = 'buy'
       AND t.executed_at <= v_sell.executed_at
     GROUP BY t.id, t.price, t.quantity, t.fee, t.executed_at
    HAVING t.quantity - COALESCE(SUM(rp.matched_qty), 0) > 0
     ORDER BY t.executed_at ASC, t.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_buy_remaining := v_buy.quantity - v_buy.already_matched;
    v_take := LEAST(v_remaining, v_buy_remaining);

    -- 비례 배분: 매도 수수료/세금
    v_fee_alloc := ROUND(v_fee_per_share * v_take);
    v_tax_alloc := ROUND(v_tax_per_share * v_take);

    -- PnL = (매도가 - 매수가) * 수량 - 비례 수수료 - 비례 세금
    v_pnl := (v_sell.price - v_buy.price) * v_take - v_fee_alloc - v_tax_alloc;

    INSERT INTO public.realized_pnl
      (owner, account_id, symbol, sell_trade_id, buy_trade_id,
       matched_qty, buy_price, sell_price, pnl_amount, fee_amount, tax_amount, realized_at)
    VALUES
      (v_sell.owner, v_sell.account_id, v_sell.symbol, v_sell.id, v_buy.id,
       v_take, v_buy.price, v_sell.price, v_pnl, v_fee_alloc, v_tax_alloc, v_sell.executed_at);

    v_remaining := v_remaining - v_take;
  END LOOP;

  -- 매칭 후 잔여 수량 경고 (매도>보유 — 이미 앱에서 막지만 방어)
  IF v_remaining > 0 THEN
    RAISE WARNING 'FIFO 매칭 부족: 매도 %주 중 %주 미매칭 (trade_id=%)',
      v_sell.quantity, v_remaining, p_sell_trade_id;
  END IF;
END;
$$;
