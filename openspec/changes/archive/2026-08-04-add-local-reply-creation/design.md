## Context

`origin/main`에는 Post table의 nullable Reply Parent self-reference, `createPost(replyParentId?)` API, Reply thread·Notification 기반과 목록·상세 Reply Composer surface가 병합되어 있다. 그러나 `PostComposer`는 Reply mode에서 기존 Media control, dirty·pending 판정과 mutation의 Media/Sensitive Media 입력을 제외해 canonical Reply Media 계약을 충족하지 못한다.

Canonical domain의 Post와 Reply 작성 입력은 이미 Content Warning을 포함하고 `PostContentDocument.summary`가 저장·검증 source of truth다. GraphQL 조회와 ActivityPub materialization도 이 값을 사용하지만, Local `CreatePostInput`과 일반·Reply Composer에는 write path가 없고 이 change는 Content Warning을 Non-goal 및 `summary = null`로 고정해 canonical과 충돌한다.

PROD-424 backend, PROD-425 UI/thread, PROD-426 Notification/inbox는 하나의 Local Reply 사용자 흐름을 구성하고, PROD-640은 후행 Media 계약을 기존 Reply Composer surface에 복구한다. PROD-642는 기존 Content Warning capability를 일반 Post와 Reply의 Local 작성 및 Post identity 기반 reveal 범위에 포함한다. 후행 PROD-423은 전체 통합 검증과 OpenSpec 동기화·archive를 수행한다. Reply 조상·하위 조회와 thread rendering은 `add-post-replies`/PROD-422, 공통 Notification projection·connection·Read·badge는 `add-in-app-notifications`의 선행 기반이다.

## Goals / Non-Goals

**Goals:**

- 기존 Plain Text Post mutation을 nullable Reply Parent 입력으로 확장하고 Parent 권한·Content 검증과 Reply 저장을 원자적으로 수행한다.
- 목록에서는 폭과 platform에 맞는 modal·전체 화면 surface로, 상세에서는 현재 thread의 inline surface로 기존 composer를 Reply 맥락에 재사용한다. 성공 시 현재 화면을 유지한 채 결과 Reply를 열 수 있는 feedback을 제공하고, 상세의 현재 query 범위에 포함되는 결과만 기존 thread 정렬에 따라 반영한다.
- 모든 지원 Reply Composer surface에서 기존 Post Media lifecycle과 입력 계약을 재사용하고 Parent·본문·Media를 하나의 Reply 결과로 저장한다.
- 일반 Post와 Reply 모두 optional Content Warning을 작성해 기존 `PostContentDocument.summary`에 저장한다. Reply는 direct Parent의 Content Warning을 초기값으로 한 번 복사하되 사용자가 수정하거나 제거할 수 있게 한다.
- Content Warning reveal 상태를 canonical `Post.id`로 식별하고 Home·Profile·Thread를 포함한 모든 표시 surface에서 공유한다.
- Reply Notification을 기존 Notification projection·GraphQL·inbox·Read·badge 흐름에 수직적으로 추가한다.
- backend, UI, Reply Media, Content Warning, Notification 각 slice를 독립적으로 검증하고 PROD-423에서 전체 flow와 archive gate를 검증한다.

**Non-Goals:**

- `PostContentDocument` schema 변경, Content Warning 전용 모델·DB 컬럼, reveal 상태의 서버 저장·동기화
- Media/Sensitive Media capability 자체의 신규 설계·변경, Mentioned Profile recipient·Mentioned Profiles/DIRECT 작성·조회
- Reply Parent와 Repost Source를 동시에 입력하는 Reply+Quote 작성
- ActivityPub Reply, Reply 외 Action Bar의 최종 action 조합·guest 인증 위임, retry/outbox/backfill, Reply Tombstone 후 동기 Notification cleanup
- `add-post-replies`의 Reply 조상·하위 GraphQL 계약과 thread rendering, `add-in-app-notifications`의 공통 inbox 기반을 다시 설계하는 작업

## Implementation Guidance

### Current Constraints

