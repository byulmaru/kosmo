## Context

이 기록은 PROD-389와 구현 자식 이슈가 공유하는 Repost 계약을 canonical Post·Notification·Post List 문서에서 파생하고, DB·core·GraphQL·목록·유니버설 UI·Notification 구현 slice가 같은 선택을 사용하도록 정리한다. 제품 행동은 canonical 문서와 최신 Linear 계약에서만 파생하며, 구현 수단은 그 범위 안에서 선택한다.

## Decision Records

### Post Kind 없이 관계 조합으로 구조를 판별한다

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-394`
- Status: Active
- Context / Problem: Reply와 Quote가 동시에 성립하고 Repost와 Quote가 같은 Source를 사용하므로 배타적인 Kind 값은 실제 구조를 표현하지 못한다.
- Decision Outcome: 일반 Post, Reply, Repost와 Quote는 Content, Reply Parent와 Repost Source의 존재 조합으로만 판별한다. Reply이면서 Quote를 허용하고 Repost/Quote는 하나의 Repost Source 관계를 공유한다.
- Alternatives Considered: Post Kind enum, 별도 Repost/Quote table, 별도 Quote Source. 모두 관계와 상태를 중복하고 조합 불일치 가능성을 만든다.
- Consequences: 모든 DB/core/API/UI/Notification slice는 nullable 관계 조합을 사용해야 하며 `content === null`만으로 Repost를 판별할 수 없다.
- Confirmation / Follow-up: PROD-394 migration DB test에서 저장 가능한 관계 조합을 검증하고, PROD-401 전용 Repost action과 향후 Quote 작성 action에서 각 caller의 허용·거부 정책을 검증한다. PROD-453은 presentation 상태를 검증한다.

### Repost Source는 direct immutable relation으로 보존한다

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-394`, `PROD-402`
- Status: Active
- Context / Problem: 중첩 Quote와 Tombstone 뒤에도 사용자가 실제로 선택한 Source 관계를 잃지 않아야 한다.
- Decision Outcome: Repost와 Quote는 입력 Source Post를 직접 참조하고 Source의 Source로 평탄화하지 않는다. Repost 또는 Source가 Tombstone이 되어도 저장 관계를 제거하거나 다른 Post로 바꾸지 않는다.
- Alternatives Considered: 최상위 Source로 평탄화, Source snapshot 저장, Tombstone cascade/nullification. 모두 direct 관계와 lifecycle 계약을 잃는다.
- Consequences: 조회 계층은 Content 없는 Repost와 Content 있는 Quote를 구분하고 unavailable Source 관계만
  숨기며, 저장 계층은 관계 보존과 조회 eligibility를 분리한다.
- Confirmation / Follow-up: PROD-394 migration DB test에서 direct ID와 Tombstone 뒤 관계 보존을 검증하고, 후속 action과 Post Node·목록 integration에서 생성·조회 정책을 검증한다.

### Active Repost 유일성은 partial unique index와 멱등 core 경계가 함께 보장한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-394`, `PROD-401`, `PROD-411`
- Status: Active
- Context / Problem: 순차·동시 duplicate Repost를 하나로 수렴시키면서 Quote와 Tombstone Repost는 같은 Author/Source 조합으로 공존할 수 있어야 한다.
- Decision Outcome: `(profile_id, repost_source_id)`에 Active이고 Content와 Reply Parent가 없는 행만 포함하는 partial unique index를 사용한다. core Repost action은 unique conflict 뒤 기존 Active Repost를 조회해 같은 성공 결과로 정규화한다. DB constraint trigger와 명시적 비관적 row lock은 추가하지 않는다.
- Alternatives Considered: application pre-check만 사용, constraint trigger, `SELECT FOR UPDATE`. pre-check만으로는 동시성을 막지 못하고 trigger/lock은 social interaction에 과도한 결합과 운영 위험을 만든다.
- Consequences: DB가 최종 동시성 경계가 되고 Tombstone 전이가 index membership을 해제한다. conflict 판정은 기존 DB helper와 constraint identity를 사용해야 한다.
- Confirmation / Follow-up: PROD-394 migration catalog·concurrent insert 테스트, PROD-401 순차·동시 멱등 테스트와 PROD-411 재Repost 테스트를 수행한다.

### 기존 Post Node에 Repost 관계와 viewer 상태를 확장한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-401`, `PROD-402`, `PROD-403`, `PROD-411`
- Status: Active
- Context / Problem: Repost가 별도 durable object가 아니므로 GraphQL identity와 client normalized cache가 같은 Post Node를 사용해야 한다.
- Decision Outcome: 기존 `Post`에 nullable `repostSource`, non-null `repostCount`, nullable `viewerRepost`를 추가한다. 생성 mutation은 `repostPost(input: { sourceId })`와 `RepostPostPayload.repost`, 삭제는 일반 `deletePost(input: { id })`와 Tombstone Node 대신 `DeletePostPayload.postId`를 사용한다. `viewerRepost`는 현재 selected Profile의 Active Repost Post identity를 반환한다.
- Alternatives Considered: Repost concrete type, `viewerHasReposted` boolean, 확장 가능한 viewer state wrapper, `cancelRepost` 전용 mutation. concrete type은 canonical과 충돌하고 boolean은 취소할 identity를 잃는다. wrapper는 현재 단일 관계에 비해 과도하며 전용 cancel은 일반 Post 삭제 계약을 중복한다.
- Consequences: API와 Relay fragments는 concrete Post global ID를 유지하고, mutation payload는 Source Post의 count/viewer 상태를 normalized cache가 갱신할 수 있게 함께 제공해야 한다.
- Confirmation / Follow-up: GraphQL schema snapshot, Node/field/mutation integration과 client Relay compile·cache 테스트에서 확인한다.

