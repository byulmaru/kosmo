## Context

`origin/main`에는 PROD-394가 추가한 nullable `repostSourceId` self-reference와 Active contentless Repost partial unique index가 있다. 기존 `createPost`는 Local과 ActivityPub contentful Post를 Post → Content → `currentContentId` 순서의 단일 transaction으로 생성하며 Reply Parent나 Repost Source 입력은 받지 않는다.

부모 PROD-388은 Reply 저장, 직접 Parent·조상·하위 Reply 조회, 목록 후보 정책과 Post 상세 thread를 하나의 계약으로 소유한다. 첫 구현 slice인 PROD-393은 Reply Parent 저장과 공통 구조 검증만 담당하고, 후속 GraphQL·client slice는 같은 change를 이어서 갱신한다. `add-post-reposts`도 active 상태이므로 공통 `data-model`·`post` capability를 서로 덮어쓰지 않게 검증해야 한다.

## Goals / Non-Goals

**Goals:**

- 기존 Repost Source 기반을 보존하면서 nullable Reply Parent를 additive하게 저장한다.
- Content, Reply Parent와 Repost Source의 허용 조합을 공통 core 경계에서 판정하고 Reply Parent 대상 유효성을 검증한다.
- 직접 Parent, 조상과 descendant를 조회할 때 서로 다른 visibility/eligibility 경계를 유지한다.
- Home/Profile/Hashtag 후보 정책과 Post 상세 thread가 같은 직접 관계를 사용하게 한다.
- 각 Linear 구현 이슈가 자신의 구현과 검증을 소유하고 부모 PROD-388이 최종 통합·archive를 소유하게 한다.

**Non-Goals:**

- Reply 작성 mutation·composer와 실제 Quote/Reply+Quote 작성 action
- ActivityPub `inReplyTo`, Post Media와 Notification
- 별도 Post Kind 또는 Reply concrete GraphQL type
- Reply Parent 변경 API, recursive cycle constraint trigger와 범용 graph mutation
- PROD-393에서 하위 Reply 조회 index 또는 GraphQL·client 구현

### Implementation Slice Boundary

- 현재 Hashtag Post List GraphQL query/resolver 표면이 없으므로 PROD-429는 Home/Profile 후보만 구현·검증한다.
- canonical Hashtag Reply 제외 정책과 `reply` spec의 Hashtag 시나리오는 유지하고, Hashtag capability가 도입되는 구현 slice에서 해당 정책의 구현·회귀 검증을 소유한다.

## Implementation Guidance

### Current Constraints

- Post ID는 DB insert에서 생성되므로 직접 self-reference 검증에는 새 Post ID가 필요하다.
- 현재 `createPost`의 Local/ActivityPub overload와 반환값은 contentful 호출 계약을 가진다. `replyParentId`를 추가하더라도 기존 호출과 ActivityPub first-write-wins 결과를 바꾸면 안 된다.
- `repostSourceId`와 partial unique index는 PROD-394가 소유한다. Reply migration이나 core 변경에서 이를 재생성·수정하지 않는다.
- Reply Parent는 lifecycle과 무관하게 저장 ID를 유지하지만 생성 시점에는 존재하고 `currentContentId`가 있어야 한다. Source 대상 검증은 실제 Source caller를 소유한 후속 이슈가 같은 canonical 규칙으로 추가한다.
- 조상 조회는 조회 불가능한 Parent에서 중단한다. descendant 조회는 구조 탐색과 viewer 필터를 분리해야 숨겨진 Parent 아래의 visible Reply를 함께 제거하지 않는다.

### Recommended Approach

- PROD-393은 `post`에 nullable Reply Parent self-FK와 직접 self-reference CHECK만 추가하는 forward migration을 생성한다. 기존 row는 `null`을 유지하고 별도 하위 조회 index는 만들지 않는다.
- `createPost` transaction은 빈 관계의 Post를 먼저 만들고 Content를 생성한 뒤, 공통 내부 validator로 Content/Reply Parent/Repost Source 조합을 판정하고 Parent의 존재·Content를 확인한다. 마지막 Post update에서는 `currentContentId`와 `replyParentId`만 함께 연결한다.
- validator는 package 공개 barrel에 노출하지 않는다. PROD-393은 기존 Local/ActivityPub `createPost`에 `replyParentId`만 추가해 Post와 Reply를 저장한다. Source를 실제로 연결하는 Quote·Reply+Quote와 Repost 경로는 각 caller를 소유한 후속 이슈에서 추가한다.
- PROD-398은 Post 관계 field resolver에서 저장 ID를 기존 loadable `Post` Node에 전달하고 Parent가 조회 불가능하면 `null`로 정규화한다.
- PROD-399는 직접 Parent chain을 순환 방어와 함께 탐색하며 조회 불가능한 Parent에서 중단한다. PROD-400은 전체 구조를 탐색한 뒤 각 descendant의 visibility/eligibility를 독립 적용하고 실제 query plan에 따라 index 필요성을 결정한다.
- PROD-429는 Home/Profile의 Reply 후보 판정을 page limit 이전에 적용한다. Hashtag Reply 제외는 shared spec과 부모 통합 계약에 유지하며 capability 도입 시 검증한다. PROD-422는 route가 thread query를 소유하고 각 Post 표시 컴포넌트가 colocated Relay fragment를 유지하게 연결한다.
- `add-post-replies`는 `add-post-reposts` artifact를 수정하지 않는다. 겹치는 active capability는 새 독립 requirement로 추가하고 두 change와 전체 OpenSpec을 함께 strict validation한다.

