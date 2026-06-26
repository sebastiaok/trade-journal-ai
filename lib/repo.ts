// lib/repo.ts
// 데이터 접근 계층 — Supabase 테이블 ↔ 앱 타입 매핑 + CRUD.
// 컴포넌트는 이 함수들만 호출하고 Supabase 세부사항을 모른다.
// (localStorage 훅 useTrades/useChecks를 대체)

import { isImplementationMode } from './devMode';
import { isSupabaseConfigured, supabase } from './supabase';
import type { Account, Trade, InvestCheck, ReviewNote, AccountType, Side, Source, AccountDeposit, TaxLimit, Holding, RealizedPnlRow, AnalysisNote, AnalysisStatus, PortfolioSnapshot, SnapshotDetail, TargetAllocation, Ticker, PriceCache, BrokerCredential, BrokerTokenCache } from '../data/types';

const LOCAL_KEYS = {
  accounts: 'tja-dev-accounts',
  trades: 'tja-dev-trades',
  checks: 'tja-dev-checks',
  deposits: 'tja-dev-deposits',
  taxLimits: 'tja-dev-tax-limits',
  holdings: 'tja-dev-holdings',
  realizedPnl: 'tja-dev-realized-pnl',
  analysisNotes: 'tja-dev-analysis-notes',
  snapshots: 'tja-dev-snapshots',
  targetAllocation: 'tja-dev-target-alloc',
  tickers: 'tja-dev-tickers',
  priceCache: 'tja-dev-price-cache',
} as const;

function useLocalRepo(): boolean {
  return isImplementationMode || !isSupabaseConfigured;
}

function localId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readLocal<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeLocal<T>(key: string, rows: T[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(rows));
}

/* ───────── DB 행 형태 (snake_case) ───────── */

interface AccountRow {
  id: string; owner: string; name: string; type: AccountType;
  broker: string | null; opened_at: string | null; note: string | null;
  cash_balance: number;
}
interface DepositRow {
  id: string; owner: string; account_id: string; amount: number;
  kind: 'deposit' | 'withdraw'; memo: string | null;
  occurred_at: string; created_at: string;
}
interface TaxLimitRow {
  id: string; account_type: 'isa' | 'pension' | 'irp'; year: number;
  annual_limit: number | null; cumulative_limit: number | null;
  deduction_limit: number | null; note: string | null;
}
interface HoldingRow {
  id: string; owner: string; account_id: string; symbol: string; code: string | null;
  quantity: number; avg_cost: number; updated_at: string;
}
interface RealizedPnlDbRow {
  id: string; owner: string; account_id: string; symbol: string;
  sell_trade_id: string; buy_trade_id: string | null;
  matched_qty: number; buy_price: number; sell_price: number;
  pnl_amount: number; fee_amount: number; tax_amount: number;
  realized_at: string; created_at: string;
}
interface TradeRow {
  id: string; owner: string; account_id: string; symbol: string; code: string | null;
  side: Side; price: number; quantity: number; amount: number; fee: number; tax: number;
  executed_at: string; broker: string | null; realized_pnl: number | null;
  return_rate: number | null; note: ReviewNote | null; source: Source;
  confidence: number | null; linked_check_id: string | null; tax_deductible: boolean;
  analysis_id: string | null;
}
interface AnalysisNoteRow {
  id: string; owner: string; account_id: string; symbol: string; code: string | null;
  status: AnalysisStatus; thesis: string | null; target_price: number | null;
  stop_price: number | null; target_pct: number | null;
  checklist: AnalysisNote['checklist'] | null; retro_memo: string | null;
  retro_label: string | null; analyzed_at: string; closed_at: string | null;
  created_at: string;
}
interface SnapshotRow {
  id: string; owner: string; snapshot_date: string;
  total_value: number; total_cost: number; cash: number;
  details: SnapshotDetail[] | null; created_at: string;
}
interface TargetAllocRow {
  id: string; owner: string; sector: string; target_pct: number;
}
interface TickerRow {
  code: string; name: string; market: string | null;
  sector: string | null; currency: string | null; created_at: string;
}
interface PriceCacheRow {
  ticker_code: string; price: number; fetched_at: string;
}
interface CheckRow {
  id: string; owner: string; account_id: string; symbol: string; code: string | null;
  items: InvestCheck['items']; target_price: number | null; stop_loss: number | null;
  weight: number | null; scenario: string | null; decision: string | null;
  resulted_trade_id: string | null; created_at: string;
}

/* ───────── 행 → 앱 타입 ───────── */

const toAccount = (r: AccountRow): Account => ({
  id: r.id, name: r.name, type: r.type,
  broker: r.broker ?? undefined,
  openedAt: r.opened_at ?? undefined,
  note: r.note ?? undefined,
  cashBalance: r.cash_balance ?? 0,
});

const toDeposit = (r: DepositRow): AccountDeposit => ({
  id: r.id, accountId: r.account_id, amount: r.amount,
  kind: r.kind, memo: r.memo ?? undefined,
  occurredAt: r.occurred_at, createdAt: r.created_at,
});

const toTaxLimit = (r: TaxLimitRow): TaxLimit => ({
  id: r.id, accountType: r.account_type, year: r.year,
  annualLimit: r.annual_limit ?? undefined,
  cumulativeLimit: r.cumulative_limit ?? undefined,
  deductionLimit: r.deduction_limit ?? undefined,
  note: r.note ?? undefined,
});

const toHolding = (r: HoldingRow): Holding => ({
  id: r.id, accountId: r.account_id, symbol: r.symbol,
  code: r.code ?? undefined, quantity: r.quantity,
  avgCost: Number(r.avg_cost), updatedAt: r.updated_at,
});

const toRealizedPnlRow = (r: RealizedPnlDbRow): RealizedPnlRow => ({
  id: r.id, accountId: r.account_id, symbol: r.symbol,
  sellTradeId: r.sell_trade_id, buyTradeId: r.buy_trade_id ?? undefined,
  matchedQty: r.matched_qty, buyPrice: Number(r.buy_price),
  sellPrice: Number(r.sell_price), pnlAmount: r.pnl_amount,
  feeAmount: r.fee_amount, taxAmount: r.tax_amount,
  realizedAt: r.realized_at,
});

