// lib/visionExtract.ts
// 클라이언트 비전 추출 — 이미지를 서버 라우트(/api/extract)로 보내고
// 돌아온 모델 원문을 파싱해 Trade[] 초안으로 변환한다.
// 결과는 항상 검증 테이블(TradeReviewTable)을 거친다. (HITL)

import { buildExtractionPrompt, type BrokerProfile } from '../data/brokerProfiles';
import type { Trade, Side } from '../data/types';

/** File → base64 (data: 접두사 제거) */
function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve({ base64: result.slice(comma + 1), mediaType: file.type || 'image/png' });
    };
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

/** 모델 원문에서 JSON 배열만 뽑아 파싱 */
function parseTrades(raw: string): RawItem[] {
  let text = raw.trim();
  // ```json ... ``` 펜스 제거
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // 가장 바깥 대괄호 구간만 취함
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('JSON 배열이 아닙니다.');
  return parsed as RawItem[];
}

interface RawItem {
  symbol?: string;
  code?: string | null;
  side?: string;
  price?: number | null;
  quantity?: number | null;
  fee?: number | null;
  tax?: number | null;
  executedAt?: string | null;
  confidence?: number;
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);
const normalizeSide = (s: string | undefined): Side =>
  s === 'sell' || s === 'buy' || s === 'deposit' || s === 'withdrawal' ? s : 'buy';

function toDraftTrade(item: RawItem, accountId: string, broker?: string): Omit<Trade, 'id'> {
  const price = num(item.price);
  const quantity = num(item.quantity);
  return {
    accountId,
    symbol: item.symbol?.trim() || '',
    code: item.code ?? undefined,
    side: normalizeSide(item.side),
    price,
    quantity,
    amount: price * quantity,
    fee: num(item.fee),
    tax: num(item.tax),
    executedAt: item.executedAt
      ? new Date(item.executedAt).toISOString()
      : new Date().toISOString(),
    broker,
    source: 'vision',
    confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
    taxDeductible: true,
    note: { tags: [] },
  };
}

/**
 * 이미지 1장 → Trade 초안 배열.
 * 파싱 실패 시 1회 재시도하지 않고 즉시 throw (호출 측이 수동 입력 유도).
 */
export async function visionExtract(
  file: File,
  profile: BrokerProfile,
  accountId: string,
): Promise<Omit<Trade, 'id'>[]> {
  const { base64, mediaType } = await fileToBase64(file);
  const prompt = buildExtractionPrompt(profile);

  const resp = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64, mediaType, prompt }),
  });

  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `인식 서버 오류 (${resp.status})`);
  }

  const { raw } = (await resp.json()) as { raw: string };
  const items = parseTrades(raw); // 실패 시 throw
  return items.map((it) => toDraftTrade(it, accountId, profile.label));
}
