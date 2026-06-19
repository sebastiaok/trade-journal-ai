// app/page.tsx
// 메인 화면 — AuthGate로 보호하고, 로그인 후 4탭을 보여준다.
//   1) 매매내역(history)  2) 매매일지(journal)  3) 복기/통계(review)  4) 검토(invest)
// 상단 계좌 드롭다운을 모든 탭이 공유한다. JSON 백업 내보내기/가져오기 포함.

'use client';

import { useMemo, useRef, useState } from 'react';
import AuthGate from '../components/AuthGate';
import HistoryTable from '../components/HistoryTable';
import ManualTradeForm from '../components/ManualTradeForm';
import CaptureUploader from '../components/CaptureUploader';
import TradeImportPanel from '../components/TradeImportPanel';
import AccountManager from '../components/AccountManager';
import InvestChecklist from '../components/InvestChecklist';
import { useData } from '../lib/useData';
import { downloadBackup, importBackupFromFile } from '../lib/backup';
import {
  statsByPeriod,
  statsBySymbol,
  computeStats,
  type PeriodGranularity,
  type GroupStat,
} from '../lib/pnl';
import type { Trade } from '../data/types';

type Tab = 'history' | 'journal' | 'review' | 'invest';
type InputMode = 'manual' | 'image' | 'import';

const TABS: { key: Tab; label: string }[] = [
  { key: 'history', label: '매매내역' },
  { key: 'journal', label: '매매일지' },
  { key: 'review', label: '복기/통계' },
  { key: 'invest', label: '투자 검토' },
];

export default function Page() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

