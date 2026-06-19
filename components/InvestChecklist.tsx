// components/InvestChecklist.tsx
// 투자 검토 탭 — 매수 전 체크리스트 작성 + 저장된 검토 기록 열람.
// 결론(watch/buy/pass)과 목표가·손절가·비중·시나리오를 함께 기록.

'use client';

import { useState } from 'react';
import type { Account, InvestCheck } from '../data/types';
import { INVEST_CHECKLIST } from '../data/reviewTemplates';

interface Props {
  accounts: Account[];
  checks: InvestCheck[];
  defaultAccountId?: string;
  onAdd: (c: Omit<InvestCheck, 'id' | 'createdAt'>) => void;
  onRemove: (id: string) => void;
}

type ItemState = { id: string; label: string; checked: boolean; comment?: string };

const DECISION_LABEL: Record<string, string> = {
  watch: '관찰',
  buy: '매수',
  pass: '보류',
};

function freshItems(): ItemState[] {
  return INVEST_CHECKLIST.map((t) => ({ id: t.id, label: t.label, checked: false }));
}

export default function InvestChecklist({ accounts, checks, defaultAccountId, onAdd, onRemove }: Props) {
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '');
  const [symbol, setSymbol] = useState('');
  const [items, setItems] = useState<ItemState[]>(freshItems());
  const [targetPrice, setTargetPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [weight, setWeight] = useState('');
  const [scenario, setScenario] = useState('');
  const [decision, setDecision] = useState<'watch' | 'buy' | 'pass'>('watch');
  const [error, setError] = useState<string | null>(null);

  const checkedCount = items.filter((i) => i.checked).length;

  function toggle(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
  }

  function reset() {
    setSymbol('');
    setItems(freshItems());
    setTargetPrice('');
    setStopLoss('');
    setWeight('');
    setScenario('');
    setDecision('watch');
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) {
      setError('계좌를 선택하세요.');
      return;
    }
    if (!symbol.trim()) {
      setError('검토할 종목을 입력하세요.');
      return;
    }
    onAdd({
      accountId,
      symbol: symbol.trim(),
      items,
      targetPrice: targetPrice ? Number(targetPrice) : undefined,
      stopLoss: stopLoss ? Number(stopLoss) : undefined,
      weight: weight ? Number(weight) : undefined,
      scenario: scenario.trim() || undefined,
      decision,
    });
    reset();
  }

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div className="invest">
      <form className="invest-form" onSubmit={handleSubmit}>
        <div className="invest-row">
          <label className="invest-field">
            <span>계좌</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="invest-field invest-symbol">
            <span>검토 종목</span>
            <input value={symbol} placeholder="예: 삼성전자" onChange={(e) => setSymbol(e.target.value)} />
          </label>
        </div>

        <div className="invest-checklist">
          <div className="invest-checklist-head">
            <span>체크리스트</span>
            <span className="invest-progress">{checkedCount}/{items.length}</span>
          </div>
          <ul className="invest-items">
            {items.map((it) => (
              <li key={it.id} className="invest-item">
                <label>
                  <input type="checkbox" checked={it.checked} onChange={() => toggle(it.id)} />
                  <span>{it.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="invest-row">
          <label className="invest-field">
            <span>목표가</span>
            <input type="number" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} />
          </label>
          <label className="invest-field">
            <span>손절가</span>
            <input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
          </label>
          <label className="invest-field">
            <span>비중(%)</span>
            <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
        </div>

        <label className="invest-field">
          <span>진입 시나리오</span>
          <textarea
            rows={2}
            value={scenario}
            placeholder="어떤 조건에서 진입하고, 무엇이 깨지면 나올지 적어두세요."
            onChange={(e) => setScenario(e.target.value)}
          />
        </label>

        <div className="invest-decision">
          <span>결론</span>
          <div className="seg">
            {(['watch', 'buy', 'pass'] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-selected={decision === d}
                className={decision === d ? 'on' : ''}
                onClick={() => setDecision(d)}
              >
                {DECISION_LABEL[d]}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="invest-error" role="alert">{error}</p>}

        <div className="invest-actions">
          <button type="submit" className="invest-submit">검토 저장</button>
        </div>
      </form>

      {checks.length > 0 && (
        <div className="invest-history">
          <h3 className="invest-history-title">검토 기록</h3>
          <ul className="invest-history-list">
            {checks.map((c) => {
              const done = c.items.filter((i) => i.checked).length;
              return (
                <li key={c.id} className="invest-history-item">
                  <div className="invest-history-main">
                    <span className="invest-history-symbol">{c.symbol}</span>
                    <span className={`invest-badge decision-${c.decision ?? 'watch'}`}>
                      {DECISION_LABEL[c.decision ?? 'watch']}
                    </span>
                    <span className="invest-history-meta">
                      {accountName.get(c.accountId) ?? ''} · 체크 {done}/{c.items.length}
                      {c.targetPrice ? ` · 목표 ${c.targetPrice.toLocaleString('ko-KR')}` : ''}
                      {c.stopLoss ? ` · 손절 ${c.stopLoss.toLocaleString('ko-KR')}` : ''}
                    </span>
                  </div>
                  <button type="button" className="invest-del" onClick={() => onRemove(c.id)}>
                    삭제
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
