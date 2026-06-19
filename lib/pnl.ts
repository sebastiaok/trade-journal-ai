// lib/pnl.ts
// 손익 계산(FIFO 매칭) + 복기 통계 + 계좌별 수익률
//
// 주의: 매매 지시를 하지 않는다. 과거 거래의 사실 집계만 수행한다.
// deposit/withdrawal(납입·인출)은 매매 손익 매칭 대상이 아니며,
// 적립형 계좌의 현금흐름 기반 수익률 계산에만 사용한다.

import type { Trade } from '../data/types';

/* ────────────────────────────────────────────────────────────
 * 1. 실현손익 계산 (매도 FIFO 매칭) — buy/sell만 대상
 * ──────────────────────────────────────────────────────────── */

interface Lot {
  qty: number;
  price: number;
  feePerShare: number;
  date: string;
}

export interface RealizedResult {
  trades: Trade[];
  matches: {
    sellId: string;
    symbol: string;
    qty: number;
    buyDate: string;
    sellDate: string;
    holdingDays: number;
    pnl: number;
  }[];
}

const num = (v: number | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0);
const byTime = (a: Trade, b: Trade) =>
  new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime();
const isTrade = (t: Trade) => t.side === 'buy' || t.side === 'sell';

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function computeRealized(input: Trade[]): RealizedResult {
  const sorted = [...input].sort(byTime);
  const lotsBySymbol = new Map<string, Lot[]>();
  const out = new Map<string, Trade>();
  const matches: RealizedResult['matches'] = [];

  for (const t of sorted) {
    out.set(t.id, { ...t });

    // 납입/인출은 매매 매칭에서 제외
    if (!isTrade(t)) continue;

    if (t.side === 'buy') {
      const lots = lotsBySymbol.get(t.symbol) ?? [];
      const feePerShare = t.quantity > 0 ? num(t.fee) / t.quantity : 0;
      lots.push({ qty: t.quantity, price: t.price, feePerShare, date: t.executedAt });
      lotsBySymbol.set(t.symbol, lots);
      continue;
    }

    // sell: FIFO 매칭
    const lots = lotsBySymbol.get(t.symbol) ?? [];
    let remaining = t.quantity;
    let matchedCost = 0;
    let matchedQty = 0;
    let earliestBuyDate = t.executedAt;

    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(remaining, lot.qty);
      matchedCost += take * lot.price + take * lot.feePerShare;
      matchedQty += take;
      if (new Date(lot.date) < new Date(earliestBuyDate)) earliestBuyDate = lot.date;
      lot.qty -= take;
      remaining -= take;
      if (lot.qty === 0) lots.shift();
    }
    lotsBySymbol.set(t.symbol, lots);

    const proceeds = t.price * matchedQty - num(t.fee) - num(t.tax);
    const pnl = proceeds - matchedCost;
    const ret = matchedCost > 0 ? (pnl / matchedCost) * 100 : 0;

    const rec = out.get(t.id)!;
    rec.realizedPnl = round2(pnl);
    rec.returnRate = round2(ret);

    if (matchedQty > 0) {
      matches.push({
        sellId: t.id,
        symbol: t.symbol,
        qty: matchedQty,
        buyDate: earliestBuyDate,
        sellDate: t.executedAt,
        holdingDays: daysBetween(earliestBuyDate, t.executedAt),
        pnl: round2(pnl),
      });
    }
  }

  return { trades: [...out.values()].sort(byTime), matches };
}

/* ────────────────────────────────────────────────────────────
 * 2. 종목별 현재 포지션
 * ──────────────────────────────────────────────────────────── */

export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
}

