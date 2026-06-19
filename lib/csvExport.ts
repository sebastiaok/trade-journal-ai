// lib/csvExport.ts
// CSV 내보내기 — UTF-8 BOM 포함, 한글 엑셀 호환.

import { accountsRepo, tradesRepo, holdingsRepo, realizedPnlRepo } from './repo';
import type { Account, Trade, Holding, RealizedPnlRow } from '../data/types';

const BOM = '\uFEFF';

function escapeCsv(val: unknown): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvString(headers: string[], rows: string[][]): string {
  const head = headers.map(escapeCsv).join(',');
  const body = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
  return BOM + head + '\n' + body;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const SIDE_LABEL: Record<string, string> = {
  buy: '매수', sell: '매도', deposit: '납입', withdrawal: '인출',
};

/* ───────── 거래내역 CSV ───────── */

export async function exportTradesCsv(accounts?: Account[]): Promise<void> {
  const trades = await tradesRepo.list();
  const accts = accounts ?? await accountsRepo.list();
  const acctMap = new Map(accts.map((a) => [a.id, a.name]));

  const headers = ['계좌', '종목', '종목코드', '구분', '단가', '수량', '금액', '수수료', '세금', '실현손익', '체결일시', '소스', '사유', '태그'];
  const rows = trades.map((t) => [
    acctMap.get(t.accountId) ?? t.accountId,
    t.symbol, t.code ?? '', SIDE_LABEL[t.side] ?? t.side,
    String(t.price), String(t.quantity), String(t.amount),
    String(t.fee), String(t.tax), String(t.realizedPnl ?? ''),
    t.executedAt, t.source,
    t.note?.reason ?? '', (t.note?.tags ?? []).join(';'),
  ]);

  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(toCsvString(headers, rows), `거래내역_${date}.csv`);
}

/* ───────── 계좌+보유 CSV ───────── */

export async function exportAccountsCsv(): Promise<void> {
  const [accts, holdings] = await Promise.all([accountsRepo.list(), holdingsRepo.list()]);

  const headers = ['계좌', '유형', '증권사', '예수금', '종목', '종목코드', '수량', '평균매입가', '평가금액'];
  const rows: string[][] = [];

  for (const a of accts) {
    const h = holdings.filter((x) => x.accountId === a.id);
    if (h.length === 0) {
      rows.push([a.name, a.type, a.broker ?? '', String(a.cashBalance), '', '', '', '', '']);
    } else {
      for (const s of h) {
        rows.push([
          a.name, a.type, a.broker ?? '', String(a.cashBalance),
          s.symbol, s.code ?? '', String(s.quantity), String(s.avgCost),
          String(Math.round(s.quantity * s.avgCost)),
        ]);
      }
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(toCsvString(headers, rows), `계좌보유_${date}.csv`);
}

/* ───────── 실현손익 CSV ───────── */

export async function exportRealizedPnlCsv(accounts?: Account[]): Promise<void> {
  const pnl = await realizedPnlRepo.list();
  const accts = accounts ?? await accountsRepo.list();
  const acctMap = new Map(accts.map((a) => [a.id, a.name]));

  const headers = ['계좌', '종목', '매수단가', '매도단가', '수량', '손익금액', '수수료', '세금', '실현일'];
  const rows = pnl.map((r) => [
    acctMap.get(r.accountId) ?? r.accountId,
    r.symbol, String(r.buyPrice), String(r.sellPrice),
    String(r.matchedQty), String(r.pnlAmount),
    String(r.feeAmount), String(r.taxAmount), r.realizedAt,
  ]);

  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(toCsvString(headers, rows), `실현손익_${date}.csv`);
}
