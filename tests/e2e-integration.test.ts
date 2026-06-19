// tests/e2e-integration.test.ts
// 전체통합 핵심 6시나리오 — 마스터 데이터 기반 모듈 간 일관성 검증
//
// 실행: npx tsx tests/e2e-integration.test.ts

import {
  accounts, holdings, trades, priceMap, priceCache,
  realizedPnlRows, deposits, taxLimits,
  targetAllocation, sectorMap, snapshots,
} from './e2e-master-data';

import { computeRealized, positionBySymbol } from '../lib/pnl';
import {
  computeAssetHeader,
  computeKeyMetrics,
  computeAccountStatuses,
} from '../lib/dashboard';
import {
  computeTickerDistribution,
  computeConcentration,
  computeRebalanceProposals,
  computeSectorDistribution,
  computeMDD,
} from '../lib/portfolio';
import { computeAlerts } from '../lib/alerts';

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
  assert(match, label, match ? undefined : `expected ~${expected}, got ${actual} (eps=${eps})`);
}

function section(name: string) {
  console.log(`\n━━━ ${name} ━━━`);
}

/* ══════════════════════════════════════════════════
 * 시나리오 3: 데이터 일관성 (모듈 간 총자산 일치)
 *
 * 기대값 (정밀 계산):
 *   totalEval  = 70×76K + 50×185K + 50×76K = 18,370,000
 *   totalCost  = 70×70K + 50×180K + 50×72K = 17,500,000
 *   totalCash  = 16,245,000 + 6,400,000 = 22,645,000
 *   totalAsset = 18,370,000 + 22,645,000 = 41,015,000
 *   evalPnl    = 870,000
 *   evalPnlPct = round2((870,000/17,500,000)×100) = 4.97
 * ══════════════════════════════════════════════════ */

function scenario3() {
  section('3: 데이터 일관성 — 모듈 간 총자산 일치');

  // dashboard: computeAssetHeader
  const header = computeAssetHeader(holdings, accounts, priceMap, priceCache);
  assertEq(header.totalAsset, 41_015_000, '[dashboard] 총자산 41,015,000');
  assertEq(header.totalCash, 22_645_000, '[dashboard] 현금 22,645,000');
  assertEq(header.evalPnl, 870_000, '[dashboard] 평가손익 870,000');
  assertEq(header.evalPnlPct, 4.97, '[dashboard] 평가손익률 4.97%');
  assertEq(header.totalCost, 17_500_000, '[dashboard] 매입원가 17,500,000');

  // dashboard: computeAccountStatuses — 합산이 header와 일치
  const statuses = computeAccountStatuses(holdings, accounts, priceMap);
  const sumEval = statuses.reduce((s, a) => s + a.evalAmount, 0);
  assertEq(sumEval, header.totalAsset, '계좌별 합산 = 총자산 일치');

  // 계좌별 상세 검증
  const general = statuses.find((s) => s.accountId === 'acc-general')!;
  const isa = statuses.find((s) => s.accountId === 'acc-isa')!;

  // general: eval = 70×76K + 50×185K = 14,570,000, +cash 16,245,000 = 30,815,000
  assertEq(general.evalAmount, 30_815_000, '[general] 평가금액 30,815,000');
  assertEq(general.holdingCount, 2, '[general] 보유 종목 수 2');
  // general returnPct = (14,570,000 - 13,900,000) / 13,900,000 × 100 = 4.82
  assertEq(general.returnPct, 4.82, '[general] 수익률 4.82%');

  // isa: eval = 50×76K = 3,800,000, +cash 6,400,000 = 10,200,000
  assertEq(isa.evalAmount, 10_200_000, '[isa] 평가금액 10,200,000');
  assertEq(isa.holdingCount, 1, '[isa] 보유 종목 수 1');
  // isa returnPct = (3,800,000 - 3,600,000) / 3,600,000 × 100 = 5.56
  assertClose(isa.returnPct, 5.56, '[isa] 수익률 ~5.56%');
}

