// app/api/broker/executions/route.ts
// 체결내역 조회 — credential로 토큰 확보 후 체결 반환
// 조회 전용 — 주문 기능 없음

import { NextResponse } from 'next/server';
import { getServerUser, getAdminClient } from '../../../../lib/supabaseServer';
import { decrypt } from '../../../../lib/crypto';
import { getAdapter, ensureToken } from '../../../../lib/brokerAdapter';
import type { BrokerCredential } from '../../../../data/types';

export const runtime = 'nodejs';

interface Body {
  credentialId: string;
  startDate: string;
  endDate: string;
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

  if (!body.startDate || !body.endDate) {
    return NextResponse.json({ error: '조회 기간이 필요합니다.' }, { status: 400 });
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

  try {
    const adapter = await getAdapter(cred.broker);
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

    const token = await ensureToken(adapter, credential, userId);
    const accountNo = credential.accountNoEnc ? decrypt(credential.accountNoEnc) : '';
    const appKey = decrypt(credential.appKeyEnc);
    const appSecret = decrypt(credential.appSecretEnc);

    const extra = {
      ...credential.extra,
      accountType: credential.accountType,
      appKey,
      appSecret,
    };

    const result = await adapter.getExecutions(token, accountNo, body.startDate, body.endDate, extra);

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '체결 조회 실패' },
      { status: 502 },
    );
  }
}
