// tests/e2e-master-data.ts
// 전체통합 시나리오 마스터 데이터
// 모든 기대값은 실제 함수 로직에 맞춰 정밀 계산됨.

import type {
  Account,
  Holding,
  Trade,
  RealizedPnlRow,
  PriceCache,
  AccountDeposit,
  TaxLimit,
  TargetAllocation,
  PortfolioSnapshot,
} from '../data/types';

/* ════════════════════════════════════════════
 * 1. 계좌
 * ════════════════════════════════════════════ */

export const accounts: Account[] = [
  {
    id: 'acc-general',
    name: '일반계좌',
    type: 'general',
    broker: '키움',
    cashBalance: 16_245_000,
  },
  {
    id: 'acc-isa',
    name: 'ISA계좌',
    type: 'isa',
    broker: '삼성',
    openedAt: '2024-01-15',
    cashBalance: 6_400_000,
  },
];

/* ════════════════════════════════════════════
 * 2. 보유 현황 (거래 후 최종 상태)
 *    - general: 삼성전자 70주 @70,000 / SK하이닉스 50주 @180,000
 *    - isa: 삼성전자 50주 @72,000
 * ════════════════════════════════════════════ */

export const holdings: Holding[] = [
  {
    id: 'h-1',
    accountId: 'acc-general',
    symbol: '삼성전자',
    code: '005930',
    quantity: 70,
    avgCost: 70_000,
    updatedAt: '2026-06-15T10:00:00Z',
  },
  {
    id: 'h-2',
    accountId: 'acc-general',
    symbol: 'SK하이닉스',
    code: '000660',
    quantity: 50,
    avgCost: 180_000,
    updatedAt: '2026-06-15T10:00:00Z',
  },
  {
    id: 'h-3',
    accountId: 'acc-isa',
    symbol: '삼성전자',
    code: '005930',
    quantity: 50,
    avgCost: 72_000,
    updatedAt: '2026-06-15T10:00:00Z',
  },
];

/* ════════════════════════════════════════════
 * 3. 거래 이력
 *    - general: 삼성전자 100주 매수 @70,000 → 30주 매도 @75,000 (fee=2250, tax=2750)
 *    - general: SK하이닉스 50주 매수 @180,000
 *    - isa: 삼성전자 50주 매수 @72,000
 * ════════════════════════════════════════════ */

export const trades: Trade[] = [
  {
    id: 't-1',
    accountId: 'acc-general',
    symbol: '삼성전자',
    code: '005930',
    side: 'buy',
    price: 70_000,
    quantity: 100,
    amount: 7_000_000,
    fee: 0,
    tax: 0,
    executedAt: '2026-06-01T09:00:00Z',
    source: 'manual',
  },
  {
    id: 't-2',
    accountId: 'acc-general',
    symbol: '삼성전자',
    code: '005930',
    side: 'sell',
    price: 75_000,
    quantity: 30,
    amount: 2_250_000,
    fee: 2_250,
    tax: 2_750,
    executedAt: '2026-06-10T14:00:00Z',
    source: 'manual',
  },
  {
    id: 't-3',
    accountId: 'acc-general',
    symbol: 'SK하이닉스',
    code: '000660',
    side: 'buy',
    price: 180_000,
    quantity: 50,
    amount: 9_000_000,
    fee: 0,
    tax: 0,
    executedAt: '2026-06-02T09:30:00Z',
    source: 'manual',
  },
  {
    id: 't-4',
    accountId: 'acc-isa',
    symbol: '삼성전자',
    code: '005930',
    side: 'buy',
    price: 72_000,
    quantity: 50,
    amount: 3_600_000,
    fee: 0,
    tax: 0,
    executedAt: '2026-06-03T10:00:00Z',
    source: 'manual',
  },
];

/* ════════════════════════════════════════════
 * 4. 시세
 * ════════════════════════════════════════════ */

export const priceMap: Record<string, number> = {
  '005930': 76_000,  // 삼성전자
  '000660': 185_000, // SK하이닉스
};

export const priceCache: PriceCache[] = [
  { tickerCode: '005930', price: 76_000, fetchedAt: '2026-06-19T09:00:00Z' },
  { tickerCode: '000660', price: 185_000, fetchedAt: '2026-06-19T09:05:00Z' },
];

/* ════════════════════════════════════════════
 * 5. 실현손익 행 (RealizedPnlRow)
 *    computeKeyMetrics의 ytdRealizedPnl 계산에 사용
 * ════════════════════════════════════════════ */

export const realizedPnlRows: RealizedPnlRow[] = [
  {
    id: 'rpnl-1',
    accountId: 'acc-general',
    symbol: '삼성전자',
    sellTradeId: 't-2',
    buyTradeId: 't-1',
    matchedQty: 30,
    buyPrice: 70_000,
    sellPrice: 75_000,
    pnlAmount: 145_000,
    feeAmount: 2_250,
    taxAmount: 2_750,
    realizedAt: '2026-06-10T14:00:00Z',
  },
];

/* ════════════════════════════════════════════
 * 6. ISA 납입 기록 (알림 엔진용)
 *    ISA 한도 20,000,000원 중 16,500,000원 납입 → 82.5% → warning
 * ════════════════════════════════════════════ */