- API는 기존 `createPost` 입력에서 `replyParentId`, ordered Media item, nullable Alt Text와 Sensitive Media를 함께 허용하고 같은 transaction에서 PostContent로 저장한다.
- Core canonicalization과 persistence는 nullable `document.summary`를 이미 검증·저장하고 GraphQL `PostContent.contentWarning`은 이를 조회한다. Local `CreatePostInput`만 `contentWarning`을 받지 않아 Local Post와 Reply의 summary는 현재 항상 `null`이다.
- `PostComposer`와 `ReplyComposerSurface`는 selected Profile·Relay Environment·Parent별 context generation과 늦은 mutation completion 격리를 제공하지만, Reply mode에서 Media state와 control을 제외한다.
- Reply Parent fragment와 Composer state에는 Content Warning이 없으므로 Parent 초기값, 사용자 수정·제거, dirty/reset/error lifecycle과 Post identity 기반 reveal 공유가 아직 없다.
- 기존 Media control의 active upload guard와 composer keyed remount를 유지해 제거된 upload 또는 이전 Profile·Parent·Environment의 늦은 completion이 새 Reply 문맥을 오염시키지 않아야 한다.
- Notification kind, source predicate, concrete Node loader, connection/count/Read 쿼리와 client item이 Follow 구조에 결합되어 있어, Reply branch를 item 표시만으로 추가하면 hidden item이 page limit·count·Node·Read 간에 다르게 보일 수 있다.
- PROD-273은 실제 Mute·Block 정책 capability가 연결되기 전 Notification 생성 정책을 기본 allow로 정의한다. PROD-426은 아직 구현되지 않은 Profile Mute·Block·Domain Block·Domain Block Instance, Notification scope Word·Hashtag Mute와 Root Post thread Notification Mute capability 및 Reply source 연동을 구현하지 않는다.
- Relay generated artifact는 commit하지 않으며, selected Profile 전환은 Environment/Store 재생성을 통해 cache를 격리한다.

### Recommended Approach

1. PROD-424에서 `CreatePostInput`에 nullable `replyParentId: ID`를 추가하고 concrete `Post` global ID를 decode한다. 요청 Profile 기준 Parent visibility/eligibility·Content를 검증한 같은 transaction 내에서 기존 core Reply 저장 경계를 호출하고 기존 `CreatePostPayload.post`를 반환한다.
2. PROD-425에서 기존 `PostComposer`에 optional Parent ID와 성공 callback을 추가하고 selected Profile·Relay Environment·Parent별 draft·pending·error와 늦은 completion을 격리한다. collection·thread coordinator는 selected Profile, surface mode, 하나의 active Parent와 dirty·pending 전환만 관리하고 Provider 또는 동등한 내부 adapter로 공급한다. `PostListItem`과 `PostLayout`은 coordinator를 소비해 Reply action의 존재·배치와 `ReplyComposerSurface`를 내부 조립한다. 목록 surface는 Web `>= compact`에서 600px modal, Web `< compact`와 Native에서 전체 화면 composer를 열고, 상세 thread는 현재·조상·하위 행의 Reply를 하나의 active Parent로 제어해 해당 행에 inline으로 펼친다. display Post와 Action Bar target을 분리해 순수 Repost의 Repost action은 Source target을 유지하면서 Reply eligibility는 바깥 contentless Repost에서 disabled로 전달한다. selected Profile이 없는 guest에는 PROD-425 Reply config를 새로 노출하지 않고 최종 인증 위임은 PROD-432에 남긴다. 성공 시 surface를 닫고 focus를 복원한 뒤 결과 Reply로 이동하는 `보기` action을 가진 약 3초의 transient snackbar를 표시하되 자동 이동하지 않는다. 상세 route는 coordinator에 공급한 성공 callback에서 현재 query의 제한된 targeted refetch를 시작하고 전역 Post 목록 membership이나 다른 actor Store를 추측하지 않는다.
3. PROD-640에서 Reply mode의 Media control 차단을 제거하고 Media item이 dirty·media-only 유효성·pending 제출 차단과 기존 `createPost` 입력에 일반 Post와 동일하게 참여하게 한다. 기존 uploader, Alt Text·Sensitive Media, remove·retry와 context generation을 재사용하며 Reply 전용 Media state나 cache updater를 만들지 않는다.
4. PROD-642에서 `CreatePostInput`에 optional nullable `contentWarning`을 추가하고 일반 Post와 Reply가 같은 canonical builder를 통해 normalized 값을 기존 document `summary`에 저장하게 한다. 일반 `PostComposer`의 공용 state·입력·합산 길이 검증·mutation payload에 Content Warning을 추가하고, Reply surface 초기화 시 direct Parent의 값을 한 번 복사한다. 복사 뒤에는 독립 draft로 관리해 수정·제거를 허용한다. Reply 보호 정책은 Parent와 close lifecycle을 아는 surface가 직접 소유하고 공용 Composer에서는 submitting만 전달받아 pending close를 차단하며, reset·error·pending 격리는 기존 context generation을 유지한다. 표시 계층은 component별 local state 대신 canonical `Post.id`를 key로 하는 공용 reveal state를 사용해 Home·Profile·Thread와 Parent preview가 같은 상태를 관찰하게 한다. 이 공용 store는 하나의 selected Profile·session lifecycle 안에서만 유지하며, selected Profile 또는 session 전환 시 새 store로 교체해 reveal 상태가 다른 Profile·session으로 전파되지 않게 한다.
5. PROD-426에서 Reply source에서 Recipient·Related Post·Related Profile을 파생하는 멱등 Notification 저장 경계를 추가한다. 같은 Reply 생성 transaction의 별도 savepoint에서 이 경계를 await/catch하여 Notification 실패만 rollback한다.
6. Notification visibility predicate를 kind별 source relation에 따라 SQL에서 구성하고 page limit 전에 적용한다. Reply branch는 source PK에서 시작하는 nested `EXISTS`로 Parent Author/Recipient mapping과 Reply Author visibility를 확인하며 Parent lifecycle predicate는 두지 않는다. concrete `ReplyNotification` Node의 `post`/`profile` source hydration은 request-scoped `ctx.loader`로 batch하고, mixed connection/count/Read가 동일 predicate를 사용하게 한 뒤 client의 discriminated item branch를 결과 Reply 이동과 기존 Best Effort Read/cache 경계에 연결한다.
7. PROD-423에서 Post 상세 Reply 작성 → thread 반영 → Parent Author inbox/count → item 읽음/결과 Reply 이동을 통합 검증한다. PROD-424·425·426·640·642의 담당 task와 선행 change의 delta spec이 모두 맞을 때만 archive한다.

