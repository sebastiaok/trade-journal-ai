// app/(app)/transactions/page.tsx
// 매매내역 — 내역 조회 + 매매 입력(4모드) + 복기/통계

'use client';

import { useMemo, useState } from 'react';
import { useAppData } from '../../../components/DataProvider';
import HistoryTable from '../../../components/HistoryTable';
import ManualTradeForm from '../../../components/ManualTradeForm';
import CaptureUploader from '../../../components/CaptureUploader';
import TradeImportPanel from '../../../components/TradeImportPanel';
import OpeningLotForm from '../../../components/OpeningLotForm';
import type { Trade } from '../../../data/types';
import {
  statsByPeriod,
  statsBySymbol,
  computeStats,
  type PeriodGranularity,
  type GroupStat,
} from '../../../lib/pnl';

type SubTab = 'history' | 'journal' | 'review';
type InputMode = 'manual' | 'image' | 'import' | 'opening';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'history', label: '매매내역' },
  { key: 'journal', label: '매매일지' },
  { key: 'review', label: '복기/통계' },
];

export default function TransactionsPage() {
  const data = useAppData();
  const [subTab, setSubTab] = useState<SubTab>('history');
  const [accountId, setAccountId] = useState<string | 'all'>('all');

  const scopedTrades = useMemo(
    () => (accountId === 'all' ? data.trades : data.trades.filter((t) => t.accountId === accountId)),
    [data.trades, accountId],
  );

  return (
    <div className="transactions-page">
      <header className="transactions-page-head">
        <h1 className="transactions-page-title">매매내역</h1>
        <select
          className="acct-select"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          aria-label="계좌 선택"
        >
          <option value="all">전체 계좌</option>
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </header>

      <nav className="dash-tabs" role="tablist">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={subTab === t.key}
            className={`dash-tab tab-${t.key} ${subTab === t.key ? 'on' : ''}`}
            onClick={() => setSubTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {data.error && <p className="dash-error" role="alert">{data.error}</p>}

      <section className="dash-body">
        {subTab === 'history' && (
          <HistoryTable trades={data.trades} accounts={data.accounts} accountId={accountId} />
        )}

        {subTab === 'journal' && (
          <JournalSection
            accounts={data.accounts}
            defaultAccountId={accountId === 'all' ? undefined : accountId}
            onSubmit={(t) => data.addTrade(t)}
            onSubmitMany={(list) => data.addTrades(list)}
          />
        )}

        {subTab === 'review' && <ReviewSection trades={scopedTrades} />}
      </section>
    </div>
  );
}

/* ───────── 매매일지 섹션 ───────── */

function JournalSection({
  accounts,
  defaultAccountId,
  onSubmit,
  onSubmitMany,
}: {
  accounts: Parameters<typeof ManualTradeForm>[0]['accounts'];
  defaultAccountId?: string;
  onSubmit: (t: Omit<Trade, 'id'>) => Promise<void> | void;
  onSubmitMany: (list: Omit<Trade, 'id'>[]) => Promise<void> | void;
}) {
  const [mode, setMode] = useState<InputMode>('manual');
  return (
    <div className="journal">
      <div className="journal-modes" role="tablist">
        <button role="tab" aria-selected={mode === 'manual'} className={mode === 'manual' ? 'on' : ''} onClick={() => setMode('manual')}>수기 입력</button>
        <button role="tab" aria-selected={mode === 'image'} className={mode === 'image' ? 'on' : ''} onClick={() => setMode('image')}>이미지 인식</button>
        <button role="tab" aria-selected={mode === 'import'} className={mode === 'import' ? 'on' : ''} onClick={() => setMode('import')}>파일/OCR</button>
        <button role="tab" aria-selected={mode === 'opening'} className={mode === 'opening' ? 'on' : ''} onClick={() => setMode('opening')}>보유 스냅샷</button>
      </div>
      {mode === 'manual' ? (
        <ManualTradeForm accounts={accounts} defaultAccountId={defaultAccountId} onSubmit={onSubmit} />
      ) : mode === 'image' ? (
        <CaptureUploader accounts={accounts} defaultAccountId={defaultAccountId} onConfirm={onSubmitMany} />
      ) : mode === 'import' ? (
        <TradeImportPanel accounts={accounts} defaultAccountId={defaultAccountId} onConfirm={onSubmitMany} />
      ) : (
        <OpeningLotForm accounts={accounts} defaultAccountId={defaultAccountId} onSubmit={onSubmitMany} />
      )}
    </div>
  );
}

/* ───────── 복기/통계 섹션 ───────── */

function ReviewSection({ trades }: { trades: Trade[] }) {
  const [view, setView] = useState<'period' | 'symbol'>('period');
  const [granularity, setGranularity] = useState<PeriodGranularity>('month');

  const overall = useMemo(() => computeStats(trades), [trades]);
  const periodRows = useMemo(() => statsByPeriod(trades, granularity), [trades, granularity]);
  const symbolRows = useMemo(() => statsBySymbol(trades), [trades]);

  const won = (n: number) => n.toLocaleString('ko-KR') + '원';
  const pf = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '∞');

  return (
    <div className="review">
      <div className="review-summary">
        <Stat label="청산 거래" value={`${overall.closedCount}건`} />
        <Stat label="승률" value={`${overall.winRate}%`} />
        <Stat label="손익비" value={pf(overall.profitFactor)} />
        <Stat label="누적 실현손익" value={won(overall.cumulativePnl)}
          tone={overall.cumulativePnl > 0 ? 'up' : overall.cumulativePnl < 0 ? 'down' : undefined} />
        <Stat label="평균 보유" value={`${overall.avgHoldingDays}일`} />
        <Stat label="MDD" value={won(overall.mdd)} tone={overall.mdd < 0 ? 'down' : undefined} />
      </div>

      <div className="review-controls">
        <div className="seg" role="tablist">
          <button aria-selected={view === 'period'} className={view === 'period' ? 'on' : ''} onClick={() => setView('period')}>기간별</button>
          <button aria-selected={view === 'symbol'} className={view === 'symbol' ? 'on' : ''} onClick={() => setView('symbol')}>종목별</button>
        </div>
        {view === 'period' && (
          <div className="seg" role="tablist">
            {(['month', 'quarter', 'year'] as PeriodGranularity[]).map((g) => (
              <button key={g} aria-selected={granularity === g} className={granularity === g ? 'on' : ''} onClick={() => setGranularity(g)}>
                {g === 'month' ? '월' : g === 'quarter' ? '분기' : '연도'}
              </button>
            ))}
          </div>
        )}
      </div>

      <GroupTable rows={view === 'period' ? periodRows : symbolRows} firstCol={view === 'period' ? '기간' : '종목'} />
    </div>
  );
}

function GroupTable({ rows, firstCol }: { rows: GroupStat[]; firstCol: string }) {
  const won = (n: number) => n.toLocaleString('ko-KR') + '원';
  const pf = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '∞');
  if (rows.length === 0) return <p className="review-empty">청산된 거래가 없습니다.</p>;
  return (
    <div className="review-scroll">
      <table className="review-table">
        <thead>
          <tr>
            <th>{firstCol}</th>
            <th className="num">거래수</th>
            <th className="num">승률</th>
            <th className="num">실현손익</th>
            <th className="num">손익비</th>
            <th className="num">평균보유</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td className="num mono">{r.closedCount}</td>
              <td className="num mono">{r.winRate}%</td>
              <td className={`num mono ${r.realizedPnl > 0 ? 'pnl-up' : r.realizedPnl < 0 ? 'pnl-down' : ''}`}>{won(r.realizedPnl)}</td>
              <td className="num mono">{pf(r.profitFactor)}</td>
              <td className="num mono">{r.avgHoldingDays}일</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone === 'up' ? 'pnl-up' : tone === 'down' ? 'pnl-down' : ''}`}>{value}</span>
    </div>
  );
}
