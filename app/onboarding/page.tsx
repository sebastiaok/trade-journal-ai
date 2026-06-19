// app/onboarding/page.tsx
// 온보딩 라우트 — 그룹 (app) 밖이므로 네비게이션 셸 없이 풀스크린.
// 별도 DataProvider 사용 (그룹 밖이므로).
// 계좌가 이미 있으면 대시보드로 리다이렉트 (역방향 가드).
// 온보딩 진행 중(계좌 생성 후 보유 입력 단계)에는 역방향 가드를 비활성화.

'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DataProvider, useAppData } from '../../components/DataProvider';
import OnboardingFlow from '../../components/OnboardingFlow';

export default function OnboardingPage() {
  return (
    <DataProvider>
      <OnboardingContent />
    </DataProvider>
  );
}

function OnboardingContent() {
  const data = useAppData();
  const router = useRouter();
  // 온보딩 시작 시 계좌가 0개였는지 기록. 진행 중 계좌가 생겨도 리다이렉트 방지.
  const enteredWithZero = useRef<boolean | null>(null);

  useEffect(() => {
    if (data.loading) return;
    // 최초 로드 시점의 계좌 수를 기록
    if (enteredWithZero.current === null) {
      enteredWithZero.current = data.accounts.length === 0;
    }
    // 처음부터 계좌가 있던 사용자만 역방향 가드
    if (!enteredWithZero.current && data.accounts.length > 0) {
      router.replace('/');
    }
  }, [data.loading, data.accounts.length, router]);

  if (data.loading) {
    return <div className="dash-loading">데이터 불러오는 중…</div>;
  }

  // 처음부터 계좌가 있던 사용자 → 리다이렉트 대기
  if (enteredWithZero.current === false && data.accounts.length > 0) {
    return <div className="dash-loading">대시보드로 이동 중…</div>;
  }

  return (
    <main className="dash">
      <OnboardingFlow
        onAddAccount={async (a) => {
          await data.addAccount(a);
        }}
        onSkip={() => router.replace('/')}
        onOpeningLot={() => router.replace('/')}
        accounts={data.accounts}
        onSubmitMany={async (list) => {
          await data.addTrades(list);
        }}
        onSubmitOne={async (t) => {
          await data.addTrade(t);
        }}
      />
    </main>
  );
}
