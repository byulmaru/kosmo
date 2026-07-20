## Context

이 결정 기록은 PROD-386에서 확정한 canonical Reaction Type, PROD-390과 구현 자식들의 Linear 범위, `reaction`·`data-model`·`post`·`post-reaction-ui`·`notification` specs, 그리고 현재 PostgreSQL/Drizzle·GraphQL·Relay·Notification 구현 제약을 반영한다. 2026-07-20 사용자 확인으로 이미지형 custom emoji의 장기 확장과 안정적인 `reaction_type` 참조 경계를 반영했다.

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
- Consequences: validation과 seed는 exact 문자열을 유지한다. custom emoji와 임의 Unicode는 이번 mutation·UI에서 거부한다.
- Confirmation / Follow-up: PROD-395 migration test와 PROD-404 validation, PROD-417 selector fixture에서 여섯 exact 표현을 검증한다.

### Reaction은 안정적인 Reaction Type identity를 참조한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: Reaction 값을 PostgreSQL enum이나 raw 문자열로 저장하면 사용자가 업로드하는 이미지형 custom emoji로 확장할 때 기존 Reaction 관계를 다시 식별·전환해야 한다.
- Decision Outcome: 별도 `reaction_type` identity registry를 두고 `reaction`은 그 UUID를 참조한다. 현재 built-in Unicode는 registry의 unique 표현으로 seed한다. future custom emoji metadata는 같은 identity를 사용하는 별도 subtype/metadata 경계가 소유한다.
- Alternatives Considered: PostgreSQL enum은 runtime custom value마다 DDL이 필요하고 삭제·rename·rollback이 어렵다. `reaction.type text + CHECK`는 현재는 작지만 custom emoji 전환 때 모든 Reaction 관계를 migration해야 한다. 지금 custom emoji 전체 schema를 설계하는 것은 소유·범위·asset lifecycle이 미정이라 채택하지 않았다.
- Consequences: 현재 여섯 Type에도 lookup과 seed가 필요하다. custom emoji 업로드·소유 범위·shortcode·asset·비활성화·삭제 정책은 후속 계약이 추가한다.
- Confirmation / Follow-up: PROD-395는 raw Type column/enum 부재, Type foreign key와 exact built-in seed를 검증한다.

### built-in Type UUID는 database가 생성하고 공개 상수로 고정하지 않는다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: seed identity를 환경마다 같은 UUID로 고정할지, migration 적용 시 database가 UUIDv7을 생성할지 결정해야 한다.
- Decision Outcome: migration은 각 database에서 `uuidv7()`로 built-in Type identity를 생성하고 서비스는 exact Unicode unique key로 현재 identity를 resolve한다. client와 test는 UUID 값을 하드코딩하지 않는다.
- Alternatives Considered: 고정 UUID seed는 cross-environment fixture를 단순화하지만 DB identity를 공개·배포 상수로 만들고 UUIDv7 생성 규칙과 결합한다.
- Consequences: built-in Type ID는 환경마다 다를 수 있다. 향후 Type ID를 API에 노출하면 client는 server에서 받은 opaque ID만 사용해야 한다.
- Confirmation / Follow-up: 2026-07-20 OpenSpec Gate에서 승인됐다. migration/service test가 ID hardcode 없이 동작하는지 확인한다.

### Reaction foreign key lifecycle과 index를 존재 기반 관계에 맞춘다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: Profile/Post/Type 물리 삭제와 후속 count·Profile 조회를 지원하는 최소 제약·index를 정해야 한다.
- Decision Outcome: Profile/Post 삭제는 Reaction을 cascade하고 사용 중인 Reaction Type 삭제는 restrict한다. unique index는 `(post_id, reaction_type_id, profile_id)` 순서로 count·Type별 Profile lookup과 멱등 conflict target을 함께 지원하며, Profile cascade/cleanup을 위해 `(profile_id)` index를 추가한다. Profile connection ordering index는 PROD-407까지 유예한다.
- Alternatives Considered: 모든 foreign key `NO ACTION`은 orphan 방지 삭제 순서를 caller에게 분산한다. `(profile_id, post_id, reaction_type_id)` unique와 별도 post/type index는 같은 세 열을 중복 저장한다. 미래 cursor index 선제 추가는 미확정 정렬을 고정한다.
- Consequences: Profile/Post 물리 삭제 뒤 Reaction history는 남지 않는다. future audit/history가 필요하면 별도 capability가 소유한다.
- Confirmation / Follow-up: 2026-07-20 OpenSpec Gate에서 승인됐다. catalog·migration test로 cascade/restrict와 실제 index 순서를 검증한다.

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

## Remaining Decisions

- PROD-404: Reaction Type의 GraphQL 표현, add input/payload, Reaction Node 노출 여부와 Post 권한 오류 계약
- PROD-405: delete input/payload와 이미 제거한 관계를 식별할 stable key
- PROD-407: Profile connection ordering·cursor와 Profile row 표시 범위
- PROD-417/418: zero-count Type 공급 API, selector·Profile 목록 UX, optimistic update 사용 여부
- PROD-413: multi-kind Notification visible projection의 `UNION ALL` 기본안과 `LEFT JOIN` 대안 중 최종 구현, PROD-277 Read/navigation 순서
- 이미지형 custom emoji 후속 계약: 업로더와 사용 범위, shortcode uniqueness, file/media, availability와 삭제 lifecycle

## Superseded Decisions

- 2026-07-20 초기 검토의 “Reaction Type을 PostgreSQL enum으로 저장한다” 제안은 이미지형 custom emoji 확장 요구를 반영한 “안정적인 `reaction_type` identity를 참조한다” 결정으로 같은 날 대체됐다.
- 2026-07-20 후속 검토의 “Reaction 행에 `text + CHECK`로 현재 Type을 저장한다” 제안도 같은 identity registry 결정으로 대체됐다.
