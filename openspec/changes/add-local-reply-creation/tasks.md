## 1. PROD-424 Reply backend 생성/API

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-424`

**Deliverable**

기존 `createPost` GraphQL 계약으로 요청 Profile이 조회할 수 있는 contentful Parent에 현재 지원 본문·Visibility를 가진 Local Reply를 생성하고 기존 `Post` payload를 받는다.

**Guardrails**

- `replyParentId`는 nullable concrete `Post` global ID이며 Parent는 행동 주체 Profile 기준 Visibility·Eligibility와 Content 검증을 통과해야 한다.
- Reply Visibility는 Parent와 독립적이고 `repostSourceId`는 작성 입력에 추가하지 않는다.
- Parent 검증과 Post·Content·Reply Parent 저장은 원자적이어야 하며 실패 시 부분 데이터를 남기지 않는다.
- Content Warning, Media/Sensitive Media, Mentioned Profiles/DIRECT와 Reply+Quote 작성은 포함하지 않는다.

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
- 순수 Repost의 Repost action target은 direct Source를 유지하지만 Reply eligibility는 바깥 display Post identity에서 계산한다. 상세 thread owner는 current·ancestor·descendant에 inline surface mode와 하나의 active Parent를 공급한다.
- 목록은 Web `>= compact`에서 600px modal, Web `< compact`와 Native에서 전체 화면 composer를 사용하고, 상세는 행별 inline composer를 사용한다. Parent preview는 비대화형이며 Action Bar·menu를 중복 표시하지 않는다.
- pristine close, dirty 취소 확인, pending close 차단, 실패 상태 유지, 성공 close·focus 복원과 Web modal focus trap·배경 scroll lock을 surface lifecycle로 제공한다.
- selected Profile이 없는 guest에는 Reply config를 새로 노출하지 않고 guest 인증 위임과 Reply 외 전체 action 조합은 PROD-432에 남긴다.
- Visibility는 Parent와 독립적이며 validation·pending·실패·성공 상태와 Relay cache는 selected Profile별로 격리한다.
- 성공하면 현재 화면과 focus를 유지하고 결과 Reply로 이동하는 `보기` action을 가진 snackbar를 표시하되 자동 이동하거나 connection membership을 합성하지 않는다.
- Reply+Quote 작성, Action Bar 전체 rollout, ActivityPub Reply와 Notification inbox UI는 포함하지 않는다.

**Verification**

- contentful 일반 Post·Reply·Quote의 목록 modal·전체 화면 및 상세 행별 inline composer 진입, display Post/action target 분리와 contentless Repost disabled 호출 차단을 검증한다.
- Home·Profile·Bookmark·상세 query가 selected Profile fragment를 각 `PostListItem`/`PostLayout`까지 전달하고, guest/null Profile 경계에서는 Reply config를 새로 노출하지 않음을 검증한다.
- Parent와 다른 Visibility, validation·pending·성공·실패 상태와 selected Profile 전환 격리를 검증한다.
- pristine·dirty·pending·실패·성공 close, focus trap·복원·배경 scroll lock, single central scroll과 selected Profile 없는 surface의 unchanged partial rollout을 검증한다.
- 상세 current·ancestor·descendant에서 active Parent를 전환할 때 dirty 확인·pending 차단을 거치고, 정확한 한 행만 `expanded` 상태를 받으며 close·성공 뒤 해당 Reply action으로 focus가 복원되는지 검증한다.
- 성공 payload 뒤 현재 detail route만 targeted refetch되고 현재 query 범위의 결과만 thread에 반영되며, 성공 snackbar의 `보기`로 결과 Reply를 열 수 있고 자동 이동·다른 actor Store·관련 없는 목록 변경이 없으며 refetch 실패는 기존 detail retry 경계를 유지함을 검증한다.

- [x] 2.1 PROD-422의 Reply 조상·하위 API와 Post 상세 thread 계약이 merge되었고 이 change와 ownership 중복이 없음을 확인한다.
- [x] 2.2 display Post와 Action Bar target을 분리한 actual 목록·상세 surface에서 contentful Parent의 Reply action을 기존 composer와 controlled `expanded`에 연결하고, contentless Repost에서는 Source target을 유지하면서 Reply 진입을 차단한다.
- [x] 2.3 기존 composer가 `replyParentId`를 포함해 Reply를 제출하고 DIRECT를 제외하며 selected Profile·Relay Environment·Parent별 입력·pending·error와 늦은 completion·callback을 격리하게 확장한다.
- [x] 2.4 direct Parent preview와 기존 composer를 조립해 Web 목록 modal·좁은 Web/Native 전체 화면·상세 thread 행별 inline surface, pristine/dirty/pending·실패·성공 lifecycle과 focus·scroll 계약을 구현한다.
- [x] 2.5 성공한 `Post` payload 뒤 현재 detail route만 targeted refetch하고 결과 Reply `보기`를 제공하며 실패 시 입력·Parent 또는 기존 thread·retry 경계를 유지하고, surface·route·상태 격리·일반 Post 회귀 검증과 Relay compiler/check를 통과시킨다.

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
- Notification은 Reply commit 후 Best Effort로 생성하며 저장 실패가 Reply를 rollback하거나 mutation 성공을 실패로 바꾸지 않는다.
- 기존 Notification projection·interface·connection·count·Read·badge/cache를 확장하고 별도 inbox를 만들지 않는다.
- duplicate/concurrent source에서 uniqueness를 유지하고 visible filtering을 page limit 전에 적용한다.
- ActivityPub delivery, retry/outbox/backfill과 Tombstone 후 동기 cleanup은 포함하지 않는다.

**Verification**

- 타인 Post Reply, self-reply, invisible 결과, duplicate/concurrent source와 Notification 저장 실패 격리를 검증한다.
- source·Related Post·Related Profile·Recipient mapping, concrete `ReplyNotification` Node와 unavailable predicate를 검증한다. Parent Tombstone은 Reply 자체의 visibility/eligibility를 제거하지 않으며, interface-only list는 source loader를 호출하지 않고 concrete Reply source fields는 request당 한 batch로 mapping됨을 검증한다.
- mixed connection·Unread count·Read, inbox 표시·Reply 이동·Best Effort Read와 selected Profile cache 격리를 검증한다.

- [x] 3.1 기존 Notification 기반의 projection·API·client contract가 merge되었고 Reply kind 확장이 공통 계약을 재사용할 수 있음을 확인한다.
- [x] 3.2 Reply source에서 Recipient·Related Post·Related Profile을 파생하는 멱등 Notification 저장·visibility 계약을 추가한다.
- [x] 3.3 Reply commit 후 Notification 생성을 Best Effort로 연결하고 self-reply·invisible 결과를 억제한다.
- [x] 3.4 concrete `ReplyNotification` Node와 mixed visible connection·Unread count·Read 계약을 기존 Notification API에 통합한다.
- [x] 3.5 기존 inbox item에 Reply Author 표시, 결과 Reply 이동, Best Effort Read와 selected Profile badge/cache 동기화를 연결한다.
- [x] 3.6 source mapping·self-reply·visibility·uniqueness·실패 격리 서비스 검증과 API Node·connection·count·Read integration 테스트를 통과시킨다.
- [x] 3.7 inbox 표시·이동·Read·cache·Profile 전환 client 검증과 Relay compiler/check를 통과시킨다.

## 4. PROD-423 통합 검증·OpenSpec 완료

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/notification.md`
- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-423`
- `PROD-424`
- `PROD-425`
- `PROD-426`

**Deliverable**

Local Reply 작성에서 thread 반영과 Parent Author Notification inbox·Read·Reply 이동까지의 전체 사용자 흐름을 검증하고 canonical·Linear·OpenSpec을 동기화한 뒤 change를 archive한다.

**Guardrails**

- PROD-424·425·426 전체 Deliverable·Guardrail·Verification과 필수 dependency가 완료되기 전에 change를 archive하지 않는다.
- PROD-460·461·462와 Reply+Quote·ActivityPub·retry/outbox 범위를 통합 완료 조건으로 승격시키지 않는다.
- Pull Request readiness와 OpenSpec archive를 별도로 판단한다.

**Verification**

- 두 Local Profile로 Reply 작성 → Parent thread 반영 → Parent Author inbox/count → item Read 및 결과 Reply 이동을 검증한다.
- self-reply, Parent와 독립 Visibility, contentless Repost disabled, Notification 실패 격리와 selected Profile 전환 회귀를 검증한다.
- 관련 전체 check, OpenSpec strict validation, task 완료와 canonical delta 동기화 결과를 기록한다.

- [ ] 4.1 PROD-424·425·426의 구현·검증·dependency 완료와 제외 범위 유지를 확인한다.
- [ ] 4.2 Local Reply 작성·thread·Notification·Read·이동 수직 flow와 필수 회귀 시나리오를 최종 검증한다.
- [ ] 4.3 구현 결과에 맞게 delta spec, decision, task와 필요한 canonical 문서를 동기화한다.
- [ ] 4.4 전체 필수 check와 `openspec validate add-local-reply-creation --strict`를 통과시키고 검증 evidence를 기록한다.
- [ ] 4.5 전체 scope와 task가 완료되고 delta spec이 동기화된 뒤 `add-local-reply-creation`을 archive한다.