const toTrade = (r: TradeRow): Trade => ({
  id: r.id, accountId: r.account_id, symbol: r.symbol,
  code: r.code ?? undefined, side: r.side, price: r.price, quantity: r.quantity,
  amount: r.amount, fee: r.fee, tax: r.tax, executedAt: r.executed_at,
  broker: r.broker ?? undefined,
  realizedPnl: r.realized_pnl ?? undefined,
  returnRate: r.return_rate ?? undefined,
  note: r.note ?? undefined, source: r.source,
  confidence: r.confidence ?? undefined,
  linkedCheckId: r.linked_check_id ?? undefined,
  analysisId: r.analysis_id ?? undefined,
  taxDeductible: r.tax_deductible,
});

const toCheck = (r: CheckRow): InvestCheck => ({
  id: r.id, accountId: r.account_id, symbol: r.symbol,
  code: r.code ?? undefined, createdAt: r.created_at, items: r.items ?? [],
  targetPrice: r.target_price ?? undefined, stopLoss: r.stop_loss ?? undefined,
  weight: r.weight ?? undefined, scenario: r.scenario ?? undefined,
  decision: (r.decision ?? undefined) as InvestCheck['decision'],
  resultedTradeId: r.resulted_trade_id ?? undefined,
});

const toAnalysisNote = (r: AnalysisNoteRow): AnalysisNote => ({
  id: r.id, accountId: r.account_id, symbol: r.symbol,
  code: r.code ?? undefined, status: r.status,
  thesis: r.thesis ?? undefined,
  targetPrice: r.target_price != null ? Number(r.target_price) : undefined,
  stopPrice: r.stop_price != null ? Number(r.stop_price) : undefined,
  targetPct: r.target_pct != null ? Number(r.target_pct) : undefined,
  checklist: r.checklist ?? [],
  retroMemo: r.retro_memo ?? undefined,
  retroLabel: (r.retro_label ?? undefined) as AnalysisNote['retroLabel'],
  analyzedAt: r.analyzed_at, closedAt: r.closed_at ?? undefined,
  createdAt: r.created_at,
});

const toSnapshot = (r: SnapshotRow): PortfolioSnapshot => ({
  id: r.id, snapshotDate: r.snapshot_date,
  totalValue: Number(r.total_value), totalCost: Number(r.total_cost),
  cash: Number(r.cash), details: r.details ?? [],
  createdAt: r.created_at,
});

const toTargetAlloc = (r: TargetAllocRow): TargetAllocation => ({
  id: r.id, sector: r.sector, targetPct: Number(r.target_pct),
});

const toTicker = (r: TickerRow): Ticker => ({
  code: r.code, name: r.name,
  market: r.market ?? undefined, sector: r.sector ?? undefined,
  currency: r.currency ?? undefined,
});

const toPriceCache = (r: PriceCacheRow): PriceCache => ({
  tickerCode: r.ticker_code, price: Number(r.price),
  fetchedAt: r.fetched_at,
});

/* ───────── 앱 타입 → 행 (insert/update payload) ───────── */
// owner는 RLS와 DB default(auth.uid()는 아니지만 명시 주입)로 채운다.

const fromTrade = (t: Omit<Trade, 'id'>, owner: string) => ({
  owner, account_id: t.accountId, symbol: t.symbol, code: t.code ?? null,
  side: t.side, price: t.price, quantity: t.quantity, amount: t.amount,
  fee: t.fee, tax: t.tax, executed_at: t.executedAt, broker: t.broker ?? null,
  realized_pnl: t.realizedPnl ?? null, return_rate: t.returnRate ?? null,
  note: t.note ?? null, source: t.source, confidence: t.confidence ?? null,
  linked_check_id: t.linkedCheckId ?? null, analysis_id: t.analysisId ?? null,
  tax_deductible: t.taxDeductible ?? true,
});

const fromAccount = (a: Omit<Account, 'id'>, owner: string) => ({
  owner, name: a.name, type: a.type, broker: a.broker ?? null,
  opened_at: a.openedAt ?? null, note: a.note ?? null,
  cash_balance: a.cashBalance ?? 0,
});

const fromDeposit = (d: Omit<AccountDeposit, 'id' | 'createdAt'>, owner: string) => ({
  owner, account_id: d.accountId, amount: d.amount, kind: d.kind,
  memo: d.memo ?? null, occurred_at: d.occurredAt,
});

const fromCheck = (c: Omit<InvestCheck, 'id'>, owner: string) => ({
  owner, account_id: c.accountId, symbol: c.symbol, code: c.code ?? null,
  items: c.items, target_price: c.targetPrice ?? null, stop_loss: c.stopLoss ?? null,
  weight: c.weight ?? null, scenario: c.scenario ?? null, decision: c.decision ?? null,
  resulted_trade_id: c.resultedTradeId ?? null,
});

const fromAnalysisNote = (n: Omit<AnalysisNote, 'id' | 'createdAt'>, owner: string) => ({
  owner, account_id: n.accountId, symbol: n.symbol, code: n.code ?? null,
  status: n.status, thesis: n.thesis ?? null,
  target_price: n.targetPrice ?? null, stop_price: n.stopPrice ?? null,
  target_pct: n.targetPct ?? null, checklist: n.checklist,
  retro_memo: n.retroMemo ?? null, retro_label: n.retroLabel ?? null,
  analyzed_at: n.analyzedAt, closed_at: n.closedAt ?? null,
});

/* ───────── 현재 사용자 ───────── */

async function uid(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('로그인이 필요합니다.');
  return data.user.id;
}

/* ───────── Local → 정규화 (기존 데이터 호환) ───────── */

/** localStorage의 Account 행에서 누락된 숫자 필드를 0으로 보정 */
function normalizeAccount(a: Account): Account {
  return { ...a, cashBalance: Number(a.cashBalance) || 0 };
}

/** localStorage의 Trade 행에서 누락된 필드를 보정 */
function normalizeTrade(t: Trade): Trade {
  return {
    ...t,
    accountId: t.accountId || '',
    executedAt: t.executedAt || new Date().toISOString(),
    price: Number(t.price) || 0,
    quantity: Number(t.quantity) || 0,
    amount: Number(t.amount) || 0,
    fee: Number(t.fee) || 0,
    tax: Number(t.tax) || 0,
  };
}

/** localStorage의 Holding 행에서 누락된 숫자 필드를 0으로 보정 */
function normalizeHolding(h: Holding): Holding {
  return {
    ...h,
    quantity: Number(h.quantity) || 0,
    avgCost: Number(h.avgCost) || 0,
  };
}

