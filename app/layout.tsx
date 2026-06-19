// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import AuthGate from '../components/AuthGate';

export const metadata: Metadata = {
  title: '매매일지 — TradeJournalAI',
  description: '증권사 캡쳐 인식·수기 입력으로 기록하고 복기하는 개인 매매일지',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
