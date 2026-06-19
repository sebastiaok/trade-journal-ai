// lib/backup.ts
// 로컬 백업 — 전체 데이터를 JSON 파일로 내보내고 다시 가져온다.
// 클라우드(Supabase)에 저장하되, 사용자가 언제든 자기 데이터를 손에 쥘 수 있게 한다.

import { accountsRepo, tradesRepo, checksRepo } from './repo';
import type { Account, Trade, InvestCheck } from '../data/types';

const SCHEMA_VERSION = 1;

export interface BackupFile {
  app: 'TradeJournalAI';
  schemaVersion: number;
  exportedAt: string;
  accounts: Account[];
  trades: Trade[];
  checks: InvestCheck[];
}

/** 복원 모드: merge(병합) 또는 overwrite(덮어쓰기) */
export type RestoreMode = 'merge' | 'overwrite';

/** 백업 파일 미리보기 정보 */
export interface BackupPreview {
  valid: boolean;
  exportedAt: string;
  accountCount: number;
  tradeCount: number;
  checkCount: number;
  accountNames: string[];
}

/* ───────── 내보내기 ───────── */

export async function buildBackup(): Promise<BackupFile> {
  const [accounts, trades, checks] = await Promise.all([
    accountsRepo.list(),
    tradesRepo.list(),
    checksRepo.list(),
  ]);
  return {
    app: 'TradeJournalAI',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    accounts,
    trades,
    checks,
  };
}

/** 브라우저에서 다운로드 트리거 (PC·모바일 모두 동작) */
export async function downloadBackup(): Promise<void> {
  const backup = await buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `trade-journal-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ───────── 미리보기 ───────── */

function validate(obj: unknown): asserts obj is BackupFile {
  if (!obj || typeof obj !== 'object') throw new Error('백업 파일 형식이 아닙니다.');
  const b = obj as Partial<BackupFile>;
  if (b.app !== 'TradeJournalAI') throw new Error('TradeJournalAI 백업 파일이 아닙니다.');
  if (!Array.isArray(b.accounts) || !Array.isArray(b.trades) || !Array.isArray(b.checks))
    throw new Error('백업 파일에 accounts/trades/checks 배열이 없습니다.');
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > SCHEMA_VERSION)
    throw new Error('지원하지 않는 백업 버전입니다. 앱을 업데이트하세요.');
}

/** 파일 내용을 파싱해 미리보기 정보를 반환한다 (실제 저장은 하지 않음). */
export function previewBackup(text: string): BackupPreview {
  const parsed: unknown = JSON.parse(text);
  validate(parsed);
  return {
    valid: true,
    exportedAt: parsed.exportedAt,
    accountCount: parsed.accounts.length,
    tradeCount: parsed.trades.length,
    checkCount: parsed.checks.length,
    accountNames: parsed.accounts.map((a: Account) => a.name),
  };
}

/* ───────── 가져오기 (merge) ───────── */

export interface ImportResult {
  accounts: number;
  trades: number;
  checks: number;
}

/**
 * 백업 JSON을 현재 계정으로 가져온다 (병합 모드).
 * - 파일 내 옛 id는 새 id로 매핑(계좌→거래/검토 참조 유지).
 * - 기존 데이터는 지우지 않고 추가(merge). 중복 방지는 호출 측에서 결정.
 */
export async function importBackup(text: string): Promise<ImportResult> {
  const parsed: unknown = JSON.parse(text);
  validate(parsed);
  const backup = parsed;

  // 1) 계좌 먼저 생성하고 old→new id 매핑
  const accountIdMap = new Map<string, string>();
  for (const a of backup.accounts) {
    const created = await accountsRepo.add({
      name: a.name, type: a.type, broker: a.broker, openedAt: a.openedAt, note: a.note,
      cashBalance: a.cashBalance ?? 0,
    });
    accountIdMap.set(a.id, created.id);
  }

  // 2) 거래 일괄 삽입 (account_id 재매핑). linked_check_id는 2차에서 연결 생략(단순화)
  const tradePayload = backup.trades
    .map((t) => {
      const accountId = accountIdMap.get(t.accountId);
      if (!accountId) return null; // 매핑 안 되는 거래는 건너뜀
      const { id: _id, linkedCheckId: _lc, ...rest } = t;
      return { ...rest, accountId };
    })
    .filter((x): x is Omit<Trade, 'id'> => x !== null);
  const insertedTrades = await tradesRepo.addMany(tradePayload);

  // 3) 검토 삽입 (account_id 재매핑, resultedTradeId는 단순화로 생략)
  let checkCount = 0;
  for (const c of backup.checks) {
    const accountId = accountIdMap.get(c.accountId);
    if (!accountId) continue;
    const { id: _id, createdAt: _ca, resultedTradeId: _rt, ...rest } = c;
    await checksRepo.add({ ...rest, accountId });
    checkCount++;
  }

  return {
    accounts: accountIdMap.size,
    trades: insertedTrades.length,
    checks: checkCount,
  };
}

/* ───────── 덮어쓰기 복원 ───────── */

/**
 * 기존 데이터를 모두 삭제 후 백업을 복원한다 (overwrite 모드).
 * ⚠️ 파괴적 작업 — 호출 전 사용자 확인 필수.
 */
export async function restoreBackup(text: string): Promise<ImportResult> {
  const parsed: unknown = JSON.parse(text);
  validate(parsed);

  // 기존 데이터 삭제: 거래/검토 → 계좌 순서 (FK 의존)
  const existing = await accountsRepo.list();
  for (const a of existing) {
    await accountsRepo.remove(a.id); // cascade로 trades/checks도 삭제
  }

  // 이제 병합 로직으로 삽입 (빈 DB에 삽입하므로 결과적으로 overwrite)
  return importBackup(text);
}

/** 파일 input에서 호출 */
export async function importBackupFromFile(file: File, mode: RestoreMode = 'merge'): Promise<ImportResult> {
  const text = await file.text();
  if (mode === 'overwrite') return restoreBackup(text);
  return importBackup(text);
}
