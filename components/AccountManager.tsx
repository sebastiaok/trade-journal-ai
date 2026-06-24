// components/AccountManager.tsx
// 계좌 관리 — 추가/수정/삭제 + 예수금 입출금 + 세제 한도 표시.
// IRP는 자기부담(irp)과 DC전환(irp_dc)을 구분.

'use client';

import { useMemo, useState } from 'react';
import type { Account, AccountType, AccountDeposit, TaxLimit, Trade } from '../data/types';

interface Props {
  accounts: Account[];
  trades: Trade[];
  deposits: AccountDeposit[];
  taxLimits: TaxLimit[];
  onAdd: (a: Omit<Account, 'id'>) => void;
  onUpdate: (id: string, patch: Partial<Account>) => void;
  onRemove: (id: string) => void;
  onAddDeposit: (d: Omit<AccountDeposit, 'id' | 'createdAt'>) => void;
  onRemoveDeposit: (id: string) => void;
}

const TYPE_LABEL: Record<AccountType, string> = {
  general: '일반',
  isa: 'ISA',
  pension: '연금저축',
  irp: 'IRP(자기부담)',
  irp_dc: 'IRP(DC전환)',
};

const TYPES: AccountType[] = ['general', 'isa', 'pension', 'irp', 'irp_dc'];