export function positionBySymbol(input: Trade[]): Record<string, Position> {
  const sorted = [...input].sort(byTime);
  const lotsBySymbol = new Map<string, Lot[]>();

  for (const t of sorted) {
    if (!isTrade(t)) continue;
    const lots = lotsBySymbol.get(t.symbol) ?? [];
    if (t.side === 'buy') {
      const feePerShare = t.quantity > 0 ? num(t.fee) / t.quantity : 0;
      lots.push({ qty: t.quantity, price: t.price, feePerShare, date: t.executedAt });
    } else {
      let remaining = t.quantity;
      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(remaining, lot.qty);
        lot.qty -= take;
        remaining -= take;
        if (lot.qty === 0) lots.shift();
      }
    }
    lotsBySymbol.set(t.symbol, lots);
  }

  const result: Record<string, Position> = {};
  for (const [symbol, lots] of lotsBySymbol) {
    const qty = lots.reduce((s, l) => s + l.qty, 0);
    if (qty <= 0) continue;
    const cost = lots.reduce((s, l) => s + l.qty * l.price, 0);
    result[symbol] = { symbol, quantity: qty, avgPrice: round2(cost / qty) };
  }
  return result;
}

/* ────────────────────────────────────────────────────────────
 * 3. 복기 통계 (매매형 계좌: general)
 * ──────────────────────────────────────────────────────────── */

export interface Stats {
  closedCount: number;
  winRate: number;
  profitFactor: number;
  avgHoldingDays: number;
  mdd: number;
  cumulativePnl: number;
  equityCurve: { date: string; cum: number }[];
}

export function computeStats(input: Trade[]): Stats {
  const { matches } = computeRealized(input);

  if (matches.length === 0) {
    return {
      closedCount: 0, winRate: 0, profitFactor: 0,
      avgHoldingDays: 0, mdd: 0, cumulativePnl: 0, equityCurve: [],
    };
  }

  const wins = matches.filter((m) => m.pnl > 0);
  const losses = matches.filter((m) => m.pnl < 0);
  const grossProfit = wins.reduce((s, m) => s + m.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, m) => s + m.pnl, 0));

  const ordered = [...matches].sort(
    (a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime(),
  );
  let cum = 0, peak = 0, mdd = 0;
  const equityCurve: { date: string; cum: number }[] = [];
  for (const m of ordered) {
    cum = round2(cum + m.pnl);
    peak = Math.max(peak, cum);
    mdd = Math.min(mdd, cum - peak);
    equityCurve.push({ date: m.sellDate.slice(0, 10), cum });
  }

  const avgHoldingDays =
    matches.reduce((s, m) => s + m.holdingDays, 0) / matches.length;

  return {
    closedCount: matches.length,
    winRate: round2((wins.length / matches.length) * 100),
    profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : grossProfit > 0 ? Infinity : 0,
    avgHoldingDays: round2(avgHoldingDays),
    mdd: round2(mdd),
    cumulativePnl: round2(cum),
    equityCurve,
  };
}

/* ────────────────────────────────────────────────────────────
 * 4. 적립형 계좌 수익률 (isa/pension/irp)
 *    한도·세제는 다루지 않고 "수익률"만 계산한다.
 *
 *    currentValue(현재 평가액)는 사용자가 입력(또는 가격 연동)한다.
 *    - 단순 수익률 = (평가액 + 누적인출 − 누적납입) / 누적납입
 *    - 연환산(CAGR) = (평가액 / 순납입)^(1/연수) − 1  (순납입>0, 연수>0)
 * ──────────────────────────────────────────────────────────── */

export interface AccumReturn {
  totalDeposit: number;     // 누적 납입
  totalWithdrawal: number;  // 누적 인출
  netInvested: number;      // 순납입 (납입 − 인출)
  currentValue: number;     // 현재 평가액 (입력값)
  profit: number;           // 평가손익
  returnRate: number;       // 단순 수익률 (%)
  cagr: number | null;      // 연환산 수익률 (%) — 산출 불가 시 null
  firstDepositAt: string | null;
}

