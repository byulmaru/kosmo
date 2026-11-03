## Session Work

담당 이슈는 PROD-1162다. 아래 항목은 다음 구현·검증 세션의 미완료 작업이며, 현재 사용자 결정과 Linear 범위 안에서 수정할 수 있다.

- [x] 1.1 상단 홈·로컬 현재 탭의 활성화를 실제 Web document와 Native 목록의 맨 위 이동에 연결한다. 상단 탭에서 새로고침을 호출하는 연결은 제거한다.
- [ ] 1.2 실제 상단 탭 활성화 경로를 실행해 홈·로컬의 스크롤 결과, route 유지와 추가 타임라인 조회가 없는지 검증한다. 연속 입력과 다른 경로의 새로고침 진행 중 입력도 포함한다.
- [ ] 1.3 비활성 탭 전환, shell·브랜드 마크 재선택, Native pull-to-refresh, 실패·재시도·페이지 읽기와 Profile별 데이터 분리의 기존 동작을 회귀 확인하고 현재 PR head의 필수 CI 결과를 기록한다.
- [ ] 1.4 Web pointer·keyboard, iOS·Android Native runtime에서 홈·로컬 각각의 맨 위 이동을 확인한다. 실행한 환경·입력 방식과 남은 실기기·보조 기술 검증을 구분해 기록한다.

## Verification Evidence

- Result: 제품 테스트와 runtime 검증은 미실행이다.
- Checks: `94571e29f6a1967943ff548b99325429a44fac8a`의 상단 탭·route·scroll·refresh 경로를 조사했고, 변경한 PROD-1162 본문을 재조회했다.
- Limits: 최초 제보 환경은 아직 확인하지 않았다. 소스 조사와 문서 검증만으로 실제 Web·Native 동작을 검증했다고 볼 수 없다.

## Progress

- Status: Active
- Completed: 사용자 결정 확정, Linear 반영·재조회, 기존 구현과 계약 조사.
- Next: 상단 탭 스크롤 전용 동작 구현과 위 검증.
- Last updated: 2026-10-22

## Implement Checkpoint · 2026-10-22

- Implementation: shared top-tab scroll-only wiring; Local top-tab refresh callback removed.
- Static validation: Prettier, ESLint, App/Web TypeScript, strict OpenSpec validation and git diff checks passed.
- Test code: real top-tab activation with Native list refs and Relay request counts; Web pointer/Enter/Space at 390px and 1440px; existing refresh E2E triggers repaired.
- Product tests: not run locally; GitHub CI Test (App), Web E2E shards and Lint pending.
- Runtime: Web manual, iOS, Android and assistive technology not run. Native host-ref tests are not device evidence.
- Review: source correctness and test evidence checked independently; one stale compose E2E trigger repaired; no remaining confirmed findings.
- Remaining tasks: 1.2 and 1.3 require CI results; 1.4 requires runtime evidence.