export const deposits: AccountDeposit[] = [
  {
    id: 'dep-1',
    accountId: 'acc-isa',
    amount: 10_000_000,
    kind: 'deposit',
    memo: '초기 납입',
    occurredAt: '2026-01-15T09:00:00Z',
    createdAt: '2026-01-15T09:00:00Z',
  },
  {
    id: 'dep-2',
    accountId: 'acc-isa',
    amount: 6_500_000,
    kind: 'deposit',
    memo: '추가 납입',
    occurredAt: '2026-04-01T09:00:00Z',
    createdAt: '2026-04-01T09:00:00Z',
  },
];

/* ════════════════════════════════════════════
 * 7. 세제 한도
 * ════════════════════════════════════════════ */

export const taxLimits: TaxLimit[] = [
  {
    id: 'tl-1',
    accountType: 'isa',
    year: 2026,
    annualLimit: 20_000_000,
    cumulativeLimit: 100_000_000,
  },
];

/* ════════════════════════════════════════════
 * 8. 목표 배분 (섹터별)
 * ════════════════════════════════════════════ */

export const targetAllocation: TargetAllocation[] = [
  { id: 'ta-1', sector: '반도체', targetPct: 30 },
  { id: 'ta-2', sector: '현금', targetPct: 50 },
];

export const sectorMap: Record<string, string> = {
  '삼성전자': '반도체',
  'SK하이닉스': '반도체',
};

/* ════════════════════════════════════════════
 * 9. 포트폴리오 스냅샷 (MDD 계산용)
 *    고점 40M → 하락 38M → 회복 41M
 * ════════════════════════════════════════════ */

export const snapshots: PortfolioSnapshot[] = [
  {
    id: 'snap-1',
    snapshotDate: '2026-06-01',
    totalValue: 17_000_000,
    totalCost: 16_500_000,
    cash: 23_000_000,
    details: [],
    createdAt: '2026-06-01T18:00:00Z',
  },
  {
    id: 'snap-2',
    snapshotDate: '2026-06-08',
    totalValue: 17_800_000,
    totalCost: 17_500_000,
    cash: 22_645_000,
    details: [],
    createdAt: '2026-06-08T18:00:00Z',
  },
  {
    id: 'snap-3',
    snapshotDate: '2026-06-12',
    totalValue: 15_800_000,
    totalCost: 17_500_000,
    cash: 22_645_000,
    details: [],
    createdAt: '2026-06-12T18:00:00Z',
  },
  {
    id: 'snap-4',
    snapshotDate: '2026-06-18',
    totalValue: 18_370_000,
    totalCost: 17_500_000,
    cash: 22_645_000,
    details: [],
    createdAt: '2026-06-18T18:00:00Z',
  },
];

/* ════════════════════════════════════════════
 * 10. 정밀 계산 기대값 (코드 로직 기반)
 *
 * ── computeRealized ──
 * t-2 매도 30주 삼성전자 (general):
 *   FIFO 매칭: lot1(t-1) 30@70,000, feePerShare=0
 *   matchedCost = 30 × 70,000 + 30 × 0 = 2,100,000
 *   proceeds    = 75,000 × 30 − 2,250 − 2,750 = 2,245,000
 *   pnl         = 2,245,000 − 2,100,000 = 145,000
 *   returnRate  = round2((145,000 / 2,100,000) × 100) = 6.9
 *
 * ── computeAssetHeader ──
 *   totalEval  = 70×76K + 50×185K + 50×76K = 5,320,000 + 9,250,000 + 3,800,000 = 18,370,000
 *   totalCost  = 70×70K + 50×180K + 50×72K = 4,900,000 + 9,000,000 + 3,600,000 = 17,500,000
 *   totalCash  = 16,245,000 + 6,400,000 = 22,645,000
 *   totalAsset = 18,370,000 + 22,645,000 = 41,015,000
 *   evalPnl    = 18,370,000 − 17,500,000 = 870,000
 *   evalPnlPct = round2((870,000 / 17,500,000) × 100) = 4.97
 *
 * ── computeKeyMetrics ──
 *   ytdRealizedPnl = 145,000 (2026년 실현)
 *   evalPnl        = 870,000
 *   holdingCount   = 2 (삼성전자, SK하이닉스)
 *   cashRatioPct   = round2((22,645,000 / 41,015,000) × 100) = 55.21
 *
 * ── computeTickerDistribution (avgCost 기준) ──
 *   삼성전자:  70×70K + 50×72K = 8,500,000
 *   SK하이닉스: 50×180K = 9,000,000
 *   현금:      22,645,000
 *   total:     40,145,000
 *
 * ── computeConcentration ──
 *   현금 pct      = 22,645,000 / 40,145,000 × 100 = 56.4104...
 *   SK하이닉스 pct = 9,000,000 / 40,145,000 × 100 = 22.4173...
 *   삼성전자 pct   = 8,500,000 / 40,145,000 × 100 = 21.1720...
 *   HHI = round(56.4104² + 22.4173² + 21.1720²) = round(4132.9...) = 4133
 *   level = 'high'
 *
 * ── computeMDD ──
 *   snap-1 val=40,000,000 (peak), snap-2 val=40,445,000 (new peak)
 *   snap-3 val=38,445,000 → dd = (40,445,000−38,445,000)/40,445,000 = 0.0494...
 *   snap-4 val=41,015,000 (new peak)
 *   mdd = round4(0.0494...) = 0.0495, mddPct = round2(4.94...) = 4.95
 *
 * ════════════════════════════════════════════ */