### Allowed Alternatives

- Context를 사용하는 필수 Provider와 feature-local 내부 adapter 중 어느 연결 방식을 사용해도 된다. 다만 `PostList`·`BookmarkList`·route·`PostDetailThread`가 각 행의 완성된 Reply action/Composer config를 조립하지 않고, `PostListItem`/`PostLayout`이 coordinator를 내부 소비해 고정 Reply UI를 조립해야 한다. coordinator 부재와 selected Profile이 없는 guest를 같은 상태로 취급해 action을 조용히 제거하지 않는다.
- Content Warning reveal 상태는 Context, 외부 store 또는 동등한 공용 adapter로 제공할 수 있다. 구현 방식과 무관하게 key는 `Post.id`여야 하고 surface별 component local state나 PostContent revision ID를 별도 key로 사용하면 안 된다.
- 상세 thread 반영은 현재 route query의 fetch key를 갱신하는 제한된 targeted refetch를 사용한다. fetch policy와 pending presentation은 기존 route 관례 안에서 조정할 수 있지만 Relay connection edge·cursor나 전역 목록 membership을 합성하는 updater로 대체하지 않는다.
- 새 Reply가 조상 행의 형제 분기이거나 현재 pagination 범위 밖이면 targeted refetch 뒤에도 현재 thread에 나타나지 않을 수 있다. 이 경우 성공 snackbar가 표시되는 동안 `보기` action으로 결과 Reply에 접근할 수 있지만 snackbar를 지속성 navigation으로 취급하지 않으며, 이를 이유로 자동 이동하거나 thread 정렬·membership을 합성하지 않는다.
- Reply Notification의 kind별 visible SQL은 공통 base predicate와 kind branch를 조합하거나 같은 최종 predicate를 만드는 kind registry로 구성할 수 있다. kind별 메모리 병합으로 pagination 후 filtering하는 방식은 허용하지 않는다.

### Known Traps

- Parent ID를 UUID 문자열로 직접 받아 concrete GraphQL type 검증을 우회하지 않는다.
- Parent visibility를 검증하지 않거나 요청 Account/selected Profile을 viewer로 삼지 않고, 행동 주체 Profile을 viewer로 사용한다.
- Reply에 Parent Visibility를 강제하지 않고, `repostSourceId`를 작성 입력에 추가하지 않는다.
- Content 없는 Repost의 disabled action에 callback을 남겨 composer 진입이 가능하게 만들지 않는다.
- 순수 Repost의 direct Source를 Action Bar target으로 사용하더라도 바깥 display Post identity를 잃고 Reply eligibility를 Source Content에서 다시 계산하지 않는다.
- 상세 thread에서 재사용되는 `PostListItem`이 목록 폭만 보고 modal·전체 화면 surface를 열게 하지 않고, thread coordinator가 inline surface mode와 하나의 active Parent를 공급한다. 이 coordination을 이유로 `PostDetailThread`가 각 행의 Reply action과 Composer config까지 조립하지 않는다.
- active Parent 상태를 각 Post 행 안으로 분산하거나 완성된 Reply controller prop을 caller가 선택적으로 조립하지 않는다. 전자는 single-active·dirty/pending 전환을 깨뜨리고 후자는 새 surface caller의 Reply UI 누락을 허용한다.
- Reply mode에서 Media-only 입력을 빈 Reply로 거부하거나 Media upload pending 상태를 제출 가능하게 만들지 않는다.
- selected Profile·Parent·Relay Environment가 바뀔 때 Composer만 새 문맥으로 교체하고 이전 Media control의 늦은 upload completion을 새 state에 반영하지 않는다.
- Reply 전용 Media state, uploader, GraphQL 입력 또는 Relay connection updater를 만들지 않는다.
- Content Warning을 별도 Post 필드·테이블·모델로 저장하거나 `PostContentDocument` schema version을 올리지 않는다. optional `contentWarning`은 기존 `summary` write path의 API projection이다.
- Parent Content Warning을 render마다 동기화해 사용자의 수정·제거를 덮어쓰지 않는다. 새 Parent 문맥의 초기값으로 한 번만 복사하고 이후에는 독립 Reply draft로 관리한다.
- reveal 상태를 Post card·modal·thread row 각각의 local state로 두거나 route/surface remount 때 같은 Post의 상태를 초기화하지 않는다. 단, selected Profile 또는 session 전환은 lifecycle 경계를 바꾸므로 Provider가 새 store를 생성하고 상태를 초기화한다.
- 기존 `ModalSheet`의 420px geometry와 단순 close lifecycle을 600px Reply modal 계약으로 간주하지 않는다.
- Notification을 Reply write와 같은 savepoint에 넣거나 fire-and-forget으로 호출하지 않는다. 별도 savepoint로 실패를 격리하고 transaction 인자의 존재 여부로 lifecycle을 분기하지 않는다.
- client에서 hidden Notification을 사후 filtering해 서버 connection·count·Node·Read의 불일치를 감추지 않는다.

