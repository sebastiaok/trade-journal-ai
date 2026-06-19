// lib/taxTracker.ts
// 납입 한도 · 세액공제 트래커 (참고용 자동 집계)
//
// ⚠️ 본 모듈은 사용자가 입력한 거래와 편집 가능한 TaxConfig로
//    "참고용" 집계를 제공할 뿐, 세무 자문이 아니다.
//    한도·세율은 매년 바뀌며 2026년 ISA는 개편 과도기이므로
//    실제 적용 한도/세율은 관계 부처·금융기관 공식 자료를 따른다.

import type { Account, Trade, TaxConfig } from '../data/types';
import { isPension } from '../data/types';

const num = (v: number | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0);
const inYear = (iso: string, year: number) => new Date(iso).getFullYear() === year;

/* ────────────────────────────────────────────────────────────
 * 1. 연금계좌(연금저축 + IRP 자기부담) 세액공제 트래커
 *    - DC 전환분(irp_dc) 및 taxDeductible=false 납입은 공제 대상에서 제외
 *    - 연금저축 단독 한도(600만) + 합산 한도(900만) 동시 추적
 * ──────────────────────────────────────────────────────────── */

export interface PensionTaxStatus {
  year: number;
  pensionSavingsContrib: number;   // 연금저축 세액공제 대상 납입
  irpContrib: number;              // IRP 자기부담 세액공제 대상 납입 (DC전환 제외)
  totalEligible: number;           // 공제대상 합산 (캡 적용 전)
  // 캡 적용
  savingsCapped: number;           // 연금저축 인정액 (≤ 600만)
  totalCapped: number;             // 합산 인정액 (≤ 900만, 연금저축 인정분 포함)
  remainingToCap: number;          // 합산 한도까지 남은 금액
  // 절세 추정
  deductRate: number;              // 적용 체감 공제율
  estimatedRefund: number;         // 추정 환급액 = totalCapped * deductRate
  // 연 납입한도 (연금저축+DC/IRP 자기부담 합산 1,800만)
  annualContribUsed: number;
  annualContribCap: number;
}

export function pensionTaxStatus(
  accounts: Account[],
  trades: Trade[],
  cfg: TaxConfig,
  annualSalary?: number,           // 총급여 (없으면 낮은 세율 가정)
): PensionTaxStatus {
  const year = cfg.taxYear;
  const idType = new Map(accounts.map((a) => [a.id, a.type]));

  let pensionSavingsContrib = 0; // type==='pension'
  let irpContrib = 0;            // type==='irp' (자기부담, 공제대상)
  let annualContribUsed = 0;     // 연금저축 + IRP/DC 자기부담 (한도 1,800만)

  for (const t of trades) {
    if (t.side !== 'deposit' || !inYear(t.executedAt, year)) continue;
    const type = idType.get(t.accountId);
    if (!type || !isPension(type)) continue;

    const amt = num(t.amount);

    // 연 납입한도 집계: 자기부담 납입만 (DC 이전금 자체는 보통 한도와 무관)
    if (type !== 'irp_dc' || t.taxDeductible) annualContribUsed += amt;

    // 세액공제 대상: taxDeductible !== false 이고 DC 이전금이 아님
    const deductible = t.taxDeductible !== false && type !== 'irp_dc';
    if (!deductible) continue;

    if (type === 'pension') pensionSavingsContrib += amt;
    else irpContrib += amt; // 'irp'
  }

  const savingsCapped = Math.min(pensionSavingsContrib, cfg.pensionSavingsSubCap);
  const totalEligible = savingsCapped + irpContrib; // 연금저축은 캡 적용 후 합산
  const totalCapped = Math.min(totalEligible, cfg.pensionDeductionCap);
  const remainingToCap = Math.max(0, cfg.pensionDeductionCap - totalCapped);

  const deductRate =
    annualSalary != null && annualSalary > cfg.salaryThreshold
      ? cfg.deductRateHigh
      : cfg.deductRateLow;

  return {
    year,
    pensionSavingsContrib,
    irpContrib,
    totalEligible: savingsCapped + irpContrib,
    savingsCapped,
    totalCapped,
    remainingToCap,
    deductRate,
    estimatedRefund: round0(totalCapped * deductRate),
    annualContribUsed,
    annualContribCap: cfg.pensionAnnualContribCap,
  };
}

