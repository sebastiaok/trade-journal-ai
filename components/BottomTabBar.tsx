// components/BottomTabBar.tsx
// 모바일 전용 하단 탭바. CSS로 <768px에서만 표시.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TabItem {
  href: string;
  label: string;
  icon: string;
}

const TABS: TabItem[] = [
  { href: '/', label: '대시보드', icon: '📊' },
  { href: '/accounts', label: '계좌', icon: '🏦' },
  { href: '/transactions', label: '매매', icon: '📝' },
  { href: '/analysis', label: '분석', icon: '🔍' },
  { href: '/portfolio', label: '포트폴리오', icon: '💼' },
];

export default function BottomTabBar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <nav className="bottom-tabs">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`bottom-tab ${isActive(tab.href) ? 'active' : ''}`}
        >
          <span className="bottom-tab-icon">{tab.icon}</span>
          <span className="bottom-tab-label">{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
