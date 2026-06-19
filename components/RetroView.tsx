// components/RetroView.tsx
// 회고 뷰 — 분석 노트의 예측(목표가/손절가) vs 실제(매도가/실현손익) 비교.
// 자동 판정 라벨 + 회고 메모 입력.

'use client';

import { useMemo, useState } from 'react';
import type { AnalysisNote, Trade, RetroLabel } from '../data/types';

interface Props {
  note: AnalysisNote;
  trades: Trade[];
  onUpdate: (id: string, patch: Partial<AnalysisNote>) => Promise<void> | void;
  onBack: () => void;
}

const won = (n: number) => n.toLocaleString('ko-KR') + '원';

/** 예측 vs 실제 자동 판정 */
function judgeRetro(
  targetPrice: number | undefined,
  stopPrice: number | undefined,
  avgSellPrice: number,
): RetroLabel {
  if (targetPrice != null && avgSellPrice >= targetPrice) return '목표 달성';
  if (stopPrice != null && avgSellPrice <= stopPrice) return '손절 실행';
  if (targetPrice != null && stopPrice != null) {
    // 손절가 초과하고 목표가 미달 → 중간 청산
    if (avgSellPrice > stopPrice && avgSellPrice < targetPrice) return '중간 청산';
  }
  if (targetPrice != null && avgSellPrice < targetPrice) return '조기 익절';
  return '중간 청산';
}

