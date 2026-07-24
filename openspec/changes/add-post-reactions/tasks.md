## 1. PROD-395 Reaction 저장 계약

**Deliverable**

Reaction이 Unicode 문자열 Type, Author Profile과 Target Post를 보존하고 같은 Profile/Post/Type 조합에 하나만 존재하며 다른 Type은 공존한다.

**Guardrails**

- Type은 non-null text로 저장하고 PostgreSQL enum, seed registry 또는 허용 목록 `CHECK`를 추가하지 않는다.
- exact `🥹`, `❤️`, `🎉`, `👀`, `☘️`, `🌈` 허용 검증은 PROD-404 application service가 소유한다.
- 기존 Profile, Post와 다른 도메인 행을 backfill·삭제·재작성하지 않는 additive migration이어야 한다.
- Profile/Post cascade와 `(post_id, type, profile_id)` unique/index 결정을 따른다.

**Verification**

- 실제 PostgreSQL migration에서 Type text, UUIDv7·created-at default, foreign key, cascade, unique/index와 허용 목록 DB 제약 부재를 검증한다.
- 같은 Type 중복 거부, 다른 Type 공존, 존재하지 않는 Profile/Post 거부와 기존 행 보존을 검증한다.

- [x] 1.1 Type text와 `reaction` 관계의 schema 및 additive migration을 구현한다.
- [x] 1.2 허용 목록을 DB schema에 고정하지 않는 schema/migration 정합성 test를 추가한다.
- [x] 1.3 관계 무결성·유일성·다른 Type 공존·삭제 lifecycle·index 검증을 추가하고 core migration check를 통과시킨다.

## 2. PROD-404 멱등 Reaction 생성

**Deliverable**

권한 있는 Local Profile이 조회 가능한 Post에 허용 Type의 Reaction을 추가하며 반복·동시 요청에도 하나의 관계를 성공 결과로 유지한다.

**Guardrails**

- GraphQL `usingProfile` entry point는 Active Account와 Account–Profile membership을 검증하고, core service는 검증된 actor Profile identity의 Active/Normal 상태와 non-Suspended Instance를 검증하되 actor origin과 Instance Reachability를 권한 조건으로 사용하지 않는다.
- 기존 Post 조회 정책을 우회하지 않는다.
- 임의 Unicode와 사용자 정의 Reaction은 거부한다.
- 명시적 pessimistic lock을 추가하지 않는다.
- GraphQL은 `addReaction(input: { postId: ID!, type: String! })`과 `AddReactionPayload.reaction: Reaction!` 계약을 유지하며 신규 생성 여부를 공개하지 않는다.
- Notification 생성과 신규 source 구분은 PROD-413 범위이며 PROD-404는 이를 미리 구현하지 않는다.

**Verification**

- 성공, 허용되지 않은 Type, Profile/Instance/Post 상태 실패, Remote Unresponsive actor, 반복·동시 요청과 rollback을 core database-backed test로 검증한다.
- GraphQL payload·Node, Active Account/membership scope와 validation/`NOT_FOUND` error 계약을 API integration test로 검증한다.

- [x] 2.1 PROD-404가 소유한 Type 공개 표현, add input/payload, Reaction Node와 Post 권한 오류 결정을 확정해 specs·decisions를 갱신하고 strict validation을 통과시킨다.
- [x] 2.2 허용 Type을 원자적으로 멱등 추가하는 core service와 GraphQL mutation을 구현한다.
- [x] 2.3 반복·동시 요청과 권한·validation 실패 검증을 추가하고 core/API check를 통과시킨다.

## 3. PROD-405 Owner Reaction 삭제

**Authority / Provenance**

