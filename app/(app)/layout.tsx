// app/(app)/layout.tsx
// 앱 그룹 레이아웃 — DataProvider + OnboardingGuard + AppShell 중첩.
// 온보딩 라우트는 이 그룹 밖이므로 네비게이션 셸이 없다.

'use client';

import { DataProvider } from '../../components/DataProvider';
import OnboardingGuard from '../../components/OnboardingGuard';
import AppShell from '../../components/AppShell';

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <OnboardingGuard>
        <AppShell>{children}</AppShell>
      </OnboardingGuard>
    </DataProvider>
  );
}
