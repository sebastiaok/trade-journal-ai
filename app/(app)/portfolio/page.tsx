// app/(app)/portfolio/page.tsx
// 포트폴리오 점검 — 배분 진단 + 리스크 지표 + 리밸런싱 제안

'use client';

import { useAppData } from '../../../components/DataProvider';
import PortfolioDashboard from '../../../components/PortfolioDashboard';

export default function PortfolioPage() {
  const data = useAppData();

  return (
    <div className="portfolio-page">
      <header className="portfolio-page-head">
        <h1 className="portfolio-page-title">포트폴리오</h1>
      </header>

      {data.error && <p className="dash-error" role="alert">{data.error}</p>}

      <PortfolioDashboard
        holdings={data.holdings}
        accounts={data.accounts}
        snapshots={data.snapshots}
        targetAllocation={data.targetAllocation}
        sectorMap={data.sectorMap}
        onTakeSnapshot={() => data.takeSnapshot()}
        onUpsertTarget={(sector, pct) => data.upsertTargetAlloc(sector, pct)}
        onRemoveTarget={(id) => data.removeTargetAlloc(id)}
      />
    </div>
  );
}
