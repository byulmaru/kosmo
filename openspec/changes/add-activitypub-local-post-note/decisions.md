## Context

이 기록은 PROD-494, canonical Post·Instance·Post 공유 참조와 ADR 0017, 기존 actor discovery와 remote Post mapping
계약, 현재 Fedify·Post·Follow·PostContent·DB 구현을 반영한다. 구현자는 OpenSpec이 아니라 최신 canonical 문서와
Linear 계약을 독립적으로 다시 확인해야 한다.

## Decision Records

### Local Note identity는 canonical origin과 immutable Post UUID에서 파생한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494
- Status: Active
- Context / Problem: handle, request host 또는 API URL 변화와 무관한 Local Post federation identity가 필요하다.
- Decision Outcome: Content가 있는 Local Post identity는 configured Local Instance canonical origin의
  `/ap/note/{postId}`이며 `postId`는 immutable DB UUID다. Web 공유 참조는 별도 `url` 속성으로 유지한다.
- Alternatives Considered: Web 공유 URL을 Note ID로 사용, Author handle을 path에 포함, GraphQL global ID 사용.
  mutable presentation identity 또는 API encoding을 federation identity와 결합하므로 사용하지 않는다.
- Consequences: 같은 Post는 재시작과 요청 host에 무관하게 같은 URI를 가지며 Local Note dispatcher는 exact path를
  공용 공개 계약으로 유지해야 한다.
- Confirmation / Follow-up: canonical origin 변경 입력, process restart와 alternate request host에서도 같은 ID를
  반환하는 unit/integration test로 확인한다.

### Local Post에는 remote ActivityPub Post mapping을 만들지 않는다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494, PROD-255
- Status: Active
- Context / Problem: 기존 ActivityPub Post mapping은 received/published metadata를 가진 remote object ingestion
  경계이며 Local identity까지 저장하면 같은 table의 의미와 lifecycle이 섞인다.
- Decision Outcome: Local Post URI는 Post ID에서 파생하고 mapping row를 만들지 않는다. Remote Post는 기존 unique
  mapping URI를 사용하며 local/remote 공통 identity resolver가 이 구분을 캡슐화한다.
- Alternatives Considered: 모든 Local Post mapping backfill, 최초 역참조 시 lazy mapping 생성. remote-only 저장
  계약을 바꾸고 불필요한 중복 identity를 만들므로 사용하지 않는다.
- Consequences: mapping 부재만으로 Local 여부를 판정할 수 없고 configured Local Instance 소속 Author를 확인해야
  한다. 후속 activity는 별도 URI 규칙을 만들지 않고 같은 resolver를 사용한다.
- Confirmation / Follow-up: Local 역참조 전후 mapping row가 늘지 않고 Remote Parent는 저장 URI를 사용하는 DB
  integration test로 확인한다.

### Post URI resolver는 packages/fedify가 소유한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494
- Status: Active
- Context / Problem: Local/Remote Post URI 해석은 outbound Note와 후속 federation activity가 공유하지만 GraphQL과
  일반 core Post action에는 필요하지 않은 ActivityPub protocol projection이다.
- Decision Outcome: 공통 Post URI resolver와 Local Note URI projection은 `packages/fedify`가 소유한다.
  `packages/core`는 Post, Instance와 mapping 저장 조회 계약만 제공한다.
- Alternatives Considered: `packages/core` 공개 service, `apps/web` route helper, activity별 URI 조립. core domain에
  protocol URL을 노출하거나 BFF와 후속 activity에서 규칙을 중복하므로 사용하지 않는다.
- Consequences: Fedify dispatcher와 후속 activity delivery는 같은 package 경계를 재사용하고 GraphQL/API는 이
  resolver에 의존하지 않는다. 내부 helper와 query 분리는 구현 중 달라질 수 있다.
- Confirmation / Follow-up: package dependency와 후속 재사용 가능한 export, Local/Remote URI test로 확인한다.

### Note serialization은 기존 PostContent 계약을 재정의하지 않는다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0015-post-share-reference.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-341, PROD-494
- Status: Active
- Context / Problem: Local Note가 GraphQL 표현이나 remote ingestion parser와 별도 의미를 만들지 않으면서 안전한
  protocol 표현을 제공해야 한다.
