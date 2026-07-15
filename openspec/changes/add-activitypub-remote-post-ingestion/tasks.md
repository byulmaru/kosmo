## 1. PROD-341 외부 선행: versioned PostContent document 계약을 제공한다

**Deliverable**

remote ingestion이 참조할 `{ version, summary, body }` canonical PostContent document와 server-only ProseMirror validation 경계가 main에 제공된다.

**Guardrails**

- PROD-341 구현과 archive는 이 change가 소유하지 않는다.
- remote ingestion 전용 document shape, TipTap 또는 별도 Plain Text canonical storage를 만들지 않는다.

**Verification**

- PROD-341이 이 change를 수정하지 않고 독립 PostContent 계약으로 main에 병합됐는지 확인한다.
- PROD-341의 schema, migration, GraphQL/app renderer와 validation이 통과했는지 확인한다.

- [ ] 1.1 PROD-341 PR이 remote-post OpenSpec diff 없이 main에 병합되고 versioned PostContent document active spec이 제공된다.
- [ ] 1.2 PROD-259/261이 참조할 canonicalization, structural equality와 Content Warning 계약을 확인한다.

## 2. PROD-255 ActivityPub object mapping과 durable receipt schema를 추가한다

**Deliverable**

remote Note object identity와 global inbound activity identity를 PostgreSQL constraint로 보존한다.

**Guardrails**

- object mapping은 actor URI를 중복 저장하지 않고 actor RESTRICT/Post CASCADE를 사용한다.
- receipt는 domain FK, TTL, cleanup, partitioning과 route/recipient/worker scope를 갖지 않는다.
- 별도 production migration runner나 범용 KV backend를 만들지 않는다.

**Verification**

- clean test DB schema push와 catalog/constraint test로 object URI, Post mapping, global activity ID uniqueness와 FK 정책을 검증한다.
- PROD-255 구현 PR에 schema/migration과 자체 검증만 남고 공유 OpenSpec diff가 없는지 확인한다.

- [ ] 2.1 `ActivityPubObjectType.NOTE`, PostgreSQL UUIDv7 primary key와 두 table의 Drizzle schema/export를 추가한다.
- [ ] 2.2 object mapping의 unique URI/Post, actor index+RESTRICT, Post CASCADE와 nullable published metadata를 migration에 반영한다.
- [ ] 2.3 global receipt의 unique activityId, receivedAt, FK 없음과 영구 보존 계약을 migration에 반영한다.
- [ ] 2.4 DB migration/catalog test와 reset/push 검증을 통과시키고 미래 policy/framework가 선제 추가되지 않았는지 확인한다.

## 3. PROD-259 remote Note content를 canonical document로 projection한다

**Deliverable**

Fedify Note의 HTML/plain content와 summary를 PROD-341 canonical ProseMirror document와 Plain Text Content Warning으로 안전하게 projection한다.

**Guardrails**

- Fedify adapter 밖으로 vocabulary type/locale을 전달하지 않는다.
- raw HTML, executable markup/URL, image와 파생 Plain Text를 canonical storage로 만들지 않는다.
- ActivityStreams Mention identity/relation은 PROD-340으로 남긴다.

**Verification**

- HTML/plain/absent/malformed/unsupported MIME, LanguageString, paragraph/text/hard_break/link와 Content Warning fixture를 검증한다.
- PROD-259 구현 PR이 main의 PROD-341 계약을 참조하고 공유 OpenSpec diff를 포함하지 않는지 확인한다.

- [ ] 3.1 primitive adapter가 content/mediaType/summary를 locale 없이 core projection input으로 만든다.
- [ ] 3.2 HTML/plain parser가 V1 allowlist document와 안전한 link mark를 만들고 unsafe subtree/scheme/attribute를 제거한다.
- [ ] 3.3 projection 결과를 PROD-341 schema/canonicalizer로 검증하고 summary를 nullable Plain Text Content Warning으로 만든다.
- [ ] 3.4 formatting-only 차이, empty/attachment-only content와 안전성 fixture 및 target package check를 통과시킨다.

## 4. PROD-260 known-actor public Create(Note)를 materialization input으로 검증한다

**Deliverable**

actor-scoped/shared Fedify listener가 지원 delivery만 단순 materialization input으로 전달한다.

**Guardrails**

- stored ACTIVE/UNRESPONSIVE ActivityPub actor만 허용하고 unknown actor/mention network/write를 수행하지 않는다.
- public marker가 있는 top-level Note만 허용한다.
- PROD-241의 activity-neutral inbox route를 재사용하고 `activitypub-actor-discovery` 공통 requirement를 수정하지 않는다.
- custom ActivityPub fetch/parser, `trust`, 별도 ID extraction helper와 Fedify 동작 복제 test를 만들지 않는다.
- Fedify global idempotency는 조기 filter이고 DB receipt가 durable source다.

**Verification**

- validation unit test와 실제 personal/shared inbox route test로 zero-side-effect rejection과 동일 global activity ID를 검증한다.
- UNRESPONSIVE 복구가 concurrent SUSPENDED 전환을 덮어쓰지 않는지 확인한다.

