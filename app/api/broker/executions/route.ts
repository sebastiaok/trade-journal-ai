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

    // 디버그: ka10072 vs kt00007 raw 응답 비교
    let _debug: Record<string, unknown> = {};
    if (cred.broker === 'kiwoom') {
      const acctType = credential.accountType || 'VIRTUAL';
      const bUrl = acctType === 'REAL' ? 'https://api.kiwoom.com' : 'https://mockapi.kiwoom.com';
      const commonHeaders = {
        'Content-Type': 'application/json;charset=UTF-8',
        authorization: `Bearer ${token}`,
        'cont-yn': 'N',
        'next-key': '',
      };

      // 1) ka10072 — 일자별종목별실현손익 (매도 실현손익만?)
      try {
        const r1 = await fetch(`${bUrl}/api/dostk/acnt`, {
          method: 'POST',
          headers: { ...commonHeaders, 'api-id': 'ka10072' },
          body: JSON.stringify({
            acnt_no: accountNo,
            pwd: credential.extra?.pwd || '',
            strt_dt: body.startDate.replace(/-/g, ''),
            end_dt: body.endDate.replace(/-/g, ''),
            sell_tp: '0',
            stex_tp: '0',
          }),
        });
        _debug.ka10072 = (await r1.text()).slice(0, 3000);
      } catch (e) {
        _debug.ka10072_err = e instanceof Error ? e.message : String(e);
      }

      // 2) kt00007 — 계좌별주문체결내역상세 (매수+매도 전체?)
      try {
        const r2 = await fetch(`${bUrl}/api/dostk/acnt`, {
          method: 'POST',
          headers: { ...commonHeaders, 'api-id': 'kt00007' },
          body: JSON.stringify({
            strt_dt: body.startDate.replace(/-/g, ''),
            end_dt: body.endDate.replace(/-/g, ''),
            qry_tp: '0',
          }),
        });
        _debug.kt00007 = (await r2.text()).slice(0, 3000);
      } catch (e) {
        _debug.kt00007_err = e instanceof Error ? e.message : String(e);
      }

      _debug.startDate = body.startDate;
      _debug.endDate = body.endDate;
    }

    const result = await adapter.getExecutions(token, accountNo, body.startDate, body.endDate, extra);

    return NextResponse.json({ ...result, _debug });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '체결 조회 실패' },
      { status: 502 },
    );
  }
}
