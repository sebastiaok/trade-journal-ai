// components/HistoryTable.tsx
// 매매내역(history) 탭 — 서버에서 기간 필터된 거래를 조회.
// 기간 프리셋: 1개월(기본)·3개월·6개월·1년·전체·직접 지정.
// 계좌/종목/구분 클라이언트 필터 + 컬럼 정렬.
// source='opening' 행은 매매내역에서 제외(서버 쿼리에서 이미 제외).

'use client';

import { useMemo, useState } from 'react';
import type { Account, Trade, Side } from '../data/types';

export type PeriodPreset = '1m' | '3m' | '6m' | '1y' | 'all' | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

/** 프리셋에 따른 날짜 범위를 계산 */
export function periodToRange(preset: PeriodPreset, custom?: DateRange): DateRange {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (preset === 'custom' && custom) return custom;
  if (preset === 'all') return { startDate: '2000-01-01', endDate: end };
  const months: Record<string, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };
  const m = months[preset] ?? 1;
  const start = new Date(now);
  start.setMonth(start.getMonth() - m);
  return { startDate: start.toISOString().slice(0, 10), endDate: end };
}

const PERIOD_OPTIONS: { key: PeriodPreset; label: string }[] = [
  { key: '1m', label: '1개월' },
  { key: '3m', label: '3개월' },
  { key: '6m', label: '6개월' },
  { key: '1y', label: '1년' },
  { key: 'all', label: '전체' },
  { key: 'custom', label: '직접 지정' },
];

interface Props {
  trades: Trade[];
  accounts: Account[];
  accountId: string | 'all';
  /** 현재 기간 프리셋 */
  period: PeriodPreset;
  /** 현재 기간 범위 (표시용) */
  dateRange: DateRange;
  /** 기간 변경 콜백 — 부모에서 서버 쿼리를 다시 실행 */
  onPeriodChange: (preset: PeriodPreset, range: DateRange) => void;
  /** 로딩 상태 */
  loadingTrades?: boolean;
}

type SortKey = 'executedAt' | 'symbol' | 'amount' | 'realizedPnl';
type SortDir = 'asc' | 'desc';
type SideFilter = Side | 'all' | 'buy_sell';

const SIDE_LABEL: Record<Side, string> = {
  buy: '매수',
  sell: '매도',
  deposit: '납입',
  withdrawal: '인출',
};

const won = (n: number | undefined) =>
  n == null ? '—' : n.toLocaleString('ko-KR') + '원';

const signedWon = (n: number | undefined) => {
  if (n == null) return '—';
  const s = n > 0 ? '+' : '';
  return s + n.toLocaleString('ko-KR') + '원';
};

