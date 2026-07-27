## Context

이 기록은 PROD-495의 verified inbound Announce/Undo 결과를 canonical Post 관계와 PROD-494 ActivityPub Post identity에 연결하고, 기존 Repost core action과 ActivityPub Post mapping을 재사용하기 위해 확정한 계약·구현 선택을 정리한다. Hackers’ Pub의 current-activity Repost 구현과 Fedify personal/shared inbox 동작을 비교한 뒤 사용자가 2026-07-27에 ABA generation ledger 없이 현재 identity 교체 모델을 선택했다.

## Decision Records

### Inbound Announce는 기존 Repost create/delete 계약을 재사용한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-495
- Status: Active
- Context / Problem: remote Announce를 별도 federation Repost 객체나 product path로 구현하면 기존 actor/source 유일성, visibility, count와 조회 계약을 복제한다.
- Decision Outcome: verified Actor Profile과 resolved Source Post를 기존 `repostPost` action에 전달하고, valid Undo는 기존 `deletePost` action으로 같은 Post를 Tombstone 처리한다. 결과는 Content와 Reply Parent 없이 direct Repost Source를 가진 기존 Post다.
- Alternatives Considered: 별도 ActivityPub Repost table/action, contentless `createPost` overload, Fedify handler의 policy 복제. 모두 canonical 관계 또는 기존 action 책임을 중복한다.
- Consequences: ingress adapter는 protocol identity와 target resolution만 소유하고 Repost eligibility, visibility, uniqueness, count와 조회는 core가 소유한다.
- Confirmation / Follow-up: local/remote Source, visibility rejection, count/조회와 create/delete action 실제 wiring을 통합 테스트한다.

### Announce object는 저장된 remote mapping 또는 canonical local Note로만 해석한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494, PROD-495
- Status: Active
- Context / Problem: target identity를 raw path나 network hydration으로 추측하면 다른 origin의 local Note 주장, duplicate remote Post source of truth와 scope 확장이 생긴다.
- Decision Outcome: exact existing `activitypub_post.uri` 또는 configured Local Instance canonical origin의 `/ap/note/{postId}`만 Post ID로 해석한다. actor와 object의 cross-origin Repost는 허용하고 unknown object는 fetch/materialize하지 않는다.
- Alternatives Considered: 모든 object network fetch, path-only local UUID parse, actor/object same-origin 제한. 각각 remote ingestion 재구현, origin spoofing 또는 정상 cross-origin Repost 거절을 만든다.
- Consequences: 아직 저장되지 않은 remote Post Announce는 no-op이며, 후속 ingestion 뒤 새 delivery에서만 처리될 수 있다.
- Confirmation / Follow-up: remote/local exact match, cross-origin local-path rejection, missing/unavailable/contentless target를 검증한다.

### Remote Repost의 기존 ActivityPub Post mapping에 현재 Announce URI를 저장한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-495
- Status: Active
- Context / Problem: Undo가 현재 Announce generation의 Repost만 삭제하려면 activity identity와 materialized Repost identity가 durable하게 연결되어야 한다. Source Note mapping에 필드를 추가하면 여러 Actor가 같은 Source를 Repost하는 cardinality와 맞지 않는다.
- Decision Outcome: remote contentless Repost Post에 기존 `activitypub_post` row를 연결하고 unique `uri`를 현재 Announce ID, unique `postId`를 Repost ID로 사용한다. 같은 actor/source의 새 Announce는 core가 반환한 같은 Active Repost mapping의 URI와 metadata를 교체한다. Repost와 mapping은 같은 transaction에서 저장하고, existing mapping row를 잠가 concurrent Announce/Undo를 직렬화한다. Undo 뒤 같은 URI가 재사용되면 같은 actor/source의 삭제된 이전 generation mapping만 제거하고 새 Active Repost가 identity를 넘겨받는다.
- Alternatives Considered: 새 Announce table, all-generation ledger, Source mapping의 Announce column, Repost mapping의 별도 `announceUri` column. 사용자는 ABA 위험이 중요하지 않다고 결정해 ledger를 선택하지 않았고, 나머지는 기존 1:1 mapping 의미를 중복하거나 cardinality가 맞지 않는다.
- Consequences: 새 schema/migration이 없다. A→B 뒤 늦은 Undo A는 no-op이지만 오래된 Announce A가 다시 handler에 도달하면 삭제된 A mapping을 양보시킨 뒤 current URI가 A로 돌아갈 수 있고, 사용자는 이 trade-off를 수용했다. 같은 actor/source의 concurrent A/B 최종 current URI ordering은 보장하지 않는다. row lock은 mapping identity 교체와 Undo 삭제 사이의 Post/mapping 원자성에만 한정한다.
- Confirmation / Follow-up: personal/shared duplicate, concurrent same ID, A→B, 늦은 Undo A, URI/Post unique collision과 transaction rollback을 검증한다.

