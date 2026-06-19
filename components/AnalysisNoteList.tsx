// components/AnalysisNoteList.tsx
// 분석 노트 목록 — 상태 필터(draft/active/closed) + 종목 검색 + 연결 매매 요약.

'use client';

import { useMemo, useState } from 'react';
import type { Account, AnalysisNote, AnalysisStatus, Trade, RealizedPnlRow } from '../data/types';

interface Props {
  notes: AnalysisNote[];
  trades: Trade[];
  realizedPnl: RealizedPnlRow[];
  accounts: Account[];
  accountId: string | 'all';
  onSelect: (note: AnalysisNote) => void;
  onClose: (noteId: string) => void;
  onRemove: (noteId: string) => void;
}

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  draft: '초안',
  active: '진행중',
  closed: '완료',
};

const won = (n: number) => n.toLocaleString('ko-KR') + '원';

export default function AnalysisNoteList({
  notes, trades, realizedPnl, accounts, accountId, onSelect, onClose, onRemove,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<AnalysisStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const accountName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  // 분석 노트에 연결된 매매의 실현손익 합산
  const notePnl = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of notes) {
      const linked = trades.filter((t) => t.analysisId === note.id && t.side === 'sell');
      const pnl = linked.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
      map.set(note.id, pnl);
    }
    return map;
  }, [notes, trades]);

  // 연결 매매 수
  const noteTradeCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of notes) {
      map.set(note.id, trades.filter((t) => t.analysisId === note.id).length);
    }
    return map;
  }, [notes, trades]);

  const filtered = useMemo(() => {
    let list = notes.slice();
    if (accountId !== 'all') list = list.filter((n) => n.accountId === accountId);
    if (statusFilter !== 'all') list = list.filter((n) => n.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((n) =>
        n.symbol.toLowerCase().includes(q) ||
        (n.code ?? '').toLowerCase().includes(q) ||
        (n.thesis ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [notes, accountId, statusFilter, search]);

  return (
    <div className="an-list">
      <div className="an-list-filters">
        <input
          type="search"
          className="hf-input"
          placeholder="종목명 또는 투자 논리 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="seg">
          {(['all', 'draft', 'active', 'closed'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-selected={statusFilter === s}
              className={statusFilter === s ? 'on' : ''}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? '전체' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="an-empty">
          {notes.length === 0
            ? '분석 노트가 없습니다. 새 분석을 작성하세요.'
            : '조건에 맞는 분석 노트가 없습니다.'}
        </p>
      ) : (
        <ul className="an-items-list">
          {filtered.map((n) => {
            const pnl = notePnl.get(n.id) ?? 0;
            const tradeCount = noteTradeCount.get(n.id) ?? 0;
            const checkedCount = n.checklist.filter((c) => c.checked).length;
            return (
              <li key={n.id} className="an-list-item">
                <button type="button" className="an-list-main" onClick={() => onSelect(n)}>
                  <div className="an-list-top">
                    <span className="an-list-symbol">{n.symbol}</span>
                    {n.code && <span className="an-list-code">{n.code}</span>}
                    <span className={`an-status-badge status-${n.status}`}>
                      {STATUS_LABEL[n.status]}
                    </span>
                  </div>
                  <div className="an-list-meta">
                    <span>{accountName.get(n.accountId) ?? ''}</span>
                    <span>{n.analyzedAt}</span>
                    <span>체크 {checkedCount}/{n.checklist.length}</span>
                    {tradeCount > 0 && <span>매매 {tradeCount}건</span>}
                    {n.targetPrice != null && <span>목표 {won(n.targetPrice)}</span>}
                    {n.stopPrice != null && <span>손절 {won(n.stopPrice)}</span>}
                  </div>
                  {n.status === 'closed' && pnl !== 0 && (
                    <div className={`an-list-pnl ${pnl > 0 ? 'pnl-up' : 'pnl-down'}`}>
                      실현손익 {pnl > 0 ? '+' : ''}{won(pnl)}
                      {n.retroLabel && (
                        <span className={`an-retro-label label-${retroLabelClass(n.retroLabel)}`}>
                          {n.retroLabel}
                        </span>
                      )}
                    </div>
                  )}
                  {n.thesis && (
                    <p className="an-list-thesis">{n.thesis}</p>
                  )}
                </button>
                <div className="an-list-actions">
                  {n.status === 'active' && (
                    <button type="button" className="an-btn-close" onClick={() => onClose(n.id)}>
                      종료
                    </button>
                  )}
                  <button type="button" className="an-btn-del" onClick={() => onRemove(n.id)}>
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function retroLabelClass(label: string): string {
  if (label === '목표 달성') return 'success';
  if (label === '손절 실행' || label === '손절 미준수') return 'danger';
  return 'warning';
}