export default function HistoryTable({
  trades, accounts, accountId,
  period, dateRange, onPeriodChange, loadingTrades,
}: Props) {
  const [symbol, setSymbol] = useState('');
  const [sideFilter, setSideFilter] = useState<SideFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('executedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // 커스텀 날짜 (custom 모드에서만 사용)
  const [customFrom, setCustomFrom] = useState(dateRange.startDate);
  const [customTo, setCustomTo] = useState(dateRange.endDate);

  const accountName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  // 클라이언트 필터: 종목/계좌/구분 (기간 필터는 서버에서 이미 처리됨)
  const rows = useMemo(() => {
    let r = trades.slice();

    if (accountId !== 'all') r = r.filter((t) => t.accountId === accountId);
    if (symbol.trim()) {
      const q = symbol.trim().toLowerCase();
      r = r.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          (t.code ?? '').toLowerCase().includes(q),
      );
    }
    if (sideFilter === 'buy_sell') {
      r = r.filter((t) => t.side === 'buy' || t.side === 'sell');
    } else if (sideFilter !== 'all') {
      r = r.filter((t) => t.side === sideFilter);
    }

    r.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortKey) {
        case 'symbol': av = a.symbol; bv = b.symbol; break;
        case 'amount': av = a.amount; bv = b.amount; break;
        case 'realizedPnl': av = a.realizedPnl ?? -Infinity; bv = b.realizedPnl ?? -Infinity; break;
        default: av = a.executedAt; bv = b.executedAt;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return r;
  }, [trades, accountId, symbol, sideFilter, sortKey, sortDir]);

  // 요약 카드 — 선택 기간 기준으로 집계
  const totals = useMemo(() => {
    const realized = rows.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
    const feeSum = rows.reduce((s, t) => s + (t.fee ?? 0), 0);
    const taxSum = rows.reduce((s, t) => s + (t.tax ?? 0), 0);
    const sells = rows.filter((t) => t.side === 'sell' && t.realizedPnl != null);
    const wins = sells.filter((t) => (t.realizedPnl ?? 0) > 0);
    const winRate = sells.length > 0 ? Math.round((wins.length / sells.length) * 100) : 0;
    return { count: rows.length, realized, feeSum, taxSum, winRate, sellCount: sells.length };
  }, [rows]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const arrow = (key: SortKey) =>
    key === sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  function handlePeriodClick(preset: PeriodPreset) {
    if (preset === 'custom') {
      // custom 모드 진입: 현재 범위 유지
      onPeriodChange('custom', { startDate: customFrom, endDate: customTo });
    } else {
      const range = periodToRange(preset);
      onPeriodChange(preset, range);
    }
  }

  function handleCustomApply() {
    onPeriodChange('custom', { startDate: customFrom, endDate: customTo });
  }

  function clearFilters() {
    setSymbol('');
    setSideFilter('all');
  }

  return (
    <section className="history">
      {/* 기간 프리셋 칩 */}
      <div className="hf-period-chips" role="tablist">
        {PERIOD_OPTIONS.map((o) => (
          <button
            key={o.key}
            role="tab"
            aria-selected={period === o.key}
            className={`hf-period-chip${period === o.key ? ' on' : ''}`}
            onClick={() => handlePeriodClick(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* 직접 지정 모드 날짜 입력 */}
      {period === 'custom' && (
        <div className="hf-custom-range">
          <label className="hf-date">
            <span>시작</span>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </label>
          <label className="hf-date">
            <span>종료</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </label>
          <button type="button" className="hf-clear" onClick={handleCustomApply}>
            조회
          </button>
        </div>
      )}

      {/* 종목/구분 필터 */}
      <div className="history-filters">
        <input
          type="search"
          className="hf-input"
          placeholder="종목명 또는 코드 검색"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          aria-label="종목 검색"
        />
        <select
          className="hf-input"
          value={sideFilter}
          onChange={(e) => setSideFilter(e.target.value as SideFilter)}
          aria-label="구분 필터"
        >
          <option value="all">전체 구분</option>
          <option value="buy_sell">매수/매도만</option>
          <option value="buy">매수</option>
          <option value="sell">매도</option>
          <option value="deposit">납입</option>
          <option value="withdrawal">인출</option>
        </select>
        {(symbol || sideFilter !== 'all') && (
          <button type="button" className="hf-clear" onClick={clearFilters}>
            필터 지우기
          </button>
        )}
      </div>

      {/* 요약 카드 — 선택 기간 기준 */}
      <div className="history-summary-cards">
        <div className="history-summary">
          <span>{totals.count}건</span>
          <span className={totals.realized > 0 ? 'pnl-up' : totals.realized < 0 ? 'pnl-down' : ''}>
            실현손익 {signedWon(totals.realized)}
          </span>
        </div>
        {totals.sellCount > 0 && (
          <div className="history-summary">
            <span>승률 {totals.winRate}%</span>
            <span className="muted">수수료 {won(totals.feeSum)}</span>
            <span className="muted">세금 {won(totals.taxSum)}</span>
          </div>
        )}
      </div>

      {loadingTrades ? (
        <p className="history-empty">거래를 불러오는 중...</p>
      ) : rows.length === 0 ? (
        <p className="history-empty">
          조건에 맞는 거래가 없습니다. 기간을 넓히거나 매매일지 탭에서 거래를 추가하세요.
        </p>
      ) : (
        <div className="history-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('executedAt')} className="sortable">
                  체결일시{arrow('executedAt')}
                </th>
                <th onClick={() => toggleSort('symbol')} className="sortable">
                  종목{arrow('symbol')}
                </th>
                <th>계좌</th>
                <th>구분</th>
                <th className="num">단가</th>
                <th className="num">수량</th>
                <th onClick={() => toggleSort('amount')} className="sortable num">
                  금액{arrow('amount')}
                </th>
                <th onClick={() => toggleSort('realizedPnl')} className="sortable num">
                  실현손익{arrow('realizedPnl')}
                </th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const isBuySell = t.side === 'buy' || t.side === 'sell';
                const pnl = t.realizedPnl;
                return (
                  <tr key={t.id}>
                    <td className="mono">{t.executedAt.slice(0, 16).replace('T', ' ')}</td>
                    <td>
                      <span className="sym">{t.symbol}</span>
                      {t.code && <span className="code">{t.code}</span>}
                    </td>
                    <td className="acct">{accountName.get(t.accountId) ?? '—'}</td>
                    <td>
                      <span className={`side side-${t.side}`}>{SIDE_LABEL[t.side]}</span>
                    </td>
                    <td className="num mono">{isBuySell ? won(t.price) : '—'}</td>
                    <td className="num mono">{isBuySell ? t.quantity.toLocaleString('ko-KR') : '—'}</td>
                    <td className="num mono">{won(t.amount)}</td>
                    <td className={`num mono ${pnl != null && pnl > 0 ? 'pnl-up' : pnl != null && pnl < 0 ? 'pnl-down' : ''}`}>
                      {t.side === 'sell' ? signedWon(pnl) : '—'}
                    </td>
                    <td className="reason">
                      {t.note?.reason ? (
                        <span title={t.note.reason}>{t.note.reason}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                      {t.note?.tags?.length ? (
                        <span className="tag-row">
                          {t.note.tags.map((tag) => (
                            <span key={tag} className="tag">{tag}</span>
                          ))}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
