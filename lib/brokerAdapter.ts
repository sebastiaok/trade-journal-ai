// lib/brokerAdapter.ts
// 증권사 어댑터 인터페이스 + 공통 동기화 로직
// 조회 전용 — 주문 관련 기능 절대 없음

import { supabase } from './supabase';
import { decrypt } from './crypto';
import type { BrokerCredential } from '../data/types';

/* ───────── 공통 타입 ───────── */

export interface BalanceResult {
  cash: number;
  holdings: {
    symbol: string;
    name: string;
    code: string;
    quantity: number;
    avgCost: number;
    currentPrice?: number;
  }[];
}

export interface ExecutionResult {
  executions: {
    symbol: string;
    code: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    fee: number;
    tax: number;
    executedAt: string;
    orderNo: string;
  }[];
}

/* ───────── 어댑터 인터페이스 ───────── */

export interface BrokerAdapter {
  readonly broker: 'kis' | 'kiwoom';

  /** 접근 토큰 발급 */
  issueToken(
    appKey: string,
    appSecret: string,
    accountType: 'REAL' | 'VIRTUAL',
  ): Promise<{ accessToken: string; expiresAt: string }>;

  /** 잔고 조회 */
  getBalance(
    token: string,
    accountNo: string,
    extra?: Record<string, string>,
  ): Promise<BalanceResult>;

  /** 체결내역 조회 */
  getExecutions(
    token: string,
    accountNo: string,
    startDate: string,
    endDate: string,
    extra?: Record<string, string>,
  ): Promise<ExecutionResult>;
}

/* ───────── 어댑터 팩토리 ───────── */

export async function getAdapter(broker: 'kis' | 'kiwoom'): Promise<BrokerAdapter> {
  if (broker === 'kis') {
    const { KISAdapter } = await import('./kisAdapter');
    return new KISAdapter();
  }
  const { KiwoomAdapter } = await import('./kiwoomAdapter');
  return new KiwoomAdapter();
}

/* ───────── 공통: 토큰 확보 (캐시 → 재발급) ───────── */

export async function ensureToken(
  adapter: BrokerAdapter,
  credential: BrokerCredential,
  userId: string,
): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 캐시 확인
  const { data: cached } = await admin
    .from('broker_token_cache')
    .select('*')
    .eq('cred_id', credential.id)
    .maybeSingle();

  if (cached && new Date(cached.expires_at) > new Date(Date.now() + 60_000)) {
    return decrypt(cached.access_token_enc);
  }

  // 재발급
  const appKey = decrypt(credential.appKeyEnc);
  const appSecret = decrypt(credential.appSecretEnc);
  const { accessToken, expiresAt } = await adapter.issueToken(
    appKey, appSecret, credential.accountType,
  );

  // 캐시 upsert
  const { encrypt: enc } = await import('./crypto');
  const tokenEnc = enc(accessToken);

  if (cached) {
    await admin.from('broker_token_cache').update({
      access_token_enc: tokenEnc,
      expires_at: expiresAt,
    }).eq('id', cached.id);
  } else {
    await admin.from('broker_token_cache').insert({
      owner: userId,
      cred_id: credential.id,
      access_token_enc: tokenEnc,
      expires_at: expiresAt,
    });
  }

  return accessToken;
}

/* ───────── 공통: 잔고 동기화 ───────── */

export async function syncBalance(
  adapter: BrokerAdapter,
  credential: BrokerCredential,
  userId: string,
): Promise<{ syncedHoldings: number; updatedCash: boolean }> {
  const token = await ensureToken(adapter, credential, userId);
  const accountNo = credential.accountNoEnc ? decrypt(credential.accountNoEnc) : '';
  const balance = await adapter.getBalance(token, accountNo, credential.extra);

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 예수금 갱신
  await admin.from('accounts').update({ cash_balance: balance.cash })
    .eq('id', credential.accountId);

  // holdings upsert
  let syncedHoldings = 0;
  for (const h of balance.holdings) {
    const { data: existing } = await admin
      .from('holdings')
      .select('id, quantity, avg_cost')
      .eq('account_id', credential.accountId)
      .eq('symbol', h.symbol)
      .maybeSingle();

    if (existing) {
      await admin.from('holdings').update({
        quantity: h.quantity,
        avg_cost: h.avgCost,
        code: h.code || null,
      }).eq('id', existing.id);
    } else {
      // 신규 종목 — opening lot 생성
      await admin.from('holdings').insert({
        owner: userId,
        account_id: credential.accountId,
        symbol: h.symbol,
        code: h.code || null,
        quantity: h.quantity,
        avg_cost: h.avgCost,
      });
      // opening trade 생성 (FIFO 기저 매수)
      await admin.from('trades').insert({
        owner: userId,
        account_id: credential.accountId,
        symbol: h.symbol,
        code: h.code || null,
        side: 'buy',
        price: h.avgCost,
        quantity: h.quantity,
        amount: h.avgCost * h.quantity,
        fee: 0,
        tax: 0,
        executed_at: new Date().toISOString(),
        source: 'opening',
        broker: credential.broker,
        tax_deductible: true,
      });
    }
    syncedHoldings++;
  }

  // 증권사에 없는 종목 제거 (수량 0 처리)
  const apiSymbols = new Set(balance.holdings.map((h) => h.symbol));
  const { data: dbHoldings } = await admin
    .from('holdings')
    .select('id, symbol')
    .eq('account_id', credential.accountId);

  if (dbHoldings) {
    for (const dbH of dbHoldings) {
      if (!apiSymbols.has(dbH.symbol)) {
        await admin.from('holdings').delete().eq('id', dbH.id);
      }
    }
  }

  return { syncedHoldings, updatedCash: true };
}

