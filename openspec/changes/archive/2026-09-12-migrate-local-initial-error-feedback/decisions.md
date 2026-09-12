## Context

PROD-939와 canonical Figma의 플랫폼별 최초 오류 및 refresh error Target을 Local route에 이관하되, partial
response·pagination 동작과 공용 Relay·Toast 경계를 유지한다.

## Decision Records

### 최초 오류 배경은 Web과 Native를 구분한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/local-timeline.md`, Figma Mobile `4665:4855`, Figma Web `5560:13625`, `PROD-939`
- Status: Active
- Context / Problem: 기존 PROD-939 본문은 2행 skeleton을 모든 플랫폼에 적용하는 것처럼 적어 Web의 빈 목록 Target과 충돌했다.
- Decision Outcome: 저장된 성공 목록이 없는 최초 오류에서 Web은 빈 목록 영역, Android/iOS Native는 공통으로 Figma Android baseline의 2행 skeleton을 표시하고 두 플랫폼군 모두 공용 persistent Danger Toast를 사용한다.
- Alternatives Considered: 모든 플랫폼에 skeleton을 표시하는 안과 모든 플랫폼을 빈 영역으로 두는 안은 각각 Web 또는 Native Figma Target과 달라 제외했다.
- Consequences: 공용 route 안에서 오류 배경만 플랫폼별로 렌더하며 Toast 문구·action·lifecycle은 공유한다.
- Confirmation / Follow-up: Web Storybook·runtime과 Native code path를 검증하고 Android/iOS runtime 미실행 여부를 별도로 기록한다.

### 성공 목록 뒤 hard refresh 오류는 목록과 persistent retry Toast를 함께 유지한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: Figma Mobile `6576:8485`, `PROD-939`, 사용자 승인
- Status: Active
- Context / Problem: `store-and-network` hard refresh 실패는 cache 목록을 유지하지만 오류 피드백을 표시하지 않아 Figma Target과 달랐다.
- Decision Outcome: 성공 목록 뒤 hard refresh 오류는 Web과 Native에서 마지막 성공 목록을 유지하고, 최초 오류와 같은 문구·action의 공용 persistent Danger Toast를 표시한다.
- Alternatives Considered: Toast 없음은 Figma Target과 달라 제외했다. 자동 소멸 Toast는 사용자가 허용 가능한 최소안으로 제안했지만 복구 action이 유지되는 동안 지속되는 canonical Figma 계약을 우선했다.
- Consequences: refresh 요청의 hard error를 명시적으로 관찰하고, 성공·재실패·route·actor lifecycle을 관리한다.
- Confirmation / Follow-up: Storybook의 실제 Relay refresh 흐름과 Web 시각·상호작용으로 검증하고 Native runtime 미실행을 별도로 기록한다.

### 목록은 유지하고 refetch 오류 경계만 분리한다

