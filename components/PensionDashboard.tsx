// components/PensionDashboard.tsx
// 퇴직연금(DC/IRP) 포트폴리오 관리
// 현재 배분 조회 + 리밸런싱 시뮬레이션 + 계획 이력

'use client';

import { useMemo, useState } from 'react';
import type {
  Account,
  PensionAssetClass,
  PensionHolding,
  PensionRebalancePlan,
  PensionRiskLimit,
  PensionAllocItem,
} from '../data/types';

interface Props {
  accounts: Account[];
  assetClasses: PensionAssetClass[];
  holdings: PensionHolding[];
  plans: PensionRebalancePlan[];
  riskLimits: PensionRiskLimit[];
  onUpsertHoldings: (accountId: string, holdings: Omit<PensionHolding, 'id' | 'updatedAt'>[]) => Promise<void>;
  onAddPlan: (plan: Omit<PensionRebalancePlan, 'id' | 'createdAt'>) => Promise<void>;
  onRemovePlan: (id: string) => Promise<void>;
  onAddAssetClass: (name: string, riskType: 'risky' | 'safe') => Promise<void>;
  onUpdateAssetClass: (id: string, patch: Partial<{ name: string; riskType: 'risky' | 'safe' }>) => Promise<void>;
  onRemoveAssetClass: (id: string) => Promise<void>;
}

type Tab = 'current' | 'simulate' | 'history' | 'settings';

