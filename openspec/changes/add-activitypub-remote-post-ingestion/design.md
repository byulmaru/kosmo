## Context

PR #212/PROD-257은 저장된 remote Profile/Post를 공통 GraphQL surface에서 DB-only로 읽고 Profile/Instance/Post parent authorization을 적용한다. 완료된 PROD-241은 actor-scoped/shared inbox HTTP route와 handler registration 경계를 activity-neutral foundation으로 제공하고, PROD-341은 canonical PostContent document의 schema와 canonicalization을 제공한다.

이번 change는 이미 검증·저장된 actor가 보낸 공개 top-level Note의 최초 materialization만 연다. activity receipt, duplicate Create revision 갱신과 object conflict recovery lock은 현재 observable 결과에 필요하지 않으므로 제거한다.

## Goals / Non-Goals

**Goals**

- Fedify typed `Create`와 vocabulary hydration을 재사용한다.
- known actor와 public top-level Note만 side effect input으로 허용한다.
- unique Note object URI로 remote Post identity와 duplicate를 판정한다.
- 최초 object mapping, Post와 PostContent를 PostgreSQL에서 원자적으로 저장한다.
- remote content adapter 결과를 PROD-341 canonical document 경계에 전달한다.
- 기존 GraphQL authorization/read contract가 materialized row에도 적용됨을 검증한다.

**Non-Goals**

- PostgreSQL inbox activity receipt 또는 activity ID 영구 보존
- duplicate `Create`를 통한 PostContent revision 갱신
- object conflict recovery transaction 또는 mapping row lock
- `activitypub-actor-discovery`의 공통 route requirement 재정의
- remote actor/mentioned Profile discovery 또는 refresh
- Reply/thread, FOLLOWERS audience와 DIRECT recipient relation
- GraphQL schema/resolver 변경 또는 request-time remote fetch
- Fedify 전체 KV backend, queue/worker와 authenticated shared-inbox identity
- ActivityStreams Mention, media, PROD-365 `Update(Note)`/`Delete(Note)` lifecycle과 outbox backfill

## Implementation Guidance

### Current Constraints

- main에는 PROD-341 canonical PostContent document, PROD-357 activity-neutral inbox 책임 정렬과 PR #212 DB-only GraphQL read/authorization이 제공된다.
- PROD-366/PR #271에 따라 신규 DB row ID는 table discriminator나 application-side generator 없이 PostgreSQL `uuidv7()` default를 사용하고, GraphQL global ID는 DB ID와 분리된다.
- 이 change는 spec-only이며 코드, DB migration, generated GraphQL schema와 runtime behavior를 변경하지 않는다.
- Fedify 2.3의 inbox idempotency는 KV에서 확인한 뒤 handler 성공 후 TTL cache를 기록하므로 concurrent delivery를 transaction처럼 직렬화하지 않는다.
- remote Note의 domain identity는 activity ID가 아니라 hydrated `Note.id.href`다.
- PostgreSQL unique object URI constraint는 object URI당 mapping을 하나로 제한할 수 있다.

### Recommended Approach

#### Data Flow

```text
Fedify inbox listener
  -> actor/object cardinality와 known actor 확인
  -> Fedify documentLoader로 Note hydration
  -> attribution/top-level/public addressing 검증
  -> receivedAt, published와 remote primitive content 추출
  -> remote primitive content를 PROD-259 projection
  -> PROD-341 canonical validator
  -> identity/visibility/timestamps + canonical document를 PROD-261 transaction
       Post
       first PostContent/currentContent
       unique object mapping
  -> object URI conflict면 loser 전체 rollback + no-op
  -> existing GraphQL DB-only read
```

#### Inbox adapter와 validation

- actor-scoped/shared listener는 같은 `Create` handler를 사용한다.
- `withIdempotency("global")`은 activity ID가 있을 때의 조기 중복 제거로만 둔다. 같은 activity ID의 후속 delivery는 object URI와 무관하게 handler 전에 제거될 수 있으며, application은 handler에 도달한 delivery의 activity ID를 materialization input이나 DB row로 만들지 않는다.
- handler는 진입 시 `receivedAt`을 한 번 캡처한다.
- Note hydration 전에 저장된 `ActivityPubActor + Profile + Instance`를 조회하고 unknown/inactive/non-ActivityPub/SUSPENDED는 network/profile write 없이 종료한다.
- object는 `Create.getObject({ documentLoader })`와 Fedify cross-origin 기본값을 사용한다.
- `to`의 Public은 PUBLIC, `cc`의 Public은 UNLISTED로 projection하고 reply 또는 public marker가 없는 addressing은 skip한다.

#### Content projection handoff