export default function AccountManager({
  accounts, trades, deposits, taxLimits,
  onAdd, onUpdate, onRemove, onAddDeposit, onRemoveDeposit,
}: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('general');
  const [broker, setBroker] = useState('');
  const [openedAt, setOpenedAt] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 입출금 패널
  const [depositAcctId, setDepositAcctId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositKind, setDepositKind] = useState<'deposit' | 'withdraw'>('deposit');
  const [depositMemo, setDepositMemo] = useState('');

  // 계좌별 거래 수 (삭제 경고용)
  const tradeCountByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of trades) {
      map[t.accountId] = (map[t.accountId] ?? 0) + 1;
    }
    return map;
  }, [trades]);

  // 세제계좌 연간 납입 사용률 계산
  const currentYear = new Date().getFullYear();
  const yearLimits = useMemo(() => {
    const map: Record<string, TaxLimit> = {};
    for (const l of taxLimits) {
      if (l.year === currentYear) map[l.accountType] = l;
    }
    return map;
  }, [taxLimits, currentYear]);

  // 계좌별 올해 납입액 (deposit side 거래 기준)
  const yearlyContrib = useMemo(() => {
    const yearStr = String(currentYear);
    const map: Record<string, number> = {};
    for (const t of trades) {
      if (t.side === 'deposit' && t.executedAt?.startsWith(yearStr)) {
        map[t.accountId] = (map[t.accountId] ?? 0) + (t.amount || 0);
      }
    }
    return map;
  }, [trades, currentYear]);

  function resetForm() {
    setName(''); setType('general'); setBroker(''); setOpenedAt('');
    setEditingId(null); setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('계좌 이름을 입력하세요.'); return; }
    const payload: Omit<Account, 'id'> = {
      name: name.trim(), type,
      broker: broker.trim() || undefined,
      openedAt: openedAt || undefined,
      cashBalance: 0,
    };
    if (editingId) onUpdate(editingId, payload);
    else onAdd(payload);
    resetForm();
  }

  function startEdit(a: Account) {
    setEditingId(a.id); setName(a.name); setType(a.type);
    setBroker(a.broker ?? ''); setOpenedAt(a.openedAt ?? '');
    setError(null);
  }

  function handleRemove(a: Account) {
    const count = tradeCountByAccount[a.id] ?? 0;
    const depositCount = deposits.filter((d) => d.accountId === a.id).length;
    const msg = count > 0 || depositCount > 0
      ? `'${a.name}' 계좌를 삭제하면 연결된 거래 ${count}건, 입출금 기록 ${depositCount}건이 모두 삭제됩니다.\n\n정말 삭제하시겠습니까?`
      : `'${a.name}' 계좌를 삭제할까요?`;
    if (confirm(msg)) {
      onRemove(a.id);
      if (editingId === a.id) resetForm();
    }
  }

  function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!depositAcctId) return;
    const amt = Math.abs(Number(depositAmount));
    if (!amt || amt <= 0) return;
    onAddDeposit({
      accountId: depositAcctId,
      amount: amt,
      kind: depositKind,
      memo: depositMemo.trim() || undefined,
      occurredAt: new Date().toISOString(),
    });
    setDepositAmount(''); setDepositMemo('');
  }

  function getTaxInfo(a: Account) {
    const typeKey = a.type === 'irp' || a.type === 'irp_dc' ? 'irp' : a.type;
    if (typeKey !== 'isa' && typeKey !== 'pension' && typeKey !== 'irp') return null;
    const limit = yearLimits[typeKey];
    if (!limit) return null;
    const contrib = yearlyContrib[a.id] ?? 0;
    const annualCap = limit.annualLimit ?? 0;
    const usage = annualCap > 0 ? (contrib / annualCap) * 100 : 0;
    return { contrib, annualCap, usage, limit };
  }

  const won = (n: number) => n.toLocaleString('ko-KR') + '원';

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
            <button type="button" className="acctmgr-cancel" onClick={resetForm}>취소</button>
          )}
          <button type="submit" className="acctmgr-submit">
            {editingId ? '수정 저장' : '계좌 추가'}
          </button>
        </div>
      </form>

      {accounts.length > 0 && (
        <ul className="acctmgr-list">
          {accounts.map((a) => {
            const taxInfo = getTaxInfo(a);
            const isDepositTarget = depositAcctId === a.id;
            return (
              <li key={a.id} className="acctmgr-item">
                <div className="acctmgr-item-main">
                  <span className="acctmgr-item-name">{a.name}</span>
                  <span className={`acctmgr-badge type-${a.type}`}>{TYPE_LABEL[a.type]}</span>
                  {a.broker && <span className="acctmgr-item-broker">{a.broker}</span>}
                  <span className="acctmgr-cash">
                    예수금 <strong className="mono">{won(a.cashBalance)}</strong>
                  </span>
                </div>

                {/* 세제 한도 표시 */}
                {taxInfo && (
                  <div className={`acctmgr-tax ${taxInfo.usage >= 80 ? 'tax-warn' : ''}`}>
                    <span>
                      {currentYear}년 납입 {won(taxInfo.contrib)} / {won(taxInfo.annualCap)}
                      ({taxInfo.usage.toFixed(0)}%)
                    </span>
                    {taxInfo.usage >= 80 && (
                      <span className="tax-alert">한도 {taxInfo.usage.toFixed(0)}% 사용</span>
                    )}
                    <span className="tax-note">참고용 자동 집계 (세무 자문 아님)</span>
                  </div>
                )}

                <div className="acctmgr-item-actions">
                  <button type="button" onClick={() => {
                    setDepositAcctId(isDepositTarget ? null : a.id);
                  }}>
                    {isDepositTarget ? '입출금 닫기' : '입출금'}
                  </button>
                  <button type="button" onClick={() => startEdit(a)}>수정</button>
                  <button type="button" className="danger" onClick={() => handleRemove(a)}>삭제</button>
                </div>

                {/* 입출금 패널 */}
                {isDepositTarget && (
                  <form className="acctmgr-deposit" onSubmit={handleDeposit}>
                    <div className="acctmgr-deposit-row">
                      <select value={depositKind} onChange={(e) => setDepositKind(e.target.value as 'deposit' | 'withdraw')}>
                        <option value="deposit">입금</option>
                        <option value="withdraw">출금</option>
                      </select>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="금액"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="메모 (선택)"
                        value={depositMemo}
                        onChange={(e) => setDepositMemo(e.target.value)}
                      />
                      <button type="submit" className="acctmgr-submit">
                        {depositKind === 'deposit' ? '입금' : '출금'}
                      </button>
                    </div>
                    {/* 최근 입출금 내역 */}
                    {deposits.filter((d) => d.accountId === a.id).length > 0 && (
                      <ul className="acctmgr-deposit-list">
                        {deposits
                          .filter((d) => d.accountId === a.id)
                          .slice(0, 5)
                          .map((d) => (
                            <li key={d.id} className="acctmgr-deposit-item">
                              <span className={d.kind === 'deposit' ? 'pnl-up' : 'pnl-down'}>
                                {d.kind === 'deposit' ? '+' : '-'}{won(d.amount)}
                              </span>
                              <span className="muted">{d.occurredAt.slice(0, 10)}</span>
                              {d.memo && <span className="muted">{d.memo}</span>}
                              <button type="button" className="trt-del" onClick={() => {
                                if (confirm('이 입출금 기록을 삭제할까요? 예수금이 역산됩니다.')) {
                                  onRemoveDeposit(d.id);
                                }
                              }}>
                                ×
                              </button>
                            </li>
                          ))}
                      </ul>
                    )}
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
