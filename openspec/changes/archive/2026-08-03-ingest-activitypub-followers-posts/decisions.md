## Context

이 decision log는 PROD-360의 구현·통합 검증·archive 결과를 위해 canonical Post, Follow Relationship, Post List 정책과 Core 서비스 경계를 OpenSpec으로 정렬한 기록이다. proposal의 범위와 두 spec delta를 반영하되, OpenSpec 자체를 제품 authority로 사용하지 않는다.

## Decision Records

### Audience priority and canonical followers identity

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md#activitypub-local-note-표현`, `PROD-360`
- Status: Active
- Context / Problem: 공식 ActivityPub/Mastodon addressing은 Mention addressee 같은 actor URI를 Note의 `to`·`cc`에 함께 넣을 수 있다. 이를 audience marker와 동일하게 해석하거나 extra URI를 이유로 전체를 거절하면 기존 PUBLIC/UNLISTED와 새 FOLLOWERS 분류가 깨진다.
- Decision Outcome: Note `to`·`cc`를 `to` Public → PUBLIC, `to`에는 Public이 없고 `cc` Public → UNLISTED, 둘 다 없고 verified author canonical followers URI가 있으면 FOLLOWERS 순으로 분류한다. 인식된 marker가 있으면 구문상 유효하게 파싱된 actor/collection URI, 순서·중복과 foreign/unknown/spoofed-looking followers URI는 visibility를 바꾸거나 Note를 무효화하지 않는다. author canonical marker가 없고 Public도 없으면 actor-only·foreign-followers-only audience는 unsupported no-op으로 건너뛴다. raw malformed audience syntax는 기존 vocabulary hydration/basic validation에서 처리한다.
- Alternatives Considered: `to`·`cc`의 위치를 무시하거나 첫 audience를 임의 선택하고, 검증 가능한 collection 개수·foreign URI·구문상 유효한 extra IRI를 이유로 전체를 거절하는 방식은 canonical Post Visibility와 공식 addressing 호환성을 위반하므로 선택하지 않는다.
- Consequences: Public/Unlisted 기존 수신은 extra actor URI가 있어도 유지되고, author canonical identity가 있는 Followers Only도 extra URI가 있어도 유지된다. author canonical identity가 없는 임의 URI와 spoofed-looking URI 자체, delivery route는 FOLLOWERS 권한 근거가 아니다. foreign collection을 분류하기 위해 network dereference나 `/followers` 경로 휴리스틱을 사용하지 않는다.
- Confirmation / Follow-up: Public-to, Public-cc, canonical followers 각각에 extra mention actor URI·중복·foreign/unknown URI를 넣은 회귀와 actor-only·foreign-followers-only no-op을 확인한다.

### Extra actor URI does not create mention side effects

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md#activitypub-local-note-표현`, `PROD-360`
- Status: Active
- Context / Problem: PROD-360은 Mention 관계·알림·수신자 모델을 구현하는 change가 아니지만, Note audience에 actor URI가 포함될 수 있다.
- Decision Outcome: recognized Public/Unlisted/author canonical followers marker 뒤의 extra actor URI는 audience addressee로만 무시한다. 이 URI로 Mentioned Profile 관계, Notification, DIRECT/limited recipient authorization 또는 viewer access를 생성하지 않으며, body/tag Mention 보존·파싱도 이 change에 포함하지 않는다.
- Alternatives Considered: actor URI를 Mention recipient로 materialize하거나 viewer 권한으로 승격하는 방식은 이슈 범위를 넘어 새 durable relation·notification·authorization 계약을 만들므로 선택하지 않는다.
- Consequences: audience marker 회귀는 materialization visibility와 no-side-effect만 증명하고, Mention 구현·알림·recipient 모델의 존재를 가정하지 않는다.
- Confirmation / Follow-up: 세 visibility 분류 각각에서 extra mention actor URI를 보존하는 inbound 회귀와 actor-only/foreign-only no-op, 관계·알림·접근 권한 미생성을 함께 확인한다.

### Established Follow Relationship is the local relevance boundary

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-relationship.md#조회-정책`, `docs/domain/policies/post-list.md#후보-정책`, `docs/domain/objects/post.md#조회-정책`, `PROD-360`
- Status: Active
- Context / Problem: personal/shared inbox로 전달됐다는 사실만으로 모든 local viewer에게 Followers Only Post를 materialize하거나 노출할 수 없다.
- Decision Outcome: inbound relevance에는 remote followee를 향한 Active local Profile·Active local Instance follower의 현재 established Follow Relationship을 사용한다. GraphQL non-author viewer access는 기존 viewer→author established 관계와 Profile/Instance eligibility 정책을 유지하며 viewer locality를 새 조건으로 만들지 않는다. 관계가 없는 Profile, pending/rejected Follow Request, unfollow 뒤 Profile, inactive follower Profile/Instance와 reverse-only 관계는 inbound 대상이 아니며, Author Profile에 대한 기존 Post Visibility 허용은 보존한다. Note의 extra actor URI는 이 관계를 대체하지 않는다.
- Alternatives Considered: follower collection URI, inbox route, reverse relation 또는 local membership mirror를 권한 근거로 사용하는 방식은 canonical 관계 방향과 보안 제약을 충족하지 못한다.
- Consequences: 수신 시 relevance와 조회 시 access를 같은 방향 관계로 판정하고, 관계가 제거되거나 Profile/Instance eligibility가 바뀌면 저장 Post는 read-time에서 더 이상 노출되지 않을 수 있다.
- Confirmation / Follow-up: personal/shared accepted fixture와 guest/non-follower/pending/reverse/unfollow/suspension GraphQL 검증을 함께 실행한다.

