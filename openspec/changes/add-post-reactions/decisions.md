## Context

이 결정 기록은 PROD-386에서 확정한 canonical Reaction Type, PROD-390과 구현 자식들의 Linear 범위, `reaction`·`data-model`·`post`·`post-reaction-ui`·`notification` specs, 그리고 현재 PostgreSQL/Drizzle·GraphQL·Relay·Notification 구현 제약을 반영한다. 현재 계약은 정확한 여섯 Unicode Reaction만 포함하며 사용자 정의 Reaction 저장 방향을 선결정하지 않는다.

## Decision Records

### Reaction 계약은 PROD-390의 하나의 공유 OpenSpec으로 관리한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: 저장, mutation, 조회, UI와 Notification이 같은 유일성·권한·멱등 lifecycle을 공유하지만 구현은 여러 PR로 나뉜다.
- Decision Outcome: PROD-390이 `add-post-reactions` change, 최종 통합 검증과 archive를 소유한다. PROD-395, PROD-404, PROD-405, PROD-406, PROD-407, PROD-413, PROD-417, PROD-418, PROD-419는 하나씩 구현·테스트 slice를 소유한다.
- Alternatives Considered: DB/API/UI/Notification별 별도 OpenSpec은 같은 행동 계약을 복제하고 부분 archive 위험을 만들므로 채택하지 않았다.
- Consequences: 각 PR 완료와 전체 change 완료를 구분한다. PROD-432의 공통 Action Bar rollout은 별도 계약으로 유지한다.
- Confirmation / Follow-up: tasks heading과 dependency가 Linear 이슈 구조와 일치하는지 strict validation 및 부모 통합 단계에서 확인한다.

### 초기 built-in Reaction Type과 표시 순서를 제한한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: 최초 구현이 허용할 Type과 정확한 Unicode 표현, count 동률 순서를 고정해야 한다.
- Decision Outcome: 현재 허용 Type은 `🥹` (`U+1F979`), `❤️` (`U+2764 U+FE0F`), `🎉` (`U+1F389`), `👀` (`U+1F440`), `☘️` (`U+2618 U+FE0F`), `🌈` (`U+1F308`)만 사용한다. 목록 나열은 count 동률 표시 순서를 정의하지 않는다.
- Alternatives Considered: 임의 Unicode, variation selector 정규화, 동률 fallback 순서는 canonical Domain Gate에서 제외하거나 보장하지 않기로 했다.
- Consequences: application validation은 exact 문자열을 유지한다. 임의 Unicode와 사용자 정의 Reaction은 이번 mutation·UI에서 거부한다.
- Confirmation / Follow-up: PROD-404 validation과 PROD-417 selector fixture에서 여섯 exact 표현을 검증한다.

### Reaction Type은 현재 canonical 문자열로 저장한다

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: Canonical Reaction은 Type을 문자열로 정의하고 PROD-386·390은 정확한 여섯 Unicode만 현재 범위에 포함한다. 별도 Type identity와 사용자 정의 Reaction 확장은 상위 계약에서 승인되지 않았다.
- Decision Outcome: `reaction.type`은 non-null text로 exact Unicode를 저장한다. 현재 허용 목록은 PROD-404 application service가 검증하며 database enum, seed registry 또는 `CHECK` constraint로 고정하지 않는다.
- Alternatives Considered: PostgreSQL enum과 `CHECK`는 허용 목록 변경을 schema migration에 결합한다. 별도 `reaction_type` registry는 미래 사용자 정의 Reaction을 전제로 identity와 lifecycle 방향을 현재 범위에서 선결정한다.
- Consequences: database에 직접 쓰면 허용 목록 밖 문자열도 저장할 수 있으므로 모든 production write는 application validation을 통과해야 한다. 미래 사용자 정의 Reaction이 승인되면 Domain Gate와 Issue Gate에서 저장 identity와 기존 row migration을 새로 결정한다.
- Confirmation / Follow-up: 2026-07-21 PR #299 review에서 canonical/Linear 불일치를 확인해 정정했다. PROD-395 migration test는 text column과 DB 허용 목록 제약 부재를 검증하고 PROD-404가 exact 허용 목록을 검증한다.

### Reaction foreign key lifecycle과 index를 존재 기반 관계에 맞춘다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: Profile/Post 물리 삭제와 후속 count·Profile 조회를 지원하는 최소 제약·index를 정해야 한다.
- Decision Outcome: Profile/Post 삭제는 Reaction을 cascade한다. unique index는 `(post_id, type, profile_id)` 순서로 count·Type별 Profile lookup과 멱등 conflict target을 함께 지원하며, Profile cascade/cleanup을 위해 `(profile_id)` index를 추가한다. Profile connection ordering index는 PROD-407까지 유예한다.
- Alternatives Considered: 모든 foreign key `NO ACTION`은 orphan 방지 삭제 순서를 caller에게 분산한다. `(profile_id, post_id, type)` unique와 별도 post/type index는 같은 세 값을 중복 저장한다. 미래 cursor index 선제 추가는 미확정 정렬을 고정한다.
- Consequences: Profile/Post 물리 삭제 뒤 Reaction history는 남지 않는다. future audit/history가 필요하면 별도 capability가 소유한다.
- Confirmation / Follow-up: catalog·migration test로 Profile/Post cascade와 실제 index 순서를 검증한다.

