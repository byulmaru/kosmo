## Context

`origin/main`에는 PROD-394가 추가한 nullable `repostSourceId` 기반과 PROD-393이 추가한 nullable `replyParentId` self-reference·구조 검증이 있다. 현재 branch는 PROD-398의 nullable `Post.replyParent` field와 기존 loadable `Post` Node 조회 경계를 함께 상속한다.

부모 PROD-388은 Reply 저장, 직접 Parent·조상·하위 Reply 조회, 목록 후보 정책과 Post 상세 thread를 하나의 계약으로 소유한다. PROD-393의 저장·공통 구조 검증과 PROD-398의 직접 Parent 조회는 완료됐고, PROD-399는 같은 change와 `Post` Node를 이어서 조상 경로만 추가한다. `add-post-reposts`도 active 상태이므로 공통 `data-model`·`post` capability를 서로 덮어쓰지 않게 검증해야 한다.

## Goals / Non-Goals

**Goals:**

- 기존 Repost Source 기반을 보존하면서 nullable Reply Parent를 additive하게 저장한다.
- Content, Reply Parent와 Repost Source의 허용 조합을 공통 core 경계에서 판정하고 Reply Parent 대상 유효성을 검증한다.
- 직접 Parent, 조상과 descendant를 조회할 때 서로 다른 visibility/eligibility 경계를 유지한다.
- Home/Profile 후보 정책과 Post 상세 thread가 같은 직접 관계를 사용하게 한다.
- 각 Linear 구현 이슈가 자신의 구현과 검증을 소유하고 부모 PROD-388이 최종 통합·archive를 소유하게 한다.

**Non-Goals:**

- Reply 작성 mutation·composer와 실제 Quote/Reply+Quote 작성 action
- ActivityPub `inReplyTo`, Post Media와 Notification
- 별도 Post Kind 또는 Reply concrete GraphQL type
- Reply Parent 변경 API, recursive cycle constraint trigger와 범용 graph mutation
- PROD-393에서 하위 Reply 조회 index 또는 GraphQL·client 구현

## Implementation Guidance

### Current Constraints

- Post ID는 DB insert에서 생성되므로 직접 self-reference 검증에는 새 Post ID가 필요하다.
- 현재 `createPost`의 Local/ActivityPub overload와 반환값은 contentful 호출 계약을 가진다. `replyParentId`를 추가하더라도 기존 호출과 ActivityPub first-write-wins 결과를 바꾸면 안 된다.
- `repostSourceId`와 partial unique index는 PROD-394가 소유한다. Reply migration이나 core 변경에서 이를 재생성·수정하지 않는다.
- Reply Parent는 lifecycle과 무관하게 저장 ID를 유지하지만 생성 시점에는 존재하고 `currentContentId`가 있어야 한다. Source 대상 검증은 실제 Source caller를 소유한 후속 이슈가 같은 canonical 규칙으로 추가한다.
- 조상 조회는 조회 불가능한 Parent에서 중단한다. descendant 조회는 구조 탐색과 viewer 필터를 분리해야 숨겨진 Parent 아래의 visible Reply를 함께 제거하지 않는다.
- PROD-399의 공개 계약은 pagination 없는 `Post.replyAncestors: [Post!]!`이며 직접 Parent부터 root 방향으로 반환한다. Parent가 없거나 첫 Parent가 unavailable이면 빈 배열이다.
- 조상 경로는 임의의 최대 깊이로 절단하지 않으므로 단계별 Node load를 반복하지 않고 cycle을 식별하면서 한 번에 탐색해야 한다.
- PROD-400은 `Post.replyDescendants: PostConnection!`, full Relay pagination과 `createdAt ASC, id ASC` 정렬을 공개 계약으로 확정했다. 기존 Post connection helper와 같은 양방향 page 계약을 유지하되 ID 단독 cursor로 축약하지 않는다.
- 현재 앱의 목록 Post는 `PostListItem`, 상세 Post는 `PostLayout`이 각자 colocated Relay fragment와 기존 Post rendering을 소유한다. PROD-451은 실제 Reply field·route를 읽지 않는 fixture-first presentation slice이고 PROD-422가 실제 Relay data와 route를 연결한다.
- 현재 `ThemeProvider`는 `colors.light`만 공급하므로 PROD-451의 390px/600px visual QA는 Light appearance만 완료 증거로 삼는다. Dark theme injection과 Dark appearance 검증은 이 presentation slice에서 추가하거나 완료한 것으로 기록하지 않는다.

