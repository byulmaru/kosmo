## Context

이 기록은 PROD-358, canonical Post 관계와 ActivityPub Local Note identity, 완료된 PROD-494·445·393·256, 그리고 2026-07-27 Parent 미해석 처리 논의를 반영한다. 구현자는 OpenSpec이 아니라 최신 canonical 문서와 Linear 계약을 독립적으로 다시 확인해야 한다.

## Decision Records

### 원격 Reply는 저장된 Post의 직접 Reply Parent 관계를 사용한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-358, PROD-393
- Status: Active
- Context / Problem: 원격 `inReplyTo`를 raw protocol metadata로만 보존하면 canonical Post 관계와 GraphQL Reply 조회가 별도 source of truth에 의존한다.
- Decision Outcome: 유효한 원격 Reply는 Content와 `replyParentId`를 가진 기존 Post로 저장하고 Content가 있는 Parent Post를 직접 참조한다. `inReplyTo`는 Repost Source나 Post Kind가 아니다.
- Alternatives Considered: raw `inReplyTo` URI column, 별도 Reply table/type, Post Kind enum. 승인된 관계 조합과 단일 Post 계약을 중복하므로 사용하지 않는다.
- Consequences: 기존 core Post 구조 검증과 GraphQL `replyParent`를 재사용하며 새 schema나 concrete type이 필요하지 않다.
- Confirmation / Follow-up: materialized row와 기존 GraphQL Post field integration test로 확인한다.

### Local과 Remote Post는 범용 canonical ActivityPub identity lookup으로 해석한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-358, PROD-494
- Status: Active
- Context / Problem: Local Post에는 remote mapping이 없고 Remote Post는 저장 mapping URI가 identity이므로 한쪽 방식만 사용하면 일부 Post를 해석할 수 없다. URI identity lookup에 Reply Parent의 Content 조건을 넣으면 다른 ActivityPub 관계에서 범용으로 재사용할 수 없다.
- Decision Outcome: Local Post는 Fedify가 등록된 Note object route로 parse한 canonical ID, Remote Post는 existing ActivityPub Post mapping exact URI로 해석한다. lookup은 현재 Content 보유 여부와 독립적이며 Reply Parent의 Content 조건은 기존 core 생성 계약이 검증한다.
- Alternatives Considered: mapping이 있는 Remote Post만 지원, 모든 Local Post mapping 생성, URI path와 origin을 직접 재구현, lookup에서 Content Parent만 반환. canonical identity를 일부 누락하거나 mapping 의미를 바꾸거나 Fedify route 규칙을 중복하거나 범용 lookup 책임을 좁히므로 사용하지 않는다.
- Consequences: inbound reverse lookup은 Fedify object route와 PROD-494 outbound identity 규칙을 재사용하며 다른 ActivityPub 관계도 같은 Post identity lookup을 사용할 수 있다.
- Confirmation / Follow-up: Local/Remote exact URI, 다른 origin의 유사 Local path, contentless Post도 identity로 찾되 Parent 연결은 core가 거부하는 fixture로 확인한다.

### 현재 slice는 미해석 Parent를 fetch하지 않고 materialization을 보류한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-358 및 2026-07-27 구현 결정 댓글
- Status: Superseded
- Context / Problem: Parent가 아직 저장되지 않았을 때 canonical Reply 관계 없이 부분 Post를 만들지 않으면서, PROD-358의 제외 범위인 remote fetch와 재귀 materialization도 구현하지 않아야 한다.
- Decision Outcome: 현재 delivery에서 저장된 Parent를 해석할 수 없으면 Reply 관련 row를 만들지 않고 종료한다. Parent 저장 뒤 같은 Create가 재전달되면 현재 상태를 다시 평가한다. 이 선택은 장기 Parent fetch 정책을 확정하지 않는다.
- Alternatives Considered: Parent 없는 top-level Post로 저장, raw URI만 저장, inbox 처리 중 Parent fetch 또는 재귀 materialization. 첫 두 방식은 canonical 관계를 잃거나 별도 source of truth를 만들고, 나머지는 현재 승인 범위를 넘으므로 사용하지 않는다.
- Consequences: delivery 순서에 따라 Reply가 당장 나타나지 않을 수 있다. 후속 fetch/retry 계약은 이 결정을 근거로 영구 배제할 수 없다.
- Confirmation / Follow-up: unknown Parent에서 row/network call 없음과 Parent 저장 뒤 재전달 성공을 검증한다.

