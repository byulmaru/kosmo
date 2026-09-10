## 1. PROD-939 Local 최초 오류의 플랫폼별 피드백

**Authority / Provenance**

- `docs/design/local-timeline.md`
- `docs/design/accessibility.md`
- Figma Mobile `4665:4855`
- Figma Web `5560:13625`
- `PROD-939`

**Deliverable**

저장된 성공 목록이 없는 Local 최초 조회 실패에서 Web은 빈 목록 영역을, Native는 2행 skeleton을 표시하고
두 플랫폼 모두 중복 없이 재시도할 수 있는 persistent Danger Toast를 제공한다.

**Guardrails**

- section 2의 hard refresh 오류를 제외한 부분 GraphQL 응답과 pagination 동작을 변경하지 않는다.
- route 이탈과 selected Profile 전환 뒤 이전 Toast나 retry action을 남기지 않는다.
- 공용 RouteBoundary·Toast·Skeleton과 기존 Relay actor/store 격리를 재사용한다.
- Home과 다른 목록의 오류 presentation, Figma source와 dependency를 변경하지 않는다.

**Verification**

- Web과 Native 오류 배경, persistent alert/action semantics와 성공·재실패를 직접 검증한다.
- 연속 action 입력이 한 요청만 만들고 route·actor lifetime 종료가 이전 Toast를 제거하는지 검증한다.
- 기존 Local 부분 응답·pagination 검증과 Home 관련 check가 유지되는지 확인한다.
- Web의 mobile/full viewport에서 Toast 배치·focus·announcement를 확인하고 Android/iOS runtime 미실행 항목을 구분해 기록한다.

**Test code scope**

- `apps/app/src/components/ui/ToastProvider.test.ts`: exit motion 중 action 연속 실행의 단일 callback 계약
- `apps/app/src/stories/screens/Local.stories.tsx`, `Local.tests.stories.tsx`: 플랫폼별 최초 오류와 retry lifecycle
- `apps/web/e2e/timelines.e2e.ts`: Web 최초 오류의 빈 목록·persistent Toast·retry 동작

**Test necessity / exclusions**

- 공용 Toast action guard의 분기와 Local error lifecycle은 회귀 시 중복 요청이나 stale action을 만들므로 최소 동작 테스트가 필요하다.
- Native 전용 신규 test harness, GraphQL/API/schema·pagination fixture 변경, source 문자열 검사는 추가하지 않는다.
- Android/iOS 실제 runtime은 현재 자동화 범위 밖으로 남기고 공용 code path 검증과 구분해 기록한다.

**Completion ownership**

- PROD-939 구현 범위가 Web 통합 검증, 미실행 Native 항목 기록과 이 OpenSpec change의 최종 archive 판단을 소유한다.

- [x] 1.1 플랫폼별 최초 오류 배경과 persistent retry Toast lifecycle을 구현한다.
- [x] 1.2 연속 action 입력이 중복 callback을 만들지 않도록 공용 Toast action 경계를 보강한다.
- [x] 1.3 최초 오류·재실패·성공·route 이탈·actor 전환과 기존 후속 조회 동작의 최소 회귀 검증을 추가한다.
- [x] 1.4 관련 test·typecheck·Storybook·OpenSpec strict validation과 Web 시각·상호작용 QA를 수행한다.
- [x] 1.5 디자인 문서의 Target을 구현·검증 결과에 맞춰 Current와 미실행 상태로 정렬한다.

## 2. PROD-939 Local hard refresh 오류 피드백

**Authority / Provenance**

- `docs/design/local-timeline.md`
- `docs/design/accessibility.md`
- Figma Mobile `6576:8485`
- `PROD-939`

**Deliverable**

성공 목록 뒤 Local hard refresh 실패에서 마지막 성공 목록을 유지하고, Web과 Native 모두 중복 없이 재시도할 수 있는 persistent Danger Toast를 제공한다.

**Guardrails**

- 최초 오류의 플랫폼별 배경, 부분 GraphQL 응답과 pagination 동작을 변경하지 않는다.
- 진행 중인 refresh를 중복 실행하지 않고 route·actor 전환 뒤 요청이나 Toast를 남기지 않는다.
- 기존 Relay query·environment와 공용 Toast를 재사용하고 새 abstraction이나 dependency를 추가하지 않는다.

**Verification**

- hard refresh 실패에서 기존 목록·persistent alert/action과 정확히 한 번의 retry를 검증한다.
- retry 성공·재실패와 route 이탈 cleanup을 검증하고 기존 partial response·pagination Story를 유지한다.
- Web mobile/full viewport에서 Figma 배치와 focus·announcement를 확인하고 Android/iOS runtime 미실행을 기록한다.

**Test code scope**

- `apps/app/src/stories/screens/Local.stories.tsx`, `Local.tests.stories.tsx`: 실제 Relay refresh hard error·retry lifecycle
- 기존 `apps/web/e2e/timelines.e2e.ts` 최초 오류 회귀 검증과 관련 check는 유지한다.

**Test necessity / exclusions**

- cache 목록을 유지하는 Relay hard error는 ErrorBoundary fallback과 다른 분기이므로 Storybook 동작 검증이 필요하다.
- Native 전용 신규 harness, GraphQL/API/schema·pagination fixture 변경, source 문자열 검사는 추가하지 않는다.

- [x] 2.1 PROD-939·OpenSpec에 hard refresh의 목록 보존·persistent retry 계약을 정렬한다.
- [x] 2.2 Local hard refresh 요청·Toast·retry·cleanup을 최소 경로로 구현한다.
- [x] 2.3 Storybook·관련 check와 Web 시각·상호작용 QA로 검증한다.
- [x] 2.4 디자인 문서·Draft PR 설명과 검증 기록을 최종 동작에 맞춘다.
