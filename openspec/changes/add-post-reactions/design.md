## Context

현재 baseline에는 PROD-395·404·405·406·407의 Reaction 저장·생성·삭제·Type별 count·Profile connection, PROD-449의 fixture-first 요약·Profile 목록 presentation, PROD-450의 fixture-first Reaction Quick Picker presentation, PROD-418의 Reaction 요약·Profile modal data 통합, PROD-277·324·372의 Notification 목록·badge·Read/navigation 기반, PROD-413의 Reaction Notification 생성·inbox 통합, PROD-419의 삭제 뒤 Notification 정리와 PROD-472의 selected Profile별 현재 Reaction 조회·Post/Type 삭제 계약이 있다. PROD-417은 PROD-414 위에 stack하며, PROD-414는 기존 Post Action Bar와 일반·Quote·순수 Repost의 fragment/대상 routing을 제공한다. PostgreSQL/Drizzle은 UUIDv7 default, 명시적 foreign key와 SQL-like query builder를 사용하며, Post 조회 권한은 API의 기존 Post visibility predicate가 소유한다. Notification Node/list/count/read는 Follow와 Reaction의 kind별 visible projection을 함께 사용하고 source가 없는 Reaction Notification을 숨긴다.

이 change는 PROD-390이 소유한 공유 계약이며 구현은 PROD-395, PROD-404, PROD-405, PROD-406, PROD-407, PROD-413, PROD-450, PROD-472, PROD-417, PROD-418, PROD-419의 독립 PR로 나뉜다. 현재 적용 대상은 PROD-417의 selector mutation·Relay cache·기존 Post Action Bar 통합과, 같은 controller를 사용하는 목록·상세 Reaction 요약 token·More/Profile 탐색 slice다. PROD-417 브랜치는 재검토 중인 PROD-414 위에 stack하되, PROD-414의 범위를 복제하거나 수정하지 않고 제공된 Action Bar seam과 Post surface routing을 사용한다.

## Goals / Non-Goals

**Goals:**

- Canonical Reaction Type 문자열과 Reaction 관계를 현재 여섯 Unicode 계약에 맞는 저장 경계로 추가한다.
- 유일성·멱등 mutation·viewer-independent count·viewer-filtered Profile 목록을 같은 도메인 계약으로 구현한다.
- 기존 Notification projection과 universal client 경계를 재사용해 Reaction UI와 Notification lifecycle을 연결한다.
- Quick Picker와 목록·상세의 기존 Reaction token이 하나의 `reactionTarget`과 server-confirmed 상태를 공유하고, Reaction 전용 More에서 Type별 Profile을 탐색하게 한다.
- 각 Linear 자식이 독립적으로 구현·검증되면서 부모 PROD-390이 최종 통합과 archive를 소유하게 한다.

**Non-Goals:**

- 임의 Unicode와 사용자 정의 Reaction
- ActivityPub federation과 remote delivery
- 범용 Notification framework, retry/outbox/queue/cron/backfill/bulk cleanup
- Reply composer·Post Action Bar의 일반 More action을 포함해 여러 Post action 전체를 조립하는 PROD-432 범위. 기존 Action Bar의 Reaction action과 실제 Post surface 연결 및 Reaction 전용 More는 PROD-417에 포함한다.
- 삭제된 Reaction history와 역사상 최초 Type 등장 시각의 영구 보존

## Implementation Guidance

### Current Constraints

