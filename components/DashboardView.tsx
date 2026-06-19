// components/DashboardView.tsx
// 대시보드 탭 — 총자산·핵심 지표·자산 배분·계좌별 현황·액션 알림

'use client';

import { useMemo } from 'react';
import type {
  Account,
  Holding,
  RealizedPnlRow,
  Trade,
  AccountDeposit,
  TaxLimit,
  TargetAllocation,
  PriceCache,
} from '../data/types';
import {
  computeAssetHeader,
  computeKeyMetrics,
  computeAccountStatuses,
  type AccountStatus,
} from '../lib/dashboard';
import {
  computeTickerDistribution,
  computeSectorDistribution,
  computeAccountDistribution,
  type WeightItem,
} from '../lib/portfolio';
import { computeAlerts, type DashboardAlert } from '../lib/alerts';
import { useState } from 'react';

type DistView = 'ticker' | 'sector' | 'account';

interface Props {
  accounts: Account[];
  holdings: Holding[];
  realizedPnl: RealizedPnlRow[];
  trades: Trade[];
  deposits: AccountDeposit[];
  taxLimits: TaxLimit[];
  targetAllocation: TargetAllocation[];
  priceCache: PriceCache[];
  sectorMap: Record<string, string>;
  priceMap: Record<string, number>;
  onNavigate: (tab: string) => void;
}

