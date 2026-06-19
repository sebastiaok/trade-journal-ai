import type { Side, Trade } from '../data/types';

type Draft = Omit<Trade, 'id'>;

const SIDE_WORDS: Record<string, Side> = {
  buy: 'buy',
  BUY: 'buy',
  매수: 'buy',
  입금: 'deposit',
  납입: 'deposit',
  deposit: 'deposit',
  sell: 'sell',
  SELL: 'sell',
  매도: 'sell',
  출금: 'withdrawal',
  인출: 'withdrawal',
  withdrawal: 'withdrawal',
};

const HEADER_ALIASES: Record<string, string[]> = {
  symbol: ['종목', '종목명', '상품명', 'symbol', 'name'],
  code: ['코드', '종목코드', 'code'],
  side: ['구분', '매매구분', '매수매도', 'side', 'type'],
  price: ['단가', '체결단가', '가격', 'price'],
  quantity: ['수량', '체결수량', 'qty', 'quantity'],
  amount: ['금액', '체결금액', '거래금액', 'amount'],
  fee: ['수수료', 'fee', 'commission'],
  tax: ['세금', '거래세', 'tax'],
  executedAt: ['일시', '일자', '체결일시', '체결일', 'date', 'executedAt', 'executed_at'],
  reason: ['사유', '매매사유', 'reason'],
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
  return SIDE_WORDS[text] ?? (text.includes('매도') ? 'sell' : text.includes('인출') || text.includes('출금') ? 'withdrawal' : 'buy');
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