/* ───────── 공통: 체결 동기화 ───────── */

export async function syncExecutions(
  adapter: BrokerAdapter,
  credential: BrokerCredential,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<{ syncedTrades: number; errors: string[] }> {
  const token = await ensureToken(adapter, credential, userId);
  const accountNo = credential.accountNoEnc ? decrypt(credential.accountNoEnc) : '';
  const result = await adapter.getExecutions(token, accountNo, startDate, endDate, credential.extra);

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let syncedTrades = 0;
  const errors: string[] = [];
  const source = credential.broker;

  for (const exec of result.executions) {
    try {
      // orderNo 기준 중복 확인 (broker 필드에 orderNo를 저장)
      const brokerTag = `${source}:${exec.orderNo}`;
      const { data: dup } = await admin
        .from('trades')
        .select('id')
        .eq('account_id', credential.accountId)
        .eq('broker', brokerTag)
        .maybeSingle();

      if (dup) continue; // 이미 동기화된 체결

      const tradePayload = {
        owner: userId,
        account_id: credential.accountId,
        symbol: exec.symbol,
        code: exec.code || null,
        side: exec.side,
        price: exec.price,
        quantity: exec.quantity,
        amount: exec.price * exec.quantity,
        fee: exec.fee,
        tax: exec.tax,
        executed_at: exec.executedAt,
        broker: brokerTag,
        source,
        tax_deductible: true,
      };

      // INSERT trade
      const { data: inserted, error: insertErr } = await admin
        .from('trades')
        .insert(tradePayload)
        .select()
        .single();
      if (insertErr) throw insertErr;

      if (exec.side === 'buy') {
        // holdings 가중평균 갱신
        const { data: existing } = await admin
          .from('holdings')
          .select('id, quantity, avg_cost')
          .eq('account_id', credential.accountId)
          .eq('symbol', exec.symbol)
          .maybeSingle();

        if (existing) {
          const oldQty = existing.quantity;
          const oldCost = Number(existing.avg_cost);
          const newQty = oldQty + exec.quantity;
          const newAvg = newQty > 0
            ? (oldCost * oldQty + exec.price * exec.quantity) / newQty
            : 0;
          await admin.from('holdings').update({
            quantity: newQty,
            avg_cost: Math.round(newAvg * 100) / 100,
            code: exec.code || existing.id ? undefined : null,
          }).eq('id', existing.id);
        } else {
          await admin.from('holdings').insert({
            owner: userId,
            account_id: credential.accountId,
            symbol: exec.symbol,
            code: exec.code || null,
            quantity: exec.quantity,
            avg_cost: exec.price,
          });
        }
      } else {
        // 매도: calc_fifo_on_sell 호출
        const { error: fifoErr } = await admin.rpc('calc_fifo_on_sell', {
          p_sell_trade_id: inserted.id,
        });
        if (fifoErr) {
          errors.push(`FIFO 오류 (${exec.symbol} ${exec.orderNo}): ${fifoErr.message}`);
        }

        // holdings 차감
        const { data: hData } = await admin
          .from('holdings')
          .select('id, quantity')
          .eq('account_id', credential.accountId)
          .eq('symbol', exec.symbol)
          .maybeSingle();
        if (hData) {
          const newQty = hData.quantity - exec.quantity;
          if (newQty <= 0) {
            await admin.from('holdings').delete().eq('id', hData.id);
          } else {
            await admin.from('holdings').update({ quantity: newQty }).eq('id', hData.id);
          }
        }

        // realized_pnl 합산
        const { data: pnlRows } = await admin
          .from('realized_pnl')
          .select('pnl_amount')
          .eq('sell_trade_id', inserted.id);
        if (pnlRows && pnlRows.length > 0) {
          const totalPnl = pnlRows.reduce((s, r) => s + (r.pnl_amount ?? 0), 0);
          await admin.from('trades').update({ realized_pnl: totalPnl }).eq('id', inserted.id);
        }
      }

      syncedTrades++;
    } catch (e) {
      errors.push(`${exec.symbol} ${exec.orderNo}: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    }
  }

  return { syncedTrades, errors };
}
