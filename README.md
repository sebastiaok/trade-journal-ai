# TradeJournalAI — 매매일지 웹앱

증권사 앱 캡쳐 인식 + 수기 입력으로 기록하고 복기하는 개인 매매일지.
PC·모바일 어디서든 같은 데이터(Supabase + 로그인). JSON 백업 지원.

## 기능
- 매매내역 조회 (계좌/종목/기간/구분 필터, 정렬)
- 매매일지 입력 (수기 + 이미지 인식, 매매 사유·근거 태그)
- 복기/통계 (기간별 월·분기·연도 + 종목별: 승률·손익비·MDD·누적손익)
- 투자 검토 (체크리스트 + 결론·목표가·손절가·비중)
- 계좌 분리 (일반/ISA/연금/IRP/IRP-DC) + 한도·세제 트래커
- 로그인(매직링크/비밀번호), JSON 내보내기/가져오기

## 설정
1. Supabase 프로젝트 생성 → SQL Editor에 `supabase/schema.sql` 실행
2. Authentication → Email 활성화
3. `.env.local` 작성 (`.env.local.example` 참고)
4. `npm install && npm run dev`

## 스택
Next.js 16 (App Router) · React 19 · TypeScript · Supabase(Postgres+Auth) · Anthropic(비전)

> 본 앱은 매매 판단을 보조할 뿐 투자 권유·자동매매를 하지 않습니다.
> 한도·세제 트래커는 참고용 집계이며 세무 자문이 아닙니다.
