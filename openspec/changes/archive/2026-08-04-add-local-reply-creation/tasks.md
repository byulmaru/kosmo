## 1. PROD-424 Reply backend 생성/API

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-424`

**Deliverable**

기존 `createPost` GraphQL 계약으로 요청 Profile이 조회할 수 있는 contentful Parent에 현재 지원 PostContent·Visibility를 가진 Local Reply를 생성하고 기존 `Post` payload를 받는다.

**Guardrails**

- `replyParentId`는 nullable concrete `Post` global ID이며 Parent는 행동 주체 Profile 기준 Visibility·Eligibility와 Content 검증을 통과해야 한다.
- Reply Visibility는 Parent와 독립적이고 `repostSourceId`는 작성 입력에 추가하지 않는다.
- Parent 검증과 Post·Content·Reply Parent 저장은 원자적이어야 하며 실패 시 부분 데이터를 남기지 않는다.
- Content Warning, Media/Sensitive Media capability의 변경, Mentioned Profiles/DIRECT와 Reply+Quote 작성은 포함하지 않는다. 기존 `createPost`의 Media/Sensitive Media 입력 계약은 보존한다.

**Verification**

- 일반 Post 작성 회귀와 contentful 일반 Post·Reply·Quote Parent의 Reply 생성을 검증한다.
- wrong global typename, missing·Tombstone·hidden·contentless Parent, 권한 없는 actor와 transaction rollback을 검증한다.
- Parent와 다른 현재 지원 Visibility, `currentContentId != null`, 입력 `replyParentId`, `repostSourceId = null`과 기존 Post payload를 검증한다.

- [x] 1.1 nullable concrete `Post` `replyParentId`를 받는 additive GraphQL 입력·schema 계약을 구현한다.
- [x] 1.2 행동 주체와 Parent의 권한·Visibility·Eligibility·Content를 검증하고 원자적 Reply 저장에 연결한다.
- [x] 1.3 성공, 독립 Visibility, global ID, Parent 상태·권한과 rollback API integration 테스트를 추가한다.
- [x] 1.4 기존 일반 Post 작성·core Reply 테스트와 GraphQL schema check를 통과시킨다.

## 2. PROD-425 Reply 작성 UI/thread 통합

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/design/colors.md`
- `docs/design/typography.md`
- `docs/design/breakpoints.md`
- `docs/design/reply-composer.md`
- `PROD-425`

**Deliverable**

목록의 contentful Parent에서는 폭과 platform에 맞는 modal·전체 화면 surface로, 상세의 contentful Parent에서는 현재 thread의 inline surface로 기존 composer를 열어 Reply를 작성하고 현재 화면을 유지한 채 성공 결과를 열 수 있다.

**Guardrails**

- 기존 composer·`Post` fragment·mutation payload와 PROD-422의 선행 thread 계약을 재사용하고 Reply 전용 composer나 Post Kind/concrete type을 만들지 않는다.
- Content 없는 Repost의 Reply action은 disabled이며 callback·composer·mutation 진입을 차단한다.
- 순수 Repost의 Repost action target은 direct Source를 유지하지만 Reply eligibility는 바깥 display Post identity에서 계산한다. 목록·thread coordinator는 selected Profile, surface mode, 하나의 active Parent와 dirty·pending 전환만 공급하고, `PostListItem`/`PostLayout`이 Reply action과 Composer surface를 내부 조립한다.
- 목록은 Web `>= compact`에서 600px modal, Web `< compact`와 Native에서 전체 화면 composer를 사용하고, 상세는 행별 inline composer를 사용한다. Parent preview는 비대화형이며 Action Bar·menu를 중복 표시하지 않는다.
- Parent의 일반 첨부 이미지는 표시하되 Sensitive Media 공개와 이미지 오류 재시도 control은 노출하지 않는다.
- pristine close, dirty 취소 확인, pending close 차단, 실패 상태 유지, 성공 close·focus 복원과 Web modal focus trap·배경 scroll lock을 surface lifecycle로 제공한다.
- selected Profile이 없는 guest에는 Reply config를 새로 노출하지 않고 guest 인증 위임과 Reply 외 전체 action 조합은 PROD-432에 남긴다.
- Visibility는 Parent와 독립적이며 validation·pending·실패·성공 상태와 Relay cache는 selected Profile별로 격리한다.
- 성공하면 현재 화면과 focus를 유지하고 결과 Reply로 이동하는 `보기` action을 가진 약 3초의 transient snackbar를 표시하되 자동 이동하거나 connection membership을 합성하지 않는다.
- Reply+Quote 작성, Action Bar 전체 rollout, ActivityPub Reply와 Notification inbox UI는 포함하지 않는다.

