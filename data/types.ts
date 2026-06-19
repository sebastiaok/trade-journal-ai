// data/types.ts
// TradeJournalAI 공용 타입 정의 (계좌 분리 + 납입/인출 + 한도·세제 트래커)

export type Side = 'buy' | 'sell' | 'deposit' | 'withdrawal';
//  buy/sell      : 매수/매도 (실현손익 계산 대상)
//  deposit       : 납입 (적립형 계좌 현금 유입 / 세액공제·한도 집계 대상)
//  withdrawal    : 인출 (현금 유출)

export type Emotion = 'calm' | 'fomo' | 'fear' | 'greedy' | 'revenge';
export type Source = 'vision' | 'manual' | 'opening' | 'api';

// IRP는 자금 출처에 따라 둘로 구분한다.
//  irp        : 개인 자기부담 IRP (세액공제 대상 자기부담금 납입)
//  irp_dc     : DC(확정기여형) 전환 IRP (퇴직급여 이전분 — 자기부담금/세액공제와 분리 관리)
export type AccountType = 'general' | 'isa' | 'pension' | 'irp' | 'irp_dc';
//  general : 일반 매매 계좌  (복기: 승률·손익비·MDD)
//  isa     : ISA            (복기: 누적 수익률 / 납입한도·비과세 트래커)
//  pension : 연금저축        (복기: 수익률·CAGR / 세액공제 트래커)
//  irp     : IRP(자기부담)    (복기: 수익률·CAGR / 세액공제 트래커)
//  irp_dc  : IRP(DC 전환)     (복기: 수익률·CAGR / 세액공제·연납입한도에서 제외)

/** 적립형(연금성) 계좌 여부 — 납입/인출 중심, 수익률·CAGR 복기 */
export const ACCUMULATION_TYPES: AccountType[] = ['isa', 'pension', 'irp', 'irp_dc'];
export const isAccumulation = (t: AccountType) => ACCUMULATION_TYPES.includes(t);

/** 연금계좌(연금저축+IRP 계열) 여부 — 세액공제 합산 한도 공유 */
export const PENSION_TYPES: AccountType[] = ['pension', 'irp', 'irp_dc'];
export const isPension = (t: AccountType) => PENSION_TYPES.includes(t);

/** 계좌 */
export interface Account {
  id: string;
  name: string;          // 표시명 (예: "키움 일반", "삼성 IRP", "미래에셋 IRP(DC전환)")
  type: AccountType;
  broker?: string;
  openedAt?: string;     // 개설일 (ISO) — ISA 의무가입기간 계산용
  note?: string;
  cashBalance: number;   // 예수금 (원 단위, 기본 0)
}

/** 입출금 기록 */
export interface AccountDeposit {
  id: string;
  accountId: string;
  amount: number;
  kind: 'deposit' | 'withdraw';
  memo?: string;
  occurredAt: string;    // ISO
  createdAt: string;     // ISO
}

/** 보유현황 (계좌별·종목별 캐시) */
export interface Holding {
  id: string;
  accountId: string;
  symbol: string;
  code?: string;
  quantity: number;
  avgCost: number;
  updatedAt: string;
}

/** 실현손익 행 (매도 FIFO 매칭 결과, 매도 1건당 1~N행) */
export interface RealizedPnlRow {
  id: string;
  accountId: string;
  symbol: string;
  sellTradeId: string;
  buyTradeId?: string;
  matchedQty: number;
  buyPrice: number;
  sellPrice: number;
  pnlAmount: number;
  feeAmount: number;
  taxAmount: number;
  realizedAt: string;
}

/** 분석 노트 상태 */
export type AnalysisStatus = 'draft' | 'active' | 'closed';

/** 회고 판정 라벨 */
export type RetroLabel = '목표 달성' | '손절 실행' | '중간 청산' | '조기 익절' | '손절 미준수';

/** 분석 노트 (종목 분석 → 매매 연결 → 회고) */
export interface AnalysisNote {
  id: string;
  accountId: string;
  symbol: string;
  code?: string;
  status: AnalysisStatus;
  thesis?: string;            // 투자 논리
  targetPrice?: number;       // 목표가
  stopPrice?: number;         // 손절가
  targetPct?: number;         // 목표 비중 (%)
  checklist: { id: string; label: string; checked: boolean }[];
  retroMemo?: string;         // 회고 메모
  retroLabel?: RetroLabel;    // 자동 판정 라벨
  analyzedAt: string;         // ISO date
  closedAt?: string;          // ISO
  createdAt: string;          // ISO
}

/** 포트폴리오 스냅샷 (일별 자산 기록) */
export interface PortfolioSnapshot {
  id: string;
  snapshotDate: string;       // YYYY-MM-DD
  totalValue: number;         // 총 평가액
  totalCost: number;          // 총 취득원가
  cash: number;               // 현금
  details: SnapshotDetail[];  // 종목별 내역
  createdAt: string;
}

export interface SnapshotDetail {
  accountId: string;
  symbol: string;
  quantity: number;
  avgCost: number;
  value: number;              // 평가액 (현재가 × 수량, 없으면 avgCost × 수량)
}

/** 종목 마스터 */
export interface Ticker {
  code: string;
  name: string;
  market?: string;
  sector?: string;
  currency?: string;
}

/** 시세 캐시 (종목별 최신가) */
export interface PriceCache {
  tickerCode: string;
  price: number;
  fetchedAt: string;            // ISO
}

/** 목표 배분 (섹터별 비중) */
export interface TargetAllocation {
  id: string;
  sector: string;
  targetPct: number;          // 목표 비중 (%)
}

