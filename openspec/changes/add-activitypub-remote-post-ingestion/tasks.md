## 1. PROD-341 외부 선행: versioned PostContent document 계약을 제공한다 (완료)

**Deliverable**

remote ingestion이 참조할 canonical PostContent document와 server-only validation 경계가 main에 제공된다.

**Guardrails**

- PROD-341 구현과 archive는 이 change가 소유하지 않는다.
- remote ingestion 전용 document shape나 별도 canonical storage를 만들지 않는다.

**Verification**

- PROD-341의 PostContent 계약이 main에 병합됐고 이 change가 schema/canonicalization/equality를 재정의하지 않는지 확인한다.

- [x] 1.1 PROD-341 PR이 main에 병합되고 versioned PostContent document active spec이 제공된다.
- [x] 1.2 PROD-259/261이 참조할 canonical validator와 storage 계약을 확인한다.

## 2. PROD-255 ActivityPub object mapping schema를 추가한다

**Deliverable**

remote Note object URI와 Post identity를 PostgreSQL unique constraint로 보존한다.

**Guardrails**

- object mapping은 actor URI를 중복 저장하지 않고 actor RESTRICT/Post CASCADE를 사용한다.
- inbox activity receipt, activity ID column/table, TTL과 cleanup policy를 추가하지 않는다.
- 별도 production migration runner나 범용 KV backend를 만들지 않는다.

**Verification**

- clean test DB schema push와 catalog/constraint test로 object URI, Post mapping uniqueness와 FK 정책을 검증한다.
- PROD-255 구현 PR에 object mapping schema/migration과 자체 검증만 남는지 확인한다.

- [ ] 2.1 `ActivityPubObjectType.NOTE`, PostgreSQL `uuidv7()` primary-key default와 mapping table의 Drizzle schema/export를 추가한다.
- [ ] 2.2 unique URI/Post, actor index+RESTRICT, Post CASCADE와 nullable published metadata를 migration에 반영한다.
- [ ] 2.3 DB migration/catalog test에서 mapping ID의 PostgreSQL `uuidv7()` default와 기존 UUIDv8 row 호환을 검증하고 reset/push를 통과시키며 receipt, `TableDiscriminator` 또는 application-side ID 생성이 추가되지 않았는지 확인한다.

## 3. PROD-259 remote Note content를 canonical document input으로 projection한다

**Deliverable**

Fedify Note의 HTML/plain content와 summary를 안전한 primitive 경계에서 PROD-341 canonical validator가 수락하는 document로 projection한다.

**Guardrails**

- Fedify adapter 밖으로 vocabulary type/locale을 전달하지 않는다.
- raw HTML, executable markup/URL, image와 파생 Plain Text를 canonical storage로 만들지 않는다.
- document schema, canonicalization과 equality를 이 change나 PROD-259에서 재정의하지 않는다.
- ActivityStreams Mention identity/relation은 PROD-340으로 남긴다.

**Verification**

- HTML/plain/absent/malformed/unsupported MIME, LanguageString, safe link와 Content Warning fixture를 검증한다.
- 모든 성공 결과가 PROD-341 validator를 통과하고 구현 PR에 공유 OpenSpec diff가 없는지 확인한다.

- [ ] 3.1 primitive adapter가 content/mediaType/summary를 locale 없이 projection input으로 만든다.
- [ ] 3.2 HTML/plain parser가 visible content와 safe link를 보존하고 unsafe subtree/scheme/attribute를 제거한다.
- [ ] 3.3 projection 결과를 PROD-341 validator/canonicalizer에 전달하고 remote 전용 document 규칙을 만들지 않는다.
- [ ] 3.4 absent/attachment-only content와 safety fixture 및 target package check를 통과시킨다.

## 4. PROD-260 known-actor public Create(Note)를 materialization input으로 검증한다

**Deliverable**

actor-scoped/shared Fedify listener가 지원 delivery의 object identity, content primitive, published와 `receivedAt`만 후속 materialization에 전달한다.

**Guardrails**

- stored ACTIVE/UNRESPONSIVE ActivityPub actor만 허용하고 unknown actor/mention network/write를 수행하지 않는다.
- public marker가 있는 top-level Note만 허용한다.
- PROD-241의 activity-neutral inbox route를 재사용하고 `activitypub-actor-discovery`를 수정하지 않는다.
- Fedify activity ID는 early idempotency 외에 전달·저장하지 않으며 missing activity ID만으로 delivery를 거부하지 않는다. global idempotency를 사용하면 같은 activity ID의 후속 delivery는 object URI와 무관하게 handler 전에 제거될 수 있다.
- custom ActivityPub fetch/parser와 `trust`를 사용하지 않는다.

