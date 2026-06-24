#!/usr/bin/env npx tsx
// scripts/sync-local.ts
// 로컬 PC에서 실행하는 증권사 데이터 동기화 스크립트
// 키움 OpenAPI는 등록된 IP에서만 호출 가능하므로 Vercel cron 대신 로컬 크론 사용
//
// 사용법:
//   npx tsx scripts/sync-local.ts                      # 잔고 + 당일 체결
//   npx tsx scripts/sync-local.ts --balance-only        # 잔고만
//   npx tsx scripts/sync-local.ts --start 2026-01-01 --end 2026-01-31  # 기간 지정

import dotenv from 'dotenv';
import path from 'path';

// .env.local 로드 (프로젝트 루트 기준)
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { getAdapter, syncBalance, syncExecutions } from '../lib/brokerAdapter';
import type { BrokerCredential } from '../data/types';

/* ───────── CLI 인자 파싱 ───────── */

function parseArgs() {
  const args = process.argv.slice(2);
  let balanceOnly = false;
  let startDate: string | null = null;
  let endDate: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--balance-only') {
      balanceOnly = true;
    } else if (args[i] === '--start' && args[i + 1]) {
      startDate = args[++i];
    } else if (args[i] === '--end' && args[i + 1]) {
      endDate = args[++i];
    }
  }

  // 기본값: 오늘
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return {
    balanceOnly,
    startDate: startDate?.replace(/-/g, '') ?? today,
    endDate: endDate?.replace(/-/g, '') ?? today,
  };
}

/* ───────── 메인 ───────── */

async function main() {
  const { balanceOnly, startDate, endDate } = parseArgs();

  // 환경변수 검증
  const requiredEnvs = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BROKER_ENCRYPTION_KEY'];
  for (const key of requiredEnvs) {
    if (!process.env[key]) {
      console.error(`[ERROR] 환경변수 누락: ${key}`);
      process.exit(1);
    }
  }

  console.log(`[sync-local] 시작 — ${new Date().toISOString()}`);
  console.log(`  모드: ${balanceOnly ? '잔고만' : '잔고 + 체결'}`);
  if (!balanceOnly) {
    console.log(`  기간: ${startDate} ~ ${endDate}`);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 모든 broker_credentials 조회
  const { data: creds, error: credErr } = await admin
    .from('broker_credentials')
    .select('*');

  if (credErr) {
    console.error('[ERROR] broker_credentials 조회 실패:', credErr.message);
    process.exit(1);
  }

  if (!creds || creds.length === 0) {
    console.log('[INFO] 등록된 증권사 자격정보 없음. 종료.');
    return;
  }

  console.log(`  자격정보 ${creds.length}건 발견\n`);

  let totalHoldings = 0;
  let totalTrades = 0;
  const allErrors: string[] = [];

  for (const cred of creds) {
    const label = `[${cred.broker.toUpperCase()}] ${cred.id.slice(0, 8)}`;
    console.log(`${label} 처리 중...`);

    try {
      const credential: BrokerCredential = {
        id: cred.id,
        accountId: cred.account_id,
        broker: cred.broker,
        appKeyEnc: cred.app_key_enc,
        appSecretEnc: cred.app_secret_enc,
        accountNoEnc: cred.account_no_enc || undefined,
        extra: cred.extra || undefined,
        accountType: cred.account_type,
        createdAt: cred.created_at,
      };

      const adapter = await getAdapter(credential.broker);

      // 잔고 동기화
      const balResult = await syncBalance(adapter, credential, cred.owner);
      console.log(`  잔고: ${balResult.syncedHoldings}종목 동기화, 예수금 ${balResult.updatedCash ? '갱신' : '실패'}`);
      totalHoldings += balResult.syncedHoldings;

      // 체결 동기화
      if (!balanceOnly) {
        const execResult = await syncExecutions(adapter, credential, cred.owner, startDate, endDate);
        console.log(`  체결: ${execResult.syncedTrades}건 동기화`);
        totalTrades += execResult.syncedTrades;

        if (execResult.errors.length > 0) {
          console.log(`  경고: ${execResult.errors.length}건 오류`);
          for (const err of execResult.errors) {
            console.log(`    - ${err}`);
          }
          allErrors.push(...execResult.errors.map((e) => `${label} ${e}`));
        }
      }
    } catch (e) {
      const msg = `${label} 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`;
      console.error(`  ${msg}`);
      allErrors.push(msg);
    }

    console.log('');
  }

  // 결과 요약
  console.log('─'.repeat(50));
  console.log(`[결과] 종목 ${totalHoldings}건, 체결 ${totalTrades}건 동기화`);
  if (allErrors.length > 0) {
    console.log(`[오류] ${allErrors.length}건:`);
    for (const err of allErrors) {
      console.log(`  - ${err}`);
    }
  }
  console.log(`[sync-local] 완료 — ${new Date().toISOString()}`);
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
