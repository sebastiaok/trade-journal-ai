// components/PortfolioDashboard.tsx
// 포트폴리오 점검 탭 — 배분 진단 · 리스크 지표 · 리밸런싱 제안

'use client';

import { useMemo, useState } from 'react';
import type {
  Account,
  Holding,
  PortfolioSnapshot,
  TargetAllocation,
} from '../data/types';
import {
  computeTickerDistribution,
  computeAccountDistribution,
  computeSectorDistribution,
  computeConcentration,
  computeMDD,
  computeRebalanceProposals,
  formatSnapshotTrend,
  type WeightItem,
  type RebalanceProposal,
} from '../lib/portfolio';

interface Props {
  holdings: Holding[];
  accounts: Account[];
  snapshots: PortfolioSnapshot[];
  targetAllocation: TargetAllocation[];
  sectorMap: Record<string, string>;
  onTakeSnapshot: () => Promise<void>;
  onUpsertTarget: (sector: string, targetPct: number) => Promise<void>;
  onRemoveTarget: (id: string) => Promise<void>;
}

type DistView = 'ticker' | 'sector' | 'account';

export default function PortfolioDashboard({
  holdings,
  accounts,
  snapshots,
  targetAllocation,
  sectorMap,
  onTakeSnapshot,
  onUpsertTarget,
  onRemoveTarget,
}: Props) {
  const [distView, setDistView] = useState<DistView>('ticker');
  const [showTargetEditor, setShowTargetEditor] = useState(false);
  const [snapping, setSnapping] = useState(false);

  // 배분 계산
  const tickerDist = useMemo(
    () => computeTickerDistribution(holdings, accounts),
    [holdings, accounts],
  );
  const accountDist = useMemo(
    () => computeAccountDistribution(holdings, accounts),
    [holdings, accounts],
  );
  const sectorDist = useMemo(
    () => computeSectorDistribution(holdings, accounts, sectorMap),
    [holdings, accounts, sectorMap],
  );

  const currentDist = distView === 'ticker' ? tickerDist
    : distView === 'account' ? accountDist : sectorDist;

  // 리스크
  const concentration = useMemo(() => computeConcentration(tickerDist), [tickerDist]);
  const mddResult = useMemo(() => computeMDD(snapshots), [snapshots]);
  const trend = useMemo(() => formatSnapshotTrend(snapshots), [snapshots]);

  // 총 평가액
  const totalValue = useMemo(() => {
    const holdingsVal = holdings.reduce((s, h) => s + h.quantity * h.avgCost, 0);
    const cash = accounts.reduce((s, a) => s + a.cashBalance, 0);
    return holdingsVal + cash;
  }, [holdings, accounts]);

  // 섹터별 보유 종목
  const holdingsBySector = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const h of holdings) {
      const sector = sectorMap[h.symbol] ?? '기타';
      const list = map.get(sector) ?? [];
      if (!list.includes(h.symbol)) list.push(h.symbol);
      map.set(sector, list);
    }
    return map;
  }, [holdings, sectorMap]);

  // 리밸런싱 제안
  const proposals = useMemo(
    () => computeRebalanceProposals(sectorDist, targetAllocation, totalValue, 5, holdingsBySector),
    [sectorDist, targetAllocation, totalValue, holdingsBySector],
  );

  const won = (n: number) => n.toLocaleString('ko-KR') + '원';

  async function handleSnapshot() {
    setSnapping(true);
    try {
      await onTakeSnapshot();
    } finally {
      setSnapping(false);
    }
  }

  if (holdings.length === 0 && accounts.every((a) => a.cashBalance === 0)) {
    return (
      <div className="pf-empty">
        <p>보유 종목이 없습니다. 매매일지에서 거래를 기록하거나 보유 스냅샷을 입력하세요.</p>
      </div>
    );
  }

  return (
    <div className="pf-dash">
      {/* ── 1. 종합 요약 카드 ── */}
      <div className="pf-summary">
        <div className="pf-card">
          <span className="pf-card-label">총 평가액</span>
          <span className="pf-card-value">{won(totalValue)}</span>
        </div>
        <div className="pf-card">
          <span className="pf-card-label">현금</span>
          <span className="pf-card-value">{won(accounts.reduce((s, a) => s + a.cashBalance, 0))}</span>
        </div>
        <div className="pf-card">
          <span className="pf-card-label">집중도 (상위 3)</span>
          <span className={`pf-card-value ${concentration.level === 'high' ? 'pnl-down' : ''}`}>
            {concentration.top3Pct.toFixed(1)}%
          </span>
        </div>
        <div className="pf-card">
          <span className="pf-card-label">HHI</span>
          <span className={`pf-card-value ${concentration.level === 'high' ? 'pnl-down' : ''}`}>
            {concentration.hhi}
          </span>
        </div>
        <div className="pf-card">
          <span className="pf-card-label">MDD</span>
          <span className={`pf-card-value ${mddResult.mddPct > 0 ? 'pnl-down' : ''}`}>
            {mddResult.mddPct > 0 ? `-${mddResult.mddPct.toFixed(1)}%` : '—'}
          </span>
        </div>
        <div className="pf-card">
          <span className="pf-card-label">목표 이탈</span>
          <span className={`pf-card-value ${proposals.length > 0 ? 'pnl-down' : ''}`}>
            {proposals.length}건
          </span>
        </div>
      </div>

      {/* ── 2. 배분 진단 ── */}
      <section className="pf-section">
        <div className="pf-section-head">
          <h3>배분 진단</h3>
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

        <DistributionBars items={currentDist} />

        {/* 섹터 뷰에서 목표 대비 표시 */}
        {distView === 'sector' && targetAllocation.length > 0 && (
          <div className="pf-target-compare">
            <h4>목표 대비</h4>
            {targetAllocation.map((t) => {
              const cur = sectorDist.find((d) => d.label === t.sector);
              const curPct = cur?.pct ?? 0;
              const diff = curPct - t.targetPct;
              return (
                <div key={t.sector} className="pf-target-row">
                  <span className="pf-target-label">{t.sector}</span>
                  <div className="pf-target-bars">
                    <div className="pf-bar-track">
                      <div className="pf-bar-fill pf-bar-current" style={{ width: `${Math.min(curPct, 100)}%` }} />
                    </div>
                    <div className="pf-bar-track">
                      <div className="pf-bar-fill pf-bar-target" style={{ width: `${Math.min(t.targetPct, 100)}%` }} />
                    </div>
                  </div>
                  <span className={`pf-target-diff mono ${diff > 5 ? 'pnl-down' : diff < -5 ? 'pnl-up' : ''}`}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(1)}%p
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 3. 자산 추이 ── */}
      <section className="pf-section">
        <div className="pf-section-head">
          <h3>자산 추이</h3>
          <button
            type="button"
            className="tool-btn"
            disabled={snapping}
            onClick={handleSnapshot}
          >
            {snapping ? '저장 중…' : '오늘 스냅샷 저장'}
          </button>
        </div>

        {trend.length < 2 ? (
          <p className="pf-notice">
            스냅샷이 {trend.length}건입니다. 매일 스냅샷을 저장하면 자산 추이와 MDD를 확인할 수 있습니다.
          </p>
        ) : (
          <div className="pf-trend-table-wrap">
            <table className="pf-trend-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th className="num">총 평가액</th>
                  <th className="num">현금</th>
                  <th className="num">수익률</th>
                </tr>
              </thead>
              <tbody>
                {trend.slice().reverse().map((p) => (
                  <tr key={p.date}>
                    <td className="mono">{p.date}</td>
                    <td className="num mono">{won(p.totalValue + p.cash)}</td>
                    <td className="num mono">{won(p.cash)}</td>
                    <td className={`num mono ${p.returnPct > 0 ? 'pnl-up' : p.returnPct < 0 ? 'pnl-down' : ''}`}>
                      {p.returnPct > 0 ? '+' : ''}{p.returnPct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mddResult.mddPct > 0 && (
          <div className="pf-mdd-info">
            MDD: <strong>-{mddResult.mddPct.toFixed(1)}%</strong>
            {mddResult.peakDate && mddResult.troughDate && (
              <span className="muted"> ({mddResult.peakDate} → {mddResult.troughDate})</span>
            )}
          </div>
        )}
      </section>

      {/* ── 4. 리밸런싱 제안 ── */}
      <section className="pf-section">
        <div className="pf-section-head">
          <h3>리밸런싱 제안</h3>
          <button
            type="button"
            className="tool-btn"
            onClick={() => setShowTargetEditor((v) => !v)}
          >
            {showTargetEditor ? '닫기' : '목표 배분 설정'}
          </button>
        </div>

        {showTargetEditor && (
          <TargetEditor
            targets={targetAllocation}
            onUpsert={onUpsertTarget}
            onRemove={onRemoveTarget}
          />
        )}

        {targetAllocation.length === 0 ? (
          <p className="pf-notice">
            목표 배분을 설정하면 리밸런싱 제안을 받을 수 있습니다.
          </p>
        ) : proposals.length === 0 ? (
          <p className="pf-notice">현재 포트폴리오가 목표 배분 범위 안에 있습니다.</p>
        ) : (
          <div className="pf-proposals">
            {proposals.map((p) => (
              <ProposalCard key={p.sector} proposal={p} />
            ))}
            <p className="pf-disclaimer">
              위 제안은 참고용이며 자동 매매가 아닙니다. 실제 조정은 매매일지에서 직접 수행하세요.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/* ───────── 배분 막대 ───────── */

function DistributionBars({ items }: { items: WeightItem[] }) {
  if (items.length === 0) return <p className="pf-notice">데이터가 없습니다.</p>;
  return (
    <div className="pf-dist-bars">
      {items.map((item) => (
        <div key={item.label} className="pf-dist-row">
          <span className="pf-dist-label">{item.label}</span>
          <div className="pf-bar-track">
            <div
              className="pf-bar-fill"
              style={{ width: `${Math.min(item.pct, 100)}%` }}
            />
          </div>
          <span className="pf-dist-pct mono">{item.pct.toFixed(1)}%</span>
          <span className="pf-dist-val mono muted">
            {item.value.toLocaleString('ko-KR')}원
          </span>
        </div>
      ))}
    </div>
  );
}

/* ───────── 리밸런싱 제안 카드 ───────── */

function ProposalCard({ proposal: p }: { proposal: RebalanceProposal }) {
  return (
    <div className={`pf-proposal ${p.action === 'sell' ? 'pf-proposal-sell' : 'pf-proposal-buy'}`}>
      <div className="pf-proposal-head">
        <strong>{p.sector}</strong>
        <span className={`pf-proposal-badge ${p.action === 'sell' ? 'badge-sell' : 'badge-buy'}`}>
          {p.action === 'sell' ? '매도 검토' : '매수 검토'}
        </span>
      </div>
      <div className="pf-proposal-body">
        <span>현재 {p.currentPct.toFixed(1)}% → 목표 {p.targetPct.toFixed(1)}%</span>
        <span className="mono">
          ({p.diffPp > 0 ? '+' : ''}{p.diffPp.toFixed(1)}%p · 약 {p.adjustAmount.toLocaleString('ko-KR')}원)
        </span>
      </div>
      {p.symbols.length > 0 && (
        <div className="pf-proposal-symbols muted">
          관련 종목: {p.symbols.join(', ')}
        </div>
      )}
    </div>
  );
}

/* ───────── 목표 배분 편집기 ───────── */

function TargetEditor({
  targets,
  onUpsert,
  onRemove,
}: {
  targets: TargetAllocation[];
  onUpsert: (sector: string, pct: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [sector, setSector] = useState('');
  const [pct, setPct] = useState('');
  const [saving, setSaving] = useState(false);

  const totalPct = targets.reduce((s, t) => s + t.targetPct, 0);

  async function handleAdd() {
    const s = sector.trim();
    const p = Number(pct);
    if (!s || Number.isNaN(p) || p <= 0 || p > 100) return;
    setSaving(true);
    try {
      await onUpsert(s, p);
      setSector('');
      setPct('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pf-target-editor">
      <div className="pf-target-list">
        {targets.map((t) => (
          <div key={t.id} className="pf-target-item">
            <span>{t.sector}</span>
            <span className="mono">{t.targetPct}%</span>
            <button type="button" className="pf-target-del" onClick={() => onRemove(t.id)}>
              삭제
            </button>
          </div>
        ))}
        <div className="pf-target-total">
          합계: <strong className={totalPct > 100 ? 'pnl-down' : ''}>{totalPct.toFixed(1)}%</strong>
          {totalPct > 100 && <span className="pnl-down"> (100% 초과)</span>}
        </div>
      </div>
      <div className="pf-target-add">
        <input
          type="text"
          placeholder="섹터명"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
        />
        <input
          type="number"
          placeholder="%"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          min={0}
          max={100}
          step={1}
        />
        <button type="button" className="an-submit" disabled={saving} onClick={handleAdd}>
          {saving ? '저장…' : '추가'}
        </button>
      </div>
    </div>
  );
}
