// app/(app)/analysis/page.tsx
// 종목 분석 — 분석 노트 목록/작성/편집/회고

'use client';

import { useState } from 'react';
import { useAppData } from '../../../components/DataProvider';
import AnalysisNoteEditor from '../../../components/AnalysisNoteEditor';
import AnalysisNoteList from '../../../components/AnalysisNoteList';
import RetroView from '../../../components/RetroView';
import type { AnalysisNote } from '../../../data/types';

export default function AnalysisPage() {
  const data = useAppData();
  const [accountId, setAccountId] = useState<string | 'all'>('all');
  const [view, setView] = useState<'list' | 'new' | 'edit' | 'retro'>('list');
  const [selected, setSelected] = useState<AnalysisNote | null>(null);

  const defaultAccountId = accountId === 'all' ? undefined : accountId;

  function handleSelect(note: AnalysisNote) {
    setSelected(note);
    setView(note.status === 'closed' ? 'retro' : 'edit');
  }

  async function handleClose(noteId: string) {
    await data.updateAnalysisNote(noteId, { status: 'closed', closedAt: new Date().toISOString() });
  }

  if (data.loading) {
    return <div className="analysis-page"><p className="muted">데이터를 불러오는 중...</p></div>;
  }

  return (
    <div className="analysis-page">
      <header className="analysis-page-head">
        <h1 className="analysis-page-title">종목 분석</h1>
        <select
          className="acct-select"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          aria-label="계좌 선택"
        >
          <option value="all">전체 계좌</option>
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </header>

      {data.error && <p className="dash-error" role="alert">{data.error}</p>}

      <div className="analysis-tab">
        {view === 'list' && (
          <>
            <div className="analysis-toolbar">
              <button type="button" className="an-submit" onClick={() => setView('new')}>
                + 새 분석 노트
              </button>
            </div>
            <AnalysisNoteList
              notes={data.analysisNotes}
              trades={data.trades}
              realizedPnl={data.realizedPnl}
              accounts={data.accounts}
              accountId={accountId}
              onSelect={handleSelect}
              onClose={handleClose}
              onRemove={(id) => data.removeAnalysisNote(id)}
            />
          </>
        )}

        {view === 'new' && (
          <AnalysisNoteEditor
            accounts={data.accounts}
            defaultAccountId={defaultAccountId}
            onSave={async (n) => { await data.addAnalysisNote(n); setView('list'); }}
            onCancel={() => setView('list')}
          />
        )}

        {view === 'edit' && selected && (
          <AnalysisNoteEditor
            accounts={data.accounts}
            note={selected}
            onSave={async () => {}}
            onUpdate={async (id, patch) => { await data.updateAnalysisNote(id, patch); setView('list'); }}
            onCancel={() => { setSelected(null); setView('list'); }}
          />
        )}

        {view === 'retro' && selected && (
          <RetroView
            note={selected}
            trades={data.trades}
            onUpdate={data.updateAnalysisNote}
            onBack={() => { setSelected(null); setView('list'); }}
          />
        )}
      </div>
    </div>
  );
}
