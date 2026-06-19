// lib/dashboard.ts
// 대시보드 집계 로직 — 총자산·핵심 지표·계좌별 현황
// 순수 계산 함수. side-effect 없음.

import type {
  Account,
  Holding,
  RealizedPnlRow,
  PriceCache,
} from '../data/types';

/* ────────── 타입 ────────── */

/** 총자산 헤더 */
export interface AssetHeader {
  totalAsset: number;       // 총자산 (평가금액 + 현금)
  totalCost: number;        // 매입원가 합계
  totalCash: number;        // 예수금 합계
  evalPnl: number;          // 평가손익 (금액)
  evalPnlPct: number;       // 평가손익 (%)
  priceAsOf: string | null; // 시세 기준 시각 (가장 오래된 fetched_at, null이면 캐시 없음)
}

/** 핵심 지표 카드 */
export interface KeyMetrics {
  ytdRealizedPnl: number;   // 올해 실현손익
  evalPnl: number;          // 평가손익
  holdingCount: number;     // 보유 종목 수
  cashRatioPct: number;     // 현금 비중 (%)
}

/** 계좌별 현황 행 */
export interface AccountStatus {
  accountId: string;
  accountName: string;
  accountType: string;
  evalAmount: number;       // 평가금액 (보유 + 현금)
  costAmount: number;       // 매입원가
  cashBalance: number;
  returnPct: number;        // 수익률 (%)
  holdingCount: number;
}

/* ────────── 시세 적용 유틸 ────────── */

/**
 * 종목의 현재 평가가격을 반환.
 * priceMap에 ticker code가 있으면 시세, 없으면 avgCost fallback.
 */
function evalPrice(
  holding: Holding,
  priceMap: Record<string, number>,
): number {
  if (holding.code && priceMap[holding.code] != null) {
    return priceMap[holding.code];
  }
  return holding.avgCost; // fallback: 취득원가
}

/* ────────── 1. 총자산 헤더 ────────── */

export function computeAssetHeader(
  holdings: Holding[],
  accounts: Account[],
  priceMap: Record<string, number>,
  priceCache: PriceCache[],
): AssetHeader {
  let totalEval = 0;
  let totalCost = 0;

  for (const h of holdings) {
    const ep = evalPrice(h, priceMap);
    totalEval += h.quantity * ep;
    totalCost += h.quantity * h.avgCost;
  }

  const totalCash = accounts.reduce((s, a) => s + a.cashBalance, 0);
  const totalAsset = totalEval + totalCash;
  const evalPnl = totalEval - totalCost;
  const evalPnlPct = totalCost > 0 ? round2((evalPnl / totalCost) * 100) : 0;

  // 가장 오래된 시세 기준 시각 (캐시 있을 때만)
  let priceAsOf: string | null = null;
  if (priceCache.length > 0) {
    const oldest = priceCache.reduce((min, p) =>
      p.fetchedAt < min ? p.fetchedAt : min, priceCache[0].fetchedAt);
    priceAsOf = oldest;
  }

  return { totalAsset, totalCost, totalCash, evalPnl, evalPnlPct, priceAsOf };
}

/* ────────── 2. 핵심 지표 ────────── */

export function computeKeyMetrics(
  holdings: Holding[],
  accounts: Account[],
  realizedPnl: RealizedPnlRow[],
  priceMap: Record<string, number>,
): KeyMetrics {
  const year = new Date().getFullYear();
  const ytdRealizedPnl = realizedPnl
    .filter((r) => r.realizedAt.startsWith(String(year)))
    .reduce((s, r) => s + r.pnlAmount, 0);

  let totalEval = 0;
  let totalCost = 0;
  for (const h of holdings) {
    totalEval += h.quantity * evalPrice(h, priceMap);
    totalCost += h.quantity * h.avgCost;
  }
  const evalPnl = totalEval - totalCost;

  // 보유 종목 수 (고유 symbol)
  const symbols = new Set(holdings.map((h) => h.symbol));
  const holdingCount = symbols.size;

  const totalCash = accounts.reduce((s, a) => s + a.cashBalance, 0);
  const totalAsset = totalEval + totalCash;
  const cashRatioPct = totalAsset > 0 ? round2((totalCash / totalAsset) * 100) : 0;

  return { ytdRealizedPnl, evalPnl, holdingCount, cashRatioPct };
}

/* ────────── 3. 계좌별 현황 ────────── */

export function computeAccountStatuses(
  holdings: Holding[],
  accounts: Account[],
  priceMap: Record<string, number>,
): AccountStatus[] {
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  const byAccount = new Map<string, { eval: number; cost: number; symbols: Set<string> }>();

  for (const h of holdings) {
    const ep = evalPrice(h, priceMap);
    const entry = byAccount.get(h.accountId) ?? { eval: 0, cost: 0, symbols: new Set() };
    entry.eval += h.quantity * ep;
    entry.cost += h.quantity * h.avgCost;
    entry.symbols.add(h.symbol);
    byAccount.set(h.accountId, entry);
  }

  return accounts.map((a) => {
    const entry = byAccount.get(a.id) ?? { eval: 0, cost: 0, symbols: new Set() };
    const evalAmount = entry.eval + a.cashBalance;
    const costAmount = entry.cost + a.cashBalance;
    const returnPct = entry.cost > 0 ? round2(((entry.eval - entry.cost) / entry.cost) * 100) : 0;
    return {
      accountId: a.id,
      accountName: a.name,
      accountType: a.type,
      evalAmount,
      costAmount,
      cashBalance: a.cashBalance,
      returnPct,
      holdingCount: entry.symbols.size,
    };
  });
}

/* ────────── 유틸 ────────── */

function round2(n: number): number { return Math.round(n * 100) / 100; }
