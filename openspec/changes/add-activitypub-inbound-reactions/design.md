## Context

PROD-494는 Local Post의 파생 Note URI와 local·remote Post URI resolver를 제공하고, 기존 remote Post는
`ActivityPubPosts.uri`로 식별한다. Reaction core는 `(Profile, Post, Type)` 유일성과 멱등 add, Post/Type delete,
Notification 생성·정리를 이미 제공한다. Fedify inbox는 typed handler를 등록하지만 `Undo`는 현재 embedded
`Follow`만 처리하므로 Reaction activity URI를 보존하는 저장 경계가 없다.

Inbound Reaction은 protocol identity를 core Reaction identity와 혼동하지 않아야 한다. 한 remote activity URI는
정확한 Reaction 하나를 가리키지만 core에는 같은 actor·Post·Type 관계가 이미 존재할 수 있고, 서로 다른 activity
URI가 같은 core 관계를 주장할 수도 있다. 또한 local·remote Post URI를 모두 역방향으로 해석하고 Post Author
actor와 viewer 접근을 한 transaction 안에서 확인해야 한다.

## Goals / Non-Goals

**Goals:**

- `Like`와 `EmojiReact`를 공통 검증·Type 투영·materialization 경계로 처리한다.
- local·stored remote Post identity와 Author recipient를 검증한다. Local Post의 personal inbox delivery는 activity
  audience가 생략됐을 때 route recipient를 Author recipient 증거로 사용할 수 있지만 shared inbox와 Remote Post는
  activity audience 증거를 유지한다.
- core Reaction과 activity mapping의 원자성, duplicate/conflict first-write 보존과 정확한 Undo를 보장한다.
- 새 source에만 기존 Best Effort Notification을 연결한다.

**Non-Goals:**

- remote actor/Post의 신규 discovery·materialization
- outbound Reaction activity와 `emojiReactions` collection
- custom emoji·임의 Unicode·legacy `EmojiReaction` 지원
- 기존 GraphQL Reaction 계약 변경

## Implementation Guidance

### Current Constraints

- `resolveActivityPubPostUri(postId)`는 정방향 resolver이므로 inbound object URI로 Post와 Author actor를 찾는
  역방향 저장 조회가 필요하다. Local URI는 configured canonical origin과 canonical UUID path를 엄격히 파싱하고,
  Remote URI는 `ActivityPubPosts.uri` exact match를 사용해야 한다.
- `addReaction(input, tx)`는 기존 transaction을 받을 수 있지만 mapping을 알지 못한다. inbound orchestration이
  같은 transaction에서 target/actor/mapping을 검증한 뒤 이를 호출해야 atomic mapping을 만들 수 있다.
- 기존 `deleteReaction`은 Post/Type current-state delete와 post-commit cleanup을 함께 소유한다. ActivityPub Undo는
  mapping이 가리키는 정확한 Reaction ID를 제거해야 하므로 기존 Post/Type API를 재사용하면 activity identity가
  약해진다.
- Fedify `Undo`는 IRI object와 embedded object를 모두 표현할 수 있다. URI-only 대상은 네트워크 document loader로
  dereference하지 않아야 한다.
- listener-level duplicate가 동시에 도착할 수 있으므로 application 사전 조회만으로 activity URI uniqueness를
  보장할 수 없다.

### Recommended Approach

1. additive 1:1 extension table에 unique activity URI를 두고, `reaction_id`를 primary key이자
   `reaction(id) ON DELETE CASCADE` foreign key로 선언한다. 별도 surrogate identity와 중복 unique index는 만들지
   않고 migration catalog test로 물리 shape를 검증한다.
2. core에 inbound 전용 transaction service를 두어 저장된 remote actor, local·remote object URI, Post Author actor,
   Post visibility와 mapping을 함께 조회한다. Type은 기존 canonical validator를 사용한다.
3. mapping이 없으면 기존 `addReaction(..., tx)`로 core 관계를 얻고 mapping insert를 시도한다. unique race에서는
   저장된 mapping과 actor·Post·Type을 다시 비교해 exact duplicate만 성공시키고 conflict는 rollback/no-op한다.
4. Undo는 activity URI로 mapping, Reaction과 actor를 join하고 actor가 일치할 때 exact Reaction ID와 mapping을 같은
   transaction에서 제거한다. 실제 source ID가 제거된 경우에만 transaction 밖에서 Notification cleanup을 호출한다.
5. Fedify handler는 URI shape, recipient set과 embedded activity identity를 protocol 경계에서 정규화하고 core
   service에는 문자열 identity와 투영 Type만 전달한다. personal inbox activity에 audience가 없으면 route가 식별한
   canonical Local actor URI를 recipient set에 보충한다. audience가 있으면 기존 route-audience 일관성 검사를
   유지하며, shared inbox에서는 recipient를 보충하지 않는다. `Like`와 `EmojiReact` listener는 같은 handler를
   호출한다.
6. core transaction 결과의 `created`/`removedReactionId`로 Notification 생성·정리를 한 번만 Best Effort 실행한다.

### Allowed Alternatives

- local URI의 역방향 lookup을 별도 helper 또는 inbound service 내부 query로 둘 수 있다. canonical origin exact match,
  UUID canonical form과 Remote URI exact match를 지키면 된다.
- duplicate race는 unique violation을 분류하거나 `ON CONFLICT DO NOTHING` 뒤 mapping을 재조회할 수 있다. conflict가
  기존 상태를 바꾸지 않고 exact duplicate만 성공한다면 둘 다 허용한다.

### Known Traps

- `addReaction` 성공만 확인하고 mapping을 별도 transaction에 저장하면 Undo identity와 crash recovery가 깨진다.
- Undo에서 기존 Post/Type delete를 호출하면 mapping 이후 재생성된 Reaction을 잘못 지울 수 있다.
- unsupported content를 validator에 직접 넘기면 계약의 `❤️` fallback 대신 activity가 거부된다.
- shared inbox의 `context.recipient === null`을 곧 recipient 검증 생략으로 해석하면 target Author와 무관한 activity를
  저장할 수 있다. shared inbox와 Remote Post 대상 activity는 activity recipient set에서 Post Author actor를 독립
  확인해야 한다. personal inbox route recipient는 Local Post Author와 정확히 일치할 때만 audience 생략을 보완한다.
- object나 Undo activity를 네트워크에서 hydrate하면 unknown resource fetch와 replay 경계가 넓어진다.

## Risks / Trade-offs

- [한 core Reaction에 여러 remote activity URI가 도착할 수 있음] → 1:1 mapping의 최초 identity만 유지하고 후속
  URI는 conflict로 처리한다. 원래 URI Undo 뒤에는 새 activity가 다시 materialize될 수 있다.
- [Notification이 transaction 뒤 실패할 수 있음] → 기존 Best Effort 정책대로 source 결과를 유지하고 테스트에서
  실패 격리를 검증한다.
- [Remote Post는 이미 저장된 시점의 visibility·author 관계를 사용함] → 신규 fetch나 refresh를 하지 않고 현재 DB
  Post 조회 정책을 적용한다.

## Migration Plan

1. additive mapping table migration을 적용한다. backfill은 없다.
2. mapping을 사용하는 core/Fedify 코드를 같은 release에 배포한다. 구버전은 새 table을 무시하므로 rollback과
   공존할 수 있다.
3. rollback은 application version을 되돌리고 mapping table을 남긴다. table 제거는 별도 contract 변경 없이는
   수행하지 않는다.

## Open Questions

없음.
