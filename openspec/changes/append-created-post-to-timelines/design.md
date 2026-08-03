## Context

`PostComposer`는 `createPost` 응답의 `post`를 Relay normalized Store에 기록하지만, 이미 렌더링한 Home·Profile 목록 membership은 자동으로 바뀌지 않는다. Home Query root와 작성자 Profile Node는 서로 다른 Relay parent이므로 surface별 managed connection ID를 mutation에 전달하고 `@prependNode`로 응답 Node를 반영한다.

## Goals / Non-Goals

**Goals:**

- `CreatePostPayload.post`만 선택해 생성 Post의 목록 렌더 fragment와 관계 필드를 정규화한다.
- 요청을 시작한 actor Environment에서 이미 로드된 Home connection에 생성 Post를 Relay `@prependNode`로 최신순으로 한 번 삽입한다.
- Original/Quote는 Home과 작성자 Profile connection ID를 전달하고, Reply는 Home ID만 전달한다.
- Relay 기본 handler가 같은 Node의 기존 edge를 유지해 duplicate completion을 deduplicate하고, unloaded connection은 변경하지 않도록 한다.

**Non-Goals:**

- GraphQL payload edge field 또는 server-side membership/projection 계약
- Post List 후보·Visibility·Control·cursor 정책의 client 재구현
- GraphQL Subscription, server push, 다른 actor Store 동기화 또는 광범위한 refetch
- DB schema/migration, 새 dependency, 생성 Post route 자동 이동

## Implementation Guidance

1. Home Query와 `PostList_profile` fragment에 surface별 안정적인 `@connection` handle을 유지한다.
2. Composer mutation은 `post @prependNode(connections: $connections, edgeTypeName: "PostConnectionEdge") { id ...PostListItem_post }`를 선택한다.
3. commit 시 `ConnectionHandler.getConnectionID`로 Home과 작성자 Profile managed connection ID를 계산하되, Reply는 Home ID만 `$connections`에 전달한다. 이 client directive 변수는 서버 API input으로 전달되지 않는다.
4. Relay 기본 prepend handler가 로드된 connection만 찾고 기존 node identity를 검사한 뒤 `PostConnectionEdge`를 생성하도록 한다. 수동 updater로 같은 Store 동작을 재구현하지 않는다.
5. 기존 Composer lifecycle guard와 Environment isolation을 유지한다. generated Relay artifacts는 source GraphQL 변경 후 `pnpm --filter @kosmo/app relay`로만 재생성한다.

## Risks / Trade-offs

- local edge에는 서버 cursor가 없으므로 목록 key는 cursor가 아닌 canonical node ID를 사용한다. 이후 정상 query가 서버 edge/cursor를 제공하면 Relay Store가 수렴한다.
- 이전 actor Environment가 화면에서 분리돼도 updater는 mutation이 commit된 Store에만 실행된다. completion callback은 기존 generation guard를 따른다.
