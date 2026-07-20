## Context

현재 `main`에는 Reaction 저장·service·GraphQL·UI 구현이 없다. PostgreSQL/Drizzle은 UUIDv7 default, 명시적 foreign key와 SQL-like query builder를 사용하며, Post 조회 권한은 API의 기존 Post visibility predicate가 소유한다. Profile-scoped Notification 저장과 Follow source backend는 이미 병합됐지만 list/count/read visibility SQL은 Follow join에 고정돼 있고, `add-in-app-notifications`의 목록 UI·badge·E2E·archive는 아직 완료되지 않았다.

이 change는 PROD-390이 소유한 공유 계약이며 구현은 PROD-395, PROD-404, PROD-405, PROD-406, PROD-407, PROD-413, PROD-417, PROD-418, PROD-419의 독립 PR로 나뉜다. 이번 적용 대상은 먼저 PROD-395의 저장 slice이며, 나머지 slice는 자신의 blocker와 미결정을 해소한 뒤 같은 change를 이어서 사용한다.

## Goals / Non-Goals

**Goals:**

- Canonical Reaction Type 문자열과 Reaction 관계를 현재 여섯 Unicode 계약에 맞는 저장 경계로 추가한다.
- 유일성·멱등 mutation·viewer-independent count·viewer-filtered Profile 목록을 같은 도메인 계약으로 구현한다.
- 기존 Notification projection과 universal client 경계를 재사용해 Reaction UI와 Notification lifecycle을 연결한다.
- 각 Linear 자식이 독립적으로 구현·검증되면서 부모 PROD-390이 최종 통합과 archive를 소유하게 한다.

**Non-Goals:**

- 임의 Unicode와 사용자 정의 Reaction
- ActivityPub federation과 remote delivery
- 범용 Notification framework, retry/outbox/queue/cron/backfill/bulk cleanup
- 여러 Post action을 공통 Action Bar와 실제 surface에 조립하는 PROD-432 범위
- Reaction event history와 count 동률 표시 순서

## Implementation Guidance

### Current Constraints

- DB schema는 `packages/core/db/tables.ts`와 공용 UUIDv7/created-at helper를 사용한다. 현재 허용 Type 검증은 PROD-404 application service가 소유하며 database enum, seed registry 또는 `CHECK` constraint로 목록을 고정하지 않는다.
- Post visibility predicate는 API 경계에 있고 core service의 `usingProfile`만으로 Local actor와 Post 조회 권한이 보장되지 않는다. mutation은 검증된 actor·Post context를 service에 전달하거나 동등한 검증 경계를 명확히 유지해야 한다.
- Notification create/delete는 기존 Follow와 같이 source transaction commit 뒤 같은 request에서 await/catch한다. Notification 실패를 source transaction에 포함하거나 fire-and-forget으로 처리하지 않는다.
- 현재 Notification Node/list/count/read query는 Follow source inner join에 고정돼 있어 enum과 concrete type만 추가하면 Reaction item이 누락된다.
- selected Profile이 바뀌면 앱의 Relay Environment가 교체된다. Reaction pending/error/cache 상태를 actor 사이에 공유하면 안 된다.
- `SelectMenu`는 단일 radio 선택 후 닫히는 UI라 복수 Reaction toggle에 그대로 사용할 수 없다. 공통 Post Action Bar와 surface 배치는 이번 change 밖이다.

### Recommended Approach

1. PROD-395는 `reaction` 관계 테이블을 additive migration으로 추가하고 Type을 non-null text로 저장한다. built-in 여섯 Type은 database에 seed하거나 `CHECK`로 고정하지 않으며 기존 행은 backfill하거나 재작성하지 않는다.
2. PROD-404의 core service는 짧은 transaction에서 actor·Post·Type을 검증하고 `(post, type, profile)` insert를 conflict-safe하게 수행한다. 새 행이 만들어졌는지를 결과에 포함해 commit 뒤 Notification 호출 여부를 구분한다. 명시적 pessimistic lock은 사용하지 않는다.
3. PROD-405는 actor가 소유한 Profile/Post/Type 조합을 transaction에서 삭제하고 실제 삭제된 source ID를 반환한다. Post의 현재 visibility는 삭제 권한을 대신하지 않는다.
4. PROD-406 count query는 Post visibility만 통과한 뒤 viewer Profile filtering 없이 현재 Reaction을 group/count한다. PROD-407 Profile connection은 Type을 격리하고 기존 Profile visibility를 SQL page limit 전에 적용한다.
5. PROD-413은 Reaction source에서 Recipient, Related Profile, Target Post와 Type을 파생하고 자기 Post·Remote Recipient를 no-op 처리한다. multi-kind Notification 목록은 kind별 visible projection을 `UNION ALL`한 뒤 공통 `id DESC` pagination/count를 적용하는 방식을 기본으로 한다.
6. PROD-417·418은 Post fragment를 소유한 독립 selector·summary·Profile-list component로 구현한다. selector는 Type별 pending/error를 격리하고 서버가 확인한 상태를 기준으로 복구한다. summary는 server count와 정렬을 그대로 사용하며 visible Profile 수로 count를 다시 계산하지 않는다.
7. `add-in-app-notifications`의 공통 목록 UI·badge·read/navigation 계약이 archive된 뒤 Reaction Notification item을 확장한다. PROD-390은 모든 자식 뒤 사용자 흐름과 canonical/OpenSpec 정합성을 검증한다.

### Allowed Alternatives

