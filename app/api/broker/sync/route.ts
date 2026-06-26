// app/api/broker/sync/route.ts
// 동기화 실행 — 잔고/체결/전체 동기화
// 조회 전용 — 주문 기능 없음

import { NextResponse } from 'next/server';
import { getServerUser, getAdminClient } from '../../../../lib/supabaseServer';
import { getAdapter, syncBalance, syncExecutions } from '../../../../lib/brokerAdapter';
import type { BrokerCredential } from '../../../../data/types';

export const runtime = 'nodejs';

interface Body {
  credentialId: string;
  syncType: 'balance' | 'executions' | 'all';
  startDate?: string;
  endDate?: string;
}

export async function POST(req: Request) {
  const userId = await getServerUser(req);
  if (!userId) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json() as Body;
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: cred, error: credErr } = await admin
    .from('broker_credentials')
    .select('*')
    .eq('id', body.credentialId)
    .eq('owner', userId)
    .single();

  if (credErr || !cred) {
    return NextResponse.json({ error: '자격 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

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

  try {
    const adapter = await getAdapter(cred.broker);
    const result: {
      syncedHoldings?: number;
      updatedCash?: boolean;
      syncedTrades?: number;
      errors: string[];
    } = { errors: [] };

    // 잔고 동기화
    if (body.syncType === 'balance' || body.syncType === 'all') {
      const balResult = await syncBalance(adapter, credential, userId);
      result.syncedHoldings = balResult.syncedHoldings;
      result.updatedCash = balResult.updatedCash;
    }

    // 체결 동기화
    if (body.syncType === 'executions' || body.syncType === 'all') {
      const today = new Date().toISOString().slice(0, 10);
      // 기본 조회 기간 = 최근 1개월 (매매내역 기본 기간과 일치)
      const defaultStart = (() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10);
      })();
      const startDate = body.startDate || defaultStart;
      const endDate = body.endDate || today;

      const execResult = await syncExecutions(adapter, credential, userId, startDate, endDate);
      result.syncedTrades = execResult.syncedTrades;
      result.errors.push(...execResult.errors);
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '동기화 실패' },
      { status: 502 },
    );
  }
}
