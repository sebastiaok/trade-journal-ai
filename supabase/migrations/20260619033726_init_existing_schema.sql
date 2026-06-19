-- TradeJournalAI — Supabase 스키마 (Postgres)
-- 실행: Supabase 대시보드 SQL Editor 또는 `supabase db push`
--
-- 설계 원칙
--  - 모든 행은 owner(auth.uid())에 귀속. RLS로 본인 데이터만 접근.
--  - 앱의 TypeScript 타입(Account/Trade/InvestCheck)을 거의 1:1로 옮김.
--  - 금액은 정수 원 단위(bigint). 소수 단가가 필요하면 numeric로 교체.
--  - note/items 같은 가변 구조는 jsonb로 저장.

-- ─────────────────────────────────────────────
-- ENUM 타입
-- ─────────────────────────────────────────────
create type account_type as enum ('general', 'isa', 'pension', 'irp', 'irp_dc');
create type trade_side   as enum ('buy', 'sell', 'deposit', 'withdrawal');
create type trade_source as enum ('vision', 'manual');

-- ─────────────────────────────────────────────
-- accounts (계좌)
-- ─────────────────────────────────────────────
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  type        account_type not null,
  broker      text,
  opened_at   date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- trades (거래/이벤트)
-- ─────────────────────────────────────────────
create table public.trades (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users (id) on delete cascade,
  account_id    uuid not null references public.accounts (id) on delete cascade,
  symbol        text not null,
  code          text,
  side          trade_side not null,
  price         bigint not null default 0,   -- 체결단가 (원)
  quantity      bigint not null default 0,
  amount        bigint not null default 0,   -- 체결/납입/인출 금액 (원)
  fee           bigint not null default 0,
  tax           bigint not null default 0,
  executed_at   timestamptz not null,
  broker        text,
  realized_pnl  bigint,                       -- 매도 매칭 시 계산값 (옵션 저장)
  return_rate   numeric(10, 4),
  note          jsonb,                         -- ReviewNote (reason/tags/emotion/...)
  source        trade_source not null default 'manual',
  confidence    numeric(4, 3),
  linked_check_id uuid,                        -- invest_checks.id (느슨한 참조)
  tax_deductible  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index trades_owner_executed_idx on public.trades (owner, executed_at desc);
create index trades_account_idx        on public.trades (account_id);
create index trades_symbol_idx         on public.trades (owner, symbol);

-- ─────────────────────────────────────────────
-- invest_checks (투자 검토)
-- ─────────────────────────────────────────────
create table public.invest_checks (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users (id) on delete cascade,
  account_id    uuid not null references public.accounts (id) on delete cascade,
  symbol        text not null,
  code          text,
  items         jsonb not null default '[]'::jsonb,  -- 체크리스트 항목 배열
  target_price  bigint,
  stop_loss     bigint,
  weight        numeric(6, 2),
  scenario      text,
  decision      text,                                 -- 'watch' | 'buy' | 'pass'
  resulted_trade_id uuid,                              -- trades.id (느슨한 참조)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index checks_owner_idx on public.invest_checks (owner, created_at desc);

-- ─────────────────────────────────────────────
-- tax_config (한도·세제 설정, 사용자 1행)
--  편집 가능한 기본값 — 세무 자문 아님
-- ─────────────────────────────────────────────
create table public.tax_config (
  owner                     uuid primary key references auth.users (id) on delete cascade,
  tax_year                  int    not null default 2026,
  pension_deduction_cap     bigint not null default 9000000,
  pension_savings_sub_cap   bigint not null default 6000000,
  pension_annual_contrib_cap bigint not null default 18000000,
  deduct_rate_low           numeric(5,4) not null default 0.1650,
  deduct_rate_high          numeric(5,4) not null default 0.1320,
  salary_threshold          bigint not null default 55000000,
  isa_annual_contrib_cap    bigint not null default 20000000,
  isa_total_contrib_cap     bigint not null default 100000000,
  isa_tax_free_limit        bigint not null default 2000000,
  isa_mandatory_years       int    not null default 3,
  early_withdrawal_tax_rate numeric(5,4) not null default 0.1650,
  annual_salary             bigint,                    -- 세율 분기용 (선택)
  updated_at                timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- updated_at 자동 갱신 트리거
-- ─────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger accounts_touch  before update on public.accounts
  for each row execute function public.touch_updated_at();
create trigger trades_touch    before update on public.trades
  for each row execute function public.touch_updated_at();
create trigger checks_touch    before update on public.invest_checks
  for each row execute function public.touch_updated_at();
create trigger taxcfg_touch    before update on public.tax_config
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────
-- RLS (Row Level Security) — 본인 데이터만
-- ─────────────────────────────────────────────
alter table public.accounts      enable row level security;
alter table public.trades        enable row level security;
alter table public.invest_checks enable row level security;
alter table public.tax_config    enable row level security;

-- accounts
create policy "accounts_select_own" on public.accounts
  for select using (auth.uid() = owner);
create policy "accounts_insert_own" on public.accounts
  for insert with check (auth.uid() = owner);
create policy "accounts_update_own" on public.accounts
  for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "accounts_delete_own" on public.accounts
  for delete using (auth.uid() = owner);

-- trades
create policy "trades_select_own" on public.trades
  for select using (auth.uid() = owner);
create policy "trades_insert_own" on public.trades
  for insert with check (auth.uid() = owner);
create policy "trades_update_own" on public.trades
  for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "trades_delete_own" on public.trades
  for delete using (auth.uid() = owner);

-- invest_checks
create policy "checks_select_own" on public.invest_checks
  for select using (auth.uid() = owner);
create policy "checks_insert_own" on public.invest_checks
  for insert with check (auth.uid() = owner);
create policy "checks_update_own" on public.invest_checks
  for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "checks_delete_own" on public.invest_checks
  for delete using (auth.uid() = owner);

-- tax_config
create policy "taxcfg_all_own" on public.tax_config
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

-- ─────────────────────────────────────────────
-- 신규 가입 시 기본 tax_config 1행 자동 생성
-- ─────────────────────────────────────────────
create or replace function public.init_tax_config()
returns trigger language plpgsql security definer as $$
begin
  insert into public.tax_config (owner) values (new.id)
  on conflict (owner) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.init_tax_config();
