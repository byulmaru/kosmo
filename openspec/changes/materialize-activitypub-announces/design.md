## Context

현재 Fedify listener는 Follow, Accept/Reject와 top-level `Create(Note)`를 처리하지만 `Announce`를 등록하지 않는다. `repostPost`는 actor/source 검증, visibility 파생, direct contentless Repost 생성과 actor/source 유일성 충돌 수렴을 이미 소유하고, `deletePost`는 Author의 Post를 멱등 Tombstone 처리한다. `activitypub_post`는 unique remote URI와 unique materialized Post ID, received/published metadata를 보존한다. PROD-494는 local Post의 canonical Note URI와 local/remote Post URI resolver를 제공한다.

Announce ingress는 protocol identity 검증과 기존 도메인 action 사이의 adapter다. 같은 Repost가 personal/shared inbox에서 중복 생성되지 않아야 하고, 새 Announce generation이 current identity를 교체한 뒤 과거 Undo가 현재 Repost를 지우면 안 된다. 사용자는 Hackers’ Pub의 current-activity 모델을 선택했고 ABA 형태의 오래된 Announce 재전송이 current identity를 다시 차지하는 위험은 현재 범위에서 허용했다.

## Goals / Non-Goals

**Goals:**

- verified remote Announce/Undo를 기존 Repost create/delete action에 연결한다.
- 저장된 remote mapping과 canonical local Note URI만 Source로 해석한다.
- 기존 `activitypub_post` row를 remote Repost의 current Announce identity로 재사용한다.
- personal/shared duplicate, concurrent Announce와 repeated/current/superseded Undo를 원자적이고 멱등 처리한다.
- 기존 Repost count와 조회 projection을 변경 없이 재사용한다.

**Non-Goals:**

- outbound Announce/Undo delivery, queue와 retry
- unknown actor/object/activity network materialization
- Quote, nested Repost와 Repost 제품·GraphQL·UI 재구현
- 모든 과거 Announce generation ledger와 ABA 방지
- 새 table, column, enum 또는 migration

## Implementation Guidance

### Current Constraints

- `repostPost`는 caller transaction을 받을 수 있으므로 mapping upsert와 같은 transaction에 합류시켜야 한다. action 완료 뒤 별도 mapping write를 하면 mapping 없는 Repost 또는 Repost 없는 mapping이 남을 수 있다.
- `activitypub_post.uri`와 `post_id`가 각각 unique다. 같은 activity URI가 다른 actor/object를 주장하면 기존 row를 이동하지 않고 transaction 전체를 거절해야 한다.
- 기존 local Post에는 ActivityPub Post mapping을 만들지 않는다. 새 mapping은 Announce Source가 아니라 remote Actor가 작성한 contentless Repost Post에만 연결한다.
- `resolveActivityPubPostUri`는 Post ID에서 outbound identity를 구한다. ingress는 exact remote mapping lookup 또는 configured canonical origin/path/UUID 역해석이 별도로 필요하다.
- 기존 Undo listener는 embedded Follow만 처리한다. Announce Undo는 current mapping identity를 먼저 조회하고, Follow Undo의 no-network embedded-object 정책을 깨지 않도록 종류별 처리를 조립해야 한다.
- Fedify personal inbox는 actor dispatcher로 경로 recipient를 검증하고 shared inbox는 `recipient = null`을 전달한다. handler가 `to`/`cc` recipient heuristic을 새로 추가하면 정상 shared delivery를 거절한다.

### Recommended Approach

Announce handler 진입에서 한 번 캡처한 receivedAt과 required HTTP(S) actor/activity/object URI를 검증한다. activity ID와 actor ID는 같은 origin인 보수적 ingress 정책을 적용하고, 저장된 usable remote Actor를 exact URI로 조회한다. object는 network dereference하지 않고 remote mapping exact match 또는 current canonical origin의 local Note path와 canonical UUID로 Post ID를 해석한다.

DB transaction 안에서 기존 `repostPost({ actorProfileId, sourcePostId }, tx)`를 호출한다. 반환된 Repost ID를 `activitypub_post.post_id`로 사용해 mapping을 insert하고, 같은 Post mapping이 있으면 current `uri`, receivedAt과 nullable publishedAt을 새 Announce generation으로 갱신한다. mapping row를 ID 순서의 `FOR UPDATE`로 잠가 concurrent Announce와 Undo의 current identity 교체/삭제를 직렬화하고 둘 이상의 generation row가 걸릴 때도 lock ordering을 고정한다. Undo 뒤 재생성에서 같은 actor/source의 삭제된 이전 세대가 새 Announce URI를 점유하면 그 stale mapping만 제거한 뒤 새 Active Repost mapping으로 넘긴다. 다른 actor/source/Post가 URI를 소유하면 이동하지 않고 transaction 전체를 거절한다. 별도 Source URI column은 두지 않고 Repost의 `repostSourceId` 대상 mapping 또는 local identity에서 Source를 얻는다.

