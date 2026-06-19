// components/TradeReviewTable.tsx
// 인식 결과 검증 테이블 (Human-in-the-loop).
// 비전 인식으로 만든 Trade 초안을 사용자가 셀 단위로 고친 뒤 저장한다.
// confidence < 0.7 행은 경고 색으로 강조하고, 저장 전 확인을 요구한다.

'use client';

import { useState } from 'react';
import type { Trade, Side } from '../data/types';

type Draft = Omit<Trade, 'id'>;

interface Props {
  draft: Draft[];
  onChange: (next: Draft[]) => void;
  onSave: (rows: Draft[]) => void;
  onCancel: () => void;
}

const LOW_CONFIDENCE = 0.7;

const SIDES: { value: Side; label: string }[] = [
  { value: 'buy', label: '매수' },
  { value: 'sell', label: '매도' },
  { value: 'deposit', label: '납입' },
  { value: 'withdrawal', label: '인출' },
];

export default function TradeReviewTable({ draft, onChange, onSave, onCancel }: Props) {
  const [confirmLow, setConfirmLow] = useState(false);

  function update(i: number, patch: Partial<Draft>) {
    const next = draft.map((row, idx) => {
      if (idx !== i) return row;
      const merged = { ...row, ...patch };
      // 단가·수량 변경 시 금액 자동 갱신 (매수/매도)
      if ((patch.price !== undefined || patch.quantity !== undefined) &&
          (merged.side === 'buy' || merged.side === 'sell')) {
        merged.amount = merged.price * merged.quantity;
      }
      // 사용자가 직접 고친 셀은 신뢰도를 1로 본다
      merged.confidence = 1;
      return merged;
    });
    onChange(next);
  }

  function removeRow(i: number) {
    onChange(draft.filter((_, idx) => idx !== i));
  }

  const lowCount = draft.filter((r) => (r.confidence ?? 1) < LOW_CONFIDENCE).length;

  function handleSave() {
    if (lowCount > 0 && !confirmLow) {
      setConfirmLow(true);
      return;
    }
    onSave(draft);
  }

  if (draft.length === 0) {
    return <p className="trt-empty">인식된 거래가 없습니다. 다른 이미지를 시도하거나 수기로 입력하세요.</p>;
  }

  return (
    <div className="trt">
      <div className="trt-head">
        <span>{draft.length}건 인식됨</span>
        {lowCount > 0 && <span className="trt-warn">확인 필요 {lowCount}건</span>}
      </div>

      <div className="trt-scroll">
        <table className="trt-table">
          <thead>
            <tr>
              <th>종목</th>
              <th>구분</th>
              <th className="num">단가</th>
              <th className="num">수량</th>
              <th className="num">금액</th>
              <th>체결일시</th>
              <th>신뢰도</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.map((r, i) => {
              const low = (r.confidence ?? 1) < LOW_CONFIDENCE;
              return (
                <tr key={i} className={low ? 'trt-row-low' : ''}>
                  <td>
                    <input
                      value={r.symbol}
                      onChange={(e) => update(i, { symbol: e.target.value })}
                      placeholder="종목명"
                    />
                  </td>
                  <td>
                    <select value={r.side} onChange={(e) => update(i, { side: e.target.value as Side })}>
                      {SIDES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      value={r.price || ''}
                      onChange={(e) => update(i, { price: Number(e.target.value) })}
                    />
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      value={r.quantity || ''}
                      onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td className="num mono">{r.amount.toLocaleString('ko-KR')}</td>
                  <td>
                    <input
                      type="datetime-local"
                      value={r.executedAt.slice(0, 16)}
                      onChange={(e) => update(i, { executedAt: new Date(e.target.value).toISOString() })}
                    />
                  </td>
                  <td>
                    <span className={`trt-conf ${low ? 'low' : 'ok'}`}>
                      {low ? '확인' : '양호'}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="trt-del" onClick={() => removeRow(i)} aria-label="행 삭제">
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmLow && lowCount > 0 && (
        <p className="trt-confirm">
          확인이 필요한 {lowCount}건이 있습니다. 그대로 저장하려면 한 번 더 누르세요.
        </p>
      )}

      <div className="trt-actions">
        <button type="button" className="trt-cancel" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="trt-save" onClick={handleSave}>
          {confirmLow && lowCount > 0 ? '확인하고 저장' : '검증 완료 · 저장'}
        </button>
      </div>
    </div>
  );
}