**Verification**

- contentful 일반 Post·Reply·Quote의 목록 modal·전체 화면 및 상세 행별 inline composer 진입, display Post/action target 분리와 contentless Repost disabled 호출 차단을 검증한다.
- Home·Profile·Bookmark·상세 query가 selected Profile fragment와 성공 callback을 필수 coordinator 경계에 전달하고, 각 `PostListItem`/`PostLayout`이 행별 Reply config prop 없이 coordinator를 소비해 action과 Composer를 내부 조립하며, coordinator 누락은 조용한 Reply 제거가 아니라 프로그래밍 오류이고 guest/null Profile 경계에서는 Reply config를 새로 노출하지 않음을 검증한다.
- Parent와 다른 Visibility, validation·pending·성공·실패 상태와 selected Profile 전환 격리를 검증한다.
- 일반·Sensitive Media Parent에서 이미지 표시·가림은 유지하면서 Media 상태 변경 control이 제외되는지 검증한다.
- pristine·dirty·pending·실패·성공 close, focus trap·복원·배경 scroll lock, single central scroll과 selected Profile 없는 surface의 unchanged partial rollout을 검증한다.
- 상세 current·ancestor·descendant에서 active Parent를 전환할 때 dirty 확인·pending 차단을 거치고, 정확한 한 행만 `expanded` 상태를 받으며 close·성공 뒤 해당 Reply action으로 focus가 복원되는지 검증한다.
- 성공 payload 뒤 현재 detail route만 targeted refetch되고 현재 query 범위의 결과만 thread에 반영되며, transient 성공 snackbar가 표시되는 동안 `보기`로 결과 Reply를 열 수 있고 자동 이동·다른 actor Store·관련 없는 목록 변경이 없음을 자동화로 검증한다.
- 실제 API의 targeted refetch 실패·retry와 Web 짧은-height layout은 통합 runtime 검증으로, Android·iOS의 keyboard·safe area·platform back·접근성은 Native 출시 gate의 별도 증거로 남긴다. 이 미실행 항목을 현재 PR의 자동화 또는 Ready 근거로 주장하지 않는다.

- [x] 2.1 PROD-422의 Reply 조상·하위 API와 Post 상세 thread 계약이 merge되었고 이 change와 ownership 중복이 없음을 확인한다.
- [x] 2.2 display Post와 Action Bar target을 분리한 actual 목록·상세 surface에서 `PostListItem`/`PostLayout`이 coordinator를 내부 소비해 contentful Parent의 Reply action과 기존 composer를 controlled `expanded`에 연결하고, caller의 행별 Reply config prop 없이 contentless Repost의 Source target을 유지하면서 Reply 진입을 차단한다.
- [x] 2.3 기존 composer가 `replyParentId`를 포함해 Reply를 제출하고 DIRECT를 제외하며 selected Profile·Relay Environment·Parent별 입력·pending·error와 늦은 completion·callback을 격리하게 확장한다.
- [x] 2.4 direct Parent preview와 기존 composer를 조립해 Web 목록 modal·좁은 Web/Native 전체 화면·상세 thread 행별 inline surface, pristine/dirty/pending·실패·성공 lifecycle과 focus·scroll 계약을 구현한다.
- [x] 2.5 성공한 `Post` payload 뒤 현재 detail route만 targeted refetch하고 transient 결과 Reply `보기`를 제공하며 mutation 실패 시 입력·Parent를 유지하고, surface·route·상태 격리·일반 Post 회귀 검증과 Relay compiler/check를 통과시킨다.
- [x] 2.6 비대화형 Parent가 일반 이미지는 표시하면서 Sensitive 공개·이미지 오류 재시도 control을 제외하도록 Media interaction을 정렬한다.

