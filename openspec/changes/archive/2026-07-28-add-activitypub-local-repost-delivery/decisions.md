## Context

이 기록은 canonical Post·Profile·Instance 문서와 ADR 0010·0014·0017, 최신 PROD-496·447·448 계약, 현재 `repostPost`·`deletePost`, PROD-494 Post URI resolver와 remote Follow post-commit delivery 경계를 반영한다. 구현자는 이 기록과 별개로 최신 canonical 문서와 Linear authority를 다시 확인해야 한다.

## Decision Records

### Announce와 Undo identity는 immutable Repost Post UUID에서 파생한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-496
- Status: Active
- Context / Problem: 중복 application action과 delivery 재호출이 서로 다른 activity를 만들면 원격 수신자가 같은 Repost lifecycle을 중복 객체로 처리하거나 Undo 대상을 식별하지 못한다.
- Decision Outcome: Announce ID는 configured Local Instance canonical origin의 `/ap/announce/{repostId}`, Undo ID는 같은 lifecycle에서 파생된 `/ap/announce/{repostId}#undo`다. Announce actor는 Repost Author actor, object는 PROD-494 공통 resolver가 반환한 direct Source URI, published는 Repost 생성 시각이다. Undo는 같은 원본 Announce를 가리킨다.
- Alternatives Considered: delivery 시점 UUID, GraphQL global ID, Author handle 포함 URI, Source URI와 actor pair 기반 identity. 재호출 안정성이 없거나 mutable/API presentation identity를 federation identity와 결합하므로 사용하지 않는다.
- Consequences: Repost와 Source 관계를 보존하는 동안 process restart와 호출 경로에 관계없이 Announce/Undo를 재구성할 수 있다. 별도 outbound activity mapping row는 만들지 않는다.
- Confirmation / Follow-up: Local/Remote Source, 반복 projection과 process context가 달라도 ID·actor·object·published가 같은지 검증한다.

### Undo는 Source의 현재 표현이 아니라 보존된 identity를 사용한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-496
- Status: Active
- Context / Problem: Repost가 취소될 때는 Repost가 Tombstone이고 Source도 먼저 Tombstone으로 전이됐을 수 있다. Active Note 제공 가능성을 요구하면 이미 전달한 Announce를 취소하지 못한다.
- Decision Outcome: Undo projection은 Tombstone Repost에 보존된 direct Source 관계와 canonical ActivityPub URI로 원본 Announce를 재구성한다. Source Content나 현재 Note representation은 요구하지 않되 relation 또는 URI를 해석할 수 없으면 delivery를 생략한다.
- Alternatives Considered: Active/Content Source만 Undo 허용, Announce payload를 별도 DB row에 저장, Source URI를 취소 시 network dereference. 첫 방식은 정상 취소를 막고 나머지는 PROD-448 또는 remote network scope를 끌어오므로 사용하지 않는다.
- Consequences: Source Tombstone 뒤에도 identity가 남으면 정확한 Undo가 가능하다. hard-deleted/missing mapping처럼 identity가 없으면 현재 non-durable 경계에서는 skip한다.
- Confirmation / Follow-up: Active와 Tombstone Local/Remote Source, missing mapping과 보존 관계 matrix를 검증한다.

### 실제 delivery recipient는 행동 Local Profile의 established remote follower다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-496
- Status: Active
- Context / Problem: Activity audience URI와 실제 HTTP inbox recipient는 다른 역할이다. 현재 followers dispatcher가 없고 Source Author를 별도 recipient로 추가하는 계약도 없다.
- Decision Outcome: Announce/Undo audience는 Repost Visibility의 followers/Public 규칙을 사용한다. 실제 recipient는 행동 Profile을 followee로 하는 established remote follower 중 Active Profile, ACTIVE 또는 UNRESPONSIVE ActivityPub Instance와 inbox를 가진 actor다. Local, Suspended, inactive와 missing inbox recipient는 제외하며 Source Author는 follower가 아니면 추가하지 않는다.
- Alternatives Considered: Source Author 항상 추가, 모든 materialized remote actor에게 broadcast, local follower 포함, ACTIVE Instance만 포함. 승인된 범위를 넓히거나 PROD-496의 ACTIVE/UNRESPONSIVE 계약을 축소하므로 사용하지 않는다.
- Consequences: shared inbox가 있으면 이를 우선할 수 있고 local state는 federation으로 재전달하지 않는다. UNRESPONSIVE endpoint 실패는 post-commit 경계에서 관측된다.
- Confirmation / Follow-up: follower 방향, Profile/Instance 상태, local/remote origin, inbox/shared inbox와 Source Author 비포함을 DB/Fedify test로 검증한다.

