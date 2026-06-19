// lib/portfolio.ts
// 포트폴리오 진단 로직 — 배분·리스크·리밸런싱 제안
// 순수 계산 함수만 포함 (side-effect 없음). UI 컴포넌트에서 호출.

import type {
  Holding,
  Account,
  PortfolioSnapshot,
  TargetAllocation,
} from '../data/types';

/* ────────── 공용 타입 ────────── */

/** 비중 항목 (종목/섹터/계좌 공통) */
export interface WeightItem {
  label: string;
  value: number;   // 평가액 (원)
  pct: number;     // 비중 (0~100)
}

/** 집중도 지표 */
export interface Concentration {
  top1Pct: number;
  top3Pct: number;
  hhi: number;         // 허핀달 지수 (0~10000)
  level: 'low' | 'moderate' | 'high';
}

/** 리밸런싱 제안 1건 */
export interface RebalanceProposal {
  sector: string;
  currentPct: number;
  targetPct: number;
  diffPp: number;       // %p 차이 (양수=초과, 음수=미달)
  adjustAmount: number;  // 조정 금액 (양수=매도, 음수=매수 필요)
  action: 'sell' | 'buy';
  symbols: string[];     // 해당 섹터 보유 종목 (비중 순)
}

/** MDD 결과 */
export interface MddResult {
  mdd: number;            // 0~1 (비율)
  mddPct: number;         // 0~100
  peakDate?: string;
  troughDate?: string;
}

/** 스냅샷 추이 차트용 데이터포인트 */
export interface TrendPoint {
  date: string;
  totalValue: number;
  totalCost: number;
  cash: number;
  returnPct: number;      // 누적 수익률 (%)
}

/* ────────── 1. 배분 진단 ────────── */

/**
 * 종목별 비중 계산 (현금 포함).
 * value = quantity × avgCost (시세 미연동 시 취득원가 기준).
 */
export function computeTickerDistribution(
  holdings: Holding[],
  accounts: Account[],
): WeightItem[] {
  const cash = accounts.reduce((s, a) => s + a.cashBalance, 0);
  const items: WeightItem[] = [];

  // 종목별 합산 (계좌 구분 없이)
  const map = new Map<string, number>();
  for (const h of holdings) {
    const val = h.quantity * h.avgCost;
    map.set(h.symbol, (map.get(h.symbol) ?? 0) + val);
  }
  for (const [symbol, value] of map) {
    items.push({ label: symbol, value, pct: 0 });
  }
  if (cash > 0) items.push({ label: '현금', value: cash, pct: 0 });

  const total = items.reduce((s, i) => s + i.value, 0);
  if (total > 0) {
    for (const item of items) item.pct = (item.value / total) * 100;
  }
  return items.sort((a, b) => b.pct - a.pct);
}

/**
 * 계좌별 비중 계산.
 */
export function computeAccountDistribution(
  holdings: Holding[],
  accounts: Account[],
): WeightItem[] {
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  const valMap = new Map<string, number>();

  for (const h of holdings) {
    const val = h.quantity * h.avgCost;
    valMap.set(h.accountId, (valMap.get(h.accountId) ?? 0) + val);
  }
  // 예수금 합산
  for (const a of accounts) {
    if (a.cashBalance > 0) {
      valMap.set(a.id, (valMap.get(a.id) ?? 0) + a.cashBalance);
    }
  }

  const items: WeightItem[] = [];
  for (const [accId, value] of valMap) {
    const acc = accMap.get(accId);
    items.push({ label: acc?.name ?? accId, value, pct: 0 });
  }

  const total = items.reduce((s, i) => s + i.value, 0);
  if (total > 0) {
    for (const item of items) item.pct = (item.value / total) * 100;
  }
  return items.sort((a, b) => b.pct - a.pct);
}

/**
 * 섹터별 비중 계산.
 * sectorMap: symbol → sector 매핑 (없으면 '기타').
 */
