// components/AnalysisNoteEditor.tsx
// 분석 노트 작성/편집 — 투자 논리, 목표가/손절가, 체크리스트, 회고 메모.
// 기존 InvestChecklist의 확장판: 상태 관리(draft→active→closed) + 회고 연동.

'use client';

import { useState } from 'react';
import type { Account, AnalysisNote, AnalysisStatus } from '../data/types';
import { INVEST_CHECKLIST } from '../data/reviewTemplates';

type CheckItem = { id: string; label: string; checked: boolean };

interface Props {
  accounts: Account[];
  defaultAccountId?: string;
  /** 편집 모드: 기존 노트 전달 시 수정 */
  note?: AnalysisNote;
  onSave: (note: Omit<AnalysisNote, 'id' | 'createdAt'>) => Promise<void> | void;
  onUpdate?: (id: string, patch: Partial<AnalysisNote>) => Promise<void> | void;
  onCancel?: () => void;
}

function freshChecklist(): CheckItem[] {
  return INVEST_CHECKLIST.map((t) => ({ id: t.id, label: t.label, checked: false }));
}

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  draft: '초안',
  active: '진행중',
  closed: '완료',
};

export default function AnalysisNoteEditor({
  accounts, defaultAccountId, note, onSave, onUpdate, onCancel,
}: Props) {
  const isEdit = !!note;
  const [accountId, setAccountId] = useState(note?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? '');
  const [symbol, setSymbol] = useState(note?.symbol ?? '');
  const [code, setCode] = useState(note?.code ?? '');
  const [thesis, setThesis] = useState(note?.thesis ?? '');
  const [targetPrice, setTargetPrice] = useState(note?.targetPrice?.toString() ?? '');
  const [stopPrice, setStopPrice] = useState(note?.stopPrice?.toString() ?? '');
  const [targetPct, setTargetPct] = useState(note?.targetPct?.toString() ?? '');
  const [checklist, setChecklist] = useState<CheckItem[]>(
    note?.checklist?.length ? note.checklist : freshChecklist(),
  );
  const [retroMemo, setRetroMemo] = useState(note?.retroMemo ?? '');
  const [analyzedAt, setAnalyzedAt] = useState(
    note?.analyzedAt ?? new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkedCount = checklist.filter((i) => i.checked).length;
  const uncheckedItems = checklist.filter((i) => !i.checked);

  function toggleItem(id: string) {
    setChecklist((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!accountId) return setError('계좌를 선택하세요.');
    if (!symbol.trim()) return setError('분석할 종목을 입력하세요.');
    if (!thesis.trim()) return setError('투자 논리를 입력하세요.');

    // 체크리스트 미완료 경고 (차단하지 않음)
    if (uncheckedItems.length > 0) {
      const ok = globalThis.confirm?.(
        `체크리스트 ${uncheckedItems.length}개 항목이 미완료입니다.\n` +
        uncheckedItems.map((i) => `  · ${i.label}`).join('\n') +
        '\n\n그래도 저장하시겠습니까?',
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      if (isEdit && onUpdate) {
        await onUpdate(note!.id, {
          symbol: symbol.trim(),
          code: code.trim() || undefined,
          thesis: thesis.trim(),
          targetPrice: targetPrice ? Number(targetPrice) : undefined,
          stopPrice: stopPrice ? Number(stopPrice) : undefined,
          targetPct: targetPct ? Number(targetPct) : undefined,
          checklist,
          retroMemo: retroMemo.trim() || undefined,
          analyzedAt,
        });
      } else {
        await onSave({
          accountId,
          symbol: symbol.trim(),
          code: code.trim() || undefined,
          status: 'draft',
          thesis: thesis.trim(),
          targetPrice: targetPrice ? Number(targetPrice) : undefined,
          stopPrice: stopPrice ? Number(stopPrice) : undefined,
          targetPct: targetPct ? Number(targetPct) : undefined,
          checklist,
          retroMemo: retroMemo.trim() || undefined,
          analyzedAt,
        });
        // 신규 저장 시 폼 초기화
        setSymbol('');
        setCode('');
        setThesis('');
        setTargetPrice('');
        setStopPrice('');
        setTargetPct('');
        setChecklist(freshChecklist());
        setRetroMemo('');
        setAnalyzedAt(new Date().toISOString().slice(0, 10));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="an-editor" onSubmit={handleSubmit}>
      {isEdit && (
        <div className="an-status-bar">
          <span className={`an-status-badge status-${note!.status}`}>
            {STATUS_LABEL[note!.status]}
          </span>
          {onCancel && (
            <button type="button" className="an-cancel" onClick={onCancel}>
              돌아가기
            </button>
          )}
        </div>
      )}

      <div className="an-grid">
        <label className="an-field">
          <span>계좌</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={isEdit}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label className="an-field">
          <span>종목명</span>
          <input value={symbol} placeholder="예: 삼성전자" onChange={(e) => setSymbol(e.target.value)} />
        </label>
        <label className="an-field">
          <span>종목코드 (선택)</span>
          <input value={code} placeholder="005930" onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="an-field">
          <span>분석일</span>
          <input type="date" value={analyzedAt} onChange={(e) => setAnalyzedAt(e.target.value)} />
        </label>
      </div>

      <label className="an-field an-thesis">
        <span>투자 논리</span>
        <textarea
          rows={3}
          value={thesis}
          placeholder="이 종목을 사려는 핵심 이유를 적어두세요."
          onChange={(e) => setThesis(e.target.value)}
        />
      </label>

      <div className="an-grid">
        <label className="an-field">
          <span>목표가</span>
          <input type="number" value={targetPrice} placeholder="0" onChange={(e) => setTargetPrice(e.target.value)} />
        </label>
        <label className="an-field">
          <span>손절가</span>
          <input type="number" value={stopPrice} placeholder="0" onChange={(e) => setStopPrice(e.target.value)} />
        </label>
        <label className="an-field">
          <span>목표 비중 (%)</span>
          <input type="number" value={targetPct} placeholder="5" onChange={(e) => setTargetPct(e.target.value)} />
        </label>
      </div>

      <div className="an-checklist">
        <div className="an-checklist-head">
          <span>체크리스트</span>
          <span className="an-progress">{checkedCount}/{checklist.length}</span>
        </div>
        <ul className="an-items">
          {checklist.map((it) => (
            <li key={it.id} className="an-item">
              <label>
                <input type="checkbox" checked={it.checked} onChange={() => toggleItem(it.id)} />
                <span>{it.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {(isEdit && note!.status === 'closed') && (
        <label className="an-field an-retro">
          <span>회고 메모</span>
          <textarea
            rows={3}
            value={retroMemo}
            placeholder="이번 거래에서 배운 점, 다음에 바꿀 한 가지를 적어두세요."
            onChange={(e) => setRetroMemo(e.target.value)}
          />
        </label>
      )}

      {error && <p className="an-error" role="alert">{error}</p>}

      <div className="an-actions">
        <button type="submit" className="an-submit" disabled={saving}>
          {saving ? '저장 중…' : isEdit ? '수정 저장' : '분석 노트 저장'}
        </button>
      </div>
    </form>
  );
}
