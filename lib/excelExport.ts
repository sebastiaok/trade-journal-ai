// lib/excelExport.ts
// Excel 내보내기 — 계좌별 시트 분리, 손익 서식 적용
// SheetJS (xlsx) 사용

import * as XLSX from 'xlsx';
import { accountsRepo, tradesRepo, holdingsRepo, realizedPnlRepo } from './repo';
import type { Account, Trade, Holding, RealizedPnlRow } from '../data/types';

const SIDE_LABEL: Record<string, string> = {
  buy: '매수', sell: '매도', deposit: '납입', withdrawal: '인출',
};

const TYPE_LABEL: Record<string, string> = {
  general: '일반', isa: 'ISA', pension: '연금저축', irp: 'IRP', irp_dc: 'IRP(DC)',
};

/**
 * Excel 내보내기 — 계좌별 시트 분리
 *
 * 시트 구성:
 * 1. 요약 — 전체 계좌 현황
 * 2. [계좌명] — 계좌별 거래내역 + 보유현황 + 실현손익
 */
export async function exportExcel(): Promise<void> {
  const [accounts, trades, holdings, pnlRows] = await Promise.all([
    accountsRepo.list(),
    tradesRepo.list(),
    holdingsRepo.list(),
    realizedPnlRepo.list(),
  ]);

  const wb = XLSX.utils.book_new();

  // ─── 1. 요약 시트 ───
  addSummarySheet(wb, accounts, trades, holdings, pnlRows);

  // ─── 2. 계좌별 시트 ───
  for (const acct of accounts) {
    const acctTrades = trades.filter((t) => t.accountId === acct.id);
    const acctHoldings = holdings.filter((h) => h.accountId === acct.id);
    const acctPnl = pnlRows.filter((p) => p.accountId === acct.id);
    addAccountSheet(wb, acct, acctTrades, acctHoldings, acctPnl);
  }

  // ─── 3. 전체 실현손익 시트 ───
  addPnlSheet(wb, accounts, pnlRows);

  // 다운로드
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `TradeJournal_${date}.xlsx`);
}

/* ───────── 요약 시트 ───────── */

