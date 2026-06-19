// components/OpeningLotForm.tsx
// 보유 스냅샷 입력 — 기존 보유 종목을 source='opening' 가상 매수 거래로 등록.
// FIFO 계산의 시작점이 된다.

'use client';

import { useState } from 'react';
import type { Account, Trade } from '../data/types';

interface Props {
  accounts: Account[];
  defaultAccountId?: string;
  onSubmit: (trades: Omit<Trade, 'id'>[]) => void;
}

interface LotRow {
  symbol: string;
  code: string;
  price: number;
  quantity: number;
}

const emptyRow = (): LotRow => ({ symbol: '', code: '', price: 0, quantity: 0 });

export default function OpeningLotForm({ accounts, defaultAccountId, onSubmit }: Props) {
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '');
  const [rows, setRows] = useState<LotRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);

  function updateRow(idx: number, patch: Partial<LotRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!accountId) { setError('계좌를 선택하세요.'); return; }

    const valid = rows.filter((r) => r.symbol.trim() && r.price > 0 && r.quantity > 0);
    if (valid.length === 0) {
      setError('종목명, 평단가, 수량을 모두 입력한 행이 1개 이상 필요합니다.');
      return;
    }

    const trades: Omit<Trade, 'id'>[] = valid.map((r) => ({
      accountId,
      symbol: r.symbol.trim(),
      code: r.code.trim() || undefined,
      side: 'buy' as const,
      price: r.price,
      quantity: r.quantity,
      amount: r.price * r.quantity,
      fee: 0,
      tax: 0,
      executedAt: new Date().toISOString(),
      source: 'opening' as const,
      confidence: 1,
      taxDeductible: true,
      note: { tags: [], reason: '보유 스냅샷 (Opening Lot)' },
    }));

    onSubmit(trades);
    setRows([emptyRow()]);
  }

  const won = (n: number) => n.toLocaleString('ko-KR');

  return (
    <form className="olf" onSubmit={handleSubmit}>
      <h3 className="olf-title">보유 스냅샷 입력</h3>
      <p className="olf-desc">
        현재 보유 중인 종목의 평단가와 수량을 입력하세요.
        <code>source=&apos;opening&apos;</code> 가상 매수 거래로 등록되어 FIFO 손익 계산의 시작점이 됩니다.
      </p>

      <label className="mtf-field" style={{ maxWidth: 240 }}>
        <span>계좌</span>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>

      <div className="olf-table-wrap">
        <table className="olf-table">
          <thead>
            <tr>
              <th>종목명</th>
              <th>종목코드</th>
              <th className="num">평단가</th>
              <th className="num">수량</th>
              <th className="num">평가금액</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    value={r.symbol}
                    placeholder="삼성전자"
                    onChange={(e) => updateRow(i, { symbol: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.code}
                    placeholder="005930"
                    onChange={(e) => updateRow(i, { code: e.target.value })}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={r.price || ''}
                    onChange={(e) => updateRow(i, { price: Number(e.target.value) })}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={r.quantity || ''}
                    onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })}
                  />
                </td>
                <td className="num mono">{won(r.price * r.quantity)}원</td>
                <td>
                  {rows.length > 1 && (
                    <button type="button" className="trt-del" onClick={() => removeRow(i)}>×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" className="olf-add" onClick={addRow}>
        + 종목 추가
      </button>

      {error && <p className="mtf-error" role="alert">{error}</p>}

      <div className="mtf-actions">
        <button type="submit" className="mtf-submit">
          보유 스냅샷 저장 ({rows.filter((r) => r.symbol.trim() && r.price > 0 && r.quantity > 0).length}건)
        </button>
      </div>
    </form>
  );
}