## 3. PROD-426 Reply Notification/inbox 통합

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/domain/objects/post.md`
- `PROD-426`

**Deliverable**

다른 Profile의 Post에 Local Reply가 생성되면 Parent Author가 기존 inbox에서 Reply Author를 보고 결과 Reply로 이동하며, 기존 Unread·Read·badge/cache 흐름을 사용한다.

**Guardrails**

- source와 Related Post는 결과 Reply, Related Profile은 Reply Author, Recipient는 Parent Author에서 파생하고 self-reply와 Recipient에게 보이지 않는 결과는 생성을 억제한다.
- 아직 구현되지 않은 Profile Mute·Profile Block·Profile Domain Block·Domain Block Instance, Notification scope Word·Hashtag Mute와 Root Post thread Notification Mute capability 및 Reply source 연동은 제외하고, capability가 제공되기 전에는 PROD-273의 기본 allow 계약을 따른다.
- Notification은 Reply 생성 transaction의 격리된 Best Effort savepoint로 생성하며 저장 실패가 Reply를 rollback하거나 mutation 성공을 실패로 바꾸지 않는다.
- 기존 Notification projection·interface·connection·count·Read·badge/cache를 확장하고 별도 inbox를 만들지 않는다.
- duplicate/concurrent source에서 uniqueness를 유지하고 visible filtering을 page limit 전에 적용한다.
- ActivityPub delivery, retry/outbox/backfill과 Tombstone 후 동기 cleanup은 포함하지 않는다.

**Verification**

- 타인 Post Reply, self-reply, invisible 결과, duplicate/concurrent source와 Notification 저장 실패 격리를 검증한다.
- source·Related Post·Related Profile·Recipient mapping, concrete `ReplyNotification` Node와 unavailable predicate를 검증한다. Parent Tombstone은 Reply 자체의 visibility/eligibility를 제거하지 않으며, interface-only list는 source loader를 호출하지 않고 concrete Reply source fields는 request당 한 batch로 mapping됨을 검증한다.
- mixed connection·Unread count·Read, inbox 표시·Reply 이동·Best Effort Read와 selected Profile cache 격리를 검증한다.

- [x] 3.1 기존 Notification 기반의 projection·API·client contract가 merge되었고 Reply kind 확장이 공통 계약을 재사용할 수 있음을 확인한다.
- [x] 3.2 Reply source에서 Recipient·Related Post·Related Profile을 파생하는 멱등 Notification 저장·visibility 계약을 추가한다.
- [x] 3.3 Reply 생성 lifecycle에서 Notification 생성을 격리된 Best Effort savepoint로 연결하고 self-reply·invisible 결과를 억제한다.
- [x] 3.4 concrete `ReplyNotification` Node와 mixed visible connection·Unread count·Read 계약을 기존 Notification API에 통합한다.
- [x] 3.5 기존 inbox item에 Reply Author 표시, 결과 Reply 이동, Best Effort Read와 selected Profile badge/cache 동기화를 연결한다.
- [x] 3.6 source mapping·self-reply·visibility·uniqueness·실패 격리 서비스 검증과 API Node·connection·count·Read integration 테스트를 통과시킨다.
- [x] 3.7 inbox 표시·이동·Read·cache·Profile 전환 client 검증과 Relay compiler/check를 통과시킨다.
- [x] 3.8 PROD-507에서 Local·ActivityPub Reply가 transaction 인자와 무관한 공통 Best Effort Notification lifecycle을 사용하도록 정렬하고, duplicate no-op·outer transaction 회귀를 검증한다.

## 4. PROD-640 Reply Composer Media 계약 복구

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `docs/domain/decisions/0022-post-content-revision-media-nodes.md`
- `PROD-640`

**Deliverable**

모든 지원 Reply Composer surface에서 기존 일반 Post의 이미지 선택·업로드·미리보기·제거·재시도, Alt Text와 Sensitive Media lifecycle을 사용하고 Parent·본문·Media가 하나의 Reply 결과로 저장된다.

**Guardrails**

- 기존 `PostComposer`, Media control·uploader와 `createPost`의 ordered Media item·nullable Alt Text·Sensitive Media 입력을 재사용하고 Reply 전용 Media state, 모델, storage, API 또는 cache updater를 만들지 않는다.
- Media-only Reply는 유효하고, uploading 또는 failed Media item이 남아 있는 동안 제출을 차단하며 실패·재시도·제거가 일반 Post와 같은 lifecycle을 따른다.
- Media state는 기존 Reply surface의 dirty·discard confirmation에 참여하고, close·Parent 전환의 강제 차단은 Reply mutation 제출 pending에만 적용한다.
- selected Profile·Parent·Relay Environment 전환 시 Reply body·Media·pending·error와 늦은 upload/mutation completion을 새 문맥과 격리한다.
- clipboard paste, 새 파일 형식·크기 정책, Media Storage Service, 일반 Post 갤러리·viewer 재설계는 포함하지 않는다.
- 성공 결과 반영은 기존 Reply surface callback과 detail targeted refetch를 사용하며 다른 actor Store나 전역 목록 membership을 합성하지 않는다.

**Verification**

- 목록 modal·좁은 Web/Native 전체 화면·상세 inline surface에서 선택·preview·Alt Text·Sensitive Media·제거·실패·재시도와 최대 4개 계약을 검증한다.
- 본문+Media와 Media-only Reply가 `replyParentId`, ordered `{ mediaId, altText }`, `sensitiveMedia`를 함께 제출하고 uploading 또는 failed item이 남아 있으면 제출을 차단하며 재시도·제거 뒤에만 제출할 수 있는지 검증한다.
- Media 선택·upload 상태가 dirty에 반영되어 close·Parent 전환 시 기존 discard confirmation을 거치고, 확인된 폐기 뒤 늦은 upload completion이 닫힌 문맥을 복원하지 않는지 검증한다.
- selected Profile·Parent·Relay Environment 전환과 늦은 upload/mutation completion, 일반 Post Composer 회귀를 자동화로 검증한다.
- Web runtime과 Android·iOS picker·keyboard·safe area·platform back·접근성은 실행한 환경의 증거를 분리해 기록하고 미실행 Native 항목을 Ready 근거로 주장하지 않는다.

- [x] 4.1 Reply mode에서 기존 Media control을 노출하고 Media state를 dirty·media-only 유효성·pending 제출 차단과 `createPost` 입력에 연결한다.
- [x] 4.2 Reply Media payload·lifecycle·일반 Post 회귀와 selected Profile·Parent·Relay Environment 전환의 늦은 completion 격리 테스트를 추가한다.
- [x] 4.3 App unit·Storybook·Relay/TypeScript·lint/format·build와 실행 가능한 Web·Android·iOS 검증을 수행하고 결과와 미실행 platform gate를 기록한다.

**Verification Evidence (2026-08-03)**

- `pnpm --filter @kosmo/app test:unit`: 166 passed
- `pnpm --filter @kosmo/app test:storybook`: 278 passed; 새 Relay Environment Media 격리 Story는 focused run 1 passed
- `pnpm --filter @kosmo/app check`: Relay compiler와 TypeScript 통과
- 변경 TSX의 ESLint와 변경 파일의 Prettier check 통과
- `pnpm --filter @kosmo/app build-storybook`과 `pnpm --filter @kosmo/app build` Web production export 통과
- Web 자동화와 공용 코드는 현재 PR의 Ready 근거로 검증했다. 격리 API 3100·BFF 5184·App 5183 runtime에서는 인증 화면, picker와 upload URL 발급까지 확인했지만 Media Storage의 local CORS가 기본 `http://localhost:5173`만 허용해 5183 origin의 PUT은 환경 제한으로 완료하지 못했다. 기본 5173 origin의 실제 cross-service upload lifecycle은 통합 테스트로 통과했다. Android·iOS picker·keyboard·safe area·platform back·접근성 runtime은 이번 Web 우선 PR의 Ready 조건이 아니며 Native 출시 gate에서 별도로 확인한다.