function Dashboard() {
  const data = useData();
  const [tab, setTab] = useState<Tab>('history');
  const [accountId, setAccountId] = useState<string | 'all'>('all');
  const [showAccounts, setShowAccounts] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 선택 계좌로 필터링한 거래 (탭들이 공유)
  const scopedTrades = useMemo(
    () => (accountId === 'all' ? data.trades : data.trades.filter((t) => t.accountId === accountId)),
    [data.trades, accountId],
  );

  async function handleImport(file: File | null) {
    if (!file) return;
    try {
      const r = await importBackupFromFile(file);
      alert(`가져오기 완료: 계좌 ${r.accounts} · 거래 ${r.trades} · 검토 ${r.checks}`);
      await data.reload();
    } catch (e) {
      alert(`가져오기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (data.loading) return <div className="dash-loading">데이터 불러오는 중…</div>;

  return (
    <main className="dash">
      <header className="dash-head">
        <h1 className="dash-title">매매일지</h1>
        <div className="dash-tools">
          <select
            className="acct-select"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="계좌 선택"
          >
            <option value="all">전체 계좌</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="button" className="tool-btn" onClick={() => setShowAccounts((v) => !v)}>
            계좌 관리
          </button>
          <button type="button" className="tool-btn" onClick={() => downloadBackup()}>
            내보내기
          </button>
          <button type="button" className="tool-btn" onClick={() => fileRef.current?.click()}>
            가져오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => handleImport(e.target.files?.[0] ?? null)}
          />
        </div>
      </header>

      <nav className="dash-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`dash-tab tab-${t.key} ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {data.error && <p className="dash-error" role="alert">{data.error}</p>}

      {showAccounts && (
        <AccountManager
          accounts={data.accounts}
          onAdd={(a) => data.addAccount(a)}
          onUpdate={(id, patch) => data.updateAccount(id, patch)}
          onRemove={(id) => data.removeAccount(id)}
        />
      )}

      {data.accounts.length === 0 ? (
        <NoAccounts onAdd={() => data.addAccount({ name: '일반 계좌', type: 'general' })} />
      ) : (
        <section className="dash-body">
          {tab === 'history' && (
            <HistoryTable trades={data.trades} accounts={data.accounts} accountId={accountId} />
          )}

          {tab === 'journal' && (
            <JournalTab
              accounts={data.accounts}
              defaultAccountId={accountId === 'all' ? undefined : accountId}
              onSubmit={(t) => data.addTrade(t)}
              onSubmitMany={(list) => data.addTrades(list)}
            />
          )}

          {tab === 'review' && <ReviewTab trades={scopedTrades} />}

          {tab === 'invest' && (
            <InvestChecklist
              accounts={data.accounts}
              checks={data.checks}
              defaultAccountId={accountId === 'all' ? undefined : accountId}
              onAdd={(c) => data.addCheck(c)}
              onRemove={(id) => data.removeCheck(id)}
            />
          )}
        </section>
      )}
    </main>
  );
}

/* ───────── 매매일지 탭: 수기 ↔ 이미지 토글 ───────── */

function JournalTab({
  accounts,
  defaultAccountId,
  onSubmit,
  onSubmitMany,
}: {
  accounts: Parameters<typeof ManualTradeForm>[0]['accounts'];
  defaultAccountId?: string;
  onSubmit: (t: Omit<Trade, 'id'>) => void;
  onSubmitMany: (list: Omit<Trade, 'id'>[]) => void;
}) {
  const [mode, setMode] = useState<InputMode>('manual');
  return (
    <div className="journal">
      <div className="journal-modes" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'manual'}
          className={mode === 'manual' ? 'on' : ''}
          onClick={() => setMode('manual')}
        >
          수기 입력
        </button>
        <button
          role="tab"
          aria-selected={mode === 'image'}
          className={mode === 'image' ? 'on' : ''}
          onClick={() => setMode('image')}
        >
          이미지 인식
        </button>
        <button
          role="tab"
          aria-selected={mode === 'import'}
          className={mode === 'import' ? 'on' : ''}
          onClick={() => setMode('import')}
        >
          파일/OCR
        </button>
      </div>

      {mode === 'manual' ? (
        <ManualTradeForm accounts={accounts} defaultAccountId={defaultAccountId} onSubmit={onSubmit} />
      ) : mode === 'image' ? (
        <CaptureUploader
          accounts={accounts}
          defaultAccountId={defaultAccountId}
          onConfirm={onSubmitMany}
        />
      ) : (
        <TradeImportPanel
          accounts={accounts}
          defaultAccountId={defaultAccountId}
          onConfirm={onSubmitMany}
        />
      )}
    </div>
  );
}

/* ───────── 복기/통계 탭: 기간별 기본 + 종목별 ───────── */

function ReviewTab({ trades }: { trades: Trade[] }) {
  const [view, setView] = useState<'period' | 'symbol'>('period');
  const [granularity, setGranularity] = useState<PeriodGranularity>('month');

  const overall = useMemo(() => computeStats(trades), [trades]);
  const periodRows = useMemo(
    () => statsByPeriod(trades, granularity),
    [trades, granularity],
  );
  const symbolRows = useMemo(() => statsBySymbol(trades), [trades]);

  const won = (n: number) => n.toLocaleString('ko-KR') + '원';
  const pf = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '∞');

  return (
    <div className="review">
      <div className="review-summary">
        <Stat label="청산 거래" value={`${overall.closedCount}건`} />
        <Stat label="승률" value={`${overall.winRate}%`} />
        <Stat label="손익비" value={pf(overall.profitFactor)} />
        <Stat
          label="누적 실현손익"
          value={won(overall.cumulativePnl)}
          tone={overall.cumulativePnl > 0 ? 'up' : overall.cumulativePnl < 0 ? 'down' : undefined}
        />
        <Stat label="평균 보유" value={`${overall.avgHoldingDays}일`} />
        <Stat label="MDD" value={won(overall.mdd)} tone={overall.mdd < 0 ? 'down' : undefined} />
      </div>

      <div className="review-controls">
        <div className="seg" role="tablist">
          <button aria-selected={view === 'period'} className={view === 'period' ? 'on' : ''} onClick={() => setView('period')}>
            기간별
          </button>
          <button aria-selected={view === 'symbol'} className={view === 'symbol' ? 'on' : ''} onClick={() => setView('symbol')}>
            종목별
          </button>
        </div>
        {view === 'period' && (
          <div className="seg" role="tablist">
            {(['month', 'quarter', 'year'] as PeriodGranularity[]).map((g) => (
              <button
                key={g}
                aria-selected={granularity === g}
                className={granularity === g ? 'on' : ''}
                onClick={() => setGranularity(g)}
              >
                {g === 'month' ? '월' : g === 'quarter' ? '분기' : '연도'}
              </button>
            ))}
          </div>
        )}
      </div>

      <GroupTable
        rows={view === 'period' ? periodRows : symbolRows}
        firstCol={view === 'period' ? '기간' : '종목'}
      />
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
              <td className={`num mono ${r.realizedPnl > 0 ? 'pnl-up' : r.realizedPnl < 0 ? 'pnl-down' : ''}`}>
                {won(r.realizedPnl)}
              </td>
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
      <span className={`stat-value ${tone === 'up' ? 'pnl-up' : tone === 'down' ? 'pnl-down' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function NoAccounts({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="no-accounts">
      <p>아직 계좌가 없습니다. 계좌를 만들면 거래를 기록할 수 있습니다.</p>
      <button type="button" className="tool-btn" onClick={onAdd}>
        일반 계좌 만들기
      </button>
    </div>
  );
}
