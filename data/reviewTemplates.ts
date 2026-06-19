// data/reviewTemplates.ts
// 투자 검토 체크리스트 + 복기 질문 템플릿.

export interface ChecklistItemTemplate {
  id: string;
  label: string;
}

/** 매수 전 투자 검토 기본 체크 항목 */
export const INVEST_CHECKLIST: ChecklistItemTemplate[] = [
  { id: 'thesis', label: '이 종목을 사는 한 줄 이유가 분명한가' },
  { id: 'earnings', label: '최근 실적과 추세를 확인했는가' },
  { id: 'valuation', label: '밸류에이션(PER/PBR 등)이 부담스럽지 않은가' },
  { id: 'catalyst', label: '주가를 움직일 촉매(이벤트)가 있는가' },
  { id: 'chart', label: '차트상 진입 위치가 합리적인가 (고점 추격 아님)' },
  { id: 'risk', label: '하락 리스크와 악재 시나리오를 점검했는가' },
  { id: 'stop', label: '손절 기준을 정했는가' },
  { id: 'size', label: '계좌 대비 비중이 적절한가' },
  { id: 'horizon', label: '보유 기간(단기/중기/장기)이 명확한가' },
  { id: 'emotion', label: 'FOMO·추격매수가 아닌 계획된 진입인가' },
];

/** 복기 질문 템플릿 (거래 후 회고) */
export const REVIEW_QUESTIONS: { category: string; questions: string[] }[] = [
  {
    category: '진입',
    questions: ['진입 이유가 계획대로였나?', '근거(실적/차트/뉴스)는 충분했나?'],
  },
  {
    category: '청산',
    questions: ['목표가·손절가를 지켰나?', '감정에 휘둘려 일찍/늦게 팔지 않았나?'],
  },
  {
    category: '패턴',
    questions: ['이번 거래에서 반복되는 실수가 있었나?', '다음에 바꿀 한 가지는?'],
  },
];
