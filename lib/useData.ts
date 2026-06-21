// lib/useData.ts
// 데이터 공급 훅 — repo를 호출해 계좌/거래/검토를 로드하고
// 추가·수정·삭제 후 로컬 상태를 갱신한다. 컴포넌트는 이 훅만 쓴다.
//
// 낙관적 갱신은 하지 않고, 변경 후 최신 목록을 다시 받아 단순/안전하게 유지한다.
// (개인용 규모에서는 충분. 대량 데이터면 낙관적 갱신으로 최적화 가능)

'use client';

import { useCallback, useEffect, useState } from 'react';
import { accountsRepo, tradesRepo, checksRepo, depositsRepo, taxLimitsRepo, holdingsRepo, realizedPnlRepo, analysisNotesRepo, snapshotsRepo, targetAllocationRepo, tickersRepo, priceCacheRepo, saveTrade, takeSnapshot } from './repo';
import type { Account, Trade, InvestCheck, AccountDeposit, TaxLimit, Holding, RealizedPnlRow, AnalysisNote, PortfolioSnapshot, TargetAllocation, Ticker, PriceCache } from '../data/types';

export interface UseData {
  loading: boolean;
  error: string | null;
  accounts: Account[];
  trades: Trade[];
  checks: InvestCheck[];
  deposits: AccountDeposit[];
  taxLimits: TaxLimit[];
  holdings: Holding[];
  realizedPnl: RealizedPnlRow[];
  analysisNotes: AnalysisNote[];
  snapshots: PortfolioSnapshot[];
  targetAllocation: TargetAllocation[];
  tickers: Ticker[];
  priceCache: PriceCache[];
  sectorMap: Record<string, string>;
  priceMap: Record<string, number>;
  reload: () => Promise<void>;

  addAccount: (a: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (id: string, patch: Partial<Account>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;

  /** saveTrade: 매수/매도 시 holdings+FIFO 연동. deposit/withdrawal은 기존 로직. */
  addTrade: (t: Omit<Trade, 'id'>) => Promise<void>;
  addTrades: (list: Omit<Trade, 'id'>[]) => Promise<void>;
  updateTrade: (id: string, patch: Partial<Trade>) => Promise<void>;
  removeTrade: (id: string) => Promise<void>;

  addCheck: (c: Omit<InvestCheck, 'id' | 'createdAt'>) => Promise<void>;
  updateCheck: (id: string, patch: Partial<InvestCheck>) => Promise<void>;
  removeCheck: (id: string) => Promise<void>;
  linkCheckTrade: (checkId: string, tradeId: string) => Promise<void>;

  addDeposit: (d: Omit<AccountDeposit, 'id' | 'createdAt'>) => Promise<void>;
  removeDeposit: (id: string) => Promise<void>;

  addAnalysisNote: (n: Omit<AnalysisNote, 'id' | 'createdAt'>) => Promise<void>;
  updateAnalysisNote: (id: string, patch: Partial<AnalysisNote>) => Promise<void>;
  removeAnalysisNote: (id: string) => Promise<void>;
  linkAnalysisTrade: (noteId: string, tradeId: string) => Promise<void>;

  takeSnapshot: () => Promise<void>;
  upsertTargetAlloc: (sector: string, targetPct: number) => Promise<void>;
  removeTargetAlloc: (id: string) => Promise<void>;
}

export function useData(): UseData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [checks, setChecks] = useState<InvestCheck[]>([]);
  const [deposits, setDeposits] = useState<AccountDeposit[]>([]);
  const [taxLimits, setTaxLimits] = useState<TaxLimit[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [realizedPnl, setRealizedPnl] = useState<RealizedPnlRow[]>([]);
  const [analysisNotes, setAnalysisNotes] = useState<AnalysisNote[]>([]);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [targetAllocation, setTargetAllocation] = useState<TargetAllocation[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [priceCache, setPriceCache] = useState<PriceCache[]>([]);
  const [sectorMap, setSectorMap] = useState<Record<string, string>>({});
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [a, t, c, d, tl, h, rp, an, sn, ta, tk, pc] = await Promise.all([
        accountsRepo.list(),
        tradesRepo.list(),
        checksRepo.list(),
        depositsRepo.list(),
        taxLimitsRepo.list(),
        holdingsRepo.list(),
        realizedPnlRepo.list(),
        analysisNotesRepo.list(),
        snapshotsRepo.list(),
        targetAllocationRepo.list(),
        tickersRepo.list(),
        priceCacheRepo.list(),
      ]);
      setAccounts(a);
      setTrades(t);
      setChecks(c);
      setDeposits(d);
      setTaxLimits(tl);
      setHoldings(h);
      setRealizedPnl(rp);
      setAnalysisNotes(an);
      setSnapshots(sn);
      setTargetAllocation(ta);
      setTickers(tk);
      setPriceCache(pc);
      // 섹터맵: ticker name/code → sector
      const sm: Record<string, string> = {};
      for (const x of tk) { if (x.sector) { sm[x.name] = x.sector; sm[x.code] = x.sector; } }
      setSectorMap(sm);
      // 가격맵: ticker code → price
      const pm: Record<string, number> = {};
      for (const x of pc) pm[x.tickerCode] = x.price;
      setPriceMap(pm);
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  // 에러를 잡아 표면화하고 목록을 새로고침하는 공통 래퍼
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setError(null);
      try {
        await fn();
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : '작업에 실패했습니다.');
        throw e;
      }
    },
    [reload],
  );

  return {
    loading,
    error,
    accounts,
    trades,
    checks,
    deposits,
    taxLimits,
    holdings,
    realizedPnl,
    analysisNotes,
    snapshots,
    targetAllocation,
    tickers,
    priceCache,
    sectorMap,
    priceMap,
    reload,

    addAccount: (a) => run(() => accountsRepo.add(a)),
    updateAccount: (id, patch) => run(() => accountsRepo.update(id, patch)),
    removeAccount: (id) => run(() => accountsRepo.remove(id)),

    addTrade: (t) => run(() => saveTrade(t)),
    addTrades: (list) => run(async () => {
      for (const t of list) await saveTrade(t);
    }),
    updateTrade: (id, patch) => run(() => tradesRepo.update(id, patch)),
    removeTrade: (id) => run(() => tradesRepo.remove(id)),

    addCheck: (c) => run(() => checksRepo.add(c)),
    updateCheck: (id, patch) => run(() => checksRepo.update(id, patch)),
    removeCheck: (id) => run(() => checksRepo.remove(id)),
    linkCheckTrade: (checkId, tradeId) => run(() => checksRepo.linkTrade(checkId, tradeId)),

    addDeposit: (d) => run(() => depositsRepo.add(d)),
    removeDeposit: (id) => run(() => depositsRepo.remove(id)),

    addAnalysisNote: (n) => run(() => analysisNotesRepo.add(n)),
    updateAnalysisNote: (id, patch) => run(() => analysisNotesRepo.update(id, patch)),
    removeAnalysisNote: (id) => run(() => analysisNotesRepo.remove(id)),
    linkAnalysisTrade: (noteId, tradeId) => run(() => analysisNotesRepo.linkTrade(noteId, tradeId)),

    takeSnapshot: () => run(() => takeSnapshot(holdings, accounts, priceMap)),
    upsertTargetAlloc: (sector, targetPct) => run(() => targetAllocationRepo.upsert(sector, targetPct)),
    removeTargetAlloc: (id) => run(() => targetAllocationRepo.remove(id)),
  };
}
