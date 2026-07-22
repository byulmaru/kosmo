## Context

이 기록은 canonical Post 관계 조합과 조회 정책, 부모 계약 PROD-388, 구현 이슈 PROD-393·398·399·400·429·422, 그리고 PROD-394가 이미 제공한 Repost Source 저장 기반을 반영한다. 구현자는 각 decision의 Authority / Provenance를 최신 canonical·Linear와 독립적으로 다시 확인해야 한다.

## Decision Records

### Post 구조는 세 관계의 조합으로 판정한다

- Decision Date: 2026-07-22
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/objects/post.md`, `PROD-388`, `PROD-393`
- Status: Active
- Context / Problem: Reply와 Quote가 동시에 성립하고 Repost와 Quote가 같은 Source 관계를 사용하므로 배타적인 Post Kind는 실제 구조를 표현하지 못한다.
- Decision Outcome: 일반 Post, Reply, Quote, Reply+Quote와 Repost를 Content, Reply Parent와 Repost Source 존재 조합으로 판정한다. Content와 Repost Source가 모두 없거나 Content 없이 Reply Parent가 있는 조합은 거부한다.
- Alternatives Considered: 별도 Post Kind enum, Reply와 Quote를 배타적으로 분류, 별도 Quote Source 관계. canonical 관계 조합과 충돌하므로 사용하지 않는다.
- Consequences: 공통 core 검증은 다섯 허용 조합을 모두 이해해야 하고 Reply Parent와 Repost Source를 독립적으로 저장한다.
- Confirmation / Follow-up: PROD-393 core·migration test와 부모 PROD-388 통합 검증에서 조합별 결과를 확인한다.

### Reply Parent는 생성 전용 immutable 직접 관계로 유지한다

- Decision Date: 2026-07-22
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `PROD-393`
- Status: Active
- Context / Problem: Reply thread의 직접 구조를 보존하면서 self-reference와 cycle을 안전하게 제한해야 한다.
- Decision Outcome: 새 Post는 이미 존재하는 Parent만 직접 참조하고 생성 뒤 Reply Parent를 변경하는 action/API를 제공하지 않는다. Reply Parent 직접 self-reference는 DB CHECK와 core에서 거부하고 Repost Source 직접 self-reference도 core에서 거부한다. 정상 생성 경로에는 recursive cycle scan이나 constraint trigger를 추가하지 않는다.
- Alternatives Considered: 관계 변경 API, 매 생성 시 recursive graph scan, database constraint trigger. 현재 생성 전용 계약에 불필요하고 write 비용·복잡도를 늘리므로 제외한다.
- Consequences: 정상 core write는 구조적으로 다단계 cycle을 만들지 않지만 raw SQL이나 미래 update 경로가 만든 비정상 cycle은 조회 경계에서 방어해야 한다.
- Confirmation / Follow-up: PROD-393은 변경 API가 없고 self-reference가 rollback되는지 검증하며 PROD-399·400은 재귀 조회가 유한하게 종료되는지 검증한다.

### Parent와 Source는 contentful Post여야 한다

- Decision Date: 2026-07-22
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/objects/post.md`, `PROD-393`
- Status: Active
- Context / Problem: Content 없는 Repost가 Reply Parent나 Repost Source가 되면 canonical Post 구조와 사용자에게 보여줄 직접 대상을 만족하지 못한다.
- Decision Outcome: Parent와 Source는 존재하고 `currentContentId`가 있어야 한다. 두 관계가 같은 contentful Post를 가리키는 것은 허용하며, 대상이 나중에 Tombstone이 되어도 저장 ID는 유지한다.
- Alternatives Considered: Content 없는 Repost를 관계 대상으로 허용, Source와 Parent가 같은 대상인 조합 거부, Tombstone 시 FK null 처리. canonical 계약과 충돌하므로 사용하지 않는다.
- Consequences: 생성 시 대상 존재와 Content를 검사하고 조회 시 lifecycle·visibility·eligibility를 별도로 적용한다.
- Confirmation / Follow-up: PROD-393은 missing/contentless/same-target/Tombstone 시나리오를 검증한다.

### 관계 입력 실패를 기존 core error 계약으로 매핑한다

- Decision Date: 2026-07-22
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-393`, `memory/graphql-style.md`
- Status: Active
- Context / Problem: optional Parent/Source 입력의 실패를 caller가 기존 domain error 경계에서 일관되게 처리해야 한다.
- Decision Outcome: 존재하지 않는 Parent/Source는 `NotFoundError('Post not found')`, Content 없는 대상과 구조·self-reference 위반은 원인이 된 `replyParentId` 또는 `repostSourceId` field의 `ValidationError`로 반환한다.
- Alternatives Considered: 모든 실패를 Not Found로 마스킹, DB constraint error 직접 노출, 새 error type 추가. field 귀속성과 기존 error 계층을 잃거나 불필요한 공개 계약을 추가하므로 사용하지 않는다.
- Consequences: core validator는 입력 field를 보존하고 transaction 밖으로 DB 세부 오류를 노출하지 않아야 한다.
- Confirmation / Follow-up: PROD-393 service test에서 error class, message·field와 rollback을 확인한다.

### PROD-393은 additive Reply migration만 소유한다

- Decision Date: 2026-07-22
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-393`, `PROD-394`, `memory/database-migrations.md`
- Status: Active
- Context / Problem: Reply Parent를 추가하면서 이미 병합된 Repost Source schema·migration·index를 중복 소유하거나 후속 조회 최적화를 앞당기면 migration 책임이 섞인다.
- Decision Outcome: nullable Reply Parent self-FK와 직접 self-reference CHECK를 새 forward migration으로 추가한다. PROD-394 migration과 partial unique index는 변경하지 않고 `reply_parent_id` 조회 index는 실제 descendant query와 실행 계획을 소유하는 PROD-400으로 미룬다.
- Alternatives Considered: PR #316 migration 수정, Repost index 재생성, descendant index 선행 추가. migration history와 이슈 소유권을 침범하거나 측정 없는 index가 되므로 제외한다.
- Consequences: 구버전 workload는 새 nullable column을 무시할 수 있고 PROD-400 전까지 descendant production query는 제공하지 않는다.
- Confirmation / Follow-up: migration catalog·기존 row·Repost index 회귀와 lock/table rewrite 위험을 검증한다.