## Risks / Trade-offs

- [선행 thread/Notification change가 merge되기 전에 UI 또는 inbox slice를 구현하면 중복 ownership과 재작업이 생김] → PROD-425는 PROD-422, PROD-426은 기존 Notification 기반을 dependency gate로 유지하고 merge된 public contract에 맞춰 구현한다.
- [Notification이 Best Effort이므로 저장 실패 시 일부 Reply 알림이 누락될 수 있음] → Reply 성공을 우선하고 retry/outbox는 제외하되 실패 격리를 검증한다.
- [mixed Notification kind의 SQL predicate가 복잡해짐] → kind별 source 정합성을 공통 visible contract에서 조합하고 connection·count·Node·Read 통합 테스트로 드리프트를 막는다.
- [mutation 성공 후 targeted refetch를 사용하면 추가 network request가 생김] → 현재 상세 query의 fetch key만 갱신하고, connection edge·cursor 또는 전역 목록 membership을 합성하지 않는다.
- [현재 query 범위 밖의 새 Reply가 즉시 인라인 표시되지 않으면 성공 여부가 모호해질 수 있음] → 성공 snackbar와 결과 Reply `보기` action을 항상 제공하되 사용자의 현재 읽기 문맥을 보존한다.
- [Reply Media upload와 Parent·Profile 전환이 겹치면 이전 preview 또는 completion이 새 draft를 오염시킬 수 있음] → 기존 keyed remount와 active upload/context generation guard를 유지하고 겹친 completion 회귀를 검증한다.
- [Parent Content Warning 초기값과 사용자가 편집한 Reply 값이 양방향으로 연결되면 입력이 덮어써질 수 있음] → Parent 문맥 초기화 시점에만 복사하고 이후 draft 변경은 Parent와 분리한다.
- [surface별 reveal state가 분산되면 같은 Post가 Home과 Thread에서 다르게 보일 수 있음] → 공용 상태의 유일한 key를 `Post.id`로 고정하고 cross-surface·remount 회귀를 검증한다.

## Migration Plan

1. additive GraphQL input·Reply 생성 경계와 테스트를 배포한다. 기존 `replyParentId` 생략 호출은 일반 Post 작성으로 계속 동작한다.
2. 선행 Reply thread 기반을 확인한 뒤 composer·action·thread cache 통합을 배포한다.
3. 기존 Post Media lifecycle을 Reply Composer surface에 적용하고 일반 Post·Reply 회귀와 문맥 격리를 검증한다.
4. optional `contentWarning` GraphQL input과 기존 `summary` 저장 연결을 additive로 배포한 뒤 일반·Reply Composer 입력, Parent 초기값과 Post identity 기반 reveal 상태를 배포한다. DB migration과 Content Document schema migration은 없다.
5. 기존 Notification 기반에 Reply kind, source predicate, API와 client item을 additive로 배포한다. schema enum migration이 필요하면 expand 단계로 먼저 반영한다.
6. 롤백 시 Content Warning client 입력·reveal 연결, Reply Media client 연결, 나머지 client/UI 통합과 Reply Notification branch를 역순으로 제거해도 기존 `summary` 데이터, Reply Post 및 Follow Notification 데이터는 유지된다. additive input과 Media 스토리지 contract 제거는 별도 contract 단계 없이 즉시 수행하지 않는다.

## Open Questions

없음.
