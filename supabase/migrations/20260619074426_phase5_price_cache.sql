-- Phase 5: 대시보드 — price_cache (시세 캐시)
-- 종목별 최신 시세를 캐싱. 대시보드·포트폴리오 평가금액 산출.
-- 장중 주기적으로 upsert, 대시보드는 캐시값 사용.

CREATE TABLE IF NOT EXISTS public.price_cache (
  ticker_code text PRIMARY KEY REFERENCES public.tickers(code) ON DELETE CASCADE,
  price       numeric(18,4) NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

-- price_cache는 공용 참조 데이터 — 소유자 구분 없음
-- 읽기: 인증된 사용자 전체 허용
-- 쓰기: 서비스 키 또는 서버 액션으로만 (클라이언트 직접 쓰기 차단)
ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_cache_select_authenticated" ON public.price_cache
  FOR SELECT TO authenticated USING (true);
