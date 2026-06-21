// lib/kiwoomAdapter.ts
// 키움증권 REST API 어댑터 — 조회 전용
// 주문 관련 엔드포인트 절대 없음

import type { BrokerAdapter, BalanceResult, ExecutionResult } from './brokerAdapter';

const PROD_URL = 'https://api.kiwoom.com';
const MOCK_URL = 'https://mockapi.kiwoom.com';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [300, 600, 1200];

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, init);
    if ((res.status === 429 || res.status >= 500) && i < retries) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[i] ?? 1200));
      continue;
    }
    return res;
  }
  throw new Error('키움 API 최대 재시도 횟수 초과');
}

export class KiwoomAdapter implements BrokerAdapter {
  readonly broker = 'kiwoom' as const;

  private baseUrl(accountType: 'REAL' | 'VIRTUAL'): string {
    return accountType === 'REAL' ? PROD_URL : MOCK_URL;
  }

  async issueToken(
    appKey: string,
    appSecret: string,
    accountType: 'REAL' | 'VIRTUAL',
  ): Promise<{ accessToken: string; expiresAt: string }> {
    const base = this.baseUrl(accountType);
    const res = await fetchWithRetry(`${base}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: appKey,
        secretkey: appSecret,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`키움 토큰 발급 실패 (${res.status}): ${text}`);
    }

    const json = await res.json() as Record<string, unknown>;

    const accessToken = (json.access_token ?? json.token ?? '') as string;
    if (!accessToken) {
      throw new Error(`키움 토큰 발급 실패: 응답에 access_token 없음 — ${JSON.stringify(json)}`);
    }

    // expires_in이 초 단위 숫자이거나, expire_dt(만료일시 문자열)일 수 있음
    let expiresAt: string;
    if (json.expires_in && Number(json.expires_in) > 0) {
      expiresAt = new Date(Date.now() + Number(json.expires_in) * 1000).toISOString();
    } else if (json.expire_dt) {
      expiresAt = new Date(String(json.expire_dt)).toISOString();
    } else {
      // 기본 24시간
      expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();
    }

    return { accessToken, expiresAt };
  }

  async getBalance(
    token: string,
    accountNo: string,
    extra?: Record<string, string>,
  ): Promise<BalanceResult> {
    const accountType = extra?.accountType as 'REAL' | 'VIRTUAL' || 'VIRTUAL';
    const base = this.baseUrl(accountType);

    // 페이지네이션 처리
    let allHoldings: BalanceResult['holdings'] = [];
    let cash = 0;
    let contYn = 'N';
    let nextKey = '';

    do {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
        cont_yn: contYn,
        next_key: nextKey,
      };

      const res = await fetchWithRetry(`${base}/api/dostk/acntbal`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          acnt_no: accountNo,
          pwd: extra?.pwd || '',
          inqr_dvsn: '1',
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`키움 잔고 조회 실패 (${res.status}): ${text}`);
      }

      const json = await res.json() as {
        acnt_bal?: Array<{
          stk_cd: string;     // 종목코드
          stk_nm: string;     // 종목명
          hldg_qty: string;   // 보유수량
          avg_buy_prc: string; // 평균매입가
          cur_prc: string;    // 현재가
        }>;
        deposits?: string;
        eval_amt?: string;
        cont_yn?: string;
        next_key?: string;
      };

      if (json.deposits) {
        cash = Number(json.deposits);
      }

      if (json.acnt_bal) {
        for (const item of json.acnt_bal) {
          if (Number(item.hldg_qty) > 0) {
            allHoldings.push({
              symbol: item.stk_nm,
              name: item.stk_nm,
              code: item.stk_cd,
              quantity: Number(item.hldg_qty),
              avgCost: Math.round(Number(item.avg_buy_prc)),
              currentPrice: Number(item.cur_prc) || undefined,
            });
          }
        }
      }

      contYn = json.cont_yn === 'Y' ? 'Y' : 'N';
      nextKey = json.next_key || '';
    } while (contYn === 'Y');

    return { cash, holdings: allHoldings };
  }

  async getExecutions(
    token: string,
    accountNo: string,
    startDate: string,
    endDate: string,
    extra?: Record<string, string>,
  ): Promise<ExecutionResult> {
    const accountType = extra?.accountType as 'REAL' | 'VIRTUAL' || 'VIRTUAL';
    const base = this.baseUrl(accountType);

    const startDt = startDate.replace(/-/g, '');
    const endDt = endDate.replace(/-/g, '');

    let allExecutions: ExecutionResult['executions'] = [];
    let contYn = 'N';
    let nextKey = '';

    do {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
        cont_yn: contYn,
        next_key: nextKey,
      };

      const res = await fetchWithRetry(`${base}/api/dostk/ccnl`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          acnt_no: accountNo,
          strt_dt: startDt,
          end_dt: endDt,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`키움 체결 조회 실패 (${res.status}): ${text}`);
      }

      const json = await res.json() as {
        ccnl_list?: Array<{
          stk_cd: string;       // 종목코드
          stk_nm: string;       // 종목명
          buy_sell_tp: string;  // 1: 매도, 2: 매수
          ccnl_qty: string;     // 체결수량
          ccnl_prc: string;     // 체결가
          ccnl_amt: string;     // 체결금액
          fee: string;          // 수수료
          tax: string;          // 세금
          ccnl_dt: string;      // 체결일 (YYYYMMDD)
          ccnl_tm: string;      // 체결시각 (HHMMSS)
          ord_no: string;       // 주문번호
        }>;
        cont_yn?: string;
        next_key?: string;
      };

      if (json.ccnl_list) {
        for (const item of json.ccnl_list) {
          if (Number(item.ccnl_qty) <= 0) continue;
          const isSell = item.buy_sell_tp === '1';
          const dateStr = item.ccnl_dt || endDt;
          const timeStr = item.ccnl_tm || '000000';
          const y = dateStr.slice(0, 4);
          const m = dateStr.slice(4, 6);
          const d = dateStr.slice(6, 8);
          const hh = timeStr.slice(0, 2);
          const mm = timeStr.slice(2, 4);

          allExecutions.push({
            symbol: item.stk_nm,
            code: item.stk_cd,
            side: isSell ? 'sell' : 'buy',
            quantity: Number(item.ccnl_qty),
            price: Math.round(Number(item.ccnl_prc)),
            fee: Number(item.fee) || 0,
            tax: Number(item.tax) || 0,
            executedAt: `${y}-${m}-${d}T${hh}:${mm}:00`,
            orderNo: item.ord_no,
          });
        }
      }

      contYn = json.cont_yn === 'Y' ? 'Y' : 'N';
      nextKey = json.next_key || '';
    } while (contYn === 'Y');

    return { executions: allExecutions };
  }
}