/** localStorage의 RealizedPnlRow에서 누락된 숫자 필드를 0으로 보정 */
function normalizeRealizedPnl(r: RealizedPnlRow): RealizedPnlRow {
  return {
    ...r,
    matchedQty: Number(r.matchedQty) || 0,
    buyPrice: Number(r.buyPrice) || 0,
    sellPrice: Number(r.sellPrice) || 0,
    pnlAmount: Number(r.pnlAmount) || 0,
    feeAmount: Number(r.feeAmount) || 0,
    taxAmount: Number(r.taxAmount) || 0,
  };
}

/* ───────── Accounts ───────── */

export const accountsRepo = {
  async list(): Promise<Account[]> {
    if (useLocalRepo()) return readLocal<Account>(LOCAL_KEYS.accounts).map(normalizeAccount);
    const { data, error } = await supabase.from('accounts').select('*').order('created_at');
    if (error) throw error;
    return (data as AccountRow[]).map(toAccount);
  },
  async add(a: Omit<Account, 'id'>): Promise<Account> {
    if (useLocalRepo()) {
      const rows = readLocal<Account>(LOCAL_KEYS.accounts);
      const created = { ...a, id: localId(), cashBalance: a.cashBalance ?? 0 };
      writeLocal(LOCAL_KEYS.accounts, [...rows, created]);
      return created;
    }
    const { data, error } = await supabase
      .from('accounts').insert(fromAccount(a, await uid())).select().single();
    if (error) throw error;
    return toAccount(data as AccountRow);
  },
  async update(id: string, patch: Partial<Account>): Promise<void> {
    if (useLocalRepo()) {
      const rows = readLocal<Account>(LOCAL_KEYS.accounts).map((a) => (
        a.id === id ? { ...a, ...patch } : a
      ));
      writeLocal(LOCAL_KEYS.accounts, rows);
      return;
    }
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.type !== undefined) row.type = patch.type;
    if (patch.broker !== undefined) row.broker = patch.broker ?? null;
    if (patch.openedAt !== undefined) row.opened_at = patch.openedAt ?? null;
    if (patch.note !== undefined) row.note = patch.note ?? null;
    if (patch.cashBalance !== undefined) row.cash_balance = patch.cashBalance;
    const { error } = await supabase.from('accounts').update(row).eq('id', id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    if (useLocalRepo()) {
      writeLocal(LOCAL_KEYS.accounts, readLocal<Account>(LOCAL_KEYS.accounts).filter((a) => a.id !== id));
      writeLocal(LOCAL_KEYS.trades, readLocal<Trade>(LOCAL_KEYS.trades).filter((t) => t.accountId !== id));
      writeLocal(LOCAL_KEYS.checks, readLocal<InvestCheck>(LOCAL_KEYS.checks).filter((c) => c.accountId !== id));
      return;
    }
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) throw error;
  },
};

/* ───────── Trades ───────── */

export const tradesRepo = {
  async list(): Promise<Trade[]> {
    if (useLocalRepo()) {
      return readLocal<Trade>(LOCAL_KEYS.trades)
        .map(normalizeTrade)
        .sort((a, b) => b.executedAt.localeCompare(a.executedAt));
    }
    const { data, error } = await supabase
      .from('trades').select('*').order('executed_at', { ascending: false });
    if (error) throw error;
    return (data as TradeRow[]).map(toTrade);
  },
  /** 기간 필터 조회 — 서버에서 기간 필터링, opening lot 제외 */
  async listByRange(startDate: string, endDate: string): Promise<Trade[]> {
    if (useLocalRepo()) {
      return readLocal<Trade>(LOCAL_KEYS.trades)
        .map(normalizeTrade)
        .filter((t) => t.source !== 'opening')
        .filter((t) => t.executedAt.slice(0, 10) >= startDate && t.executedAt.slice(0, 10) <= endDate)
        .sort((a, b) => b.executedAt.localeCompare(a.executedAt));
    }
    const { data, error } = await supabase
      .from('trades').select('*')
      .neq('source', 'opening')
      .gte('executed_at', startDate)
      .lte('executed_at', endDate + 'T23:59:59')
      .order('executed_at', { ascending: false });
    if (error) throw error;
    return (data as TradeRow[]).map(toTrade);
  },
  /** 전체 조회 — opening lot 제외 */
  async listExcludeOpening(): Promise<Trade[]> {
    if (useLocalRepo()) {
      return readLocal<Trade>(LOCAL_KEYS.trades)
        .map(normalizeTrade)
        .filter((t) => t.source !== 'opening')
        .sort((a, b) => b.executedAt.localeCompare(a.executedAt));
    }
    const { data, error } = await supabase
      .from('trades').select('*')
      .neq('source', 'opening')
      .order('executed_at', { ascending: false });
    if (error) throw error;
    return (data as TradeRow[]).map(toTrade);
  },
  async add(t: Omit<Trade, 'id'>): Promise<Trade> {
    if (useLocalRepo()) {
      const rows = readLocal<Trade>(LOCAL_KEYS.trades);
      const created = { ...t, id: localId() };
      writeLocal(LOCAL_KEYS.trades, [created, ...rows]);
      return created;
    }
    const { data, error } = await supabase
      .from('trades').insert(fromTrade(t, await uid())).select().single();
    if (error) throw error;
    return toTrade(data as TradeRow);
  },
  async addMany(list: Omit<Trade, 'id'>[]): Promise<Trade[]> {
    if (list.length === 0) return [];
    if (useLocalRepo()) {
      const rows = readLocal<Trade>(LOCAL_KEYS.trades);
      const created = list.map((t) => ({ ...t, id: localId() }));
      writeLocal(LOCAL_KEYS.trades, [...created, ...rows]);
      return created;
    }
    const owner = await uid();
    const { data, error } = await supabase
      .from('trades').insert(list.map((t) => fromTrade(t, owner))).select();
    if (error) throw error;
    return (data as TradeRow[]).map(toTrade);
  },
  async update(id: string, patch: Partial<Trade>): Promise<void> {
    if (useLocalRepo()) {
      const rows = readLocal<Trade>(LOCAL_KEYS.trades).map((t) => (
        t.id === id ? { ...t, ...patch } : t
      ));
      writeLocal(LOCAL_KEYS.trades, rows);
      return;
    }
    const row: Record<string, unknown> = {};
    const m: Record<string, string> = {
      accountId: 'account_id', executedAt: 'executed_at', realizedPnl: 'realized_pnl',
      returnRate: 'return_rate', linkedCheckId: 'linked_check_id', analysisId: 'analysis_id',
      taxDeductible: 'tax_deductible',
    };
    for (const [k, v] of Object.entries(patch)) {
      const col = m[k] ?? k; // camelCase가 곧 컬럼인 단순 필드들
      row[col] = v ?? null;
    }
    const { error } = await supabase.from('trades').update(row).eq('id', id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    if (useLocalRepo()) {
      writeLocal(LOCAL_KEYS.trades, readLocal<Trade>(LOCAL_KEYS.trades).filter((t) => t.id !== id));
      return;
    }
    const { error } = await supabase.from('trades').delete().eq('id', id);
    if (error) throw error;
  },
};

/* ───────── InvestChecks ───────── */

export const checksRepo = {
  async list(): Promise<InvestCheck[]> {
    if (useLocalRepo()) {
      return readLocal<InvestCheck>(LOCAL_KEYS.checks)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    const { data, error } = await supabase
      .from('invest_checks').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as CheckRow[]).map(toCheck);
  },
  async add(c: Omit<InvestCheck, 'id' | 'createdAt'>): Promise<InvestCheck> {
    if (useLocalRepo()) {
      const rows = readLocal<InvestCheck>(LOCAL_KEYS.checks);
      const created = { ...c, id: localId(), createdAt: new Date().toISOString() };
      writeLocal(LOCAL_KEYS.checks, [created, ...rows]);
      return created;
    }
    const { data, error } = await supabase
      .from('invest_checks').insert(fromCheck(c as Omit<InvestCheck, 'id'>, await uid())).select().single();
    if (error) throw error;
    return toCheck(data as CheckRow);
  },
  async update(id: string, patch: Partial<InvestCheck>): Promise<void> {
    if (useLocalRepo()) {
      const rows = readLocal<InvestCheck>(LOCAL_KEYS.checks).map((c) => (
        c.id === id ? { ...c, ...patch } : c
      ));
      writeLocal(LOCAL_KEYS.checks, rows);
      return;
    }
    const row: Record<string, unknown> = {};
    const m: Record<string, string> = {
      accountId: 'account_id', targetPrice: 'target_price', stopLoss: 'stop_loss',
      resultedTradeId: 'resulted_trade_id',
    };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'id' || k === 'createdAt') continue;
      const col = m[k] ?? k;
      row[col] = v ?? null;
    }
    const { error } = await supabase.from('invest_checks').update(row).eq('id', id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    if (useLocalRepo()) {
      writeLocal(LOCAL_KEYS.checks, readLocal<InvestCheck>(LOCAL_KEYS.checks).filter((c) => c.id !== id));
      return;
    }
    const { error } = await supabase.from('invest_checks').delete().eq('id', id);
    if (error) throw error;
  },
  async linkTrade(checkId: string, tradeId: string): Promise<void> {
    if (useLocalRepo()) {
      const checks = readLocal<InvestCheck>(LOCAL_KEYS.checks).map((c) => (
        c.id === checkId ? { ...c, resultedTradeId: tradeId } : c
      ));
      const trades = readLocal<Trade>(LOCAL_KEYS.trades).map((t) => (
        t.id === tradeId ? { ...t, linkedCheckId: checkId } : t
      ));
      writeLocal(LOCAL_KEYS.checks, checks);
      writeLocal(LOCAL_KEYS.trades, trades);
      return;
    }
    const owner = await uid();
    await supabase.from('invest_checks').update({ resulted_trade_id: tradeId }).eq('id', checkId);
    await supabase.from('trades').update({ linked_check_id: checkId }).eq('id', tradeId);
    void owner;
  },
};

