## Context

현재 `packages/fedify/src/federation.ts`의 personal/shared inbox listener는 `Create`를 포함하지만 typed
`Delete` listener가 없다. 최초 remote Note ingestion은 `ActivityPubPosts.uri`를 durable identity로 사용해
Post/PostContent/mapping을 원자적으로 만들고 duplicate Create를 first-write-wins no-op으로 처리한다.

canonical `deletePost` core action은 author를 재검증하고 Active Post를 조건부 Tombstone으로 바꾸지만, Content가
있는 Post이면 remote mapping 여부와 무관하게 Local outbound Delete 후보로 취급한다. inbound remote Delete가
이 action을 그대로 호출하면 remote Post의 commit과 Local outbound lifecycle을 혼동할 수 있으므로 remote
mapping을 보존한 채 origin별 post-commit side effect를 분리해야 한다.

`inbound-follow.ts`의 inbound Undo(Announce)는 no-network embedded object 해석, exact
actor/mapping/author join과 caller transaction 안의 `deletePost` 재사용이라는 가까운 production pattern을
제공한다. 이 change는 그 경계를 remote content Post Delete에 맞게 적용하되 Update revision, 새 schema와
activity receipt를 추가하지 않는다.

## Goals / Non-Goals

**Goals:**

- typed personal/shared inbox Delete를 하나의 handler에 연결한다.
- network lookup 없이 actor/object cardinality, embedded Tombstone, stored actor와 exact remote Author를 검증한다.
- canonical Post delete action으로 remote Post를 원자적 Tombstone으로 전환한다.
- mapping과 content history를 보존해 repeated Delete와 duplicate Create resurrection을 막는다.
- missing/out-of-order/concurrent 결과와 GraphQL DB-only read/list 결과를 production 경로에서 검증한다.

**Non-Goals:**

- remote `Update(Note)`, revision·visibility 변경과 stale timestamp ordering
- 미저장 object deletion receipt, placeholder, fetch, backfill과 retry queue
- Local outbound Delete, Reply/FOLLOWERS/DIRECT, media/Mention/Notification 확장
- Post 또는 mapping 물리 삭제, restore와 새 GraphQL/DB schema

## Implementation Guidance

### Current Constraints

- Fedify inbox listener 하나가 actor-scoped route와 shared route를 공유하므로 별도 HTTP route가 필요하지 않다.
- `Delete.objectIds`는 direct IRI와 embedded object 모두에서 target identity 후보를 제공한다. embedded 여부를
  확인하려고 normal document loader를 사용하면 불필요한 remote fetch가 발생할 수 있다.
- `findStoredRemoteProfileActorByUri`는 ACTIVE ActivityPub Profile과 가용 Instance를 제한하는 기존 Create
  경계이므로, 이미 저장된 identity의 terminal Delete에는 재사용하지 않는다.
- `ActivityPubPosts`는 URI와 Post를 1:1로 연결하지만 actor를 중복 저장하지 않는다. Author 검증은
  mapping→Post→Profile→ActivityPubActor/Instance join에서 파생해야 한다.
- `deletePost`는 author revalidation과 조건부 Active→Tombstone 멱등성을 이미 소유한다. ingress가 Posts를
  직접 update하면 이 공통 lifecycle과 향후 변경에서 갈라진다.
- 현재 `deletePost`의 Local Post Delete delivery 후보 판정은 `currentContentId`만 보므로 mapped remote content
  Post에도 잘못 적용될 수 있다. `tx` 유무를 origin 신호로 사용하는 것은 caller transaction과 lifecycle을
  혼동한다.
- 기존 GraphQL visibility helper는 `PostState.ACTIVE`를 요구하므로 Tombstone Post와 current/historical
  PostContent Node를 숨기며 list query도 같은 eligibility 경계를 소비한다.

### Recommended Approach

1. Fedify `Delete`를 기존 personal/shared listener에 등록하고 handler 진입에서 actor/object URI cardinality와
   HTTP(S) 형식을 검증한다.
2. embedded object는 network를 항상 실패시키는 document loader와 suppressed error로만 확인한다. embedded
   object가 없으면 direct IRI로 처리하고, 있으면 동일 ID의 Tombstone만 허용한다.
3. 하나의 DB transaction에서 object mapping, Current Content가 있는 Note Post, Profile, Instance와
   ActivityPubActor를 exact join한다. Content 없는 Repost의 Announce mapping은 선택하지 않고 기존
   `Undo(Announce)` lifecycle에 남긴다. eligible actor/author/origin/state가 아니면 write 없이 종료한다.