- Fedify adapter는 remote vocabulary의 content/mediaType/summary만 primitive로 바꿔 PROD-259에 전달한다.
- published는 PROD-260 materialization input에서 PROD-261 timestamp 정책으로 직접 전달한다.
- PROD-261은 원본 published를 mapping metadata로 보존하되 `Post.createdAt`은 receivedAt 이후가 되지 않게 clamp한다.
- PROD-259는 remote HTML/plain 입력 처리만 소유한다.
- 저장 가능한 document의 node schema, canonicalization, equality와 renderer는 PROD-341의 canonical capability를 그대로 사용한다.
- remote-post change는 PROD-341 V1 node 목록이나 revision equality를 복제하지 않는다.

#### First materialization과 concurrency

- PROD-255는 unique object URI/Post mapping을 제공한다.
- PROD-261은 최초 delivery의 mapping, Post, first PostContent와 currentContent를 하나의 transaction으로 저장한다.
- 같은 object URI의 concurrent delivery는 unique mapping insert에서 한 transaction만 성공한다.
- loser transaction은 자신이 만든 Post/PostContent를 rollback하고 no-op한다. existing mapping을 다시 읽거나 잠그지 않는다.
- 이미 mapping된 object URI의 duplicate Create는 first-write-wins no-op이다. 원격 수정·삭제는 후속 PROD-365가 소유한다.

#### GraphQL regression boundary

- remote Post 전용 resolver, object mapping join과 request-time fetch를 추가하지 않는다.
- PROD-262는 object mapping 없이 remote Profile/Post/PostContent fixture를 만들어 existing authorization을 검증한다.
- connection ordering/cursor는 기존 `Post.id DESC`를 유지한다.

### Allowed Alternatives

- transaction 안의 Post, PostContent와 mapping insert 순서는 달라질 수 있지만 unique conflict에서 partial row 없이 전부 rollback되어야 한다.
- HTML/plain parser와 adapter의 내부 구조는 달라질 수 있지만 PROD-259 입력 안전성과 PROD-341 validator 경계를 만족해야 한다.
- PROD-262의 fixture와 spy 구성은 달라질 수 있지만 production resolver/schema diff 없이 DB-only read를 검증해야 한다.

### Known Traps

- object URI unique constraint가 있는데 별도 activity receipt를 추가하면 같은 중복 문제를 두 identity로 소유하게 된다.
- duplicate Create를 update처럼 취급하면 revision 비교, row lock과 conflict recovery가 불필요하게 따라온다.
- loser transaction에서 partial Post를 commit하거나 conflict 뒤 실패한 transaction을 계속 사용하면 고아 row가 생긴다.
- unknown actor를 WebFinger/materialize하면 validation 전 network/write 금지와 remote-profile 소유권을 깨뜨린다.
- PROD-341 canonical node/equality 계약을 이 change에 복제하면 두 spec이 독립적으로 drift한다.
- `post_mention`, FOLLOWERS/DIRECT/reply ingestion 또는 resolver 변경을 함께 넣으면 후속 이슈와 기존 read 계약을 침범한다.

## Delivery and Ownership

1. main에 병합된 PROD-341 document와 PROD-357 inbox foundation을 사용한다.
2. PROD-354 spec-only PR을 main에 병합한다.
3. PROD-255/259/260/262 구현 PR은 각 schema/projection/validation/regression 결과만 전달한다.
4. PROD-261이 PROD-255/259/260 결과를 최초 materialization transaction으로 통합한다.
5. PROD-256이 전체 slice, canonical spec sync와 archive를 검증한다.
6. 후속 이슈가 Reply/FOLLOWERS/DIRECT/Update와 다른 deferred contract를 별도 OpenSpec으로 확장한다.

## Risks / Trade-offs

- **동시 duplicate Create**: object URI unique constraint와 loser transaction rollback으로 Post를 하나만 남긴다.
- **같은 activity ID가 다른 object를 가리킴**: Fedify global idempotency가 후속 delivery를 handler 전에 제거할 수 있다. 이 change는 handler에 도달한 delivery에서만 Note object URI를 durable identity로 판정한다.
- **duplicate Create에 변경된 content가 포함됨**: first-write-wins로 무시하고 PROD-365 `Update(Note)` 지원 전에는 remote 수정 동기화를 제공하지 않는다.
- **unknown actor delivery 유실**: profile materialization을 명시적 선행 조건으로 두어 inbox abuse surface와 숨은 network/write를 줄인다.
- **기존 resolver 결함**: PROD-262가 결함을 발견하면 implementation scope를 다시 열고 test-only 이슈에서 조용히 수정하지 않는다.

## Migration Plan

- schema 변경은 PROD-255의 additive object mapping migration만 소유한다.
- 구현 slice 배포 전에는 ingestion handler가 등록되지 않으므로 spec-only merge가 runtime behavior를 바꾸지 않는다.
- rollback은 ingestion handler 비활성화로 새 materialization을 멈춘다. 별도 receipt data cleanup은 존재하지 않는다.

## Open Questions

없음. 구현 중 새 product 또는 ownership 결정이 필요하면 해당 Linear 이슈와 이 change의 decision을 먼저 갱신한다.
