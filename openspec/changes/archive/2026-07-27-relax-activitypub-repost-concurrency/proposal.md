## Why

PROD-495의 current-activity Repost 구현은 드문 Announce/Undo 교차 경합까지 보존하기 위해 `activitypub_post` row를 명시적으로 잠근다. 사용자는 소셜 Repost 수신에서 이 강한 보장보다 단순한 무잠금 처리를 선택했고, Hackers’ Pub도 Announce/Undo 교차를 같은 lock protocol로 직렬화하지 않는다는 조사 결과를 확인했다.

## What Changes

- 순차 Announce replacement와 exact current-generation Undo 계약은 유지한다.
- 동일 Announce의 personal/shared duplicate는 기존 unique constraint와 멱등 Repost action으로 하나의 Repost에 수렴시킨다.
- Announce current identity 교체와 Undo 삭제 사이의 명시적 row/advisory lock 및 serializable retry를 사용하지 않는다.
- 두 delivery가 동시에 겹치면 새 Announce가 Active Repost를 남기지 못할 수 있으며, 후속 유효 Announce delivery로 수렴하는 제한을 명시한다.
- outbound Announce, Quote·nested Repost, GraphQL/UI와 schema migration은 추가하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`
- Linear Contract: PROD-495
- Linear Implementations: 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `activitypub-remote-repost`: 순차 current-generation 안전성은 유지하되 Announce/Undo 교차 경합의 강한 보존 보장을 제거한다.

## Impact

- `packages/fedify`: Announce mapping 조회와 Undo 조회의 명시적 `FOR UPDATE` 제거
- 테스트: concurrent Announce/Undo 강보장 assertion 제거, 순차 generation과 duplicate 수렴 검증 유지
- OpenSpec: 기존 row-lock 구현 결정을 supersede하고 허용되는 경합 결과를 active spec에 반영
- PostgreSQL/Drizzle: 새 table, column, index 또는 migration 없음