### Reaction mutation은 database 제약으로 멱등성을 보장한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: 반복·동시 요청이 중복 Reaction이나 불필요한 실패를 만들 수 있다.
- Decision Outcome: add는 unique conflict를 원자적으로 처리하고 기존 Reaction을 성공 결과로 반환한다. delete는 Owner의 현재 관계를 원자적으로 제거하며 자신이 이미 제거한 같은 조합의 재시도는 성공 no-op으로 처리한다. 명시적 pessimistic lock을 사용하지 않는다.
- Alternatives Considered: check-then-write만 사용하는 방식은 race가 있고, 명시적 row/table/advisory lock은 복구 가능한 social interaction에 과도하다.
- Consequences: service 결과는 새로 생성·실제 삭제 여부를 구분해 Notification side effect를 한 번만 시작할 수 있어야 한다.
- Confirmation / Follow-up: PROD-404·405의 database-backed concurrency test에서 단일 row와 반복 결과를 검증한다.

### count와 Profile 목록의 visibility 책임을 분리한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: viewer에 따라 count가 달라지면 Post 단위 cache가 불안정해지지만 unavailable Profile은 목록에 노출할 수 없다.
- Decision Outcome: Post 조회 권한을 통과한 모든 viewer에게 현재 Reaction 전체의 Type별 count를 동일하게 제공한다. Type별 Profile connection에만 viewer의 기존 Profile visibility를 SQL page limit 전에 적용한다. count는 내림차순이며 동률 순서는 보장하지 않는다.
- Alternatives Considered: count에도 viewer Profile visibility를 적용하는 방식은 viewer마다 count가 달라지고 canonical 계약과 충돌한다. client filtering은 pagination을 깨뜨린다.
- Consequences: summary count와 visible Profile 목록 길이는 다를 수 있으며 client가 이를 다시 맞추지 않는다.
- Confirmation / Follow-up: PROD-406·407과 PROD-418에서 서로 다른 viewer, unavailable Profile과 pagination을 함께 검증한다.

### Reaction Notification은 source 밖의 Best Effort projection으로 처리한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: Notification 실패가 Reaction 결과를 깨뜨리지 않으면서 source·Recipient·Related Profile·Post·Type 상관관계를 유지해야 한다.
- Decision Outcome: Reaction commit 뒤 새 source에 대해서만 같은 request에서 Notification create를 await/catch한다. 자기 Post와 Remote Recipient는 생성하지 않는다. Reaction delete commit 뒤 cleanup을 await/catch하며 실패해도 source 결과를 유지한다. stale row는 source/visibility predicate로 모든 API surface에서 숨긴다.
- Alternatives Considered: 같은 transaction은 Notification 장애를 source 장애로 확대한다. fire-and-forget은 process 종료와 관측 경계를 잃는다. retry/outbox/queue/backfill은 이번 범위가 아니다.
- Consequences: 누락 또는 stale Notification이 물리적으로 남을 수 있다. Notification API는 kind별 source visibility를 filter-before-limit으로 적용해야 한다.
- Confirmation / Follow-up: `add-in-app-notifications` archive 뒤 PROD-413·419에서 source 실패 격리, 숨김, inbox/read/count와 cleanup을 검증한다.

### Reaction Notification은 기존 Notification baseline 뒤에 확장한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: Notification backend는 병합됐지만 공통 목록 UI·badge·E2E와 active capability archive가 남아 있고 현재 SQL은 Follow source에 고정돼 있다.
- Decision Outcome: PROD-395와 Reaction mutation/query slice는 Notification UI 완료를 기다리지 않는다. `REACTION` kind migration, multi-kind list/count/read와 client item은 `add-in-app-notifications` archive 뒤 PROD-413·419가 추가한다.
- Alternatives Considered: active Notification change에 Reaction을 끼우면 PROD-273 범위와 archive 책임을 바꾸고 migration/snapshot 충돌을 만든다.
- Consequences: 공유 Reaction change는 Notification baseline에 대한 명시적 의존성을 유지한다. 부모 PROD-390 archive는 Notification 자식 완료를 기다린다.
- Confirmation / Follow-up: PROD-413 착수 전에 archived `notification`·`data-model` baseline과 PROD-277 Read/navigation 결정을 다시 읽는다.

