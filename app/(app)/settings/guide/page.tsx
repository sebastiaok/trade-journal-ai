// app/(app)/settings/guide/page.tsx
// 사용자 가이드 — 로컬 크론 동기화 설정 및 전체 사용법 안내

'use client';

import { useState } from 'react';
import Link from 'next/link';

type Tab = 'start' | 'sync' | 'cron' | 'faq';

export default function GuidePage() {
  const [tab, setTab] = useState<Tab>('start');

  return (
    <div className="settings-page guide-page">
      <header className="settings-page-head">
        <h1 className="settings-page-title">사용 가이드</h1>
      </header>

      <nav className="dash-tabs" role="tablist">
        {([
          ['start', '시작하기'],
          ['sync', '데이터 동기화'],
          ['cron', '자동 동기화'],
          ['faq', 'FAQ'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`dash-tab ${tab === key ? 'on' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'start' && <GettingStarted />}
      {tab === 'sync' && <DataSync />}
      {tab === 'cron' && <CronSetup />}
      {tab === 'faq' && <FAQ />}

      <div className="settings-nav">
        <Link href="/settings/broker" className="tool-btn">증권사 연동</Link>
        <Link href="/settings/data" className="tool-btn">데이터 관리</Link>
        <Link href="/" className="tool-btn">대시보드</Link>
      </div>
    </div>
  );
}

/* ───────── 시작하기 ───────── */

function GettingStarted() {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">TradeJournalAI란?</h3>
      <p className="settings-desc">
        증권사 API와 연동하여 보유 종목, 체결 내역, 실현 손익을 자동으로 기록하고
        포트폴리오 분석과 투자 회고를 돕는 개인 투자 저널입니다.
      </p>

      <div className="guide-steps">
        <div className="guide-step">
          <span className="guide-step-num">1</span>
          <div>
            <strong>계좌 등록</strong>
            <p className="settings-desc">
              <Link href="/accounts" className="settings-link">계좌 관리</Link>에서
              증권 계좌를 추가합니다. 계좌 유형(일반/ISA/연금/IRP)과 기본 정보를 입력하세요.
            </p>
          </div>
        </div>

        <div className="guide-step">
          <span className="guide-step-num">2</span>
          <div>
            <strong>증권사 API 연동</strong>
            <p className="settings-desc">
              <Link href="/settings/broker" className="settings-link">증권사 연동</Link>에서
              KIS 또는 키움 API 키를 등록합니다. 모든 자격정보는 AES-256-GCM으로 암호화 저장됩니다.
            </p>
          </div>
        </div>

        <div className="guide-step">
          <span className="guide-step-num">3</span>
          <div>
            <strong>데이터 동기화</strong>
            <p className="settings-desc">
              증권사 API를 통해 잔고와 체결 내역을 자동 동기화합니다.
              키움은 IP 제한이 있어 로컬 PC에서 동기화해야 합니다 (아래 탭 참조).
            </p>
          </div>
        </div>

        <div className="guide-step">
          <span className="guide-step-num">4</span>
          <div>
            <strong>분석 및 회고</strong>
            <p className="settings-desc">
              <Link href="/portfolio" className="settings-link">포트폴리오</Link>에서 자산 배분을 확인하고,
              <Link href="/analysis" className="settings-link"> 종목 분석</Link>에서 투자 메모를 작성하세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── 데이터 동기화 ───────── */

function DataSync() {
  return (
    <>
      <div className="settings-section">
        <h3 className="settings-section-title">동기화 구조</h3>
        <p className="settings-desc">
          증권사 API에서 데이터를 가져와 Supabase(클라우드 DB)에 저장하고,
          웹 앱은 Supabase에서 읽기만 합니다.
        </p>

        <div className="guide-diagram">
          <div className="guide-diagram-row">
            <div className="guide-diagram-box guide-diagram-local">
              <strong>로컬 PC</strong>
              <span>키움 등록 IP</span>
            </div>
            <span className="guide-diagram-arrow">&rarr;</span>
            <div className="guide-diagram-box guide-diagram-api">
              <strong>증권사 API</strong>
              <span>KIS / 키움</span>
            </div>
          </div>
          <div className="guide-diagram-row">
            <div className="guide-diagram-box guide-diagram-local">
              <strong>sync-local.ts</strong>
              <span>잔고 + 체결 조회</span>
            </div>
            <span className="guide-diagram-arrow">&rarr;</span>
            <div className="guide-diagram-box guide-diagram-db">
              <strong>Supabase</strong>
              <span>holdings, trades</span>
            </div>
            <span className="guide-diagram-arrow">&larr;</span>
            <div className="guide-diagram-box guide-diagram-web">
              <strong>웹 앱</strong>
              <span>읽기 전용</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">동기화 대상</h3>
        <table className="guide-table">
          <thead>
            <tr>
              <th>항목</th>
              <th>함수</th>
              <th>갱신 테이블</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>예수금</td>
              <td><code>syncBalance</code></td>
              <td>accounts</td>
            </tr>
            <tr>
              <td>보유 종목</td>
              <td><code>syncBalance</code></td>
              <td>holdings, price_cache</td>
            </tr>
            <tr>
              <td>체결 내역</td>
              <td><code>syncExecutions</code></td>
              <td>trades</td>
            </tr>
            <tr>
              <td>실현 손익</td>
              <td><code>syncExecutions</code></td>
              <td>realized_pnl (FIFO)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">수동 실행</h3>
        <p className="settings-desc">
          프로젝트 루트에서 아래 명령으로 즉시 동기화할 수 있습니다.
        </p>
        <div className="guide-code-block">
          <div className="guide-code-comment"># 잔고 + 당일 체결 전체 동기화</div>
          <code>npx tsx scripts/sync-local.ts</code>
        </div>
        <div className="guide-code-block">
          <div className="guide-code-comment"># 잔고만 동기화 (체결 조회 생략)</div>
          <code>npx tsx scripts/sync-local.ts --balance-only</code>
        </div>
        <div className="guide-code-block">
          <div className="guide-code-comment"># 특정 기간 체결 동기화</div>
          <code>npx tsx scripts/sync-local.ts --start 2026-01-01 --end 2026-06-24</code>
        </div>
      </div>
    </>
  );
}

/* ───────── 자동 동기화 (cron) ───────── */

function CronSetup() {
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const cronDaily =
    '30 16 * * 1-5 /Users/a05034/project/trade-journal-ai/scripts/sync-local.sh';
  const cronHourly =
    '0 9-15 * * 1-5 /Users/a05034/project/trade-journal-ai/scripts/sync-local.sh --balance-only';

  return (
    <>
      <div className="settings-section">
        <h3 className="settings-section-title">왜 로컬 크론인가?</h3>
        <p className="settings-desc">
          키움 OpenAPI는 사전 등록된 IP에서만 호출할 수 있습니다.
          Vercel Functions는 매 요청마다 IP가 바뀌므로 키움 API를 호출할 수 없습니다.
        </p>
        <p className="settings-desc">
          해결 방법: 키움에 등록된 IP의 로컬 PC에서 cron으로 동기화 스크립트를 실행하고,
          Vercel 앱은 Supabase 데이터만 읽습니다.
          KIS는 IP 제한이 없어 Vercel cron에서도 정상 작동합니다.
        </p>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">사전 준비</h3>
        <div className="guide-checklist">
          <label className="guide-check-item">
            <input type="checkbox" />
            <span>Node.js 18+ 설치 확인</span>
          </label>
          <label className="guide-check-item">
            <input type="checkbox" />
            <span>프로젝트 클론 및 <code>npm install</code> 완료</span>
          </label>
          <label className="guide-check-item">
            <input type="checkbox" />
            <span><code>.env.local</code> 파일에 환경변수 설정 완료</span>
          </label>
          <label className="guide-check-item">
            <input type="checkbox" />
            <span>키움 OpenAPI 지정단말기에 현재 PC IP 등록</span>
          </label>
          <label className="guide-check-item">
            <input type="checkbox" />
            <span>수동 실행 테스트 통과 (<code>npx tsx scripts/sync-local.ts</code>)</span>
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">필요 환경변수</h3>
        <p className="settings-desc">
          <code>.env.local</code> 파일에 아래 3개가 반드시 있어야 합니다.
        </p>
        <table className="guide-table">
          <thead>
            <tr>
              <th>변수명</th>
              <th>설명</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>NEXT_PUBLIC_SUPABASE_URL</code></td>
              <td>Supabase 프로젝트 URL</td>
            </tr>
            <tr>
              <td><code>SUPABASE_SERVICE_ROLE_KEY</code></td>
              <td>Service Role 키 (RLS 우회)</td>
            </tr>
            <tr>
              <td><code>BROKER_ENCRYPTION_KEY</code></td>
              <td>AES-256 암호화 키 (64자 hex)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">crontab 등록</h3>
        <p className="settings-desc">
          터미널에서 <code>crontab -e</code>를 실행하고 아래 라인을 추가하세요.
        </p>

        <div className="guide-cron-entry">
          <div className="guide-cron-label">
            <strong>장 마감 후 동기화</strong>
            <span className="muted">평일 16:30 KST &mdash; 잔고 + 당일 체결</span>
          </div>
          <div className="guide-code-block">
            <code>{cronDaily}</code>
            <button
              className="guide-copy-btn"
              onClick={() => copyText('daily', cronDaily)}
            >
              {copied === 'daily' ? '복사됨' : '복사'}
            </button>
          </div>
        </div>

        <div className="guide-cron-entry">
          <div className="guide-cron-label">
            <strong>장중 시세 갱신 (선택)</strong>
            <span className="muted">평일 09~15시 매 정각 &mdash; 잔고만</span>
          </div>
          <div className="guide-code-block">
            <code>{cronHourly}</code>
            <button
              className="guide-copy-btn"
              onClick={() => copyText('hourly', cronHourly)}
            >
              {copied === 'hourly' ? '복사됨' : '복사'}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">로그 확인</h3>
        <p className="settings-desc">
          실행 로그는 <code>scripts/logs/sync-YYYY-MM-DD.log</code> 에 자동 저장됩니다.
        </p>
        <div className="guide-code-block">
          <div className="guide-code-comment"># 오늘 로그 확인</div>
          <code>cat scripts/logs/sync-$(date +%Y-%m-%d).log</code>
        </div>
        <div className="guide-code-block">
          <div className="guide-code-comment"># 실시간 모니터링</div>
          <code>tail -f scripts/logs/sync-$(date +%Y-%m-%d).log</code>
        </div>
      </div>
    </>
  );
}

/* ───────── FAQ ───────── */

function FAQ() {
  return (
    <div className="guide-faq">
      <FAQItem
        q="키움 동기화 시 '지정단말기 인증에 실패했습니다' 오류가 발생합니다"
        a="키움 OpenAPI 관리 페이지에서 현재 PC의 공인 IP를 지정단말기로 등록해야 합니다. IP가 변경되면 재등록이 필요합니다."
      />
      <FAQItem
        q="KIS는 Vercel에서도 동기화되나요?"
        a="네. KIS는 IP 제한이 없어 Vercel cron(/api/cron/prices, /api/cron/snapshot)에서 정상 작동합니다. 로컬 스크립트에서도 함께 실행되므로, 둘 중 하나만 사용해도 됩니다."
      />
      <FAQItem
        q="동기화를 하면 기존 수동 입력 거래가 삭제되나요?"
        a="아닙니다. 동기화는 주문번호(orderNo) 기준으로 중복을 확인합니다. 수동 입력 거래는 주문번호가 없으므로 영향받지 않습니다."
      />
      <FAQItem
        q="매도 시 실현손익은 어떻게 계산되나요?"
        a="매도 체결이 동기화되면 PostgreSQL RPC(calc_fifo_on_sell)가 FIFO 방식으로 매수 건과 매칭하여 실현손익을 자동 계산합니다."
      />
      <FAQItem
        q="--start / --end 날짜 형식은?"
        a="YYYY-MM-DD (예: 2026-01-15) 또는 YYYYMMDD (예: 20260115) 모두 가능합니다. 기본값은 오늘 날짜입니다."
      />
      <FAQItem
        q="Mac이 절전 모드이면 cron이 실행되나요?"
        a="아닙니다. Mac이 깨어 있어야 cron이 실행됩니다. launchd를 사용하면 깨어난 직후 밀린 작업을 실행할 수 있습니다."
      />
      <FAQItem
        q="여러 증권사 계좌를 동시에 동기화할 수 있나요?"
        a="네. 스크립트가 broker_credentials 테이블의 모든 자격정보를 순회하며 각각 동기화합니다."
      />
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`guide-faq-item ${open ? 'open' : ''}`}>
      <button className="guide-faq-q" onClick={() => setOpen(!open)}>
        <span className="guide-faq-icon">{open ? '\u25BC' : '\u25B6'}</span>
        {q}
      </button>
      {open && <p className="guide-faq-a">{a}</p>}
    </div>
  );
}
