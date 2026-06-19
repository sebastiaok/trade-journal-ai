// components/AccountManager.tsx
// 계좌 관리 — 추가/수정/삭제. IRP는 자기부담(irp)과 DC전환(irp_dc)을 구분.

'use client';

import { useState } from 'react';
import type { Account, AccountType } from '../data/types';

interface Props {
  accounts: Account[];
  onAdd: (a: Omit<Account, 'id'>) => void;
  onUpdate: (id: string, patch: Partial<Account>) => void;
  onRemove: (id: string) => void;
}

const TYPE_LABEL: Record<AccountType, string> = {
  general: '일반',
  isa: 'ISA',
  pension: '연금저축',
  irp: 'IRP(자기부담)',
  irp_dc: 'IRP(DC전환)',
};

const TYPES: AccountType[] = ['general', 'isa', 'pension', 'irp', 'irp_dc'];

export default function AccountManager({ accounts, onAdd, onUpdate, onRemove }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('general');
  const [broker, setBroker] = useState('');
  const [openedAt, setOpenedAt] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName('');
    setType('general');
    setBroker('');
    setOpenedAt('');
    setEditingId(null);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('계좌 이름을 입력하세요.');
      return;
    }
    const payload = {
      name: name.trim(),
      type,
      broker: broker.trim() || undefined,
      openedAt: openedAt || undefined,
    };
    if (editingId) onUpdate(editingId, payload);
    else onAdd(payload);
    resetForm();
  }

  function startEdit(a: Account) {
    setEditingId(a.id);
    setName(a.name);
    setType(a.type);
    setBroker(a.broker ?? '');
    setOpenedAt(a.openedAt ?? '');
    setError(null);
  }

  function handleRemove(a: Account) {
    if (confirm(`'${a.name}' 계좌를 삭제하면 그 안의 거래도 함께 삭제됩니다. 계속할까요?`)) {
      onRemove(a.id);
      if (editingId === a.id) resetForm();
    }
  }

  return (
    <div className="acctmgr">
      <form className="acctmgr-form" onSubmit={handleSubmit}>
        <h3 className="acctmgr-title">{editingId ? '계좌 수정' : '계좌 추가'}</h3>
        <div className="acctmgr-grid">
          <label className="acctmgr-field">
            <span>계좌 이름</span>
            <input value={name} placeholder="예: 키움 일반" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="acctmgr-field">
            <span>유형</span>
            <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <label className="acctmgr-field">
            <span>증권사 (선택)</span>
            <input value={broker} placeholder="예: 키움증권" onChange={(e) => setBroker(e.target.value)} />
          </label>
          <label className="acctmgr-field">
            <span>개설일 (ISA 의무기간용, 선택)</span>
            <input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} />
          </label>
        </div>

        {type === 'irp_dc' && (
          <p className="acctmgr-hint">
            DC전환 IRP는 퇴직급여 이전분입니다. 세액공제·연납입한도 집계에서 제외됩니다.
          </p>
        )}

        {error && <p className="acctmgr-error" role="alert">{error}</p>}

        <div className="acctmgr-actions">
          {editingId && (
            <button type="button" className="acctmgr-cancel" onClick={resetForm}>
              취소
            </button>
          )}
          <button type="submit" className="acctmgr-submit">
            {editingId ? '수정 저장' : '계좌 추가'}
          </button>
        </div>
      </form>

      {accounts.length > 0 && (
        <ul className="acctmgr-list">
          {accounts.map((a) => (
            <li key={a.id} className="acctmgr-item">
              <div className="acctmgr-item-main">
                <span className="acctmgr-item-name">{a.name}</span>
                <span className={`acctmgr-badge type-${a.type}`}>{TYPE_LABEL[a.type]}</span>
                {a.broker && <span className="acctmgr-item-broker">{a.broker}</span>}
              </div>
              <div className="acctmgr-item-actions">
                <button type="button" onClick={() => startEdit(a)}>수정</button>
                <button type="button" className="danger" onClick={() => handleRemove(a)}>삭제</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