- DB schema는 `packages/core/db/tables.ts`와 공용 UUIDv7/created-at helper를 사용한다. 현재 허용 Type 검증은 PROD-404 application service가 소유하며 database enum, seed registry 또는 `CHECK` constraint로 목록을 고정하지 않는다.
- Post visibility predicate와 Account/session membership 검증은 API 경계에 있다. `usingProfile` entry point는 Active Account의 Member이며 Active/Normal이고 non-Suspended Instance에 속한 selected Profile을 Instance Type과 무관하게 보장하고, mutation은 검증된 actor Profile과 Post context를 service에 전달한다. resolver와 core service는 Account, membership, selected Profile/Instance 상태를 다시 조회하지 않는다. core service는 Post, Type, 소유 관계와 멱등 저장만 검증한다.
- GraphQL의 create 계열 mutation은 `fieldWithInput`, concrete Node global ID와 simple payload object를 사용한다. `addReaction`은 이 관례를 따라 Post global ID와 Type 문자열을 받고 최소 Reaction Node를 반환한다.
- Post Node loader는 기존 Post visibility predicate를 적용한다. `Post.reactionCounts`는 이 접근 경계를 통과한 Post object에서 resolve하며, `reactionProfiles`와 달리 viewer Profile visibility를 aggregate에 적용하지 않는다.
- Notification create/delete는 기존 Follow와 같이 source transaction commit 뒤 같은 request에서 await/catch한다. Notification 실패를 source transaction에 포함하거나 fire-and-forget으로 처리하지 않는다.
- `deleteReaction`은 transaction commit 뒤 `reactionId`를 반환하고 Notification service의 kind·source ID 기반 idempotent delete 경계를 같은 application action에서 호출한다. cleanup은 source transaction 밖에서 수행한다.
- 별도 logger나 metric 경계는 없고 post-commit side effect 실패는 `console.error`와 source context를 사용하는 관례가 있다. Reaction Notification 생성의 무음 catch를 다른 범위까지 함께 정리하지 않는다.
- Notification Node/list/count/read query와 client item은 kind별 visible projection으로 Follow와 Reaction source를 함께 처리한다. Reaction 제거 뒤 Notification 정리와 stale source 숨김 lifecycle은 PROD-419에 남아 있다.
- selected Profile이 바뀌면 앱의 Relay Environment가 교체된다. Reaction pending/error/cache 상태를 actor 사이에 공유하면 안 된다.
- `Post.viewerReactions: [Reaction!]!`는 현재 selected Profile과 Post 사이의 Reaction 관계를 batch 조회한다. guest 또는 selected Profile 부재에는 빈 목록을 반환하고 다른 selected Profile의 결과를 공유하지 않는다.
- `Post.reactionCounts`는 각 Type에 현재 존재하는 Reaction의 `MIN(createdAt) ASC`를 주 정렬로 사용하고 같은 최초 생성 시각에는 Type 문자열의 결정적 최종 순서를 사용한다. 이 최종 순서는 제품상 Type 우선순위를 뜻하지 않는다. count 변화만으로 Type을 재정렬하지 않으며 Type이 0개가 됐다가 재등장하면 새 현재 최초 생성 시각으로 배치한다.
- `deleteReaction(input: { postId, type })`은 현재 selected Profile의 조합만 삭제한다. 첫 삭제는 nullable `reactionId`와 현재 조회 가능한 nullable `post`를 반환하고, missing·반복·동시 loser는 `reactionId: null`인 성공으로 정규화한다.
- `SelectMenu`와 `ActionMenu`는 단일 item 선택과 platform별 drawer/menu 동작을 소유하므로 복수 Reaction toggle을 유지하는 anchored popover에 그대로 사용할 수 없다. 이번 slice에서 범용 overlay로 일반화하지 않는다.
- PROD-450이 전달한 props-only `ReactionSelector` seam은 부모가 공급한 ordered option과 controlled selected/pending/error 상태만 표시한다. PROD-417은 최신 canonical 디자인에 맞춰 Web option을 32×32 CSS px, emoji 20px, spinner 16×16px·2px stroke, gap/panel padding 4px로 조정한다. iOS·Android target과 spinner geometry는 이번 Web 우선 변경에서 축소하지 않는다. selected 배경 layer의 70% opacity, border 없는 12px radius option, 전체 disabled 미렌더링과 supplied opaque identity 계약은 유지한다.
- PROD-417은 private feature-local `ReactionAction`과 `ReactionPopover`로 trigger·overlay를 소유하고, private `PostReactionController`로 한 `reactionTarget`의 viewer state, Type별 pending/error, mutation·cache·count refetch를 Quick Picker와 summary token에 공급한다. generic context나 공용 mock infrastructure로 일반화하지 않는다. `PostActionBar`는 공개 composite fragment, toolbar semantics와 action 순서를 유지한다.
- Reaction popover는 Web·iOS·Android에서 trigger에 anchored된 floating surface를 사용한다. trigger 재입력, 외부 입력, Web `Escape`, Android back, Post unmount와 actor 전환으로 닫고, 공간에 따라 위·아래 전환과 viewport/safe-area 수평 clamp를 적용한다. Web에서는 첫 option focus와 trigger focus 복원을 보장한다.
- fixed 여섯 Type catalog는 zero-count와 무관하게 integration layer가 공급한다. selector는 성공 뒤에도 열린 상태를 유지하고 요청한 Type만 pending/error로 격리한다.
- guest이거나 selected Profile이 없으면 Reaction trigger를 disabled로 유지하고 popover·mutation을 시작하지 않는다. 로그인·가입 또는 Profile 선택 onboarding 연결은 후속 제품 계약으로 남긴다.
- selection은 server-confirmed 상태만 표시한다. 필요한 mutation payload가 있으면 GraphQL `errors`가 함께 있어도 성공으로 처리하고, payload 부재나 network failure만 실패로 처리한다.
- `Post.viewerReactions`는 connection이 아닌 plural linked field다. add와 delete `post: null` fallback의 수동 updater는 요청을 시작한 Relay Environment의 기존 Post와 field가 모두 있을 때만 `getLinkedRecords`/`setLinkedRecords`로 갱신하며 record나 field를 합성하지 않는다. delete의 non-null `post` payload는 server가 반환한 Post와 field를 Relay가 정상 정규화한다.
- mutation 성공 payload 뒤에만 해당 Type의 선택 상태와 count delta를 반영하고, 대상 Post의 `reactionCounts`만 targeted refetch해 최종 server 상태로 맞춘다. mutation·refetch callback은 요청을 시작한 Relay Environment와 actor token 안에서만 현재 surface UI를 변경한다.
- `PostListItem`과 `PostLayout`은 일반·Quote는 own Post, 순수 Repost는 source Post로 `reactionTarget`을 한 번 결정한다. 목록·상세의 summary row는 body/source 아래와 Action Bar 위에 배치한다.
- summary token은 Profile modal을 직접 열지 않고 같은 controller의 Type toggle을 실행한다. Web token, selected 배경 layer와 Reaction 전용 More는 모두 radius 12px로 맞춘다. selected token은 Quick Picker와 같은 분리된 `primary`/`primaryHover` 70% 배경 layer를 사용해 emoji·count의 opacity를 유지한다. 양수 count 뒤의 Reaction 전용 More는 selected Profile 유무와 무관하게 modal을 열며, server 순서의 양수 count emoji tab 중 첫 Type을 기본 선택한다. 가용 너비보다 넓은 tab row는 feature-local horizontal `ScrollView`에서 한 줄로 탐색하게 한다. Profile 목록 제목은 선택 Type과 무관하게 `반응한 사람`으로 고정하고, Profile row의 emoji는 현재 tab Type에서 파생하며 separator는 인접한 Profile 사이에만 표시하므로 API·DB를 확장하지 않는다.