- Decision Outcome: id, attributedTo, published, Web url, canonical document의 safe HTML content와 선택적 summary를
  제공하되 node, mark, canonicalization, validation과 safe link 정책은 PROD-341을 그대로 사용한다. Public은
  Public/followers, Unlisted는 followers/Public, Followers Only는 followers만 audience로 사용하고 Mentioned
  Profiles는 제공하지 않는다.
- Alternatives Considered: PROD-494에서 V1 node/mark 재정의, canonical JSON 직접 문자열화, 모든 visibility를
  anonymous로 반환, 현재 범위에 Media/Mention/Quote 속성 포함. 기존 content 계약을 중복하거나 권한·범위를
  위반하므로 사용하지 않는다.
- Consequences: PROD-494는 ActivityPub HTML export 연결만 소유한다. PostContent schema 확장은 해당 canonical
  capability가 먼저 결정하고 Note export는 새 schema 의미를 참조해 후속 정렬한다.
- Confirmation / Follow-up: node별 HTML, escaping, Content Warning과 visibility별 exact audience test로 확인한다.

### ActivityPub HTML export는 ProseMirror DOMSerializer를 사용한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-341, PROD-494, PROD-502
- Status: Active
- Context / Problem: 기존 server-only ProseMirror schema는 validation과 `parseDOM`을 제공하지만 node/mark spec에
  `toDOM`이 없어 outbound HTML serialization은 아직 완성되지 않았다. 별도 수동 renderer는 schema 의미를 중복한다.
- Decision Outcome: existing PostContent ProseMirror node/mark spec에 현재 canonical 의미와 일치하는 `toDOM`을
  보완하고, validated canonical body를 `Schema.nodeFromJSON()`과 `DOMSerializer.fromSchema()`로 HTML export한다.
  앱의 React Native renderer나 inbound HTML parser를 재사용하지 않는다.
- Alternatives Considered: 수동 JSON 순회 renderer, React Native renderer의 server adaptation, inbound parser
  역사용. ProseMirror schema를 단일 serialization source로 활용하지 못하고 node·mark 책임을 중복하므로 사용하지
  않는다.
- Consequences: `prosemirror-model`은 기존대로 server-only에 남으며 `toDOM`은 저장 schema나 앱 bundle을 바꾸지
  않는다. DOM document 제공과 wrapper adapter의 내부 형태는 고정하지 않는다.
- Confirmation / Follow-up: canonical document를 nodeFromJSON/check 후 DOMSerializer로 직렬화하고 PROD-341
  paragraph·hard break·link fixture와 unsafe input 거부를 재사용해 검증한다.

### Followers collection identity는 canonical actor URI의 followers suffix다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494, PROD-175
- Status: Active
- Context / Problem: audience에 사용할 Author followers collection의 안정적인 절대 URI가 필요하지만 이번 범위는
  collection endpoint와 actor `followers` 속성을 제공하지 않는다.
- Decision Outcome: followers audience identity는 canonical actor URI
  `/ap/actor/{authorProfileId}`에 `/followers`를 붙인 `/ap/actor/{authorProfileId}/followers`다. 이 URI는 이번
  변경에서 address로만 사용하며 GET collection이나 actor document 속성을 열지 않는다.
- Alternatives Considered: Web `/{relativeHandle}/followers`, handle 기반 ActivityPub path, 새 top-level
  `/ap/followers/{id}`, collection endpoint까지 함께 구현. Web UI와 protocol identity를 섞거나 기존 actor path와
  불필요하게 갈라지고 PROD-494 범위를 넓히므로 사용하지 않는다.
- Consequences: Note audience는 안정적 URI를 가지지만 현재 해당 URI의 직접 GET은 계속 unsupported다. collection을
  공개하는 후속 계약은 같은 identity를 재사용해야 한다.
- Confirmation / Follow-up: visibility별 Note audience와 기존 followers path 404 회귀 test를 함께 확인한다.

### Followers Only signed fetch 성공 응답은 shared cache에 저장하지 않는다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494
- Status: Active
- Context / Problem: Note body 자체가 requester별로 달라지지 않아도 Followers Only의 200 여부는 signed actor와
  stored Follow 관계에 의존한다. Fedify 기본 success response만 사용하면 shared cache 격리를 명시적으로 보장할
  수 없다.
- Decision Outcome: Followers Only 성공 응답에는 `Cache-Control: private, no-store`를 적용한다. 권한 실패는
  Post가 없는 것처럼 처리하고 cache를 통해 성공 representation이 anonymous 또는 다른 actor에게 재사용되지 않게
  한다.