export default function PensionDashboard({
  accounts,
  assetClasses,
  holdings,
  plans,
  riskLimits,
  onUpsertHoldings,
  onAddPlan,
  onRemovePlan,
  onAddAssetClass,
  onUpdateAssetClass,
  onRemoveAssetClass,
}: Props) {
  const [tab, setTab] = useState<Tab>('current');
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '');

  const acctHoldings = useMemo(
    () => holdings.filter((h) => h.accountId === selectedAccountId),
    [holdings, selectedAccountId],
  );
  const acctPlans = useMemo(
    () => plans.filter((p) => p.accountId === selectedAccountId),
    [plans, selectedAccountId],
  );

  // 현재 연도 한도 (dc 기준)
  const currentYear = new Date().getFullYear();
  const riskLimit = riskLimits.find(
    (l) => l.accountType === 'dc' && l.year === currentYear,
  );
  const limitPct = riskLimit?.riskyLimitPct ?? null;

  // 자산군별 집계
  const classSummary = useMemo(() => {
    const map = new Map<string, { classId: string; name: string; riskType: 'risky' | 'safe'; amount: number }>();
    for (const ac of assetClasses) {
      map.set(ac.id, { classId: ac.id, name: ac.name, riskType: ac.riskType, amount: 0 });
    }
    // 미분류용
    map.set('__unclassified', { classId: '__unclassified', name: '미분류', riskType: 'risky', amount: 0 });
    for (const h of acctHoldings) {
      const key = h.assetClassId ?? '__unclassified';
      const entry = map.get(key);
      if (entry) entry.amount += h.evalAmount;
      else map.get('__unclassified')!.amount += h.evalAmount;
    }
    return Array.from(map.values()).filter((e) => e.amount > 0);
  }, [acctHoldings, assetClasses]);

  const totalAmount = classSummary.reduce((s, c) => s + c.amount, 0);
  const riskyAmount = classSummary.filter((c) => c.riskType === 'risky').reduce((s, c) => s + c.amount, 0);
  const riskyRatio = totalAmount > 0 ? (riskyAmount / totalAmount) * 100 : 0;

  const won = (n: number) => n.toLocaleString('ko-KR') + '원';

  return (
    <div className="pen-dash">
      {/* 계좌 선택 */}
      {accounts.length > 1 && (
        <select
          className="acct-select"
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          aria-label="계좌 선택"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.broker ?? 'DC'})</option>
          ))}
        </select>
      )}

      {/* 탭 */}
      <nav className="dash-tabs" role="tablist">
        {([
          ['current', '현재 배분'],
          ['simulate', '리밸런싱'],
          ['history', '계획 이력'],
          ['settings', '자산군 설정'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`dash-tab tab-${key} ${tab === key ? 'on' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'current' && (
        accounts.length === 0 ? (
          <p className="pen-notice">DC 계좌를 등록하면 현재 배분을 입력·조회할 수 있습니다.</p>
        ) : (
          <CurrentAllocation
            acctHoldings={acctHoldings}
            assetClasses={assetClasses}
            classSummary={classSummary}
            totalAmount={totalAmount}
            riskyRatio={riskyRatio}
            limitPct={limitPct}
            accountId={selectedAccountId}
            onUpsertHoldings={onUpsertHoldings}
          />
        )
      )}
      {tab === 'simulate' && (
        accounts.length === 0 ? (
          <p className="pen-notice">DC 계좌를 등록하고 현재 배분을 입력하면 리밸런싱 시뮬레이션을 실행할 수 있습니다.</p>
        ) : (
          <RebalanceSimulator
            assetClasses={assetClasses}
            classSummary={classSummary}
            totalAmount={totalAmount}
            limitPct={limitPct}
            accountId={selectedAccountId}
            onAddPlan={onAddPlan}
          />
        )
      )}
      {tab === 'history' && (
        accounts.length === 0 ? (
          <p className="pen-notice">저장된 리밸런싱 계획이 없습니다.</p>
        ) : (
          <PlanHistory plans={acctPlans} onRemove={onRemovePlan} />
        )
      )}
      {tab === 'settings' && (
        <AssetClassSettings
          assetClasses={assetClasses}
          limitPct={limitPct}
          onAdd={onAddAssetClass}
          onUpdate={onUpdateAssetClass}
          onRemove={onRemoveAssetClass}
        />
      )}

      <p className="pen-disclaimer">
        위험자산 한도, 자산군 분류, 상품 정보는 운용사(미래에셋) 기준으로 확인이 필요합니다.
        앱의 수치는 참고용이며 세무·투자 자문이 아닙니다.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════
 * 1. 현재 배분 조회 + 입력
 * ═══════════════════════════════════════════ */

interface CurrentAllocationProps {
  acctHoldings: PensionHolding[];
  assetClasses: PensionAssetClass[];
  classSummary: { classId: string; name: string; riskType: 'risky' | 'safe'; amount: number }[];
  totalAmount: number;
  riskyRatio: number;
  limitPct: number | null;
  accountId: string;
  onUpsertHoldings: (accountId: string, holdings: Omit<PensionHolding, 'id' | 'updatedAt'>[]) => Promise<void>;
}

function CurrentAllocation({
  acctHoldings, assetClasses, classSummary, totalAmount, riskyRatio, limitPct,
  accountId, onUpsertHoldings,
}: CurrentAllocationProps) {
  const [showInput, setShowInput] = useState(false);

  const won = (n: number) => n.toLocaleString('ko-KR') + '원';

  return (
    <section className="pen-section">
      {/* 요약 카드 */}
      <div className="pen-summary">
        <div className="pen-card">
          <span className="pen-card-label">총 평가액</span>
          <span className="pen-card-value">{won(totalAmount)}</span>
        </div>
        <div className="pen-card">
          <span className="pen-card-label">위험자산 비중</span>
          <span className={`pen-card-value ${limitPct != null && riskyRatio > limitPct ? 'pnl-down' : ''}`}>
            {riskyRatio.toFixed(1)}%
          </span>
        </div>
        <div className="pen-card">
          <span className="pen-card-label">한도</span>
          <span className="pen-card-value">
            {limitPct != null ? `${limitPct}%` : '미설정'}
          </span>
        </div>
      </div>

      {/* 위험자산 비중 게이지 */}
      {totalAmount > 0 && (
        <RiskGauge current={riskyRatio} limit={limitPct} />
      )}

      {/* 자산군별 비중 */}
      {classSummary.length > 0 ? (
        <div className="pen-dist-bars">
          {classSummary.map((c) => {
            const pct = totalAmount > 0 ? (c.amount / totalAmount) * 100 : 0;
            return (
              <div key={c.classId} className="pen-dist-row">
                <span className="pen-dist-label">
                  {c.name}
                  <span className={`pen-risk-tag pen-risk-${c.riskType}`}>
                    {c.riskType === 'risky' ? '위험' : '안전'}
                  </span>
                </span>
                <div className="pf-bar-track">
                  <div
                    className={`pf-bar-fill ${c.riskType === 'risky' ? 'pen-bar-risky' : 'pen-bar-safe'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <span className="pen-dist-pct mono">{pct.toFixed(1)}%</span>
                <span className="pen-dist-val mono muted">{won(c.amount)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="pen-notice">현재 배분 데이터가 없습니다. 아래에서 입력해주세요.</p>
      )}

      {/* 상품 목록 */}
      {acctHoldings.length > 0 && (
        <div className="pen-holdings-table-wrap">
          <table className="pen-holdings-table">
            <thead>
              <tr>
                <th>상품명</th>
                <th>자산군</th>
                <th className="num">평가금액</th>
                <th className="num">비중</th>
              </tr>
            </thead>
            <tbody>
              {acctHoldings.map((h) => {
                const ac = assetClasses.find((a) => a.id === h.assetClassId);
                const pct = totalAmount > 0 ? (h.evalAmount / totalAmount) * 100 : 0;
                return (
                  <tr key={h.id}>
                    <td>{h.productName}</td>
                    <td>
                      {ac?.name ?? '미분류'}
                      {ac && (
                        <span className={`pen-risk-tag pen-risk-${ac.riskType}`}>
                          {ac.riskType === 'risky' ? '위험' : '안전'}
                        </span>
                      )}
                    </td>
                    <td className="num mono">{h.evalAmount.toLocaleString('ko-KR')}원</td>
                    <td className="num mono">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 입력 토글 */}
      <button
        type="button"
        className="tool-btn pen-input-toggle"
        onClick={() => setShowInput((v) => !v)}
      >
        {showInput ? '입력 닫기' : '현재 배분 입력/갱신'}
      </button>

      {showInput && (
        <HoldingsInput
          assetClasses={assetClasses}
          existingHoldings={acctHoldings}
          accountId={accountId}
          onSubmit={onUpsertHoldings}
          onClose={() => setShowInput(false)}
        />
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════
 * 위험자산 비중 게이지
 * ═══════════════════════════════════════════ */

function RiskGauge({ current, limit }: { current: number; limit: number | null }) {
  const exceeded = limit != null && current > limit;
  return (
    <div className="pen-gauge">
      <div className="pen-gauge-label">
        <span>위험자산 비중</span>
        <span className={exceeded ? 'pnl-down' : ''}>{current.toFixed(1)}%</span>
        {limit != null && <span className="muted"> / 한도 {limit}%</span>}
      </div>
      <div className="pen-gauge-track">
        <div
          className={`pen-gauge-fill ${exceeded ? 'pen-gauge-over' : 'pen-gauge-ok'}`}
          style={{ width: `${Math.min(current, 100)}%` }}
        />
        {limit != null && (
          <div
            className="pen-gauge-limit"
            style={{ left: `${Math.min(limit, 100)}%` }}
            title={`한도 ${limit}%`}
          />
        )}
      </div>
      {exceeded && (
        <p className="pen-gauge-warn">
          위험자산 비중이 한도를 초과하고 있습니다. 운용사 확인이 필요합니다.
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
 * 현재 배분 직접 입력
 * ═══════════════════════════════════════════ */

interface HoldingsInputProps {
  assetClasses: PensionAssetClass[];
  existingHoldings: PensionHolding[];
  accountId: string;
  onSubmit: (accountId: string, holdings: Omit<PensionHolding, 'id' | 'updatedAt'>[]) => Promise<void>;
  onClose: () => void;
}

interface DraftHolding {
  productName: string;
  assetClassId: string;
  evalAmount: string;
}

function HoldingsInput({ assetClasses, existingHoldings, accountId, onSubmit, onClose }: HoldingsInputProps) {
  const [mode, setMode] = useState<'direct' | 'text'>('direct');
  const [rows, setRows] = useState<DraftHolding[]>(() =>
    existingHoldings.length > 0
      ? existingHoldings.map((h) => ({
          productName: h.productName,
          assetClassId: h.assetClassId ?? '',
          evalAmount: String(h.evalAmount),
        }))
      : [{ productName: '', assetClassId: '', evalAmount: '' }],
  );
  const [textInput, setTextInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function addRow() {
    setRows((r) => [...r, { productName: '', assetClassId: '', evalAmount: '' }]);
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
  function updateRow(i: number, field: keyof DraftHolding, value: string) {
    setRows((r) => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  function parseText() {
    // 텍스트 파싱: 각 줄을 "상품명 금액" 또는 탭/쉼표 구분으로 파싱
    const lines = textInput.trim().split('\n').filter((l) => l.trim());
    const parsed: DraftHolding[] = [];
    for (const line of lines) {
      const parts = line.split(/[\t,]+/).map((s) => s.trim());
      if (parts.length >= 2) {
        const name = parts[0];
        const amountStr = parts[parts.length - 1].replace(/[^0-9.]/g, '');
        // 자산군 자동 매칭
        const matchedClass = assetClasses.find((ac) =>
          name.includes(ac.name) || ac.name.includes(name),
        );
        parsed.push({
          productName: name,
          assetClassId: matchedClass?.id ?? '',
          evalAmount: amountStr || '0',
        });
      }
    }
    if (parsed.length > 0) {
      setRows(parsed);
      setMode('direct');
      setErr(null);
    } else {
      setErr('파싱할 수 있는 데이터가 없습니다. "상품명, 금액" 형식으로 입력해주세요.');
    }
  }

  async function handleSubmit() {
    setErr(null);
    const valid = rows.filter((r) => r.productName.trim() && Number(r.evalAmount) > 0);
    if (valid.length === 0) {
      setErr('최소 1개 상품을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(
        accountId,
        valid.map((r) => ({
          accountId,
          productName: r.productName.trim(),
          assetClassId: r.assetClassId || undefined,
          evalAmount: Number(r.evalAmount),
        })),
      );
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pen-input">
      <div className="seg" role="tablist">
        <button
          type="button"
          className={mode === 'direct' ? 'on' : ''}
          onClick={() => setMode('direct')}
        >
          직접 입력
        </button>
        <button
          type="button"
          className={mode === 'text' ? 'on' : ''}
          onClick={() => setMode('text')}
        >
          텍스트 붙여넣기
        </button>
      </div>

      {mode === 'text' ? (
        <div className="pen-text-input">
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={'상품명, 평가금액\n미래에셋글로벌그로스펀드, 5000000\n미래에셋인덱스펀드, 3000000'}
            rows={8}
          />
          <button type="button" className="tool-btn" onClick={parseText}>
            파싱하여 입력
          </button>
        </div>
      ) : (
        <div className="pen-direct-input">
          {rows.map((row, i) => (
            <div key={i} className="pen-input-row">
              <input
                type="text"
                placeholder="상품명"
                value={row.productName}
                onChange={(e) => updateRow(i, 'productName', e.target.value)}
                className="pen-input-name"
              />
              <select
                value={row.assetClassId}
                onChange={(e) => updateRow(i, 'assetClassId', e.target.value)}
                className="pen-input-class"
              >
                <option value="">자산군 선택</option>
                {assetClasses.map((ac) => (
                  <option key={ac.id} value={ac.id}>
                    {ac.name} ({ac.riskType === 'risky' ? '위험' : '안전'})
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="평가금액"
                value={row.evalAmount}
                onChange={(e) => updateRow(i, 'evalAmount', e.target.value)}
                min={0}
                className="pen-input-amount"
              />
              <button type="button" className="pen-input-del" onClick={() => removeRow(i)} title="삭제">
                &times;
              </button>
            </div>
          ))}
          <button type="button" className="tool-btn" onClick={addRow}>+ 상품 추가</button>
        </div>
      )}

      {err && <p className="pen-error">{err}</p>}

      <div className="pen-input-actions">
        <button type="button" className="an-submit" disabled={saving} onClick={handleSubmit}>
          {saving ? '저장 중...' : '현재 배분 저장'}
        </button>
        <button type="button" className="tool-btn" onClick={onClose}>취소</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
 * 2. 리밸런싱 시뮬레이션 ★ 핵심
 * ═══════════════════════════════════════════ */

interface RebalanceSimulatorProps {
  assetClasses: PensionAssetClass[];
  classSummary: { classId: string; name: string; riskType: 'risky' | 'safe'; amount: number }[];
  totalAmount: number;
  limitPct: number | null;
  accountId: string;
  onAddPlan: (plan: Omit<PensionRebalancePlan, 'id' | 'createdAt'>) => Promise<void>;
}

interface TargetInput {
  classId: string;
  name: string;
  riskType: 'risky' | 'safe';
  targetPct: string;
  currentAmount: number;
}

function RebalanceSimulator({
  assetClasses, classSummary, totalAmount, limitPct, accountId, onAddPlan,
}: RebalanceSimulatorProps) {
  // 자산군별 목표 입력 초기값
  const [targets, setTargets] = useState<TargetInput[]>(() =>
    assetClasses.map((ac) => {
      const cur = classSummary.find((c) => c.classId === ac.id);
      return {
        classId: ac.id,
        name: ac.name,
        riskType: ac.riskType,
        targetPct: '',
        currentAmount: cur?.amount ?? 0,
      };
    }),
  );
  const [extraContrib, setExtraContrib] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [simulated, setSimulated] = useState(false);

  const extra = Number(extraContrib) || 0;
  const newTotal = totalAmount + extra;

  function updateTarget(classId: string, pct: string) {
    setTargets((ts) => ts.map((t) => t.classId === classId ? { ...t, targetPct: pct } : t));
    setSimulated(false);
  }

  // 합계 검증
  const totalPct = targets.reduce((s, t) => s + (Number(t.targetPct) || 0), 0);
  const pctValid = Math.abs(totalPct - 100) < 0.01;

  // 시뮬레이션 결과 계산
  const simResult = useMemo(() => {
    if (!pctValid || newTotal <= 0) return null;

    const items: PensionAllocItem[] = targets
      .filter((t) => Number(t.targetPct) > 0)
      .map((t) => {
        const pct = Number(t.targetPct);
        const targetAmount = newTotal * pct / 100;
        const currentAmount = t.currentAmount;
        return {
          assetClassId: t.classId,
          name: t.name,
          riskType: t.riskType,
          targetPct: pct,
          targetAmount: Math.round(targetAmount),
          currentAmount,
          adjust: Math.round(targetAmount - currentAmount),
        };
      });

    const riskyTargetAmount = items
      .filter((i) => i.riskType === 'risky')
      .reduce((s, i) => s + i.targetAmount, 0);
    const riskyRatio = newTotal > 0 ? (riskyTargetAmount / newTotal) * 100 : 0;
    const isOverLimit = limitPct != null && riskyRatio > limitPct;

    return { items, riskyRatio, isOverLimit };
  }, [targets, newTotal, pctValid, limitPct]);

  // 한도 내 보정 제안
  const correctedResult = useMemo(() => {
    if (!simResult?.isOverLimit || limitPct == null || newTotal <= 0) return null;

    const riskyClasses = targets.filter((t) => t.riskType === 'risky' && Number(t.targetPct) > 0);
    const safeClasses = targets.filter((t) => t.riskType === 'safe' && Number(t.targetPct) > 0);
    const riskyTotalPct = riskyClasses.reduce((s, t) => s + (Number(t.targetPct) || 0), 0);
    const safeTotalPct = safeClasses.reduce((s, t) => s + (Number(t.targetPct) || 0), 0);

    if (riskyTotalPct <= 0) return null;

    // 위험자산 비중을 한도까지 축소, 초과분을 안전자산에 비례 배분
    const scale = limitPct / riskyTotalPct;
    const newRiskyTotal = limitPct;
    const excessPct = riskyTotalPct - limitPct;
    const newSafeTotal = safeTotalPct + excessPct;
    const safeScale = safeTotalPct > 0 ? newSafeTotal / safeTotalPct : 1;

    const correctedItems: PensionAllocItem[] = targets
      .filter((t) => Number(t.targetPct) > 0)
      .map((t) => {
        const origPct = Number(t.targetPct);
        const correctedPct = t.riskType === 'risky'
          ? origPct * scale
          : origPct * safeScale;
        const targetAmount = newTotal * correctedPct / 100;
        return {
          assetClassId: t.classId,
          name: t.name,
          riskType: t.riskType,
          targetPct: Math.round(correctedPct * 10) / 10,
          targetAmount: Math.round(targetAmount),
          currentAmount: t.currentAmount,
          adjust: Math.round(targetAmount - t.currentAmount),
        };
      });

    const correctedRiskyAmount = correctedItems
      .filter((i) => i.riskType === 'risky')
      .reduce((s, i) => s + i.targetAmount, 0);
    const correctedRiskyRatio = newTotal > 0 ? (correctedRiskyAmount / newTotal) * 100 : 0;

    return { items: correctedItems, riskyRatio: correctedRiskyRatio };
  }, [simResult, limitPct, targets, newTotal]);

  function handleSimulate() {
    setSimulated(true);
  }

  async function handleSave(items: PensionAllocItem[], riskyRatio: number, isLimitOk: boolean) {
    setSaving(true);
    try {
      await onAddPlan({
        accountId,
        totalAmount: newTotal,
        extraContrib: extra,
        targetAlloc: items,
        riskyRatio,
        limitPct: limitPct ?? undefined,
        limitOk: isLimitOk,
        memo: memo.trim() || undefined,
        plannedAt: new Date().toISOString().slice(0, 10),
      });
      setSimulated(false);
      setMemo('');
    } finally {
      setSaving(false);
    }
  }

  const won = (n: number) => n.toLocaleString('ko-KR') + '원';

  if (totalAmount === 0 && extra === 0) {
    return (
      <section className="pen-section">
        <p className="pen-notice">
          현재 배분 데이터가 없습니다. &quot;현재 배분&quot; 탭에서 먼저 입력해주세요.
        </p>
      </section>
    );
  }

  return (
    <section className="pen-section">
      <h3>리밸런싱 시뮬레이션</h3>

      {/* 추가 납입액 */}
      <div className="pen-extra">
        <label>(선택) 추가 납입액</label>
        <input
          type="number"
          value={extraContrib}
          onChange={(e) => { setExtraContrib(e.target.value); setSimulated(false); }}
          placeholder="0"
          min={0}
        />
        {extra > 0 && (
          <span className="muted">
            총액: {won(totalAmount)} + {won(extra)} = {won(newTotal)}
          </span>
        )}
      </div>

      {/* 목표 비중 입력 */}
      <div className="pen-target-inputs">
        <h4>목표 비중 (합계 100%)</h4>
        {targets.map((t) => (
          <div key={t.classId} className="pen-target-row">
            <span className="pen-target-label">
              {t.name}
              <span className={`pen-risk-tag pen-risk-${t.riskType}`}>
                {t.riskType === 'risky' ? '위험' : '안전'}
              </span>
            </span>
            <input
              type="number"
              value={t.targetPct}
              onChange={(e) => updateTarget(t.classId, e.target.value)}
              placeholder="0"
              min={0}
              max={100}
              step={1}
              className="pen-target-pct-input"
            />
            <span className="muted">%</span>
            {t.currentAmount > 0 && (
              <span className="muted pen-target-current">현재 {won(t.currentAmount)}</span>
            )}
          </div>
        ))}
        <div className={`pen-target-total ${!pctValid && totalPct > 0 ? 'pnl-down' : ''}`}>
          합계: {totalPct.toFixed(1)}%
          {!pctValid && totalPct > 0 && ' (100%가 되어야 합니다)'}
        </div>
      </div>

      <button
        type="button"
        className="an-submit"
        disabled={!pctValid || newTotal <= 0}
        onClick={handleSimulate}
      >
        시뮬레이션 실행
      </button>

      {/* 시뮬 결과 */}
      {simulated && simResult && (
        <SimulationResult
          result={simResult}
          corrected={correctedResult}
          newTotal={newTotal}
          limitPct={limitPct}
          memo={memo}
          setMemo={setMemo}
          saving={saving}
          onSave={handleSave}
        />
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════
 * 시뮬레이션 결과 표시
 * ═══════════════════════════════════════════ */

function SimulationResult({
  result,
  corrected,
  newTotal,
  limitPct,
  memo,
  setMemo,
  saving,
  onSave,
}: {
  result: { items: PensionAllocItem[]; riskyRatio: number; isOverLimit: boolean };
  corrected: { items: PensionAllocItem[]; riskyRatio: number } | null;
  newTotal: number;
  limitPct: number | null;
  memo: string;
  setMemo: (v: string) => void;
  saving: boolean;
  onSave: (items: PensionAllocItem[], riskyRatio: number, limitOk: boolean) => Promise<void>;
}) {
  const won = (n: number) => n.toLocaleString('ko-KR') + '원';

  return (
    <div className="pen-sim-result">
      {/* 위험자산 비중 */}
      <RiskGauge current={result.riskyRatio} limit={limitPct} />

      {result.isOverLimit && (
        <div className="pen-limit-warn">
          <strong>위험자산 한도 초과</strong>
          <p>
            위험자산 비중 {result.riskyRatio.toFixed(1)}%가 한도 {limitPct}%를 초과합니다.
            이 계획은 운용사에서 거부될 수 있습니다.
          </p>
        </div>
      )}

      {/* 조정 테이블 */}
      <h4>
        조정 내역
        {result.isOverLimit && <span className="pen-badge-warn"> 실행 불가 계획</span>}
      </h4>
      <AdjustTable items={result.items} newTotal={newTotal} />

      {/* 한도 내 보정 제안 */}
      {corrected && (
        <div className="pen-corrected">
          <h4>한도 내 보정 제안 (위험자산 {corrected.riskyRatio.toFixed(1)}%)</h4>
          <p className="muted">위험자산을 한도까지 축소하고 초과분을 안전자산에 배분한 대안입니다.</p>
          <AdjustTable items={corrected.items} newTotal={newTotal} />
          <div className="pen-save-row">
            <input
              type="text"
              placeholder="메모 (선택)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="pen-memo"
            />
            <button
              type="button"
              className="an-submit"
              disabled={saving}
              onClick={() => onSave(corrected.items, corrected.riskyRatio, true)}
            >
              {saving ? '저장 중...' : '보정안을 계획으로 저장'}
            </button>
          </div>
        </div>
      )}

      {/* 원본 저장 */}
      <div className="pen-save-row">
        <input
          type="text"
          placeholder="메모 (선택)"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="pen-memo"
        />
        <button
          type="button"
          className={result.isOverLimit ? 'tool-btn' : 'an-submit'}
          disabled={saving}
          onClick={() => onSave(result.items, result.riskyRatio, !result.isOverLimit)}
        >
          {saving ? '저장 중...' : result.isOverLimit ? '초과 계획으로 저장 (참고용)' : '계획으로 저장'}
        </button>
      </div>

      <p className="pen-notice">
        계획 저장은 시뮬레이션 결과를 기록하는 것이며, 실제 리밸런싱은 미래에셋에서 직접 실행해야 합니다.
        실행 후 &quot;현재 배분&quot; 탭에서 새 배분을 입력하면 갱신됩니다.
      </p>
    </div>
  );
}

/* 조정 테이블 */
function AdjustTable({ items, newTotal }: { items: PensionAllocItem[]; newTotal: number }) {
  const won = (n: number) => n.toLocaleString('ko-KR') + '원';
  return (
    <div className="pen-adjust-wrap">
      <table className="pen-adjust-table">
        <thead>
          <tr>
            <th>자산군</th>
            <th className="num">현재금액</th>
            <th className="num">목표비중</th>
            <th className="num">목표금액</th>
            <th className="num">조정액</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.assetClassId}>
              <td>
                {item.name}
                <span className={`pen-risk-tag pen-risk-${item.riskType}`}>
                  {item.riskType === 'risky' ? '위험' : '안전'}
                </span>
              </td>
              <td className="num mono">{won(item.currentAmount)}</td>
              <td className="num mono">{item.targetPct.toFixed(1)}%</td>
              <td className="num mono">{won(item.targetAmount)}</td>
              <td className={`num mono ${item.adjust > 0 ? 'pnl-up' : item.adjust < 0 ? 'pnl-down' : ''}`}>
                {item.adjust > 0 ? '+' : ''}{won(item.adjust)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>합계</strong></td>
            <td className="num mono">{won(items.reduce((s, i) => s + i.currentAmount, 0))}</td>
            <td className="num mono">100%</td>
            <td className="num mono">{won(newTotal)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════
 * 3. 계획 이력
 * ═══════════════════════════════════════════ */

function PlanHistory({
  plans,
  onRemove,
}: {
  plans: PensionRebalancePlan[];
  onRemove: (id: string) => Promise<void>;
}) {
  const won = (n: number) => n.toLocaleString('ko-KR') + '원';
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (plans.length === 0) {
    return (
      <section className="pen-section">
        <p className="pen-notice">저장된 리밸런싱 계획이 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="pen-section">
      <h3>계획 이력</h3>
      <div className="pen-plans">
        {plans.map((p) => (
          <div key={p.id} className={`pen-plan-card ${p.limitOk === false ? 'pen-plan-warn' : ''}`}>
            <div
              className="pen-plan-head"
              onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
              role="button"
              tabIndex={0}
            >
              <span className="mono">{p.plannedAt}</span>
              <span>{won(p.totalAmount)}</span>
              {p.extraContrib > 0 && <span className="muted">(+{won(p.extraContrib)} 추가납입)</span>}
              <span className={p.limitOk === false ? 'pnl-down' : ''}>
                위험 {p.riskyRatio?.toFixed(1) ?? '?'}%
                {p.limitOk === false && ' 초과'}
                {p.limitOk === true && ' 준수'}
              </span>
              <span className="pen-plan-toggle">{expandedId === p.id ? '▲' : '▼'}</span>
            </div>
            {expandedId === p.id && (
              <div className="pen-plan-detail">
                {p.memo && <p className="pen-plan-memo">{p.memo}</p>}
                <AdjustTable items={p.targetAlloc} newTotal={p.totalAmount} />
                <button
                  type="button"
                  className="pen-plan-del"
                  onClick={() => onRemove(p.id)}
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
 * 4. 자산군 설정
 * ═══════════════════════════════════════════ */

function AssetClassSettings({
  assetClasses,
  limitPct,
  onAdd,
  onUpdate,
  onRemove,
}: {
  assetClasses: PensionAssetClass[];
  limitPct: number | null;
  onAdd: (name: string, riskType: 'risky' | 'safe') => Promise<void>;
  onUpdate: (id: string, patch: Partial<{ name: string; riskType: 'risky' | 'safe' }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [riskType, setRiskType] = useState<'risky' | 'safe'>('risky');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd(name.trim(), riskType);
      setName('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="pen-section">
      <h3>자산군 설정</h3>
      <p className="pen-notice">
        자산군의 위험/안전 분류는 운용사 기준으로 다를 수 있습니다.
        정확한 분류는 운용사(미래에셋)에 확인하세요.
      </p>

      <div className="pen-class-list">
        {assetClasses.map((ac) => (
          <div key={ac.id} className="pen-class-item">
            <span className="pen-class-name">{ac.name}</span>
            <span className={`pen-risk-tag pen-risk-${ac.riskType}`}>
              {ac.riskType === 'risky' ? '위험' : '안전'}
            </span>
            {ac.userId && (
              <>
                <button
                  type="button"
                  className="pen-class-toggle"
                  onClick={() => onUpdate(ac.id, {
                    riskType: ac.riskType === 'risky' ? 'safe' : 'risky',
                  })}
                  title="위험/안전 전환"
                >
                  전환
                </button>
                <button
                  type="button"
                  className="pen-class-del"
                  onClick={() => onRemove(ac.id)}
                >
                  삭제
                </button>
              </>
            )}
            {!ac.userId && <span className="muted">(기본)</span>}
          </div>
        ))}
      </div>

      <div className="pen-class-add">
        <input
          type="text"
          placeholder="자산군명"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select value={riskType} onChange={(e) => setRiskType(e.target.value as 'risky' | 'safe')}>
          <option value="risky">위험</option>
          <option value="safe">안전</option>
        </select>
        <button type="button" className="an-submit" disabled={saving} onClick={handleAdd}>
          {saving ? '추가 중...' : '추가'}
        </button>
      </div>

      <div className="pen-limit-info">
        <h4>위험자산 한도</h4>
        <p>
          현재 설정: {limitPct != null ? `${limitPct}%` : '미설정'}
        </p>
        <p className="muted">
          한도 수치는 DB(pension_risk_limits)에서 관리합니다.
          최신 규정은 운용사에 확인 후 입력하세요.
        </p>
      </div>
    </section>
  );
}