### Content와 두 관계를 최종 Post update에서 연결한다

- Decision Date: 2026-07-22
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-393`, `memory/coding-style.md`
- Status: Active
- Context / Problem: DB가 생성하는 새 Post ID로 self-reference를 검사하면서 기존 contentful `createPost` 반환·ActivityPub first-write-wins 계약과 원자성을 보존해야 한다.
- Decision Outcome: transaction에서 빈 관계의 Post와 Content를 생성하고 공통 구조·대상 검증을 수행한 뒤 `currentContentId`, `replyParentId`, `repostSourceId`를 마지막 Post update에서 함께 연결한다. 기존 Local/ActivityPub 입력에는 두 nullable 관계 ID만 optional로 추가하고 반환 shape는 유지한다.
- Alternatives Considered: 관계를 순차 update, caller별 validator 복제, 새 public generic action 추가. 부분 상태와 검증 중복 또는 현재 이슈 밖의 API를 만들므로 제외한다.
- Consequences: 실패하면 Post, ActivityPub mapping과 Content까지 모두 rollback되며 후속 Repost/Quote caller가 같은 구조 경계를 재사용할 수 있다.
- Confirmation / Follow-up: PROD-393 service test에서 Local/ActivityPub 회귀, 조합 저장과 모든 실패 rollback을 확인한다.

### Reply 조회는 관계별 visibility 경계를 유지한다

- Decision Date: 2026-07-22
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `PROD-398`, `PROD-399`, `PROD-400`, `PROD-422`
- Status: Active
- Context / Problem: Parent·조상·descendant의 조회 가능성이 현재 Post와 다를 수 있어 단일한 thread 단위 권한 필터가 숨은 Content를 노출하거나 visible Reply를 제거할 수 있다.
- Decision Outcome: 직접 Parent는 unavailable이면 nullable field만 숨기고 현재 Post를 유지한다. 조상 경로는 unavailable Parent에서 중단하며 건너뛰지 않는다. descendant는 각각 독립 판정하여 숨겨진 Parent 아래의 visible Reply를 Parent 비노출만으로 제거하지 않는다.
- Alternatives Considered: Parent와 현재 Post를 함께 숨김, 숨은 조상 평탄화, 숨은 Parent에서 descendant 탐색 중단. canonical 조회 정책과 충돌하므로 제외한다.
- Consequences: ancestor와 descendant traversal은 서로 다른 filtering 지점을 가지며 client는 API 경계를 그대로 표시해야 한다.
- Confirmation / Follow-up: PROD-398·399·400의 API test와 PROD-422 client integration test에서 각각 검증한다.

### 조상·descendant 공개 GraphQL collection shape를 확정해야 한다

- Decision Date: 2026-07-22
- Decision Class: Upstream Change Required
- Authority / Provenance: 없음.
- Status: Blocked
- Context / Problem: PROD-399·400은 관찰 가능한 관계·visibility 행동을 정의하지만 field 이름, list/connection, pagination과 정렬 방향은 정의하지 않는다.
- Decision Outcome: 현재 change에서 임의의 공개 GraphQL shape를 규범 계약으로 만들지 않는다. PROD-399·400 구현 전에 Linear에서 각 shape를 확정하고 이 decision을 authority가 있는 Active decision으로 대체한다.
- Alternatives Considered: `replyAncestors`/`replyDescendants` 이름과 connection·정렬을 OpenSpec만으로 즉시 확정. 공개 API를 upstream 근거 없이 추가하므로 보류한다.
- Consequences: PROD-393·398은 이 결정과 무관하게 진행할 수 있지만 PROD-399·400 및 이를 소비하는 PROD-422는 이 decision이 Blocked인 동안 구현할 수 없다.
- Confirmation / Follow-up: 해당 Linear 이슈 본문·댓글 갱신과 별도 Issue Gate 승인 뒤 specs·design·tasks를 갱신한다.

## Remaining Decisions

- PROD-399 조상 경로의 GraphQL field 이름, collection shape와 순서 방향
- PROD-400 descendant의 GraphQL field 이름, connection·pagination과 정렬 계약
- PROD-422 thread의 세부 배치·중첩 표현 중 PROD-451 presentation 범위와 겹치지 않는 integration 경계

## Superseded Decisions

- 없음.
