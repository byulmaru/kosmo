## Context

이 기록은 [PROD-354](https://linear.app/byulmaru/issue/PROD-354), 부모 [PROD-256](https://linear.app/byulmaru/issue/PROD-256)과 PROD-255/259/260/261/262, 외부 선행 [PROD-341](https://linear.app/byulmaru/issue/PROD-341)의 최신 계약을 반영한다. 기존 active change와 PR #258의 이전 diff는 source of truth가 아니며 Linear 결과와 완료된 foundation에서 durable choice를 다시 도출한다.

## Decision Records

### Inbox ingestion은 저장된 known actor만 허용한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: unknown inbound actor를 WebFinger/materialization하면 검증 전 network/write side effect와 abuse surface가 커지고 remote profile foundation의 소유권도 침범한다.
- Decision Outcome: 저장된 `ActivityPubActor + Profile + Instance`가 있고 Profile이 ACTIVE이며 Instance가 ACTIVITYPUB/ACTIVE 또는 ACTIVITYPUB/UNRESPONSIVE일 때만 Note hydration으로 진행한다. unknown, non-ActivityPub, inactive와 SUSPENDED actor는 network/profile write 없이 skip한다.
- Alternatives Considered: inbound unknown actor를 즉시 materialize, personal inbox recipient/follow 관계가 있을 때만 materialize.
- Consequences: 새 actor의 첫 게시글은 별도 profile materialization이 선행되어야 하며 inbox ingestion 자체는 profile discovery/refresh를 수행하지 않는다.
- Confirmation / Follow-up: PROD-260이 known actor 조회와 zero-network/write rejection을 검증한다.

### 공통 inbox route를 재정의하지 않고 remote-post Create handler만 소유한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 완료된 PROD-241과 remote-follow OpenSpec은 actor-scoped/shared inbox HTTP route를 activity-neutral handler registration 경계로 제공한다. remote-post change가 `activitypub-actor-discovery` requirement 전체를 다시 수정하면 두 change의 archive 순서와 activity 허용 범위가 충돌한다.
- Decision Outcome: 이 change는 `activitypub-actor-discovery` delta를 갖지 않는다. PROD-260이 기존 route에 verified typed `Create` handler와 remote-post 전용 validation을 등록하고, 지원하지 않는 delivery의 Post side effect만 차단한다.
- Alternatives Considered: discovery requirement에 Follow와 Create allowlist를 다시 열거, remote-post 전용 HTTP inbox route 추가.
- Consequences: 공통 route와 transport는 PROD-241/remote-follow 계약을 재사용하고, Create validation과 materialization은 remote-post capability 안에서만 진화한다.
- Confirmation / Follow-up: PR #260 위의 stacked diff와 전체 strict validation에서 `activitypub-actor-discovery` 중복 delta가 없는지 확인한다.

### Public top-level Note만 첫 ingestion 범위로 지원한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: private audience와 reply는 recipient relation, thread reconstruction과 audience lifecycle을 함께 요구한다.
- Decision Outcome: attribution이 activity actor와 일치하는 PUBLIC/UNLISTED top-level `Note`만 허용한다. reply, followers-only, direct/private와 ambiguous addressing은 side effect 없이 skip한다.
- Alternatives Considered: Post-level recipient relation으로 private Note 지원, local relevance가 있는 delivery만 제한적으로 지원.
- Consequences: 공개 remote Post read path를 먼저 전달한다. Reply/thread는 [PROD-358](https://linear.app/byulmaru/issue/PROD-358), FOLLOWERS audience는 [PROD-360](https://linear.app/byulmaru/issue/PROD-360), DIRECT recipient authorization은 [PROD-359](https://linear.app/byulmaru/issue/PROD-359)가 별도 Issue → OpenSpec에서 결정한다.
- Confirmation / Follow-up: PROD-260이 personal/shared inbox에서 같은 public validation을 적용한다.

### PostgreSQL receipt가 domain side effect idempotency의 source of truth다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: Fedify KV idempotency와 Post transaction은 원자적이지 않아 restart, 여러 instance와 worker 사이 exactly-once를 보장하지 못한다.
- Decision Outcome: `Create.id.href`를 global receipt key로 사용하고 PostgreSQL unique receipt claim이 Post side effect의 durable source of truth가 된다. Fedify `withIdempotency("global")`은 조기 중복 제거로만 사용한다.
- Alternatives Considered: Fedify KV만 사용, 전체 KV backend 교체, object URI uniqueness만 사용.
- Consequences: receipt는 route/recipient/worker scope와 TTL 없이 영구 보존하며 KV와 DB 사이의 원자성은 요구하지 않는다.
- Confirmation / Follow-up: PROD-255가 receipt schema를, PROD-260이 activity ID input을, PROD-261이 claim/rollback을 검증한다.

### Receipt와 materialized Post side effect를 하나의 transaction으로 묶는다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: receipt-only 또는 Post-only commit은 재시도 불가나 중복 Post를 만든다.
- Decision Outcome: receipt claim, ActivityPub object mapping, `Post`, first/new `PostContent`, `Post.currentContentId`를 같은 PostgreSQL transaction에서 commit/rollback한다. object URI conflict는 실패한 transaction 밖의 새 transaction에서 mapping을 lock해 복구한다.
- Alternatives Considered: receipt 선커밋, object mapping uniqueness만으로 dedupe, aborted transaction 안에서 recovery query.
- Consequences: storage 실패는 receipt를 남기지 않아 재시도 가능하며 독립 connection concurrency test가 필요하다.
- Confirmation / Follow-up: PROD-261이 global receipt와 object URI race를 실제 PostgreSQL에서 검증한다.

### Canonical content는 PROD-341 문서와 PROD-259 projection을 재사용한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: remote ingestion change가 별도 TipTap/Plain Text 저장 shape를 정의하면 공통 PostContent revision 계약과 충돌한다.
- Decision Outcome: PROD-341의 `{ version, summary, body }` canonical PostContent document를 저장하고 PROD-259가 remote HTML/plain content와 ActivityStreams summary를 canonical ProseMirror body와 Plain Text Content Warning으로 projection한다.
- Alternatives Considered: TipTap JSON, Plain Text-only body, raw HTML 저장, ingestion 전용 document shape.
- Consequences: remote ingestion은 document schema와 renderer를 재정의하지 않으며 PROD-341 병합을 외부 선행 조건으로 갖는다.
- Confirmation / Follow-up: PROD-259가 projection, PROD-261이 structural equality와 Content Warning 기반 revision을 검증한다.

### Post-level mention relation을 이번 change에 만들지 않는다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: audience recipient와 본문 Mention은 서로 다른 의미이며 public-only ingestion에는 Post-level recipient relation이 필요하지 않다.
- Decision Outcome: 이번 change는 `post_mention` 또는 unknown mentioned Profile materialization을 추가하지 않는다. 일반 link는 canonical link mark로 보존하고 ActivityStreams Mention의 inline node/Profile relation은 PROD-340이 소유한다.
- Alternatives Considered: `to` recipient를 공통 Post relation으로 저장, 본문 anchor를 mention identity로 신뢰.
- Consequences: Mention notification과 mention 목록은 이번 archive gate에 포함되지 않는다. 본문 Mention은 PROD-340, audience recipient는 PROD-359가 서로 다른 관계로 소유한다.
- Confirmation / Follow-up: PROD-340이 body Mention identity와 revision-owned relation을 별도 계약으로 정의한다.

### GraphQL production read path는 재구현하지 않는다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: PR #212가 remote Profile/Post의 공통 visibility, instance 상태, `Profile.posts`, `homeTimeline`과 parent PostContent authorization을 이미 구현했다.
- Decision Outcome: remote ingestion은 기존 `Post`/`PostContent`/connection schema와 resolver를 변경하지 않는다. PROD-262는 mapping 없는 DB fixture로 현재 authorization과 zero-network read를 회귀 검증한다.
- Alternatives Considered: remote 전용 resolver, ActivityPub object mapping을 read prerequisite로 사용, resolver 변경을 ingestion slice에 포함.
- Consequences: 테스트가 결함을 발견하면 PROD-262에서 조용히 수정하지 않고 Linear/OpenSpec 구현 범위를 다시 연다.
- Confirmation / Follow-up: PROD-262와 PROD-256 통합 gate가 public schema 불변과 DB-only read를 검증한다.

## Remaining Decisions

- authenticated shared-inbox document loader identity는 PROD-355가 소유한다.
- ActivityStreams Mention은 PROD-340이 소유한다.
- Reply/thread는 PROD-358, FOLLOWERS audience는 PROD-360, DIRECT recipient authorization은 PROD-359가 소유하며 모두 PROD-256 통합 완료 뒤 별도 OpenSpec으로 진행한다.
- outbox traversal/backfill, update/delete, attachment/media와 queue/worker는 별도 이슈와 OpenSpec에서 결정한다.

## Superseded Decisions

- PR #184의 unknown inbound actor/mention materialization, followers collection 기반 private audience, Post-level `post_mention`, TipTap `bodyJson` revision과 process-local idempotency 계약은 위 결정으로 대체한다.