## 5. PROD-423 통합 검증·OpenSpec 완료

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/notification.md`
- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-423`
- `PROD-424`
- `PROD-425`
- `PROD-426`
- `PROD-640`

**Deliverable**

Local Reply 작성에서 thread 반영과 Parent Author Notification inbox·Read·Reply 이동까지의 전체 사용자 흐름을 검증하고 canonical·Linear·OpenSpec을 동기화한 뒤 change를 archive한다.

**Guardrails**

- PROD-424·425·426·640 전체 Deliverable·Guardrail·Verification과 필수 dependency가 완료되기 전에 change를 archive하지 않는다.
- PROD-460·461·462와 Reply+Quote·ActivityPub·retry/outbox 범위를 통합 완료 조건으로 승격시키지 않는다.
- Pull Request readiness와 OpenSpec archive를 별도로 판단한다.

**Verification**

- 두 Local Profile로 Reply 작성 → Parent thread 반영 → Parent Author inbox/count → item Read 및 결과 Reply 이동을 검증한다.
- self-reply, Parent와 독립 Visibility, contentless Repost disabled, Notification 실패 격리와 selected Profile 전환 회귀를 검증한다.
- Reply Media를 포함한 관련 전체 check, OpenSpec strict validation, task 완료와 canonical delta 동기화 결과를 기록한다.