### Activity와 Actor origin은 묶고 Source origin은 독립 허용한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, PROD-495
- Status: Active
- Context / Problem: verified signature만으로는 다른 origin의 activity identity를 Actor가 주장하는 입력을 handler 수준에서 제한하지 않지만, actor와 object same-origin은 정상 Repost를 막는다.
- Decision Outcome: Announce ID와 Announce actor URI, Undo object activity ID와 Undo actor URI는 각각 same-origin이어야 한다. Source object는 actor와 다른 origin이어도 exact target resolution을 통과하면 허용한다.
- Alternatives Considered: signature ownership만 사용, actor/object까지 same-origin 요구. 전자는 Hackers’ Pub보다 느슨한 activity ownership이고 후자는 정상 cross-origin Repost를 거절한다.
- Consequences: ActivityPub 일반 규격의 보편적 MUST가 아니라 이 ingress의 보수적 보안 선택이다. origin이 분리된 구현은 현재 Announce ingress에서 호환되지 않는다.
- Confirmation / Follow-up: mismatched activity/actor origin rejection과 cross-origin Source acceptance를 테스트한다.

### Shared inbox는 recipient 부재와 to/cc 비명시를 허용한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-495
- Status: Active
- Context / Problem: Fedify는 personal inbox에는 identifier를, shared inbox에는 null recipient를 제공하며 공개 Announce는 `to`/`cc`에 개별 Local Profile을 나열하지 않을 수 있다.
- Decision Outcome: personal recipient validity는 기존 actor dispatcher에 맡기고 shared `recipient = null`을 허용한다. handler는 `to`/`cc` local recipient를 추가 수락 조건으로 만들지 않고 verified actor와 target Repost 권한을 검사한다.
- Alternatives Considered: shared inbox 거절, `to`/`cc` local actor/followers 필수. 모두 PROD-495의 shared inbox 결과와 일반 federation delivery를 불필요하게 제한한다.
- Consequences: 수신 대상 relevance는 HTTP inbox endpoint와 Fedify verification, 실제 Source access policy로 결정된다.
- Confirmation / Follow-up: production listener에서 personal/shared 같은 activity가 하나의 Repost로 수렴하고 recipient 없는 shared delivery가 처리되는지 검증한다.

### Undo는 현재 mapping identity와 verified Author만으로 삭제한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-495
- Status: Active
- Context / Problem: embedded Announce 전체를 dereference하거나 payload의 actor/source를 삭제 key로 사용하면 network 의존과 spoofable duplicate data가 생긴다.
- Decision Outcome: verified outer Undo actor, Undo object activity URI, current Repost mapping URI와 stored Repost Author가 정확히 일치할 때만 Active contentless direct Repost를 삭제한다. superseded URI, Tombstone mapping과 다른 actor는 no-op이다.
- Alternatives Considered: embedded Announce mandatory hydration/전체 비교, activity URI만으로 삭제, actor/source pair 최신 Repost 삭제. 각각 network scope 확장 또는 다른 actor/generation 삭제 위험이 있다.
- Consequences: IRI-only Undo도 current mapping으로 처리할 수 있고, unknown object는 dereference하지 않는다. 기존 embedded Follow Undo는 별도 분기로 유지한다.
- Confirmation / Follow-up: current/superseded/repeated/new-generation/different-actor Undo와 Follow Undo 회귀를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
