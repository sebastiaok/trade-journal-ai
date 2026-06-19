// components/ManualTradeForm.tsx
// 매매일지(journal) 탭 — 수기 입력 폼.
// 종목·구분·단가·수량·수수료·세금·체결일시 + 매매 사유(필수 권장) + 근거 태그.
// deposit/withdrawal 선택 시 단가/수량 대신 금액만 받는다.

'use client';

import { useState } from 'react';
import {
  type Account,
  type Trade,
  type Side,
  type Emotion,
  REASON_TAGS,
  emptyTrade,
} from '../data/types';

interface Props {
  accounts: Account[];
  /** 상단에서 고른 계좌 (없으면 첫 계좌 기본) */
  defaultAccountId?: string;
  /** 저장 시 부모가 id 부여 후 영속 */
  onSubmit: (trade: Omit<Trade, 'id'>) => void;
}

const SIDES: { value: Side; label: string }[] = [
  { value: 'buy', label: '매수' },
  { value: 'sell', label: '매도' },
  { value: 'deposit', label: '납입' },
  { value: 'withdrawal', label: '인출' },
];

const EMOTIONS: { value: Emotion; label: string }[] = [
  { value: 'calm', label: '차분' },
  { value: 'fomo', label: '추격(FOMO)' },
  { value: 'fear', label: '공포' },
  { value: 'greedy', label: '과욕' },
  { value: 'revenge', label: '복수심' },
];

const isCashEvent = (s: Side) => s === 'deposit' || s === 'withdrawal';

