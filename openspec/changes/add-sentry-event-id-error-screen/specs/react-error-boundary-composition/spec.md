## MODIFIED Requirements

### Requirement: 기존 fallback과 reset 동작 보존

**Authority / Provenance:** `memory/frontend-react-native.md`, PROD-477, PROD-480, PROD-513 — GraphQL 경계와 route 경계는 validation·권한·의도된 GraphQL/domain 오류와 재시도 가능한 network·transport 오류의 기존 한국어 inline 또는 route-local 복구 동작을 보존해야 한다(MUST). 현재 화면을 계속 렌더링할 수 없게 만드는 예상하지 못한 client 오류에는 공용 전용 오류 화면을 렌더링하고 현재 platform reporter의 event ID 결과를 연결해야 한다(MUST). retry는 경계 오류 상태와 해당 오류의 event ID·복사 상태를 reset한 뒤 소유자의 재조회 callback을 정확히 한 번 호출해야 한다(MUST). Session fail-open 경계는 오류 시 지정된 fallback을 표시하고 reset key가 바뀌면 자식 렌더링을 다시 시도해야 한다(MUST).

#### Scenario: 예상된 GraphQL 또는 network 오류

- **WHEN** GraphQL·route 흐름이 validation·권한·의도된 GraphQL/domain 오류 또는 재시도 가능한 network·transport 오류를 받는다
- **THEN** 가장 가까운 기존 inline 또는 route-local fallback과 재시도 동작을 유지한다
- **AND** 전용 오류 화면과 사용자용 Sentry event ID로 승격하지 않는다

#### Scenario: 예상하지 못한 GraphQL 또는 route render 오류

- **WHEN** GraphQL 또는 route 경계 아래의 예상하지 못한 client render 오류가 현재 화면 렌더링을 중단한다
- **THEN** 경계는 공용 전용 오류 화면을 렌더링한다
- **AND** 현재 platform reporter가 반환한 event ID가 있을 때만 같은 오류 발생 건의 추적 ID로 연결한다

#### Scenario: GraphQL 또는 route 재시도

- **WHEN** 오류 fallback에서 사용자가 다시 시도 action을 실행한다
- **THEN** 경계는 포착한 오류와 해당 오류의 event ID·복사 상태를 reset하고 제공된 retry callback을 정확히 한 번 호출한다

#### Scenario: Session reset key 변경

- **WHEN** session 자식의 오류로 fail-open fallback이 표시된 뒤 reset key가 변경된다
- **THEN** 경계는 오류 상태를 reset하고 session 자식 렌더링을 다시 시도한다

#### Scenario: reset 뒤 오류 재발

- **WHEN** reset 뒤 자식 렌더링에서 예상하지 못한 오류가 다시 발생한다
- **THEN** 경계는 이전 event ID를 재사용하지 않고 새 오류 발생 건으로 처리한다