export default function RetroView({ note, trades, onUpdate, onBack }: Props) {
  const [retroMemo, setRetroMemo] = useState(note.retroMemo ?? '');
  const [saving, setSaving] = useState(false);

  // 연결된 매매
  const linked = useMemo(
    () => trades.filter((t) => t.analysisId === note.id),
    [trades, note.id],
  );
  const buys = linked.filter((t) => t.side === 'buy');
  const sells = linked.filter((t) => t.side === 'sell');

  // 매수 평단가, 매도 평단가
  const avgBuyPrice = useMemo(() => {
    const totalQty = buys.reduce((s, t) => s + t.quantity, 0);
    if (totalQty === 0) return 0;
    return buys.reduce((s, t) => s + t.price * t.quantity, 0) / totalQty;
  }, [buys]);

  const avgSellPrice = useMemo(() => {
    const totalQty = sells.reduce((s, t) => s + t.quantity, 0);
    if (totalQty === 0) return 0;
    return sells.reduce((s, t) => s + t.price * t.quantity, 0) / totalQty;
  }, [sells]);

  const totalPnl = sells.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const totalBuyQty = buys.reduce((s, t) => s + t.quantity, 0);
  const totalSellQty = sells.reduce((s, t) => s + t.quantity, 0);

  // 자동 판정
  const autoLabel = useMemo(() => {
    if (sells.length === 0) return null;
    return judgeRetro(note.targetPrice, note.stopPrice, avgSellPrice);
  }, [note.targetPrice, note.stopPrice, avgSellPrice, sells.length]);

  const currentLabel = note.retroLabel ?? autoLabel;

  async function handleSaveRetro() {
    setSaving(true);
    try {
      await onUpdate(note.id, {
        retroMemo: retroMemo.trim() || undefined,
        retroLabel: autoLabel ?? undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="retro">
      <div className="retro-head">
        <button type="button" className="an-cancel" onClick={onBack}>← 목록으로</button>
        <h3 className="retro-title">
          {note.symbol} 회고
          <span className={`an-status-badge status-${note.status}`}>
            {note.status === 'closed' ? '완료' : note.status === 'active' ? '진행중' : '초안'}
          </span>
        </h3>
      </div>

      {/* 투자 논리 요약 */}
      {note.thesis && (
        <div className="retro-section">
          <h4>투자 논리</h4>
          <p className="retro-thesis">{note.thesis}</p>
        </div>
      )}

      {/* 예측 vs 실제 카드 */}
      <div className="retro-compare">
        <div className="retro-card">
          <h4>예측 (분석 시점)</h4>
          <div className="retro-row">
            <span>목표가</span>
            <span className="mono">{note.targetPrice != null ? won(note.targetPrice) : '—'}</span>
          </div>
          <div className="retro-row">
            <span>손절가</span>
            <span className="mono">{note.stopPrice != null ? won(note.stopPrice) : '—'}</span>
          </div>
          <div className="retro-row">
            <span>목표 비중</span>
            <span className="mono">{note.targetPct != null ? `${note.targetPct}%` : '—'}</span>
          </div>
        </div>

        <div className="retro-card">
          <h4>실제 (매매 결과)</h4>
          <div className="retro-row">
            <span>매수 평단가</span>
            <span className="mono">{avgBuyPrice > 0 ? won(Math.round(avgBuyPrice)) : '—'}</span>
          </div>
          <div className="retro-row">
            <span>매도 평단가</span>
            <span className="mono">{avgSellPrice > 0 ? won(Math.round(avgSellPrice)) : '—'}</span>
          </div>
          <div className="retro-row">
            <span>매수 수량</span>
            <span className="mono">{totalBuyQty > 0 ? `${totalBuyQty.toLocaleString()}주` : '—'}</span>
          </div>
          <div className="retro-row">
            <span>매도 수량</span>
            <span className="mono">{totalSellQty > 0 ? `${totalSellQty.toLocaleString()}주` : '—'}</span>
          </div>
          <div className="retro-row retro-pnl">
            <span>실현손익</span>
            <span className={`mono ${totalPnl > 0 ? 'pnl-up' : totalPnl < 0 ? 'pnl-down' : ''}`}>
              {sells.length > 0 ? (totalPnl > 0 ? '+' : '') + won(totalPnl) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 자동 판정 라벨 */}
      {currentLabel && (
        <div className="retro-label-bar">
          <span className={`retro-label label-${retroLabelClass(currentLabel)}`}>
            {currentLabel}
          </span>
          {note.targetPrice != null && avgSellPrice > 0 && (
            <span className="retro-detail">
              {avgSellPrice >= note.targetPrice
                ? `목표가 대비 +${Math.round(((avgSellPrice - note.targetPrice) / note.targetPrice) * 100)}% 초과 달성`
                : `목표가 대비 ${Math.round(((avgSellPrice - note.targetPrice) / note.targetPrice) * 100)}%`}
            </span>
          )}
        </div>
      )}

      {/* 체크리스트 결과 */}
      <div className="retro-section">
        <h4>체크리스트 이행</h4>
        <ul className="an-items retro-checklist">
          {note.checklist.map((it) => (
            <li key={it.id} className={`an-item ${it.checked ? 'checked' : 'unchecked'}`}>
              <span>{it.checked ? '✓' : '✗'}</span>
              <span>{it.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 연결된 매매 내역 */}
      {linked.length > 0 && (
        <div className="retro-section">
          <h4>연결된 매매 ({linked.length}건)</h4>
          <div className="retro-trades">
            {linked.map((t) => (
              <div key={t.id} className="retro-trade-row">
                <span className={`side side-${t.side}`}>{t.side === 'buy' ? '매수' : '매도'}</span>
                <span className="mono">{t.executedAt.slice(0, 10)}</span>
                <span className="mono">{won(t.price)}</span>
                <span className="mono">{t.quantity.toLocaleString()}주</span>
                {t.side === 'sell' && t.realizedPnl != null && (
                  <span className={`mono ${t.realizedPnl > 0 ? 'pnl-up' : 'pnl-down'}`}>
                    {t.realizedPnl > 0 ? '+' : ''}{won(t.realizedPnl)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 회고 메모 */}
      <div className="retro-section">
        <h4>회고 메모</h4>
        <textarea
          className="retro-memo"
          rows={3}
          value={retroMemo}
          placeholder="이번 거래에서 배운 점, 다음에 바꿀 한 가지를 적어두세요."
          onChange={(e) => setRetroMemo(e.target.value)}
        />
        <button
          type="button"
          className="an-submit retro-save"
          disabled={saving}
          onClick={handleSaveRetro}
        >
          {saving ? '저장 중…' : '회고 저장'}
        </button>
      </div>
    </div>
  );
}

function retroLabelClass(label: string): string {
  if (label === '목표 달성') return 'success';
  if (label === '손절 실행' || label === '손절 미준수') return 'danger';
  return 'warning';
}
