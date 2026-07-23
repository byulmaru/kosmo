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
- Confirmation / Follow-up: PROD-393은 package 내부 구조 validator 단위 test와 DB CHECK test로 직접 self-reference 거부를 검증하며 PROD-399·400은 깊이 제한 없이 cycle에서 유한하게 종료되는지 검증한다.

### Reply Parent는 contentful Post여야 한다

- Decision Date: 2026-07-22
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/objects/post.md`, `PROD-393`
- Status: Active
- Context / Problem: Content 없는 Repost가 Reply Parent가 되면 canonical Post 구조와 사용자에게 보여줄 직접 대상을 만족하지 못한다.
- Decision Outcome: Reply Parent는 존재하고 `currentContentId`가 있어야 한다. Parent가 나중에 Tombstone이 되어도 저장 ID는 유지한다. Source 대상에는 같은 canonical 규칙을 적용하되 실제 검증은 Source caller를 소유한 후속 이슈에서 구현한다.
- Alternatives Considered: Content 없는 Repost를 관계 대상으로 허용, Source와 Parent가 같은 대상인 조합 거부, Tombstone 시 FK null 처리. canonical 계약과 충돌하므로 사용하지 않는다.
- Consequences: Reply 생성 시 Parent 존재와 Content를 검사하고 조회 시 lifecycle·visibility·eligibility를 별도로 적용한다.
- Confirmation / Follow-up: PROD-393은 Parent의 missing/contentless/Tombstone 시나리오와 구조 validator의 동일 Parent/Source 조합을 검증한다.

### 관계 입력 실패를 기존 core error 계약으로 매핑한다

- Decision Date: 2026-07-22
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-393`, `memory/graphql-style.md`
- Status: Active
- Context / Problem: 관계 입력과 구조 검증의 실패를 caller가 기존 domain error 경계에서 일관되게 처리해야 한다.
- Decision Outcome: 존재하지 않는 Parent는 `NotFoundError('Post not found')`, Content 없는 Parent와 Reply 구조·self-reference 위반은 `replyParentId` field의 `ValidationError`로 반환한다. package 내부 구조 validator는 원인이 된 관계 field를 보존한다.
- Alternatives Considered: 모든 실패를 Not Found로 마스킹, DB constraint error 직접 노출, 새 error type 추가. field 귀속성과 기존 error 계층을 잃거나 불필요한 공개 계약을 추가하므로 사용하지 않는다.
- Consequences: core validator는 입력 field를 보존하고 transaction 밖으로 DB 세부 오류를 노출하지 않아야 한다.
- Confirmation / Follow-up: PROD-393 service test에서 Parent error class, message·field와 rollback을 확인하고 package 내부 validator 단위 test에서 Source를 포함한 구조 조합의 error field를 확인한다.

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

### Content와 Reply Parent를 최종 Post update에서 연결한다

