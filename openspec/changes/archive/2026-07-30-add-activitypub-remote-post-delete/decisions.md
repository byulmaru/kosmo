## Context

이 기록은 canonical Post lifecycle과 Post List Policy, core service actor/transaction 경계, 최신 PROD-579와
부모 계약 PROD-365를 반영한다. Delete-only change는 기존 remote Create materialization과 ActivityPub Post
mapping 위에서 동작하며 remote Update를 포함하지 않는다.

## Decision Records

### Delete-only lifecycle을 독립 change로 전달하고 archive한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, PROD-579, PROD-365
- Status: Active
- Context / Problem: remote Update는 revision, content projection, visibility와 stale ordering을 요구하지만 Delete는
  기존 mapping의 terminal Post lifecycle만 변경한다.
- Decision Outcome: PROD-579가 Delete-only OpenSpec, 구현, scoped 통합·회귀 검증, spec sync와 archive를 모두
  소유한다. remote Update는 PROD-365의 후속 slice로 남고 이 change의 완료를 막지 않는다.
- Alternatives Considered: Update/Delete 공유 change를 장기간 유지, PROD-365가 Delete archive를 별도 소유.
  독립 승인·배포·검증 가능한 Delete 결과에 불필요한 cross-slice 완료 책임을 만든다.
- Consequences: 이 change에는 revision/visibility 변경 task가 없으며 모든 Delete task가 끝나면 독립 archive한다.
- Confirmation / Follow-up: proposal/tasks/PR이 PROD-579만의 구현·검증·archive 책임을 일관되게 기록하는지 확인한다.

### direct IRI와 embedded Tombstone만 no-network Delete 대상으로 지원한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-579
- Status: Active
- Context / Problem: 기존 mapping이 object identity를 이미 저장했으므로 Delete 처리에 remote object hydration이
  필요하지 않지만, sender는 direct object IRI 또는 embedded Tombstone을 보낼 수 있다.
- Decision Outcome: actor/object HTTP(S) URI를 각각 하나로 확정하고 direct IRI 또는 같은 ID의 embedded
  Tombstone만 허용한다. embedded 검사는 network fetch 없이 수행하고 unsupported embedded object는 skip한다.
- Alternatives Considered: 모든 IRI를 hydrate, embedded Note도 허용, custom parser 추가. 삭제에 불필요한 network
  의존이나 넓은 protocol surface를 만든다.
- Consequences: object representation 세부보다 stored mapping identity가 대상 Note임을 증명하며 unknown object를
  fetch하거나 materialize하지 않는다.
- Confirmation / Follow-up: personal/shared, IRI-only, Tombstone과 unsupported object test로 검증한다.

### actor에서 mapping까지 exact remote ownership chain을 요구한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, PROD-579,
  PROD-365
- Status: Active
- Context / Problem: object URI 또는 instance origin만 비교하면 같은 instance의 다른 actor나 잘못 연결된 mapping이
  타인의 Post를 변경할 수 있다.
- Decision Outcome: ACTIVE stored ActivityPub Actor/Profile, ACTIVITYPUB ACTIVE/UNRESPONSIVE Instance, exact
  mapping URI, Post Author Profile과 actor URI가 모두 일치해야 한다. Local Post는 어떤 fallback identity로도
  선택하지 않는다.
- Alternatives Considered: actor/object origin 비교, mapping URI 단독 조회, ActivityPubActor를 mapping에 중복 저장.
  전자는 ownership이 약하고 후자는 기존 normalized 관계를 중복한다.
- Consequences: unknown/inactive/SUSPENDED actor, missing mapping, 다른 Author/object와 Local Post는 write 없이
  종료한다.
- Confirmation / Follow-up: cross-actor, cross-object, Local Post와 actor lifecycle matrix로 검증한다.

### Tombstone 뒤 mapping과 content history를 보존한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, PROD-579,
  PROD-365
- Status: Active
- Context / Problem: mapping을 제거하면 repeated Delete target과 duplicate Create first-write-wins identity를 잃고
  같은 remote object가 새 Active Post로 다시 materialize될 수 있다.
- Decision Outcome: canonical Active→Tombstone 전이와 최초 deletedAt만 기록하고 ActivityPub Post mapping,
  PostContent와 currentContent pointer는 보존한다. content/visibility/timestamp를 바꾸거나 revision을 추가하지 않는다.
- Alternatives Considered: mapping cascade/삭제, content 물리 삭제, currentContent nullification. terminal identity와
  authored history를 훼손하고 기존 read policy를 재정의한다.