### Recommended Approach

- PROD-393은 `post`에 nullable Reply Parent self-FK와 직접 self-reference CHECK만 추가하는 forward migration을 생성한다. 기존 row는 `null`을 유지하고 별도 하위 조회 index는 만들지 않는다.
- `createPost` transaction은 빈 관계의 Post를 먼저 만들고 Content를 생성한 뒤, 공통 내부 validator로 Content/Reply Parent/Repost Source 조합을 판정하고 Parent의 존재·Content를 확인한다. 마지막 Post update에서는 `currentContentId`와 `replyParentId`만 함께 연결한다.
- validator는 package 공개 barrel에 노출하지 않는다. PROD-393은 기존 Local/ActivityPub `createPost`에 `replyParentId`만 추가해 Post와 Reply를 저장한다. Source를 실제로 연결하는 Quote·Reply+Quote와 Repost 경로는 각 caller를 소유한 후속 이슈에서 추가한다.
- PROD-398은 Post 관계 field resolver에서 저장 ID를 기존 loadable `Post` Node에 전달하고 Parent가 조회 불가능하면 `null`로 정규화한다.
- PROD-399는 직접 Parent를 seed로 하는 recursive query에서 현재 Post와 방문한 조상 ID를 path로 추적한다. 각 단계에 기존 `Post` 조회 경계를 적용해 unavailable Parent에서 중단하고, 반환 순서는 직접 Parent부터 유지한다. PROD-400은 recursive traversal에서 visibility를 적용하지 않고 cycle 방문을 방어하며 전체 descendant ID를 찾은 뒤, 최종 Post 후보에 visibility/eligibility를 적용하고 `createdAt ASC, id ASC` cursor와 page limit을 적용한다. 대표 fan-out·depth 데이터의 실제 query plan으로 `reply_parent_id` index 필요성과 형태를 결정한다.
- PROD-429는 Home/Profile의 Reply 후보 판정을 page limit 이전에 적용한다. PROD-451은 부모가 공급한 조상·현재·하위 Post 순서와 직접 관계 metadata를 그대로 표시하는 props-only thread layout을 먼저 제공한다. 조상과 하위 Reply는 기존 목록 Post와 같은 정보 밀도를 유지하고 현재 Post만 기존 상세 rendering으로 앵커를 만든다. 연결선은 공급된 인접 Post가 직접 관계일 때만 그리고, 공급된 배열이 끝나는 visibility 경계에는 숨겨진 Post를 암시하는 placeholder나 문구를 만들지 않는다.
- `PostThreadLayout`은 item, role, supplied 순서와 direct connector metadata만 소유한다. fixture caller는 `renderPost` 안에서 local state를 close over하여 mock 선택 action을 붙일 수 있다. 기존 `PostListItem`·`PostLayout` renderer는 자신의 Profile/Post Link를 그대로 유지하며 presentation이 이를 다른 `Pressable`로 감싸지 않는다.
- Reply+Quote fixture에는 nullable `repostSource` 관계가 있고 Story query가 이를 읽는다. 구조적 sentinel은 반환된 `repostSource` subtree에서만 렌더하며 Source ID를 가진다. 이 증거는 Reply 자신의 Content와 Source 관계가 하나의 thread item 안에 함께 남는지만 보이고, PROD-451은 production Source preview의 외관이나 상호작용을 합성하지 않는다.
- PROD-422는 route가 thread query를 소유하고 `replyAncestors`를 root 우선 표시 순서로 변환한다. ancestor 인접 항목은 경로 계약에서 직접 관계이고, descendant는 각 Post의 `replyParent { id }`와 이전 표시 Post ID를 비교해 supplied 직접 관계 metadata를 만든다. 각 Post 표시 컴포넌트는 colocated Relay fragment와 기존 Link를 유지한다. PROD-422는 route-aware caller가 필요로 할 때만 나중에 production navigation adapter를 도입할 수 있다.
- `add-post-replies`는 `add-post-reposts` artifact를 수정하지 않는다. 겹치는 active capability는 새 독립 requirement로 추가하고 두 change와 전체 OpenSpec을 함께 strict validation한다.