/* ───────── AccountDeposits (입출금 기록) ───────── */

export const depositsRepo = {
  async list(accountId?: string): Promise<AccountDeposit[]> {
    if (useLocalRepo()) {
      const all = readLocal<AccountDeposit>(LOCAL_KEYS.deposits);
      const filtered = accountId ? all.filter((d) => d.accountId === accountId) : all;
      return filtered.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    }
    let q = supabase.from('account_deposits').select('*').order('occurred_at', { ascending: false });
    if (accountId) q = q.eq('account_id', accountId);
    const { data, error } = await q;
    if (error) throw error;
    return (data as DepositRow[]).map(toDeposit);
  },
  async add(d: Omit<AccountDeposit, 'id' | 'createdAt'>): Promise<AccountDeposit> {
    if (useLocalRepo()) {
      const rows = readLocal<AccountDeposit>(LOCAL_KEYS.deposits);
      const created: AccountDeposit = { ...d, id: localId(), createdAt: new Date().toISOString() };
      writeLocal(LOCAL_KEYS.deposits, [created, ...rows]);
      // 로컬 모드에서도 계좌 cash_balance 반영
      const accounts = readLocal<Account>(LOCAL_KEYS.accounts).map((a) => {
        if (a.id !== d.accountId) return a;
        const delta = d.kind === 'deposit' ? d.amount : -d.amount;
        return { ...a, cashBalance: (a.cashBalance ?? 0) + delta };
      });
      writeLocal(LOCAL_KEYS.accounts, accounts);
      return created;
    }
    const owner = await uid();
    const { data, error } = await supabase
      .from('account_deposits').insert(fromDeposit(d, owner)).select().single();
    if (error) throw error;
    // cash_balance 갱신: 현재 잔고 조회 후 갱신
    const delta = d.kind === 'deposit' ? d.amount : -d.amount;
    const { data: acct } = await supabase
      .from('accounts').select('cash_balance').eq('id', d.accountId).single();
    if (acct) {
      await supabase
        .from('accounts')
        .update({ cash_balance: (acct.cash_balance ?? 0) + delta })
        .eq('id', d.accountId);
    }
    return toDeposit(data as DepositRow);
  },
  async remove(id: string): Promise<void> {
    if (useLocalRepo()) {
      const deposits = readLocal<AccountDeposit>(LOCAL_KEYS.deposits);
      const target = deposits.find((d) => d.id === id);
      if (target) {
        const delta = target.kind === 'deposit' ? -target.amount : target.amount;
        const accounts = readLocal<Account>(LOCAL_KEYS.accounts).map((a) => {
          if (a.id !== target.accountId) return a;
          return { ...a, cashBalance: (a.cashBalance ?? 0) + delta };
        });
        writeLocal(LOCAL_KEYS.accounts, accounts);
      }
      writeLocal(LOCAL_KEYS.deposits, deposits.filter((d) => d.id !== id));
      return;
    }
    // 삭제 전 금액 역산을 위해 먼저 조회
    const { data: dep } = await supabase
      .from('account_deposits').select('*').eq('id', id).single();
    if (dep) {
      const row = dep as DepositRow;
      const delta = row.kind === 'deposit' ? -row.amount : row.amount;
      const { data: acct } = await supabase
        .from('accounts').select('cash_balance').eq('id', row.account_id).single();
      if (acct) {
        await supabase
          .from('accounts')
          .update({ cash_balance: (acct.cash_balance ?? 0) + delta })
          .eq('id', row.account_id);
      }
    }
    const { error } = await supabase.from('account_deposits').delete().eq('id', id);
    if (error) throw error;
  },
};