Undo는 verified outer actor와 HTTP(S) object activity URI를 사용한다. Undo object/activity URI와 actor URI가 같은 origin인지 확인한 뒤, current `activitypub_post.uri`와 일치하고 Active contentless direct Repost인 row를 Author ActivityPub actor까지 join해 찾는다. 정확히 일치할 때만 같은 transaction에서 기존 `deletePost`를 호출한다. Tombstone Post의 mapping은 이후 같은 URI의 Announce가 올 때 새 generation에 identity를 넘겨줄 수 있고, 그 전까지 repeated Undo는 Tombstone no-op으로 끝난다. current Announce mapping이 없으면 기존 no-network Follow Undo 분기로 계속 진행하거나 no-op한다.

테스트는 handler 직접 호출과 production listener 양쪽을 사용한다. personal/shared same-ID, 순차/동시 duplicate, A→B current replacement, 늦은 Undo A, Undo B→C→늦은 Undo B, actor/object/URI rejection, mapping URI collision과 transaction rollback, local/remote Source, visibility rejection, count/조회 회귀를 검증한다.

### Allowed Alternatives

- protocol adapter가 core DB transaction을 직접 조립하거나, core에 ActivityPub-specific orchestration action을 추가할 수 있다. 어느 쪽이든 기존 `repostPost`/`deletePost`를 실제 호출하고 Repost와 mapping atomicity를 보존해야 한다.
- Undo routing은 하나의 dispatcher 또는 작은 종류별 helper로 구성할 수 있다. unknown activity network dereference와 기존 Follow Undo 회귀가 없어야 한다.

### Known Traps

- Source Post의 existing mapping row에 Announce URI를 저장하면 여러 actor가 같은 Source를 Announce하는 cardinality를 표현하지 못한다.
- `activitypub_post.uri` 외에 `announceUri`를 추가하면 같은 remote Repost identity를 중복 저장한다.
- mapping을 Repost transaction 이후에 저장하면 failure/concurrency에서 durable identity와 projection이 분리된다.
- current mapping row lock 없이 Announce identity 교체와 Undo 삭제가 교차하면 새 URI가 방금 Tombstone된 Repost를 가리킬 수 있다.
- `onConflictDoUpdate`가 activity URI 충돌 시 다른 Post mapping을 빼앗거나 actor/object를 변경하게 하면 안 된다.
- actor/object origin equality를 요구하면 정상 cross-origin Repost를 거절한다. same-origin은 activity ID/actor와 Undo object activity ID/actor에만 적용한다.
- shared inbox에서 recipient 또는 `to`/`cc` local actor를 필수로 요구하지 않는다.
- Undo를 위해 unknown embedded Announce를 dereference하지 않는다.
- `createPost`를 contentless overload로 확장하거나 Repost 정책을 Fedify handler에 복제하지 않는다.

## Risks / Trade-offs

- [오래된 Announce A가 A→B 뒤 다시 도착하면 current mapping이 A로 되돌아갈 수 있음] → 사용자가 ABA 위험을 현재 범위에서 수용했다. unique mapping과 Fedify early idempotency로 일반 중복을 줄이고 durable generation ledger는 추가하지 않는다.
- [같은 actor/source의 동시 A/B에서 최종 current URI가 scheduling에 따라 달라질 수 있음] → 두 delivery 모두 같은 Repost로 수렴시키고 DB unique/atomic upsert로 부분 상태를 막는다. generation ordering은 별도 계약이 없다.
- [기존 `activitypub_post` 의미가 contentful Note mapping에서 remote Post representation identity로 넓어짐] → Repost Post 자체에만 row를 추가하고 Source Note mapping과 1:1 관계를 유지하며 local Post에는 row를 만들지 않는다.
- [새 listener가 기존 Undo/Follow 경로를 회귀시킬 수 있음] → production listener를 통과하는 Follow/Announce/Undo routing 회귀 테스트를 유지한다.

## Migration Plan

Schema migration은 없다. application 배포로 listener와 remote Repost mapping write를 활성화한다. rollback은 listener 등록과 ingress orchestration을 제거해 새 materialization을 중단한다. 이미 생성된 Repost와 mapping은 기존 조회·Tombstone 모델에 유효하므로 자동 삭제하거나 backfill하지 않는다.

## Open Questions

없음.