function addSummarySheet(
  wb: XLSX.WorkBook,
  accounts: Account[],
  trades: Trade[],
  holdings: Holding[],
  pnlRows: RealizedPnlRow[],
) {
  const rows: (string | number)[][] = [];

  // 제목 행
  rows.push(['TradeJournalAI 투자현황 요약', '', '', '', '', '']);
  rows.push([`내보낸 날짜: ${new Date().toLocaleDateString('ko-KR')}`, '', '', '', '', '']);
  rows.push([]);

  // 계좌 요약 헤더
  rows.push(['계좌명', '유형', '증권사', '예수금', '보유종목수', '거래건수', '실현손익합계']);

  for (const acct of accounts) {
    const holdCount = holdings.filter((h) => h.accountId === acct.id).length;
    const tradeCount = trades.filter((t) => t.accountId === acct.id).length;
    const totalPnl = pnlRows
      .filter((p) => p.accountId === acct.id)
      .reduce((sum, p) => sum + p.pnlAmount, 0);

    rows.push([
      acct.name,
      TYPE_LABEL[acct.type] ?? acct.type,
      acct.broker ?? '',
      acct.cashBalance,
      holdCount,
      tradeCount,
      totalPnl,
    ]);
  }

  rows.push([]);

  // 전체 합계
  const totalCash = accounts.reduce((s, a) => s + a.cashBalance, 0);
  const totalHoldings = holdings.reduce((s, h) => s + h.quantity * h.avgCost, 0);
  const totalPnlAll = pnlRows.reduce((s, p) => s + p.pnlAmount, 0);

  rows.push(['전체 합계', '', '', '', '', '', '']);
  rows.push(['예수금 합계', totalCash]);
  rows.push(['보유 평가(취득원가)', totalHoldings]);
  rows.push(['실현손익 합계', totalPnlAll]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // 열 너비 설정
  ws['!cols'] = [
    { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, '요약');
}

/* ───────── 계좌별 시트 ───────── */

function addAccountSheet(
  wb: XLSX.WorkBook,
  acct: Account,
  trades: Trade[],
  holdings: Holding[],
  pnlRows: RealizedPnlRow[],
) {
  const rows: (string | number)[][] = [];

  // 계좌 정보
  rows.push([`${acct.name} (${TYPE_LABEL[acct.type] ?? acct.type})`]);
  rows.push([`증권사: ${acct.broker ?? '-'}`, '', `예수금: ${acct.cashBalance.toLocaleString()}원`]);
  rows.push([]);

  // 보유현황
  rows.push(['[ 보유현황 ]']);
  rows.push(['종목', '종목코드', '수량', '평균매입가', '평가금액(취득원가)']);
  for (const h of holdings) {
    rows.push([h.symbol, h.code ?? '', h.quantity, h.avgCost, Math.round(h.quantity * h.avgCost)]);
  }
  if (holdings.length === 0) rows.push(['(보유 종목 없음)']);
  rows.push([]);

  // 거래내역
  rows.push(['[ 거래내역 ]']);
  rows.push(['체결일시', '종목', '구분', '수량', '단가', '금액', '수수료', '세금', '실현손익', '소스']);
  for (const t of trades) {
    rows.push([
      t.executedAt?.slice(0, 10) ?? '',
      t.symbol,
      SIDE_LABEL[t.side] ?? t.side,
      t.quantity,
      t.price,
      t.amount,
      t.fee,
      t.tax,
      t.realizedPnl ?? '',
      t.source,
    ]);
  }
  if (trades.length === 0) rows.push(['(거래 내역 없음)']);
  rows.push([]);

  // 실현손익
  if (pnlRows.length > 0) {
    rows.push(['[ 실현손익 ]']);
    rows.push(['종목', '매수단가', '매도단가', '수량', '손익금액', '실현일']);
    for (const p of pnlRows) {
      rows.push([p.symbol, p.buyPrice, p.sellPrice, p.matchedQty, p.pnlAmount, p.realizedAt]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 8 },
  ];

  // 시트 이름 (Excel 제한: 31자, 특수문자 제거)
  const sheetName = acct.name.replace(/[\\/*?[\]:]/g, '').slice(0, 28);
  XLSX.utils.book_append_sheet(wb, ws, sheetName || `계좌_${acct.id.slice(0, 6)}`);
}

/* ───────── 전체 실현손익 시트 ───────── */

function addPnlSheet(
  wb: XLSX.WorkBook,
  accounts: Account[],
  pnlRows: RealizedPnlRow[],
) {
  const acctMap = new Map(accounts.map((a) => [a.id, a.name]));

  const rows: (string | number)[][] = [];
  rows.push(['계좌', '종목', '매수단가', '매도단가', '수량', '손익금액', '수수료', '세금', '실현일']);

  const sorted = [...pnlRows].sort((a, b) => b.realizedAt.localeCompare(a.realizedAt));
  for (const p of sorted) {
    rows.push([
      acctMap.get(p.accountId) ?? '',
      p.symbol,
      p.buyPrice,
      p.sellPrice,
      p.matchedQty,
      p.pnlAmount,
      p.feeAmount,
      p.taxAmount,
      p.realizedAt,
    ]);
  }

  // 합계
  const totalPnl = pnlRows.reduce((s, p) => s + p.pnlAmount, 0);
  const totalFee = pnlRows.reduce((s, p) => s + p.feeAmount, 0);
  const totalTax = pnlRows.reduce((s, p) => s + p.taxAmount, 0);
  rows.push([]);
  rows.push(['합계', '', '', '', '', totalPnl, totalFee, totalTax, '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, '실현손익');
}
