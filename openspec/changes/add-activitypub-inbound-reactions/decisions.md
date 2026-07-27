## Context

이 기록은 canonical Reaction·Post·Notification 계약, 완료된 PROD-494 Post identity 기반, 최신 PROD-498 수신
계약과 현재 core/Fedify transaction 제약을 반영한다. 제품 범위는 local·stored remote Post의 inbound Reaction이며
outbound, collection과 신규 remote ingestion은 포함하지 않는다.

## Decision Records

### Inbound Reaction은 Local Post와 저장된 Remote Post를 모두 대상으로 한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-498
- Status: Active
- Context / Problem: PROD-494는 local·remote Post identity를 공통 해석하지만 최초 질문안은 대상 Post를 Local
  Note로만 제한했다.
- Decision Outcome: object URI는 파생 Local Note URI 또는 기존 `ActivityPubPosts.uri` exact match로 해석한다.
  두 경우 모두 기존 Post와 Author를 사용하고 Remote Post를 새로 fetch하거나 materialize하지 않는다.
- Alternatives Considered: Local Note만 허용하는 방식은 사용자가 확정한 remote Post Reaction 수신을 누락한다.
  unknown object fetch는 PROD-498의 저장된 대상 검증 경계를 넘어선다.
- Consequences: inbound lookup은 local path parsing과 remote mapping lookup을 함께 제공하고 동일한 Post 접근 정책을
  적용해야 한다.
- Confirmation / Follow-up: local·remote target 성공과 unknown URI no-op을 각각 DB-backed test로 확인한다.

### Target Post Author actor를 activity recipient로 검증한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`, PROD-498
- Status: Active
- Context / Problem: shared inbox는 route-level recipient가 `null`일 수 있고 Remote Post Author는 Kosmo local actor가
  아니므로 local inbox identifier만으로 target recipient를 검증할 수 없다.
- Decision Outcome: activity의 recipient URI 집합에 대상 Post Author의 ActivityPub actor URI가 포함되어야 한다.
  personal inbox identifier가 있을 때는 Fedify route와 local recipient 일관성도 유지한다.
- Alternatives Considered: Local Post Author만 recipient로 허용하면 Remote Post 범위가 사라진다. shared inbox에서
  recipient 검증을 생략하면 target Author와 무관한 activity를 materialize할 수 있다.
- Consequences: target lookup은 Post Author의 canonical actor URI도 반환해야 한다.
- Confirmation / Follow-up: local·remote Author recipient 성공, missing/mismatched recipient와 personal route mismatch를
  검증한다.

### Unsupported content는 heart Reaction으로 투영한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, PROD-498
- Status: Active
- Context / Problem: FEP-c0e0 activity는 Kosmo가 저장하지 않는 Unicode와 custom emoji content를 포함할 수 있다.
- Decision Outcome: 정확한 여섯 허용 Type은 유지하고 missing·unsupported Unicode·shortcode/tag는 `❤️`로
  투영한다. `Like(content)`와 `EmojiReact(content)`는 같은 규칙을 사용한다.
- Alternatives Considered: unsupported content 거부는 PROD-498 fallback을 위반한다. custom emoji registry는 현재
  canonical 저장 범위 밖이다.
- Consequences: handler는 content를 core validator에 넘기기 전에 fallback을 적용하고 custom emoji metadata를
  저장하지 않는다.
- Confirmation / Follow-up: 여섯 Type, missing, unsupported Unicode와 shortcode/tag fixture를 확인한다.

### Activity URI mapping은 최초의 exact Reaction identity를 보존한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, PROD-498
- Status: Active
- Context / Problem: duplicate와 concurrent delivery, 같은 activity URI의 payload 재사용이 core Reaction 유일성과
  Undo 대상을 흐릴 수 있다.
