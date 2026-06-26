// app/(app)/accounts/page.tsx
// 계좌 관리 — 계좌 CRUD + 예수금 입출금 + 세제 한도 추적.

'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import Link from 'next/link';
import { useAppData } from '../../../components/DataProvider';
import AccountManager from '../../../components/AccountManager';

class AccountsErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AccountsPage error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="accounts-page">
          <p className="dash-error" role="alert">
            계좌 관리 렌더링 오류: {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AccountsPage() {
  return (
    <AccountsErrorBoundary>
      <AccountsContent />
    </AccountsErrorBoundary>
  );
}

function AccountsContent() {
  const data = useAppData();

  if (data.loading) {
    return (
      <div className="accounts-page">
        <p className="muted">계좌 데이터를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="accounts-page">
      <header className="accounts-page-head">
        <h1 className="accounts-page-title">계좌 관리</h1>
        <Link href="/settings/data" className="tool-btn">데이터 관리</Link>
      </header>

      {data.error && <p className="dash-error" role="alert">{data.error}</p>}

      <AccountManager
        accounts={data.accounts}
        trades={data.trades}
        deposits={data.deposits}
        taxLimits={data.taxLimits}
        holdings={data.holdings}
        priceMap={data.priceMap}
        tickers={data.tickers}
        onAdd={(a) => data.addAccount(a)}
        onUpdate={(id, patch) => data.updateAccount(id, patch)}
        onRemove={(id) => data.removeAccount(id)}
        onAddDeposit={(d) => data.addDeposit(d)}
        onRemoveDeposit={(id) => data.removeDeposit(id)}
      />
    </div>
  );
}
