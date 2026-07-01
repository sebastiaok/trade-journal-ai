// lib/pdfExport.ts
// PDF 리포트 내보내기 — 총자산·수익률·배분 요약 1페이지
// jsPDF + jspdf-autotable 사용

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { accountsRepo, holdingsRepo, realizedPnlRepo, snapshotsRepo, tickersRepo, priceCacheRepo } from './repo';
import type { Account, Holding, RealizedPnlRow, PortfolioSnapshot, Ticker, PriceCache } from '../data/types';

const TYPE_LABEL: Record<string, string> = {
  general: '일반', isa: 'ISA', pension: '연금저축', irp: 'IRP', irp_dc: 'IRP(DC)', dc: 'DC(확정기여)',
};

/**
 * PDF 리포트 내보내기
 *
 * 구성:
 * - 헤더 (제목 + 날짜)
 * - 총자산 요약 (예수금, 평가액, 총자산, 수익률)
 * - 계좌별 현황 테이블
 * - 섹터별 배분 테이블
 * - 실현손익 요약
 */
export async function exportPdfReport(): Promise<void> {
  const [accounts, holdings, pnlRows, snapshots, tickers, priceCache] = await Promise.all([
    accountsRepo.list(),
    holdingsRepo.list(),
    realizedPnlRepo.list(),
    snapshotsRepo.list(),
    tickersRepo.list(),
    priceCacheRepo.list(),
  ]);

  // 가격/섹터맵
  const priceMap = new Map(priceCache.map((p) => [p.tickerCode, p.price]));
  const sectorMap = new Map<string, string>();
  for (const t of tickers) {
    if (t.sector) { sectorMap.set(t.name, t.sector); sectorMap.set(t.code, t.sector); }
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // ─── 헤더 ───
  doc.setFontSize(18);
  doc.text('TradeJournalAI', pageWidth / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(11);
  doc.text(`Portfolio Report — ${new Date().toLocaleDateString('ko-KR')}`, pageWidth / 2, y, { align: 'center' });
  y += 12;

  // ─── 총자산 요약 ───
  const totalCash = accounts.reduce((s, a) => s + a.cashBalance, 0);
  let totalEval = 0;
  let totalCost = 0;
  for (const h of holdings) {
    const price = priceMap.get(h.code ?? '') ?? h.avgCost;
    totalEval += h.quantity * price;
    totalCost += h.quantity * h.avgCost;
  }
  const totalAsset = totalCash + totalEval;
  const totalReturn = totalCost > 0 ? ((totalEval - totalCost) / totalCost) * 100 : 0;
  const totalRealizedPnl = pnlRows.reduce((s, p) => s + p.pnlAmount, 0);

  doc.setFontSize(12);
  doc.text('Asset Summary', 14, y);
  y += 6;

  const summaryData = [
    ['Total Assets', formatWon(totalAsset)],
    ['Cash', formatWon(totalCash)],
    ['Holdings (Eval)', formatWon(totalEval)],
    ['Holdings (Cost)', formatWon(totalCost)],
    ['Unrealized P&L', formatWon(totalEval - totalCost) + ` (${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(1)}%)`],
    ['Realized P&L', formatWon(totalRealizedPnl)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Item', 'Value']],
    body: summaryData,
    theme: 'grid',
    headStyles: { fillColor: [46, 125, 111], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 60, halign: 'right' } },
    margin: { left: 14 },
    tableWidth: 110,
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // ─── 계좌별 현황 ───
  doc.setFontSize(12);
  doc.text('Accounts', 14, y);
  y += 6;

  const accountRows = accounts.map((a) => {
    const acctHoldings = holdings.filter((h) => h.accountId === a.id);
    const acctEval = acctHoldings.reduce((s, h) => {
      const price = priceMap.get(h.code ?? '') ?? h.avgCost;
      return s + h.quantity * price;
    }, 0);
    const acctPnl = pnlRows
      .filter((p) => p.accountId === a.id)
      .reduce((s, p) => s + p.pnlAmount, 0);
    return [
      a.name,
      TYPE_LABEL[a.type] ?? a.type,
      formatWon(a.cashBalance),
      formatWon(acctEval),
      formatWon(a.cashBalance + acctEval),
      formatWon(acctPnl),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Account', 'Type', 'Cash', 'Holdings', 'Total', 'Realized']],
    body: accountRows,
    theme: 'striped',
    headStyles: { fillColor: [46, 125, 111], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // ─── 섹터별 배분 ───
  const sectorAgg: Record<string, number> = {};
  for (const h of holdings) {
    const sector = sectorMap.get(h.symbol) ?? sectorMap.get(h.code ?? '') ?? '기타';
    const price = priceMap.get(h.code ?? '') ?? h.avgCost;
    sectorAgg[sector] = (sectorAgg[sector] ?? 0) + h.quantity * price;
  }

  const sectorEntries = Object.entries(sectorAgg).sort((a, b) => b[1] - a[1]);
  const totalSector = sectorEntries.reduce((s, [, v]) => s + v, 0);

  if (sectorEntries.length > 0 && y < 240) {
    doc.setFontSize(12);
    doc.text('Sector Allocation', 14, y);
    y += 6;

    const sectorRows = sectorEntries.map(([sector, value]) => [
      sector,
      formatWon(value),
      totalSector > 0 ? `${((value / totalSector) * 100).toFixed(1)}%` : '0%',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Sector', 'Value', 'Weight']],
      body: sectorRows,
      theme: 'grid',
      headStyles: { fillColor: [46, 125, 111], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: 14 },
      tableWidth: 100,
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // ─── 푸터 ───
  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text(
    'Generated by TradeJournalAI — For personal reference only, not financial advice.',
    pageWidth / 2,
    285,
    { align: 'center' },
  );

  // 다운로드
  const date = new Date().toISOString().slice(0, 10);
  doc.save(`TradeJournal_Report_${date}.pdf`);
}

function formatWon(n: number): string {
  if (Math.abs(n) >= 100_000_000) {
    return `${(n / 100_000_000).toFixed(1)}억원`;
  }
  if (Math.abs(n) >= 10_000) {
    return `${Math.round(n / 10_000).toLocaleString()}만원`;
  }
  return `${n.toLocaleString()}원`;
}
