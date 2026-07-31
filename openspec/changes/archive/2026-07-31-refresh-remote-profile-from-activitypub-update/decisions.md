## Context

PROD-607과 canonical Profile/Follow 계약에 따라 inbound actor Update가 저장 remote profile 정책을 즉시
갱신하는 범위를 기록한다. 제안과 delta spec의 행동 계약 및 design의 기존 materialization 재사용 접근을
반영한다.

## Decision Records

### Update는 저장된 동일 remote actor만 갱신한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`,
  `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `PROD-607`
- Status: Active
- Context / Problem: actor Update를 remote actor discovery로도 사용하면 검증된 handle lookup 없이 profile을
  만들거나 기존 identity를 재연결할 수 있다.
- Decision Outcome: Update actor, embedded actor object와 저장된 ActivityPub actor identity가 모두 같을 때만
  기존 remote profile을 갱신하고, 저장 actor가 없으면 무시한다.
- Alternatives Considered: Update만으로 새 actor materialization, object URL을 추가 fetch해 actor를 생성.
- Consequences: unknown actor Update는 저장 상태를 만들지 않으며, actor discovery는 기존 WebFinger 기반
  materialization이 계속 소유한다.
- Confirmation / Follow-up: mismatch, unsupported object, local collision과 unknown actor 테스트로 확인한다.

### 검증된 embedded actor를 기존 materialization refresh 경계에 적용한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-607`
- Status: Active
- Context / Problem: Update 전용 profile projection과 endpoint 저장 로직을 별도로 구현하면 handle, timestamp,
  collision 및 transaction 규칙이 기존 materialization과 갈라질 수 있다.
- Decision Outcome: embedded actor는 네트워크 lookup 없이 검증하고, 검증이 끝난 actor를 기존
  materialization의 기존-actor refresh 경계에 전달해 TTL을 우회한다.
- Alternatives Considered: Update handler에 별도 update query 구현, materialization transaction의 공용 helper
  추출. 공용 helper 추출도 같은 규칙을 공유한다면 허용되지만 현재 범위에는 호출 경계 재사용이 더 작다.
- Consequences: projection, endpoint, `lastFetchedAt`, stale ordering과 충돌 처리가 하나의 구현 경계를 유지한다.
- Confirmation / Follow-up: 양방향 follow policy, endpoint, timestamp와 중복 Update 테스트로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
