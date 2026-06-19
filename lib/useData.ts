// lib/useData.ts
// 데이터 공급 훅 — repo를 호출해 계좌/거래/검토를 로드하고
// 추가·수정·삭제 후 로컬 상태를 갱신한다. 컴포넌트는 이 훅만 쓴다.
//
// 낙관적 갱신은 하지 않고, 변경 후 최신 목록을 다시 받아 단순/안전하게 유지한다.
// (개인용 규모에서는 충분. 대량 데이터면 낙관적 갱신으로 최적화 가능)

'use client';

import { useCallback, useEffect, useState } from 'react';
import { accountsRepo, tradesRepo, checksRepo } from './repo';
import type { Account, Trade, InvestCheck } from '../data/types';

export interface UseData {
  loading: boolean;
  error: string | null;
  accounts: Account[];
  trades: Trade[];
  checks: InvestCheck[];
  reload: () => Promise<void>;

  addAccount: (a: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (id: string, patch: Partial<Account>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;

  addTrade: (t: Omit<Trade, 'id'>) => Promise<void>;
  addTrades: (list: Omit<Trade, 'id'>[]) => Promise<void>;
  updateTrade: (id: string, patch: Partial<Trade>) => Promise<void>;
  removeTrade: (id: string) => Promise<void>;

  addCheck: (c: Omit<InvestCheck, 'id' | 'createdAt'>) => Promise<void>;
  updateCheck: (id: string, patch: Partial<InvestCheck>) => Promise<void>;
  removeCheck: (id: string) => Promise<void>;
  linkCheckTrade: (checkId: string, tradeId: string) => Promise<void>;
}

export function useData(): UseData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [checks, setChecks] = useState<InvestCheck[]>([]);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [a, t, c] = await Promise.all([
        accountsRepo.list(),
        tradesRepo.list(),
        checksRepo.list(),
      ]);
      setAccounts(a);
      setTrades(t);
      setChecks(c);
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
    reload,

    addAccount: (a) => run(() => accountsRepo.add(a)),
    updateAccount: (id, patch) => run(() => accountsRepo.update(id, patch)),
    removeAccount: (id) => run(() => accountsRepo.remove(id)),

    addTrade: (t) => run(() => tradesRepo.add(t)),
    addTrades: (list) => run(() => tradesRepo.addMany(list)),
    updateTrade: (id, patch) => run(() => tradesRepo.update(id, patch)),
    removeTrade: (id) => run(() => tradesRepo.remove(id)),

    addCheck: (c) => run(() => checksRepo.add(c)),
    updateCheck: (id, patch) => run(() => checksRepo.update(id, patch)),
    removeCheck: (id) => run(() => checksRepo.remove(id)),
    linkCheckTrade: (checkId, tradeId) => run(() => checksRepo.linkTrade(checkId, tradeId)),
  };
}