### Recommended Approach

1. PROD-395는 `reaction` 관계 테이블을 additive migration으로 추가하고 Type을 non-null text로 저장한다. built-in 여섯 Type은 database에 seed하거나 `CHECK`로 고정하지 않으며 기존 행은 backfill하거나 재작성하지 않는다.
2. PROD-404의 GraphQL `usingProfile` entry point는 Account/session membership과 selected Profile/Instance 상태를 검증하고 resolver는 Post visibility를 검증한다. core service는 검증된 actor Profile identity를 받아 짧은 transaction에서 Post·Type을 검증한 뒤 `(post, type, profile)` insert를 conflict-safe하게 수행한다. core `addReaction`은 `{ created, reaction }`을 반환하고, GraphQL resolver는 이를 `Reaction` Node만 포함하는 공개 payload로 변환한다. PROD-404는 Notification side effect와 신규 source 구분을 미리 구현하지 않으며, 실제 caller가 생기는 PROD-413이 `created` 결과를 사용해 신규 source에만 Best Effort Notification을 연결한다. 명시적 pessimistic lock은 사용하지 않는다.
3. PROD-405는 concrete Reaction global ID를 입력으로 받고, GraphQL `usingProfile` entry point가 Account, membership과 Profile/Instance 상태를 검증한 actor Profile identity를 core service에 전달한다. core는 actor 상태를 다시 조회하지 않고 현재 Reaction Owner인지 확인한다. 현재 타인 소유 행은 거부한다. 현재 Owner 행은 ID와 actor를 조건으로 transaction에서 삭제하며, 이미 없는 ID는 입력 ID를 유지한 성공 no-op으로 처리한다. core는 입력받은 database Reaction ID를 결과로 반환하고, GraphQL `deleteReaction(id: ID!)` payload는 이를 concrete Reaction global ID인 `reactionId: ID!`로 encode한다. Post의 현재 visibility는 조회하거나 삭제 권한으로 사용하지 않으며, Notification cleanup 연결과 필요한 service 결과 확장은 PROD-419가 소유한다.
4. PROD-406 count query는 `Post.reactionCounts: [ReactionCount!]!`로 현재 Reaction이 존재하는 Type의 `type: String!`과 `count: Int!`만 제공한다. PROD-576은 Post visibility를 통과한 뒤 viewer Profile filtering 없이 현재 Reaction을 Post와 Type으로 batch group/count하고 `MIN(Reaction.createdAt) ASC, Reaction.type ASC`로 반환한다. `type` tie-break는 제품 우선순위가 아니라 Relay가 같은 Post의 ID 없는 항목을 위치 기반으로 정규화할 때 안정적인 순서를 보장한다. Reaction이 없으면 빈 목록을 반환한다. PROD-407 Profile connection은 기존 Profile node만 반환하고, Type을 격리하며 기존 Profile visibility를 SQL page limit 전에 적용한 뒤 `Reaction.createdAt DESC, Reaction.id DESC` keyset으로 최신 Reaction부터 반환한다. Reaction metadata는 공개 row field로 노출하지 않는다.
5. PROD-413은 Reaction source에서 Recipient, Related Profile, Target Post와 Type을 파생하고 자기 Post·Remote Recipient를 no-op 처리한다. multi-kind Notification 목록은 승인된 구현 선택에 따라 kind별 visible projection을 `UNION ALL`한 뒤 공통 `id DESC` pagination/count를 적용한다. item 활성화는 Target Post 이동을 즉시 시작하고 Read는 응답을 기다리지 않는 Best Effort 동기화로 유지한다.
6. PROD-449는 먼저 props-only `ReactionSummary`와 `ReactionProfileList`의 fixture 상태 catalog를 전달한다. supplied count entry는 order·zero-count를 바꾸지 않고 렌더하며, Profile row는 기존 `ProfileListItem` Relay fragment ref를 재사용하고 Storybook은 Relay mock fragment ref로 상태를 구성한다. 이 구현 단계는 최종 `post-reaction-ui` spec을 변경하지 않는다.
7. PROD-450은 부모가 공급한 option 순서를 그대로 사용하는 props-only `ReactionSelector` Quick Picker panel을 먼저 제공했다. PROD-417은 supplied identity·selected layer·controlled state seam을 유지하면서 Web만 32×32 option, 20px emoji, 16×16px·2px spinner와 4px gap/padding으로 조정한다. 현재 Native 44 logical unit option과 spinner geometry는 이번 slice에서 변경하지 않으며 Android 48×48dp target과 Native runtime 검증은 출시 전 gate로 유지한다.
8. PROD-417은 기존 `PostActionBar`에서 private `ReactionAction`과 `ReactionPopover`를 유지하고 private `PostReactionController`가 fixed 여섯 option, `viewerReactions`, Type별 pending/error, mutation/cache와 targeted count refetch를 공급하게 한다. Quick Picker와 summary token은 같은 toggle을 사용한다. 선택/count는 optimistic하게 바꾸지 않고 성공 payload 뒤에만 delta를 반영한 다음 `reactionCounts`를 좁게 refetch한다. add/delete updater의 기존 no-synthesis·partial payload·actor 격리 계약을 유지한다.
9. PROD-418이 전달한 count query와 `reactionProfiles` connection을 재사용하되 PROD-417이 summary를 목록과 상세에 연결한다. `reactionCounts`가 비어 있으면 summary를 렌더링하지 않고, 양수 count는 server 순서를 그대로 표시한다. Web token과 Reaction 전용 More는 32px·radius 12px이며 standalone 제목은 제거한다. token은 same-Type toggle이고 selected token은 Quick Picker와 같은 70% `primary`/`primaryHover` 배경 layer를 사용한다. More는 현재 Post 위 modal을 열고, modal 상단은 양수 count emoji tab을 server 순서로 표시해 첫 Type을 기본 선택한다. 가용 너비를 넘는 tab은 feature-local horizontal `ScrollView`에서 한 줄로 탐색하게 한다. 목록 제목은 `반응한 사람`으로 고정하며 Profile item은 현재 tab emoji를 표시하고 separator는 인접한 Profile 사이에만 둔다. 기존 dismiss·pagination·inline retry·edge 보존·cache 우선 actor 격리 계약은 유지한다.
10. PROD-277·324·372가 전달한 공통 목록 UI·badge·read/navigation 계약 위에 Reaction Notification item을 확장한다. `add-in-app-notifications`의 남은 E2E·archive는 그 부모 범위로 유지하며 PROD-413의 직접 구현 gate로 사용하지 않는다.
11. PROD-419는 Owner 삭제 transaction이 성공한 뒤 반환된 Reaction ID로 기존 Notification delete 경계를 호출한다. 같은 request에서 cleanup을 await하되 실패는 Reaction 성공 payload와 분리하고, 기존 post-commit 오류 관례에 따라 error와 source Reaction ID를 기록한다.
12. PROD-472는 `Post.viewerReactions: [Reaction!]!`를 selected Profile별 batch loader로 제공하고, GraphQL 삭제 input을 `{ postId: ID!, type: String! }`로 교체한다. core는 actor/Post/Type 조합을 원자적으로 삭제해 실제 삭제된 Reaction ID만 post-commit Notification cleanup에 전달한다. GraphQL payload는 nullable `reactionId`와 nullable `post`를 반환한다.
13. PROD-390은 모든 자식 뒤 사용자 흐름과 canonical/OpenSpec 정합성을 검증하고 통합·archive를 소유한다.