- Decision Date: 2026-09-12
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/local-timeline.md`, `PROD-939`, 답글 초안 손실 재현과 사용자 구조 변경 승인
- Status: Active
- Context / Problem: refetch 오류의 fallback이 동일 cache 목록을 다시 렌더해도 목록 subtree는 재마운트되어 작성 중인 답글이 폐기된다. Toast 상태만 바꾸는 안과 `store-only` 복귀안도 모든 오류 타이밍에서 이를 막지 못했다.
- Decision Outcome: 목록은 경계 밖에서 최초 query의 fragment ref를 `useFragment`로 계속 읽는다. 공용 `RelayFailOpenBoundary` 안에는 refetch hook과 refresh token을 소비하는 작은 컴포넌트만 두고, fallback은 persistent retry Toast만 표시한다. `onComplete(error)`는 공용 경계로 전달하고 재시도는 기존 refresh token으로 경계를 reset한다.
- Telemetry: 예상된 Local hard refresh 오류의 unexpected-error reporting 비활성화와 공용 경계의 기본 정책은 유지한다.
- Alternatives Considered: 목록을 포함하는 fallback은 초안 손실을 재현했다. `store-only` 복귀안은 비동기 Web E2E를 통과했지만 동기 Observable 오류에서 DOM 보존에 실패했다. 별도 초안 저장·복원이나 요청 중복 제어·Disposable 저장·명령형 refetch 등록은 필요하지 않아 추가하지 않는다.
- Consequences: 이전 전용 controller 제거 방향 중 오류를 격리하기 위한 최소 컴포넌트 분리는 허용한다. 요청과 query reference lifecycle은 Relay가, Toast lifetime은 fallback effect가 소유하며 목록은 유지한다.
- Confirmation / Follow-up: 동기 오류 probe의 DOM 보존, 기존 Storybook retry·actor cleanup과 실제 Web 답글 draft·focus E2E를 재검증한다. Native runtime 미실행은 별도로 기록한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

### Local refresh는 refetchable fragment hook과 공용 fail-open boundary를 사용한다

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: 활성 Derived Contract 2번째 기록, Relay `useRefetchableFragment` lifecycle
- Status: Superseded
- Context / Problem: Local hard refresh의 성공 목록은 유지하면서 refetch 오류를 공용 경계의 fail-open fallback과 연결하고, Relay가 `onComplete(error)`로만 전달하는 transport error도 표시해야 한다.
- Decision Outcome: 기존 Session fail-open boundary를 공용 `RelayFailOpenBoundary`로 추출한다. Local query는 `LocalContent_query` refetchable fragment를 사용하고, 성공 child는 `useRefetchableFragment`의 data를 직접 읽는다. 이 child만 공용 경계 안에 두며, transport error의 `onComplete` callback은 요청 상태를 저장하지 않고 오류를 이 경계로 전달한다. fallback은 최초 query의 fragment ref를 `useFragment`로 읽고 persistent retry Toast를 연다. refresh token은 boundary reset과 hook refetch를 연결하고, 요청·in-flight·Disposable·완료 상태는 별도로 저장하지 않는다.
- Telemetry: Local hard refresh는 기존 사용자 복구 경로와 같이 예상된 오류로 취급해 unexpected-error reporter에 보고하지 않는다. 공용 boundary의 기본 unexpected-error reporting은 유지하되 Local에서만 끈다.
- Alternatives Considered: 별도 `fetchQuery` Observable과 Disposable 저장은 기존 Relay hook과 공용 boundary lifecycle을 우회하므로 제외했다.
- Consequences: refetch 요청과 unmount 정리는 Relay hook과 boundary가 담당하고, Toast lifecycle은 fallback effect만 관리한다. Toast 재시도는 refresh token을 증가시켜 boundary를 reset한 뒤 같은 hook refetch를 다시 시작한다.
- Confirmation / Follow-up: 2026-09-12 답글 초안 손실을 재현해 위의 목록 보존·refetch 경계 분리 결정으로 대체했다.

### 최초 오류 이관은 성공 이력 없는 조회에만 적용한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/local-timeline.md`, `PROD-939`
- Status: Superseded
- Context / Problem: Local의 한 RouteBoundary가 최초 조회와 성공 뒤 후속 조회 오류를 함께 처리하므로 오류 UI를 일괄 교체하면 제외 범위가 바뀐다.
- Decision Outcome: 새 플랫폼별 fallback과 persistent Toast는 현재 route·actor에 성공한 Local 조회가 없는 오류에만 적용한다. 빈 connection이나 Relay cache 결과라도 route에서 성공적으로 렌더되면 성공 이력으로 간주하고, 이후 후속 오류와 pagination은 기존 경로를 유지한다.
- Alternatives Considered: Local의 모든 오류를 persistent Toast로 통일하는 안은 당시 새로고침 단순화와 pagination 계약을 다시 열어 제외했다.
- Consequences: 구현은 최초 성공 여부를 구분하되 Relay connection, fetch policy와 pagination을 변경하지 않는다.
- Confirmation / Follow-up: Figma Mobile `6576:8485`와 사용자 승인으로 hard refresh 오류까지 포함하도록 대체되었다. Pagination 제외는 유지한다.
