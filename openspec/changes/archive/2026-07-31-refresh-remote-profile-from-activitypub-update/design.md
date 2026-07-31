## Context

현재 `packages/fedify`는 remote actor를 WebFinger/Fedify lookup으로 materialize하고, 같은 actor URI가 이미
저장돼 있으면 profile projection과 endpoint metadata를 갱신한다. 그러나 inbox listener는 `Update`를 등록하지
않으므로 actor가 정책을 바꿔도 7일 stale refresh 전까지 저장값이 바뀌지 않는다.

canonical Profile 계약과 PROD-607은 inbound Update가 새 actor discovery 수단이 아니라 이미 저장된 remote actor의
즉시 refresh 신호가 되도록 제한한다.

## Goals / Non-Goals

**Goals:**

- embedded actor Update의 actor/object/storage identity를 검증한다.
- 검증 뒤 기존 materialization의 projection, endpoint metadata와 ordering 경계를 재사용한다.
- Follow policy 양방향 전이와 기존 Follow/Accept 상태 머신의 연결을 검증한다.

**Non-Goals:**

- Update만으로 미등록 actor를 새로 materialize하지 않는다.
- established relation 복구·역전, Note Update/Delete, local outbound actor Update는 다루지 않는다.
- DB나 GraphQL schema를 바꾸지 않는다.

## Implementation Guidance

### Current Constraints

- remote actor materialization은 handle lookup, identity 충돌 검증, profile/metadata transaction을 하나의 공개
  함수에 묶고 있다.
- inbox Update의 embedded object를 일반 document loader로 해석하면 검증 전에 추가 네트워크 lookup이 일어나거나
  activity object URI와 다른 객체를 가져올 수 있다.
- Follow mutation과 Accept handler는 저장된 `followPolicy` 및 기존 request/relation 서비스를 이미 권위로
  사용하므로 별도 상태 머신을 추가하면 중복 계약이 된다.

### Recommended Approach

Update handler는 단일 HTTP(S) actor identity와 embedded actor object를 네트워크 lookup 없이 읽고, actor URI와
object URI 및 embedded object ID가 모두 같은지 확인한다. 저장된 ActivityPub remote actor가 있을 때만 그
profile의 기존 handle을 입력으로 materialization refresh 경계를 직접 호출하되 lookup 결과는 검증된 embedded
actor로 고정한다. 이렇게 하면 TTL을 우회하면서 projection, endpoint, lastFetchedAt, identity collision과
transaction ordering을 중복 구현하지 않는다.

listener에 actor `Update`를 등록하고 handler 단위 테스트로 거부/멱등/양방향 projection을 검증한다. 기존 remote
Follow 및 Accept 통합 테스트가 최신 저장 policy를 소비하는 경계를 회귀 검증한다.

### Allowed Alternatives

materialization의 기존-actor update transaction을 별도 공용 함수로 추출해 handler에서 호출해도 된다. 다만
handle lookup 경로와 Update 경로가 projection, endpoint 및 timestamp 규칙을 공유해야 한다.

### Known Traps

- actor/object ID 중 하나만 검사하거나 `getObject()`가 원격 문서를 가져오도록 두지 않는다.
- Update를 미등록 actor materialization 또는 handle 재연결 근거로 사용하지 않는다.
- policy 변경 시 기존 relation/request/count를 직접 수정하지 않는다.

## Risks / Trade-offs

- [embedded actor를 요구하면 object URL만 가진 Update를 무시할 수 있음] → PROD-607의 검증 가능한 identity와
  네트워크 비의존 경계를 우선하고, 별도 fetch 계약이 필요하면 후속 이슈에서 정의한다.
- [기존 materialization 재호출이 instance 상태도 갱신할 수 있음] → 저장 actor와 canonical identity를 먼저
  검증하고 기존 remote refresh 규칙만 적용한다.

## Migration Plan

schema migration 없이 listener와 handler를 배포한다. rollback은 listener 등록을 제거하면 되며 기존 저장
profile과 관계 데이터는 그대로 유지된다.

## Open Questions

없음.