/* ══════════════════════════════════════════════════
 * 시나리오 4: 시세 캐시 적용 — priceMap 유무에 따른 변동
 * ══════════════════════════════════════════════════ */

function scenario4() {
  section('4: 시세 캐시 — priceMap 적용 효과');

  // priceMap 없이 (fallback to avgCost)
  const headerNoPrices = computeAssetHeader(holdings, accounts, {}, []);
  // totalEval = totalCost = 17,500,000
  assertEq(headerNoPrices.totalCost, 17_500_000, '[no-price] 매입원가 17,500,000');
  assertEq(headerNoPrices.evalPnl, 0, '[no-price] 평가손익 0 (avgCost fallback)');
  assertEq(headerNoPrices.totalAsset, 17_500_000 + 22_645_000, '[no-price] 총자산 40,145,000');

  // priceMap 적용 시
  const headerWithPrices = computeAssetHeader(holdings, accounts, priceMap, priceCache);
  assertEq(headerWithPrices.evalPnl, 870_000, '[with-price] 평가손익 870,000');
  assertEq(headerWithPrices.totalAsset, 41_015_000, '[with-price] 총자산 41,015,000');

  // 차이 = 시세 반영분
  const diff = headerWithPrices.totalAsset - headerNoPrices.totalAsset;
  assertEq(diff, 870_000, '시세 반영분 = 870,000');

  // priceAsOf
  assertEq(headerWithPrices.priceAsOf, '2026-06-19T09:00:00Z', 'priceAsOf = 가장 오래된 캐시 시각');
  assertEq(headerNoPrices.priceAsOf, null, '[no-price] priceAsOf = null');
}

/* ══════════════════════════════════════════════════
 * 시나리오 6: 포트폴리오 진단 — 배분·집중도·리밸런싱
 *
 * computeTickerDistribution (avgCost 기준):
 *   삼성전자:   70×70K + 50×72K = 8,500,000
 *   SK하이닉스: 50×180K = 9,000,000
 *   현금:       22,645,000
 *   total:      40,145,000
 *
 * computeConcentration:
 *   HHI = round(현금²+SK²+삼성²) = round(3182.14+502.53+448.27) = 4133
 *   level = 'high'
 * ══════════════════════════════════════════════════ */

function scenario6() {
  section('6: 포트폴리오 진단');

  // 종목별 배분
  const dist = computeTickerDistribution(holdings, accounts);

  // 항목 확인
  const samsung = dist.find((d) => d.label === '삼성전자')!;
  const hynix = dist.find((d) => d.label === 'SK하이닉스')!;
  const cash = dist.find((d) => d.label === '현금')!;

  assert(samsung != null, '삼성전자 항목 존재');
  assert(hynix != null, 'SK하이닉스 항목 존재');
  assert(cash != null, '현금 항목 존재');

  assertEq(samsung.value, 8_500_000, '삼성전자 평가액 8,500,000');
  assertEq(hynix.value, 9_000_000, 'SK하이닉스 평가액 9,000,000');
  assertEq(cash.value, 22_645_000, '현금 22,645,000');

  // 비중 검증
  const total = 40_145_000;
  assertClose(samsung.pct, 8_500_000 / total * 100, '삼성전자 비중 ~21.17%');
  assertClose(hynix.pct, 9_000_000 / total * 100, 'SK하이닉스 비중 ~22.42%');
  assertClose(cash.pct, 22_645_000 / total * 100, '현금 비중 ~56.41%');

  // 정렬: 비중 내림차순
  assertEq(dist[0].label, '현금', '1위 = 현금');

  // 집중도
  const conc = computeConcentration(dist);
  assertEq(conc.hhi, 4133, 'HHI = 4133');
  assertEq(conc.level, 'high', 'level = high');
  assertClose(conc.top1Pct, 56.41, 'top1Pct ~56.41');
  assertClose(conc.top3Pct, 100, 'top3Pct = 100');

  // 섹터별 배분 → 리밸런싱 제안
  const secDist = computeSectorDistribution(holdings, accounts, sectorMap);
  const semi = secDist.find((d) => d.label === '반도체')!;
  // 반도체 = 8,500,000 + 9,000,000 = 17,500,000 → 43.59%
  assertClose(semi.pct, 17_500_000 / total * 100, '반도체 비중 ~43.59%');

  // 리밸런싱 제안: 반도체 target 30% → diff = +13.59%p
  const proposals = computeRebalanceProposals(secDist, targetAllocation, total);
  const semiProposal = proposals.find((p) => p.sector === '반도체');
  assert(semiProposal != null, '반도체 리밸런싱 제안 존재');
  assertEq(semiProposal!.action, 'sell', '반도체: 매도 필요');
  assert(semiProposal!.diffPp > 10, '반도체 이탈 > 10%p');
}

