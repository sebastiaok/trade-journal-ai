// components/AuthGate.tsx
// 로그인 게이트 — 로그인 전에는 children을 막고 로그인 폼을 보여준다.
// 매직링크(비밀번호 없이 이메일 링크) 기본, 비밀번호 로그인도 지원.

'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isImplementationMode } from '../lib/devMode';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type Mode = 'magic' | 'password';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isImplementationMode) {
      setLoading(false);
      return;
    }
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    // 최초 세션 확인 + 변경 구독
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="auth-loading">불러오는 중…</div>;
  }

  if (isImplementationMode) {
    return (
      <>
        <AccountBar email="구현 모드 · 이메일 로그인 비활성" devMode />
        {children}
      </>
    );
  }

  if (!session) {
    if (!isSupabaseConfigured) {
      return <SupabaseSetup />;
    }
    return <LoginForm />;
  }

  return (
    <>
      <AccountBar email={session.user.email ?? ''} />
      {children}
    </>
  );
}

function SupabaseSetup() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">Supabase 설정 필요</h1>
        <p className="auth-sub">
          PC·모바일 동기화를 위해 Supabase URL과 anon key가 필요합니다.
          `.env.local.example`을 참고해 `.env.local`을 만든 뒤 개발 서버를 재시작하세요.
        </p>
        <pre className="setup-code">
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...
        </pre>
      </div>
    </div>
  );
}

function LoginForm() {
  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendMagicLink() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setMessage('로그인 링크를 이메일로 보냈습니다. 메일함을 확인하세요.');
  }

  async function signInWithPassword() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) setError(error.message);
    // 성공 시 onAuthStateChange가 세션을 채운다
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError('이메일을 입력하세요.');
      return;
    }
    if (mode === 'magic') sendMagicLink();
    else signInWithPassword();
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">매매일지 로그인</h1>
        <p className="auth-sub">
          내 계정으로 로그인하면 PC·모바일 어디서든 같은 매매일지를 볼 수 있습니다.
        </p>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'magic'}
            className={mode === 'magic' ? 'on' : ''}
            onClick={() => { setMode('magic'); setError(null); setMessage(null); }}
          >
            이메일 링크
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'password'}
            className={mode === 'password' ? 'on' : ''}
            onClick={() => { setMode('password'); setError(null); setMessage(null); }}
          >
            비밀번호
          </button>
        </div>

        <label className="auth-field">
          <span>이메일</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        {mode === 'password' && (
          <label className="auth-field">
            <span>비밀번호</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}

        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-message">{message}</p>}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? '처리 중…' : mode === 'magic' ? '로그인 링크 받기' : '로그인'}
        </button>
      </form>
    </div>
  );
}

function AccountBar({ email, devMode = false }: { email: string; devMode?: boolean }) {
  async function signOut() {
    await supabase.auth.signOut();
  }
  return (
    <div className="account-bar">
      <span className="account-email">{email}</span>
      {!devMode && (
        <button type="button" className="account-signout" onClick={signOut}>
          로그아웃
        </button>
      )}
    </div>
  );
}
