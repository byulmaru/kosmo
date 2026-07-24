## Context

현재 `main`에는 PROD-395·404·405·407의 Reaction 저장·생성·삭제·Profile connection, PROD-449의 fixture-first 요약·Profile 목록 presentation과 PROD-413의 Reaction Notification 생성·inbox 통합이 있다. PostgreSQL/Drizzle은 UUIDv7 default, 명시적 foreign key와 SQL-like query builder를 사용하며, Post 조회 권한은 API의 기존 Post visibility predicate가 소유한다. Notification Node/list/count/read는 Follow와 Reaction의 kind별 visible projection을 함께 사용하고 source가 없는 Reaction Notification을 숨긴다.

이 change는 PROD-390이 소유한 공유 계약이며 구현은 PROD-395, PROD-404, PROD-405, PROD-406, PROD-407, PROD-413, PROD-417, PROD-418, PROD-419의 독립 PR로 나뉜다. PROD-395 저장 slice, PROD-404 멱등 생성 slice, PROD-405 Owner 멱등 삭제 slice, PROD-407 Type별 Profile connection slice, PROD-413 Reaction Notification slice와 PROD-449 fixture-first presentation slice는 `main`에 병합됐다. 이번 적용 대상은 PROD-419의 Reaction 삭제 뒤 Best Effort Notification 정리 slice다. 나머지 slice는 자신의 blocker와 미결정을 해소한 뒤 같은 change를 이어서 사용한다.

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
- Post visibility predicate와 Account/session membership 검증은 API 경계에 있다. `usingProfile` entry point는 Active Account의 Member인 selected Profile을 보장하고, mutation은 검증된 actor Profile과 Post context를 service에 전달한다. core service는 transport session이나 actor origin을 다시 검증하지 않고 Active/Normal Profile, non-Suspended Instance, Post, Type과 멱등 저장을 검증한다.
- GraphQL의 create 계열 mutation은 `fieldWithInput`, concrete Node global ID와 simple payload object를 사용한다. `addReaction`은 이 관례를 따라 Post global ID와 Type 문자열을 받고 최소 Reaction Node를 반환한다.
- Notification create/delete는 기존 Follow와 같이 source transaction commit 뒤 같은 request에서 await/catch한다. Notification 실패를 source transaction에 포함하거나 fire-and-forget으로 처리하지 않는다.
- `deleteReaction`은 transaction commit 뒤 `reactionId`를 반환하고 Notification service의 kind·source ID 기반 idempotent delete 경계를 같은 application action에서 호출한다. cleanup은 source transaction 밖에서 수행한다.
- 별도 logger나 metric 경계는 없고 post-commit side effect 실패는 `console.error`와 source context를 사용하는 관례가 있다. Reaction Notification 생성의 무음 catch를 다른 범위까지 함께 정리하지 않는다.
- selected Profile이 바뀌면 앱의 Relay Environment가 교체된다. Reaction pending/error/cache 상태를 actor 사이에 공유하면 안 된다.
- `SelectMenu`는 단일 radio 선택 후 닫히는 UI라 복수 Reaction toggle에 그대로 사용할 수 없다. 공통 Post Action Bar와 surface 배치는 이번 change 밖이다.

### Recommended Approach