### Allowed Alternatives

- 공통 구조 validator는 `post` service 안에 둘 수도 있고 후속 Repost action이 실제로 재사용할 때 package 내부 모듈로 분리할 수도 있다. 어느 경우에도 package 공개 API와 관찰 가능한 error 계약은 같아야 한다.
- PROD-399 조상 조회는 Linear에서 단일 recursive query와 visited path로 확정됐다. PROD-400 descendant 조회는 재귀 CTE나 visited-set을 사용하는 동등한 traversal을 사용할 수 있다. 임의의 최대 깊이로 결과를 자르지 않고 독립 필터·cycle 방어와 query plan 검증을 동일하게 만족하며, 공개 field·connection·pagination·정렬 계약을 유지해야 한다.
- thread layout은 role별 Post fragment ref를 직접 받을 수도 있고 caller가 기존 Post component를 render callback으로 공급하게 할 수도 있다. 어느 방식이든 plain Post renderer를 복제하지 않고, PROD-451에서는 실제 Reply GraphQL field나 Expo route를 읽지 않으며, PROD-422가 layout 계약을 바꾸지 않고 실제 Post renderer와 관계 metadata를 공급할 수 있어야 한다.

### Known Traps

- Content 없는 중간 Post를 먼저 최종 상태로 저장하면 구조 CHECK 또는 기존 workload와 충돌할 수 있다. 관계와 `currentContentId`는 최종 update에서 함께 연결한다.
- Parent의 존재만 확인하고 `currentContentId`를 확인하지 않으면 contentless Repost를 Reply Parent로 허용하게 된다.
- Repost Source index나 migration을 Reply change에서 재생성하면 PROD-394 소유권과 migration history를 침범한다.
- ancestor 조회에서 숨겨진 Parent를 건너뛰거나 descendant 재귀를 숨겨진 Parent에서 중단하면 canonical 조회 정책과 달라진다.
- `replyAncestors`를 root 우선으로 뒤집거나 connection으로 만들거나 최대 깊이에서 조용히 절단하면 PROD-399 공개 계약과 달라진다.
- 각 Parent를 개별 Node load로 반복하면 경로 깊이만큼 query가 늘어나므로 cycle만 막아도 과도한 조회 방어를 만족하지 못한다.
- recursive 결과에 limit을 먼저 적용한 뒤 visibility를 거르면 페이지가 비거나 visible descendant가 누락될 수 있다.
- descendant traversal의 anchor나 recursive term에서 visibility를 거르면 숨겨진 Parent 아래 visible Reply에 도달하지 못한다.
- 조상 Reply를 축소·희미하게 처리하면 승인된 일반 Post 밀도와 달라지고, 모든 Post를 같은 강조도로 두면 현재 상세 Post의 앵커가 사라진다.
- descendant 전체를 시간순으로 이어진 하나의 선으로 그리면 인접 Post가 직접 Parent/Child가 아닌 경우에도 관계를 암시한다. connector는 caller가 공급한 직접 관계 metadata만 사용한다.
- visibility 경계에 `숨겨진 답글` 같은 placeholder나 설명을 만들면 API가 구분하지 않은 root·unavailable 상태를 client가 추론하고 숨겨진 관계를 누출할 수 있다.
- presentation component가 Quote Source, Action Bar 또는 Reaction/Repost 수치를 별도로 렌더하면 기존 Post rendering을 복제하고 PROD-451의 thread layout 범위를 넘는다.
- 기존 link-rich Post renderer를 외부 `Pressable`로 감싸 mock navigation을 만들면 Profile·timestamp·본문 Link가 중첩된다. mock 선택은 fixture caller가 `renderPost` 안에서 local state를 close over하는 범위에만 둔다.