- Notification visibility는 kind-guarded `LEFT JOIN`과 `OR` predicate로 구현해도 된다. specs의 filter-before-limit, Recipient/source correlation과 multi-kind pagination을 만족해야 하며 kind 증가에 따른 nullable join 복잡도를 감수해야 한다.
- Reaction selector는 Relay가 rollback할 수 있는 좁은 optimistic updater를 사용할 수 있다. 기본 경로는 서버 확정 상태이며, optimistic 경로도 Type별 pending 격리와 실패 복구를 동일하게 만족해야 한다.
- mutation payload가 같은 Post의 selector·summary fragment를 반환하지 못하면 최소 범위의 Relay updater를 사용할 수 있다. actor가 다른 Relay Environment나 관련 없는 Post connection을 수정해서는 안 된다.

### Known Traps

- Reaction Type을 PostgreSQL enum, `CHECK` constraint 또는 별도 seed registry로 고정하지 않는다.
- exact Unicode variation selector를 정규화·제거하거나 비슷해 보이는 문자열을 같은 Type으로 취급하지 않는다.
- 허용 목록 검증을 database 제약에만 의존하지 않는다.
- 같은 Reaction의 멱등성을 명시적 DB lock이나 check-then-insert만으로 구현하지 않는다.
- viewer가 볼 수 없는 Profile의 Reaction을 count에서 제외하지 않는다.
- Profile visibility filtering을 page fetch 뒤 애플리케이션에서 수행하지 않는다.
- Notification kind와 concrete object만 추가한 채 Follow 전용 list/count/read join을 유지하지 않는다.
- Notification 저장·cleanup 실패로 Reaction mutation을 rollback하지 않는다.
- 하나의 shared pending boolean로 모든 Reaction Type 입력을 막거나 selected Profile 사이에서 상태를 공유하지 않는다.
- 독립 component 완료를 이유로 PROD-432의 Action Bar/surface 범위를 이 change에 포함하지 않는다.

## Risks / Trade-offs

- [문자열 Type은 미래 사용자 정의 Reaction 저장 구조를 선결정하지 않음] → 현재 canonical/Linear 범위만 구현하고, 사용자 정의 Reaction이 실제 제품 요구가 되면 Domain Gate와 Issue Gate에서 identity·asset lifecycle·migration을 먼저 결정한다.
- [Profile/Post cascade가 audit 요구를 잃을 수 있음] → 현재 Reaction은 별도 상태·history가 없는 존재 기반 관계라는 canonical 계약에 한정하고, future audit/history는 별도 capability로 다룬다.
- [Profile 목록 정렬이 아직 고정되지 않음] → PROD-395에서는 유일성·cleanup index만 추가하고, PROD-407에서 공개 pagination 순서를 결정한 뒤 필요한 ordering index를 forward migration으로 추가한다.
- [Notification active change와 migration/snapshot 충돌 가능] → Notification kind migration과 UI 확장은 `add-in-app-notifications` archive 뒤 별도 slice에서 적용하고 PROD-395 migration에는 포함하지 않는다.
- [Best Effort 실패로 stale Notification row가 남을 수 있음] → source 존재와 관계 visibility를 모든 API surface에서 filter하고 retry/physical cleanup은 후속 capability가 소유한다.
- [공유 OpenSpec의 후속 API/UI 선택이 아직 미정] → 각 후속 구현 slice 전 decisions와 관련 specs를 갱신해 승인받고, 현재 PROD-395 저장 slice의 accepted decision과 분리한다.

## Migration Plan

1. PROD-395에서 `reaction` table과 Type text, Profile/Post foreign key, unique/index를 하나의 additive migration으로 추가한다.
2. migration SQL과 schema가 UUIDv7 default, Type text, 관계 무결성, 중복 거부, 다른 Type 공존, cascade와 index를 일치시키는지 실제 PostgreSQL에서 검증한다.
3. rollback이 필요하고 아직 consumer가 배포되지 않았다면 신규 table을 제거할 수 있다. consumer 배포 뒤에는 기존 migration을 수정하지 않고 forward migration으로 고친다.
4. PROD-404~407에서 mutation과 조회를 추가한다. 필요한 pagination ordering index는 공개 순서 결정 뒤 별도 forward migration으로 추가한다.
5. `add-in-app-notifications` archive 뒤 PROD-413/419에서 `REACTION` kind와 multi-kind visibility/API/UI migration을 별도로 추가한다.
6. PROD-417/418은 독립 UI와 Storybook/integration 검증을 전달하고 실제 Post surface 조립은 PROD-432로 넘긴다.
7. 모든 자식 완료 뒤 PROD-390이 통합 검증, canonical·delta 정합성, archive와 archive 후 strict validation을 수행한다.

## Open Questions

- PROD-404 전에 Reaction Type을 GraphQL object/Node, opaque ID 또는 현재 Unicode 문자열 중 어떤 공개 입력·출력으로 노출할지 결정해야 한다.
- PROD-404/405 전에 add/delete input과 payload, 이미 제거한 Reaction을 `(post, type)`로 식별할지 Reaction ID로 식별할지 결정해야 한다.
- PROD-407 전에 Profile connection의 stable ordering·cursor와 Profile row 표시 범위를 결정해야 한다.
- PROD-417/418 전에 zero-count Type 노출 API, selector와 Profile 목록의 modal/route UX, optimistic UX 사용 여부를 결정해야 한다.
- PROD-413 전에 mixed-kind Notification SQL의 `UNION ALL` 기본안과 `LEFT JOIN` 대안 중 구현을 선택하고, PROD-277이 정할 Read/navigation 순서를 반영해야 한다.
