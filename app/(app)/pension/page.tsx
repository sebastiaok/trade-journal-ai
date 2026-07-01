// app/(app)/pension/page.tsx
// 퇴직연금(DC/IRP) 포트폴리오 — 현재 배분 + 리밸런싱 시뮬레이션 + 계획 이력

'use client';

import { useAppData } from '../../../components/DataProvider';
import PensionDashboard from '../../../components/PensionDashboard';

export default function PensionPage() {
  const data = useAppData();

  if (data.loading) {
    return <div className="pension-page"><p className="muted">데이터를 불러오는 중...</p></div>;
  }

  const dcAccounts = data.accounts.filter((a) => a.type === 'dc');

  return (
    <div className="pension-page">
      <header className="pension-page-head">
        <h1 className="pension-page-title">퇴직연금</h1>
      </header>

      {data.error && <p className="dash-error" role="alert">{data.error}</p>}

      {dcAccounts.length === 0 && (
        <div className="pen-no-acct-banner">
          DC(확정기여형) 계좌가 아직 없습니다. 계좌 관리에서 등록하면 데이터를 연결할 수 있습니다.
        </div>
      )}

      <PensionDashboard
        accounts={dcAccounts}
        assetClasses={data.pensionAssetClasses}
        holdings={data.pensionHoldings}
        plans={data.pensionPlans}
        riskLimits={data.pensionRiskLimits}
        onUpsertHoldings={data.upsertPensionHoldings}
        onAddPlan={data.addPensionPlan}
        onRemovePlan={data.removePensionPlan}
        onAddAssetClass={data.addPensionAssetClass}
        onUpdateAssetClass={data.updatePensionAssetClass}
        onRemoveAssetClass={data.removePensionAssetClass}
      />
    </div>
  );
}