### Source 접근 실패는 Repost와 Quote에 다르게 적용한다

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-389`, `PROD-402`, `PROD-430`
- Status: Active
- Context / Problem: Source를 조회할 수 없다는 이유로 Content 있는 Quote까지 숨기면 Quote Author가 작성한
  독립 Content와 Visibility가 Source lifecycle에 종속된다. 반면 Content 없는 Repost는 Source 없이 표시할
  내용이 없다.
- Decision Outcome: Content 없는 Repost는 direct Source가 viewer 기준 Post Visibility와 Post Eligibility를
  통과할 때만 Node와 목록 후보로 반환한다. Content 있는 Quote와 Reply+Quote는 자신의 조회 정책을 통과하면
  Source와 무관하게 반환하고, direct Source를 조회할 수 없으면 nullable `repostSource`만 `null`로 반환한다.
  Source의 Source까지 재귀 판정해 바깥 Quote를 숨기지 않는다.
- Alternatives Considered: Repost와 Quote 모두 전체 Source chain으로 제외, 두 구조 모두 Source와 독립
  노출. 전자는 Quote Content를 Source lifecycle에 종속시키고 후자는 내용 없는 Repost를 불완전하게
  노출하므로 사용하지 않는다.
- Consequences: 전역 Post/PostContent loader에는 Source 조건을 적용하지 않는다. Content 없는 Repost 후보
  query만 direct Source를 page limit 전에 검증하고 `repostSource` relation loader는 직접 Source를 독립
  조회한다.
- Confirmation / Follow-up: PROD-402는 unavailable Source의 Repost 제외와 Quote 유지·nullable Source를,
  PROD-430은 mixed Repost/Quote pagination을 검증한다.

### Repost count와 viewer relation query를 분리한다

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-403`
- Status: Active
- Context / Problem: count는 모든 viewer에게 같아야 하지만 현재 Profile의 Active Repost identity는 actor별로 달라야 한다.
- Decision Outcome: `repostCount`는 direct eligible Active Repost를 viewer와 무관하게 집계하고, `viewerRepost`는 현재 selected Profile ID로 별도 조회한다. Profile Block/Mute 같은 viewer별 control을 count membership에 사용하지 않는다.
- Alternatives Considered: 현재 viewer가 볼 수 있는 Repost만 count, boolean viewer 상태. 전자는 viewer-independent 계약을 깨고 후자는 취소 identity를 제공하지 못한다.
- Consequences: API는 두 값을 별도 batched query 또는 동등한 loader로 계산하고 selected Profile 전환은 새 Relay actor Store에서 재조회한다.
- Confirmation / Follow-up: 서로 다른 viewer의 동일 count, selected Profile 격리, Quote/Tombstone 제외와 N+1 회귀를 검증한다.

### Repost Notification은 기존 loose projection과 concrete type을 확장한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-412`, `PROD-416`
- Status: Active
- Context / Problem: Follow 기반 Notification에 Repost를 추가하면서 source-specific table이나 generic fallback 없이 kind별 relation과 visibility를 검증해야 한다.
- Decision Outcome: 기존 `notification` row에 `kind = REPOST`, `source_id = Source Repost Post.id`, `data = {}`를 저장한다. GraphQL은 `RepostNotification implements Notification & Node`와 `profile`, `post` 필드를 제공한다. connection/count/Node/Read는 kind별 visible projection을 limit 전에 조립하고 raw kind/source/data를 노출하지 않는다.
- Alternatives Considered: Repost Notification table, Post foreign key, snapshot JSON, generic Notification object. 모두 기존 loose projection 계약 또는 source-derived relation과 cleanup 격리를 훼손한다.
- Consequences: Follow-only join과 client branch를 kind-aware 구조로 확장하고 concrete typename이 row kind와 visibility를 직접 검증해야 한다.
- Confirmation / Follow-up: mixed-kind pagination, Node route, hidden item, inbox navigation, Read와 badge/cache integration을 검증한다.