- Consequences: GraphQL은 기존 Post state authorization으로 current/historical content를 숨기며 retention/physical
  cleanup은 이 change가 소유하지 않는다.
- Confirmation / Follow-up: mapping/content row 보존, Node/content deny, home/profile exclusion과 duplicate Create
  no-op을 검증한다.

### missing mapping에는 deletion memory를 만들지 않는다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, PROD-579,
  PROD-365
- Status: Active
- Context / Problem: Delete가 first Create보다 먼저 도착할 때 미래 materialization까지 억제하려면 receipt,
  placeholder 또는 별도 object registry가 필요하다.
- Decision Outcome: committed mapping을 관찰하지 못한 Delete는 write/fetch/backfill 없이 no-op한다. 이후 유효한
  최초 Create는 기존 first-write-wins 계약대로 materialize될 수 있다.
- Alternatives Considered: activity receipt, Tombstone placeholder Post/mapping, retry queue. 기존 mapping 대상만
  처리하는 Delete-only 범위를 넘어 새 storage/lifecycle을 만든다.
- Consequences: concurrent first Create/Delete 결과는 Delete가 committed mapping을 관찰했는지에 따라 bounded하게
  결정되며 완전한 causal ordering을 제공하지 않는다.
- Confirmation / Follow-up: Delete-before-Create와 committed-Create-before-Delete를 분리해 검증한다.

### concurrent Delete는 조건부 전이와 no-op으로 해결한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, PROD-579
- Status: Active
- Context / Problem: 같은 Active Post에 대한 동시 Delete에서 deletedAt이 반복 갱신되거나 별도 lock/receipt가
  중복 책임을 갖지 않아야 한다.
- Decision Outcome: canonical Active 조건부 update 하나만 Tombstone과 최초 deletedAt을 기록하고 나머지는
  보존된 Tombstone에 대한 no-op으로 종료한다. explicit `FOR UPDATE`, table/advisory lock과 activity receipt를
  추가하지 않는다.
- Alternatives Considered: mapping row lock, global activity receipt, last-write-wins deletedAt. 현재 terminal social
  transition에 비해 복잡하며 최초 삭제 시각을 불안정하게 만든다.
- Consequences: PostgreSQL의 일반 DML transaction과 조건부 update만 사용한다.
- Confirmation / Follow-up: 독립 connection concurrent Delete에서 state 하나와 안정적인 deletedAt을 검증한다.

### core delete의 Local outbound 후보는 저장 provenance에서 파생한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `docs/domain/objects/post.md`, PROD-579
- Status: Active
- Context / Problem: 현재 canonical core action은 Content가 있는 Post를 Local outbound Delete 후보로 취급해 mapped
  remote Post에도 Local delivery를 시도할 수 있다. `tx` 유무는 persistence participation이지 Post origin이 아니다.
- Decision Outcome: canonical `deletePost`를 계속 재사용하되 Local outbound lifecycle 후보는 remote ActivityPub
  Post mapping 존재 여부를 포함한 저장 provenance에서 파생한다. caller-supplied suppression boolean이나 `tx`
  유무로 origin을 추론하지 않는다.
- Alternatives Considered: inbound handler가 Posts를 직접 update, caller가 `skipDelivery` 전달, remote Delete에서만
  모든 side effect를 `tx`로 억제. 공통 lifecycle을 복제하거나 transport flag/transaction과 origin을 결합한다.
- Consequences: mapped remote content Post는 Local Delete/Repost Undo/Notification cleanup을 만들지 않고 기존
  Local root/Reply Delete delivery는 유지되어야 한다.
- Confirmation / Follow-up: core Local root/Reply/repeated Delete와 mapped remote Post를 함께 회귀 검증한다.

### GraphQL schema 없이 기존 DB-only read/list 정책을 재사용한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, PROD-579,
  PROD-365
- Status: Active
- Context / Problem: Tombstone을 위해 remote 전용 resolver나 mapping-aware authorization을 추가하면 기존 canonical
  Post Eligibility와 DB-only read 계약을 중복한다.
- Decision Outcome: 공개 GraphQL schema/resolver를 바꾸지 않고 existing Post state authorization으로 Post와
  current/historical PostContent Node를 숨기며 home/profile connection에서 제외한다.
- Alternatives Considered: remote Tombstone GraphQL type, mapping prerequisite, request-time refresh. 현재 canonical
  deletion 결과와 zero-network read를 재정의한다.
- Consequences: implementation은 production resolver 변경보다 실제 materialized row의 post-delete 회귀 검증에
  집중한다.
- Confirmation / Follow-up: actual Create materializer output에서 Delete 후 Node/content/list와 zero-network read를
  검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
