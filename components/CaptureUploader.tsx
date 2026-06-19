// components/CaptureUploader.tsx
// 매매일지 탭의 이미지 인식 입력.
// 증권사 앱 캡쳐를 올리면 비전 인식 → 검증 테이블(HITL) → 저장.

'use client';

import { useState } from 'react';
import { visionExtract } from '../lib/visionExtract';
import { BROKER_PROFILES, getProfile } from '../data/brokerProfiles';
import TradeReviewTable from './TradeReviewTable';
import type { Account, Trade } from '../data/types';

type Draft = Omit<Trade, 'id'>;

interface Props {
  accounts: Account[];
  defaultAccountId?: string;
  onConfirm: (rows: Draft[]) => void;
}

export default function CaptureUploader({ accounts, defaultAccountId, onConfirm }: Props) {
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '');
  const [brokerId, setBrokerId] = useState('auto');
  const [files, setFiles] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState('');
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runExtract() {
    if (files.length === 0) {
      setError('인식할 이미지를 선택하세요.');
      return;
    }
    if (!accountId) {
      setError('계좌를 선택하세요.');
      return;
    }
    setError(null);
    setExtracting(true);
    const profile = getProfile(brokerId);
    const all: Draft[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(`${i + 1}/${files.length} 인식 중…`);
        const rows = await visionExtract(files[i], profile, accountId);
        all.push(...rows);
      }
      if (all.length === 0) {
        setError('이미지에서 거래를 찾지 못했습니다. 다른 이미지를 시도하거나 수기로 입력하세요.');
      } else {
        setDraft(all);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '인식에 실패했습니다. 수기 입력을 이용하세요.');
    } finally {
      setExtracting(false);
      setProgress('');
    }
  }

  function handleSave(rows: Draft[]) {
    onConfirm(rows);
    setDraft(null);
    setFiles([]);
  }

  // 검증 단계
  if (draft) {
    return (
      <TradeReviewTable
        draft={draft}
        onChange={setDraft}
        onSave={handleSave}
        onCancel={() => setDraft(null)}
      />
    );
  }

  // 업로드 단계
  return (
    <div className="cap">
      <div className="cap-row">
        <label className="cap-field">
          <span>계좌</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label className="cap-field">
          <span>증권사</span>
          <select value={brokerId} onChange={(e) => setBrokerId(e.target.value)}>
            {BROKER_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="cap-drop">
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <span className="cap-drop-text">
          {files.length > 0
            ? `${files.length}장 선택됨`
            : '증권사 앱 매매내역 캡쳐를 선택하세요 (여러 장 가능)'}
        </span>
      </label>

      {files.length > 0 && (
        <ul className="cap-files">
          {files.map((f, i) => (
            <li key={i}>{f.name}</li>
          ))}
        </ul>
      )}

      {error && <p className="cap-error" role="alert">{error}</p>}

      <button type="button" className="cap-extract" onClick={runExtract} disabled={extracting}>
        {extracting ? progress || '인식 중…' : '인식하기'}
      </button>

      <p className="cap-note">
        인식 결과는 저장 전 검증 화면에서 직접 확인·수정할 수 있습니다.
      </p>
    </div>
  );
}
