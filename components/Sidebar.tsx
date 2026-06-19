// components/Sidebar.tsx
// 데스크톱/태블릿 사이드바 네비게이션.
// ≥1024px: 아이콘+라벨  |  768-1023px: 아이콘만  |  <768px: 숨김

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const MAIN_NAV: NavItem[] = [
  { href: '/', label: '대시보드', icon: '📊' },
  { href: '/accounts', label: '계좌 관리', icon: '🏦' },
  { href: '/transactions', label: '매매내역', icon: '📝' },
  { href: '/analysis', label: '종목 분석', icon: '🔍' },
  { href: '/portfolio', label: '포트폴리오', icon: '💼' },
];

const BOTTOM_NAV: NavItem[] = [
  { href: '/settings/data', label: '데이터', icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-icon">📈</span>
        <span className="sidebar-brand-text">TradeJournal</span>
      </div>

      <nav className="sidebar-nav">
        <ul className="sidebar-list">
          {MAIN_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
                title={item.label}
              >
                <span className="sidebar-icon">{item.icon}</span>
                <span className="sidebar-label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <ul className="sidebar-list sidebar-bottom">
          {BOTTOM_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
                title={item.label}
              >
                <span className="sidebar-icon">{item.icon}</span>
                <span className="sidebar-label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