- Alternatives Considered: `Vary: Signature`만 사용, CDN별 authenticated cache key, Fedify 기본 header에 의존.
  HTTP Signature 전체를 cache key로 삼는 복잡도와 배포별 암묵 설정을 피하고 가장 좁고 검증 가능한 정책을 택한다.
- Consequences: Followers Only Note는 shared cache 성능 이점을 사용하지 않지만 authorization 경계를 deployment
  cache 설정과 독립적으로 보존한다. Public/Unlisted는 이 decision으로 `no-store`를 강제하지 않는다.
- Confirmation / Follow-up: authorized success의 exact Cache-Control과 같은 URI의 anonymous/non-follower 요청이
  representation을 받지 않는 web integration test로 확인한다.

### inReplyTo는 requester와 무관한 저장 Parent identity다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494
- Status: Active
- Context / Problem: Reply Note 자체와 Parent Note의 visibility가 다를 수 있으며 Parent visibility로
  `inReplyTo`를 필터링하면 같은 Reply URI의 표현이 requester별로 달라진다.
- Decision Outcome: Reply Parent 관계가 있으면 Local Parent는 파생 Note URI, Remote Parent는 저장 mapping URI를
  `inReplyTo`로 제공한다. Parent visibility, block 또는 Tombstone으로 다시 필터링하지 않고 Parent Content 접근은
  Parent dispatcher가 독립적으로 판정한다.
- Alternatives Considered: requester가 Parent를 볼 때만 포함, Parent Content snapshot embed, unavailable Parent에서
  Reply 전체 숨김. identity와 Content 권한을 결합하거나 canonical Reply eligibility를 위반하므로 사용하지 않는다.
- Consequences: requester가 Parent Content를 볼 수 없어도 Parent IRI는 알 수 있다. Tombstone Parent IRI도 관계가
  유지되는 동안 남고 relation이 null일 때만 생략한다.
- Confirmation / Follow-up: public Reply/private Parent, Tombstone Parent, Local/Remote Parent와 null relation test로
  확인한다.

### Parent Tombstone은 관계를 보존하고 FK만 future physical delete에 대비한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494
- Status: Active
- Context / Problem: canonical Post 삭제는 Tombstone 전이며 현재 Parent row physical delete application flow는
  없다. 다만 FK 기본 동작을 그대로 두면 향후 actual cleanup이 Reply 보존 정책과 충돌한다.
- Decision Outcome: Tombstone update는 `replyParentId`를 유지한다. physical delete action/service/API는 추가하지
  않고 Reply Parent self-FK delete action만 `ON DELETE SET NULL`로 바꾼다.
- Alternatives Considered: Tombstone 시 nullify, 현재 FK 유지, Reply cascade delete. thread identity를 조기에
  잃거나 future cleanup이 surviving Reply를 막거나 제거하므로 사용하지 않는다.
- Consequences: forward migration은 FK metadata만 바꾸고 기존 data를 rewrite하지 않는다. 현재 production 행동은
  Tombstone이므로 새로운 physical delete runtime case가 생기지 않는다.
- Confirmation / Follow-up: migration catalog, existing relation/Tombstone 보존과 직접 DB fixture delete의 FK
  동작만 PostgreSQL test로 확인하며 application physical-delete flow는 만들지 않는다.

### Activity delivery는 Local Note object 경계와 분리한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494
- Status: Active
- Context / Problem: 후속 Reply·Repost·Reaction federation이 같은 identity를 필요로 하지만 PROD-494가 delivery
  lifecycle까지 소유하면 독립 이슈의 검증과 rollout 경계가 합쳐진다.
- Decision Outcome: 이 변경은 object identity, Note projection과 dereference만 제공한다. Create/Delete, Announce,
  Like/EmojiReact/Undo, outbox/queue/retry와 ActivityPub Tombstone/Delete는 구현하지 않는다.
- Alternatives Considered: Local Reply/Repost/Reaction delivery 동시 구현, 범용 activity framework 선행 구축. 현재
  계약보다 넓고 독립 deliverable을 묶으므로 사용하지 않는다.
- Consequences: 후속 activity 이슈는 공통 identity/projection을 재사용하지만 각 delivery audience, ordering,
  retry와 lifecycle을 독립적으로 결정하고 검증한다.
- Confirmation / Follow-up: dispatcher 구현 diff와 회귀 test에서 새 outbound/inbox activity handler가 없음을
  확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
