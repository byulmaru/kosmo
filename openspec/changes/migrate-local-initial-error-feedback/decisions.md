## Context

PROD-939와 canonical Figma의 플랫폼별 최초 오류 Target을 Local route에 이관하되, PROD-864가 확정한 후속
조회 동작과 공용 Relay·Toast 경계를 유지한다.

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

### 최초 오류 이관은 성공 이력 없는 조회에만 적용한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/local-timeline.md`, `PROD-939`
- Status: Active
- Context / Problem: Local의 한 RouteBoundary가 최초 조회와 성공 뒤 후속 조회 오류를 함께 처리하므로 오류 UI를 일괄 교체하면 제외 범위가 바뀐다.
- Decision Outcome: 새 플랫폼별 fallback과 persistent Toast는 현재 route·actor에 성공한 Local 조회가 없는 오류에만 적용한다. 빈 connection이나 Relay cache 결과라도 route에서 성공적으로 렌더되면 성공 이력으로 간주하고, 이후 후속 오류와 pagination은 기존 경로를 유지한다.
- Alternatives Considered: Local의 모든 오류를 persistent Toast로 통일하는 안은 새로고침 단순화와 pagination 계약을 다시 열어 제외했다.
- Consequences: 구현은 최초 성공 여부를 구분하되 Relay connection, fetch policy와 pagination을 변경하지 않는다.
- Confirmation / Follow-up: 최초 재시도와 성공 뒤 후속 오류를 서로 다른 검증으로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