4. 같은 transaction을 전달해 canonical `deletePost`를 호출한다. handler lookup과 core author 재검증 중 하나가
   실패하거나 대상이 바뀌면 전체 transition을 적용하지 않는다.
5. core delete action의 Local outbound 후보는 caller transaction이 아니라 remote ActivityPub Post mapping
   존재 여부를 포함한 저장 identity에서 파생한다. mapped remote Post transition은 Local Delete/Repost Undo와
   Notification cleanup 후보가 되지 않는다.
6. existing mapping과 content pointer를 그대로 두고 Post state/deletedAt만 최초 전이에서 갱신한다. repeated
   Delete와 duplicate Create는 같은 mapping을 통해 no-op이 된다.
7. Fedify integration test는 direct IRI/Tombstone, personal/shared, actor/object/Local guard와 repeated/missing
   순서를 검증한다. 실제 PostgreSQL test는 concurrent Delete의 single transition을 고정한다. API integration은
   실제 Create materializer output을 Delete handler로 전이한 뒤 Node/PostContent/home/profile 결과와 zero-network
   read를 확인한다.

### Allowed Alternatives

- exact mapping/author lookup을 Fedify 전용 query helper나 handler 내부 query로 둘 수 있다. core public contract에
  ActivityPub URI나 Fedify vocabulary type을 전달하지 않고 같은 transaction/ownership 결과를 보장해야 한다.
- embedded direct IRI 판정은 Fedify가 제공하는 동등한 no-network vocabulary inspection API를 사용할 수 있다.
- Local outbound 후보를 mapping 존재 여부가 아닌 동등하게 신뢰할 수 있는 기존 저장 provenance에서 파생할 수
  있다. caller-supplied boolean이나 `tx` 유무는 허용하지 않는다.

### Known Traps

- actor URI origin만 object URI origin과 비교하면 같은 instance의 다른 actor가 타인의 Post를 삭제할 수 있다.
- mapping URI만 조회하고 Post Author/Instance/Actor를 join하지 않으면 Local 또는 잘못 연결된 Post를 변경할 수
  있다.
- `Delete.getObject()`에 normal document loader를 전달하면 IRI-only Delete가 remote fetch로 바뀐다.
- Tombstone 전이에 mapping을 제거하면 repeated Delete identity를 잃고 duplicate Create가 새 Active Post를 만들
  수 있다.
- inbound handler에서 Posts를 직접 update하면 canonical author check, deletedAt과 멱등 결과가 중복된다.
- `deletePost(..., tx)`라는 이유만으로 모든 post-commit behavior를 생략하거나, 반대로 Content가 있다는 이유로
  Local outbound Delete를 보내면 transaction participation과 origin을 혼동한다.
- concurrent Delete를 직렬화하려고 explicit row/advisory lock이나 receipt를 추가하면 bounded no-op 계약보다
  저장·운영 복잡성이 커진다.

## Risks / Trade-offs

- [Risk] Delete가 최초 Create commit 전 mapping을 보지 못하면 no-op 후 Post가 Active로 materialize될 수 있다.
  → 미저장 object memory가 없다는 명시적 계약으로 제한하고 이후 delivery 또는 운영 동기화는 별도 capability가
  소유한다.
- [Risk] ACTIVE/UNRESPONSIVE actor만 허용하면 SUSPENDED/disabled remote author의 cleanup Delete를 적용하지 않는다.
  → 현재 known-actor eligibility와 GraphQL hidden 상태를 유지하고 actor lifecycle cleanup은 별도 계약으로 둔다.
- [Risk] content history와 mapping을 보존하면 삭제 데이터가 물리적으로 남는다. → canonical Tombstone과 remote
  identity 보존을 우선하며 retention/physical cleanup은 별도 lifecycle로 결정한다.
- [Risk] core Local outbound 후보 판정 변경이 기존 Local Post Delete delivery를 회귀시킬 수 있다. → Local root,
  Reply, repeated Delete와 mapped remote Post를 함께 회귀 검증한다.

## Migration Plan

- DB migration과 GraphQL schema 변경은 없다.
- typed Delete listener와 origin-safe core delete behavior를 같은 배포 단위로 제공한다.
- rollback은 listener 등록과 관련 core 판정을 되돌려 새 inbound Delete 처리를 중지한다. 이미 canonical
  Tombstone으로 전이된 Post는 terminal state이므로 자동 복원하지 않는다.
- 구현·검증과 active spec 동기화가 모두 완료되면 PROD-579가 이 Delete-only change를 archive한다.

## Open Questions

없음. Issue Gate에서 direct IRI/embedded Tombstone, mapping 보존, missing/out-of-order/concurrent 결과와
Delete-only archive 책임을 확정했다.