export function computeSectorDistribution(
  holdings: Holding[],
  accounts: Account[],
  sectorMap: Record<string, string>,
): WeightItem[] {
  const cash = accounts.reduce((s, a) => s + a.cashBalance, 0);
  const secVal = new Map<string, number>();

  for (const h of holdings) {
    const sector = sectorMap[h.symbol] ?? '기타';
    const val = h.quantity * h.avgCost;
    secVal.set(sector, (secVal.get(sector) ?? 0) + val);
  }
  if (cash > 0) secVal.set('현금', (secVal.get('현금') ?? 0) + cash);

  const items: WeightItem[] = [];
  for (const [sector, value] of secVal) {
    items.push({ label: sector, value, pct: 0 });
  }

  const total = items.reduce((s, i) => s + i.value, 0);
  if (total > 0) {
    for (const item of items) item.pct = (item.value / total) * 100;
  }
  return items.sort((a, b) => b.pct - a.pct);
}

/* ────────── 2. 리스크 지표 ────────── */

/**
 * 집중도 계산 (상위 1·3 비중 + HHI).
 * items는 비중 내림차순 정렬 전제.
 */
export function computeConcentration(items: WeightItem[]): Concentration {
  const sorted = [...items].sort((a, b) => b.pct - a.pct);
  const top1Pct = sorted[0]?.pct ?? 0;
  const top3Pct = sorted.slice(0, 3).reduce((s, i) => s + i.pct, 0);
  // HHI: 각 비중(%)을 100분율 그대로 제곱 후 합산 (최대 10000)
  const hhi = Math.round(sorted.reduce((s, i) => s + i.pct * i.pct, 0));

  let level: Concentration['level'] = 'low';
  if (hhi > 2500) level = 'high';
  else if (hhi > 1500) level = 'moderate';

  return { top1Pct: round2(top1Pct), top3Pct: round2(top3Pct), hhi, level };
}

/**
 * 평가수익률 (단순 — 현재가치 vs 취득원가).
 * 시세 미연동 시 holdings.avgCost 기준이므로 0%.
 */
export function computeReturnRate(
  holdings: Holding[],
  accounts: Account[],
): number {
  const totalCost = holdings.reduce((s, h) => s + h.quantity * h.avgCost, 0);
  const totalValue = holdings.reduce((s, h) => s + h.quantity * h.avgCost, 0); // 시세 없으면 동일
  const cash = accounts.reduce((s, a) => s + a.cashBalance, 0);
  if (totalCost + cash === 0) return 0;
  return round2(((totalValue + cash) / (totalCost + cash) - 1) * 100);
}

/**
 * MDD (최대 낙폭) — 스냅샷 시계열 기반.
 */
export function computeMDD(snapshots: PortfolioSnapshot[]): MddResult {
  if (snapshots.length < 2) return { mdd: 0, mddPct: 0 };

  const sorted = [...snapshots].sort(
    (a, b) => a.snapshotDate.localeCompare(b.snapshotDate),
  );

  let peak = sorted[0].totalValue + sorted[0].cash;
  let peakDate = sorted[0].snapshotDate;
  let mdd = 0;
  let mddPeakDate = peakDate;
  let mddTroughDate = peakDate;

  for (const s of sorted) {
    const val = s.totalValue + s.cash;
    if (val > peak) {
      peak = val;
      peakDate = s.snapshotDate;
    }
    const drawdown = peak > 0 ? (peak - val) / peak : 0;
    if (drawdown > mdd) {
      mdd = drawdown;
      mddPeakDate = peakDate;
      mddTroughDate = s.snapshotDate;
    }
  }

  return {
    mdd: round4(mdd),
    mddPct: round2(mdd * 100),
    peakDate: mddPeakDate,
    troughDate: mddTroughDate,
  };
}

/* ────────── 3. 목표 대비 & 리밸런싱 제안 ────────── */

/**
 * 목표 배분 vs 현재 비중 비교 → 리밸런싱 제안.
 * threshold: 이탈 임계치 (%p). 기본 5.
 */
