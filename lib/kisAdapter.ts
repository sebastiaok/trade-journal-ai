// lib/kisAdapter.ts
// 한국투자증권(KIS) REST API 어댑터 — 조회 전용
// 주문 관련 TR_ID/함수 절대 없음

import type { BrokerAdapter, BalanceResult, ExecutionResult } from './brokerAdapter';

const PROD_URL = 'https://openapi.koreainvestment.com:9443';
const VTS_URL = 'https://openapivts.koreainvestment.com:29443';

// 재시도 설정
const MAX_RETRIES = 3;
const RETRY_DELAYS = [300, 600, 1200];

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, init);
    // Rate limit (429) 또는 서버 오류 시 재시도
    if ((res.status === 429 || res.status >= 500) && i < retries) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[i] ?? 1200));
      continue;
    }
    return res;
  }
  throw new Error('KIS API 최대 재시도 횟수 초과');
}

export class KISAdapter implements BrokerAdapter {
  readonly broker = 'kis' as const;

  private baseUrl(accountType: 'REAL' | 'VIRTUAL'): string {
    return accountType === 'REAL' ? PROD_URL : VTS_URL;
  }

  async issueToken(
    appKey: string,
    appSecret: string,
    accountType: 'REAL' | 'VIRTUAL',
  ): Promise<{ accessToken: string; expiresAt: string }> {
    const base = this.baseUrl(accountType);
    const res = await fetchWithRetry(`${base}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: appKey,
        appsecret: appSecret,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KIS 토큰 발급 실패 (${res.status}): ${text}`);
    }

    const json = await res.json() as {
      access_token: string;
      token_type: string;
      expires_in: number;
      access_token_token_expired: string;
    };

    return {
      accessToken: json.access_token,
      expiresAt: json.access_token_token_expired || new Date(Date.now() + json.expires_in * 1000).toISOString(),
    };
  }

  async getBalance(
    token: string,
    accountNo: string,
    extra?: Record<string, string>,
  ): Promise<BalanceResult> {
    const accountType = extra?.accountType as 'REAL' | 'VIRTUAL' || 'VIRTUAL';
    const base = this.baseUrl(accountType);
    const cano = accountNo.slice(0, 8);
    const acntPrdtCd = accountNo.slice(8, 10) || '01';
    const trId = accountType === 'REAL' ? 'TTTC8434R' : 'VTTC8434R';

    const params = new URLSearchParams({
      CANO: cano,
      ACNT_PRDT_CD: acntPrdtCd,
      AFHR_FLPR_YN: 'N',
      OFL_YN: '',
      INQR_DVSN: '02',
      UNPR_DVSN: '01',
      FUND_STTL_ICLD_YN: 'N',
      FNCG_AMT_AUTO_RDPT_YN: 'N',
      PRCS_DVSN: '01',
      CTX_AREA_FK100: '',
      CTX_AREA_NK100: '',
    });

    const res = await fetchWithRetry(`${base}/uapi/domestic-stock/v1/trading/inquire-balance?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: extra?.appKey || '',
        appsecret: extra?.appSecret || '',
        tr_id: trId,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KIS 잔고 조회 실패 (${res.status}): ${text}`);
    }

    const json = await res.json() as {
      output1: Array<{
        pdno: string;       // 종목코드
        prdt_name: string;  // 종목명
        hldg_qty: string;   // 보유수량
        pchs_avg_pric: string; // 매입평균가
        prpr: string;       // 현재가
      }>;
      output2: Array<{
        dnca_tot_amt: string;  // 예수금
        prvs_rcdl_excc_amt: string; // D+2 예수금
      }>;
    };

    const holdings = (json.output1 || [])
      .filter((item) => Number(item.hldg_qty) > 0)
      .map((item) => ({
        symbol: item.prdt_name,
        name: item.prdt_name,
        code: item.pdno,
        quantity: Number(item.hldg_qty),
        avgCost: Math.round(Number(item.pchs_avg_pric)),
        currentPrice: Number(item.prpr) || undefined,
      }));

    const cash = Number(json.output2?.[0]?.dnca_tot_amt ?? 0);

    return { cash, holdings };
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
    const cano = accountNo.slice(0, 8);
    const acntPrdtCd = accountNo.slice(8, 10) || '01';
    const trId = accountType === 'REAL' ? 'TTTC8001R' : 'VTTC8001R';

    // YYYYMMDD 형식 변환
    const startDt = startDate.replace(/-/g, '');
    const endDt = endDate.replace(/-/g, '');

    const params = new URLSearchParams({
      CANO: cano,
      ACNT_PRDT_CD: acntPrdtCd,
      INQR_STRT_DT: startDt,
      INQR_END_DT: endDt,
      SLL_BUY_DVSN_CD: '00', // 전체 (매수+매도)
      INQR_DVSN: '00',
      PDNO: '',
      CCLD_DVSN: '01',       // 체결만
      ORD_GNO_BRNO: '',
      ODNO: '',
      INQR_DVSN_3: '00',
      INQR_DVSN_1: '',
      CTX_AREA_FK100: '',
      CTX_AREA_NK100: '',
    });

    const res = await fetchWithRetry(`${base}/uapi/domestic-stock/v1/trading/inquire-daily-ccld?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: extra?.appKey || '',
        appsecret: extra?.appSecret || '',
        tr_id: trId,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KIS 체결 조회 실패 (${res.status}): ${text}`);
    }

    const json = await res.json() as {
      output1: Array<{
        pdno: string;          // 종목코드
        prdt_name: string;     // 종목명
        sll_buy_dvsn_cd: string; // 01: 매도, 02: 매수
        ord_qty: string;       // 주문수량
        tot_ccld_qty: string;  // 총체결수량
        avg_prvs: string;      // 체결평균가
        ccld_amt: string;      // 체결금액
        odno: string;          // 주문번호
        ord_dt: string;        // 주문일
        ord_tmd: string;       // 주문시각
      }>;
    };

    const executions = (json.output1 || [])
      .filter((item) => Number(item.tot_ccld_qty) > 0)
      .map((item) => {
        const qty = Number(item.tot_ccld_qty);
        const price = Math.round(Number(item.avg_prvs));
        const amount = qty * price;
        // 매도 시 세금(0.18%), 매수/매도 공통 수수료는 증권사마다 다름 (기본 0.015% 추정)
        const isSell = item.sll_buy_dvsn_cd === '01';
        const fee = Math.round(amount * 0.00015);
        const tax = isSell ? Math.round(amount * 0.0018) : 0;
        const dateStr = item.ord_dt || endDt;
        const timeStr = item.ord_tmd || '000000';
        const y = dateStr.slice(0, 4);
        const m = dateStr.slice(4, 6);
        const d = dateStr.slice(6, 8);
        const hh = timeStr.slice(0, 2);
        const mm = timeStr.slice(2, 4);

        return {
          symbol: item.prdt_name,
          code: item.pdno,
          side: isSell ? 'sell' as const : 'buy' as const,
          quantity: qty,
          price,
          fee,
          tax,
          executedAt: `${y}-${m}-${d}T${hh}:${mm}:00`,
          orderNo: item.odno,
        };
      });

    return { executions };
  }
}
