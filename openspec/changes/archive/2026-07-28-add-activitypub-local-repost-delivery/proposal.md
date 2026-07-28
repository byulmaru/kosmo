## Why

Kosmo의 Local Repost 생성과 취소는 domain transaction과 GraphQL mutation까지 구현되어 있지만 원격 ActivityPub follower에게 전달되지 않는다. PROD-494가 제공한 공통 Post identity를 재사용해 Repost를 안정적인 `Announce`와 정확한 `Undo`로 전달하되, 현재 direct-delivery 구조에서 외부 실패가 committed application 결과를 뒤집지 않게 한다.

## What Changes

- 최초 Local Repost 생성 뒤 Repost Post UUID에서 안정적인 ActivityPub `Announce` identity를 파생하고 Source Post의 canonical ActivityPub URI를 object로 전달한다.
- 최초 Repost Tombstone 전이 뒤 같은 원본 `Announce`를 가리키는 안정적인 `Undo`를 전달한다.
- Repost Visibility를 ActivityPub audience로 투영하고 행동 Local Profile의 established remote follower를 실제 recipient로 사용한다.
- Local/Remote Source identity는 PROD-494의 `packages/fedify` Post URI resolver를 재사용한다.
- domain transaction commit 뒤 Fedify로 직접 전달하고 delivery 실패는 관측하되 committed Repost 생성·취소와 GraphQL payload를 실패로 바꾸지 않는다.
- 반복·동시 application action은 새 delivery를 시작하지 않고, 반복 delivery helper 호출은 동일 activity identity와 ordering domain을 사용한다.
- transactional outbox, NATS/Fedify MessageQueue, durable retry/history와 follower/outbox collection 공개는 PROD-448을 포함한 후속 범위로 유지한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`
- Linear Contract: PROD-496
- Linear Implementations: PROD-496. PROD-494가 선행 Local/Remote Post ActivityPub URI resolver를 제공하며 PROD-448은 비차단 후속 migration이다.

## Capabilities

### New Capabilities

- `activitypub-local-repost-delivery`: Local Repost의 stable Announce/Undo identity, audience, remote follower recipient, post-commit direct delivery와 failure isolation을 정의한다.

### Modified Capabilities

없음.

## Impact

- `packages/fedify`: Repost projection, Announce/Undo serialization, remote follower recipient projection과 Fedify delivery helper
- `packages/core`: `repostPost`와 `deletePost` transaction 결과에서 최초 생성·Active→Tombstone 전이를 판별하고, Repost Notification lifecycle과 Fedify delivery를 commit 이후 독립 best-effort side effect로 연결
- `apps/api`: Repost Notification orchestration을 core에 위임하고 기존 GraphQL payload와 delivery failure integration 회귀 검증
- GraphQL public schema와 Repost domain model에는 breaking change가 없다.
- PostgreSQL schema, broker, queue, worker와 durable delivery 상태는 변경하지 않는다.
