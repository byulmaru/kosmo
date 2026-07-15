## Context

PR #212/PROD-257은 저장된 remote Profile/Post를 공통 GraphQL surface에서 DB-only로 읽고 Profile/Instance/Post parent authorization을 적용한다. 완료된 PROD-241은 actor-scoped/shared inbox HTTP route와 handler registration 경계를 activity-neutral foundation으로 제공한다. 반면 legacy remote post ingestion change는 unknown actor lookup, private audience, mention relation, TipTap projection과 resolver 변경까지 소유해 PROD-256과 최신 구현 자식 책임에 충돌한다.

이번 change는 이미 검증·저장된 actor가 보낸 공개 top-level Note를 existing Post model에 안전하게 materialize하는 write path만 연다. PROD-341의 versioned PostContent document가 외부 선행 조건이고, PROD-354가 공유 OpenSpec을 단독 소유한다.

## Goals / Non-Goals

**Goals**

- Fedify typed `Create`와 vocabulary hydration을 재사용한다.
- PROD-241의 activity-neutral inbox route에 remote-post capability가 소유하는 `Create` handler를 등록한다.
- known actor와 public top-level Note만 side effect input으로 허용한다.
- global activity receipt와 Post side effect를 PostgreSQL에서 원자적으로 처리한다.
- remote content를 공통 versioned PostContent document로 저장한다.
- 기존 GraphQL authorization/read contract가 materialized row에도 적용됨을 검증한다.

**Non-Goals**