### 미해석 또는 부적합 Parent는 top-level fallback으로 저장한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-358 및 2026-07-27 구현 결정 댓글
- Status: Active
- Context / Problem: 원격 Note 자체를 보존하면서 현재 저장 상태에서 연결 가능한 Reply Parent만 canonical 관계로 materialize해야 한다. 미해석 Parent 때문에 Note 전체를 보류하면 remote content ingestion 결과가 delivery 순서에 의존한다.
- Decision Outcome: `inReplyTo`가 모호하거나 지원하지 않는 형식이거나, Post identity를 찾지 못하거나, 해석된 Post가 core Reply Parent 검증을 통과하지 못하면 Note를 `replyParentId` 없는 top-level Post로 저장한다. 현재 inbox 처리에서 Parent fetch나 재귀 materialization은 수행하지 않는다.
- Alternatives Considered: Note 전체 보류, raw `inReplyTo` 저장, inbox 처리 중 Parent fetch 또는 재귀 materialization. 전체 보류는 content 보존을 delivery 순서에 종속시키고, raw URI는 별도 source of truth를 만들며, fetch와 재귀 처리는 현재 승인 범위를 넘으므로 사용하지 않는다.
- Consequences: 먼저 top-level로 저장된 object URI는 first-write-wins 때문에 duplicate Create만으로 Parent가 연결되지 않는다. 향후 Parent fetch를 도입하면 기존 Post의 Parent update/backfill lifecycle을 별도로 정의해야 한다.
- Confirmation / Follow-up: malformed, unknown, contentless Parent가 top-level로 저장되고 network fetch가 없으며 Parent 저장 뒤 duplicate delivery도 기존 nullable 관계를 유지하는지 검증한다.

### 원격 Reply는 기존 ActivityPub createPost transaction을 재사용한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: PROD-358, PROD-256, PROD-393
- Status: Active
- Context / Problem: Reply 전용 insert 흐름은 기존 remote mapping unique conflict와 Post/Content atomicity를 복제하고 duplicate 관계를 변경할 수 있다.
- Decision Outcome: 기존 ActivityPub `createPost` 입력에 해석된 `replyParentId`를 전달해 Post, mapping, Content와 Parent link를 같은 transaction에 둔다. object URI conflict는 기존 first-write-wins 결과를 유지한다.
- Alternatives Considered: inbound handler의 직접 insert, 저장 후 Parent update, duplicate delivery의 upsert. transaction 경계와 immutable 최초 Create 계약을 깨므로 사용하지 않는다.
- Consequences: 새 DB migration 없이 core Parent Content validation과 rollback을 재사용한다.
- Confirmation / Follow-up: duplicate, concurrent delivery와 transaction rollback test로 확인한다.

### 장기 Parent fetch와 관계 update lifecycle은 별도 upstream 계약이 필요하다

- Decision Date: 2026-07-27
- Decision Class: Upstream Change Required
- Authority / Provenance: 없음.
- Status: Superseded
- Context / Problem: 장기적으로 미해석 Parent를 가져오고 먼저 top-level로 저장된 Post에 관계를 연결할 필요가 있을 수 있지만 fetch 시점, 재귀 깊이, SSRF/권한, parsing limit, 기존 Post update/backfill, retry와 비용 한계가 아직 canonical 또는 Linear 계약으로 승인되지 않았다.
- Decision Outcome: PROD-358은 해당 fetch·update lifecycle을 구현하거나 영구 미지원으로 확정하지 않는다. 이 항목은 현재 change의 구현 decision이 아니므로 archive 시점에 decision record에서는 supersede하고, 향후 필요하면 canonical 문서와 별도 Linear 계약에서 새로 범위와 안전 한계를 승인한다.
- Alternatives Considered: 현재 OpenSpec에서 fetch 방향만 미리 고정, 단순 one-hop fetch를 암묵 구현. upstream authority 없이 후속 제품·운영 계약을 선점하므로 채택하지 않는다.
- Consequences: 현재 top-level fallback을 Parent 관계의 영구 폐기 정책으로 인용할 수 없다.
- Confirmation / Follow-up: 후속 계약이 생기기 전에는 구현 task에 포함하지 않는다.

## Remaining Decisions

- Parent fetch, 재귀 materialization, 기존 top-level Post의 Parent update/backfill, retry/queue와 실행 비용 제한은 별도 upstream 계약이 승인될 때 결정한다.

## Superseded Decisions

- `현재 slice는 미해석 Parent를 fetch하지 않고 materialization을 보류한다`는 2026-07-27 top-level fallback 결정으로 대체됐다.
- `장기 Parent fetch와 관계 update lifecycle은 별도 upstream 계약이 필요하다`는 현재 change의 결정이 아니라 후속 upstream 미결정이므로 `Remaining Decisions`에만 유지한다.