### 최초 application 상태 전이만 outbound delivery를 시작한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-496
- Status: Active
- Context / Problem: Repost 생성은 duplicate/concurrent 요청을 같은 Active row로 수렴시키고 삭제도 반복·동시 요청에 멱등 성공한다. 모든 성공 응답에서 delivery하면 같은 user action이 여러 번 발송된다.
- Decision Outcome: `repostPost`의 최초 생성 결과만 Announce를 시작하고, `deletePost` conditional update가 실제 Active→Tombstone 전이를 수행한 결과만 Undo를 시작한다. 반복 delivery helper 자체는 동일 identity를 유지하지만 application retry가 새 helper 호출을 만들지 않는다.
- Alternatives Considered: 모든 성공 요청에서 재전송, 별도 delivery deduplication table, 클라이언트 request ID. 불필요한 중복을 만들거나 durable transport 범위를 선행하므로 사용하지 않는다.
- Consequences: 생성은 기존 `created` 결과를 사용하고 삭제는 실제 conditional update 결과를 내부에 보존해야 한다. GraphQL payload는 바뀌지 않는다.
- Confirmation / Follow-up: 순차·동시 생성과 취소에서 한 결과만 delivery를 시작하고 일반 Post/Reply/Quote 삭제는 Repost Undo를 시작하지 않는지 검증한다.

### Repost core application service가 commit 후 Fedify를 동적 호출한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-447, PROD-496
- Status: Active
- Context / Problem: 현재 API package는 Fedify에 직접 의존하지 않고 core와 Fedify는 remote Follow에서 이미 dynamic import 기반 application→delivery 경계를 사용한다. Repost transaction callback이나 API 전용 분기에 delivery를 두면 검증된 경계와 caller 의미가 갈라진다.
- Decision Outcome: Repost core application service는 transaction 결과를 먼저 commit한 뒤 Repost Notification lifecycle을 best-effort로 처리하고, 최초 상태 전이에만 `@kosmo/fedify` delivery adapter를 dynamic import한다. 두 side effect는 실패를 공유하지 않는다. adapter는 committed Author origin을 검증해 non-local Repost를 skip한다. API resolver orchestration, static package cycle이나 새 API→Fedify dependency는 추가하지 않는다.
- Alternatives Considered: GraphQL resolver에서 Fedify 직접 호출, transaction callback 안에서 delivery, static core import, 별도 queue command service. 첫 방식은 application caller를 분산하고 나머지는 rollback 경계, package cycle 또는 제외 범위를 위반하므로 사용하지 않는다.
- Consequences: core 직접 caller와 GraphQL caller가 같은 post-commit contract를 사용하고 향후 inbound remote Repost caller는 Author origin 검증으로 outbound loop를 만들지 않는다. 기존 core↔Fedify dynamic cycle은 유지된다.
- Confirmation / Follow-up: transaction rollback에는 send가 없고 local 최초 전이만 send하며 remote-origin action은 skip하는 core service test로 검증한다.

### Direct delivery 실패는 committed Repost 결과와 분리한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: PROD-447, PROD-448, PROD-496
- Status: Active
- Context / Problem: DB transaction commit 이후 Fedify projection 또는 remote HTTP가 실패할 수 있다. 오류를 application 밖으로 전파하면 실제 Repost 상태와 GraphQL 실패 응답이 불일치한다.
- Decision Outcome: Announce/Undo projection과 send 오류는 Repost ID를 포함한 post-commit 관측 경계에서 catch/log하고, committed Active/Tombstone 상태와 기존 GraphQL payload를 반환한다. Notification side effect와도 실패를 공유하지 않는다.
- Alternatives Considered: delivery를 transaction에 넣어 rollback, GraphQL 실패 유지와 refetch, commit 전 NATS enqueue, 이번 change에서 outbox/queue 도입. domain/응답 불일치 또는 승인된 제외 범위를 위반하므로 사용하지 않는다.
- Consequences: commit→send 사이 process crash와 취소 시점 recipient 집합으로 인한 유실 구간이 남는다. PROD-448이 추후 same-transaction durable intent와 queue handoff로 이 임시 경계를 대체한다.
- Confirmation / Follow-up: Announce/Undo query·serialization·HTTP failure를 주입해 DB state와 GraphQL payload가 성공으로 유지되고 각 로그가 남는지 검증한다.

### Followers collection은 공개하지 않고 explicit recipient projection을 사용한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-496
- Status: Active
- Context / Problem: Note audience에는 followers collection URI가 있지만 collection GET과 actor property는 기존 범위에서 제외됐다. Fedify `sendActivity`의 followers shorthand는 dispatcher가 필요하다.
- Decision Outcome: 이번 delivery는 stored Follow와 ActivityPub actor endpoint에서 explicit recipient 배열을 만들고 Fedify에 전달한다. followers dispatcher, collection pagination/sync와 actor document 변경을 추가하지 않는다.
- Alternatives Considered: followers dispatcher를 함께 공개, 첫 page dispatcher만 구현, activity audience URI만 넘기고 실제 recipient를 생략. 제품 공개 범위를 넓히거나 부분 delivery/무전송을 만들므로 사용하지 않는다.
- Consequences: recipient projection query가 direct delivery 호출마다 실행된다. 대규모 fan-out과 collection sync는 별도 capability 또는 queue migration에서 다룬다.
- Confirmation / Follow-up: 저장 follower 전체가 explicit recipient로 전달되고 public collection route와 actor document가 바뀌지 않는지 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
