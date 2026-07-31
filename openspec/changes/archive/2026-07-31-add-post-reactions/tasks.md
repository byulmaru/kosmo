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

권한 있는 Profile이 Instance Type과 무관하게 조회 가능한 Post에 허용 Type의 Reaction을 추가하며 반복·동시 요청에도 하나의 관계를 성공 결과로 유지한다.

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `PROD-404`, `PROD-439`

**Guardrails**

- GraphQL `usingProfile` entry point는 Active Account, Account–Profile membership과 selected Profile의 Active/Normal 및 non-Suspended Instance 상태를 검증하고 resolver/core는 이를 중복 검증하지 않는다. core service는 검증된 actor Profile identity를 받아 Post, Type과 멱등 저장만 검증한다.
- 기존 Post 조회 정책을 우회하지 않는다.
- 임의 Unicode와 사용자 정의 Reaction은 거부한다.
- 명시적 pessimistic lock을 추가하지 않는다.
- GraphQL은 `addReaction(input: { postId: ID!, type: String! })`과 `AddReactionPayload.reaction: Reaction!` 계약을 유지하며 신규 생성 여부를 공개하지 않는다.
- Notification 생성과 신규 source 구분은 PROD-413 범위이며 PROD-404는 이를 미리 구현하지 않는다.

**Verification**

- 성공, 허용되지 않은 Type, Post 상태 실패, actor Profile/Instance 상태 비재조회, 반복·동시 요청과 rollback을 core database-backed test로 검증한다.
- GraphQL payload·Node, Active Account/membership/selected Profile visibility scope와 validation/`NOT_FOUND` error 계약을 API integration test로 검증한다.

- [x] 2.1 PROD-404가 소유한 Type 공개 표현, add input/payload, Reaction Node와 Post 권한 오류 결정을 확정해 specs·decisions를 갱신하고 strict validation을 통과시킨다.
- [x] 2.2 허용 Type을 원자적으로 멱등 추가하는 core service와 GraphQL mutation을 구현한다.
- [x] 2.3 반복·동시 요청과 권한·validation 실패 검증을 추가하고 core/API check를 통과시킨다.

## 3. PROD-405 Owner Reaction 삭제

**Authority / Provenance**

