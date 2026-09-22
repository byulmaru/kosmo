## Session Work

현재 구현 담당은 PROD-557이다. 아래 목록은 승인된 결과를 달성하기 위한 작업 메모이며 구현하면서 줄이거나 수정할 수 있다.

- [x] 1.1 최신 canonical·Linear, PROD-819·820·795 결과와 현재 웹 adapter·session API를 확인하고 실제 PostHog 검증 환경을 정한다.
- [x] 1.2 대상별 journey의 시작·중복 제거·성공 판정·30분 및 종료 경계를 구현하고 fake clock으로 입력·출력·상태 변화를 검증하는 코드를 작성한다. 실행 결과는 1.5에서 확인한다. 시작·조회·Follow event schema와 fixture의 귀속 속성은 `search_profile_journey_id`로 통일한다.
- [x] 1.3 검색 선택에서 Profile 표시·Follow 완료까지 같은 맥락과 대상이 전달되도록 연결한다. 조회 실패, Request, optimistic 상태, 다른 대상·늦은 응답은 성공에서 제외하고 재선택·뒤로가기·새 탭·reload 검증 코드를 작성한다. 실행은 1.5에 남긴다.
- [x] 1.4 Account·선택 Profile·인증 상태·PostHog session 변경을 귀속 종료에 연결한다. 기존 SDK identity·표준 metadata·fail-open·Native no-op을 유지하고 `search_profile_journey_id`가 Account·Profile·검색어에서 파생하지 않은 opaque 값인지, custom payload에 금지 속성이 없는지 검사하는 테스트를 작성한다. 실행은 1.5에 남긴다.
- [ ] 1.5 GitHub CI 최신 PR head에서 관련 단위·Storybook·웹 통합 테스트와 Relay/typecheck/lint를 확인한다. 실제 UI 표시·mutation 응답·전송 payload로 실패·중복·시간 경계를 증명한다.
- [x] 1.6 HogQL canonical 집계에서 distinct `search_profile_journey_id` 기준으로 분모·전체·Profile 조회·Follow 분자를 계산한다. design의 6개 journey fixture를 집계한 결과가 정확히 `6 / 4 / 3 / 2`를 재현해야 acceptance를 충족한다. 30분 포함·시작일·Asia/Seoul·잠정치·분모 0과 추가 경계 fixture를 검증한다. PostHog Funnel·dashboard는 필요한 경우 시각화·교차검증에 사용한다.
- [x] 1.7 구현·검증 결과, HogQL query·기대값·실제값·결과 URL·환경·시각·남은 책임과 사용한 보조 시각화의 설정·URL을 PR 또는 handoff에 남긴다. 필요하면 사용한 하네스를 같은 구현 PR에서 `--skip-specs`로 정리한다.

## Verification Evidence

- Result: HogQL pass, 앱 동작 테스트는 GitHub CI pending.
- Checks: `docs/analytics/search-conversion/README.md`의 실제 Kosmo PostHog 결과·저장 insight·재현 명령 참조. acceptance 6 / 4 / 3 / 2, 추가 경계·provisional·no_data 모두 기대값 일치. Relay compiler·TypeScript·ESLint·Prettier 정적 검증을 수행한다.
- Limits: 로컬에서 unit·Storybook·E2E는 실행하지 않는다. 명시 호출한 Implement workflow에 따라 Draft PR을 전달하고 Test가 최신 head의 필수 CI를 확인한다. PROD-575 공통 production acceptance와 PROD-741 Replay 검증은 별도 책임이다.

## Progress

- Status: Implementation prepared for CI verification.
- Completed: journey 상태·이벤트·실제 UI/Follow 응답·종료 경계 구현과 테스트 코드, canonical HogQL과 실제 fixture 검증.
- Next: Test workflow가 Draft PR 최신 head의 `Test (App)`, `Lint`, 기존 `Web E2E`를 확인하고 실패를 수정한다. 실행 검증이 남아 있어 하네스 archive는 이 단계에서 하지 않는다.
- Last updated: 2026-09-22
