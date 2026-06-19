// lib/alerts.ts
// 대시보드 액션·알림 룰 엔진
// 리밸런싱 필요, 한도 임박, 미처리 거래 등을 감지해 알림 목록 반환.

import type {
  Account,
  Holding,
  Trade,
  AccountDeposit,
  TaxLimit,
  TargetAllocation,
} from '../data/types';
import { isAccumulation } from '../data/types';
import { computeSectorDistribution, type WeightItem } from './portfolio';

/* ────────── 타입 ────────── */

export type AlertLevel = 'info' | 'warning' | 'danger';
export type AlertAction = 'rebalance' | 'tax_limit' | 'unprocessed' | 'concentration';

export interface DashboardAlert {
  id: string;
  level: AlertLevel;
  action: AlertAction;
  title: string;
  detail: string;
  /** 클릭 시 이동할 탭 */
  targetTab?: string;
}

/* ────────── 룰 엔진 ────────── */

export function computeAlerts(params: {
  accounts: Account[];
  holdings: Holding[];
  trades: Trade[];
  deposits: AccountDeposit[];
  taxLimits: TaxLimit[];
  targetAllocation: TargetAllocation[];
  sectorMap: Record<string, string>;
  priceMap: Record<string, number>;
}): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  let nextId = 1;

  // 1. 리밸런싱 필요 (섹터 비중 > 목표 + 5%p)
  if (params.targetAllocation.length > 0) {
    const sectorDist = computeSectorDistribution(
      params.holdings, params.accounts, params.sectorMap,
    );
    const currentMap = new Map(sectorDist.map((d) => [d.label, d.pct]));

    for (const t of params.targetAllocation) {
      const currentPct = currentMap.get(t.sector) ?? 0;
      const diff = currentPct - t.targetPct;
      if (Math.abs(diff) >= 5) {
        alerts.push({
          id: `alert-${nextId++}`,
          level: Math.abs(diff) >= 10 ? 'danger' : 'warning',
          action: 'rebalance',
          title: `${t.sector} 비중 이탈`,
          detail: `현재 ${currentPct.toFixed(1)}% (목표 ${t.targetPct}%, ${diff > 0 ? '+' : ''}${diff.toFixed(1)}%p)`,
          targetTab: 'portfolio',
        });
      }
    }
  }

  // 2. ISA/연금/IRP 한도 임박 (>80%)
  const year = new Date().getFullYear();
  const accumAccounts = params.accounts.filter((a) => isAccumulation(a.type));

  for (const acc of accumAccounts) {
    // 올해 납입 합계
    const yearDeposits = params.deposits
      .filter((d) => d.accountId === acc.id && d.kind === 'deposit' && d.occurredAt.startsWith(String(year)))
      .reduce((s, d) => s + d.amount, 0);
    // 올해 deposit 거래 합계
    const yearDepositTrades = params.trades
      .filter((t) => t.accountId === acc.id && t.side === 'deposit' && t.executedAt.startsWith(String(year)))
      .reduce((s, t) => s + t.amount, 0);

    const totalContrib = yearDeposits + yearDepositTrades;

    // tax_limits에서 해당 계좌 타입의 올해 한도 찾기
    const limitType = acc.type === 'irp_dc' ? 'irp' : acc.type === 'pension' ? 'pension' : acc.type === 'isa' ? 'isa' : null;
    if (!limitType) continue;

    const limit = params.taxLimits.find((tl) => tl.accountType === limitType && tl.year === year);
    if (!limit?.annualLimit) continue;

    const usagePct = (totalContrib / limit.annualLimit) * 100;
    if (usagePct >= 80) {
      alerts.push({
        id: `alert-${nextId++}`,
        level: usagePct >= 95 ? 'danger' : 'warning',
        action: 'tax_limit',
        title: `${acc.name} 납입 한도 ${usagePct.toFixed(0)}%`,
        detail: `${totalContrib.toLocaleString('ko-KR')}원 / ${limit.annualLimit.toLocaleString('ko-KR')}원`,
        targetTab: 'history',
      });
    }
  }

  // 3. 집중도 과도 (상위 1종목 > 40%)
  if (params.holdings.length > 0) {
    const totalVal = params.holdings.reduce((s, h) => s + h.quantity * h.avgCost, 0)
      + params.accounts.reduce((s, a) => s + a.cashBalance, 0);
    if (totalVal > 0) {
      const symbolVal = new Map<string, number>();
      for (const h of params.holdings) {
        symbolVal.set(h.symbol, (symbolVal.get(h.symbol) ?? 0) + h.quantity * h.avgCost);
      }
      const sorted = [...symbolVal.entries()].sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        const top1Pct = (sorted[0][1] / totalVal) * 100;
        if (top1Pct > 40) {
          alerts.push({
            id: `alert-${nextId++}`,
            level: top1Pct > 60 ? 'danger' : 'warning',
            action: 'concentration',
            title: `${sorted[0][0]} 집중도 ${top1Pct.toFixed(1)}%`,
            detail: '단일 종목 비중이 40%를 초과합니다.',
            targetTab: 'portfolio',
          });
        }
      }
    }
  }

  return alerts;
}
