// components/OnboardingFlow.tsx
// 온보딩 흐름 — 계좌 0개 감지 → 첫 계좌 등록 → 보유 입력 분기(4모드) → 대시보드

'use client';

import { useState } from 'react';
import type { Account, AccountType, Trade } from '../data/types';
import ManualTradeForm from './ManualTradeForm';
import CaptureUploader from './CaptureUploader';
import TradeImportPanel from './TradeImportPanel';
import OpeningLotForm from './OpeningLotForm';

interface Props {
  onAddAccount: (a: Omit<Account, 'id'>) => Promise<void>;
  onSkip: () => void;
  onOpeningLot: (accountId: string) => void;
  /** 보유 스냅샷 입력에 필요 */
  accounts?: Account[];
  onSubmitMany?: (list: Omit<Trade, 'id'>[]) => Promise<void>;
  onSubmitOne?: (t: Omit<Trade, 'id'>) => Promise<void>;
}

const TYPE_LABEL: Record<AccountType, string> = {
  general: '일반',
  isa: 'ISA',
  pension: '연금저축',
  irp: 'IRP(자기부담)',
  irp_dc: 'IRP(DC전환)',
  dc: 'DC(확정기여형)',
};

const TYPES: AccountType[] = ['general', 'isa', 'pension', 'irp', 'irp_dc', 'dc'];

type Step = 'welcome' | 'create' | 'holdingChoice' | 'holdingInput' | 'done';
type InputMode = 'manual' | 'image' | 'import' | 'opening';

