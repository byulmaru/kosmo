## Why

Kosmo는 verified remote `Announce`와 `Undo(Announce)`를 수신해도 기존 Repost 모델에 반영하지 못한다. PROD-494가 local/remote Post의 안정적인 ActivityPub identity를 제공하고 기존 Repost core action이 준비됐으므로, inbound federation을 같은 저장·조회 경계에 연결한다.

## What Changes

- personal/shared Fedify inbox에서 verified remote `Announce`를 처리한다.
- 저장된 remote Post URI 또는 canonical local Note URI를 기존 Post로 해석하고, 기존 `repostPost` action으로 contentless Repost를 materialize한다.
- remote Repost 자체에 기존 ActivityPub Post mapping을 생성하고 현재 Announce activity URI와 delivery metadata를 저장한다.
- 같은 actor/source의 새 Announce generation은 기존 Active Repost를 유지하면서 현재 mapping URI를 교체한다.
- `Undo` actor와 현재 Announce identity가 일치할 때만 기존 `deletePost` action으로 해당 Repost를 Tombstone 처리한다.
- duplicate personal/shared delivery와 repeated Undo를 멱등 처리한다.
- outbound Announce, Quote·중첩 Repost, object network fetch와 Repost 제품/UI 계약 변경은 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`
- Linear Contract: PROD-495
- Linear Implementations: 없음.

## Capabilities

### New Capabilities

- `activitypub-remote-repost`: verified inbound Announce/Undo의 identity 검증, 대상 Post 해석, 기존 Repost action materialization과 current-activity 멱등 lifecycle

### Modified Capabilities

없음.

## Impact

- `packages/fedify`: typed Announce listener, Undo routing, actor/recipient/activity/object 검증과 Post URI 해석
- `packages/core`: 기존 Repost action과 ActivityPub Post mapping을 같은 transaction에서 조립하는 최소 저장 경계
- PostgreSQL/Drizzle: 새 테이블·컬럼 없이 기존 `activitypub_post`의 unique URI/Post mapping을 remote Repost에도 사용
- 검증: Fedify unit/integration, core DB transaction과 Repost count/조회 회귀, strict OpenSpec validation