/* ───────── TaxLimits (세제 한도 참조) ───────── */

export const taxLimitsRepo = {
  async list(year?: number): Promise<TaxLimit[]> {
    if (useLocalRepo()) {
      const all = readLocal<TaxLimit>(LOCAL_KEYS.taxLimits);
      return year ? all.filter((l) => l.year === year) : all;
    }
    let q = supabase.from('tax_limits').select('*').order('year', { ascending: false });
    if (year) q = q.eq('year', year);
    const { data, error } = await q;
    if (error) throw error;
    return (data as TaxLimitRow[]).map(toTaxLimit);
  },
};

/* ───────── Holdings (보유현황 캐시) ───────── */

export const holdingsRepo = {
  async list(accountId?: string): Promise<Holding[]> {
    if (useLocalRepo()) {
      const all = readLocal<Holding>(LOCAL_KEYS.holdings).map(normalizeHolding);
      return accountId ? all.filter((h) => h.accountId === accountId) : all;
    }
    let q = supabase.from('holdings').select('*').order('symbol');
    if (accountId) q = q.eq('account_id', accountId);
    const { data, error } = await q;
    if (error) throw error;
    return (data as HoldingRow[]).map(toHolding);
  },
  async getBySymbol(accountId: string, symbol: string): Promise<Holding | null> {
    if (useLocalRepo()) {
      const all = readLocal<Holding>(LOCAL_KEYS.holdings);
      return all.find((h) => h.accountId === accountId && h.symbol === symbol) ?? null;
    }
    const { data, error } = await supabase
      .from('holdings').select('*')
      .eq('account_id', accountId).eq('symbol', symbol).maybeSingle();
    if (error) throw error;
    return data ? toHolding(data as HoldingRow) : null;
  },
};

/* ───────── RealizedPnl (실현손익) ───────── */

export const realizedPnlRepo = {
  async list(accountId?: string): Promise<RealizedPnlRow[]> {
    if (useLocalRepo()) {
      const all = readLocal<RealizedPnlRow>(LOCAL_KEYS.realizedPnl).map(normalizeRealizedPnl);
      return accountId ? all.filter((r) => r.accountId === accountId) : all;
    }
    let q = supabase.from('realized_pnl').select('*').order('realized_at', { ascending: false });
    if (accountId) q = q.eq('account_id', accountId);
    const { data, error } = await q;
    if (error) throw error;
    return (data as RealizedPnlDbRow[]).map(toRealizedPnlRow);
  },
  async listByTrade(sellTradeId: string): Promise<RealizedPnlRow[]> {
    if (useLocalRepo()) {
      return readLocal<RealizedPnlRow>(LOCAL_KEYS.realizedPnl)
        .filter((r) => r.sellTradeId === sellTradeId);
    }
    const { data, error } = await supabase
      .from('realized_pnl').select('*').eq('sell_trade_id', sellTradeId);
    if (error) throw error;
    return (data as RealizedPnlDbRow[]).map(toRealizedPnlRow);
  },
};

/* ───────── AnalysisNotes (분석 노트) ───────── */

export const analysisNotesRepo = {
  async list(accountId?: string): Promise<AnalysisNote[]> {
    if (useLocalRepo()) {
      const all = readLocal<AnalysisNote>(LOCAL_KEYS.analysisNotes);
      const filtered = accountId ? all.filter((n) => n.accountId === accountId) : all;
      return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    let q = supabase.from('analysis_notes').select('*').order('created_at', { ascending: false });
    if (accountId) q = q.eq('account_id', accountId);
    const { data, error } = await q;
    if (error) throw error;
    return (data as AnalysisNoteRow[]).map(toAnalysisNote);
  },
  async add(n: Omit<AnalysisNote, 'id' | 'createdAt'>): Promise<AnalysisNote> {
    if (useLocalRepo()) {
      const rows = readLocal<AnalysisNote>(LOCAL_KEYS.analysisNotes);
      const created: AnalysisNote = { ...n, id: localId(), createdAt: new Date().toISOString() };
      writeLocal(LOCAL_KEYS.analysisNotes, [created, ...rows]);
      return created;
    }
    const { data, error } = await supabase
      .from('analysis_notes').insert(fromAnalysisNote(n, await uid())).select().single();
    if (error) throw error;
    return toAnalysisNote(data as AnalysisNoteRow);
  },
  async update(id: string, patch: Partial<AnalysisNote>): Promise<void> {
    if (useLocalRepo()) {
      const rows = readLocal<AnalysisNote>(LOCAL_KEYS.analysisNotes).map((n) => (
        n.id === id ? { ...n, ...patch } : n
      ));
      writeLocal(LOCAL_KEYS.analysisNotes, rows);
      return;
    }
    const row: Record<string, unknown> = {};
    const m: Record<string, string> = {
      accountId: 'account_id', targetPrice: 'target_price', stopPrice: 'stop_price',
      targetPct: 'target_pct', retroMemo: 'retro_memo', retroLabel: 'retro_label',
      analyzedAt: 'analyzed_at', closedAt: 'closed_at',
    };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'id' || k === 'createdAt') continue;
      const col = m[k] ?? k;
      row[col] = v ?? null;
    }
    const { error } = await supabase.from('analysis_notes').update(row).eq('id', id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    if (useLocalRepo()) {
      writeLocal(LOCAL_KEYS.analysisNotes, readLocal<AnalysisNote>(LOCAL_KEYS.analysisNotes).filter((n) => n.id !== id));
      return;
    }
    const { error } = await supabase.from('analysis_notes').delete().eq('id', id);
    if (error) throw error;
  },
  /** 분석 노트에 매매 연결 (trades.analysis_id 업데이트 + 노트 status→active) */
  async linkTrade(noteId: string, tradeId: string): Promise<void> {
    if (useLocalRepo()) {
      const notes = readLocal<AnalysisNote>(LOCAL_KEYS.analysisNotes).map((n) => (
        n.id === noteId && n.status === 'draft' ? { ...n, status: 'active' as AnalysisStatus } : n
      ));
      const trades = readLocal<Trade>(LOCAL_KEYS.trades).map((t) => (
        t.id === tradeId ? { ...t, analysisId: noteId } : t
      ));
      writeLocal(LOCAL_KEYS.analysisNotes, notes);
      writeLocal(LOCAL_KEYS.trades, trades);
      return;
    }
    await supabase.from('trades').update({ analysis_id: noteId }).eq('id', tradeId);
    // draft → active 자동 전환
    const { data } = await supabase.from('analysis_notes').select('status').eq('id', noteId).single();
    if (data?.status === 'draft') {
      await supabase.from('analysis_notes').update({ status: 'active' }).eq('id', noteId);
    }
  },
};