### Allowed Alternatives

- Notification visibility는 kind-guarded `LEFT JOIN`과 `OR` predicate로 구현해도 된다. specs의 filter-before-limit, Recipient/source correlation과 multi-kind pagination을 만족해야 하며 kind 증가에 따른 nullable join 복잡도를 감수해야 한다.
- Cleanup orchestration은 core public application action 내부의 source transaction 밖 경계에서 수행해야 한다. 구현 방식은 해당 action 안에서 Reaction transaction commit 뒤 실행되고, 현재 공개 payload·멱등성·실패 격리와 오류 관측을 동일하게 유지해야 한다.
- mutation payload가 같은 Post의 selector fragment를 완전히 정규화하지 못하면 승인된 server-confirmed updater를 사용한다. 수동 updater는 actor가 다른 Relay Environment, 관련 없는 Post connection 또는 cache에 없는 Post/field를 수정·합성해서는 안 된다. delete의 non-null Post payload 자체에 대한 Relay 정상 정규화는 이 제한의 대상이 아니다.

### PROD-450 Fading Arc 구현

- 새 spinner package를 설치하지 않고 workspace의 `react-native-svg`와 React Native `Animated`를 사용한다.
- 하나의 회전하는 `Animated.View` 안에 서로 맞닿은 SVG arc segment를 배치해 연결된 180° 호와 head-to-tail alpha fade를 표현한다.
- spinner는 Reaction Quick Picker의 private presentation detail로 두며 공용 picker API나 범용 loading component로 확장하지 않는다.

