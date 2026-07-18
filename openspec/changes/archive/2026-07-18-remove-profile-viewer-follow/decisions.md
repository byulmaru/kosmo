## Context

이 기록은 PROD-378의 공개 GraphQL 중복 제거 범위, `profile`·`web-app-shell` delta spec, 현재 resolver 및 first-party Relay 소비자 조사와 byulmaru GitHub 조직 전체 코드 검색 결과를 반영한다.

## Decision Records

### `Profile.viewerState.follow`를 canonical viewer follow 계약으로 사용한다

- Decision Date: 2026-07-18
- Status: Accepted
- Context / Problem: `Profile.viewerFollow`와 `Profile.viewerState.follow`가 같은 loader 결과를 반환하면서 하나의 관계를 두 GraphQL field와 Relay cache slot로 표현한다.
- Decision Outcome: viewer-relative established `ProfileFollow`는 `Profile.viewerState.follow`로만 노출한다. `isSelf`와 follow 관계를 함께 소비하는 현재 first-party UI shape를 유지하면서 중복 cache 갱신을 제거할 수 있기 때문이다.
- Alternatives Considered: `Profile.viewerFollow`를 canonical field로 되돌리는 방안은 현재 production fragment와 active profile 전환 계약을 다시 바꾸고 viewer-relative 상태 묶음을 해체하므로 선택하지 않았다. 두 필드를 계속 유지하는 방안은 PROD-378의 중복 제거 결과를 달성하지 못한다.
- Consequences: API schema, 통합 테스트, Relay artifact, active spec과 follow 관련 active change는 `viewerState.follow`만 사용해야 한다. loader와 follow 접근 정책은 그대로 재사용한다.
- Confirmation / Follow-up: 전체 저장소 검색, API/App 검증과 active profile 전환 E2E로 확인한다.

### `Profile.viewerFollow`를 deprecation 기간 없이 제거한다

- Decision Date: 2026-07-18
- Status: Accepted
- Context / Problem: 공개 GraphQL 필드 제거는 외부 소비자가 있으면 단계적 migration이 필요하지만, 현재 확인 가능한 소비자 범위를 먼저 판단해야 한다.
- Decision Outcome: `Profile.viewerFollow`를 deprecated 상태로 남기지 않고 이번 변경에서 제거한다. first-party production operation은 이미 `viewerState.follow`만 사용하고, byulmaru GitHub 조직 전체 코드 검색에서도 현재 저장소 외부 소비자가 확인되지 않았다.
- Alternatives Considered: deprecated field를 일정 기간 유지하는 방안은 확인된 migration 대상 없이 중복 계약과 cache slot을 계속 유지하므로 선택하지 않았다.
- Consequences: 확인되지 않은 외부 GraphQL 소비자에게는 breaking change다. 호환성 요구가 뒤늦게 확인되면 동일 loader를 사용하는 field resolver를 복구할 수 있으며 DB migration은 필요하지 않다.
- Confirmation / Follow-up: schema에서 필드가 제거되고 first-party Relay compilation과 테스트가 통과하는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
