## 1. PROD-940 최초 조회 오류 수명주기

**Authority / Provenance**

- `docs/design/figma.md`
- `docs/design/storybook.md`
- `PROD-940`

**Deliverable**

실제 `/follow-requests` 최초 조회 실패가 skeleton과 persistent Danger Toast를 표시하고, 같은 query 재시도와 화면·actor 수명주기에 맞춰 정리된다.

**Guardrails**

- 승인·거절 행, pagination, GraphQL document, API·권한과 Relay cache 계약을 변경하지 않는다.
- loading skeleton의 시각 표현은 재사용하되 initial error에서는 loading 중이라는 접근성 announcement를 남기지 않는다.
- 오류 surface가 만든 Toast만 정리하고 다른 Toast를 전역 dismiss하지 않는다.

**Verification**

- 실제 route를 렌더링해 최초 실패, persistent 오류·retry, 재실패·성공, 연속 입력, route 이탈과 actor 전환 결과를 확인한다.
- 기존 empty/content, row와 pagination story·test가 유지되는지 확인한다.

- [x] 1.1 최초 조회 오류의 skeleton·Toast·retry·scoped cleanup 동작을 구현하고 중앙 error state를 제거한다.
- [x] 1.2 loading과 initial error의 접근성 announcement를 구분한다.

## 2. PROD-940 직접 회귀 검증과 문서 정렬

**Authority / Provenance**

- `docs/design/figma.md`
- `docs/design/storybook.md`
- `docs/design/accessibility.md`
- `PROD-940`

**Deliverable**

production route의 변경 동작을 최소 자동화 검증과 상태 catalog로 증명하고 canonical 디자인 기록을 현재 구현에 맞춘다.

**Guardrails**

- 테스트 코드 범위: 가장 가까운 route test, Follow Requests screen Tests story, 기존 Web route E2E의 최초 오류 수명주기 한 영역.
- 테스트 필요성: skeleton 유지, 오류·retry 접근성, retry 성공·재실패·중복 방지, route·actor cleanup이라는 승인 동작을 직접 증명한다.
- 테스트 제외 범위: row mutation·pagination coverage 확대, 중복 조합, snapshot, 새 공용 fixture·helper·harness, 테스트 인프라 변경.
- Playground는 수동 Controls용으로 유지하고 자동 interaction은 Controls가 꺼진 `*.tests.stories.tsx`에서 실행한다.

**Verification**

- 관련 Node route test와 Storybook interaction test를 실행한다.
- app typecheck·lint와 Storybook static build를 실행한다.
- Web 실제 route를 확인하고 실행하지 못한 Android/iOS runtime 항목을 기록한다.

- [x] 2.1 실제 production screen의 initial error catalog와 Tests story를 정렬한다.
- [x] 2.2 route 단위 테스트와 기존 Web E2E에서 승인된 수명주기를 최소 범위로 검증한다.
- [x] 2.3 `docs/design/figma.md`의 Current/Target 기록을 구현 결과에 맞춘다.
- [x] 2.4 관련 자동 검증과 Web 수동 QA를 완료하고 미실행 Native 항목을 기록한다.