- Decision Outcome: activity URI와 Reaction을 1:1로 같은 transaction에 저장한다. 같은 URI·actor·Post·Type은
  멱등 성공하고 다른 payload는 최초 mapping을 바꾸지 않는다. 같은 core 관계가 mapping 없이 이미 있으면 기존
  Reaction에 최초 activity URI를 연결한다.
- Alternatives Considered: last-write-wins remap은 다른 actor나 Post의 Undo 권한을 탈취할 수 있다. activity별 core
  Reaction 생성은 canonical `(Profile, Post, Type)` 유일성을 위반한다.
- Consequences: database unique 제약과 conflict 후 identity 비교가 모두 필요하다. 한 core Reaction에 두 번째
  activity URI는 연결하지 않는다.
- Confirmation / Follow-up: exact duplicate, URI payload conflict, core 관계 선존재와 concurrent delivery를 검증한다.

### Undo는 저장된 activity URI로 정확한 source를 제거한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, PROD-498
- Status: Active
- Context / Problem: FEP-c0e0은 Undo object URI를 사용하고 구현체는 embedded activity도 보낼 수 있다. 기존
  Post/Type delete는 activity-specific source identity를 보존하지 않는다.
- Decision Outcome: URI object와 embedded `Like`/`EmojiReact`를 모두 허용하지만 저장 mapping URI만 삭제
  identity로 사용한다. Undo와 embedded actor는 원래 actor와 일치해야 하며 대상은 네트워크에서 역참조하지 않는다.
- Alternatives Considered: embedded-only는 FEP 예시와 호환되지 않는다. Post/Type delete는 mapping 뒤 재생성된
  source를 잘못 제거할 수 있다. remote dereference는 replay와 network attack surface를 넓힌다.
- Consequences: core는 exact Reaction ID와 mapping을 같은 transaction에서 제거하고 실제 삭제 ID만 Notification
  cleanup에 전달해야 한다.
- Confirmation / Follow-up: URI·embedded success, missing/repeated, actor mismatch와 no-network loader를 검증한다.

### Mapping table은 additive 1:1 lifecycle을 사용한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/reaction.md`, PROD-498
- Status: Active
- Context / Problem: activity URI를 기존 Reaction row에 nullable column으로 섞으면 local Reaction과 protocol
  projection의 ownership이 결합되고 future federation projection을 구분하기 어렵다.
- Decision Outcome: 별도 ActivityPub Reaction mapping table에 unique activity URI와 unique non-null Reaction FK를
  두고 Reaction 삭제 시 cascade한다. migration은 backfill 없는 additive change다.
- Alternatives Considered: Reaction nullable `activity_uri` column은 local row 대부분에 의미 없는 protocol field를
  추가한다. 범용 activity table은 현재 Reply/Repost/outbound까지 선결정하는 과도한 추상화다.
- Consequences: 구버전은 table을 무시할 수 있고 rollback 시 table을 남길 수 있다. mapping row는 Reaction보다
  오래 존재하지 않는다.
- Confirmation / Follow-up: Drizzle schema, migration SQL, catalog와 direct DB lifecycle fixture를 검증한다.

### Notification은 실제 source 변화에만 Best Effort로 연결한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, PROD-498
- Status: Active
- Context / Problem: duplicate mapping과 Notification 실패가 inbound Reaction source 결과를 중복하거나 rollback할
  수 있다.
- Decision Outcome: 새 core Reaction이 commit된 경우에만 기존 Notification create를 호출하고 실제 Undo source
  삭제 뒤 기존 cleanup을 호출한다. 두 projection 실패는 source와 mapping 결과를 바꾸지 않는다.
- Alternatives Considered: 모든 delivery마다 create를 호출하는 방식은 duplicate 처리와 불필요한 작업을 만든다.
  Notification을 source transaction에 포함하면 canonical Best Effort 경계가 깨진다.
- Consequences: transaction result가 `created`와 removed source ID를 명시해야 한다.
- Confirmation / Follow-up: duplicate no-notification과 create/cleanup 실패 격리를 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
