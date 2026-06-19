// lib/repo.ts
// 데이터 접근 계층 — Supabase 테이블 ↔ 앱 타입 매핑 + CRUD.
// 컴포넌트는 이 함수들만 호출하고 Supabase 세부사항을 모른다.
// (localStorage 훅 useTrades/useChecks를 대체)

import { isImplementationMode } from './devMode';
import { isSupabaseConfigured, supabase } from './supabase';
import type { Account, Trade, InvestCheck, ReviewNote, AccountType, Side, Source } from '../data/types';

const LOCAL_KEYS = {
  accounts: 'tja-dev-accounts',
  trades: 'tja-dev-trades',
  checks: 'tja-dev-checks',
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
}
interface TradeRow {
  id: string; owner: string; account_id: string; symbol: string; code: string | null;
  side: Side; price: number; quantity: number; amount: number; fee: number; tax: number;
  executed_at: string; broker: string | null; realized_pnl: number | null;
  return_rate: number | null; note: ReviewNote | null; source: Source;
  confidence: number | null; linked_check_id: string | null; tax_deductible: boolean;
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

/* ───────── 앱 타입 → 행 (insert/update payload) ───────── */
// owner는 RLS와 DB default(auth.uid()는 아니지만 명시 주입)로 채운다.

const fromTrade = (t: Omit<Trade, 'id'>, owner: string) => ({
  owner, account_id: t.accountId, symbol: t.symbol, code: t.code ?? null,
  side: t.side, price: t.price, quantity: t.quantity, amount: t.amount,
  fee: t.fee, tax: t.tax, executed_at: t.executedAt, broker: t.broker ?? null,
  realized_pnl: t.realizedPnl ?? null, return_rate: t.returnRate ?? null,
  note: t.note ?? null, source: t.source, confidence: t.confidence ?? null,
  linked_check_id: t.linkedCheckId ?? null, tax_deductible: t.taxDeductible ?? true,
});

const fromAccount = (a: Omit<Account, 'id'>, owner: string) => ({
  owner, name: a.name, type: a.type, broker: a.broker ?? null,
  opened_at: a.openedAt ?? null, note: a.note ?? null,
});

const fromCheck = (c: Omit<InvestCheck, 'id'>, owner: string) => ({
  owner, account_id: c.accountId, symbol: c.symbol, code: c.code ?? null,
  items: c.items, target_price: c.targetPrice ?? null, stop_loss: c.stopLoss ?? null,
  weight: c.weight ?? null, scenario: c.scenario ?? null, decision: c.decision ?? null,
  resulted_trade_id: c.resultedTradeId ?? null,
});

/* ───────── 현재 사용자 ───────── */

async function uid(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('로그인이 필요합니다.');
  return data.user.id;
}

/* ───────── Accounts ───────── */

export const accountsRepo = {
  async list(): Promise<Account[]> {
    if (useLocalRepo()) return readLocal<Account>(LOCAL_KEYS.accounts);
    const { data, error } = await supabase.from('accounts').select('*').order('created_at');
    if (error) throw error;
    return (data as AccountRow[]).map(toAccount);
  },
  async add(a: Omit<Account, 'id'>): Promise<Account> {
    if (useLocalRepo()) {
      const rows = readLocal<Account>(LOCAL_KEYS.accounts);
      const created = { ...a, id: localId() };
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
        .sort((a, b) => b.executedAt.localeCompare(a.executedAt));
    }
    const { data, error } = await supabase
      .from('trades').select('*').order('executed_at', { ascending: false });
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
      returnRate: 'return_rate', linkedCheckId: 'linked_check_id', taxDeductible: 'tax_deductible',
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