## Risks / Trade-offs

- [Risk] nullable column, FK와 CHECK 추가 시 기존 `post` table 검증 lock이 발생할 수 있다. → 생성 SQL을 검토하고 table rewrite 여부와 현재 lock timeout 안의 migration test를 확인한다. 예상 밖 운영 위험이면 migration 방식을 임의 변경하지 않고 upstream에서 재결정한다.
- [Risk] DB CHECK는 직접 self-reference만 막고 raw SQL 관계 변경으로 만든 장주기 cycle은 막지 않는다. → 생성 전용 immutable core 경계로 정상 write를 제한하고 재귀 조회는 cycle 방어를 둔다.
- [Risk] `add-post-reposts`와 `add-post-replies`가 active `data-model`·`post` capability를 함께 확장한다. → 기존 change를 수정하지 않고 독립 ADDED requirement를 사용하며 두 change와 전체 OpenSpec을 strict validation한다.
- [Risk] descendant 전체 탐색은 데이터 증가에 따라 비싸질 수 있다. → PROD-400이 실제 query와 실행 계획을 소유하고 그때 `reply_parent_id` index와 pagination을 결정한다.
- [Risk] 손상 데이터가 매우 긴 ancestor chain을 만들면 depth 상한 없는 recursive query 비용이 커질 수 있다. → 정상 write는 immutable 직접 관계로 cycle을 만들 수 없게 유지하고, visited path로 cycle을 종료하며 실제 query와 깊은 fixture를 검증한다. 운영 상한이 필요해지면 부분 절단을 추가하지 않고 PROD-399의 공개 error 계약을 먼저 갱신한다.
- [Risk] `reply_parent_id`와 정렬 column을 함께 둔 index가 전역 descendant 정렬까지 해결한다고 오판할 수 있다. → 실제 recursive query의 `EXPLAIN (ANALYZE, BUFFERS)`에서 traversal lookup과 최종 sort를 나눠 확인하고 측정으로 증명된 최소 index만 추가한다.
- [Risk] color token에는 Dark 값이 있지만 현재 앱이 Dark theme을 주입하지 않아 thread의 실제 Dark appearance는 확인할 수 없다. → PROD-451은 Light QA만 보고하고, 향후 Dark theme을 실제로 공급하는 소유 변경에서 inherited connector·border·current surface를 검증한다.
- [Trade-off] Parent Tombstone 뒤 ID를 보존하면 저장 관계와 노출 관계가 달라진다. → resolver와 list policy에서 visibility/eligibility를 적용하고 DB 참조는 audit·thread 구조를 위해 유지한다.

## Migration Plan

1. PROD-394 migration이 적용된 schema에서 nullable Reply Parent self-FK와 직접 self-reference CHECK를 추가하는 새 migration을 생성한다.
2. 기존 Post/Repost/Quote row, nullable column, FK, CHECK와 기존 Repost partial unique index의 catalog를 검증한다.
3. 구버전 workload와 새 contentful workload가 같은 schema에서 동작하는지 core·migration 회귀 테스트로 확인한다.
4. application code가 optional `replyParentId` 입력과 공통 구조 검증을 사용하도록 배포한다.
5. rollback 시 application code를 먼저 이전 버전으로 되돌린다. nullable column과 호환 가능한 constraint는 즉시 제거하지 않고 필요한 경우 새 forward migration으로 정리한다.
6. PROD-400 descendant query에서 측정으로 필요한 index가 확인되면 새 additive forward migration으로 추가하고, 구버전 workload 호환과 rollback 시 index 잔류 안전성을 확인한다.

## Open Questions

- 없음.
