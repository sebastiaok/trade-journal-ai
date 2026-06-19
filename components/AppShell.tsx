// components/AppShell.tsx
// Sidebar + Content + BottomTabBar를 조합하는 레이아웃 셸.

'use client';

import Sidebar from './Sidebar';
import BottomTabBar from './BottomTabBar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">{children}</main>
      <BottomTabBar />
    </div>
  );
}