export default function OnboardingFlow({ onAddAccount, onSkip, onOpeningLot, accounts, onSubmitMany, onSubmitOne }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('general');
  const [broker, setBroker] = useState('');
  const [openedAt, setOpenedAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('계좌 이름을 입력하세요.'); return; }
    setError(null);
    setSaving(true);
    try {
      await onAddAccount({
        name: name.trim(), type,
        broker: broker.trim() || undefined,
        openedAt: openedAt || undefined,
        cashBalance: 0,
      });
      setStep('holdingChoice');
    } catch (err) {
      setError(err instanceof Error ? err.message : '계좌 생성 실패');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'welcome') {
    return (
      <div className="onboard">
        <div className="onboard-card">
          <h2 className="onboard-title">투자관리를 시작해볼까요?</h2>
          <p className="onboard-desc">
            매매일지를 기록하려면 먼저 계좌를 등록해야 합니다.<br />
            증권사 계좌별로 거래를 분리 관리하고, 세제계좌(ISA/연금/IRP)의 납입 한도도 추적할 수 있습니다.
          </p>
          <div className="onboard-actions">
            <button type="button" className="onboard-primary" onClick={() => setStep('create')}>
              첫 계좌 등록하기
            </button>
            <button type="button" className="onboard-secondary" onClick={onSkip}>
              나중에 하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'create') {
    return (
      <div className="onboard">
        <div className="onboard-card">
          <h2 className="onboard-title">첫 계좌 등록</h2>
          <form className="onboard-form" onSubmit={handleCreate}>
            <label className="mtf-field">
              <span>계좌 이름</span>
              <input value={name} placeholder="예: 키움 일반" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="mtf-field">
              <span>유형</span>
              <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label className="mtf-field">
              <span>증권사 (선택)</span>
              <input value={broker} placeholder="예: 키움증권" onChange={(e) => setBroker(e.target.value)} />
            </label>
            <label className="mtf-field">
              <span>개설일 (선택)</span>
              <input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} />
            </label>

            {type === 'irp_dc' && (
              <p className="acctmgr-hint">
                DC전환 IRP는 퇴직급여 이전분입니다. 세액공제·연납입한도 집계에서 제외됩니다.
              </p>
            )}

            {error && <p className="mtf-error" role="alert">{error}</p>}

            <div className="onboard-actions">
              <button type="submit" className="onboard-primary" disabled={saving}>
                {saving ? '등록 중…' : '계좌 등록'}
              </button>
              <button type="button" className="onboard-secondary" onClick={() => setStep('welcome')}>
                뒤로
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'holdingChoice') {
    return (
      <div className="onboard">
        <div className="onboard-card">
          <h2 className="onboard-title">계좌가 등록되었습니다!</h2>
          <p className="onboard-desc">
            이미 보유 중인 종목이 있나요?<br />
            보유 종목을 입력하면 정확한 손익 계산과 포트폴리오 관리가 가능합니다.
          </p>
          <div className="onboard-actions">
            {accounts && accounts.length > 0 && onSubmitMany ? (
              <button type="button" className="onboard-primary" onClick={() => setStep('holdingInput')}>
                보유 스냅샷 입력하기
              </button>
            ) : (
              <button type="button" className="onboard-primary" onClick={onSkip}>
                대시보드로 이동
              </button>
            )}
            <button type="button" className="onboard-secondary" onClick={onSkip}>
              나중에 입력하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'holdingInput' && accounts && onSubmitMany) {
    return (
      <div className="onboard">
        <div className="onboard-card onboard-card-wide">
          <h2 className="onboard-title">보유 종목 등록</h2>
          <p className="onboard-desc">
            현재 보유 중인 종목을 등록하세요. 증권사 잔고 캡처, 텍스트 붙여넣기, CSV 업로드, 직접 입력 중 편한 방식을 선택하세요.<br />
            입력한 내용은 초기 보유(opening lot)로 기록되어 이후 매도 시 FIFO 손익 계산에 사용됩니다.
          </p>
          <HoldingInputModes
            accounts={accounts}
            defaultAccountId={accounts[accounts.length - 1]?.id}
            onSubmitMany={async (list) => {
              await onSubmitMany(list);
              setStep('done');
            }}
            onSubmitOne={onSubmitOne ? async (t) => {
              await onSubmitOne(t);
              setStep('done');
            } : undefined}
          />
        </div>
      </div>
    );
  }

  // step === 'done'
  return (
    <div className="onboard">
      <div className="onboard-card">
        <h2 className="onboard-title">준비 완료!</h2>
        <p className="onboard-desc">
          계좌와 보유 종목이 등록되었습니다. 대시보드에서 투자 현황을 확인하세요.
        </p>
        <div className="onboard-actions">
          <button type="button" className="onboard-primary" onClick={onSkip}>
            대시보드로 이동
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── 보유 입력 4모드 ───────── */

function HoldingInputModes({
  accounts,
  defaultAccountId,
  onSubmitMany,
  onSubmitOne,
}: {
  accounts: Account[];
  defaultAccountId?: string;
  onSubmitMany: (list: Omit<Trade, 'id'>[]) => Promise<void>;
  onSubmitOne?: (t: Omit<Trade, 'id'>) => Promise<void>;
}) {
  const [mode, setMode] = useState<InputMode>('opening');
  return (
    <div className="journal">
      <div className="journal-modes" role="tablist">
        <button role="tab" aria-selected={mode === 'opening'} className={mode === 'opening' ? 'on' : ''} onClick={() => setMode('opening')}>보유 스냅샷</button>
        <button role="tab" aria-selected={mode === 'image'} className={mode === 'image' ? 'on' : ''} onClick={() => setMode('image')}>이미지 인식</button>
        <button role="tab" aria-selected={mode === 'import'} className={mode === 'import' ? 'on' : ''} onClick={() => setMode('import')}>파일/텍스트</button>
        <button role="tab" aria-selected={mode === 'manual'} className={mode === 'manual' ? 'on' : ''} onClick={() => setMode('manual')}>수기 입력</button>
      </div>
      {mode === 'opening' ? (
        <OpeningLotForm accounts={accounts} defaultAccountId={defaultAccountId} onSubmit={onSubmitMany} />
      ) : mode === 'image' ? (
        <CaptureUploader accounts={accounts} defaultAccountId={defaultAccountId} onConfirm={onSubmitMany} />
      ) : mode === 'import' ? (
        <TradeImportPanel accounts={accounts} defaultAccountId={defaultAccountId} onConfirm={onSubmitMany} />
      ) : onSubmitOne ? (
        <ManualTradeForm accounts={accounts} defaultAccountId={defaultAccountId} onSubmit={onSubmitOne} />
      ) : (
        <OpeningLotForm accounts={accounts} defaultAccountId={defaultAccountId} onSubmit={onSubmitMany} />
      )}
    </div>
  );
}