1. PROD-395는 `reaction` 관계 테이블을 additive migration으로 추가하고 Type을 non-null text로 저장한다. built-in 여섯 Type은 database에 seed하거나 `CHECK`로 고정하지 않으며 기존 행은 backfill하거나 재작성하지 않는다.
2. PROD-404의 GraphQL `usingProfile` entry point는 Account/session membership과 Post visibility를 검증하고, core service는 검증된 actor Profile identity를 받아 짧은 transaction에서 Active/Normal actor·non-Suspended Instance·Post·Type을 검증한 뒤 `(post, type, profile)` insert를 conflict-safe하게 수행한다. core `addReaction`은 `{ created, reaction }`을 반환하고, GraphQL resolver는 이를 `Reaction` Node만 포함하는 공개 payload로 변환한다. PROD-404는 Notification side effect와 신규 source 구분을 미리 구현하지 않으며, 실제 caller가 생기는 PROD-413이 `created` 결과를 사용해 신규 source에만 Best Effort Notification을 연결한다. 명시적 pessimistic lock은 사용하지 않는다.
3. PROD-405는 concrete Reaction global ID를 입력으로 받고, GraphQL `usingProfile` entry point가 검증한 actor Profile identity를 core service에 전달한다. core는 actor가 Active/Normal Profile이고 Instance가 non-Suspended인지와 현재 Reaction Owner인지 확인하되 actor origin과 Instance Reachability를 권한 조건으로 사용하지 않는다. 현재 타인 소유 행은 거부한다. 현재 Owner 행은 ID와 actor를 조건으로 transaction에서 삭제하며, 이미 없는 ID는 입력 ID를 유지한 성공 no-op으로 처리한다. core는 입력받은 database Reaction ID를 결과로 반환하고, GraphQL `deleteReaction(id: ID!)` payload는 이를 concrete Reaction global ID인 `reactionId: ID!`로 encode한다. Post의 현재 visibility는 조회하거나 삭제 권한으로 사용하지 않으며, Notification cleanup 연결과 필요한 service 결과 확장은 PROD-419가 소유한다.
4. PROD-406 count query는 Post visibility만 통과한 뒤 viewer Profile filtering 없이 현재 Reaction을 group/count한다. PROD-407 Profile connection은 기존 Profile node만 반환하고, Type을 격리하며 기존 Profile visibility를 SQL page limit 전에 적용한 뒤 `Reaction.createdAt DESC, Reaction.id DESC` keyset으로 최신 Reaction부터 반환한다. Reaction metadata는 공개 row field로 노출하지 않는다.
5. PROD-413은 Reaction source에서 Recipient, Related Profile, Target Post와 Type을 파생하고 자기 Post·Remote Recipient를 no-op 처리한다. multi-kind Notification 목록은 승인된 구현 선택에 따라 kind별 visible projection을 `UNION ALL`한 뒤 공통 `id DESC` pagination/count를 적용한다. item 활성화는 Target Post 이동을 즉시 시작하고 Read는 응답을 기다리지 않는 Best Effort 동기화로 유지한다.
6. PROD-449는 먼저 props-only `ReactionSummary`와 `ReactionProfileList`의 fixture 상태 catalog를 전달한다. supplied count entry는 order·zero-count를 바꾸지 않고 렌더하며, Profile row는 기존 `ProfileListItem` Relay fragment ref를 재사용하고 Storybook은 Relay mock fragment ref로 상태를 구성한다. 이 구현 단계는 최종 `post-reaction-ui` spec을 변경하지 않는다.
7. PROD-418은 이후 실제 Post count query와 `reactionProfiles` Relay connection을 같은 props seam에 연결하고, zero-count와 modal/route UX 및 cache 통합을 결정·검증한다. seam은 PROD-418 통합에서도 유지한다. PROD-417 selector는 Type별 pending/error를 격리하고 서버가 확인한 상태를 기준으로 복구한다. summary는 server count와 정렬을 그대로 사용하며 visible Profile 수로 count를 다시 계산하지 않는다.
8. PROD-277·324·372가 전달한 공통 목록 UI·badge·read/navigation 계약 위에 Reaction Notification item을 확장한다. `add-in-app-notifications`의 남은 E2E·archive는 그 부모 범위로 유지하며 PROD-413의 직접 구현 gate로 사용하지 않는다. PROD-390은 모든 자식 뒤 사용자 흐름과 canonical/OpenSpec 정합성을 검증한다.
9. PROD-419는 Owner 삭제 transaction이 성공한 뒤 반환된 Reaction ID로 기존 Notification delete 경계를 호출한다. 같은 request에서 cleanup을 await하되 실패는 Reaction 성공 payload와 분리하고, 기존 post-commit 오류 관례에 따라 error와 source Reaction ID를 기록한다. 반복 삭제와 이미 없는 source에도 같은 idempotent cleanup을 시도한다.

### Allowed Alternatives

- Notification visibility는 kind-guarded `LEFT JOIN`과 `OR` predicate로 구현해도 된다. specs의 filter-before-limit, Recipient/source correlation과 multi-kind pagination을 만족해야 하며 kind 증가에 따른 nullable join 복잡도를 감수해야 한다.
- Cleanup orchestration은 GraphQL resolver 대신 core의 source transaction 밖 application 경계에 둘 수 있다. 어느 위치든 Reaction transaction commit 뒤 실행되고, 현재 공개 payload·멱등성·실패 격리와 오류 관측을 동일하게 유지해야 한다.
- Reaction selector는 Relay가 rollback할 수 있는 좁은 optimistic updater를 사용할 수 있다. 기본 경로는 서버 확정 상태이며, optimistic 경로도 Type별 pending 격리와 실패 복구를 동일하게 만족해야 한다.
- mutation payload가 같은 Post의 selector·summary fragment를 반환하지 못하면 최소 범위의 Relay updater를 사용할 수 있다. actor가 다른 Relay Environment나 관련 없는 Post connection을 수정해서는 안 된다.

### Known Traps

