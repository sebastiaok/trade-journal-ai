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

    // 키움 API는 return_code로 에러를 반환 (HTTP 200이지만 실패)
    if (json.return_code && Number(json.return_code) !== 0) {
      throw new Error(`키움 토큰 발급 실패: ${json.return_msg ?? JSON.stringify(json)}`);
    }

    const accessToken = (json.access_token ?? json.token ?? '') as string;
    if (!accessToken) {
      throw new Error(`키움 토큰 발급 실패: 응답에 access_token 없음 — ${JSON.stringify(json)}`);
    }

    // 만료 시간 파싱: expires_dt "20260622220558" 형식 또는 expires_in(초)
    let expiresAt: string;
    if (json.expires_in && Number(json.expires_in) > 0) {
      expiresAt = new Date(Date.now() + Number(json.expires_in) * 1000).toISOString();
    } else if (json.expires_dt) {
      // "20260622220558" → ISO
      const dt = String(json.expires_dt);
      const parsed = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}T${dt.slice(8, 10)}:${dt.slice(10, 12)}:${dt.slice(12, 14)}`;
      expiresAt = new Date(parsed).toISOString();
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

    let allHoldings: BalanceResult['holdings'] = [];
    let cash = 0;
    let contYn = 'N';
    let nextKey = '';

    do {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json;charset=UTF-8',
        authorization: `Bearer ${token}`,
        'api-id': 'kt00004',
        'cont-yn': contYn,
        'next-key': nextKey,
      };

      // kt00004 (계좌평가현황요청): 토큰으로 계좌 식별, acnt_no/pwd 불필요
      const res = await fetchWithRetry(`${base}/api/dostk/acnt`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          qry_tp: '0',
          dmst_stex_tp: 'KRX',
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`키움 잔고 조회 실패 (${res.status}): ${text}`);
      }

      const json = await res.json() as Record<string, unknown>;

      // 키움 API 비즈니스 에러 체크
      if (json.return_code && Number(json.return_code) !== 0) {
        throw new Error(`키움 잔고 조회 실패: ${json.return_msg ?? JSON.stringify(json)}`);
      }

      // 예수금: entr (kt00004 응답 필드)
      const depositVal = json.entr ?? json.d2_entra ?? json.deposits ?? json.dnca_tot_amt ?? 0;
      if (depositVal) {
        cash = Number(depositVal);
      }

      // 보유종목: stk_acnt_evlt_prst (kt00004 응답 키)
      const holdingsArr = (json.stk_acnt_evlt_prst ?? json.stk_cntr_remn ?? json.cntr ?? []) as Array<Record<string, string>>;
      if (Array.isArray(holdingsArr)) {
        for (const item of holdingsArr) {
          const qty = Number(item.rmnd_qty ?? item.cur_qty ?? item.hldg_qty ?? item.qty ?? 0);
          if (qty > 0) {
            allHoldings.push({
              symbol: item.stk_nm ?? item.prdt_name ?? '',
              name: item.stk_nm ?? item.prdt_name ?? '',
              code: item.stk_cd ?? item.pdno ?? '',
              quantity: qty,
              avgCost: Math.round(Number(item.avg_prc ?? item.buy_uv ?? item.pur_pric ?? 0)),
              currentPrice: Number(item.cur_prc ?? item.prpr ?? 0) || undefined,
            });
          }
        }
      }

      contYn = (json['cont-yn'] ?? json.cont_yn ?? json.tr_cont ?? '') === 'Y' ? 'Y' : 'N';
      nextKey = (json['next-key'] ?? json.next_key ?? json.ctx_area_nk ?? '') as string;
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
        'Content-Type': 'application/json;charset=UTF-8',
        authorization: `Bearer ${token}`,
        'api-id': 'ka10072',
        'cont-yn': contYn,
        'next-key': nextKey,
      };

      // ka10072 (일자별종목별실현손익요청): 기간 내 매매내역 조회
      const res = await fetchWithRetry(`${base}/api/dostk/acnt`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          acnt_no: accountNo,
          pwd: extra?.pwd || '',
          strt_dt: startDt,
          end_dt: endDt,
          sell_tp: '0',
          stex_tp: '0',
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`키움 체결 조회 실패 (${res.status}): ${text}`);
      }

      const json = await res.json() as Record<string, unknown>;

      // 키움 API 비즈니스 에러 체크
      if (json.return_code && Number(json.return_code) !== 0) {
        throw new Error(`키움 체결 조회 실패: ${json.return_msg ?? JSON.stringify(json)}`);
      }

      const execArr = (json.cntr ?? json.dt_smry ?? json.output1 ?? json.output ?? json.data ?? []) as Array<Record<string, string>>;
      if (Array.isArray(execArr)) {
        for (const item of execArr) {
          const qty = Number(item.ccnl_qty ?? item.tot_ccld_qty ?? item.qty ?? item.tdy_buyq ?? item.tdy_sellq ?? 0);
          if (qty <= 0) continue;
          const sideRaw = item.buy_sell_tp ?? item.sll_buy_dvsn_cd ?? item.sell_tp ?? item.side ?? '';
          const isSell = sideRaw === '1' || sideRaw === '01' || sideRaw === 'sell';
          const dateStr = item.dt ?? item.ccnl_dt ?? item.ord_dt ?? item.stck_bsop_date ?? endDt;
          const timeStr = item.ccnl_tm ?? item.ord_tmd ?? item.time ?? '000000';
          const y = dateStr.slice(0, 4);
          const m = dateStr.slice(4, 6);
          const d = dateStr.slice(6, 8);
          const hh = timeStr.slice(0, 2);
          const mm = timeStr.slice(2, 4);

          allExecutions.push({
            symbol: item.stk_nm ?? item.prdt_name ?? item.name ?? '',
            code: item.stk_cd ?? item.pdno ?? item.code ?? '',
            side: isSell ? 'sell' : 'buy',
            quantity: qty,
            price: Math.round(Number(item.ccnl_prc ?? item.avg_prvs ?? item.pur_pric ?? item.price ?? 0)),
            fee: Number(item.fee ?? item.tdy_trde_cmsn ?? item.tot_fee ?? 0) || 0,
            tax: Number(item.tax ?? item.tdy_trde_tax ?? item.tot_tax ?? 0) || 0,
            executedAt: `${y}-${m}-${d}T${hh}:${mm}:00`,
            orderNo: item.ord_no ?? item.odno ?? item.order_no ?? '',
          });
        }
      }

      contYn = (json['cont-yn'] ?? json.cont_yn ?? json.tr_cont ?? '') === 'Y' ? 'Y' : 'N';
      nextKey = (json['next-key'] ?? json.next_key ?? json.ctx_area_nk ?? '') as string;
    } while (contYn === 'Y');

    return { executions: allExecutions };
  }
}
