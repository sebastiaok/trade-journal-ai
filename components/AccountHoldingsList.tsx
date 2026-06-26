// components/AccountHoldingsList.tsx
// 공용 보유종목 목록 — 대시보드 계좌 펼침, 계좌관리 보유종목 패널에서 공유.
// 스펙: 종목명·수량·평단·평가금액·계좌 내 비중(%)·(시세 있으면)평가손익
//       합계 행, 평가금액 내림차순, 시세 미연동 안내.

'use client';

import { useMemo } from 'react';
import type { Holding, Ticker } from '../data/types';

interface Props {
  holdings: Holding[];
  priceMap: Record<string, number>;
  tickers: Ticker[];
}

export default function AccountHoldingsList({ holdings, priceMap, tickers }: Props) {
  if (holdings.length === 0) {
    return (
      <div className="ah-empty">
        <p>보유 종목 없음</p>
        <p className="ah-empty-hint">매매 기록 또는 증권사 연동으로 보유종목을 추가하세요.</p>
      </div>
    );
  }

  const tickerName = (h: Holding) => {
    if (h.code) {
      const t = tickers.find((tk) => tk.code === h.code);
      if (t) return t.name;
    }
    return h.symbol;
  };

  const won = (n: number) => n.toLocaleString('ko-KR') + '원';

  // 종목별 평가금액 계산 + 정렬
  const rows = useMemo(() => {
    const mapped = holdings.map((h) => {
      const curPrice = h.code ? priceMap[h.code] : undefined;
      const evalAmt = curPrice != null ? curPrice * h.quantity : h.avgCost * h.quantity;
      const costAmt = h.avgCost * h.quantity;
      const pnlAmt = curPrice != null ? evalAmt - costAmt : null;
      return { h, curPrice, evalAmt, costAmt, pnlAmt };
    });
    // 평가금액 내림차순
    mapped.sort((a, b) => b.evalAmt - a.evalAmt);
    return mapped;
  }, [holdings, priceMap]);

  const totalEval = rows.reduce((s, r) => s + r.evalAmt, 0);
  const hasPriceData = rows.some((r) => r.curPrice != null);

  return (
    <div className="ah-list">
      <table className="ah-table">
        <thead>
          <tr>
            <th>종목명</th>
            <th className="num">수량</th>
            <th className="num">평단</th>
            <th className="num">평가금액</th>
            <th className="num">비중</th>
            {hasPriceData && <th className="num">평가손익</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ h, evalAmt, pnlAmt }) => {
            const weightPct = totalEval > 0 ? (evalAmt / totalEval) * 100 : 0;
            return (
              <tr key={h.id} className="ah-row">
                <td>{tickerName(h)}</td>
                <td className="num mono">{h.quantity.toLocaleString('ko-KR')}</td>
                <td className="num mono">{won(h.avgCost)}</td>
                <td className="num mono">{won(evalAmt)}</td>
                <td className="num mono">{weightPct.toFixed(1)}%</td>
                {hasPriceData && (
                  <td className={`num mono ${pnlAmt != null ? (pnlAmt > 0 ? 'pnl-up' : pnlAmt < 0 ? 'pnl-down' : '') : 'muted'}`}>
                    {pnlAmt != null
                      ? `${pnlAmt > 0 ? '+' : ''}${won(pnlAmt)}`
                      : '-'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="ah-footer">
            <td><strong>{rows.length}종목</strong></td>
            <td></td>
            <td></td>
            <td className="num mono"><strong>{won(totalEval)}</strong></td>
            <td className="num mono">100%</td>
            {hasPriceData && <td></td>}
          </tr>
        </tfoot>
      </table>
      {!hasPriceData && (
        <p className="ah-basis-note">시세 미연동 — 취득원가(평단) 기준 평가</p>
      )}
    </div>
  );
}
