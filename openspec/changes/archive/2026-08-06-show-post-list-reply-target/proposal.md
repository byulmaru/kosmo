## Why

Home·Bookmark 등 일반 Post 목록에서는 Reply도 일반 Post와 같은 행으로 보여 사용자가 어떤 Post를 향한 답글인지 구분하기 어렵다. 상세 thread의 관계 표현은 유지하면서, 조회 가능한 Reply Parent 작성자를 기존 목록 상단 attribution 계층에 표시해야 한다.

## What Changes

- 조회 가능한 Reply Parent를 가진 일반 목록의 Reply와 Reply+Quote 위에 `{displayName}님에게 답글` attribution을 한 번 표시한다.
- Reply attribution은 기존 Repost attribution과 icon column·text slot·typography·행 간격을 공유하되, 클릭 동작이나 Post·Profile navigation이 없는 텍스트로 제공한다.
- Reply Parent를 조회할 수 없거나 일반 Post 또는 Content 없는 순수 Repost에는 Reply attribution과 대체 문구를 표시하지 않는다.
- 관계가 이미 드러나는 상세 thread의 조상·현재·하위 Post에는 목록용 Reply attribution을 표시하지 않는다.
- 기존 Reply Parent 조회·visibility, Repost·Quote presentation, GraphQL schema·resolver와 federation 계약은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/design/post-action-bar.md`, `docs/design/post-thread.md`, `docs/design/accessibility.md`
- Linear Contract: `PROD-696`; 적용 경계 `PROD-388`, 목록 상단 attribution 선례 `PROD-453`
- Linear Implementations: `PROD-696`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post-reply-ui`: 일반 Post 목록의 Reply 대상 attribution과 상세 thread 제외 동작을 추가한다.

## Impact

- `apps/app`의 공용 `PostListItem` Relay fragment와 목록 renderer, 상세 thread caller가 영향을 받는다.
- 기존 Repost attribution 행의 layout을 두 호출부가 공유하는 private presentation component로 분리한다.
- `apps/app/src/stories/Posts.stories.tsx`의 기존 Relay fixture와 목록·thread 검증을 최소 범위로 확장한다.
- GraphQL schema·resolver, database, migration, Fedify, 새 dependency와 route 계약에는 영향이 없다.
