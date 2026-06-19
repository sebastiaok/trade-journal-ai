// app/(app)/settings/data/page.tsx
// 데이터 관리 — 가져오기(CSV/JSON) · 내보내기(CSV/JSON) 탭 구성

'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useAppData } from '../../../../components/DataProvider';
import {
  downloadBackup,
  importBackupFromFile,
  previewBackup,
  type BackupPreview,
  type RestoreMode,
} from '../../../../lib/backup';
import { exportTradesCsv, exportAccountsCsv, exportRealizedPnlCsv } from '../../../../lib/csvExport';

type Tab = 'import' | 'export';

export default function DataSettingsPage() {
  const data = useAppData();
  const [tab, setTab] = useState<Tab>('export');

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <h1 className="settings-page-title">데이터 관리</h1>
      </header>

      <nav className="dash-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'import'}
          className={`dash-tab ${tab === 'import' ? 'on' : ''}`}
          onClick={() => setTab('import')}
        >
          가져오기
        </button>
        <button
          role="tab"
          aria-selected={tab === 'export'}
          className={`dash-tab ${tab === 'export' ? 'on' : ''}`}
          onClick={() => setTab('export')}
        >
          내보내기
        </button>
      </nav>

      {tab === 'import' ? (
        <ImportSection onReload={() => data.reload()} />
      ) : (
        <ExportSection accounts={data.accounts} />
      )}

      <div className="settings-section">
        <h3 className="settings-section-title">현재 데이터 현황</h3>
        <div className="settings-stats">
          <span>계좌 {data.accounts.length}개</span>
          <span>거래 {data.trades.length}건</span>
          <span>보유 종목 {data.holdings.length}개</span>
          <span>분석 노트 {data.analysisNotes.length}개</span>
          <span>스냅샷 {data.snapshots.length}개</span>
        </div>
      </div>

      <div className="settings-nav">
        <Link href="/accounts" className="tool-btn">계좌 관리</Link>
        <Link href="/" className="tool-btn">대시보드</Link>
      </div>
    </div>
  );
}

/* ───────── 가져오기 섹션 ───────── */