/** 세제 한도 (연도별 법정 기준값, 참고용) */
export interface TaxLimit {
  id: string;
  accountType: 'isa' | 'pension' | 'irp';
  year: number;
  annualLimit?: number;
  cumulativeLimit?: number;
  deductionLimit?: number;
  note?: string;
}

/** 근거 태그 프리셋 (자유 태그도 허용) */
export const REASON_TAGS = [
  '실적', '차트', '뉴스', '수급', '테마', '배당', '밸류에이션', '손절', '익절', '기타',
] as const;
export type ReasonTag = (typeof REASON_TAGS)[number] | (string & {});

/** 복기 메모 (Trade에 내포) — 매매 사유·근거 태그 포함 */
export interface ReviewNote {
  reason?: string;        // 매매 사유 (자유 입력) — 매매일지 입력 시 필수 권장
  entryReason?: string;   // (선택) 진입 사유 별도 기록 시
  exitReason?: string;    // (선택) 청산 사유 별도 기록 시
  emotion?: Emotion;      // 당시 심리
  tags: ReasonTag[];      // 근거 태그 (실적/차트/뉴스/수급/테마/...)
  followedPlan?: boolean; // 계획대로 했는가
  lesson?: string;        // 배운 점
}

/** 거래/이벤트 1건 */
export interface Trade {
  id: string;
  accountId: string;
  symbol: string;
  code?: string;
  side: Side;
  price: number;
  quantity: number;
  amount: number;        // buy/sell: price*quantity, deposit/withdrawal: 납입·인출액
  fee: number;
  tax: number;
  executedAt: string;    // ISO
  broker?: string;
  realizedPnl?: number;
  returnRate?: number;
  note?: ReviewNote;
  source: Source;
  confidence?: number;
  linkedCheckId?: string;
  analysisId?: string;       // 분석 노트 연결 (analysis_notes FK)
  // 세액공제 트래커용: DC 전환 등 세액공제 비대상 납입을 표시
  taxDeductible?: boolean; // 기본 true. irp_dc의 이전금/한도초과분은 false 권장
}

/** 투자 검토 */
export interface InvestCheck {
  id: string;
  accountId: string;
  symbol: string;
  code?: string;
  createdAt: string;
  items: { id: string; label: string; checked: boolean; comment?: string }[];
  targetPrice?: number;
  stopLoss?: number;
  weight?: number;
  scenario?: string;
  decision?: 'watch' | 'buy' | 'pass';
  resultedTradeId?: string;
}

/* ────────────────────────────────────────────────────────────
 * 한도·세제 설정 (TaxConfig)
 *
 * ⚠️ 한도/세율은 매년 바뀌고 2026년 ISA는 개편 과도기다.
 *    아래는 편집 가능한 "기본값"일 뿐이며 사용자가 설정에서 덮어쓴다.
 *    본 트래커는 참고용 자동 집계이며 세무 자문이 아니다.
 *    정확한 한도·세율은 관계 부처/금융기관 공식 자료를 따른다.
 * ──────────────────────────────────────────────────────────── */

export interface TaxConfig {
  taxYear: number;
  // 연금계좌(연금저축+IRP 자기부담) 합산 세액공제 한도
  pensionDeductionCap: number;       // 기본 9_000_000
  // 그중 연금저축 단독 세액공제 한도
  pensionSavingsSubCap: number;      // 기본 6_000_000
  // 연금계좌 연간 납입 한도(연금저축+DC/IRP 자기부담 합산)
  pensionAnnualContribCap: number;   // 기본 18_000_000
  // 세액공제율 (지방세 포함 체감률). 소득 기준선 이하/초과
  deductRateLow: number;             // 기본 0.165
  deductRateHigh: number;            // 기본 0.132
  salaryThreshold: number;           // 기본 55_000_000 (총급여 기준)
  // ISA
  isaAnnualContribCap: number;       // 현행 20_000_000 (슈퍼ISA 시 40_000_000)
  isaTotalContribCap: number;        // 현행 100_000_000 (슈퍼ISA 시 200_000_000)
  isaTaxFreeLimit: number;           // 일반형 비과세 한도 (현행/개편값 사용자 선택)
  isaMandatoryYears: number;         // 의무 가입기간 (기본 3)
  // 중도해지/연금외 수령 시 기타소득세율
  earlyWithdrawalTaxRate: number;    // 기본 0.165
}

/** 2026년 기준 편집 가능한 기본값 (사용자 설정에서 덮어쓰기 전제) */
export const DEFAULT_TAX_CONFIG: TaxConfig = {
  taxYear: 2026,
  pensionDeductionCap: 9_000_000,
  pensionSavingsSubCap: 6_000_000,
  pensionAnnualContribCap: 18_000_000,
  deductRateLow: 0.165,
  deductRateHigh: 0.132,
  salaryThreshold: 55_000_000,
  isaAnnualContribCap: 20_000_000,   // 슈퍼ISA 시행 확정 시 40_000_000로 변경
  isaTotalContribCap: 100_000_000,   // 슈퍼ISA 시 200_000_000
  isaTaxFreeLimit: 2_000_000,        // 개편 시 5_000_000(서민형 10_000_000)
  isaMandatoryYears: 3,
  earlyWithdrawalTaxRate: 0.165,
};

/** 수기 입력 폼 기본값 헬퍼 */
export function emptyTrade(accountId: string): Omit<Trade, 'id'> {
  return {
    accountId,
    symbol: '',
    side: 'buy',
    price: 0,
    quantity: 0,
    amount: 0,
    fee: 0,
    tax: 0,
    executedAt: new Date().toISOString().slice(0, 16),
    source: 'manual',
    confidence: 1,
    taxDeductible: true,
    note: { tags: [] },
  };
}
