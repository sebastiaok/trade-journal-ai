// app/api/broker/credentials/route.ts
// 증권사 자격 정보 저장 — 서버에서 암호화 후 DB 저장
// 조회 전용 — 주문 기능 없음

import { NextResponse } from 'next/server';
import { getServerUser, getAdminClient } from '../../../../lib/supabaseServer';
import { encrypt } from '../../../../lib/crypto';

export const runtime = 'nodejs';

interface CreateBody {
  accountId: string;
  broker: 'kis' | 'kiwoom';
  appKey: string;
  appSecret: string;
  accountNo: string;
  extra?: Record<string, string>;
  accountType: 'REAL' | 'VIRTUAL';
}

/** POST — 자격 정보 암호화 저장 */
export async function POST(req: Request) {
  const userId = await getServerUser(req);
  if (!userId) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = await req.json() as CreateBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { accountId, broker, appKey, appSecret, accountNo, extra, accountType } = body;
  if (!accountId || !broker || !appKey || !appSecret || !accountNo || !accountType) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
  }

  try {
    const admin = getAdminClient();

    const { data, error } = await admin
      .from('broker_credentials')
      .insert({
        owner: userId,
        account_id: accountId,
        broker,
        app_key_enc: encrypt(appKey),
        app_secret_enc: encrypt(appSecret),
        account_no_enc: encrypt(accountNo),
        extra: extra ?? {},
        account_type: accountType,
      })
      .select('id, account_id, broker, account_type, created_at')
      .single();

    if (error) throw error;

    return NextResponse.json({
      id: data.id,
      accountId: data.account_id,
      broker: data.broker,
      accountType: data.account_type,
      createdAt: data.created_at,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '저장 실패' },
      { status: 500 },
    );
  }
}

/** PATCH — 계좌 유형 전환 (VIRTUAL ↔ REAL) */
export async function PATCH(req: Request) {
  const userId = await getServerUser(req);
  if (!userId) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { credentialId: string; accountType: 'REAL' | 'VIRTUAL' };
  try {
    body = await req.json() as { credentialId: string; accountType: 'REAL' | 'VIRTUAL' };
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  if (!body.credentialId || !body.accountType) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
  }

  try {
    const admin = getAdminClient();

    // 토큰 캐시 삭제 (모드 전환 시 기존 토큰 무효)
    await admin
      .from('broker_token_cache')
      .delete()
      .eq('cred_id', body.credentialId);

    const { error } = await admin
      .from('broker_credentials')
      .update({ account_type: body.accountType })
      .eq('id', body.credentialId)
      .eq('owner', userId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '전환 실패' },
      { status: 500 },
    );
  }
}

/** DELETE — 자격 정보 삭제 */
export async function DELETE(req: Request) {
  const userId = await getServerUser(req);
  if (!userId) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { credentialId: string };
  try {
    body = await req.json() as { credentialId: string };
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const admin = getAdminClient();
    const { error } = await admin
      .from('broker_credentials')
      .delete()
      .eq('id', body.credentialId)
      .eq('owner', userId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '삭제 실패' },
      { status: 500 },
    );
  }
}