### Notification create와 cleanup은 source commit 뒤 같은 request에서 실패를 격리한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-412`, `PROD-416`
- Status: Active
- Context / Problem: Notification이 Repost 결과를 rollback하면 안 되지만 fire-and-forget은 실패 시점과 테스트 경계를 잃는다.
- Decision Outcome: Repost 생성 또는 Tombstone transaction이 commit된 뒤 같은 request에서 idempotent Notification create/delete port를 await하고 오류를 catch한다. retry, outbox, queue와 backfill은 추가하지 않는다.
- Alternatives Considered: source transaction 안에서 저장·삭제, fire-and-forget, worker/outbox. transaction 결합은 source 성공을 바꾸고 fire-and-forget은 관측 불가능하며 worker/outbox는 승인 범위를 넘는다.
- Consequences: 성공 응답 latency에 짧은 Notification 시도가 포함되지만 source 결과는 보존된다. cleanup 실패 잔존 행은 visible predicate가 숨긴다.
- Confirmation / Follow-up: 저장·cleanup 실패 주입, 반복 처리와 프로세스 간격의 hidden-row API 테스트를 수행한다.

### Presentation, 목록 연결과 action을 독립 client slice로 유지한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-389`, `PROD-414`, `PROD-415`, `PROD-453`
- Status: Active
- Context / Problem: presentation은 API 없이 먼저 검증할 수 있지만 production 목록 연결과 mutation action은 각기 다른 선행 조건을 가진다.
- Decision Outcome: PROD-453은 production fragment shape를 따르는 Relay fixture·Storybook·mock navigation으로 Repost/Quote presentation을 소유한다. PROD-415는 공용 Post list item fragment에 presentation을 연결하고, PROD-414는 별도 fragment-colocated Repost action과 mutation/cache 상태를 소유한다. 공통 Action Bar surface 조립은 포함하지 않는다.
- Alternatives Considered: 하나의 목록 컴포넌트에서 presentation·action·route를 모두 구현, raw scalar props, raw fragment key cast. 모두 이슈 의존성과 Relay colocation 경계를 흐린다.
- Consequences: presentation 결과는 목록 연결 전에도 독립 검증되며, 실제 surface 조립 전 action component만 완료될 수 있다.
- Confirmation / Follow-up: Storybook 상태/interaction, Relay compile, Home/Profile integration과 PROD-432 제외 범위를 확인한다.

### 부모 change가 전체 계약과 archive를 소유한다

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-389`, `PROD-394`, `PROD-401`, `PROD-402`, `PROD-403`, `PROD-411`, `PROD-412`, `PROD-414`, `PROD-430`, `PROD-415`, `PROD-416`, `PROD-453`
- Status: Active
- Context / Problem: 저장, API, UI와 Notification이 여러 PR로 분리되지만 하나의 Repost 제품 결과와 통합 검증을 공유한다.
- Decision Outcome: 하나의 `add-post-reposts` change에서 각 구현 이슈별 task와 검증 책임을 유지한다. 자식 PR 완료만으로 change를 archive하지 않고 PROD-389가 모든 child 결과, vertical flow, canonical 정합성과 archive 후 strict validation을 소유한다.
- Alternatives Considered: child별 OpenSpec, 중간 slice archive, Project 전체 backlog change. 모두 공유 계약을 복제하거나 완료 상태를 잘못 표현한다.
- Consequences: PROD-394가 완료돼도 나머지 task는 미완료로 유지되고 change는 active 상태를 유지한다.
- Confirmation / Follow-up: 부모 Completion Gate에서 child/PR, requirement scenario, integration과 archive diff를 함께 검증한다.

### Repost Source 오류는 조회 가능성과 Repost 가능성을 구분한다

- Decision Date: 2026-07-22
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-401`
- Status: Active
- Context / Problem: Source가 없거나 조회 불가능한 경우에는 존재와 비공개 상태를 숨겨야 하지만, 호출자가 이미 조회할 수 있는 Content 없는 Repost, Mentioned Profiles와 타인 Followers Only Source는 존재를 숨겨도 입력을 수정할 근거가 부족하다.
- Decision Outcome: 누락·Tombstone·viewer 기준 조회 불가 Source는 `NOT_FOUND`로 처리한다. 호출자가 조회할 수 있지만 구조 또는 Repost visibility 정책상 허용되지 않는 Source는 `VALIDATION`과 `sourceId` field로 처리한다. Account/Profile membership 또는 actor 상태 실패는 `PERMISSION_DENIED`로 처리한다.
- Alternatives Considered: 모든 허용되지 않는 Source를 `NOT_FOUND`로 통일하는 방식은 비공개 정보 보호는 단순하지만 이미 조회 권한이 있는 입력에도 수정 가능한 field 오류를 제공하지 못한다. 세부 원인별 error type을 늘리는 방식은 현재 GraphQL error 계약에 비해 과도하다.
- Consequences: core action은 viewer 기준 Source 조회 가능성을 먼저 확인한 뒤 Repost 전용 구조·visibility 정책을 검증해야 하며, GraphQL은 기존 domain error mapping을 그대로 사용한다.
- Confirmation / Follow-up: 누락·Tombstone·비공개 Source의 `NOT_FOUND`, 조회 가능한 허용 불가 Source의 `VALIDATION(sourceId)`, actor 실패의 `PERMISSION_DENIED`를 core/API integration test로 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
