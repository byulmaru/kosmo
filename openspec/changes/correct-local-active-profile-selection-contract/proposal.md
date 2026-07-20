## Why

현재 active profile 선택 계약은 계정에 연결된 remote profile도 사용자의 행동 주체로 선택할 수 있다고 기술한다. 그러나 운영 코드에서 계정에 연결되는 profile은 configured local instance에 생성된 local profile뿐이므로, PROD-375에서 실제 제품 동작을 바꾸지 않고 계약 문구를 local-only 모델에 맞게 정정한다.

## What Changes

- active profile 선택 requirement의 대상을 정상 제품 경로에서 계정에 연결되는 활성 local profile로 명확히 한다.
- 도달 불가능한 owned remote profile 선택 성공 시나리오를 계약에서 제거한다.
- canonical profile spec과 아직 active인 actor-discovery delta의 겹치는 requirement를 동일한 최종 계약으로 동기화한다.
- actor-discovery proposal, design, tasks에서 remote profile 선택·session restore를 현재 capability나 verification 대상으로 요구하는 문구를 제거한다.
- GraphQL resolver와 integration test를 포함한 런타임 동작은 변경하지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile`: active profile 선택 requirement에서 실제 제품 경로에 없는 remote profile 선택 보장을 제거하고 local-only 모델을 명확히 한다.

## Impact

- `openspec/specs/profile/spec.md`
- `openspec/changes/add-activitypub-actor-discovery`의 proposal, design, tasks와 profile delta spec
- GraphQL schema, resolver, test, DB와 외부 dependency에는 변화가 없다.
