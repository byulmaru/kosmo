## Context

PROD-512의 정정된 direct delivery 계약, canonical core/Post 문서와 현재 Fedify 2.3 queue 없는 실행 경계를
반영한다.

## Decision Records

### 현재 Local Post direct delivery는 ordering key를 사용하지 않는다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-512
- Status: Active
- Context / Problem: queue 없는 Fedify direct delivery는 ordering key를 소비하지 않고 recipient 요청을 병렬
  실행하지만 기존 dispatcher 계약은 stable ordering key를 필수 입력으로 두었다.
- Decision Outcome: Local Post dispatcher와 Fedify direct delivery options에서 ordering key를 제거하고 현재
  Create/Delete 전달 순서를 보장하지 않는다. stable activity ID는 그대로 유지한다.
- Alternatives Considered: 효과 없는 ordering key 유지, 이번 change에서 queue 선행 도입, application process
  내부 mutex로 순서 직렬화.
- Consequences: dispatcher 인터페이스가 현재 동작만 표현한다. 향후 ordering은 PROD-448에서 실제 queue와 함께
  다시 설계해야 한다.
- Confirmation / Follow-up: Local Post Create/Delete와 dispatcher 테스트에서 ordering option 부재와 stable
  activity ID 유지를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- archive된 `dispatch-activitypub-local-posts` change의 “Activity identity와 ordering은 canonical Note URI에서
  파생한다” 결정 중 ordering 부분은 정정된 PROD-512 계약에 의해 대체된다. stable activity identity 부분은
  유지한다.
