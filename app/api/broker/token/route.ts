// app/api/broker/token/route.ts
// 토큰 발급/갱신 — credential 복호화 → 토큰 발급 → 캐시 저장
// 조회 전용 — 주문 기능 없음

import { NextResponse } from 'next/server';
import { getServerUser, getAdminClient } from '../../../../lib/supabaseServer';
import { decrypt, encrypt } from '../../../../lib/crypto';
import { getAdapter } from '../../../../lib/brokerAdapter';

export const runtime = 'nodejs';

interface Body {
  credentialId: string;
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

  // credential 조회
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
    const appKey = decrypt(cred.app_key_enc);
    const appSecret = decrypt(cred.app_secret_enc);
    const adapter = await getAdapter(cred.broker);
    const { accessToken, expiresAt } = await adapter.issueToken(
      appKey, appSecret, cred.account_type,
    );

    // 캐시 upsert
    const tokenEnc = encrypt(accessToken);
    const { data: existing } = await admin
      .from('broker_token_cache')
      .select('id')
      .eq('cred_id', cred.id)
      .maybeSingle();

    if (existing) {
      await admin.from('broker_token_cache').update({
        access_token_enc: tokenEnc,
        expires_at: expiresAt,
      }).eq('id', existing.id);
    } else {
      await admin.from('broker_token_cache').insert({
        owner: userId,
        cred_id: cred.id,
        access_token_enc: tokenEnc,
        expires_at: expiresAt,
      });
    }

    return NextResponse.json({ expiresAt });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '토큰 발급 실패' },
      { status: 502 },
    );
  }
}