- Decision Date: 2026-07-22
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-393`, `memory/coding-style.md`
- Status: Active
- Context / Problem: DB가 생성하는 새 Post ID로 self-reference를 검사하면서 기존 contentful `createPost` 반환·ActivityPub first-write-wins 계약과 원자성을 보존해야 한다.
- Decision Outcome: transaction에서 빈 관계의 Post와 Content를 생성하고 공통 구조 검증과 Parent 대상 검증을 수행한 뒤 `currentContentId`와 `replyParentId`를 마지막 Post update에서 함께 연결한다. 기존 Local/ActivityPub 입력에는 nullable `replyParentId`만 추가하고 반환 shape는 유지한다. `repostSourceId`를 실제로 연결하는 입력은 Quote·Reply+Quote 또는 Repost caller를 소유한 후속 이슈에서 추가한다.
- Alternatives Considered: 관계를 순차 update, caller별 validator 복제, 새 public generic action 추가. 부분 상태와 검증 중복 또는 현재 이슈 밖의 API를 만들므로 제외한다.
- Consequences: 실패하면 Post, ActivityPub mapping과 Content까지 모두 rollback된다. 공통 구조 validator는 package 내부에 남아 후속 Source caller가 생길 때 재사용할 수 있다.
- Confirmation / Follow-up: PROD-393 service test에서 Local/ActivityPub 회귀, Reply 저장과 실패 rollback을 확인하고 package 내부 validator 단위 test로 나머지 허용·거부 조합을 검증한다.

### Reply 조회는 관계별 visibility 경계를 유지한다

- Decision Date: 2026-07-22
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `PROD-398`, `PROD-399`, `PROD-400`, `PROD-422`
- Status: Active
- Context / Problem: Parent·조상·descendant의 조회 가능성이 현재 Post와 다를 수 있어 단일한 thread 단위 권한 필터가 숨은 Content를 노출하거나 visible Reply를 제거할 수 있다.
- Decision Outcome: 직접 Parent는 unavailable이면 nullable field만 숨기고 현재 Post를 유지한다. 조상
  경로는 unavailable Parent에서 중단하며 건너뛰지 않는다. descendant는 각각 독립 판정하여 숨겨진 Parent
  아래의 visible Reply를 Parent 비노출만으로 제거하지 않는다. Reply+Quote는 Source가 unavailable이어도
  자체 Content와 Reply 관계를 유지하고 nullable Source만 숨긴다.
- Alternatives Considered: Parent와 현재 Post를 함께 숨김, 숨은 조상 평탄화, 숨은 Parent에서 descendant 탐색 중단. canonical 조회 정책과 충돌하므로 제외한다.
- Consequences: ancestor와 descendant traversal은 서로 다른 filtering 지점을 가지며 client는 API 경계를 그대로 표시해야 한다.
- Confirmation / Follow-up: PROD-398·399·400의 API test와 PROD-422 client integration test에서 각각 검증한다.

### 조상·descendant 공개 GraphQL collection shape를 확정해야 한다

- Decision Date: 2026-07-22
- Decision Class: Upstream Change Required
- Authority / Provenance: 없음.
- Status: Superseded
- Context / Problem: PROD-399·400은 관찰 가능한 관계·visibility 행동을 정의하지만 field 이름, list/connection, pagination과 정렬 방향은 정의하지 않고, PROD-422의 thread 배치·중첩 표현도 PROD-451과의 경계가 확정되지 않았다.
- Decision Outcome: 현재 change에서 임의의 공개 GraphQL shape나 thread 표현을 규범 계약으로 만들지 않는다. 각 구현 전에 Linear에서 shape와 책임 경계를 확정한다.
- Alternatives Considered: `replyAncestors`/`replyDescendants` 이름과 connection·정렬을 OpenSpec만으로 즉시 확정. 공개 API를 upstream 근거 없이 추가하므로 보류한다.
- Consequences: PROD-393·398은 이 결정과 무관하게 진행할 수 있지만 PROD-399·400 및 이를 소비하는 PROD-422는 각 책임의 decision이 Blocked인 동안 구현할 수 없다.
- Confirmation / Follow-up: PROD-399 조상 계약은 2026-07-23 Linear에서 확정되어 아래 두 Active decision으로 대체됐다. PROD-400 descendant 계약은 별도 Blocked decision으로 남는다.

### Reply 조상 경로는 non-null list로 직접 Parent부터 반환한다

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `PROD-399`
- Status: Active
- Context / Problem: 조상 경로의 field 이름, collection shape, 빈 결과, 순서와 pagination을 공개 GraphQL 계약으로 확정해야 한다.
- Decision Outcome: 기존 `Post` Node에 pagination 없는 `replyAncestors: [Post!]!` field를 추가한다. 직접 Reply Parent를 첫 요소로 두고 root 방향으로 진행하며, 조회 가능한 조상이 없으면 빈 배열을 반환한다. 조회 불가능한 Parent에서 중단하고 임의의 최대 깊이로 정상 경로를 절단하지 않는다.
- Alternatives Considered: Relay connection, `ancestors` field, root 우선 순서, 고정 깊이 오류 또는 조용한 절단. 단일 경로에 cursor 복잡도를 만들거나 Reply 관계를 약하게 표현하고 저장 관계 순서·전체 조회 가능 경로 계약을 바꾸므로 사용하지 않는다.
- Consequences: 클라이언트는 index 0을 `replyParent`와 같은 직접 Parent로 해석할 수 있고 root 우선 표시가 필요하면 제공된 list를 presentation 경계에서 변환한다.
- Confirmation / Follow-up: schema contract와 Parent 없음·다단계·unavailable 중단·cycle API test로 확인한다.

### Reply 조상 탐색은 단일 recursive query와 visited path를 사용한다

- Decision Date: 2026-07-23
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-399`, `memory/graphql-style.md`
- Status: Active
- Context / Problem: 임의의 깊이 상한 없이 전체 조상 경로를 제공하면서 단계별 N+1 조회와 비정상 cycle을 방어해야 한다.
- Decision Outcome: 현재 Post의 직접 Parent를 seed로 하는 단일 recursive query에서 현재 Post와 방문한 조상 ID를 path로 추적한다. 방문한 Post는 다시 확장하거나 반환하지 않고, 각 단계의 기존 `Post` 조회 경계가 실패하면 그 지점에서 탐색을 중단한다.
- Alternatives Considered: Parent별 반복 Node load, 고정 최대 깊이 뒤 field error, 최대 깊이에서 일부 결과 반환. 반복 query는 깊이에 비례한 N+1을 만들고 고정 상한은 승인된 전체 경로 계약을 바꾸므로 사용하지 않는다.
- Consequences: 정상 경로의 실제 깊이만큼 recursive work가 발생하지만 DB round trip은 한 번이며 cycle에서도 유한하게 종료한다. 운영 상한이 필요해지면 Linear 공개 error 계약을 먼저 갱신해야 한다.
- Confirmation / Follow-up: query count, 직접 Parent 우선 순서, 긴 경로와 2-node cycle fixture로 확인한다.

### descendant 공개 GraphQL collection shape를 확정해야 한다

- Decision Date: 2026-07-23
- Decision Class: Upstream Change Required
- Authority / Provenance: 없음.
- Status: Blocked
- Context / Problem: PROD-400은 descendant의 관계·visibility 행동을 정의하지만 field 이름, connection·pagination, 정렬과 index를 확정하지 않았다.
- Decision Outcome: PROD-400 Linear에서 공개 collection과 조회 책임을 확정하기 전 descendant API를 구현하지 않는다.
- Alternatives Considered: 현재 change에서 임의로 connection·pagination·정렬을 선택. 공개 API를 upstream 근거 없이 추가하므로 보류한다.
- Consequences: PROD-399는 진행할 수 있지만 PROD-400과 이를 소비하는 PROD-422의 descendant 범위는 계속 Blocked다.
- Confirmation / Follow-up: PROD-400 본문·결정 댓글과 Issue Gate 승인 뒤 specs·design·tasks를 갱신한다.

## Remaining Decisions

- PROD-400 descendant field 이름, connection·pagination·정렬과 index.

## Superseded Decisions

- 2026-07-22의 `조상·descendant 공개 GraphQL collection shape를 확정해야 한다`는 공동 Blocked 기록은 PROD-399 조상 계약 확정으로 조상 Active decision과 PROD-400 descendant Blocked decision으로 분리됐다.