export function computeAccumReturn(input: Trade[], currentValue: number): AccumReturn {
  const deposits = input.filter((t) => t.side === 'deposit');
  const withdrawals = input.filter((t) => t.side === 'withdrawal');

  const totalDeposit = deposits.reduce((s, t) => s + num(t.amount), 0);
  const totalWithdrawal = withdrawals.reduce((s, t) => s + num(t.amount), 0);
  const netInvested = totalDeposit - totalWithdrawal;

  const profit = round2(currentValue + totalWithdrawal - totalDeposit);
  const returnRate = totalDeposit > 0 ? round2((profit / totalDeposit) * 100) : 0;

  // CAGR: 첫 납입일 ~ 오늘 기준 연수
  const sortedDep = [...deposits].sort(byTime);
  const firstDepositAt = sortedDep.length ? sortedDep[0].executedAt : null;
  let cagr: number | null = null;
  if (firstDepositAt && netInvested > 0 && currentValue > 0) {
    const years = daysBetween(firstDepositAt, new Date().toISOString()) / 365;
    if (years >= 0.1) {
      cagr = round2((Math.pow(currentValue / netInvested, 1 / years) - 1) * 100);
    }
  }

  return {
    totalDeposit: round2(totalDeposit),
    totalWithdrawal: round2(totalWithdrawal),
    netInvested: round2(netInvested),
    currentValue: round2(currentValue),
    profit,
    returnRate,
    cagr,
    firstDepositAt,
  };
}

/* ────────────────────────────────────────────────────────────
 * 5. 기간별 / 종목별 집계 (복기·통계 탭)
 *    복기/통계 탭 기본 보기는 기간별(월·분기·연도). 종목별 필터 병행.
 * ──────────────────────────────────────────────────────────── */

export type PeriodGranularity = 'month' | 'quarter' | 'year';

/** 청산(매도 매칭) 1건을 기간 키로 매핑 */
function periodKey(dateISO: string, g: PeriodGranularity): string {
  const d = new Date(dateISO);
  const y = d.getFullYear();
  if (g === 'year') return `${y}`;
  if (g === 'quarter') return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`; // month
}

export interface GroupStat {
  key: string;          // 기간 키 또는 종목명
  closedCount: number;
  winRate: number;
  realizedPnl: number;
  profitFactor: number;
  avgHoldingDays: number;
}

function summarize(
  key: string,
  ms: RealizedResult['matches'],
): GroupStat {
  const wins = ms.filter((m) => m.pnl > 0);
  const grossProfit = wins.reduce((s, m) => s + m.pnl, 0);
  const grossLoss = Math.abs(ms.filter((m) => m.pnl < 0).reduce((s, m) => s + m.pnl, 0));
  return {
    key,
    closedCount: ms.length,
    winRate: ms.length ? round2((wins.length / ms.length) * 100) : 0,
    realizedPnl: round2(ms.reduce((s, m) => s + m.pnl, 0)),
    profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : grossProfit > 0 ? Infinity : 0,
    avgHoldingDays: ms.length ? round2(ms.reduce((s, m) => s + m.holdingDays, 0) / ms.length) : 0,
  };
}

/** 기간별 통계 (기본 보기). symbol 지정 시 해당 종목만. */
export function statsByPeriod(
  input: Trade[],
  granularity: PeriodGranularity = 'month',
  symbol?: string,
): GroupStat[] {
  const { matches } = computeRealized(input);
  const filtered = symbol ? matches.filter((m) => m.symbol === symbol) : matches;

  const buckets = new Map<string, RealizedResult['matches']>();
  for (const m of filtered) {
    const k = periodKey(m.sellDate, granularity);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(m);
  }
  return [...buckets.entries()]
    .map(([k, ms]) => summarize(k, ms))
    .sort((a, b) => b.key.localeCompare(a.key)); // 최신 기간 먼저
}

/** 종목별 통계. period(예: '2026-03' / '2026-Q1' / '2026') 지정 시 해당 기간만. */
export function statsBySymbol(
  input: Trade[],
  period?: string,
  granularity: PeriodGranularity = 'month',
): GroupStat[] {
  const { matches } = computeRealized(input);
  const filtered = period
    ? matches.filter((m) => periodKey(m.sellDate, granularity) === period)
    : matches;

  const buckets = new Map<string, RealizedResult['matches']>();
  for (const m of filtered) {
    (buckets.get(m.symbol) ?? buckets.set(m.symbol, []).get(m.symbol)!).push(m);
  }
  return [...buckets.entries()]
    .map(([k, ms]) => summarize(k, ms))
    .sort((a, b) => b.realizedPnl - a.realizedPnl); // 손익 큰 순
}

/* ────────────────────────────────────────────────────────────
 * 유틸
 * ──────────────────────────────────────────────────────────── */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
