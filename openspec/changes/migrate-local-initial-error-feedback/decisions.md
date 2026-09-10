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
- Consequences: refresh 요청의 hard error를 명시적으로 관찰하고, 중복 요청·성공·재실패·route·actor lifecycle을 관리한다.
- Confirmation / Follow-up: Storybook의 실제 Relay refresh 흐름과 Web 시각·상호작용으로 검증하고 Native runtime 미실행을 별도로 기록한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

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