/* ───────── PortfolioSnapshots (포트폴리오 스냅샷) ───────── */

export const snapshotsRepo = {
  async list(): Promise<PortfolioSnapshot[]> {
    if (useLocalRepo()) {
      return readLocal<PortfolioSnapshot>(LOCAL_KEYS.snapshots)
        .sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
    }
    const { data, error } = await supabase
      .from('portfolio_snapshots').select('*').order('snapshot_date', { ascending: false });
    if (error) throw error;
    return (data as SnapshotRow[]).map(toSnapshot);
  },
  async upsert(s: Omit<PortfolioSnapshot, 'id' | 'createdAt'>): Promise<PortfolioSnapshot> {
    if (useLocalRepo()) {
      const rows = readLocal<PortfolioSnapshot>(LOCAL_KEYS.snapshots);
      const idx = rows.findIndex((r) => r.snapshotDate === s.snapshotDate);
      const entry: PortfolioSnapshot = { ...s, id: idx >= 0 ? rows[idx].id : localId(), createdAt: new Date().toISOString() };
      if (idx >= 0) rows[idx] = entry; else rows.unshift(entry);
      writeLocal(LOCAL_KEYS.snapshots, rows);
      return entry;
    }
    const owner = await uid();
    const { data, error } = await supabase
      .from('portfolio_snapshots')
      .upsert({
        owner, snapshot_date: s.snapshotDate,
        total_value: s.totalValue, total_cost: s.totalCost,
        cash: s.cash, details: s.details,
      }, { onConflict: 'owner,snapshot_date' })
      .select().single();
    if (error) throw error;
    return toSnapshot(data as SnapshotRow);
  },
  async remove(id: string): Promise<void> {
    if (useLocalRepo()) {
      writeLocal(LOCAL_KEYS.snapshots, readLocal<PortfolioSnapshot>(LOCAL_KEYS.snapshots).filter((s) => s.id !== id));
      return;
    }
    const { error } = await supabase.from('portfolio_snapshots').delete().eq('id', id);
    if (error) throw error;
  },
};

/* ───────── TargetAllocation (목표 배분) ───────── */

export const targetAllocationRepo = {
  async list(): Promise<TargetAllocation[]> {
    if (useLocalRepo()) {
      return readLocal<TargetAllocation>(LOCAL_KEYS.targetAllocation)
        .sort((a, b) => b.targetPct - a.targetPct);
    }
    const { data, error } = await supabase
      .from('target_allocation').select('*').order('target_pct', { ascending: false });
    if (error) throw error;
    return (data as TargetAllocRow[]).map(toTargetAlloc);
  },
  async upsert(sector: string, targetPct: number): Promise<void> {
    if (useLocalRepo()) {
      const rows = readLocal<TargetAllocation>(LOCAL_KEYS.targetAllocation);
      const idx = rows.findIndex((r) => r.sector === sector);
      if (idx >= 0) { rows[idx].targetPct = targetPct; }
      else { rows.push({ id: localId(), sector, targetPct }); }
      writeLocal(LOCAL_KEYS.targetAllocation, rows);
      return;
    }
    const owner = await uid();
    const { error } = await supabase
      .from('target_allocation')
      .upsert({ owner, sector, target_pct: targetPct }, { onConflict: 'owner,sector' });
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    if (useLocalRepo()) {
      writeLocal(LOCAL_KEYS.targetAllocation, readLocal<TargetAllocation>(LOCAL_KEYS.targetAllocation).filter((a) => a.id !== id));
      return;
    }
    const { error } = await supabase.from('target_allocation').delete().eq('id', id);
    if (error) throw error;
  },
};

/* ───────── Tickers (종목 마스터) ───────── */

export const tickersRepo = {
  async list(): Promise<Ticker[]> {
    if (useLocalRepo()) {
      return readLocal<Ticker>(LOCAL_KEYS.tickers);
    }
    const { data, error } = await supabase
      .from('tickers').select('*').order('code');
    if (error) throw error;
    return (data as TickerRow[]).map(toTicker);
  },
  /** symbol/code → sector 매핑 반환 */
  async sectorMap(): Promise<Record<string, string>> {
    const tickers = await this.list();
    const map: Record<string, string> = {};
    for (const t of tickers) {
      if (t.sector) {
        map[t.name] = t.sector;
        map[t.code] = t.sector;
      }
    }
    return map;
  },
};

/* ───────── PriceCache (시세 캐시) ───────── */

export const priceCacheRepo = {
  async list(): Promise<PriceCache[]> {
    if (useLocalRepo()) {
      return readLocal<PriceCache>(LOCAL_KEYS.priceCache);
    }
    const { data, error } = await supabase
      .from('price_cache').select('*');
    if (error) throw error;
    return (data as PriceCacheRow[]).map(toPriceCache);
  },
  /** code → price 매핑 반환 */
  async priceMap(): Promise<Record<string, number>> {
    const prices = await this.list();
    const map: Record<string, number> = {};
    for (const p of prices) map[p.tickerCode] = p.price;
    return map;
  },
};