**Verification**

- validation unit test와 실제 personal/shared inbox route test로 zero-side-effect rejection과 object URI input을 검증한다.
- activity ID가 있는/없는 delivery, UNRESPONSIVE 복구와 concurrent SUSPENDED 전환을 검증한다.

- [ ] 4.1 listener에 typed `Create` handler를 연결하고 optional Fedify global idempotency의 activity ID prefilter 경계와 한 번 캡처한 `receivedAt`을 적용한다.
- [ ] 4.2 actor/object URI cardinality와 stored actor/Profile/Instance eligibility를 hydration 전에 검증한다.
- [ ] 4.3 Fedify documentLoader로 Note를 hydrate하고 ID, attribution, top-level 조건, published primitive와 cross-origin safety를 검증한다.
- [ ] 4.4 PUBLIC/UNLISTED addressing만 projection하고 unsupported/ambiguous audience를 side effect 없이 skip한다.
- [ ] 4.5 success input에 activity ID가 없고 missing activity ID도 object URI 기반으로 처리되는 route test를 통과시킨다.

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

## 6. PROD-261 remote Note 최초 저장을 원자적으로 materialize한다

**Deliverable**

최초 object mapping, Post와 canonical PostContent가 하나의 PostgreSQL transaction 결과로 저장된다.

**Guardrails**

- unique Note object URI가 durable duplicate 판정이다.
- duplicate Create는 first-write-wins no-op이며 existing Post를 갱신하지 않는다.
- activity receipt, activity ID persistence, recovery transaction과 `FOR UPDATE` lock을 만들지 않는다.
- conflict loser가 partial Post나 orphan PostContent를 남기지 않는다.

**Verification**

- 실제 PostgreSQL 독립 connection으로 personal/shared/restart/concurrent duplicate, rollback/retry와 object URI conflict를 검증한다.
- 최초 canonical document, Content Warning, published/received timestamp와 미래 published clamp를 검증한다.

- [ ] 6.1 object mapping/Post/first PostContent/currentContent를 하나의 transaction에서 commit/rollback한다.
- [ ] 6.2 unique object URI conflict loser의 전체 transaction을 rollback하고 duplicate no-op으로 종료한다.
- [ ] 6.3 duplicate Create가 existing content/visibility/timestamp를 바꾸지 않고 새 revision을 만들지 않게 한다.
- [ ] 6.4 concurrency/failure/timestamp integration test를 통과시키고 receipt·recovery lock 구현이 없는지 확인한다.

## 7. PROD-256 remote post ingestion 통합 검증과 archive를 완료한다

**Deliverable**

모든 implementation slice가 object URI 기반 public first-ingestion 계약으로 통합되고 canonical specs와 archive가 완료된다.

**Guardrails**

- activity receipt, duplicate Create revision, PROD-340, authenticated shared-inbox identity, queue/worker와 fetch/backfill을 archive gate로 끌어오지 않는다.
- Reply/thread(PROD-358), FOLLOWERS(PROD-360), DIRECT(PROD-359)과 Update/Delete lifecycle(PROD-365)은 별도 OpenSpec으로 진행한다.
- 구현 PR은 자기 slice의 코드/검증만 소유하고 이 공유 change를 별도로 수정하지 않는다.
- 개별 PR 완료만으로 change를 조기 archive하지 않는다.

**Verification**

- 실제 materialized row smoke, object URI당 Post 하나, loser rollback과 DB-only GraphQL read를 end-to-end로 확인한다.
- canonical specs sync, 전체 task 완료, strict validation과 workspace required checks를 확인한다.

- [ ] 7.1 PROD-341/255/259/260/262/261 PR 병합과 scoped validation 증거를 확인한다.
- [ ] 7.2 personal/shared concurrent delivery가 같은 object URI에서 Post side effect를 한 번만 commit하는지 검증한다.
- [ ] 7.3 PROD-341 canonical document/Content Warning과 initial timestamp가 existing GraphQL schema로 조회되는지 smoke 검증한다.
- [ ] 7.4 canonical activitypub-remote-post-ingestion/data-model specs와 delta를 동기화하고 기존 Post 계약에 diff가 없으며 receipt/duplicate-update 계약이 남지 않았는지 확인한다.
- [ ] 7.5 proposal 전체 scope 완료 후 change를 archive하고 archive 후 strict validation을 통과시킨다.