### Known Traps

- Reaction Type을 PostgreSQL enum, `CHECK` constraint 또는 별도 seed registry로 고정하지 않는다.
- exact Unicode variation selector를 정규화·제거하거나 비슷해 보이는 문자열을 같은 Type으로 취급하지 않는다.
- 허용 목록 검증을 database 제약에만 의존하지 않는다.
- 같은 Reaction의 멱등성을 명시적 DB lock이나 check-then-insert만으로 구현하지 않는다.
- 삭제 mutation에서 Reaction Node loader를 호출해 Post visibility를 삭제 권한으로 만들지 않는다.
- Post/Type 삭제는 오래 지연된 요청이 같은 조합으로 다시 생성된 현재 Reaction을 제거할 수 있음을 숨기지 않는다. 별도 Reaction ID 조회·보존이나 ABA ledger를 추가하지 않는다.
- viewer가 볼 수 없는 Profile의 Reaction을 count에서 제외하지 않는다.
- `reactionCounts`를 count로 재정렬하거나 동일 최초 생성 시각의 최종 순서를 비결정적으로 두지 않는다.
- `reactionCounts`에 zero-count Type을 합성하거나 Profile connection 길이로 count를 다시 계산하지 않는다.
- Reaction이 없는 Post에 빈 summary를 렌더링하거나 Profile 목록을 별도 route·URL로 확장하지 않는다.
- Profile 조회 오류를 snackbar·toast로만 알리거나 추가 page 실패 때 기존 edge를 제거하지 않는다.
- Profile visibility filtering을 page fetch 뒤 애플리케이션에서 수행하지 않는다.
- Notification kind와 concrete object만 추가한 채 Follow 전용 list/count/read join을 유지하지 않는다.
- Notification 저장·cleanup 실패로 Reaction mutation을 rollback하지 않는다.
- cleanup 실패를 무음으로 삼키거나 source Reaction ID 없이 기록하지 않는다.
- 하나의 shared pending boolean로 모든 Reaction Type 입력을 막거나 selected Profile 사이에서 상태를 공유하지 않는다.
- Quick Picker가 현재 여섯 Type을 내부 상수로 고정하거나 option identity를 Unicode 표시 문자열에서 추론하지 않는다.
- selected 배경 opacity를 option 전체에 적용해 이모지까지 흐리게 만들거나 pending spinner에 불투명한 track을 추가하지 않는다.
- PROD-417의 기존 Action Bar Reaction slot·목록/상세 summary 통합을 PROD-432로 미루거나, 반대로 Reply composer·Post Action Bar의 일반 More action·범용 overlay까지 PROD-417에 포함하지 않는다.
- summary token 클릭으로 Profile modal을 직접 열거나 Reaction 전용 More를 mutation trigger로 사용하지 않는다.
- selected summary token을 기본 card 배경과 동일하게 표시하거나 배경 opacity를 token 전체에 적용해 emoji·count까지 흐리게 만들지 않는다.
- Profile item에 이미 현재 Type emoji를 표시하면서 목록 제목에 같은 emoji를 반복하지 않는다.
- 일반·Quote와 순수 Repost에서 Quick Picker·summary·Profile modal의 대상 Post를 서로 다르게 결정하지 않는다.
- mutation 성공 전 count를 바꾸거나 actor 전환 뒤 이전 targeted refetch로 새 actor count를 덮어쓰지 않는다.
- add updater에서 같은 Type·같은 data ID를 단순 append해 중복시키거나 delete의 nullable `reactionId`를 실패로 취급하지 않는다.
- actor 전환 뒤 이전 mutation callback으로 새 actor의 popover·pending·error 상태를 다시 열거나 변경하지 않는다.
- guest·selected Profile 부재에서 trigger를 숨기거나 로그인·가입·Profile 선택 흐름을 PROD-417 안에서 새로 만들지 않는다.

