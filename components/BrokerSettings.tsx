// components/BrokerSettings.tsx
// 증권사 API 연동 설정 — 조회 전용 (주문 기능 없음)

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { brokerCredentialsRepo } from '../lib/repo';
import { useAppData } from './DataProvider';
import type { BrokerCredential, BrokerType } from '../data/types';

const BROKER_LABELS: Record<BrokerType, string> = { kis: '한국투자증권 (KIS)', kiwoom: '키움증권' };

/* ───────── 인증 헤더 ───────── */

function getTokenFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  // Supabase는 localStorage에 세션을 저장한다
  // 키 형식: sb-{project-ref}-auth-token
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const match = url.match(/\/\/([^.]+)\./);
  const ref = match?.[1];
  if (!ref) return null;

  const raw = window.localStorage.getItem(`sb-${ref}-auth-token`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  // 1차: localStorage에서 직접 읽기
  let token = getTokenFromStorage();

  // 2차: Supabase API
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  }

  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

/* ───────── 메인 컴포넌트 ───────── */

export default function BrokerSettings() {
  const { accounts } = useAppData();
  const [credentials, setCredentials] = useState<BrokerCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadCredentials();
  }, []);

  async function loadCredentials() {
    try {
      const list = await brokerCredentialsRepo.list();
      setCredentials(list);
    } catch {
      // 로컬 모드 등에서는 빈 배열
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="settings-page"><p>불러오는 중…</p></div>;

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <h1 className="settings-page-title">증권사 연동</h1>
      </header>

      <div className="settings-section">
        <p className="settings-desc">
          증권사 API를 연동하면 잔고와 체결내역을 자동으로 동기화할 수 있습니다.
        </p>
        <p className="settings-desc" style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
          조회 전용 — 주문 기능은 없습니다. 모의투자로 먼저 테스트하는 것을 권장합니다.
        </p>
      </div>

      {/* 등록된 연동 목록 */}
      {credentials.length > 0 && (
        <div className="settings-section">
          <h3 className="settings-section-title">등록된 연동</h3>
          {credentials.map((cred) => (
            <CredentialCard
              key={cred.id}
              credential={cred}
              accountName={accounts.find((a) => a.id === cred.accountId)?.name ?? '(알 수 없는 계좌)'}
              onReload={loadCredentials}
            />
          ))}
        </div>
      )}

      {/* 추가 폼 */}
      {showForm ? (
        <AddCredentialForm
          accounts={accounts}
          onSave={() => { setShowForm(false); loadCredentials(); }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <div className="settings-section">
          <button type="button" className="tool-btn" onClick={() => setShowForm(true)}>
            + 증권사 연동 추가
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────── 자격 카드 ───────── */

interface PreviewExecution {
  symbol: string;
  code: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  tax: number;
  executedAt: string;
  orderNo: string;
}

function CredentialCard({
  credential,
  accountName,
  onReload,
}: {
  credential: BrokerCredential;
  accountName: string;
  onReload: () => void;
}) {
  const [syncing, setSyncing] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [showTypeSwitch, setShowTypeSwitch] = useState(false);

  // 날짜 범�� 선택
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // 미리보기
  const [preview, setPreview] = useState<PreviewExecution[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function handlePreviewExecutions() {
    setLoadingPreview(true);
    setPreview(null);
    setResult(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/broker/executions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          credentialId: credential.id,
          startDate,
          endDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setPreview(json.executions ?? []);
    } catch (e) {
      setResult(`오류: ${e instanceof Error ? e.message : '조회 실패'}`);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleConfirmSync() {
    setSyncing('executions');
    setResult(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/broker/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          credentialId: credential.id,
          syncType: 'executions',
          startDate,
          endDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '동기화 실패');

      const parts: string[] = [];
      if (json.syncedTrades != null) parts.push(`체결 ${json.syncedTrades}건 반영`);
      if (json.errors?.length) parts.push(`오류 ${json.errors.length}건`);
      setResult(`동기화 완료: ${parts.join(', ')}`);
      setPreview(null);
    } catch (e) {
      setResult(`오류: ${e instanceof Error ? e.message : '동기화 실패'}`);
    } finally {
      setSyncing(null);
    }
  }

  async function handleSync(syncType: 'balance' | 'all') {
    setSyncing(syncType);
    setResult(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/broker/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          credentialId: credential.id,
          syncType,
          startDate,
          endDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '동기화 실패');

      const parts: string[] = [];
      if (json.syncedHoldings != null) parts.push(`보유 ${json.syncedHoldings}종목`);
      if (json.syncedTrades != null) parts.push(`체결 ${json.syncedTrades}건`);
      if (json.updatedCash) parts.push('예수금 갱신');
      if (json.errors?.length) parts.push(`오류 ${json.errors.length}건`);
      // 디버그: raw API 응답 표시
      if (json._debug) {
        parts.push(`\n[DEBUG] ${JSON.stringify(json._debug)}`);
      }
      setResult(`동기화 완료: ${parts.join(', ')}`);
    } catch (e) {
      setResult(`오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    } finally {
      setSyncing(null);
    }
  }

  async function handleRemove() {
    if (!window.confirm('이 연동을 삭제하시겠습니까? 저장된 키 정보가 모두 삭제됩니다.')) return;
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/broker/credentials', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ credentialId: credential.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '삭제 실패');
      onReload();
    } catch (e) {
      alert(`삭제 실패: ${e instanceof Error ? e.message : '오류'}`);
    }
  }

  async function handleTypeSwitch() {
    const newType = credential.accountType === 'VIRTUAL' ? 'REAL' : 'VIRTUAL';
    if (newType === 'REAL') {
      const ok = window.confirm(
        '⚠️ 실전투자 모드로 전환합니다.\n\n'
        + '실전 모드에서는 실제 계좌의 잔고/체결 데이터를 조회합니다.\n'
        + '(주문 기능은 없으며, 조회만 가능합니다.)\n\n'
        + '전환하시겠습니까?'
      );
      if (!ok) return;
    }
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/broker/credentials', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ credentialId: credential.id, accountType: newType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '전환 실패');
      setShowTypeSwitch(false);
      onReload();
    } catch (e) {
      alert(`전환 실패: ${e instanceof Error ? e.message : '오류'}`);
    }
  }

  return (
    <div className="broker-card">
      <div className="broker-card-header">
        <div>
          <strong>{BROKER_LABELS[credential.broker]}</strong>
          <span className={`broker-badge ${credential.accountType === 'REAL' ? 'broker-badge-real' : ''}`}>
            {credential.accountType === 'REAL' ? '실전' : '모의'}
          </span>
        </div>
        <span className="broker-card-account">{accountName}</span>
      </div>

      {/* 날짜 범위 선택 */}
      <div className="broker-date-range">
        <label className="broker-date-label">
          시작일
          <input
            type="date"
            className="form-input broker-date-input"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="broker-date-label">
          종료일
          <input
            type="date"
            className="form-input broker-date-input"
            value={endDate}
            min={startDate}
            max={today}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>

      <div className="broker-card-actions">
        <button
          type="button"
          className="tool-btn"
          disabled={syncing !== null}
          onClick={() => handleSync('balance')}
        >
          {syncing === 'balance' ? '동기화 중…' : '잔고 동기화'}
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={syncing !== null || loadingPreview}
          onClick={handlePreviewExecutions}
        >
          {loadingPreview ? '조회 중…' : '체결 조회 (미리보기)'}
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={syncing !== null}
          onClick={() => handleSync('all')}
        >
          {syncing === 'all' ? '동기화 중…' : '전체 동기화'}
        </button>
      </div>

      {/* 체결 미리보기 테이블 */}
      {preview !== null && (
        <div className="broker-preview">
          <div className="broker-preview-header">
            <strong>체결내역 미리보기</strong>
            <span className="broker-preview-count">{preview.length}건</span>
          </div>
          {preview.length === 0 ? (
            <p className="broker-preview-empty">조회 기간에 체결 내역이 없습니다.</p>
          ) : (
            <>
              <div className="broker-preview-table-wrap">
                <table className="broker-preview-table">
                  <thead>
                    <tr>
                      <th>일시</th>
                      <th>종목</th>
                      <th>구분</th>
                      <th className="num">수량</th>
                      <th className="num">단가</th>
                      <th className="num">금액</th>
                      <th className="num">수수료+세금</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((exec, i) => (
                      <tr key={`${exec.orderNo}-${i}`}>
                        <td>{exec.executedAt.slice(0, 10)}</td>
                        <td>{exec.symbol}</td>
                        <td className={exec.side === 'buy' ? 'pnl-up' : 'pnl-down'}>
                          {exec.side === 'buy' ? '매수' : '매도'}
                        </td>
                        <td className="num mono">{exec.quantity.toLocaleString()}</td>
                        <td className="num mono">{exec.price.toLocaleString()}</td>
                        <td className="num mono">{(exec.price * exec.quantity).toLocaleString()}</td>
                        <td className="num mono">{(exec.fee + exec.tax).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="broker-card-actions" style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  className="tool-btn"
                  disabled={syncing !== null}
                  onClick={handleConfirmSync}
                >
                  {syncing === 'executions' ? '반영 중…' : `${preview.length}건 반영하기`}
                </button>
                <button
                  type="button"
                  className="tool-btn"
                  onClick={() => setPreview(null)}
                >
                  취소
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="broker-card-meta">
        <button
          type="button"
          className="broker-link-btn"
          onClick={() => setShowTypeSwitch(!showTypeSwitch)}
        >
          {credential.accountType === 'VIRTUAL' ? '실전 모드로 전환' : '모의 모드로 전환'}
        </button>
        <button type="button" className="broker-link-btn broker-link-danger" onClick={handleRemove}>
          삭제
        </button>
      </div>

      {showTypeSwitch && (
        <div className="broker-type-switch">
          <p>
            {credential.accountType === 'VIRTUAL'
              ? '실전투자 모드로 전환하면 실제 계좌 데이터를 조회합니다.'
              : '모의투자 모드로 전환합니다.'}
          </p>
          <div className="broker-card-actions">
            <button type="button" className="tool-btn" onClick={handleTypeSwitch}>
              {credential.accountType === 'VIRTUAL' ? '실전으로 전환' : '모의로 전환'}
            </button>
            <button type="button" className="tool-btn" onClick={() => setShowTypeSwitch(false)}>취소</button>
          </div>
        </div>
      )}

      {result && (
        <pre className={`settings-result ${result.startsWith('오류') ? 'settings-result-error' : ''}`} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.75rem', maxHeight: '300px', overflow: 'auto' }}>
          {result}
        </pre>
      )}
    </div>
  );
}

/* ───────── 추가 폼 ───────── */

function AddCredentialForm({
  accounts,
  onSave,
  onCancel,
}: {
  accounts: { id: string; name: string }[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [broker, setBroker] = useState<BrokerType>('kis');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [accountType, setAccountType] = useState<'REAL' | 'VIRTUAL'>('VIRTUAL');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const headers = await authHeaders();
      if (!headers.Authorization) {
        throw new Error('인증 토큰을 가져올 수 없습니다. 페이지를 새로고침 후 다시 로그인해 주세요.');
      }
      const res = await fetch('/api/broker/test', {
        method: 'POST',
        headers,
        body: JSON.stringify({ broker, appKey, appSecret, accountNo, accountType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '연결 실패');

      setTestResult({
        success: true,
        message: `연결 성공! 예수금: ${json.balance.cash.toLocaleString()}원, 보유 ${json.balance.holdingCount}종목`,
      });
    } catch (e) {
      setTestResult({
        success: false,
        message: e instanceof Error ? e.message : '연결 실패',
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!accountId || !appKey || !appSecret || !accountNo) {
      alert('모든 필수 항목을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const headers = await authHeaders();

      // 서버 API를 통해 암호화 + 저장 (평문은 서버에서만 처리)
      const res = await fetch('/api/broker/credentials', {
        method: 'POST',
        headers,
        body: JSON.stringify({ accountId, broker, appKey, appSecret, accountNo, accountType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '저장 실패');

      onSave();
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : '오류'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">증권사 연동 추가</h3>

      <div className="form-grid">
        <label className="form-label">
          증권사
          <select
            className="form-input"
            value={broker}
            onChange={(e) => setBroker(e.target.value as BrokerType)}
          >
            <option value="kis">한국투자증권 (KIS)</option>
            <option value="kiwoom">키움증권</option>
          </select>
        </label>

        <label className="form-label">
          연결 계좌
          <select
            className="form-input"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>

        <label className="form-label">
          계좌 유형
          <select
            className="form-input"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as 'REAL' | 'VIRTUAL')}
          >
            <option value="VIRTUAL">모의투자</option>
            <option value="REAL">실전투자</option>
          </select>
        </label>

        <label className="form-label">
          앱키 (App Key)
          <input
            type="password"
            className="form-input"
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            placeholder="발급받은 앱키"
          />
        </label>

        <label className="form-label">
          앱 시크릿 (App Secret)
          <input
            type="password"
            className="form-input"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="발급받은 앱 시크릿"
          />
        </label>

        <label className="form-label">
          계좌번호
          <input
            type="text"
            className="form-input"
            value={accountNo}
            onChange={(e) => setAccountNo(e.target.value)}
            placeholder={broker === 'kis' ? '계좌번호 10자리 (예: 5012345601)' : '계좌번호'}
          />
        </label>
      </div>

      {testResult && (
        <p className={`settings-result ${testResult.success ? '' : 'settings-result-error'}`}>
          {testResult.message}
        </p>
      )}

      <div className="onboard-actions">
        <button
          type="button"
          className="tool-btn"
          onClick={handleTest}
          disabled={testing || !appKey || !appSecret || !accountNo}
        >
          {testing ? '테스트 중…' : '연결 테스트'}
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={handleSave}
          disabled={saving || !testResult?.success}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        <button type="button" className="tool-btn" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