function ImportSection({ onReload }: { onReload: () => Promise<void> }) {
  const jsonRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function handleFileSelect(file: File | null) {
    if (!file) return;
    setResult(null);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const p = previewBackup(reader.result as string);
          setPreview(p);
          setPendingFile(file);
        } catch (e) {
          setResult(`파일 읽기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
        }
      };
      reader.readAsText(file);
    } catch {
      setResult('파일을 읽을 수 없습니다.');
    }
  }

  async function handleRestore() {
    if (!pendingFile) return;
    if (restoreMode === 'overwrite') {
      const ok = window.confirm(
        '⚠️ 덮어쓰기 복원은 기존 데이터를 모두 삭제합니다.\n정말 진행하시겠습니까?'
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await importBackupFromFile(pendingFile, restoreMode);
      setResult(`복원 완료: 계좌 ${r.accounts}개 · 거래 ${r.trades}건 · 검토 ${r.checks}건`);
      setPreview(null);
      setPendingFile(null);
      await onReload();
    } catch (e) {
      setResult(`복원 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    } finally {
      setBusy(false);
      if (jsonRef.current) jsonRef.current.value = '';
    }
  }

  function cancelPreview() {
    setPreview(null);
    setPendingFile(null);
    if (jsonRef.current) jsonRef.current.value = '';
  }

  return (
    <div className="settings-section">
      <p className="settings-desc">
        증권사 앱이나 HTS의 잔고·거래내역 화면을 캡처해 올리면 자동으로 인식해 등록합니다.
        또는 표준 CSV 양식으로 일괄 등록할 수 있어요.
        인식·업로드 결과는 저장 전에 확인·수정할 수 있습니다.
      </p>

      <div className="settings-section">
        <h3 className="settings-section-title">OCR 캡처 / CSV 업로드</h3>
        <p className="settings-desc">
          거래 입력의 이미지 인식·파일/텍스트 기능은 <Link href="/transactions" className="settings-link">매매내역</Link> 페이지에서 이용할 수 있습니다.
        </p>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">JSON 백업 복원</h3>
        <p className="settings-desc">
          이전에 내보낸 JSON 백업 파일을 선택하여 데이터를 복원합니다.
        </p>

        {!preview ? (
          <>
            <button type="button" className="tool-btn" onClick={() => jsonRef.current?.click()}>
              JSON 백업 파일 선택
            </button>
            <input
              ref={jsonRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
          </>
        ) : (
          <div className="restore-preview">
            <h4 className="restore-preview-title">백업 파일 내용</h4>
            <div className="settings-stats">
              <span>내보낸 날짜: {new Date(preview.exportedAt).toLocaleDateString('ko-KR')}</span>
              <span>계좌 {preview.accountCount}개</span>
              <span>거래 {preview.tradeCount}건</span>
              <span>검토 {preview.checkCount}건</span>
            </div>
            {preview.accountNames.length > 0 && (
              <p className="settings-desc">계좌: {preview.accountNames.join(', ')}</p>
            )}

            <div className="restore-mode">
              <label className="restore-mode-option">
                <input
                  type="radio"
                  name="restoreMode"
                  value="merge"
                  checked={restoreMode === 'merge'}
                  onChange={() => setRestoreMode('merge')}
                />
                <span>
                  <strong>병합</strong> — 기존 데이터를 유지하고 백업 데이터를 추가합니다.
                </span>
              </label>
              <label className="restore-mode-option">
                <input
                  type="radio"
                  name="restoreMode"
                  value="overwrite"
                  checked={restoreMode === 'overwrite'}
                  onChange={() => setRestoreMode('overwrite')}
                />
                <span>
                  <strong>덮어쓰기</strong> — 기존 데이터를 삭제하고 백업으로 교체합니다.
                  <em className="restore-warning"> (되돌릴 수 없음)</em>
                </span>
              </label>
            </div>

            <div className="onboard-actions">
              <button type="button" className="tool-btn" onClick={handleRestore} disabled={busy}>
                {busy ? '복원 중…' : restoreMode === 'overwrite' ? '⚠️ 덮어쓰기 복원' : '병합 복원'}
              </button>
              <button type="button" className="tool-btn" onClick={cancelPreview}>
                취소
              </button>
            </div>
          </div>
        )}

        {result && <p className={`settings-result ${result.includes('실패') ? 'settings-result-error' : ''}`} role="alert">{result}</p>}
      </div>
    </div>
  );
}

/* ───────── 내보내기 섹션 ───────── */

function ExportSection({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      alert(`내보내기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="settings-section">
      <p className="settings-desc">
        내 데이터를 원하는 형식으로 내려받을 수 있습니다.
        CSV는 엑셀·구글시트에서 바로 열 수 있고, JSON은 전체 백업·복원용입니다.
      </p>

      <div className="settings-section">
        <h3 className="settings-section-title">CSV 내보내기</h3>
        <p className="settings-desc">데이터 범위를 선택해 CSV 파일로 내려받습니다 (UTF-8, 한글 엑셀 호환).</p>
        <div className="export-buttons">
          <button
            type="button"
            className="tool-btn"
            disabled={busy !== null}
            onClick={() => run('trades', () => exportTradesCsv())}
          >
            {busy === 'trades' ? '내보내는 중…' : '거래내역 CSV'}
          </button>
          <button
            type="button"
            className="tool-btn"
            disabled={busy !== null}
            onClick={() => run('accounts', () => exportAccountsCsv())}
          >
            {busy === 'accounts' ? '내보내는 중…' : '계좌+보유 CSV'}
          </button>
          <button
            type="button"
            className="tool-btn"
            disabled={busy !== null}
            onClick={() => run('pnl', () => exportRealizedPnlCsv())}
          >
            {busy === 'pnl' ? '내보내는 중…' : '실현손익 CSV'}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">JSON 내보내기</h3>
        <p className="settings-desc">
          모든 계좌·거래·분석 노트·포트폴리오 데이터를 JSON 파일로 내려받습니다.
          이 파일로 나중에 전체 복원할 수 있습니다.
        </p>
        <button
          type="button"
          className="tool-btn"
          disabled={busy !== null}
          onClick={() => run('json', () => downloadBackup())}
        >
          {busy === 'json' ? '내보내는 중…' : 'JSON 전체 백업'}
        </button>
      </div>
    </div>
  );
}