export default function ManualTradeForm({ accounts, defaultAccountId, onSubmit }: Props) {
  const firstAccount = defaultAccountId ?? accounts[0]?.id ?? '';
  const [form, setForm] = useState<Omit<Trade, 'id'>>(emptyTrade(firstAccount));
  const [error, setError] = useState<string | null>(null);

  const cash = isCashEvent(form.side);

  function set<K extends keyof Trade>(key: K, value: Trade[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setNote<K extends keyof NonNullable<Trade['note']>>(
    key: K,
    value: NonNullable<Trade['note']>[K],
  ) {
    setForm((f) => ({
      ...f,
      note: { ...(f.note ?? { tags: [] }), [key]: value },
    }));
  }

  function toggleTag(tag: string) {
    setForm((f) => {
      const tags = f.note?.tags ?? [];
      const next = tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag];
      return { ...f, note: { ...(f.note ?? { tags: [] }), tags: next } };
    });
  }

  function handleSubmit() {
    setError(null);

    if (!form.accountId) return setError('계좌를 선택하세요.');
    if (!cash && !form.symbol.trim()) return setError('종목명을 입력하세요.');
    if (!cash && (form.price <= 0 || form.quantity <= 0))
      return setError('단가와 수량을 0보다 크게 입력하세요.');
    if (cash && form.amount <= 0) return setError('금액을 0보다 크게 입력하세요.');
    if (!form.note?.reason?.trim())
      return setError('매매 사유를 입력하세요. (복기에 꼭 필요합니다)');

    const amount = cash ? form.amount : form.price * form.quantity;
    onSubmit({
      ...form,
      symbol: cash && !form.symbol.trim() ? '현금' : form.symbol.trim(),
      amount,
      source: 'manual',
      confidence: 1,
      executedAt: new Date(form.executedAt).toISOString(),
    });

    // 사유/태그는 비우되 계좌·구분은 유지해 연속 입력 편하게
    setForm({ ...emptyTrade(form.accountId), side: form.side });
  }

  return (
    <form
      className="mtf"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div className="mtf-grid">
        <label className="mtf-field">
          <span>계좌</span>
          <select value={form.accountId} onChange={(e) => set('accountId', e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mtf-field">
          <span>구분</span>
          <select value={form.side} onChange={(e) => set('side', e.target.value as Side)}>
            {SIDES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mtf-field">
          <span>체결일시</span>
          <input
            type="datetime-local"
            value={form.executedAt.slice(0, 16)}
            onChange={(e) => set('executedAt', e.target.value)}
          />
        </label>

        {!cash && (
          <label className="mtf-field">
            <span>종목명</span>
            <input
              type="text"
              value={form.symbol}
              placeholder="예: 삼성전자"
              onChange={(e) => set('symbol', e.target.value)}
            />
          </label>
        )}

        {!cash && (
          <label className="mtf-field">
            <span>종목코드 (선택)</span>
            <input
              type="text"
              value={form.code ?? ''}
              placeholder="005930"
              onChange={(e) => set('code', e.target.value)}
            />
          </label>
        )}

        {!cash ? (
          <>
            <label className="mtf-field">
              <span>체결단가</span>
              <input
                type="number"
                inputMode="numeric"
                value={form.price || ''}
                onChange={(e) => {
                  const price = Number(e.target.value);
                  setForm((f) => ({ ...f, price, amount: price * f.quantity }));
                }}
              />
            </label>
            <label className="mtf-field">
              <span>수량</span>
              <input
                type="number"
                inputMode="numeric"
                value={form.quantity || ''}
                onChange={(e) => {
                  const quantity = Number(e.target.value);
                  setForm((f) => ({ ...f, quantity, amount: f.price * quantity }));
                }}
              />
            </label>
          </>
        ) : (
          <label className="mtf-field">
            <span>금액</span>
            <input
              type="number"
              inputMode="numeric"
              value={form.amount || ''}
              onChange={(e) => set('amount', Number(e.target.value))}
            />
          </label>
        )}

        <label className="mtf-field">
          <span>수수료</span>
          <input
            type="number"
            inputMode="numeric"
            value={form.fee || ''}
            onChange={(e) => set('fee', Number(e.target.value))}
          />
        </label>

        {form.side === 'sell' && (
          <label className="mtf-field">
            <span>세금</span>
            <input
              type="number"
              inputMode="numeric"
              value={form.tax || ''}
              onChange={(e) => set('tax', Number(e.target.value))}
            />
          </label>
        )}
      </div>

      {!cash && (
        <div className="mtf-amount-preview">
          체결금액 {(form.price * form.quantity).toLocaleString('ko-KR')}원
        </div>
      )}

      {/* 매매 사유 */}
      <label className="mtf-field mtf-reason">
        <span>매매 사유</span>
        <textarea
          rows={2}
          value={form.note?.reason ?? ''}
          placeholder="왜 이 거래를 했는지 적어두면 복기에 큰 도움이 됩니다."
          onChange={(e) => setNote('reason', e.target.value)}
        />
      </label>

      {/* 근거 태그 */}
      <div className="mtf-tags">
        <span className="mtf-tags-label">근거 태그</span>
        <div className="mtf-tag-list">
          {REASON_TAGS.map((tag) => {
            const on = form.note?.tags?.includes(tag) ?? false;
            return (
              <button
                key={tag}
                type="button"
                className={`tag-chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* 보조: 심리 / 계획준수 */}
      <div className="mtf-grid">
        <label className="mtf-field">
          <span>당시 심리 (선택)</span>
          <select
            value={form.note?.emotion ?? ''}
            onChange={(e) =>
              setNote('emotion', (e.target.value || undefined) as Emotion | undefined)
            }
          >
            <option value="">—</option>
            {EMOTIONS.map((em) => (
              <option key={em.value} value={em.value}>
                {em.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mtf-field mtf-check">
          <input
            type="checkbox"
            checked={form.note?.followedPlan ?? false}
            onChange={(e) => setNote('followedPlan', e.target.checked)}
          />
          <span>계획대로 매매했다</span>
        </label>
      </div>

      {error && <p className="mtf-error" role="alert">{error}</p>}

      <div className="mtf-actions">
        <button type="submit" className="mtf-submit">
          거래 저장
        </button>
      </div>
    </form>
  );
}