## Risks / Trade-offs

- [문자열 Type은 미래 사용자 정의 Reaction 저장 구조를 선결정하지 않음] → 현재 canonical/Linear 범위만 구현하고, 사용자 정의 Reaction이 실제 제품 요구가 되면 Domain Gate와 Issue Gate에서 identity·asset lifecycle·migration을 먼저 결정한다.
- [Profile/Post cascade가 audit 요구를 잃을 수 있음] → 현재 Reaction은 별도 상태·history가 없는 존재 기반 관계라는 canonical 계약에 한정하고, future audit/history는 별도 capability로 다룬다.
- [최신순 Profile pagination이 기존 unique index만으로 정렬되지 않음] → PROD-407에서 `(post_id, type, created_at DESC, id DESC)` ordering index를 forward migration으로 추가하고 동일 생성 시각의 ID tie-break와 visibility-before-limit을 함께 검증한다.
- [Notification active change와 migration/snapshot 충돌 가능] → Notification kind migration과 UI 확장은 `add-in-app-notifications` archive 뒤 별도 slice에서 적용하고 PROD-395 migration에는 포함하지 않는다.
- [Best Effort 실패로 stale Notification row가 남을 수 있음] → source 존재와 관계 visibility를 모든 API surface에서 filter하고 retry/physical cleanup은 후속 capability가 소유한다.
- [같은 actor의 여러 surface에서 같은 Type을 동시에 조작하면 응답 순서가 UI intent와 다를 수 있음] → client 전역 직렬화는 이번 범위에 추가하지 않고 각 surface의 same-Type 중복만 막는다. 최종 상태는 server가 처리한 응답 순서를 따른다는 제한을 기록한다.
- [add payload가 authoritative count를 제공하지 않음] → 성공 payload 뒤 확인 가능한 delta만 반영하고 대상 Post `reactionCounts` targeted refetch로 최종 상태를 맞춘다. refetch 결과는 요청 actor와 현재 operation guard를 통과할 때만 현재 UI에 반영한다.
- [오래 지연된 Post/Type 삭제가 재생성된 현재 관계를 제거할 수 있음] → 사용자가 즉시 다시 선택할 수 있는 낮은 위험의 소셜 상호작용으로 ABA 가능성을 수용한다. 과거 관계 ledger나 soft delete는 이번 존재 기반 관계 범위에 추가하지 않는다.