export default function DashboardView({
  accounts,
  holdings,
  realizedPnl,
  trades,
  deposits,
  taxLimits,
  targetAllocation,
  priceCache,
  sectorMap,
  priceMap,
  onNavigate,
}: Props) {
  const [distView, setDistView] = useState<DistView>('ticker');

  // 총자산 헤더
  const header = useMemo(
    () => computeAssetHeader(holdings, accounts, priceMap, priceCache),
    [holdings, accounts, priceMap, priceCache],
  );

  // 핵심 지표
  const metrics = useMemo(
    () => computeKeyMetrics(holdings, accounts, realizedPnl, priceMap),
    [holdings, accounts, realizedPnl, priceMap],
  );

  // 배분 데이터
  const tickerDist = useMemo(
    () => computeTickerDistribution(holdings, accounts),
    [holdings, accounts],
  );
  const sectorDist = useMemo(
    () => computeSectorDistribution(holdings, accounts, sectorMap),
    [holdings, accounts, sectorMap],
  );
  const accountDist = useMemo(
    () => computeAccountDistribution(holdings, accounts),
    [holdings, accounts],
  );
  const currentDist = distView === 'ticker' ? tickerDist
    : distView === 'sector' ? sectorDist : accountDist;

  // 계좌별 현황
  const accountStatuses = useMemo(
    () => computeAccountStatuses(holdings, accounts, priceMap),
    [holdings, accounts, priceMap],
  );

  // 알림
  const alerts = useMemo(
    () => computeAlerts({
      accounts, holdings, trades, deposits, taxLimits,
      targetAllocation, sectorMap, priceMap,
    }),
    [accounts, holdings, trades, deposits, taxLimits, targetAllocation, sectorMap, priceMap],
  );

  const won = (n: number) => n.toLocaleString('ko-KR') + '원';
  const hasPriceData = priceCache.length > 0;

  return (
    <div className="db-view">
      {/* ── 1. 총자산 헤더 ── */}
      <section className="db-header">
        <div className="db-header-main">
          <span className="db-header-label">총자산</span>
          <span className="db-total-value">{won(header.totalAsset)}</span>
        </div>
        <div className="db-header-sub">
          <span>매입원가 {won(header.totalCost)}</span>
          <span>예수금 {won(header.totalCash)}</span>
          <span className={header.evalPnl > 0 ? 'pnl-up' : header.evalPnl < 0 ? 'pnl-down' : ''}>
            평가손익 {header.evalPnl > 0 ? '+' : ''}{won(header.evalPnl)}
            ({header.evalPnlPct > 0 ? '+' : ''}{header.evalPnlPct}%)
          </span>
        </div>
        <div className="db-price-ref">
          {hasPriceData
            ? `시세 기준: ${new Date(header.priceAsOf!).toLocaleString('ko-KR')}`
            : '시세 미연동 — 취득원가 기준 평가'}
        </div>
      </section>

      {/* ── 2. 핵심 지표 카드 ── */}
      <section className="db-metrics">
        <div
          className="db-metric-card"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate('review')}
          onKeyDown={(e) => e.key === 'Enter' && onNavigate('review')}
        >
          <span className="db-metric-label">올해 실현손익</span>
          <span className={`db-metric-value ${metrics.ytdRealizedPnl > 0 ? 'pnl-up' : metrics.ytdRealizedPnl < 0 ? 'pnl-down' : ''}`}>
            {metrics.ytdRealizedPnl > 0 ? '+' : ''}{won(metrics.ytdRealizedPnl)}
          </span>
        </div>
        <div className="db-metric-card">
          <span className="db-metric-label">평가손익</span>
          <span className={`db-metric-value ${metrics.evalPnl > 0 ? 'pnl-up' : metrics.evalPnl < 0 ? 'pnl-down' : ''}`}>
            {metrics.evalPnl > 0 ? '+' : ''}{won(metrics.evalPnl)}
          </span>
        </div>
        <div
          className="db-metric-card"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate('portfolio')}
          onKeyDown={(e) => e.key === 'Enter' && onNavigate('portfolio')}
        >
          <span className="db-metric-label">보유 종목</span>
          <span className="db-metric-value">{metrics.holdingCount}종목</span>
        </div>
        <div className="db-metric-card">
          <span className="db-metric-label">현금 비중</span>
          <span className="db-metric-value">{metrics.cashRatioPct}%</span>
        </div>
      </section>

      {/* ── 3. 자산 배분 ── */}
      <section className="db-section">
        <div className="db-section-head">
          <h3>자산 배분</h3>
          <div className="seg" role="tablist">
            {(['ticker', 'sector', 'account'] as DistView[]).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={distView === v}
                className={distView === v ? 'on' : ''}
                onClick={() => setDistView(v)}
              >
                {v === 'ticker' ? '종목' : v === 'sector' ? '섹터' : '계좌'}
              </button>
            ))}
          </div>
        </div>
        <DashDistBars items={currentDist.slice(0, 10)} />
        {currentDist.length > 10 && (
          <button
            type="button"
            className="db-more-btn"
            onClick={() => onNavigate('portfolio')}
          >
            전체 보기 →
          </button>
        )}
      </section>

      {/* ── 4. 계좌별 현황 ── */}
      <section className="db-section">
        <h3 className="db-section-title">계좌별 현황</h3>
        {accountStatuses.length === 0 ? (
          <p className="db-notice">계좌가 없습니다.</p>
        ) : (
          <div className="db-account-list">
            {accountStatuses.map((s) => (
              <AccountRow key={s.accountId} status={s} />
            ))}
          </div>
        )}
      </section>

      {/* ── 5. 액션·알림 ── */}
      {alerts.length > 0 && (
        <section className="db-section">
          <h3 className="db-section-title">액션 · 알림</h3>
          <div className="db-alerts">
            {alerts.map((a) => (
              <AlertCard key={a.id} alert={a} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ───────── 서브 컴포넌트 ───────── */

function DashDistBars({ items }: { items: WeightItem[] }) {
  if (items.length === 0) return <p className="db-notice">보유 데이터가 없습니다.</p>;
  return (
    <div className="db-dist-bars">
      {items.map((item) => (
        <div key={item.label} className="db-dist-row">
          <span className="db-dist-label">{item.label}</span>
          <div className="pf-bar-track">
            <div className="pf-bar-fill" style={{ width: `${Math.min(item.pct, 100)}%` }} />
          </div>
          <span className="db-dist-pct mono">{item.pct.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

function AccountRow({ status: s }: { status: AccountStatus }) {
  const won = (n: number) => n.toLocaleString('ko-KR') + '원';
  const typeLabel: Record<string, string> = {
    general: '일반', isa: 'ISA', pension: '연금저축', irp: 'IRP', irp_dc: 'IRP(DC)',
  };
  return (
    <div className="db-acct-row">
      <div className="db-acct-info">
        <span className="db-acct-name">{s.accountName}</span>
        <span className="db-acct-type">{typeLabel[s.accountType] ?? s.accountType}</span>
      </div>
      <div className="db-acct-numbers">
        <span className="db-acct-eval">{won(s.evalAmount)}</span>
        <span className={`db-acct-return mono ${s.returnPct > 0 ? 'pnl-up' : s.returnPct < 0 ? 'pnl-down' : ''}`}>
          {s.returnPct > 0 ? '+' : ''}{s.returnPct}%
        </span>
        <span className="db-acct-count muted">{s.holdingCount}종목</span>
      </div>
    </div>
  );
}

function AlertCard({ alert: a, onNavigate }: { alert: DashboardAlert; onNavigate: (tab: string) => void }) {
  return (
    <button
      type="button"
      className={`db-alert db-alert-${a.level}`}
      onClick={() => a.targetTab && onNavigate(a.targetTab)}
    >
      <div className="db-alert-head">
        <span className={`db-alert-level level-${a.level}`}>
          {a.level === 'danger' ? '!' : a.level === 'warning' ? '⚠' : 'i'}
        </span>
        <strong>{a.title}</strong>
      </div>
      <span className="db-alert-detail">{a.detail}</span>
    </button>
  );
}
