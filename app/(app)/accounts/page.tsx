// app/(app)/accounts/page.tsx
// 계좌 관리 — 계좌 CRUD + 예수금 입출금 + 세제 한도 추적.

'use client';

import Link from 'next/link';
import { useAppData } from '../../../components/DataProvider';
import AccountManager from '../../../components/AccountManager';

export default function AccountsPage() {
  const data = useAppData();

  return (
    <div className="accounts-page">
      <header className="accounts-page-head">
        <h1 className="accounts-page-title">계좌 관리</h1>
        <Link href="/settings/data" className="tool-btn">데이터 관리</Link>
      </header>

      <AccountManager
        accounts={data.accounts}
        trades={data.trades}
        deposits={data.deposits}
        taxLimits={data.taxLimits}
        onAdd={(a) => data.addAccount(a)}
        onUpdate={(id, patch) => data.updateAccount(id, patch)}
        onRemove={(id) => data.removeAccount(id)}
        onAddDeposit={(d) => data.addDeposit(d)}
        onRemoveDeposit={(id) => data.removeDeposit(id)}
      />
    </div>
  );
}