## Migration Plan

1. PROD-395에서 `reaction` table과 Type text, Profile/Post foreign key, unique/index를 하나의 additive migration으로 추가한다.
2. migration SQL과 schema가 UUIDv7 default, Type text, 관계 무결성, 중복 거부, 다른 Type 공존, cascade와 index를 일치시키는지 실제 PostgreSQL에서 검증한다.
3. rollback이 필요하고 아직 consumer가 배포되지 않았다면 신규 table을 제거할 수 있다. consumer 배포 뒤에는 기존 migration을 수정하지 않고 forward migration으로 고친다.
4. PROD-404~407에서 mutation과 조회를 추가한다. PROD-407은 `(post_id, type, created_at DESC, id DESC)` pagination ordering index를 별도 forward migration으로 추가한다.
5. `add-in-app-notifications` archive 뒤 PROD-413/419에서 `REACTION` kind와 multi-kind visibility/API/UI migration을 별도로 추가한다.
6. PROD-449/450은 props-only presentation과 Storybook 검증을 먼저 전달하고, PROD-417/418은 같은 seam에 실제 Relay data와 mutation/cache integration을 연결한다. PROD-417은 PROD-414의 기존 Post Action Bar와 surface routing을 사용해 Quick Picker와 목록·상세 summary toggle·Reaction 전용 More/Profile tab을 같은 `reactionTarget`에 연결한다. Reply composer·Post Action Bar의 일반 More action을 포함한 전체 action 조립은 PROD-432로 넘긴다.
7. 모든 자식 완료 뒤 PROD-390이 통합 검증, canonical·delta 정합성, archive와 archive 후 strict validation을 수행한다.

## Open Questions

- 없음. PROD-417의 option 공급, popover, server-confirmed mutation/cache, partial payload, actor 격리와 selected Profile 부재 시 disabled trigger 정책은 2026-07-28 결정으로 확정했다. Web 32px geometry, 목록·상세 summary token toggle, shared controller/count refetch와 Reaction 전용 More/Profile tab은 2026-07-29 canonical·Linear 결정으로 확정했다. 로그인·가입·Profile 선택 onboarding 연결은 후속 제품 계약이다.