/* ══════════════════════════════════════════════════
 * 시나리오 7: 자산 스냅샷 + MDD
 *
 * 스냅샷 (totalValue + cash):
 *   snap-1: 17M + 23M = 40M
 *   snap-2: 17.8M + 22.645M = 40.445M (peak)
 *   snap-3: 15.8M + 22.645M = 38.445M (trough)
 *   snap-4: 18.37M + 22.645M = 41.015M (new peak)
 *
 * MDD = (40,445,000 − 38,445,000) / 40,445,000 = 0.049454...
 * ══════════════════════════════════════════════════ */

function scenario7() {
  section('7: 자산 스냅샷 + MDD');

  const mdd = computeMDD(snapshots);

  // peak = snap-2: 40,445,000
  // trough = snap-3: 38,445,000
  // drawdown = 2,000,000 / 40,445,000 = 0.04945...
  const expectedMdd = 2_000_000 / 40_445_000;

  assertClose(mdd.mdd, expectedMdd, `MDD 비율 ~${expectedMdd.toFixed(4)}`, 0.001);
  assertClose(mdd.mddPct, expectedMdd * 100, `MDD % ~${(expectedMdd * 100).toFixed(2)}%`, 0.1);
  assertEq(mdd.peakDate, '2026-06-08', 'peak date = 2026-06-08');
  assertEq(mdd.troughDate, '2026-06-12', 'trough date = 2026-06-12');
  assert(mdd.mdd > 0, 'MDD > 0');
  assert(mdd.mdd < 1, 'MDD < 1');
}

/* ══════════════════════════════════════════════════
 * 시나리오 8: 알림 엔진
 *
 * 예상 알림:
 *   1. 반도체 비중 이탈 (target 30%, current ~43.59%) → danger (diff >= 10)
 *   2. ISA 납입 한도 (16,500,000 / 20,000,000 = 82.5%) → warning
 *   3. 현금 비중 이탈 (target 50%, current ~56.41%) → warning (diff ~6.4)
 *
 * 집중도 알림: 최대 종목 비중(avgCost 기준)
 *   SK하이닉스 9M / 40,145,000 = 22.42% → 40% 미만 → 미발동
 * ══════════════════════════════════════════════════ */