/** 현재 보유현황에서 스냅샷 생성 (수동 또는 크론) */
export async function takeSnapshot(
  holdings: Holding[],
  accounts: Account[],
  priceMap?: Record<string, number>,
): Promise<PortfolioSnapshot> {
  const details: SnapshotDetail[] = holdings.map((h) => {
    const price = (h.code && priceMap?.[h.code]) || h.avgCost;
    return {
      accountId: h.accountId, symbol: h.symbol,
      quantity: h.quantity, avgCost: h.avgCost,
      value: h.quantity * price,
    };
  });
  const totalCost = details.reduce((s, d) => s + d.quantity * d.avgCost, 0);
  const totalValue = details.reduce((s, d) => s + d.value, 0);
  const cash = accounts.reduce((s, a) => s + a.cashBalance, 0);

  return snapshotsRepo.upsert({
    snapshotDate: new Date().toISOString().slice(0, 10),
    totalValue, totalCost, cash, details,
  });
}

/* ───────── saveTrade — 거래 저장 + holdings 갱신 + FIFO ─────────
 * 매수: holdings 가중평균 갱신 (upsert)
 * 매도: 보유 확인 → INSERT trade → calc_fifo_on_sell → holdings 차감
 * deposit/withdrawal: 기존 tradesRepo.add 위임
 *
 * 서버사이드 트랜잭션: Supabase에서는 rpc를 쓰거나 순차 호출.
 * calc_fifo_on_sell 함수가 realized_pnl INSERT를 포함하므로
 * 매도 시 trade INSERT → rpc('calc_fifo_on_sell') → holdings UPDATE.
 * ──────────────────────────────────────────────────────────────── */

export async function saveTrade(t: Omit<Trade, 'id'>): Promise<Trade> {
  const isBuySell = t.side === 'buy' || t.side === 'sell';

  // deposit/withdrawal은 기존 로직 위임
  if (!isBuySell) {
    return tradesRepo.add(t);
  }

  // ──── 로컬 모드 ────
  if (useLocalRepo()) {
    return saveTradeLocal(t);
  }

  // ──── Supabase 모드 ────
  const owner = await uid();

  if (t.side === 'sell') {
    // 보유 확인
    const { data: holdingData } = await supabase
      .from('holdings').select('quantity')
      .eq('account_id', t.accountId).eq('symbol', t.symbol).maybeSingle();
    const held = holdingData?.quantity ?? 0;
    if (t.quantity > held) {
      throw new Error(`매도 수량(${t.quantity})이 보유 수량(${held})을 초과합니다.`);
    }
  }

  // 1. 거래 INSERT
  const { data: tradeData, error: tradeErr } = await supabase
    .from('trades').insert(fromTrade(t, owner)).select().single();
  if (tradeErr) throw tradeErr;
  const created = toTrade(tradeData as TradeRow);

  if (t.side === 'buy') {
    // 2a. 매수: holdings upsert (가중평균)
    const { data: existing } = await supabase
      .from('holdings').select('*')
      .eq('account_id', t.accountId).eq('symbol', t.symbol).maybeSingle();

    if (existing) {
      const row = existing as HoldingRow;
      const oldQty = row.quantity;
      const oldCost = Number(row.avg_cost);
      const newQty = oldQty + t.quantity;
      const newAvgCost = newQty > 0
        ? (oldCost * oldQty + t.price * t.quantity) / newQty
        : 0;
      await supabase.from('holdings').update({
        quantity: newQty,
        avg_cost: Math.round(newAvgCost * 100) / 100,
        code: t.code ?? row.code,
      }).eq('id', row.id);
    } else {
      await supabase.from('holdings').insert({
        owner,
        account_id: t.accountId,
        symbol: t.symbol,
        code: t.code ?? null,
        quantity: t.quantity,
        avg_cost: t.price,
      });
    }
  } else {
    // 2b. 매도: calc_fifo_on_sell 호출 → holdings 차감
    const { error: fifoErr } = await supabase.rpc('calc_fifo_on_sell', {
      p_sell_trade_id: created.id,
    });
    if (fifoErr) throw fifoErr;

    // holdings 차감
    const { data: hData } = await supabase
      .from('holdings').select('*')
      .eq('account_id', t.accountId).eq('symbol', t.symbol).maybeSingle();
    if (hData) {
      const row = hData as HoldingRow;
      const newQty = row.quantity - t.quantity;
      if (newQty <= 0) {
        await supabase.from('holdings').delete().eq('id', row.id);
      } else {
        await supabase.from('holdings').update({ quantity: newQty }).eq('id', row.id);
      }
    }

    // realized_pnl 합산 → 거래의 realizedPnl 필드 업데이트
    const { data: pnlRows } = await supabase
      .from('realized_pnl').select('pnl_amount')
      .eq('sell_trade_id', created.id);
    if (pnlRows && pnlRows.length > 0) {
      const totalPnl = pnlRows.reduce((s, r) => s + (r.pnl_amount ?? 0), 0);
      const cost = pnlRows.reduce((s, r) => s, 0);
      await supabase.from('trades').update({
        realized_pnl: totalPnl,
      }).eq('id', created.id);
      created.realizedPnl = totalPnl;
    }
  }

  return created;
}

