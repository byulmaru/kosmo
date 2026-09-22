## Session Work

모든 항목은 PROD-922 구현·검증 담당 범위다. 아래 접근과 작업 분할은 수정할 수 있지만 canonical·Linear의 결과는 유지한다.

- [ ] 1.1 공용 목록에서 A attribution 아래 B 표준 행과 nullable C preview를 표시하고 Relay 생성물을 갱신한다. 기존 B target·A Reply disabled·한 단계 cutoff를 보존한다.
- [ ] 1.2 `PureRepostOfQuote`, `ProductionRepostQuoteListIntegration`, Bookmark `RepostQuoteUsesOneSourceDepth` fixture를 실제 A→B→C·A→B→C→D로 검증한다. C/B unavailable, Content Warning·Media와 단일 article·Action Bar·divider를 관찰한다.
- [ ] 1.3 B/C/각 Author/외부 URL의 pointer·keyboard 이동, padding 비이동, 중첩 Link 부재, B mutation·Reaction Summary target과 A Reply disabled를 실행 결과로 검증한다.
- [ ] 1.4 순수 Repost ID의 B 상세 replace redirect와 history, B 상세의 C preview·Reply 정책을 통합 검증한다. Home·Profile 및 기존 Quote·Reply+Quote 목록·상세·thread, 일반 `QuoteOfQuote` cutoff를 회귀 검증한다.
- [ ] 1.5 Relay 생성·typecheck·표적 Storybook·필요한 API/route integration과 Web Light·Dark·대표 좁은/넓은 viewport·긴 Content/Author·focus 검증 결과를 남긴다. Native touch·VoiceOver·TalkBack 미검증은 Native 출시 gate에 별도로 기록한다.

## Verification Evidence

- Result: pending. 구현과 제품 runtime 검증은 아직 수행하지 않았다.
- Checks: 구현 세션에서 최신 package scripts와 CI 구성을 확인하고, 표적 Storybook 및 부족한 route/API 실행 검증을 수행한다. 코드 문자열 검색은 동작 검증으로 사용하지 않는다.
- Limits: Storybook mock만으로 서버 Eligibility나 실제 replace history를 증명하지 않는다. 충분한 실행 증거가 이미 있으면 재사용하되 새 조합의 관찰 공백만 보강한다.

## Progress

- Status: Active
- Completed: 현재 Linear·canonical 범위와 renderer·fragment·fixture·route를 조사했다. 새 제품 결정은 없다.
- Next: 별도 구현 세션에서 1.1–1.5를 수행하고 실제 검증 증거를 기록한다. 각 항목의 완료는 해당 결과를 확인한 뒤 표시한다.
- Last updated: 2026-09-22
- 정리 메모: 범위 완료 후 가능하면 같은 구현 PR에서 `--skip-specs`로 archive한다. 하네스 정리는 제품 완료나 PR Ready의 gate가 아니다.
