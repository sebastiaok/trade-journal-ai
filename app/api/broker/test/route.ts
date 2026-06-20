// app/api/broker/test/route.ts
// 증권사 연결 테스트 — 토큰 발급 + 잔고 1회 조회
// 조회 전용 — 주문 기능 없음

import { NextResponse } from 'next/server';
import { getServerUser } from '../../../../lib/supabaseServer';
import { getAdapter } from '../../../../lib/brokerAdapter';

export const runtime = 'nodejs';

interface Body {
  broker: 'kis' | 'kiwoom';
  appKey: string;
  appSecret: string;
  accountNo: string;
  accountType: 'REAL' | 'VIRTUAL';
  extra?: Record<string, string>;
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

  const { broker, appKey, appSecret, accountNo, accountType, extra } = body;
  if (!broker || !appKey || !appSecret || !accountNo || !accountType) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
  }

  try {
    const adapter = await getAdapter(broker);

    // 1. 토큰 발급
    const { accessToken } = await adapter.issueToken(appKey, appSecret, accountType);

    // 2. 잔고 1회 조회
    const balance = await adapter.getBalance(accessToken, accountNo, {
      ...extra,
      accountType,
      appKey,
      appSecret,
    });

    return NextResponse.json({
      success: true,
      balance: {
        cash: balance.cash,
        holdingCount: balance.holdings.length,
        holdings: balance.holdings.map((h) => ({
          symbol: h.symbol,
          code: h.code,
          quantity: h.quantity,
          avgCost: h.avgCost,
        })),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '연결 테스트 실패' },
      { status: 502 },
    );
  }
}