/* ────────────────────────────────────────────────────────────
 * 2. ISA 트래커
 *    - 연 납입한도 / 총 납입한도 / 의무가입기간 경과 여부
 *    - 비과세 한도는 "수익" 기준이므로 평가손익(입력값)이 있을 때만 표시
 * ──────────────────────────────────────────────────────────── */

export interface IsaStatus {
  year: number;
  annualContribUsed: number;
  annualContribCap: number;
  annualRemaining: number;
  totalContribUsed: number;       // 누적 순납입 (개설 이후 전체)
  totalContribCap: number;
  totalRemaining: number;
  mandatoryYears: number;
  yearsSinceOpen: number | null;
  mandatoryMet: boolean | null;   // 개설일 없으면 null
  taxFreeLimit: number;           // 비과세 한도 (참고)
}

export function isaStatus(
  account: Account,
  trades: Trade[],
  cfg: TaxConfig,
): IsaStatus {
  const year = cfg.taxYear;
  const mine = trades.filter((t) => t.accountId === account.id);

  const annualContribUsed = mine
    .filter((t) => t.side === 'deposit' && inYear(t.executedAt, year))
    .reduce((s, t) => s + num(t.amount), 0);

  const totalDeposit = mine
    .filter((t) => t.side === 'deposit')
    .reduce((s, t) => s + num(t.amount), 0);
  const totalWithdrawal = mine
    .filter((t) => t.side === 'withdrawal')
    .reduce((s, t) => s + num(t.amount), 0);
  const totalContribUsed = totalDeposit - totalWithdrawal;

  let yearsSinceOpen: number | null = null;
  let mandatoryMet: boolean | null = null;
  if (account.openedAt) {
    const ms = Date.now() - new Date(account.openedAt).getTime();
    yearsSinceOpen = round1(ms / (365 * 86_400_000));
    mandatoryMet = yearsSinceOpen >= cfg.isaMandatoryYears;
  }

  return {
    year,
    annualContribUsed: round0(annualContribUsed),
    annualContribCap: cfg.isaAnnualContribCap,
    annualRemaining: Math.max(0, cfg.isaAnnualContribCap - annualContribUsed),
    totalContribUsed: round0(totalContribUsed),
    totalContribCap: cfg.isaTotalContribCap,
    totalRemaining: Math.max(0, cfg.isaTotalContribCap - totalContribUsed),
    mandatoryYears: cfg.isaMandatoryYears,
    yearsSinceOpen,
    mandatoryMet,
    taxFreeLimit: cfg.isaTaxFreeLimit,
  };
}

/* ────────────────────────────────────────────────────────────
 * 3. 중도 인출 경고 (연금계좌)
 *    연금외 수령/중도해지 시 세액공제 받은 원금+수익에 기타소득세.
 *    참고 경고 문구만 생성한다.
 * ──────────────────────────────────────────────────────────── */

export function earlyWithdrawalWarning(cfg: TaxConfig): string {
  const pct = (cfg.earlyWithdrawalTaxRate * 100).toFixed(1);
  return `연금계좌를 중도해지하거나 연금 외 형태로 수령하면 세액공제 받은 납입원금과 운용수익에 기타소득세(약 ${pct}%)가 부과될 수 있습니다. 참고용 안내이며 정확한 내용은 가입 금융기관·국세청 자료를 확인하세요.`;
}

/* ──────────────────────────────────────────────────────────── */

function round0(n: number) {
  return Math.round(n);
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}
