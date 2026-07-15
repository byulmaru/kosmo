## Context

이 기록은 [PROD-354](https://linear.app/byulmaru/issue/PROD-354), 부모 [PROD-256](https://linear.app/byulmaru/issue/PROD-256), PROD-255/259/260/261/262와 완료된 [PROD-341](https://linear.app/byulmaru/issue/PROD-341)의 최신 계약을 반영한다. PR #258의 이전 activity receipt, duplicate revision과 lock recovery 설계는 source of truth가 아니다.

## Decision Records

### Inbox ingestion은 저장된 known actor만 허용한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: unknown inbound actor를 WebFinger/materialization하면 검증 전 network/write side effect와 abuse surface가 커지고 remote profile foundation의 소유권도 침범한다.
- Decision Outcome: 저장된 `ActivityPubActor + Profile + Instance`가 있고 Profile이 ACTIVE이며 Instance가 ACTIVITYPUB/ACTIVE 또는 ACTIVITYPUB/UNRESPONSIVE일 때만 Note hydration으로 진행한다. unknown, non-ActivityPub, inactive와 SUSPENDED actor는 network/profile write 없이 skip한다.
- Alternatives Considered: inbound unknown actor를 즉시 materialize, personal inbox recipient/follow 관계가 있을 때만 materialize.
- Consequences: 새 actor의 첫 게시글은 별도 profile materialization이 선행되어야 한다.
- Confirmation / Follow-up: PROD-260이 known actor 조회와 zero-network/write rejection을 검증한다.

### 공통 inbox route를 재정의하지 않고 remote-post Create handler만 소유한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: remote-post change가 `activitypub-actor-discovery` requirement 전체를 수정하면 remote-follow change와 route 소유권이 충돌한다.
- Decision Outcome: 이 change는 `activitypub-actor-discovery` delta를 갖지 않는다. PROD-260이 기존 activity-neutral route에 remote-post 전용 `Create` handler만 등록한다.
- Alternatives Considered: discovery requirement에 Follow와 Create allowlist를 다시 열거, remote-post 전용 HTTP inbox route 추가.
- Consequences: transport와 Create behavior가 독립적으로 진화한다.
- Confirmation / Follow-up: 현재 main 기준 diff에서 중복 delta가 없는지 확인한다.

### Public top-level Note만 첫 ingestion 범위로 지원한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: private audience와 reply는 recipient relation, thread reconstruction과 audience lifecycle을 함께 요구한다.
- Decision Outcome: attribution이 activity actor와 일치하는 PUBLIC/UNLISTED top-level `Note`만 허용한다. reply, followers-only, direct/private와 ambiguous addressing은 side effect 없이 skip한다.
- Alternatives Considered: Post-level recipient relation으로 private Note 지원, local relevance가 있는 delivery만 제한적으로 지원.
- Consequences: Reply/thread는 PROD-358, FOLLOWERS는 PROD-360, DIRECT는 PROD-359가 별도 OpenSpec에서 결정한다.
- Confirmation / Follow-up: PROD-260이 personal/shared inbox에서 같은 public validation을 적용한다.

### Note object URI가 durable materialization identity다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 최초 public Note ingestion의 observable invariant는 같은 Note object가 Post를 둘 만들지 않는 것이다. activity receipt를 함께 저장하면 object와 activity 두 identity가 같은 중복 책임을 나눠 갖고 영구 데이터와 transaction 복잡도를 추가한다.
- Decision Outcome: hydrated `Note.id.href`의 unique object mapping이 durable duplicate 판정이다. Fedify activity idempotency는 activity ID가 있을 때의 조기 최적화로만 사용하고 application은 activity ID를 저장하거나 materialization input으로 전달하지 않는다.
- Alternatives Considered: PostgreSQL global activity receipt, Fedify KV만 사용, activity ID를 object mapping에 함께 저장.
- Consequences: 같은 activity ID가 서로 다른 verified object URI를 가리키면 object별로 처리한다. activity-level audit/exactly-once가 실제 요구되면 별도 이슈에서 receipt를 다시 검토한다.
- Confirmation / Follow-up: PROD-255가 unique object mapping을, PROD-260이 activity ID 없는 delivery와 early idempotency 경계를 검증한다.

### Duplicate Create는 first-write-wins no-op으로 처리한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: duplicate `Create`로 기존 content를 갱신하면 canonical equality, revision write, mapping lock과 conflict recovery가 따라오지만 첫 ingestion에는 remote update 동기화 요구가 없다.
- Decision Outcome: 최초 object URI delivery만 mapping/Post/first PostContent를 만든다. 이미 mapping된 object URI의 duplicate `Create`는 content, visibility와 timestamp를 변경하지 않는다. concurrent loser transaction은 unique conflict에서 전체 rollback 후 no-op한다.
- Alternatives Considered: duplicate Create를 upsert/update로 사용, existing mapping을 `FOR UPDATE`로 잠가 revision 생성, activity receipt로 선직렬화.
- Consequences: remote content 변경은 `Update(Note)` 지원 전까지 반영되지 않는다. recovery transaction과 row lock이 필요하지 않다.
- Confirmation / Follow-up: PROD-261이 object URI당 Post 하나, loser rollback과 partial row 부재를 실제 PostgreSQL에서 검증한다.

### Canonical content 세부는 PROD-341을 참조하고 재정의하지 않는다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: remote ingestion change가 document node, canonicalization과 equality를 다시 열거하면 canonical PostContent capability와 중복되고 drift할 수 있다.
- Decision Outcome: PROD-259는 ActivityStreams content/mediaType/summary를 primitive projection input으로 바꾸고 PROD-341 validator가 수락한 canonical document를 반환한다. 이 change는 document schema, canonicalization, equality와 renderer를 다시 정의하지 않는다.
- Alternatives Considered: remote-ingestion 전용 document shape, PROD-341 V1 세부 복제, raw HTML 또는 Plain Text 저장.
- Consequences: remote-specific parsing과 safety는 PROD-259가, canonical document 의미는 PROD-341이 각각 단독 소유한다.
- Confirmation / Follow-up: PROD-259가 projection handoff를 검증하고 PROD-261은 검증된 최초 document만 저장한다.

### Post-level mention relation을 이번 change에 만들지 않는다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: audience recipient와 본문 Mention은 서로 다른 의미이며 public-only ingestion에는 Post-level recipient relation이 필요하지 않다.
- Decision Outcome: 이번 change는 `post_mention` 또는 unknown mentioned Profile materialization을 추가하지 않는다. ActivityStreams Mention identity/relation은 PROD-340이 소유한다.
- Alternatives Considered: `to` recipient를 공통 Post relation으로 저장, 본문 anchor를 mention identity로 신뢰.
- Consequences: Mention notification과 mention 목록은 이번 archive gate에 포함되지 않는다.
- Confirmation / Follow-up: PROD-340이 body Mention identity와 revision-owned relation을 별도 계약으로 정의한다.

### GraphQL production read path는 재구현하지 않는다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: PR #212가 remote Profile/Post의 공통 visibility, instance 상태와 parent PostContent authorization을 이미 구현했다.
- Decision Outcome: remote ingestion은 기존 `Post`/`PostContent`/connection schema와 resolver를 변경하지 않는다. PROD-262는 mapping 없는 DB fixture로 현재 authorization과 zero-network read를 회귀 검증한다.
- Alternatives Considered: remote 전용 resolver, object mapping을 read prerequisite로 사용, resolver 변경을 ingestion slice에 포함.
- Consequences: 테스트가 결함을 발견하면 Linear/OpenSpec 구현 범위를 다시 연다.
- Confirmation / Follow-up: PROD-262와 PROD-256 통합 gate가 public schema 불변과 DB-only read를 검증한다.

## Remaining Decisions

- `Update(Note)`/`Delete(Note)`와 remote revision 동기화는 별도 이슈와 OpenSpec이 소유한다.
- activity-level audit 또는 object와 무관한 side effect가 생길 때만 PostgreSQL receipt 필요성을 다시 결정한다.
- authenticated shared-inbox document loader identity는 PROD-355가 소유한다.
- ActivityStreams Mention은 PROD-340이 소유한다.
- Reply/thread는 PROD-358, FOLLOWERS는 PROD-360, DIRECT는 PROD-359가 소유한다.
- outbox traversal/backfill, attachment/media와 queue/worker는 별도 이슈에서 결정한다.

## Superseded Decisions

- PR #184의 unknown actor/mention materialization, private audience, Post-level `post_mention`, TipTap revision과 process-local durability 계약은 위 결정으로 대체한다.
- PR #258 이전 revision의 PostgreSQL global activity receipt, activity ID 영구 보존, duplicate Create revision 갱신, recovery transaction과 `FOR UPDATE` lock 결정은 object URI 기반 first-write-wins 결정으로 대체한다.