export function computeRebalanceProposals(
  sectorDist: WeightItem[],
  targets: TargetAllocation[],
  totalValue: number,
  threshold = 5,
  holdingsBySector?: Map<string, string[]>,
): RebalanceProposal[] {
  const currentMap = new Map(sectorDist.map((d) => [d.label, d.pct]));
  const proposals: RebalanceProposal[] = [];

  for (const t of targets) {
    const currentPct = currentMap.get(t.sector) ?? 0;
    const diffPp = round2(currentPct - t.targetPct);
    if (Math.abs(diffPp) < threshold) continue;

    const adjustAmount = Math.round((diffPp / 100) * totalValue);
    proposals.push({
      sector: t.sector,
      currentPct: round2(currentPct),
      targetPct: t.targetPct,
      diffPp,
      adjustAmount: Math.abs(adjustAmount),
      action: diffPp > 0 ? 'sell' : 'buy',
      symbols: holdingsBySector?.get(t.sector) ?? [],
    });
  }

  // 목표에 없는 섹터 중 비중이 큰 것도 표시
  for (const d of sectorDist) {
    if (d.label === '현금') continue;
    if (targets.some((t) => t.sector === d.label)) continue;
    if (d.pct >= threshold) {
      proposals.push({
        sector: d.label,
        currentPct: d.pct,
        targetPct: 0,
        diffPp: d.pct,
        adjustAmount: Math.round((d.pct / 100) * totalValue),
        action: 'sell',
        symbols: holdingsBySector?.get(d.label) ?? [],
      });
    }
  }

  return proposals.sort((a, b) => Math.abs(b.diffPp) - Math.abs(a.diffPp));
}

/* ────────── 4. 스냅샷 추이 ────────── */

/**
 * 스냅샷 → 차트용 추이 데이터.
 */
export function formatSnapshotTrend(
  snapshots: PortfolioSnapshot[],
): TrendPoint[] {
  if (snapshots.length === 0) return [];

  const sorted = [...snapshots].sort(
    (a, b) => a.snapshotDate.localeCompare(b.snapshotDate),
  );
  const baseValue = sorted[0].totalValue + sorted[0].cash;

  return sorted.map((s) => ({
    date: s.snapshotDate,
    totalValue: s.totalValue,
    totalCost: s.totalCost,
    cash: s.cash,
    returnPct: baseValue > 0
      ? round2(((s.totalValue + s.cash) / baseValue - 1) * 100)
      : 0,
  }));
}

/* ────────── 5. 종합 요약 ────────── */

export interface PortfolioSummary {
  totalValue: number;       // 총 평가액 (보유+현금)
  totalCost: number;        // 총 취득원가
  cash: number;
  returnPct: number;        // 평가 수익률 (%)
  mdd: MddResult;
  concentration: Concentration;
  offTargetCount: number;   // 임계치 이탈 섹터 수
}

export function computeSummary(
  holdings: Holding[],
  accounts: Account[],
  snapshots: PortfolioSnapshot[],
  targets: TargetAllocation[],
  sectorMap: Record<string, string>,
): PortfolioSummary {
  const totalCost = holdings.reduce((s, h) => s + h.quantity * h.avgCost, 0);
  const totalValue = totalCost; // 시세 미연동 — 취득원가 = 평가액
  const cash = accounts.reduce((s, a) => s + a.cashBalance, 0);

  const tickerDist = computeTickerDistribution(holdings, accounts);
  const sectorDist = computeSectorDistribution(holdings, accounts, sectorMap);
  const concentration = computeConcentration(tickerDist);
  const mdd = computeMDD(snapshots);
  const proposals = computeRebalanceProposals(sectorDist, targets, totalValue + cash);

  return {
    totalValue: totalValue + cash,
    totalCost,
    cash,
    returnPct: computeReturnRate(holdings, accounts),
    mdd,
    concentration,
    offTargetCount: proposals.length,
  };
}

/* ────────── 유틸 ────────── */

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
