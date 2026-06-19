// components/HistoryTable.tsx
// 매매내역(history) 탭 — 저장된 거래를 읽기 전용으로 조회.
// 계좌/종목/기간/구분 필터 + 컬럼 정렬. 편집은 매매일지 탭에서 한다.

'use client';

import { useMemo, useState } from 'react';
import type { Account, Trade, Side } from '../data/types';

interface Props {
  trades: Trade[];
  accounts: Account[];
  /** 상단 계좌 드롭다운에서 고른 값. 'all'이면 전체 */
  accountId: string | 'all';
}

type SortKey = 'executedAt' | 'symbol' | 'amount' | 'realizedPnl';
type SortDir = 'asc' | 'desc';

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

export default function HistoryTable({ trades, accounts, accountId }: Props) {
  const [symbol, setSymbol] = useState('');
  const [sideFilter, setSideFilter] = useState<Side | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('executedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const accountName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

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
    if (sideFilter !== 'all') r = r.filter((t) => t.side === sideFilter);
    if (from) r = r.filter((t) => t.executedAt.slice(0, 10) >= from);
    if (to) r = r.filter((t) => t.executedAt.slice(0, 10) <= to);

    r.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortKey) {
        case 'symbol':
          av = a.symbol;
          bv = b.symbol;
          break;
        case 'amount':
          av = a.amount;
          bv = b.amount;
          break;
        case 'realizedPnl':
          av = a.realizedPnl ?? -Infinity;
          bv = b.realizedPnl ?? -Infinity;
          break;
        default:
          av = a.executedAt;
          bv = b.executedAt;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return r;
  }, [trades, accountId, symbol, sideFilter, from, to, sortKey, sortDir]);

  const totals = useMemo(() => {
    const realized = rows.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
    return { count: rows.length, realized };
  }, [rows]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const arrow = (key: SortKey) =>
    key === sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  function clearFilters() {
    setSymbol('');
    setSideFilter('all');
    setFrom('');
    setTo('');
  }

  return (
    <section className="history">
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
          onChange={(e) => setSideFilter(e.target.value as Side | 'all')}
          aria-label="구분 필터"
        >
          <option value="all">전체 구분</option>
          <option value="buy">매수</option>
          <option value="sell">매도</option>
          <option value="deposit">납입</option>
          <option value="withdrawal">인출</option>
        </select>
        <label className="hf-date">
          <span>시작</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="hf-date">
          <span>종료</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="hf-clear" onClick={clearFilters}>
          필터 지우기
        </button>
      </div>

      <div className="history-summary">
        <span>{totals.count}건</span>
        <span className={totals.realized > 0 ? 'pnl-up' : totals.realized < 0 ? 'pnl-down' : ''}>
          실현손익 {signedWon(totals.realized)}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="history-empty">
          조건에 맞는 거래가 없습니다. 매매일지 탭에서 거래를 추가하세요.
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
                const isTrade = t.side === 'buy' || t.side === 'sell';
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
                    <td className="num mono">{isTrade ? won(t.price) : '—'}</td>
                    <td className="num mono">{isTrade ? t.quantity.toLocaleString('ko-KR') : '—'}</td>
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