- [x] 5.1 PROD-424·425·426·640의 구현·검증·dependency 완료와 제외 범위 유지를 확인한다.
- [x] 5.2 Local Reply 작성·Media·thread·Notification·Read·이동 수직 flow와 필수 회귀 시나리오를 최종 검증한다.
- [x] 5.3 구현 결과에 맞게 delta spec, decision, task와 필요한 canonical 문서를 동기화한다.
- [x] 5.4 전체 필수 check와 `openspec validate add-local-reply-creation --strict`를 통과시키고 검증 evidence를 기록한다.
- [x] 5.5 전체 scope와 task가 완료되고 delta spec이 동기화된 뒤 `add-local-reply-creation`을 archive한다.

**Verification Evidence (2026-08-05)**

- PROD-424·425·426·640 및 필수 dependency(PROD-388·417·418·420·422·445·274·277·324·372·381·393·398·399·400·432·507)는 Linear에서 Done이며, 연결된 구현 PR #332·#413·#354·#490·#437은 `main`에 merge되고 required checks가 성공했다.
- `apps/api/tests/integration/graphql/notification.test.ts`에 Local Reply 생성 → Parent thread → Parent Author inbox/Unread count → Read → 결과 Reply ID 확인 수직 테스트를 추가했다. `pnpm --filter @kosmo/api test:integration`: 219 tests, 218 passed, 0 failed, 1 skipped(로컬 Media Storage Service 사전조건).
- `pnpm test:e2e`: 84 passed. Web UI의 Reply 상세/inline surface와 기존 인증·작성·탐색 회귀를 실행했다.
- `pnpm --filter @kosmo/app test:unit`: 183 passed; `test:storybook`: 293 passed; `check`(Relay compiler·TypeScript), `build-storybook`, `build` 통과.
- `pnpm --filter @kosmo/api lint:schema`와 API unit 26 tests, Web check와 unit 34 tests, Core unit 51 tests, `pnpm test:fedify` 203 tests 통과. Root ESLint·Prettier·변경 diff check도 통과했다.
- `pnpm exec openspec validate add-local-reply-creation --strict` 통과. 구현 결과와 proposal/specs/design/decisions를 확인했고 새 durable decision은 필요하지 않았으며, archive 단계에서 기존 delta를 canonical specs에 반영했다. Android·iOS picker·keyboard·safe-area·platform back·접근성 runtime gate는 별도 Native 출시 검증으로 남기고 이번 증거에서는 실행·Ready 근거로 주장하지 않는다.