/** 로컬 모드용 saveTrade — 클라이언트 FIFO 로직 */
function saveTradeLocal(t: Omit<Trade, 'id'>): Trade {
  const trades = readLocal<Trade>(LOCAL_KEYS.trades);
  const holdings = readLocal<Holding>(LOCAL_KEYS.holdings);

  if (t.side === 'sell') {
    const held = holdings.find((h) => h.accountId === t.accountId && h.symbol === t.symbol);
    if (!held || held.quantity < t.quantity) {
      throw new Error(`매도 수량(${t.quantity})이 보유 수량(${held?.quantity ?? 0})을 초과합니다.`);
    }
  }

  const created: Trade = { ...t, id: localId() };
  writeLocal(LOCAL_KEYS.trades, [created, ...trades]);

  if (t.side === 'buy') {
    const idx = holdings.findIndex((h) => h.accountId === t.accountId && h.symbol === t.symbol);
    if (idx >= 0) {
      const h = holdings[idx];
      const newQty = h.quantity + t.quantity;
      const newAvgCost = (h.avgCost * h.quantity + t.price * t.quantity) / newQty;
      holdings[idx] = { ...h, quantity: newQty, avgCost: Math.round(newAvgCost * 100) / 100, updatedAt: new Date().toISOString() };
    } else {
      holdings.push({
        id: localId(), accountId: t.accountId, symbol: t.symbol,
        code: t.code, quantity: t.quantity, avgCost: t.price,
        updatedAt: new Date().toISOString(),
      });
    }
    writeLocal(LOCAL_KEYS.holdings, holdings);
  } else {
    // 매도: 로컬 FIFO
    const acctTrades = [...trades, created]
      .filter((x) => x.accountId === t.accountId && x.symbol === t.symbol && x.side === 'buy')
      .sort((a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime());

    const pnlRows = readLocal<RealizedPnlRow>(LOCAL_KEYS.realizedPnl);
    // 이전 매칭 수량 계산
    const matchedByBuy = new Map<string, number>();
    for (const p of pnlRows) {
      if (p.buyTradeId) {
        matchedByBuy.set(p.buyTradeId, (matchedByBuy.get(p.buyTradeId) ?? 0) + p.matchedQty);
      }
    }

    let remaining = t.quantity;
    let totalPnl = 0;
    const feePerShare = t.quantity > 0 ? t.fee / t.quantity : 0;
    const taxPerShare = t.quantity > 0 ? t.tax / t.quantity : 0;

    for (const buy of acctTrades) {
      if (remaining <= 0) break;
      const alreadyMatched = matchedByBuy.get(buy.id) ?? 0;
      const buyRemaining = buy.quantity - alreadyMatched;
      if (buyRemaining <= 0) continue;

      const take = Math.min(remaining, buyRemaining);
      const feeAlloc = Math.round(feePerShare * take);
      const taxAlloc = Math.round(taxPerShare * take);
      const pnl = (t.price - buy.price) * take - feeAlloc - taxAlloc;

      pnlRows.push({
        id: localId(), accountId: t.accountId, symbol: t.symbol,
        sellTradeId: created.id, buyTradeId: buy.id,
        matchedQty: take, buyPrice: buy.price, sellPrice: t.price,
        pnlAmount: pnl, feeAmount: feeAlloc, taxAmount: taxAlloc,
        realizedAt: t.executedAt,
      });
      totalPnl += pnl;
      remaining -= take;
    }

    writeLocal(LOCAL_KEYS.realizedPnl, pnlRows);
    created.realizedPnl = totalPnl;
    // 거래 목록 업데이트 (realizedPnl 포함)
    writeLocal(LOCAL_KEYS.trades, readLocal<Trade>(LOCAL_KEYS.trades).map(
      (x) => x.id === created.id ? created : x
    ));

    // holdings 차감
    const hIdx = holdings.findIndex((h) => h.accountId === t.accountId && h.symbol === t.symbol);
    if (hIdx >= 0) {
      const h = holdings[hIdx];
      const newQty = h.quantity - t.quantity;
      if (newQty <= 0) {
        holdings.splice(hIdx, 1);
      } else {
        holdings[hIdx] = { ...h, quantity: newQty, updatedAt: new Date().toISOString() };
      }
      writeLocal(LOCAL_KEYS.holdings, holdings);
    }
  }

  return created;
}

/* ───────── BrokerCredentials (증권사 연동 자격) ───────── */

interface BrokerCredentialRow {
  id: string; owner: string; account_id: string; broker: 'kis' | 'kiwoom';
  app_key_enc: string; app_secret_enc: string; account_no_enc: string | null;
  extra: Record<string, string> | null; account_type: 'REAL' | 'VIRTUAL';
  created_at: string;
}

const toBrokerCredential = (r: BrokerCredentialRow): BrokerCredential => ({
  id: r.id, accountId: r.account_id, broker: r.broker,
  appKeyEnc: r.app_key_enc, appSecretEnc: r.app_secret_enc,
  accountNoEnc: r.account_no_enc ?? undefined,
  extra: r.extra ?? undefined,
  accountType: r.account_type, createdAt: r.created_at,
});

export const brokerCredentialsRepo = {
  async list(): Promise<BrokerCredential[]> {
    if (useLocalRepo()) return [];
    const { data, error } = await supabase
      .from('broker_credentials').select('*').order('created_at');
    if (error) throw error;
    return (data as BrokerCredentialRow[]).map(toBrokerCredential);
  },
  async add(c: {
    accountId: string;
    broker: 'kis' | 'kiwoom';
    appKeyEnc: string;
    appSecretEnc: string;
    accountNoEnc?: string;
    extra?: Record<string, string>;
    accountType: 'REAL' | 'VIRTUAL';
  }): Promise<BrokerCredential> {
    const owner = await uid();
    const { data, error } = await supabase
      .from('broker_credentials')
      .insert({
        owner,
        account_id: c.accountId,
        broker: c.broker,
        app_key_enc: c.appKeyEnc,
        app_secret_enc: c.appSecretEnc,
        account_no_enc: c.accountNoEnc ?? null,
        extra: c.extra ?? {},
        account_type: c.accountType,
      })
      .select()
      .single();
    if (error) throw error;
    return toBrokerCredential(data as BrokerCredentialRow);
  },
  async update(id: string, patch: Partial<{
    appKeyEnc: string;
    appSecretEnc: string;
    accountNoEnc: string;
    extra: Record<string, string>;
    accountType: 'REAL' | 'VIRTUAL';
  }>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.appKeyEnc !== undefined) row.app_key_enc = patch.appKeyEnc;
    if (patch.appSecretEnc !== undefined) row.app_secret_enc = patch.appSecretEnc;
    if (patch.accountNoEnc !== undefined) row.account_no_enc = patch.accountNoEnc;
    if (patch.extra !== undefined) row.extra = patch.extra;
    if (patch.accountType !== undefined) row.account_type = patch.accountType;
    const { error } = await supabase.from('broker_credentials').update(row).eq('id', id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('broker_credentials').delete().eq('id', id);
    if (error) throw error;
  },
};

/* ───────── BrokerTokenCache (토큰 캐시) ───────── */

interface BrokerTokenCacheRow {
  id: string; owner: string; cred_id: string;
  access_token_enc: string; expires_at: string; created_at: string;
}

const toBrokerTokenCache = (r: BrokerTokenCacheRow): BrokerTokenCache => ({
  id: r.id, credId: r.cred_id,
  accessTokenEnc: r.access_token_enc,
  expiresAt: r.expires_at, createdAt: r.created_at,
});

export const brokerTokenCacheRepo = {
  async get(credId: string): Promise<BrokerTokenCache | null> {
    if (useLocalRepo()) return null;
    const { data, error } = await supabase
      .from('broker_token_cache').select('*').eq('cred_id', credId).maybeSingle();
    if (error) throw error;
    return data ? toBrokerTokenCache(data as BrokerTokenCacheRow) : null;
  },
  async remove(credId: string): Promise<void> {
    const { error } = await supabase
      .from('broker_token_cache').delete().eq('cred_id', credId);
    if (error) throw error;
  },
};