function scenario8() {
  section('8: 알림 엔진');

  const alerts = computeAlerts({
    accounts,
    holdings,
    trades,
    deposits,
    taxLimits,
    targetAllocation,
    sectorMap,
    priceMap,
  });

  // 반도체 이탈 알림
  const rebalAlerts = alerts.filter((a) => a.action === 'rebalance');
  assert(rebalAlerts.length >= 1, '리밸런싱 알림 >= 1건');

  const semiAlert = rebalAlerts.find((a) => a.title.includes('반도체'));
  assert(semiAlert != null, '반도체 비중 이탈 알림 존재');
  assertEq(semiAlert!.level, 'danger', '반도체: danger (10%p 이상 이탈)');

  // ISA 한도 알림
  const taxAlerts = alerts.filter((a) => a.action === 'tax_limit');
  assert(taxAlerts.length >= 1, 'ISA 납입 한도 알림 >= 1건');

  const isaAlert = taxAlerts.find((a) => a.title.includes('ISA'));
  assert(isaAlert != null, 'ISA 한도 알림 존재');
  assertEq(isaAlert!.level, 'warning', 'ISA: warning (82.5% — 80~95% 구간)');

  // 집중도 알림: 최대 종목 22.42% < 40% → 미발동
  const concAlerts = alerts.filter((a) => a.action === 'concentration');
  assertEq(concAlerts.length, 0, '집중도 알림 없음 (최대 22.42% < 40%)');

  // 전체 알림 수 확인
  console.log(`  ℹ 총 알림 ${alerts.length}건 발생`);
  for (const a of alerts) {
    console.log(`    [${a.level}] ${a.title}`);
  }
}

/* ══════════════════════════════════════════════════
 * 시나리오 9: 계좌 FIFO 격리 회귀 (마스터 데이터)
 *
 * 마스터 trades:
 *   t-1: general 삼성전자 100주 매수 @70K
 *   t-2: general 삼성전자 30주 매도 @75K
 *   t-4: isa 삼성전자 50주 매수 @72K
 *
 * → t-2 매도 시 general의 70K 기준 매칭되어야 함 (ISA 72K 아님)
 * ══════════════════════════════════════════════════ */

function scenario9() {
  section('9: 계좌 FIFO 격리 회귀 (마스터 데이터)');

  const result = computeRealized(trades);

  // 매칭은 1건 (t-2 매도)
  assertEq(result.matches.length, 1, '매칭 1건');
  assertEq(result.matches[0].sellId, 't-2', '매도 ID = t-2');
  assertEq(result.matches[0].qty, 30, '매칭 수량 30주');
  assertEq(result.matches[0].pnl, 145_000, 'pnl = 145,000');
  assertEq(result.matches[0].symbol, '삼성전자', '종목 = 삼성전자');

  // sell 거래의 realizedPnl
  const sellTrade = result.trades.find((t) => t.id === 't-2')!;
  assertEq(sellTrade.realizedPnl, 145_000, 't-2 realizedPnl = 145,000');
  assertEq(sellTrade.returnRate, 6.9, 't-2 returnRate = 6.9%');

  // positions: general 70주 + isa 50주 = 삼성전자 120주
  const positions = positionBySymbol(trades);
  assertEq(positions['삼성전자'].quantity, 120, '삼성전자 합산 잔량 120주');
  assertEq(positions['SK하이닉스'].quantity, 50, 'SK하이닉스 잔량 50주');

  // KeyMetrics: 실현손익은 올해(2026) 기준
  const metrics = computeKeyMetrics(holdings, accounts, realizedPnlRows, priceMap);
  assertEq(metrics.ytdRealizedPnl, 145_000, 'YTD 실현손익 145,000');
  assertEq(metrics.evalPnl, 870_000, '평가손익 870,000');
  assertEq(metrics.holdingCount, 2, '보유 종목 수 2');
  assertClose(metrics.cashRatioPct, 55.21, '현금 비중 ~55.21%');
}

/* ────────── 실행 ────────── */

console.log('╔══════════════════════════════════════════════╗');
console.log('║  TradeJournalAI — 전체통합 E2E 검증         ║');
console.log('╚══════════════════════════════════════════════╝');

scenario3();
scenario4();
scenario6();
scenario7();
scenario8();
scenario9();

console.log('\n════════════════════════════════════════════════');
console.log(`결과: ${passedTests}/${totalTests} PASS, ${failedTests} FAIL`);

if (failures.length > 0) {
  console.log('\n실패 목록:');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
} else {
  console.log('\n전체 PASS ✓');
  process.exit(0);
}