### Allowed Alternatives

- 공통 구조 validator는 `post` service 안에 둘 수도 있고 후속 Repost action이 실제로 재사용할 때 package 내부 모듈로 분리할 수도 있다. 어느 경우에도 package 공개 API와 관찰 가능한 error 계약은 같아야 한다.
- 조상·descendant 조회는 재귀 CTE나 visited-set을 사용하는 동등한 traversal을 사용할 수 있다. 임의의 최대 깊이로 결과를 자르지 않고 visibility 중단·독립 필터·cycle 방어와 query plan 검증을 동일하게 만족해야 한다.

### Known Traps

- Content 없는 중간 Post를 먼저 최종 상태로 저장하면 구조 CHECK 또는 기존 workload와 충돌할 수 있다. 관계와 `currentContentId`는 최종 update에서 함께 연결한다.
- Parent의 존재만 확인하고 `currentContentId`를 확인하지 않으면 contentless Repost를 Reply Parent로 허용하게 된다.
- Repost Source index나 migration을 Reply change에서 재생성하면 PROD-394 소유권과 migration history를 침범한다.
- ancestor 조회에서 숨겨진 Parent를 건너뛰거나 descendant 재귀를 숨겨진 Parent에서 중단하면 canonical 조회 정책과 달라진다.
- recursive 결과에 limit을 먼저 적용한 뒤 visibility를 거르면 페이지가 비거나 visible descendant가 누락될 수 있다.
- OpenSpec strict validation 통과만으로 GraphQL field 이름·pagination·정렬의 upstream 결정이 생기지는 않는다.

## Risks / Trade-offs

- [Risk] nullable column, FK와 CHECK 추가 시 기존 `post` table 검증 lock이 발생할 수 있다. → 생성 SQL을 검토하고 table rewrite 여부와 현재 lock timeout 안의 migration test를 확인한다. 예상 밖 운영 위험이면 migration 방식을 임의 변경하지 않고 upstream에서 재결정한다.
- [Risk] DB CHECK는 직접 self-reference만 막고 raw SQL 관계 변경으로 만든 장주기 cycle은 막지 않는다. → 생성 전용 immutable core 경계로 정상 write를 제한하고 재귀 조회는 cycle 방어를 둔다.
- [Risk] `add-post-reposts`와 `add-post-replies`가 active `data-model`·`post` capability를 함께 확장한다. → 기존 change를 수정하지 않고 독립 ADDED requirement를 사용하며 두 change와 전체 OpenSpec을 strict validation한다.
- [Risk] descendant 전체 탐색은 데이터 증가에 따라 비싸질 수 있다. → PROD-400이 실제 query와 실행 계획을 소유하고 그때 `reply_parent_id` index와 pagination을 결정한다.
- [Trade-off] Parent Tombstone 뒤 ID를 보존하면 저장 관계와 노출 관계가 달라진다. → resolver와 list policy에서 visibility/eligibility를 적용하고 DB 참조는 audit·thread 구조를 위해 유지한다.

## Migration Plan

1. PROD-394 migration이 적용된 schema에서 nullable Reply Parent self-FK와 직접 self-reference CHECK를 추가하는 새 migration을 생성한다.
2. 기존 Post/Repost/Quote row, nullable column, FK, CHECK와 기존 Repost partial unique index의 catalog를 검증한다.
3. 구버전 workload와 새 contentful workload가 같은 schema에서 동작하는지 core·migration 회귀 테스트로 확인한다.
4. application code가 optional `replyParentId` 입력과 공통 구조 검증을 사용하도록 배포한다.
5. rollback 시 application code를 먼저 이전 버전으로 되돌린다. nullable column과 호환 가능한 constraint는 즉시 제거하지 않고 필요한 경우 새 forward migration으로 정리한다.
