import type { Side, Trade } from '../data/types';

type Draft = Omit<Trade, 'id'>;

const SIDE_WORDS: Record<string, Side> = {
  // 기본
  매수: 'buy', 매도: 'sell',
  buy: 'buy', BUY: 'buy', sell: 'sell', SELL: 'sell',
  Buy: 'buy', Sell: 'sell',
  // 증권사별 변형
  보통매수: 'buy', 보통매도: 'sell',       // 키움
  현금매수: 'buy', 현금매도: 'sell',       // NH, 미래에셋
  신용매수: 'buy', 신용매도: 'sell',       // 신용거래
  장내매수: 'buy', 장내매도: 'sell',       // 장내거래
  시간외매수: 'buy', 시간외매도: 'sell',   // 시간외
  // 입출금
  입금: 'deposit', 납입: 'deposit', deposit: 'deposit',
  출금: 'withdrawal', 인출: 'withdrawal', withdrawal: 'withdrawal',
};

export const HEADER_ALIASES: Record<string, string[]> = {
  symbol: [
    '종목', '종목명', '상품명', '상품', '종목/상품',
    'symbol', 'name', 'ticker', 'stock',
  ],
  code: [
    '코드', '종목코드', '상품코드', '단축코드',
    'code', 'ticker_code',
  ],
  side: [
    '구분', '매매구분', '매수매도', '매도매수', '거래구분',
    '매매유형', '거래유형', '주문유형', '주문구분',
    'side', 'type',
  ],
  price: [
    '단가', '체결단가', '가격', '체결가', '체결가격',
    '매매가', '거래단가', '평균단가', '주문가격',
    'price',
  ],
  quantity: [
    '수량', '체결수량', '매매수량', '거래수량', '주문수량',
    'qty', 'quantity',
  ],
  amount: [
    '금액', '체결금액', '거래금액', '정산금액', '결제금액',
    '거래대금', '매매금액', '주문금액',
    'amount', 'total',
  ],
  fee: [
    '수수료', '매매수수료', '위탁수수료', '거래수수료', '제비용',
    'fee', 'commission',
  ],
  tax: [
    '세금', '거래세', '제세금', '증권거래세', '거래세금',
    '농특세', '세금합계',
    'tax',
  ],
  executedAt: [
    '일시', '일자', '체결일시', '체결일', '체결일자',
    '거래일', '거래일자', '거래일시', '매매일', '매매일자',
    '결제일', '결제일자', '주문일시',
    'date', 'executedAt', 'executed_at',
  ],
  reason: ['사유', '매매사유', '비고', '메모', 'reason', 'memo'],
  tags: ['태그', '근거', 'tags'],
};

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, '').toLowerCase();
}

function findValue(row: Record<string, unknown>, key: keyof typeof HEADER_ALIASES) {
  const aliases = HEADER_ALIASES[key].map(normalizeHeader);
  const found = Object.entries(row).find(([header]) => aliases.includes(normalizeHeader(header)));
  return found?.[1];
}

function number(value: unknown) {
  const text = String(value ?? '').replace(/[,\s원주]/g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function side(value: unknown): Side {
  const text = String(value ?? '').trim();
  if (SIDE_WORDS[text]) return SIDE_WORDS[text];
  // 부분 매칭 (복합 문자열: "보통매도", "현금매수" 등)
  if (text.includes('매도')) return 'sell';
  if (text.includes('매수')) return 'buy';
  if (text.includes('인출') || text.includes('출금')) return 'withdrawal';
  if (text.includes('입금') || text.includes('납입')) return 'deposit';
  return 'buy'; // fallback
}

function date(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const text = String(value ?? '').trim();
  if (!text) return new Date().toISOString();
  const normalized = text
    .replace(/\./g, '-')
    .replace(/\//g, '-')
    .replace(/\s+/g, 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function tags(value: unknown) {
  return String(value ?? '')
    .split(/[,\s#/]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function toDraft(row: Record<string, unknown>, accountId: string): Draft {
  const parsedSide = side(findValue(row, 'side'));
  const price = number(findValue(row, 'price') || findValue(row, 'amount'));
  const quantity = parsedSide === 'deposit' || parsedSide === 'withdrawal' ? 1 : number(findValue(row, 'quantity')) || 1;
  const amount = number(findValue(row, 'amount')) || price * quantity;
  const reason = String(findValue(row, 'reason') ?? '').trim();
  return {
    accountId,
    symbol: String(findValue(row, 'symbol') || (parsedSide === 'deposit' ? '납입' : parsedSide === 'withdrawal' ? '인출' : '종목 미확인')).trim(),
    code: String(findValue(row, 'code') || '').trim() || undefined,
    side: parsedSide,
    price,
    quantity,
    amount,
    fee: number(findValue(row, 'fee')),
    tax: number(findValue(row, 'tax')),
    executedAt: date(findValue(row, 'executedAt')),
    source: 'manual',
    confidence: 1,
    taxDeductible: true,
    note: { reason, tags: tags(findValue(row, 'tags')) },
  };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\t')) {
      row.push(current);
      current = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i++;
      row.push(current);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function rowsToObjects(rows: unknown[][]) {
  const [headers, ...body] = rows;
  if (!headers) return [];
  return body.map((cells) => Object.fromEntries(headers.map((header, index) => [String(header ?? ''), cells[index]])));
}

export async function parseTradeFile(file: File, accountId: string): Promise<Draft[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    return rows.map((row) => toDraft(row, accountId)).filter((row) => row.amount > 0);
  }

  const text = await file.text();
  const objects = rowsToObjects(parseCsv(text));
  return objects.map((row) => toDraft(row, accountId)).filter((row) => row.amount > 0);
}

export function parseOcrText(text: string, accountId: string): Draft[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const sideIndex = parts.findIndex((part) => SIDE_WORDS[part] || part.includes('매수') || part.includes('매도'));
      const parsedSide = side(parts[sideIndex] || '매수');
      const nums = parts.map(number).filter((n) => n > 0);
      const symbol = parts.slice(0, sideIndex >= 0 ? sideIndex : 1).join(' ') || '종목 미확인';
      const price = nums[0] || 0;
      const quantity = nums[1] || 1;
      return toDraft({
        종목: symbol,
        구분: parsedSide,
        단가: price,
        수량: quantity,
        금액: price * quantity,
        체결일시: new Date().toISOString(),
        사유: 'OCR 텍스트 가져오기',
        태그: '기타',
      }, accountId);
    })
    .filter((row) => row.amount > 0);
}