- [ ] 4.1 listener에 typed `Create` handler와 `withIdempotency("global")`을 연결하고 `Create.id.href`/receivedAt을 전달한다.
- [ ] 4.2 actor/object URI cardinality와 stored actor/Profile/Instance eligibility를 hydration 전에 검증한다.
- [ ] 4.3 Fedify documentLoader로 Note를 hydrate하고 ID, attribution, top-level 조건과 cross-origin safety를 검증한다.
- [ ] 4.4 PUBLIC/UNLISTED addressing만 projection하고 unsupported/ambiguous audience를 side effect 없이 skip한다.
- [ ] 4.5 success input과 missing ID, unknown/inactive/SUSPENDED actor, hydration/attribution failure 및 route behavior test를 통과시킨다.

## 5. PROD-262 DB-only GraphQL authorization 회귀를 검증한다

**Deliverable**

저장된 remote Post가 기존 GraphQL authorization, connection과 zero-network read 계약을 우회하지 않는다는 회귀 증거를 제공한다.

**Guardrails**

- resolver, visibility predicate와 공개 GraphQL schema를 변경하지 않는다.
- ActivityPub object mapping을 read prerequisite로 사용하지 않는다.
- 테스트가 production 결함을 발견하면 Linear/OpenSpec 구현 범위를 다시 연다.

**Verification**

- mapping 없는 remote fixture로 Post Node, current/historical PostContent, Profile.posts와 homeTimeline을 검증한다.
- ACTIVE/UNRESPONSIVE allow, SUSPENDED/inactive deny, local visibility/order/cursor와 remote fetch 0회를 검증한다.

- [ ] 5.1 mapping 없는 remote Profile/Post/PostContent DB fixture와 network-fail spy를 준비한다.
- [ ] 5.2 네 GraphQL surface의 parent authorization과 current/historical content visibility를 검증한다.
- [ ] 5.3 remote followee home 포함, non-followee 제외와 `Post.id DESC` ordering/cursor 회귀를 검증한다.
- [ ] 5.4 API integration/unit/schema/typecheck와 lint를 통과시키고 production code diff가 없는지 확인한다.

## 6. PROD-261 global receipt와 remote Note를 원자적으로 materialize한다

**Deliverable**

global receipt, object mapping, Post와 canonical PostContent revision이 하나의 durable PostgreSQL transaction 결과로 저장된다.

**Guardrails**

- receipt claim이 domain side effect의 최종 duplicate 판정이다.
- object URI conflict recovery는 aborted transaction 밖의 새 transaction에서 수행한다.
- 다른 unique violation을 object race로 정규화하지 않는다.
- visibility/actor mismatch delivery가 existing Post를 변경하지 않는다.

**Verification**

- 실제 PostgreSQL 독립 connection으로 personal/shared/worker/restart/concurrent 중복, rollback/retry와 object URI race를 검증한다.
- canonical document/Content Warning revision과 published/received timestamp를 검증한다.

- [ ] 6.1 transaction 시작에서 global receipt를 `ON CONFLICT DO NOTHING ... RETURNING`으로 claim하고 duplicate를 side-effect-free no-op으로 만든다.
- [ ] 6.2 최초 receipt/mapping/Post/PostContent/currentContent를 함께 commit/rollback한다.
- [ ] 6.3 object URI race를 sentinel rollback 후 새 transaction의 receipt claim과 `FOR UPDATE` mapping lock으로 복구한다.
- [ ] 6.4 same actor의 canonical document/Content Warning 의미 변화만 새 revision으로 저장하고 ownership/visibility/timestamp를 보존한다.
- [ ] 6.5 failure/retry, concurrent delivery, 다른 actor/object/visibility와 published/received boundary integration test를 통과시킨다.

## 7. PROD-256 remote post ingestion 통합 검증과 archive를 완료한다

**Deliverable**

모든 implementation slice가 공유 public-only 계약으로 통합되고 canonical specs와 archive가 완료된다.

**Guardrails**

- PROD-340, authenticated shared-inbox identity, queue/worker와 fetch/backfill을 archive gate로 끌어오지 않는다.
- Reply/thread(PROD-358), FOLLOWERS audience(PROD-360), DIRECT recipient authorization(PROD-359)은 PROD-256 완료 뒤 별도 OpenSpec으로 진행하며 이 change의 task로 추가하지 않는다.
- 구현 PR은 자기 slice의 코드/검증만 소유하고 이 공유 change를 별도로 수정하지 않는다.
- 개별 PR 완료만으로 change를 조기 archive하지 않는다.

**Verification**

- 실제 materialized row smoke, global receipt exactly-once, canonical content와 DB-only GraphQL read를 end-to-end로 확인한다.
- canonical specs sync, 전체 task 완료, strict validation과 workspace required checks를 확인한다.

- [ ] 7.1 PROD-341/255/259/260/262/261 PR 병합과 scoped validation 증거를 확인한다.
- [ ] 7.2 실제 personal/shared inbox delivery가 같은 global activity에서 Post side effect를 한 번만 commit하는지 검증한다.
- [ ] 7.3 canonical document/Content Warning과 published/received timestamp가 GraphQL에서 existing schema로 조회되는지 smoke 검증한다.
- [ ] 7.4 canonical data-model/Post specs와 delta를 동기화하고 전체 task 및 workspace required checks를 통과시킨다.
- [ ] 7.5 proposal 전체 scope 완료 후 change를 archive하고 archive 후 strict validation을 통과시킨다.
