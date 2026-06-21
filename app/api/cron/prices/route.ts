// app/api/cron/prices/route.ts
// Vercel Cron: 보유 종목 시세 갱신 → price_cache 테이블 upsert
// 스케줄: 평일 장중 매시 정각 (vercel.json 참조)

import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/supabaseServer';
import { getAdapter, ensureToken } from '../../../../lib/brokerAdapter';
import { decrypt } from '../../../../lib/crypto';
import type { BrokerCredential } from '../../../../data/types';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  // CRON_SECRET 검증 (Vercel Cron이 자동 전달)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdminClient();

  // 모든 broker_credentials 조회
  const { data: creds, error: credErr } = await admin
    .from('broker_credentials')
    .select('*');

  if (credErr || !creds || creds.length === 0) {
    return NextResponse.json({ message: 'No credentials found', updated: 0 });
  }

  let totalUpdated = 0;
  const errors: string[] = [];

  for (const cred of creds) {
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
      const token = await ensureToken(adapter, credential, cred.owner);
      const accountNo = credential.accountNoEnc ? decrypt(credential.accountNoEnc) : '';
      const appKey = decrypt(credential.appKeyEnc);
      const appSecret = decrypt(credential.appSecretEnc);

      const balance = await adapter.getBalance(token, accountNo, {
        ...credential.extra,
        accountType: credential.accountType,
        appKey,
        appSecret,
      });

      // price_cache에 upsert
      const now = new Date().toISOString();
      for (const h of balance.holdings) {
        if (h.currentPrice && h.code) {
          const { error: upsertErr } = await admin
            .from('price_cache')
            .upsert(
              { ticker_code: h.code, price: h.currentPrice, fetched_at: now },
              { onConflict: 'ticker_code' },
            );
          if (!upsertErr) totalUpdated++;
          else errors.push(`${h.code}: ${upsertErr.message}`);
        }
      }
    } catch (e) {
      errors.push(`cred ${cred.id}: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  return NextResponse.json({
    message: 'Price cache updated',
    updated: totalUpdated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
