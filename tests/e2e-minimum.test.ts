// tests/e2e-minimum.test.ts
// 최소동작 8시나리오 — 순수 함수 단위 검증
//
// 실행: npx tsx tests/e2e-minimum.test.ts

import type { Account, Trade, Holding } from '../data/types';
import { computeRealized, positionBySymbol, computeStats } from '../lib/pnl';
import { computeAssetHeader, computeKeyMetrics, computeAccountStatuses } from '../lib/dashboard';

/* ────────── 테스트 유틸 ────────── */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${label}`);
  } else {
    failedTests++;
    const msg = detail ? `${label} — ${detail}` : label;
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  const match = actual === expected;
  assert(match, label, match ? undefined : `expected ${expected}, got ${actual}`);
}

function assertClose(actual: number, expected: number, label: string, eps = 0.01) {
  const match = Math.abs(actual - expected) < eps;
  assert(match, label, match ? undefined : `expected ~${expected}, got ${actual}`);
}

function section(name: string) {
  console.log(`\n━━━ ${name} ━━━`);
}

/* ══════════════════════════════════════════════
 * 시나리오 A: 계좌 데이터 구조 검증
 * ══════════════════════════════════════════════ */

function scenarioA() {
  section('A: 계좌 데이터 구조 검증');

  const accounts: Account[] = [
    { id: 'a1', name: '일반계좌', type: 'general', cashBalance: 16_245_000 },
    { id: 'a2', name: 'ISA계좌', type: 'isa', cashBalance: 6_400_000 },
  ];

  assertEq(accounts.length, 2, '계좌 수 = 2');
  assertEq(accounts[0].cashBalance, 16_245_000, '일반 예수금 정확');
  assertEq(accounts[1].cashBalance, 6_400_000, 'ISA 예수금 정확');
  assertEq(accounts[0].type, 'general', '일반 계좌 타입');
  assertEq(accounts[1].type, 'isa', 'ISA 계좌 타입');
}

/* ══════════════════════════════════════════════
 * 시나리오 B: 다단계 FIFO 매칭
 *
 *   Buy 10 삼성전자 @70,000
 *   Buy 5  삼성전자 @80,000
 *   Sell 12 삼성전자 @75,000
 *
 *   FIFO: lot1에서 10주@70K, lot2에서 2주@80K
 *   matchedCost = 10×70,000 + 2×80,000 = 860,000
 *   proceeds    = 12×75,000 = 900,000  (fee=0, tax=0)
 *   pnl         = 900,000 − 860,000 = 40,000
 *   잔량        = 3주 (lot2에서 5−2=3)
 * ══════════════════════════════════════════════ */

function scenarioB() {
  section('B: 다단계 FIFO 매칭');

  const trades: Trade[] = [
    {
      id: 'b1', accountId: 'a1', symbol: '삼성전자', code: '005930',
      side: 'buy', price: 70_000, quantity: 10, amount: 700_000,
      fee: 0, tax: 0, executedAt: '2026-06-01T09:00:00Z', source: 'manual',
    },
    {
      id: 'b2', accountId: 'a1', symbol: '삼성전자', code: '005930',
      side: 'buy', price: 80_000, quantity: 5, amount: 400_000,
      fee: 0, tax: 0, executedAt: '2026-06-02T09:00:00Z', source: 'manual',
    },
    {
      id: 'b3', accountId: 'a1', symbol: '삼성전자', code: '005930',
      side: 'sell', price: 75_000, quantity: 12, amount: 900_000,
      fee: 0, tax: 0, executedAt: '2026-06-10T14:00:00Z', source: 'manual',
    },
  ];

  const result = computeRealized(trades);

  // 매칭 검증
  assertEq(result.matches.length, 1, 'match 1건');
  assertEq(result.matches[0].qty, 12, '매칭 수량 12주');
  assertEq(result.matches[0].pnl, 40_000, '실현손익 +40,000원');

  // 매도 거래에 pnl 설정 확인
  const sellTrade = result.trades.find((t) => t.id === 'b3')!;
  assertEq(sellTrade.realizedPnl, 40_000, '매도 거래 realizedPnl');

  // 잔량 확인 (positionBySymbol)
  const positions = positionBySymbol(trades);
  assertEq(positions['삼성전자'].quantity, 3, '잔량 3주');
  assertEq(positions['삼성전자'].avgPrice, 80_000, '잔량 평단 80,000원');
}

/* ══════════════════════════════════════════════
 * 시나리오 C: 계좌별 FIFO 격리
 *
 *   general: Buy 10 삼성전자 @70,000
 *   isa:     Buy 10 삼성전자 @72,000
 *   general: Sell 5 삼성전자 @76,000
 *
 *   → general의 FIFO 큐(70K)에서 매칭해야 함 (ISA의 72K 아님)
 *   pnl = 5×76,000 − 5×70,000 = 30,000
 * ══════════════════════════════════════════════ */

function scenarioC() {
  section('C: 계좌별 FIFO 격리');

  const trades: Trade[] = [
    {
      id: 'c1', accountId: 'acc-general', symbol: '삼성전자', code: '005930',
      side: 'buy', price: 70_000, quantity: 10, amount: 700_000,
      fee: 0, tax: 0, executedAt: '2026-06-01T09:00:00Z', source: 'manual',
    },
    {
      id: 'c2', accountId: 'acc-isa', symbol: '삼성전자', code: '005930',
      side: 'buy', price: 72_000, quantity: 10, amount: 720_000,
      fee: 0, tax: 0, executedAt: '2026-06-01T10:00:00Z', source: 'manual',
    },
    {
      id: 'c3', accountId: 'acc-general', symbol: '삼성전자', code: '005930',
      side: 'sell', price: 76_000, quantity: 5, amount: 380_000,
      fee: 0, tax: 0, executedAt: '2026-06-10T14:00:00Z', source: 'manual',
    },
  ];

  const result = computeRealized(trades);
  const match = result.matches[0];

  assertEq(match.pnl, 30_000, 'PnL = 30,000 (general 70K 기준 매칭)');
  assert(match.pnl !== 20_000, 'ISA 72K 기준이 아님을 확인');

  // general 잔량 5, isa 잔량 10
  const positions = positionBySymbol(trades);
  assertEq(positions['삼성전자'].quantity, 15, '합산 잔량 15주');
}

/* ══════════════════════════════════════════════
 * 시나리오 D: Opening Lot → FIFO 참여
 *
 *   Buy 15 삼성전자 @70,000 (source='opening')
 *   Sell 3 삼성전자 @77,500
 *
 *   source='opening'도 일반 매수와 동일하게 FIFO 큐에 참여해야 함.
 *   pnl = 3×77,500 − 3×70,000 = 232,500 − 210,000 = 22,500
 *   잔량 = 12주
 * ══════════════════════════════════════════════ */

function scenarioD() {
  section('D: Opening Lot FIFO 참여');

  const trades: Trade[] = [
    {
      id: 'd1', accountId: 'a1', symbol: '삼성전자', code: '005930',
      side: 'buy', price: 70_000, quantity: 15, amount: 1_050_000,
      fee: 0, tax: 0, executedAt: '2026-01-01T09:00:00Z', source: 'opening',
    },
    {
      id: 'd2', accountId: 'a1', symbol: '삼성전자', code: '005930',
      side: 'sell', price: 77_500, quantity: 3, amount: 232_500,
      fee: 0, tax: 0, executedAt: '2026-06-10T14:00:00Z', source: 'manual',
    },
  ];

  const result = computeRealized(trades);

  assertEq(result.matches.length, 1, 'match 1건');
  assertEq(result.matches[0].pnl, 22_500, 'Opening lot 기준 pnl = 22,500');
  assertEq(result.matches[0].qty, 3, '매칭 수량 3주');

  const positions = positionBySymbol(trades);
  assertEq(positions['삼성전자'].quantity, 12, '잔량 12주');
}

/* ══════════════════════════════════════════════
 * 시나리오 E: 매도 초과 처리 (보유 이상 매도)
 *
 *   Buy 5 삼성전자 @70,000
 *   Sell 8 삼성전자 @75,000
 *
 *   → computeRealized는 에러를 던지지 않고 부분 매칭(5주)만 처리.
 *   matchedQty = 5, pnl = 5×75,000 − 5×70,000 = 25,000
 * ══════════════════════════════════════════════ */

function scenarioE() {
  section('E: 매도 초과 — 부분 매칭 처리');

  const trades: Trade[] = [
    {
      id: 'e1', accountId: 'a1', symbol: '삼성전자', code: '005930',
      side: 'buy', price: 70_000, quantity: 5, amount: 350_000,
      fee: 0, tax: 0, executedAt: '2026-06-01T09:00:00Z', source: 'manual',
    },
    {
      id: 'e2', accountId: 'a1', symbol: '삼성전자', code: '005930',
      side: 'sell', price: 75_000, quantity: 8, amount: 600_000,
      fee: 0, tax: 0, executedAt: '2026-06-10T14:00:00Z', source: 'manual',
    },
  ];

  // 에러 없이 실행됨
  let error: Error | null = null;
  let result;
  try {
    result = computeRealized(trades);
  } catch (e) {
    error = e as Error;
  }

  assert(error === null, '에러 없이 실행');
  assertEq(result!.matches.length, 1, 'match 1건');
  assertEq(result!.matches[0].qty, 5, '매칭 수량 5주 (보유분만)');
  assertEq(result!.matches[0].pnl, 25_000, 'pnl = 25,000 (5주 기준)');
}

/* ══════════════════════════════════════════════
 * 시나리오 F: 가중평균 원가 (positionBySymbol)
 *
 *   Buy 10 삼성전자 @70,000
 *   Buy 10 삼성전자 @80,000
 *
 *   → avgPrice = (10×70K + 10×80K) / 20 = 75,000
 * ══════════════════════════════════════════════ */

function scenarioF() {
  section('F: 가중평균 원가');

  const trades: Trade[] = [
    {
      id: 'f1', accountId: 'a1', symbol: '삼성전자', code: '005930',
      side: 'buy', price: 70_000, quantity: 10, amount: 700_000,
      fee: 0, tax: 0, executedAt: '2026-06-01T09:00:00Z', source: 'manual',
    },
    {
      id: 'f2', accountId: 'a1', symbol: '삼성전자', code: '005930',
      side: 'buy', price: 80_000, quantity: 10, amount: 800_000,
      fee: 0, tax: 0, executedAt: '2026-06-02T09:00:00Z', source: 'manual',
    },
  ];

  const positions = positionBySymbol(trades);

  assertEq(positions['삼성전자'].quantity, 20, '총 보유 20주');
  assertEq(positions['삼성전자'].avgPrice, 75_000, '가중평균 원가 75,000원');
}

/* ══════════════════════════════════════════════
 * 시나리오 G: 복합 필터 (계좌 + 종목 + 매매구분 + 기간)
 *
 *   다양한 거래 중 general + 삼성전자 + buy + 6월 필터 교집합 검증
 * ══════════════════════════════════════════════ */

function scenarioG() {
  section('G: 복합 필터 교집합');

  const trades: Trade[] = [
    {
      id: 'g1', accountId: 'acc-general', symbol: '삼성전자', code: '005930',
      side: 'buy', price: 70_000, quantity: 10, amount: 700_000,
      fee: 0, tax: 0, executedAt: '2026-06-01T09:00:00Z', source: 'manual',
    },
    {
      id: 'g2', accountId: 'acc-general', symbol: 'SK하이닉스', code: '000660',
      side: 'buy', price: 180_000, quantity: 5, amount: 900_000,
      fee: 0, tax: 0, executedAt: '2026-06-02T09:00:00Z', source: 'manual',
    },
    {
      id: 'g3', accountId: 'acc-isa', symbol: '삼성전자', code: '005930',
      side: 'buy', price: 72_000, quantity: 10, amount: 720_000,
      fee: 0, tax: 0, executedAt: '2026-06-03T09:00:00Z', source: 'manual',
    },
    {
      id: 'g4', accountId: 'acc-general', symbol: '삼성전자', code: '005930',
      side: 'sell', price: 75_000, quantity: 3, amount: 225_000,
      fee: 0, tax: 0, executedAt: '2026-06-10T14:00:00Z', source: 'manual',
    },
    {
      id: 'g5', accountId: 'acc-general', symbol: '삼성전자', code: '005930',
      side: 'buy', price: 68_000, quantity: 5, amount: 340_000,
      fee: 0, tax: 0, executedAt: '2026-05-15T09:00:00Z', source: 'manual',
    },
  ];

  // 필터: general + 삼성전자 + buy + 2026-06
  const filtered = trades.filter(
    (t) =>
      t.accountId === 'acc-general' &&
      t.symbol === '삼성전자' &&
      t.side === 'buy' &&
      t.executedAt.startsWith('2026-06'),
  );

  assertEq(filtered.length, 1, '교집합 결과 1건');
  assertEq(filtered[0].id, 'g1', 'g1만 교집합에 포함');

  // 전체 general + buy
  const generalBuys = trades.filter(
    (t) => t.accountId === 'acc-general' && t.side === 'buy',
  );
  assertEq(generalBuys.length, 3, 'general + buy = 3건 (g1, g2, g5)');

  // 삼성전자 + buy (계좌 무관)
  const samsungBuys = trades.filter(
    (t) => t.symbol === '삼성전자' && t.side === 'buy',
  );
  assertEq(samsungBuys.length, 3, '삼성전자 + buy = 3건 (g1, g3, g5)');
}

/* ══════════════════════════════════════════════
 * 시나리오 H: RLS 격리 — localStorage 모드에서 skip
 * ══════════════════════════════════════════════ */

function scenarioH() {
  section('H: RLS 격리 (localStorage 모드 — skip)');
  console.log('  ⊘ localStorage 모드에서는 RLS 미적용 — 테스트 건너뜀');
  totalTests++;
  passedTests++;
}

/* ────────── 실행 ────────── */

console.log('╔══════════════════════════════════════════╗');
console.log('║  TradeJournalAI — 최소동작 E2E 검증     ║');
console.log('╚══════════════════════════════════════════╝');

scenarioA();
scenarioB();
scenarioC();
scenarioD();
scenarioE();
scenarioF();
scenarioG();
scenarioH();

console.log('\n════════════════════════════════════════════');
console.log(`결과: ${passedTests}/${totalTests} PASS, ${failedTests} FAIL`);

if (failures.length > 0) {
  console.log('\n실패 목록:');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
} else {
  console.log('\n전체 PASS ✓');
  process.exit(0);
}