- Reaction Type을 PostgreSQL enum, `CHECK` constraint 또는 별도 seed registry로 고정하지 않는다.
- exact Unicode variation selector를 정규화·제거하거나 비슷해 보이는 문자열을 같은 Type으로 취급하지 않는다.
- 허용 목록 검증을 database 제약에만 의존하지 않는다.
- 같은 Reaction의 멱등성을 명시적 DB lock이나 check-then-insert만으로 구현하지 않는다.
- 삭제 mutation에서 Reaction Node loader를 호출해 Post visibility를 삭제 권한으로 만들지 않는다.
- Profile/Post/Type 조합을 삭제 input으로 사용해 이전 요청이 같은 조합으로 다시 생성된 새 Reaction을 제거하게 하지 않는다.
- viewer가 볼 수 없는 Profile의 Reaction을 count에서 제외하지 않는다.
- Profile visibility filtering을 page fetch 뒤 애플리케이션에서 수행하지 않는다.
- Notification kind와 concrete object만 추가한 채 Follow 전용 list/count/read join을 유지하지 않는다.
- Notification 저장·cleanup 실패로 Reaction mutation을 rollback하지 않는다.
- cleanup 실패를 무음으로 삼키거나 source Reaction ID 없이 기록하지 않는다.
- 하나의 shared pending boolean로 모든 Reaction Type 입력을 막거나 selected Profile 사이에서 상태를 공유하지 않는다.
- 독립 component 완료를 이유로 PROD-432의 Action Bar/surface 범위를 이 change에 포함하지 않는다.

## Risks / Trade-offs

- [문자열 Type은 미래 사용자 정의 Reaction 저장 구조를 선결정하지 않음] → 현재 canonical/Linear 범위만 구현하고, 사용자 정의 Reaction이 실제 제품 요구가 되면 Domain Gate와 Issue Gate에서 identity·asset lifecycle·migration을 먼저 결정한다.
- [Profile/Post cascade가 audit 요구를 잃을 수 있음] → 현재 Reaction은 별도 상태·history가 없는 존재 기반 관계라는 canonical 계약에 한정하고, future audit/history는 별도 capability로 다룬다.
- [최신순 Profile pagination이 기존 unique index만으로 정렬되지 않음] → PROD-407에서 `(post_id, type, created_at DESC, id DESC)` ordering index를 forward migration으로 추가하고 동일 생성 시각의 ID tie-break와 visibility-before-limit을 함께 검증한다.
- [Notification active change와 migration/snapshot 충돌 가능] → Notification kind migration과 UI 확장은 `add-in-app-notifications` archive 뒤 별도 slice에서 적용하고 PROD-395 migration에는 포함하지 않는다.
- [Best Effort 실패로 stale Notification row가 남을 수 있음] → source 존재와 관계 visibility를 모든 API surface에서 filter하고 retry/physical cleanup은 후속 capability가 소유한다.
- [공유 OpenSpec의 후속 API/UI 선택이 아직 미정] → 각 후속 구현 slice 전 decisions와 관련 specs를 갱신해 승인받고, 현재 PROD-395 저장 slice의 accepted decision과 분리한다.
- [이미 없는 Reaction ID는 과거 Owner를 증명할 수 없음] → 존재하는 타인 소유 행만 `PERMISSION_DENIED`로 거부하고, 존재하지 않는 concrete Reaction ID는 어떤 행도 바꾸지 않는 성공 no-op으로 처리한다. 과거 소유권 ledger나 soft delete는 이번 존재 기반 관계 범위에 추가하지 않는다.

## Migration Plan

1. PROD-395에서 `reaction` table과 Type text, Profile/Post foreign key, unique/index를 하나의 additive migration으로 추가한다.
2. migration SQL과 schema가 UUIDv7 default, Type text, 관계 무결성, 중복 거부, 다른 Type 공존, cascade와 index를 일치시키는지 실제 PostgreSQL에서 검증한다.
3. rollback이 필요하고 아직 consumer가 배포되지 않았다면 신규 table을 제거할 수 있다. consumer 배포 뒤에는 기존 migration을 수정하지 않고 forward migration으로 고친다.
4. PROD-404~407에서 mutation과 조회를 추가한다. PROD-407은 `(post_id, type, created_at DESC, id DESC)` pagination ordering index를 별도 forward migration으로 추가한다.
5. `add-in-app-notifications` archive 뒤 PROD-413/419에서 `REACTION` kind와 multi-kind visibility/API/UI migration을 별도로 추가한다.
6. PROD-417/418은 독립 UI와 Storybook/integration 검증을 전달하고 실제 Post surface 조립은 PROD-432로 넘긴다.
7. 모든 자식 완료 뒤 PROD-390이 통합 검증, canonical·delta 정합성, archive와 archive 후 strict validation을 수행한다.

## Open Questions

- PROD-417/418 전에 zero-count Type 노출 API, selector와 Profile 목록의 modal/route UX, optimistic UX 사용 여부를 결정해야 한다.