- [Reaction canonical 객체](../../../../docs/domain/objects/reaction.md)
- [ADR 0012](../../../../docs/domain/decisions/0012-post-interaction-followup-clarifications.md)
- [ADR 0019](../../../../docs/domain/decisions/0019-selected-profile-authorization-boundary.md)
- [PROD-405](https://linear.app/byulmaru/issue/PROD-405/reaction을-삭제한다)
- [PROD-439](https://linear.app/byulmaru/issue/PROD-439/kosmo에서-uploading-local-media를-생성한다)

**Deliverable**

Reaction Owner가 대상 Post의 현재 조회 가능성과 무관하게 자신의 Reaction을 삭제하고 이미 제거한 같은 관계의 재시도를 성공 no-op으로 처리한다.

**Guardrails**

- 다른 Profile 소유의 현재 Reaction을 삭제하지 않는다.
- GraphQL `usingProfile` entry point는 Active Account, Account–Profile membership과 selected Profile의 Active/Normal 및 non-Suspended Instance 상태를 검증한다.
- core service는 검증된 행동 주체 Profile identity를 받아 Profile/Instance 상태를 다시 조회하지 않고 현재 Owner 관계와 persistence만 검증한다.
- Post visibility를 Owner 소유권 대신 사용하지 않는다.
- Notification cleanup 연결과 필요한 service 결과 확장은 실제 caller를 구현하는 PROD-419가 소유한다.

**Verification**

- Owner/non-owner, 행동 주체 Profile/Instance 상태 비재조회, Post가 unavailable한 경우, 반복·동시 삭제와 이미 없는 관계를 database-backed test로 검증한다.
- GraphQL payload/error, 사용할 수 없는 selected Profile 거부와 입력 ID를 유지하는 성공 no-op을 integration test로 검증한다.

- [x] 3.1 PROD-405가 소유한 delete input/payload와 이미 제거한 관계의 stable 식별 결정을 확정해 specs·decisions를 갱신하고 strict validation을 통과시킨다.
- [x] 3.2 Owner의 현재 관계를 원자적으로 멱등 삭제하는 core service와 GraphQL mutation을 구현한다.
- [x] 3.3 소유권·반복·동시·unavailable Post와 성공 no-op 검증을 추가하고 core/API check를 통과시킨다.

## 4. PROD-406 Reaction Type별 count 조회

**Authority / Provenance**

- [Reaction canonical 객체](../../../../docs/domain/objects/reaction.md)
- [ADR 0010](../../../../docs/domain/decisions/0010-post-interaction-contracts.md)
- [PROD-406](https://linear.app/byulmaru/issue/PROD-406/reaction-type%EB%B3%84-%EA%B0%9C%EC%88%98%EB%A5%BC-%EC%A1%B0%ED%9A%8C%ED%95%9C%EB%8B%A4)

**Deliverable**

Post를 조회할 수 있는 viewer가 `Post.reactionCounts`에서 현재 Reaction 전체의 Type별 count를 viewer와 무관하게 조회한다. 최종 표시 순서는 PROD-576이 소유한다.

**Guardrails**

- GraphQL은 `Post.reactionCounts: [ReactionCount!]!`와 `ReactionCount.type: String!`, `ReactionCount.count: Int!` 계약을 유지한다.
- 현재 Reaction이 있는 Type만 포함하고 Reaction이 없으면 빈 목록을 반환한다.
- unavailable Profile의 현재 Reaction도 count에 포함한다.
- 정렬 계약은 PROD-576의 현재 최초 Reaction 생성 시각 순서를 따른다.
- 대상 Post의 기존 조회 정책을 우회하지 않는다.

**Verification**

- schema test에서 non-null list와 항목 shape를 검증한다.
- 서로 다른 viewer의 동일 count, 빈 목록, unavailable Profile 포함, 삭제 반영, Type 격리와 Post 권한을 integration test로 검증한다. 정렬 회귀는 PROD-576에서 검증한다.

- [x] 4.1 PROD-406이 소유한 `reactionCounts` 공개 shape를 specs·decisions·design·tasks에 동기화하고 strict validation을 통과시킨다.
- [x] 4.2 Post가 Type별 Reaction count를 제공하는 query-layer DB 집계와 GraphQL field를 구현한다.
- [x] 4.3 viewer-independent 집계·정렬·삭제 반영·Post 권한 검증을 추가하고 query/API check를 통과시킨다.

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

- [Notification canonical 객체](../../../../docs/domain/objects/notification.md)
- [Reaction canonical 객체](../../../../docs/domain/objects/reaction.md)
- [ADR 0010](../../../../docs/domain/decisions/0010-post-interaction-contracts.md)
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

## 7. PROD-450 Reaction selector 프레젠테이션과 PROD-417 통합

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/design/reactions.md`
- `PROD-450`
- `PROD-472`
- `PROD-414`
- `PROD-417`
- `PROD-418`

**Deliverable**

사용자가 기존 Post Action Bar의 anchored Quick Picker와 목록·상세의 기존 Reaction token에서 현재 여섯 built-in Type을 selected Profile 기준으로 실제 추가·삭제하고, Reaction 전용 More에서 Type별 Profile 목록을 탐색한다. PROD-450·418의 presentation/data seam을 재사용하고 PROD-417은 shared controller, Web geometry, trigger·popover·summary·mutation/cache와 Post surface 통합을 전달한다.

**Guardrails**

- PROD-450 seam은 부모가 공급한 ordered option을 그대로 표시하고 현재 여섯 Type을 component 내부에 고정하지 않는다.
- PROD-450은 표시 문자열과 분리된 opaque option identity별 selected/pending/error controlled 상태와 toggle callback만 소유하며 서로 다른 Type의 기존 선택을 유지한다.
- Quick Picker는 Web에서 border 없는 32×32px·12px radius option, 20px emoji, 16×16px·2px fading arc와 4px option gap/panel padding을 사용한다. selected는 emoji와 분리된 `primary`/`primaryHover` 배경 layer를 70% opacity로 표시하고 error는 빨간 border를 추가하지 않는다. 전체 disabled이면 panel을 렌더링하지 않는다. Native target과 spinner geometry는 이번 Web 우선 변경에서 축소하지 않는다.
- PROD-450은 mutation, Relay fragment/cache, 실제 서버 실패 복구, trigger·popover, Post Action Bar/surface 배치와 custom emoji Full Picker·palette·검색을 포함하지 않는다.
- PROD-417은 private `ReactionAction`·`ReactionPopover`를 기존 `PostActionBar`에 연결하고 private `PostReactionController`를 Quick Picker와 summary token에 공급한다. generic context/mock infrastructure, `ActionMenu` 일반화, 범용 anchored overlay, Reply composer·Post Action Bar의 일반 More action과 전체 action 조립은 포함하지 않는다.
- popover와 summary shell은 가용 너비보다 넓은 32px Web target row를 축소하거나 wrap하지 않고 feature-local horizontal `ScrollView` 안에서 접근하게 한다.
- fixed 여섯 Type은 zero-count와 무관하게 client catalog가 공급하며 `viewerReactions`는 selected state만 제공한다. optimistic update를 사용하지 않는다.
- add/delete payload는 Post의 `viewerReactions`와 `reactionCounts`를 함께 반환하며 Relay가 nullable `reactionId`와 무관하게 authoritative하게 정규화한다. `post: null`이면 client가 기존 상태를 추측해 변경하지 않는다.
- 필요한 payload와 GraphQL `errors`가 함께 있으면 payload 결과를 성공으로 처리하고, payload 부재·network failure만 실패로 처리한다.
- PROD-417은 같은 Type의 surface-local 중복 입력을 막고 서로 다른 Type의 동시 mutation과 reverse completion을 허용한다. Type별 pending/error를 격리하고 selected Profile의 Relay Environment 사이에서 UI 상태를 공유하지 않는다.
- 같은 actor의 여러 surface를 client 전역에서 직렬화하지 않는다.
- guest이거나 selected Profile이 없으면 Reaction trigger를 disabled로 표시하고 popover·mutation을 시작하지 않는다. 로그인·가입·Profile 선택 onboarding은 포함하지 않는다.
- selected Profile이 없으면 양수 count summary token도 disabled지만 Reaction 전용 More와 Profile 목록 조회는 사용할 수 있다.
- 목록·상세의 일반·Quote는 own Post, 순수 Repost는 source Post를 Quick Picker·summary·Profile modal의 공통 `reactionTarget`으로 사용한다.
- summary token은 same-Type toggle이고 standalone 제목은 제거한다. Web token, selected 배경 layer와 Reaction 전용 More는 radius 12px를 사용한다. selected token은 Quick Picker와 같은 분리된 `primary`/`primaryHover` 70% 배경 layer를 사용해 emoji·count opacity를 유지한다. 양수 count 뒤의 32px Reaction 전용 More는 server 순서의 emoji tab modal을 열며 목록 제목은 `반응한 사람`으로 고정하고 item emoji는 현재 tab Type에서 파생한다.
- mutation 성공 payload Post로만 선택 상태와 count를 갱신한다. local delta·수동 updater·targeted refetch를 사용하지 않으며 실패나 stale actor callback은 이전 server-confirmed 상태를 유지한다.
- 사용자 정의 Reaction identity·asset·federation 계약을 포함하지 않는다.

**Verification**

- PROD-417은 supplied order와 현재 여섯 fixture, 선택·해제·복수 Type, Web exact 32px option·20px emoji·16px/2px fading arc, 70% selected 배경과 100% emoji, error·중복 입력 방지, 전체 disabled 미렌더링과 callback을 Storybook/component interaction으로 검증한다.
- PROD-417 unit test는 실제 mutation payload의 Post 정규화로 add/delete의 authoritative `viewerReactions`·`reactionCounts`·server 순서, idempotent 응답, nullable `reactionId`, `post: null` 무변경과 actor Store 격리를 검증한다.
- PROD-417 Web integration은 trigger 재입력, outside pointer, `Escape`, 첫 option·trigger focus, `aria-haspopup`/`aria-expanded`, 열린 상태 유지, top/left·bottom/right flip/clamp와 좁은 너비 scroll, Type별 동시 pending·reverse completion·실패/retry·actor 전환·unmount 뒤 늦은 callback을 검증한다.
- selected Profile 부재 fixture는 disabled trigger가 popover와 mutation request를 만들지 않는지 검증한다.
- production Post fixture는 ordinary·Quote가 자신의 Post ID를, 순수 Repost가 source Post ID를 mutation 대상으로 사용하는지 검증한다.
- 목록·상세 fixture는 summary 배치, token·selected layer·More의 12px radius, selected token의 primary layer, picker/token 공유 state, authoritative mutation count, Reaction 전용 More·emoji tab·`반응한 사람` 제목·item emoji·pagination/retry와 selected Profile 부재 조회를 검증한다.
- iOS·Android 동작 계약은 유지하되, 2026-07-28 사용자 결정에 따라 native app runtime 관찰은 현재 제품 범위와 PROD-417 PR Ready gate에서 제외하고 native app 작업 재개 시 후속 확인한다. 기존 `Reactions`·`ActionMenu` presentation catalog와 API/DB test를 중복 확장하지 않는다.

- [x] 7.1 PROD-450 supplied-option Quick Picker 프레젠테이션과 후속 PROD-417 통합 경계를 proposal·design·decisions·tasks에 기록하고 strict validation을 통과시킨다.
- [x] 7.2 PROD-450 props-only `ReactionSelector` Quick Picker panel을 canonical 시각 계약에 맞게 구현한다.
- [x] 7.3 PROD-450 Storybook/component interaction에서 supplied option 동작과 border·radius·selected layer·fading arc pending overlay·error·disabled 미렌더링을 검증하고 app check를 통과시킨다.
- [x] 7.4 PROD-417이 소유한 fixed option, anchored popover, server-confirmed mutation/cache, partial payload, actor 격리와 실제 Action Bar surface 결정을 canonical design·specs·decisions·tasks에 동기화하고 strict validation을 통과시킨다.
- [x] 7.5 private Reaction action/popover와 add/delete mutation을 기존 Post Action Bar·PROD-450 presentation seam에 연결하고, 승인된 non-connection `viewerReactions` updater와 stale UI callback guard를 구현한다.
- [x] 7.6 production updater seam을 직접 검증하는 최소 unit test로 add/delete cache matrix, Type별 concurrency와 actor 전환을 검증한다.
- [x] 7.7 Post Action Bar Storybook integration에서 Web popover dismiss/focus/placement, 동시 mutation·실패/retry·unmount를 검증하고 production Post fixture에서 ordinary·Quote·순수 Repost mutation target을 검증한다.
- [x] 7.8 app test·lint·format·diff check와 OpenSpec strict validation을 통과시키고 Web 자동 검증·runtime 관찰을 분리해 기록하며, 현재 제품 범위에서 제외한 iOS·Android runtime 관찰은 후속 확인으로 남긴다.
- [x] 7.9 2026-07-29 PROD-417의 Web geometry, summary token toggle, shared controller/count refetch, 목록·상세 target과 Reaction 전용 More/Profile tab 계약을 canonical·Linear·specs·design·decisions·tasks에 동기화하고 strict validation을 통과시킨다.
- [x] 7.10 TDD로 `ReactionSelector`와 `ReactionSummary`의 Web exact 32px presentation, standalone 제목 제거, pending/error/disabled와 feature-local horizontal scroll을 구현·검증한다.
- [x] 7.11 TDD로 private `PostReactionController`를 도입해 Quick Picker와 summary token의 server-confirmed selected·count·Type별 pending/error, updater no-synthesis, targeted `reactionCounts` refetch와 actor isolation을 구현·검증한다.
- [x] 7.12 TDD로 목록·상세의 ordinary·Quote own Post와 pure Repost source Post target, summary 배치, Reaction 전용 More·양수 count emoji tab·Profile item emoji와 기존 pagination/retry/cache를 구현·검증한다.
- [x] 7.13 app test·lint·format·diff check와 OpenSpec strict validation을 통과시키고 320px·390px·600px Web runtime을 관찰한다. 자동 검증·Web 관찰·미실행 iOS/Android 관찰을 분리해 기록한다.
- [x] 7.14 TDD로 selected summary token의 `primary` 70% 배경 layer와 `반응한 사람` Profile 목록 제목을 구현·검증한다.
- [x] 7.15 독립 리뷰 finding에 따라 320px·여섯 Type Profile tab의 horizontal scroll과 Profile 사이 separator를 TDD로 구현·검증하고, 현재 Native target 편차와 44pt·48dp 출시 gate를 canonical·OpenSpec에 동기화한다.
- [x] 7.16 사용자 승인에 따라 Web summary token·selected 배경 layer·Reaction 전용 More의 radius를 8px에서 12px로 한 단계 올리고 Storybook exact geometry를 TDD로 검증한다.

## 8. PROD-449 Reaction 요약 프레젠테이션과 PROD-418 통합

**Authority / Provenance**

- [Reaction canonical 객체](../../../../docs/domain/objects/reaction.md)
- [Reaction UI 디자인](../../../../docs/design/reactions.md)
- `PROD-449`
- `PROD-418`의 2026-07-25 설계 결정 댓글

**Deliverable**

사용자가 Post의 viewer-independent Type별 count와 viewer가 조회할 수 있는 Type별 Profile 목록을 실제 page 단위로 확인한다. PROD-449는 이를 위한 재사용 presentation seam을 전달하고, PROD-418은 실제 data와 surface 통합을 전달한다.

**Guardrails**

- PROD-449 seam은 supplied count order를 그대로 사용하고 zero-count Type을 만들거나 제거·정렬·필터링하지 않으며, visible Profile 수로 count를 재계산하지 않는다.
- PROD-449 row는 기존 `ProfileListItem`의 Relay `Profile` fragment ref를 재사용하고, Storybook은 raw `$key` cast 대신 Relay mock fragment ref를 사용한다.
- PROD-449는 실제 query/connection, selected Profile/viewer cache, modal/route와 zero-count UX를 소유하지 않는다.
- PROD-418은 기존 Post detail route에 요약 진입점을 전달했다. 2026-07-29 PROD-417은 같은 data seam을 feed/list surface로 확장하고 summary token interaction과 Reaction 전용 More를 변경한다.
- PROD-418 자체는 selector, 사용자 정의 Reaction과 Reaction history를 구현하지 않았다. PROD-417은 기존 selector mutation 상태만 summary와 공유한다.
- PROD-418은 Profile 조회 오류용 snackbar·toast·전역 outlet이나 Reaction mutation 오류 UX를 추가하지 않는다.

**Verification**

- PROD-449는 supplied-order count, Type selection callback, loading/empty/error/populated, 복수 Type·동률, 기존 Profile row와 mock retry/pagination callback을 Storybook/component interaction으로 검증한다.
- PROD-418은 실제 Relay data shape의 count·viewer별 Profile 숨김·Type 격리·다중 page pagination, zero-count 미렌더링, modal dismiss, inline retry, edge 보존, cache 우선 재진입과 selected Profile 격리를 component/integration test로 검증한다.

- [x] 8.1 최종 `post-reaction-ui` spec이 변경되지 않음을 확인하고, PROD-449 fixture-first props 경계와 기존 Profile row 재사용 결정을 decisions·design·tasks에 동기화하고 strict validation을 통과시킨다.
- [x] 8.2 PROD-449 props-only `ReactionSummary`와 `ReactionProfileList`를 구현한다.
- [x] 8.3 PROD-449 Storybook과 component interaction에서 Relay mock fragment ref의 supplied-order·Type selection·상태·retry/pagination callback 조합을 검증한다.
- [x] 8.4 PROD-418의 zero-count·modal·조회 오류·cache 결정을 specs·decisions·design·tasks에 동기화하고 strict validation을 통과시킨다.
- [x] 8.5 실제 Post count query와 Type별 `reactionProfiles` Relay connection을 기존 props seam에 연결하고, zero-count summary 미렌더링과 현재 Post 위 modal dismiss를 구현한다.
- [x] 8.6 최초·추가 page 조회 오류를 modal·목록 내부 retry로 연결하고 기존 edge 보존, cache 우선 background 갱신과 selected Profile 격리를 구현한다.
- [x] 8.7 실제 Relay data shape의 count·Type 격리·pagination·modal·오류 복구·cache 동작을 최소 component/integration test로 검증하고 app check를 통과시킨다.

## 9. PROD-419 Reaction Notification Best Effort 정리

**Authority / Provenance**

- [Notification canonical 객체](../../../../docs/domain/objects/notification.md)
- [Reaction canonical 객체](../../../../docs/domain/objects/reaction.md)
- [ADR 0010](../../../../docs/domain/decisions/0010-post-interaction-contracts.md)
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

## 10. PROD-472 Selector 현재 상태 조회와 Post/Type 삭제

**Authority / Provenance**

- [Reaction canonical 객체](../../../../docs/domain/objects/reaction.md)
- [ADR 0016](../../../../docs/domain/decisions/0016-reaction-selector-current-state.md)
- [PROD-472](https://linear.app/byulmaru/issue/PROD-472/reaction-selector%EC%9A%A9-%ED%98%84%EC%9E%AC-%EC%83%81%ED%83%9C-%EC%A1%B0%ED%9A%8C%EC%99%80-type-%EC%82%AD%EC%A0%9C-%EA%B3%84%EC%95%BD%EC%9D%84-%EB%B3%B4%EC%99%84%ED%95%9C%EB%8B%A4)

**Deliverable**

Reaction selector가 selected Profile이 Post에 남긴 현재 Reaction 관계를 복원하고 Post와 Type으로 자신의 현재 관계를 멱등하게 삭제한다.

**Guardrails**

- 조회는 `Post.viewerReactions: [Reaction!]!`로 현재 selected Profile의 관계 Node만 제공하고 guest·selected Profile 부재에는 빈 목록을 반환한다.
- 여러 Post의 viewer-relative 관계는 batch 조회하며 selected Profile 사이에서 loader·cache 결과를 공유하지 않는다.
- 삭제는 `{ postId, type }`으로 현재 selected Profile의 조합만 원자적으로 제거하고 다른 Profile과 다른 Type을 변경하지 않는다.
- 실제 삭제된 Reaction ID가 있을 때만 post-commit Notification cleanup을 시도한다. cleanup 실패는 삭제 성공과 분리한다.
- 오래 지연된 요청이 같은 조합으로 재생성된 현재 Reaction을 제거할 수 있는 ABA 가능성을 수용하며 별도 history·ledger·lock을 추가하지 않는다.
- PROD-417의 zero-count option 공급, optimistic update, pending/error UX와 Relay adapter 구현을 포함하지 않는다.

**Verification**

- schema와 API integration test로 guest·selected Profile 부재, Profile별 목록, Profile 전환, multi-Post batching, 삭제 payload와 다른 Profile/Type 보존을 검증한다.
- core database test로 missing·반복·동시 삭제, 허용된 ABA, actor/Type 검증과 실제 삭제 ID 기반 Notification cleanup·실패 격리를 검증한다.

- [x] 10.1 canonical·Linear 계약을 specs·design·decisions·tasks에 동기화하고 strict validation을 통과시킨다.
- [x] 10.2 `Post.viewerReactions` batch loader와 GraphQL field를 구현한다.
- [x] 10.3 core와 GraphQL `deleteReaction`을 Post/Type 입력, nullable 삭제 결과와 post-commit cleanup 계약으로 전환한다.
- [x] 10.4 core·schema·API integration 검증과 typecheck·format check를 통과시킨다.

## 11. PROD-576 Reaction Type 최초 생성 시각 순서

**Authority / Provenance**

- [Reaction canonical 객체](../../../../docs/domain/objects/reaction.md)
- [ADR 0010](../../../../docs/domain/decisions/0010-post-interaction-contracts.md)
- [Reaction UI 디자인](../../../../docs/design/reactions.md)
- [PROD-576](https://linear.app/byulmaru/issue/PROD-576/reaction-type을-최초-reaction-생성-시각-순으로-안정적으로-표시한다)

**Deliverable**

Reaction summary와 Profile modal의 Type이 각 Type에 현재 존재하는 최초 Reaction 생성 시각 순으로 안정적으로 표시되고, mutation payload의 authoritative Post 상태를 사용해 Relay 위치 기반 record가 충돌하지 않는다.

**Guardrails**

- 주 정렬은 각 Post·Type에 현재 존재하는 Reaction의 `MIN(createdAt) ASC`다.
- 같은 최초 생성 시각에는 제품상 Type 우선순위를 뜻하지 않는 결정적 최종 tie-break를 적용한다.
- count 증감만으로 기존 Type을 재정렬하지 않는다.
- Type이 0개가 됐다가 재등장하면 새 현재 최초 생성 시각으로 배치한다.
- `ReactionCount` 공개 shape에 ID나 생성 시각을 추가하지 않고 삭제된 Reaction history를 저장하지 않는다.
- add/delete mutation payload는 현재 Post의 `viewerReactions`와 `reactionCounts`를 반환하며 client는 local delta·수동 updater·targeted refetch를 사용하지 않는다.

**Verification**

- API integration에서 viewer-independent count, 현재 최초 생성 시각 순서, count 증감, 최초 Reaction 삭제, 0→1 재등장, 동일 생성 시각과 동일 Post 복수 응답 경로를 검증한다.
- API/client test에서 idempotent add·no-op delete를 포함한 mutation payload Post의 선택 상태·count·server 순서 정규화를 검증한다.
- canonical·OpenSpec strict validation, API/app typecheck·test와 format/diff check를 통과시킨다.

- [x] 11.1 PROD-576의 현재 최초 Reaction 생성 시각 순서와 Relay 안정성 계약을 canonical·specs·design·decisions·tasks에 동기화하고 strict validation을 통과시킨다.
- [x] 11.2 API Type별 집계를 현재 최초 생성 시각 오름차순과 결정적 최종 tie-break로 변경하고 회귀 검증을 추가한다.
- [x] 11.3 클라이언트 local count delta가 server 순서를 유지하고 새 Type만 뒤에 추가하도록 변경하고 unit test를 추가한다.
- [x] 11.4 API·client·format·OpenSpec 검증을 통과시키고 PROD-576 구현 증거를 정리한다.
- [x] 11.5 PROD-576의 authoritative mutation Post 계약을 canonical·Linear·specs·design·decisions·tasks에 동기화하고 strict validation을 통과시킨다.
- [x] 11.6 add/delete mutation payload가 현재 Post를 반환하도록 API schema와 integration test를 변경한다.
- [x] 11.7 client local count delta·수동 updater·targeted refetch를 제거하고 mutation payload 정규화를 검증한다.
- [x] 11.8 API·client·format·OpenSpec 검증을 통과시키고 갱신된 PROD-576 구현 증거를 정리한다.

## 12. PROD-390 Reaction 통합 검증·정합성 확인·archive

**Deliverable**

저장, mutation, 조회, 독립 UI와 Notification lifecycle이 하나의 Reaction 사용자 흐름으로 동작하고 canonical 문서와 active specs에 동기화된다.

**Guardrails**

- 모든 구현 자식과 담당 검증이 완료되기 전에 change를 archive하지 않는다.
- PROD-432의 공통 Action Bar/surface rollout은 부모 완료 조건에 포함하지 않는다.
- 사용자 정의 Reaction과 다른 제외 범위를 현재 구현된 것으로 기록하지 않는다.

**Verification**

- 허용 Type add/delete, viewer-independent count, viewer-filtered Profile 목록, selector/summary, 자기 알림 억제, inbox/read/이동과 삭제 cleanup을 연결한 통합 흐름을 검증한다.
- canonical 문서·OpenSpec delta·구현 정합성, archive diff와 archive 후 strict validation을 확인한다.

- [x] 12.1 모든 자식 이슈·PR·검증 완료와 Remaining Decisions 정리를 확인한다.
- [x] 12.2 전체 Reaction 사용자·Notification lifecycle 통합 검증을 실행한다.
- [x] 12.3 canonical 문서와 OpenSpec delta를 최종 구현에 맞춰 동기화하고 strict validation을 통과시킨다.
- [x] 12.4 Completion Gate 승인 뒤 change를 archive하고 archive 후 strict validation을 통과시킨다.