### Reuse atomic Post creation and first-write-wins idempotency

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md#행동`, `docs/architecture/core-services.md#책임`, `PROD-360`
- Status: Active
- Context / Problem: inbound Note를 별도 저장 경로로 만들면 Post, PostContent와 ActivityPub mapping의 원자성·duplicate 결과가 기존 local/remote contract와 어긋날 수 있다.
- Decision Outcome: 수신 관련성이 확인된 Followers Only Note는 기존 remote Post creation transaction과 object URI unique mapping을 재사용한다. 최초 입력만 mapping·ACTIVE Post·first PostContent를 만들고, duplicate/concurrent conflict는 부분 row를 rollback한 no-op으로 끝내며 최초 visibility/timestamp를 바꾸지 않는다.
- Alternatives Considered: 별도 Followers table, membership mirror, recovery transaction 또는 mapping lock은 현재 계약에 필요한 추가 durable state와 race 경계를 만들므로 선택하지 않는다.
- Consequences: DB migration은 없고, invalid 입력은 write 전에 거절되며, retry는 같은 object URI에 대해 안전하게 수행된다.
- Confirmation / Follow-up: first-write, duplicate, concurrent, projection failure rollback fixture로 mapping/Post/PostContent count와 timestamp를 확인한다.

### Reuse shared GraphQL visibility and list policy

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md#조회-정책`, `docs/domain/policies/post-list.md#후보-정책`, `docs/architecture/core-services.md#public-contract`, `PROD-360`
- Status: Active
- Context / Problem: Node, Profile.posts, homeTimeline과 상세 조회가 각자 follower 예외를 가지면 page-limit 전 filtering과 Author access 경계가 분리된다. Note의 extra actor URI를 Mentioned Profile 구현으로 해석해서도 안 된다.
- Decision Outcome: existing Post Visibility·Eligibility access boundary와 list candidate policy를 모든 GraphQL surface가 공유하도록 연결한다. 기존 pagination/order와 remote read의 DB-only 원칙을 유지한다.
- Alternatives Considered: follower 전용 top-level query, UI cache filtering 또는 surface별 join은 동일한 공개 계약을 보장하지 못하므로 선택하지 않는다.
- Consequences: helper/query 구현은 바뀔 수 있지만 established follower와 기존 Author 접근의 observable 결과는 동일해야 하며, extra actor URI에서 Mention 관계·notification·recipient authorization·viewer access를 만들지 않고 read path에서 federation fetch를 추가하지 않는다.
- Confirmation / Follow-up: Post Node, Profile.posts, homeTimeline, detail fixture에서 accepted/denied viewer와 page-boundary 후보를 검증한다.

### Keep common observability ownership with PROD-634

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-360`
- Status: Active
- Context / Problem: PROD-360 완료 조건은 inbound 실패를 공통 outcome/phase/reason 경계에서 확인해야 하지만, 해당 logging/Sentry 계측은 related non-blocker PROD-634의 소유 범위다.
- Decision Outcome: 이 change는 PROD-634의 공통 logging/Sentry 구현을 복제하지 않는다. exact outcome/phase/reason 값이 별도 authority로 확인된 경우에만 integration test에서 호환성을 assert한다.
- Alternatives Considered: 이 change에서 독자적인 logger·Sentry schema를 추가하는 방식은 관측 경계를 중복하고 두 contract를 divergence시킬 수 있어 선택하지 않는다.
- Consequences: PROD-634 완료가 PROD-360 구현의 blocker는 아니며, authority 없는 enum 값은 구현·spec에서 발명하지 않는다.
- Confirmation / Follow-up: common observability contract가 제공되면 compatibility assertion만 추가하고, 그렇지 않으면 이 change는 delivery/materialization/read 결과만 검증한다.

### Stable observability field values remain upstream-owned

- Decision Date: 2026-08-03
- Decision Class: Upstream Change Required
- Authority / Provenance: 없음.
- Status: Superseded
- Superseded By: `Keep common observability ownership with PROD-634`
- Context / Problem: PROD-360은 outcome/phase/reason 호환성을 요구했지만 PROD-634의 구체 값과 공개 계약은 이 change의 authority로 제공되지 않았다. 최신 소유 경계에서 common observability는 PROD-634가 담당하며 PROD-360의 blocker가 아니다.
- Decision Outcome: 이 record는 PROD-360에서 abandoned/out-of-scope로 처리한다. exact field names, enum values와 retention/logging semantics는 현재 OpenSpec의 normative requirement나 task checkbox로 확정하지 않으며, 후속 PROD-634가 canonical contract로 소유한다.
- Alternatives Considered: 임의의 reason catalog를 만들거나 기존 log 문자열을 계약으로 승격하는 방식은 upstream authority 없이 제품 행동을 추가하므로 선택하지 않는다.
- Consequences: 이 change의 implementation과 완료 검증은 안정적인 materialization/access 결과에 한정한다. exact observability enum은 이 change가 발명·소유하지 않고 후속 PROD-634에서 정한다.
- Confirmation / Follow-up: PROD-634가 common observability contract를 제공하면 해당 change에서 compatibility 검증을 추가한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `Stable observability field values remain upstream-owned`는 PROD-360에서 abandoned/out-of-scope로 처리하고, `Keep common observability ownership with PROD-634` Active decision으로 대체했다. exact `outcome`·`phase`·`reason` enum과 공개 compatibility 범위는 후속 PROD-634의 소유이며 이 change의 archive blocker가 아니다.