- `activitypub-actor-discovery`의 공통 route requirement 재정의
- remote actor/mentioned Profile discovery 또는 refresh
- Reply/thread([PROD-358](https://linear.app/byulmaru/issue/PROD-358)), FOLLOWERS audience([PROD-360](https://linear.app/byulmaru/issue/PROD-360)), DIRECT recipient relation([PROD-359](https://linear.app/byulmaru/issue/PROD-359))
- GraphQL schema/resolver 변경 또는 request-time remote fetch
- Fedify 전체 KV backend, queue/worker와 authenticated shared-inbox identity
- ActivityStreams Mention, media, update/delete와 outbox backfill

## Implementation Guidance

### Current Constraints

- main에는 PROD-341의 versioned PostContent document, PROD-357의 activity-neutral inbox 책임 정렬과 PR #212의 DB-only GraphQL read/authorization이 이미 제공된다.
- 이 change는 spec-only이며 코드, DB migration, generated GraphQL schema와 runtime behavior를 변경하지 않는다.
- ingestion은 저장된 ACTIVE/UNRESPONSIVE ActivityPub actor의 PUBLIC/UNLISTED top-level `Create(Note)`로 제한된다.
- Fedify idempotency와 PostgreSQL materialization transaction은 서로 원자적이지 않으므로 DB receipt claim이 최종 duplicate 판정이어야 한다.
- 공개 GraphQL schema와 resolver는 그대로 사용하며 mapping 없는 remote Post fixture도 기존 authorization을 통과해야 한다.

### Recommended Approach

#### Data Flow

```text
Fedify inbox listener
  -> typed Create.id/actor/object cardinality 확인
  -> 저장된 actor/profile/instance eligibility 조회
  -> Fedify documentLoader로 Note hydration
  -> attribution/top-level/public addressing 검증
  -> PROD-259 canonical document projection
  -> PROD-261 PostgreSQL transaction
       receipt claim
       object mapping
       Post/PostContent/currentContent
  -> existing GraphQL DB-only read
```

#### Inbox adapter와 validation

- actor-scoped/shared listener는 같은 `Create` handler와 `withIdempotency("global")` 설정을 사용한다.
- handler는 non-null `Create.id.href`와 진입 시 한 번 캡처한 `receivedAt`을 필수 input으로 만든다.
- actor/object URI는 URL `.href` 기준으로 deduplicate해 각각 하나만 허용한다.
- Note hydration 전에 저장된 `ActivityPubActor + Profile + Instance`를 조회한다. unknown/inactive/non-ActivityPub/SUSPENDED는 hydration과 profile network/write 없이 종료한다.
- ACTIVE/UNRESPONSIVE actor만 진행하며, hydration된 Note의 ID와 attribution을 검증한 뒤 UNRESPONSIVE instance를 compare-and-set으로 ACTIVE 복구할 수 있다.
- object는 `Create.getObject({ documentLoader })`를 사용하고 Fedify cross-origin 기본값을 유지한다. custom fetch/parser와 `trust`는 사용하지 않는다.
- `to`의 Public은 PUBLIC, `cc`의 Public은 UNLISTED로 projection한다. reply 또는 public marker가 없는 addressing은 skip한다.

#### Content projection

- Fedify adapter는 `LanguageString.toString()`으로 primitive content/summary를 만들고 locale/vocabulary type을 core에 전달하지 않는다.
- PROD-259는 HTML/plain/absent content를 PROD-341의 V1 paragraph/text/hard_break/link body와 Plain Text Content Warning으로 projection한다.
- raw HTML, executable markup/URL, image와 파생 Plain Text는 canonical storage가 아니다.
- canonical document structural equality와 nullable Content Warning equality가 revision identity다. raw serialized JSON 문자열이나 formatting-only HTML은 독립 revision identity가 아니다.

#### Durable storage와 concurrency

- PROD-255는 unique global `activityId` receipt와 unique object URI/Post mapping을 제공한다.
- PROD-261은 transaction 시작에서 receipt를 `ON CONFLICT DO NOTHING ... RETURNING`으로 claim한다. claim 실패는 Post side effect 없는 성공한 duplicate다.
- 최초 delivery는 receipt, mapping, Post, first PostContent와 currentContent를 함께 저장한다.
- object URI insert conflict는 현재 transaction을 sentinel error로 rollback한 뒤 새 transaction에서 receipt를 다시 claim하고 existing mapping을 `FOR UPDATE`로 잠근다. 다른 unique violation을 object race로 정규화하지 않는다.
- same actor mapping은 canonical document/Content Warning 변경에만 새 revision을 만든다. 다른 actor 또는 visibility mismatch는 기존 Post를 변경하지 않고 receipt만 처리 완료로 남긴다.
- `receivedAt`은 mapping 수신 시각과 새 PostContent 생성 시각에 사용한다. 유효한 published가 `receivedAt + 5분` 이내이면 최초 `Post.createdAt`에 사용하고 missing/더 미래이면 receivedAt으로 fallback한다. 원본 published는 nullable mapping metadata로 보존한다.

#### GraphQL regression boundary

- remote Post 전용 resolver, object mapping join과 request-time fetch를 추가하지 않는다.
- PROD-262는 object mapping 없이 remote Profile/Post/PostContent fixture를 만들어 `Post` Node, current/historical `PostContent`, `Profile.posts`, `homeTimeline`의 existing authorization을 검증한다.
- ACTIVE/UNRESPONSIVE의 PUBLIC/UNLISTED stale read는 허용하고 SUSPENDED/inactive author/inactive Post는 숨긴다. connection ordering/cursor는 기존 `Post.id DESC`를 유지한다.

### Allowed Alternatives

- HTML/plain parser와 adapter의 내부 구조는 달라질 수 있지만 결과는 PROD-341 V1 schema로 검증되고 canonicalization, safe link와 Content Warning 계약이 같아야 한다.
- receipt claim과 materialization service의 함수 경계는 달라질 수 있지만 하나의 PostgreSQL transaction commit/rollback과 aborted transaction 밖의 object race recovery를 보장해야 한다.
- PROD-262의 fixture와 spy 구성은 달라질 수 있지만 production resolver/schema diff 없이 네 GraphQL surface와 zero-network read를 검증해야 한다.

### Known Traps

- unknown actor를 편의상 WebFinger/materialize하면 validation 전 network/write 금지와 remote-profile 소유권을 깨뜨린다.
- Fedify `withIdempotency("global")` 또는 process-local KV만 믿으면 restart와 여러 instance에서 Post side effect가 중복될 수 있다.
- unique violation 뒤 실패한 transaction 안에서 mapping을 다시 읽거나 모든 unique violation을 object race로 취급하면 동시성 오류를 숨긴다.
- `post_mention`, FOLLOWERS/DIRECT/reply ingestion 또는 resolver 변경을 함께 넣으면 후속 이슈와 기존 read 계약을 침범한다.
- `activitypub-actor-discovery`, remote-profile 또는 `post` delta를 다시 추가하면 이미 병합된 foundation/canonical spec과 archive 소유권이 중복된다.

## Delivery and Ownership

1. main에 병합된 PROD-341의 versioned PostContent document와 PROD-357의 activity-neutral inbox 책임 정렬을 foundation으로 사용한다.
2. PROD-354 spec-only PR은 remote-post change만 소유하고 main에 병합한다.
3. PROD-255/259/260/262 구현 PR은 이 공유 change를 수정하지 않고 각 schema/projection/validation/regression 결과만 전달한다.
4. PROD-261이 PROD-255/259/260 결과를 하나의 materialization transaction으로 통합한다.
5. PROD-256이 전체 slice, canonical spec sync와 archive를 검증한다.
6. PROD-256 완료 뒤 PROD-358/360/359가 현재 change를 다시 열지 않고 각각 별도 OpenSpec으로 deferred contract를 확장한다.

## Risks and Mitigations

- **Fedify KV와 DB receipt 불일치**: KV는 최적화로만 취급하고 DB receipt conflict를 최종 판정으로 사용한다.
- **object URI 동시 insert**: aborted transaction 밖에서만 lock/recovery를 수행하고 독립 connection test로 검증한다.
- **unknown actor delivery 유실**: profile materialization을 명시적 선행 조건으로 두어 inbox abuse surface와 숨은 network/write를 줄인다.
- **content fidelity 제한**: V1 allowlist와 deterministic canonicalization을 사용하고 Mention/media는 후속 version에서 확장한다.
- **기존 resolver 결함**: PROD-262가 결함을 발견하면 implementation scope를 다시 열고 test-only 이슈에서 조용히 수정하지 않는다.

## Migration and Rollback

- schema 변경은 PROD-255의 additive migration이 소유하며 PROD-354는 migration을 만들지 않는다.
- 구현 slice 배포 전에는 ingestion handler가 등록되지 않으므로 spec-only merge가 runtime behavior를 바꾸지 않는다.
- rollback은 ingestion handler 비활성화로 새 materialization을 멈출 수 있다. durable receipt 삭제는 replay 보장을 약화하므로 rollback 절차에 포함하지 않는다.