- [Reaction canonical 객체](../../../docs/domain/objects/reaction.md)
- [ADR 0012](../../../docs/domain/decisions/0012-post-interaction-followup-clarifications.md)
- [PROD-405](https://linear.app/byulmaru/issue/PROD-405/reaction을-삭제한다)

**Deliverable**

Reaction Owner가 대상 Post의 현재 조회 가능성과 무관하게 자신의 Reaction을 삭제하고 이미 제거한 같은 관계의 재시도를 성공 no-op으로 처리한다.

**Guardrails**

- 다른 Profile 소유의 현재 Reaction을 삭제하지 않는다.
- core service는 Active/Normal Profile과 non-Suspended Instance를 검증하되 actor origin과 Instance Reachability를 권한 조건으로 사용하지 않는다.
- Post visibility를 Owner 소유권 대신 사용하지 않는다.
- Notification cleanup 연결과 필요한 service 결과 확장은 실제 caller를 구현하는 PROD-419가 소유한다.

**Verification**

- Owner/non-owner, Remote Unresponsive actor, Post가 unavailable한 경우, 반복·동시 삭제와 이미 없는 관계를 database-backed test로 검증한다.
- GraphQL payload/error와 입력 ID를 유지하는 성공 no-op을 integration test로 검증한다.

- [x] 3.1 PROD-405가 소유한 delete input/payload와 이미 제거한 관계의 stable 식별 결정을 확정해 specs·decisions를 갱신하고 strict validation을 통과시킨다.
- [x] 3.2 Owner의 현재 관계를 원자적으로 멱등 삭제하는 core service와 GraphQL mutation을 구현한다.
- [x] 3.3 소유권·반복·동시·unavailable Post와 성공 no-op 검증을 추가하고 core/API check를 통과시킨다.

## 4. PROD-406 Reaction Type별 count 조회

**Deliverable**

Post를 조회할 수 있는 viewer가 현재 Reaction 전체의 Type별 count를 viewer와 무관하게 count 내림차순으로 조회한다.

**Guardrails**

- unavailable Profile의 현재 Reaction도 count에 포함한다.
- count 동률 Type 사이의 순서를 보장하지 않는다.
- 대상 Post의 기존 조회 정책을 우회하지 않는다.

**Verification**

- 서로 다른 viewer의 동일 count, unavailable Profile 포함, 삭제 반영, Type 격리, 내림차순과 Post 권한을 integration test로 검증한다.

- [ ] 4.1 Post가 Type별 Reaction count를 제공하는 query-layer DB 집계와 GraphQL field를 구현한다.
- [ ] 4.2 viewer-independent 집계·정렬·삭제 반영·Post 권한 검증을 추가하고 query/API check를 통과시킨다.

## 5. PROD-407 Reaction Type별 Profile 조회

**Deliverable**

Post를 조회할 수 있는 viewer가 한 Reaction Type에 반응한 조회 가능한 Profile을 중복 없는 Relay connection으로 탐색한다.

**Guardrails**

- Profile visibility를 SQL page limit 전에 적용한다.
- 다른 Type의 Profile을 섞지 않는다.
- visible Profile 수로 viewer-independent count를 다시 계산하지 않는다.

**Verification**

- Type 격리, viewer별 Profile 숨김, page fullness, cursor 경계와 중복·누락 없는 pagination을 integration test로 검증한다.

- [x] 5.1 PROD-407이 소유한 Profile ordering·cursor와 row 표시 범위를 확정해 specs·decisions를 갱신하고 strict validation을 통과시킨다.
- [x] 5.2 Type별 visible Profile connection과 필요한 forward index를 구현한다.
- [x] 5.3 visibility-before-limit과 다중 page pagination 검증을 추가하고 core/API check를 통과시킨다.

## 6. PROD-413 Reaction Notification 생성·inbox 통합

**Authority / Provenance**

- [Notification canonical 객체](../../../docs/domain/objects/notification.md)
- [Reaction canonical 객체](../../../docs/domain/objects/reaction.md)
- [ADR 0010](../../../docs/domain/decisions/0010-post-interaction-contracts.md)
- [PROD-413](https://linear.app/byulmaru/issue/PROD-413/reaction-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4)

**Deliverable**

다른 Local Profile의 Post에 새 Reaction이 생성되면 기존 Profile inbox에 source와 상관된 Reaction Notification이 Best Effort로 나타나고 이동·읽음 처리된다.

**Guardrails**

- PROD-277·324·372가 전달한 공통 목록 UI·badge·Read/navigation 계약을 유지한다.
- 자기 Post와 Remote Recipient에는 Local Notification을 만들지 않는다.
- Recipient, Related Profile, Target Post와 Type은 Reaction source에서 파생하고 snapshot을 복제하지 않는다.
- Notification 실패가 Reaction 결과를 rollback하지 않는다.

**Verification**

- source mapping, 동일 source uniqueness, 자기 알림 억제, Remote Recipient no-op과 실패 격리를 database-backed test로 검증한다.
- multi-kind Node/list/count/read, selected Profile 격리, inbox 표시·Post 이동과 badge/cache 일관성을 API/client integration test로 검증한다.

- [x] 6.1 PROD-413이 소유한 multi-kind visible projection과 PROD-277 Read/navigation 결정을 반영해 specs·decisions를 갱신하고 strict validation을 통과시킨다.
- [x] 6.2 Reaction Notification kind, source 저장 경계와 multi-kind GraphQL visibility·Node/list/count/read를 구현한다.
- [x] 6.3 Reaction Notification inbox item과 Post 이동·읽음·badge/cache 동기화를 구현한다.
- [x] 6.4 source correlation·실패 격리·API visibility와 client integration 검증을 추가하고 관련 check를 통과시킨다.

## 7. PROD-417 Reaction 선택 UI

**Deliverable**

사용자가 현재 여섯 built-in Type을 selected Profile 기준으로 독립적으로 추가·삭제하고 pending·실패 뒤 일관된 선택 상태를 확인한다.

**Guardrails**

- 공통 Post Action Bar와 실제 surface 조립을 포함하지 않는다.
- Type별 pending/error를 격리하고 selected Profile의 Relay Environment 사이에서 상태를 공유하지 않는다.
- 사용자 정의 Reaction 선택 UI를 포함하지 않는다.

**Verification**

- 선택·해제·복수 Type·같은 Type 중복 입력·mutation 성공·실패 복구와 selected Profile 전환을 component/integration test로 검증한다.

- [ ] 7.1 PROD-417이 소유한 zero-count Type 공급, selector UX와 optimistic update 결정을 확정해 specs·decisions를 갱신하고 strict validation을 통과시킨다.
- [ ] 7.2 add/delete mutation과 selected Profile cache를 사용하는 독립 Reaction selector component를 구현한다.
- [ ] 7.3 실제 Relay data shape의 Storybook/component interaction 검증을 추가하고 app check를 통과시킨다.

## 8. PROD-449 Reaction 요약 프레젠테이션과 PROD-418 통합

**Deliverable**

사용자가 Post의 viewer-independent Type별 count와 viewer가 조회할 수 있는 Type별 Profile 목록을 실제 page 단위로 확인한다. PROD-449는 이를 위한 재사용 presentation seam을 전달하고, PROD-418은 실제 data와 surface 통합을 전달한다.

**Guardrails**

- PROD-449 seam은 supplied count order를 그대로 사용하고 zero-count Type을 만들거나 제거·정렬·필터링하지 않으며, visible Profile 수로 count를 재계산하지 않는다.
- PROD-449 row는 기존 `ProfileListItem`의 Relay `Profile` fragment ref를 재사용하고, Storybook은 raw `$key` cast 대신 Relay mock fragment ref를 사용한다.
- PROD-449는 실제 query/connection, selected Profile/viewer cache, modal/route와 zero-count UX를 소유하지 않는다.
- 공통 Post Action Bar와 실제 surface 조립을 포함하지 않는다.
- selector, 사용자 정의 Reaction과 Reaction history를 구현하지 않는다.

**Verification**

- PROD-449는 supplied-order count, Type selection callback, loading/empty/error/populated, 복수 Type·동률, 기존 Profile row와 mock retry/pagination callback을 Storybook/component interaction으로 검증한다.
- PROD-418은 실제 Relay data shape의 count·viewer별 Profile 숨김·Type 격리·다중 page pagination과 modal/route 통합을 component/integration test로 검증한다.

- [x] 8.1 최종 `post-reaction-ui` spec이 변경되지 않음을 확인하고, PROD-449 fixture-first props 경계와 기존 Profile row 재사용 결정을 decisions·design·tasks에 동기화하고 strict validation을 통과시킨다.
- [x] 8.2 PROD-449 props-only `ReactionSummary`와 `ReactionProfileList`를 구현한다.
- [x] 8.3 PROD-449 Storybook과 component interaction에서 Relay mock fragment ref의 supplied-order·Type selection·상태·retry/pagination callback 조합을 검증한다.
- [ ] 8.4 PROD-418 zero-count/modal-route 결정 뒤 실제 count query·Relay connection·selected Profile/viewer cache 통합과 component/integration 검증을 구현한다.

## 9. PROD-419 Reaction Notification Best Effort 정리

**Authority / Provenance**

- [Notification canonical 객체](../../../docs/domain/objects/notification.md)
- [Reaction canonical 객체](../../../docs/domain/objects/reaction.md)
- [ADR 0010](../../../docs/domain/decisions/0010-post-interaction-contracts.md)
- [PROD-419](https://linear.app/byulmaru/issue/PROD-419/reaction-notification%EC%9D%84-%EC%A0%95%EB%A6%AC%ED%95%9C%EB%8B%A4)

**Deliverable**

Reaction 삭제 뒤 대응 Notification cleanup을 Best Effort로 시도하고, 실패하거나 반복해도 Reaction 삭제 결과와 API 가시성이 일관된다.

**Guardrails**

- cleanup은 source transaction 밖에서 같은 request로 await/catch한다.
- cleanup 실패를 무음으로 삼키지 않고 source Reaction을 식별할 수 있게 기록한다.
- retry, queue, cron, backfill과 bulk physical cleanup을 포함하지 않는다.
- source가 없는 stale row를 모든 Notification API surface에서 숨긴다.

**Verification**

- 정상·반복·누락 source cleanup, cleanup 실패 격리·오류 관측과 stale row의 Node/list/count/read 숨김을 database/API integration test로 검증한다.

- [x] 9.1 Reaction 삭제 결과에 연결되는 idempotent Notification cleanup을 구현한다.
- [x] 9.2 cleanup 성공·반복·실패 격리와 stale visibility 검증을 추가하고 core/API check를 통과시킨다.

## 10. PROD-390 Reaction 통합 검증·정합성 확인·archive

**Deliverable**

저장, mutation, 조회, 독립 UI와 Notification lifecycle이 하나의 Reaction 사용자 흐름으로 동작하고 canonical 문서와 active specs에 동기화된다.

**Guardrails**

- 모든 구현 자식과 담당 검증이 완료되기 전에 change를 archive하지 않는다.
- PROD-432의 공통 Action Bar/surface rollout은 부모 완료 조건에 포함하지 않는다.
- 사용자 정의 Reaction과 다른 제외 범위를 현재 구현된 것으로 기록하지 않는다.

**Verification**

- 허용 Type add/delete, viewer-independent count, viewer-filtered Profile 목록, selector/summary, 자기 알림 억제, inbox/read/이동과 삭제 cleanup을 연결한 통합 흐름을 검증한다.
- canonical 문서·OpenSpec delta·구현 정합성, archive diff와 archive 후 strict validation을 확인한다.

- [ ] 10.1 모든 자식 이슈·PR·검증 완료와 Remaining Decisions 정리를 확인한다.
- [ ] 10.2 전체 Reaction 사용자·Notification lifecycle 통합 검증을 실행한다.
- [ ] 10.3 canonical 문서와 OpenSpec delta를 최종 구현에 맞춰 동기화하고 strict validation을 통과시킨다.
- [ ] 10.4 Completion Gate 승인 뒤 change를 archive하고 archive 후 strict validation을 통과시킨다.
