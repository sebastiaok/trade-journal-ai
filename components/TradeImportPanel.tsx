'use client';

import { useState } from 'react';
import type { Account, Trade } from '../data/types';
import { HEADER_ALIASES, parseOcrText, parseTradeFile } from '../lib/importTrades';
import TradeReviewTable from './TradeReviewTable';

type Draft = Omit<Trade, 'id'>;

interface Props {
  accounts: Account[];
  defaultAccountId?: string;
  onConfirm: (rows: Draft[]) => void;
}

export default function TradeImportPanel({ accounts, defaultAccountId, onConfirm }: Props) {
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '');
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await parseTradeFile(file, accountId);
      if (rows.length === 0) setError('가져올 거래 행을 찾지 못했습니다. 헤더명을 확인하세요.');
      else setDraft(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  function importOcr() {
    setError(null);
    const rows = parseOcrText(ocrText, accountId);
    if (rows.length === 0) setError('OCR 텍스트에서 거래를 찾지 못했습니다.');
    else setDraft(rows);
  }

  if (draft) {
    return (
      <TradeReviewTable
        draft={draft}
        onChange={setDraft}
        onSave={(rows) => {
          onConfirm(rows);
          setDraft(null);
          setOcrText('');
        }}
        onCancel={() => setDraft(null)}
      />
    );
  }

  return (
    <div className="imp">
      <div className="cap-row">
        <label className="cap-field">
          <span>계좌</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="imp-grid">
        <section className="imp-box">
          <h3>엑셀/CSV 업로드</h3>
          <p>지원: .xlsx, .xls, .csv, .tsv. 첫 행은 헤더여야 합니다.</p>
          <label className="cap-drop">
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,text/csv,text/tab-separated-values"
              hidden
              onChange={(e) => importFile(e.target.files?.[0] ?? null)}
            />
            <span className="cap-drop-text">{busy ? '읽는 중...' : '거래내역 파일 선택'}</span>
          </label>
          <p className="cap-note">권장 헤더: 종목, 구분, 단가, 수량, 금액, 수수료, 세금, 체결일시, 사유, 태그</p>
          <details className="cap-header-guide">
            <summary>인식 가능한 헤더명 보기</summary>
            <div className="cap-header-guide-body">
              <p><strong>필수:</strong></p>
              <ul>
                <li>종목 → {HEADER_ALIASES.symbol.join(', ')}</li>
                <li>구분 → {HEADER_ALIASES.side.join(', ')}</li>
                <li>단가 → {HEADER_ALIASES.price.join(', ')}</li>
                <li>수량 → {HEADER_ALIASES.quantity.join(', ')}</li>
              </ul>
              <p><strong>선택:</strong></p>
              <ul>
                <li>금액 → {HEADER_ALIASES.amount.join(', ')}</li>
                <li>수수료 → {HEADER_ALIASES.fee.join(', ')}</li>
                <li>세금 → {HEADER_ALIASES.tax.join(', ')}</li>
                <li>일시 → {HEADER_ALIASES.executedAt.join(', ')}</li>
              </ul>
              <p className="cap-note">주요 증권사 호환: 키움, 삼성, 미래에셋, NH, 한국투자</p>
              <p className="cap-note">매매구분: 매수, 매도, 보통매수, 보통매도, 현금매수, 현금매도 등</p>
            </div>
          </details>
        </section>

        <section className="imp-box">
          <h3>무료 OCR 텍스트 붙여넣기</h3>
          <p>macOS/모바일 사진 OCR 등으로 추출한 텍스트를 붙여넣으면 행 단위로 파싱합니다.</p>
          <textarea
            rows={8}
            value={ocrText}
            placeholder={'삼성전자 매수 72000 10\\nNAVER 매도 210000 2'}
            onChange={(e) => setOcrText(e.target.value)}
          />
          <button type="button" className="cap-extract" onClick={importOcr}>
            OCR 텍스트 파싱
          </button>
        </section>
      </div>

      {error && <p className="cap-error" role="alert">{error}</p>}
    </div>
  );
}
