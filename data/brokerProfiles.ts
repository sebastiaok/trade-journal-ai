// data/brokerProfiles.ts
// 증권사 앱 캡쳐 이미지 인식용 프로파일 + 추출 프롬프트
//
// 핵심 원칙: 인식 결과는 항상 검증 테이블(HITL)을 거친다.
// 불명확한 값은 임의 추정하지 않고 null로 두고 confidence를 낮춘다.

export interface BrokerProfile {
  id: string;        // 'auto' | 'kiwoom' | ...
  label: string;     // UI 표시명
  hints: string;     // 해당 앱 레이아웃 힌트 (프롬프트에 주입)
}

/**
 * 공통 추출 프롬프트 계약.
 * 모든 프로파일이 이 베이스를 공유하고, broker별 hints만 덧붙인다.
 *
 * 반드시 JSON 배열만 출력하도록 강제한다. (설명/마크다운 금지)
 */
const BASE_CONTRACT = `You are a precise data-extraction engine for Korean stock trading app screenshots.

Extract every trade execution row visible in the image and output a JSON array ONLY.
No preamble, no explanation, no markdown code fences.

Each array item must use exactly these keys:
{
  "symbol": string,        // 종목명 (e.g. "삼성전자")
  "code": string | null,   // 종목코드 6자리 (보이지 않으면 null)
  "side": "buy" | "sell",  // 매수=buy, 매도=sell
  "price": number,         // 체결단가 (콤마/통화기호 제거한 숫자)
  "quantity": number,      // 체결수량
  "fee": number,           // 수수료 (보이지 않으면 0)
  "tax": number,           // 세금 (매수 시 0, 보이지 않으면 0)
  "executedAt": string | null, // 체결일시 ISO8601 (날짜만 보이면 "YYYY-MM-DD")
  "confidence": number     // 0~1, 이 행 인식 확신도
}

Rules:
- Strip commas, "원", "주", currency symbols → output plain numbers only.
- Never guess unclear values. If a field is illegible or absent, use null
  (or 0 for fee/tax) and LOWER the confidence for that row.
- Determine side from keywords (매수/매입/체결매수 → buy, 매도/매각 → sell).
  In Korean apps, red often = buy/상승, blue often = sell/하락; use color as a
  secondary signal only, never as the sole basis.
- If the image is not a trade history, return [].
- Output JSON array ONLY.`;

export const BROKER_PROFILES: BrokerProfile[] = [
  {
    id: 'auto',
    label: '자동 감지',
    hints:
      'The broker is unknown. Infer column meanings from headers and layout. ' +
      'Common Korean brokers: 키움/삼성/미래에셋/한국투자/NH/토스증권.',
  },
  {
    id: 'kiwoom',
    label: '키움증권 (영웅문S#)',
    hints:
      'Kiwoom app rows usually list 종목명, 구분(매수/매도), 체결가, 체결량, ' +
      '수수료, 세금, 체결시간 in a dense table. 구분 column carries side.',
  },
  {
    id: 'samsung',
    label: '삼성증권 (mPOP)',
    hints:
      'Samsung mPOP shows 종목명 with 매수/매도 badge, 체결단가, 수량, ' +
      '거래대금, and 체결일자. Fees may be on a separate summary line.',
  },
  {
    id: 'mirae',
    label: '미래에셋증권 (m.Stock)',
    hints:
      'Mirae m.Stock groups by 종목 then lists 매매구분, 체결가격, 체결수량, ' +
      '수수료, 제세금, 체결시각.',
  },
  {
    id: 'koreainvest',
    label: '한국투자증권',
    hints:
      'Korea Investment lists 종목/구분/체결단가/체결수량/정산금액/체결시간. ' +
      '구분 column shows 매수 or 매도.',
  },
  {
    id: 'toss',
    label: '토스증권',
    hints:
      'Toss Securities uses a card-style list: 종목명, "구매"/"판매" label, ' +
      '단가(원), 수량(주), and date. "구매"=buy, "판매"=sell.',
  },
];

/** 프로파일 id로 조회 (없으면 auto) */
export function getProfile(id: string): BrokerProfile {
  return BROKER_PROFILES.find((p) => p.id === id) ?? BROKER_PROFILES[0];
}

/** visionExtract가 호출할 최종 프롬프트 빌더 */
export function buildExtractionPrompt(profile: BrokerProfile): string {
  return `${BASE_CONTRACT}\n\n[Broker context: ${profile.label}]\n${profile.hints}`;
}
