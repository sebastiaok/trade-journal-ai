// app/api/cron/snapshot/route.ts
// Vercel Cron: 일별 포트폴리오 스냅샷 생성
// 스케줄: 평일 18:00 KST (장 마감 후)

import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/supabaseServer';
import type { SnapshotDetail } from '../../../../data/types';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  // CRON_SECRET 검증
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // 전체 사용자(owner) 목록 조회 (accounts 테이블에서)
  const { data: owners, error: ownerErr } = await admin
    .from('accounts')
    .select('owner')
    .order('owner');

  if (ownerErr || !owners) {
    return NextResponse.json({ error: 'Failed to fetch owners' }, { status: 500 });
  }

  // 중복 제거
  const uniqueOwners = [...new Set(owners.map((o) => o.owner))];

  // price_cache 전체 조회 → priceMap
  const { data: priceRows } = await admin.from('price_cache').select('*');
  const priceMap: Record<string, number> = {};
  if (priceRows) {
    for (const p of priceRows) priceMap[p.ticker_code] = p.price;
  }

  let snapshotsCreated = 0;
  const errors: string[] = [];

  for (const owner of uniqueOwners) {
    try {
      // 해당 사용자의 holdings + accounts 조회
      const [{ data: holdings }, { data: accounts }] = await Promise.all([
        admin.from('holdings').select('*').eq('owner', owner),
        admin.from('accounts').select('*').eq('owner', owner),
      ]);

      if (!holdings || !accounts) continue;

      // 스냅샷 상세 계산
      const details: SnapshotDetail[] = holdings.map((h) => {
        const price = (h.code && priceMap[h.code]) || Number(h.avg_cost);
        return {
          accountId: h.account_id,
          symbol: h.symbol,
          quantity: h.quantity,
          avgCost: Number(h.avg_cost),
          value: h.quantity * price,
        };
      });

      const totalCost = details.reduce((s, d) => s + d.quantity * d.avgCost, 0);
      const totalValue = details.reduce((s, d) => s + d.value, 0);
      const cash = accounts.reduce((s, a) => s + (a.cash_balance ?? 0), 0);

      // portfolio_snapshots에 upsert (owner + snapshot_date unique)
      const { error: upsertErr } = await admin
        .from('portfolio_snapshots')
        .upsert(
          {
            owner,
            snapshot_date: today,
            total_value: totalValue,
            total_cost: totalCost,
            cash,
            details,
          },
          { onConflict: 'owner,snapshot_date' },
        );

      if (upsertErr) {
        errors.push(`${owner}: ${upsertErr.message}`);
      } else {
        snapshotsCreated++;
      }
    } catch (e) {
      errors.push(`${owner}: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  return NextResponse.json({
    message: 'Snapshots created',
    date: today,
    snapshotsCreated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
