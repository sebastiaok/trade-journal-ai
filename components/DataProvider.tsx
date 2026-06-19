// components/DataProvider.tsx
// useData()를 Context로 감싸서 라우트 전환 시에도 데이터를 유지한다.

'use client';

import { createContext, useContext } from 'react';
import { useData, type UseData } from '../lib/useData';

const DataContext = createContext<UseData | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const data = useData();
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useAppData(): UseData {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useAppData must be used within <DataProvider>');
  return ctx;
}
