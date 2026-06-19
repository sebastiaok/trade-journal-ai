// components/OnboardingGuard.tsx
// 계좌가 0개이면 /onboarding으로 리다이렉트한다.
// DataProvider 안에서 동작하며, 로딩 중에는 로딩 표시만 한다.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppData } from './DataProvider';

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { loading, accounts } = useAppData();
  const router = useRouter();

  useEffect(() => {
    if (!loading && accounts.length === 0) {
      router.replace('/onboarding');
    }
  }, [loading, accounts.length, router]);

  if (loading) {
    return <div className="dash-loading">데이터 불러오는 중…</div>;
  }

  if (accounts.length === 0) {
    return <div className="dash-loading">온보딩으로 이동 중…</div>;
  }

  return <>{children}</>;
}