### Reaction Type과 add mutation은 canonical 문자열 계약을 그대로 노출한다

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: PROD-404는 exact Unicode Type을 GraphQL에서 표현하고 Post와 현재 Type을 식별하는 add input 및 멱등 payload를 확정해야 한다.
- Decision Outcome: GraphQL은 `addReaction(input: { postId: ID!, type: String! })`을 제공한다. `postId`는 concrete `Post` global ID만 허용하고 `type`은 canonical Unicode 문자열을 그대로 받는다. 성공 payload는 `AddReactionPayload.reaction: Reaction!`만 반환하며 신규 생성 여부는 공개하지 않는다.
- Alternatives Considered: GraphQL enum은 canonical Unicode와 별도 symbolic mapping을 만들고 허용 목록 변경을 schema 변경에 결합한다. 별도 Reaction Type object나 opaque Type ID는 승인되지 않은 registry identity를 선결정한다. payload의 `created` boolean은 Notification 내부 분기를 공개 API에 누출한다.
- Consequences: 허용 목록 밖 문자열은 `VALIDATION`과 `field = type`으로 거부한다. 반복 add는 기존 Reaction과 같은 Node ID를 반환한다. service는 후속 Notification 연결을 위해 신규/기존 관계를 내부적으로 구분할 수 있다.
- Confirmation / Follow-up: GraphQL schema snapshot과 API integration test에서 input/payload shape, exact 문자열 validation, 반복 요청의 동일 Node ID를 검증한다.

### Reaction은 최소 필드의 Relay Node로 노출한다

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: 멱등 add 결과와 후속 selector·delete cache가 동일한 durable Reaction 관계를 안정적으로 식별해야 하지만 아직 관계 navigation field의 구체 사용 사례는 확정되지 않았다.
- Decision Outcome: `Reaction`은 Relay Node이며 현재 `id`, `type`, `createdAt`을 노출한다. Node loader는 대상 Post의 기존 조회 정책을 적용한다. Profile·Post 관계 field는 구체 client query가 소유하는 후속 slice 전까지 공개하지 않는다.
- Alternatives Considered: non-Node payload는 같은 관계의 반복 결과와 후속 cache 제거 대상을 안정적으로 식별하지 못한다. Profile·Post field를 지금 모두 노출하는 방식은 현재 사용 사례와 별도 visibility 계약 없이 API 표면을 넓힌다.
- Consequences: client는 opaque Reaction global ID로 관계 identity를 유지한다. 조회할 수 없는 Post의 Reaction Node는 `null`이며 database UUID나 typename encoding에 의존할 수 없다.
- Confirmation / Follow-up: Node global ID round-trip, readable/unreadable Post loader와 mutation payload의 concrete `Reaction` typename을 검증한다.

### 조회할 수 없는 Post의 add는 존재를 숨긴다

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: add mutation이 존재하지 않는 Post와 존재하지만 viewer가 조회할 수 없는 Post를 다른 오류로 구분하면 Post 존재를 추가로 노출한다.
- Decision Outcome: `addReaction`은 대상 Post가 없거나 기존 Post 조회 정책을 통과하지 못하면 모두 `NOT_FOUND`를 반환한다. 로그인 또는 selected Profile scope 자체가 없으면 기존 scope auth의 `PERMISSION_DENIED`를 유지한다.
- Alternatives Considered: unreadable Post에 `PERMISSION_DENIED`를 반환하면 원인은 명확하지만 global Node 조회의 숨김 계약과 달리 Post 존재를 확인시킨다.
- Consequences: client는 missing과 unreadable Post를 구분하지 않는다. 오류 뒤에는 Reaction과 Notification이 생성되지 않는다.
- Confirmation / Follow-up: 존재하지 않는 Post와 visibility별 unreadable Post가 같은 code를 반환하고 database rollback 뒤 Reaction이 남지 않는지 검증한다.

## Remaining Decisions

- PROD-405: delete input/payload와 이미 제거한 관계를 식별할 stable key
- PROD-407: Profile connection ordering·cursor와 Profile row 표시 범위
- PROD-417/418: zero-count Type 공급 API, selector·Profile 목록 UX, optimistic update 사용 여부
- PROD-413: multi-kind Notification visible projection의 `UNION ALL` 기본안과 `LEFT JOIN` 대안 중 최종 구현, PROD-277 Read/navigation 순서

## Superseded Decisions

- 2026-07-20의 “안정적인 `reaction_type` identity를 참조한다”와 “built-in Type UUID를 database가 생성한다” 결정은 상위 canonical/Linear에 없는 사용자 정의 Reaction 확장을 전제로 했으므로 2026-07-21의 “Reaction Type은 현재 canonical 문자열로 저장한다” 결정으로 대체됐다.
- PostgreSQL enum과 `text + CHECK` 제안은 허용 목록 변경을 schema migration에 결합하므로 채택하지 않았다.
