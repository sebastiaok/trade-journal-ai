// app/(app)/page.tsx
// 대시보드 — 총자산·핵심 지표·자산 배분·계좌별 현황·알림 요약.
// 각 기능은 독립 라우트로 이관 완료. 대시보드는 집계 뷰만 담당.

'use client';

import { useRouter } from 'next/navigation';
import { useAppData } from '../../components/DataProvider';
import DashboardView from '../../components/DashboardView';

/** DashboardView의 onNavigate 탭명을 라우트로 매핑 */
const TAB_TO_ROUTE: Record<string, string> = {
  dashboard: '/',
  history: '/transactions',
  journal: '/transactions',
  review: '/transactions',
  analysis: '/analysis',
  portfolio: '/portfolio',
  accounts: '/accounts',
};

export default function DashboardPage() {
  const data = useAppData();
  const router = useRouter();

  return (
    <div className="dashboard-page">
      {data.error && <p className="dash-error" role="alert">{data.error}</p>}

      <DashboardView
        accounts={data.accounts}
        holdings={data.holdings}
        realizedPnl={data.realizedPnl}
        trades={data.trades}
        deposits={data.deposits}
        taxLimits={data.taxLimits}
        targetAllocation={data.targetAllocation}
        priceCache={data.priceCache}
        sectorMap={data.sectorMap}
        priceMap={data.priceMap}
        onNavigate={(tab) => router.push(TAB_TO_ROUTE[tab] ?? '/')}
      />
    </div>
  );
}
