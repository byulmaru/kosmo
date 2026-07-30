## Context

이 기록은 PROD-424 backend, PROD-425 UI/thread, PROD-426 Notification/inbox와 후행 PROD-423 통합·archive 구조, Post·Notification canonical 계약, 현재 Reply Parent·thread·Notification 구현 기반을 반영한다.

## Decision Records

### Reply 작성은 기존 Post mutation의 nullable Parent 확장이다

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-424`
- Status: Active
- Context / Problem: Reply를 별도 Post type이나 mutation으로 표현할지, 기존 Content·Reply Parent 관계 조합으로 표현할지 결정해야 한다.
- Decision Outcome: 기존 `createPost`/`CreatePostInput`에 nullable concrete `Post` `replyParentId`를 추가하고 기존 `CreatePostPayload.post`를 유지한다. Parent는 행동 주체 Profile이 조회할 수 있는 contentful Post여야 하며 Reply Visibility는 Parent와 독립적이다. `repostSourceId`는 입력에 추가하지 않는다.
- Alternatives Considered: 별도 `createReply` mutation은 기존 Post 작성·payload를 중복한다. Parent Visibility 강제는 canonical의 독립 Visibility 계약과 다르다. `repostSourceId`를 함께 받으면 제외된 Reply+Quote 작성이 열린다.
- Consequences: 기존 client는 입력 생략으로 그대로 동작하고, API는 global ID type·Parent visibility·Content를 write와 같은 transaction에서 검증해야 한다.
- Confirmation / Follow-up: PROD-424 schema/resolver/integration 테스트에서 일반 Post 회귀, wrong type, hidden/missing/contentless Parent, 독립 Visibility와 rollback을 검증한다.

### Reply UI는 기존 composer와 선행 thread 계약을 재사용한다

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/colors.md`, `docs/design/typography.md`, `docs/design/breakpoints.md`, `PROD-425`
- Status: Active
- Context / Problem: Reply 작성 화면·상태·payload를 별도로 만들지, 기존 universal Post composer와 thread 조회 계약을 확장할지 결정해야 한다.
- Decision Outcome: contentful Post의 Reply action은 기존 composer를 Parent 맥락으로 열고 기존 Post fragment·mutation payload를 사용한다. Content 없는 Repost에서는 action을 disabled로 표시하고 callback·composer 진입을 차단한다. 성공 결과는 선행 thread connection 계약을 통해 현재 thread에 반영한다.
- Alternatives Considered: Reply 전용 composer는 현재 본문·Visibility 상태와 검증을 중복한다. Contentless Repost에 action을 숨기는 방식은 PROD-425의 disabled 표시 계약과 다르다.
- Consequences: PROD-425 구현은 PROD-422의 thread API/UI가 제공하는 public connection shape을 선행 조건으로 삼고, generated Relay artifact를 commit하지 않는다.
- Confirmation / Follow-up: PROD-425 component·route/cache 테스트에서 contentful Parent 진입, disabled Repost, pending/error, selected Profile 격리와 성공 thread 반영을 검증한다.

### Reply surface는 목록 overlay와 상세 inline을 분리한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: 사용자 결정(2026-07-30), `docs/design/reply-composer.md`, `PROD-425`, `PROD-432`, `PROD-422`
- Status: Active
- Context / Problem: 같은 `PostListItem`이 목록과 상세 thread에서 재사용되므로 화면 폭만으로 Reply surface를 고르면 상세의 행별 inline 계약이 목록 modal·전체 화면 계약으로 바뀐다. 목록·thread owner는 하나의 active Parent와 dirty·pending 전환을 조정해야 하지만, 각 caller가 Reply action과 Composer surface까지 조립하면 새 `PostListItem` 사용처가 이 prop을 누락해 contentful Post의 고정 Reply UI를 제거할 수 있다. 순수 Repost는 direct Source를 Action Bar target으로 사용하므로 바깥 display Post identity를 잃으면 Reply eligibility도 잘못 활성화된다.
- Decision Outcome: 목록은 Web `>= compact`에서 content 길이와 관계없이 600×720px modal을 사용하되 작은 viewport에서는 높이를 `85dvh`로 제한하고, Web `< compact`와 Native에서는 전체 화면 Reply surface를 사용한다. 목록·thread owner의 coordinator는 selected Profile, surface mode, 하나의 active direct Parent와 dirty·pending 전환만 관리하고 이를 필수 Provider 또는 동등한 내부 adapter 경계로 공급한다. `PostListItem`과 `PostLayout`은 이 coordinator를 소비해 고정 Reply action의 존재·배치와 `ReplyComposerSurface` 조립을 내부에서 소유한다. coordinator 경계 누락은 Reply UI를 조용히 제거하지 않고 프로그래밍 오류로 취급하며, selected Profile이 없는 guest는 Provider 안의 명시적 null Profile 상태로 구분한다. 현재 action 재활성화와 다른 Parent 선택은 surface의 dirty 확인·pending 차단 lifecycle을 거쳐 닫거나 전환한다. display Post와 Action Bar target을 분리해 Repost action의 Source target은 유지하되 바깥 display Post가 contentless Repost이면 Reply config를 disabled로 제공하고 callback·composer·mutation 진입을 차단한다. selected Profile이 없는 guest에는 PROD-425의 Reply config를 새로 노출하지 않고 guest 인증 위임과 최종 action 조합은 PROD-432가 소유한다.
- Alternatives Considered: 짧은 content에 자연 높이를 사용하는 modal은 선택하지 않고 작성 surface의 고정된 720px frame을 유지한다. 하나의 전역 modal은 상세 inline 계약을 위반한다. `PostListItem`이 폭만으로 shell을 고르면 상세 thread 맥락을 알 수 없다. 각 caller가 완성된 Reply controller prop을 선택적으로 또는 required로 조립하는 방식은 UI 구성 책임과 누락 위험을 caller에 남긴다. 각 행이 active 상태를 독립적으로 소유하면 동시에 여러 surface가 열리고 dirty·pending Parent 전환을 보장할 수 없다. surface 상태를 우회해 active Parent를 직접 토글하면 dirty draft가 확인 없이 폐기되고 pending 성공 callback이 유실될 수 있다. Source Content에서 Reply eligibility를 다시 계산하면 contentless Repost 차단 계약을 잃는다. PROD-425에서 새 guest 로그인 목적지를 만들면 PROD-432의 인증 위임 범위를 선점한다.
- Consequences: 목록·상세 route는 selected Profile fragment, surface mode와 성공 callback을 collection·thread coordinator 경계에 공급하고, actual Post row는 coordinator를 내부 소비해 Reply action과 surface를 조립한다. coordinator는 collection·detail identity와 selected Profile·Relay Environment를 분리하면서 하나의 active Parent를 유지하며, Reply shell은 Parent presentation과 open·close lifecycle만 소유하고 입력·mutation 상태는 기존 composer를 재사용한다. 이 ownership 이동은 modal·전체 화면·inline presentation, focus, 성공 feedback과 targeted refetch를 변경하지 않는다. 짧은 Web modal에도 720px frame이 유지되고 viewport가 작을 때만 `85dvh`로 축소된다. PROD-432는 guest 인증 위임과 전체 action 조합을 통합 검증한다.
- Confirmation / Follow-up: PROD-425의 component·route 검증에서 일반 Post·Reply·Quote 진입, 순수 Repost disabled, 목록 modal·전체 화면, 상세 행별 inline, selected Profile 없음의 unchanged partial rollout과 controlled `expanded`를 확인한다. caller가 Reply UI config를 행별 prop으로 조립하지 않아도 contentful Post surface가 coordinator를 통해 action과 Composer를 내부 조립하고, coordinator 누락이 조용한 action 제거로 이어지지 않으며, 기존 단일 active Parent·dirty·pending·focus·callback 동작이 유지되는지 검증한다.

### Web Reply editor는 하나의 둥근 focus indicator를 사용한다

- Decision Date: 2026-07-31
- Decision Class: Visual Design Choice
- Authority / Provenance: 사용자 결정(2026-07-31), `docs/design/reply-composer.md`, `docs/design/accessibility.md`, `PROD-425`
- Status: Active
- Context / Problem: Web Reply editor에는 Composer 외곽 border, focus 시 primary로 바뀌는 둥근 editor surface border와 브라우저 기본 TextArea 사각 outline이 함께 표시되어 입력 영역이 상자 안의 상자처럼 답답해 보인다.
- Decision Outcome: `PostComposer`의 Web Reply TextArea에서는 브라우저 기본 사각 outline만 제거하고, semantic `focus` token을 적용한 둥근 editor surface border를 유일한 시각적 focus indicator로 유지한다. focus border는 인접 editor background와 3:1 이상의 대비를 유지한다. 오류 상태에서는 같은 경계를 danger border로 표시한다. 일반 Composer의 browser outline, 공용 `TextArea`, Native 입력 스타일과 Composer·modal 외곽 semantic border는 변경하지 않는다.
- Alternatives Considered: focus 강조를 모두 제거하면 keyboard focus 식별성이 약해진다. Composer나 modal 전체 외곽 border를 focus indicator로 바꾸면 실제 입력보다 넓은 Parent·footer 영역까지 강조한다. 외곽 semantic border를 제거하면 card·modal·inline surface 경계 계약이 흐려진다.
- Consequences: Web Reply 입력은 사각 browser outline 없이 대비가 검증된 둥근 focus 경계 하나만 표시해 시각 밀도가 낮아지며, 실제 textbox focus·label·focus trap·복원과 error semantics는 유지된다. light `focus`는 `#9a7800`, dark `focus`는 `#fce79a`로 현재 editor background와 각각 약 4.15:1, 15.32:1 대비를 갖는다.
- Confirmation / Follow-up: focused Storybook interaction에서 editor가 실제 focus를 받고 TextArea computed `outlineStyle`이 `none`이며 실제 wrapper border/background 대비가 3:1 이상인지 확인한다. Web runtime에서는 둥근 editor surface focus border와 danger error border가 유지되고 일반 Composer, 공용 TextArea 및 Native가 변하지 않았는지 별도로 구분해 보고한다.

### Composer 문맥 전환은 stateful 구현을 동기적으로 교체한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 결정(2026-07-31), `docs/design/reply-composer.md`, `PROD-425`
- Status: Active
- Context / Problem: Profile·Parent·Relay Environment identity를 render에서 감지하고 passive effect로 draft를 초기화하면 새 문맥의 첫 commit이 새 Profile/Environment와 이전 본문·오류·pending을 잠시 조합할 수 있다. Environment replacement query가 상위에서 suspend하면 이전 Composer tree가 mounted 상태로 유지되어 이전 mutation completion이 surface close·toast·success callback을 실행할 수 있고, child만 key로 교체하면 surface의 dirty/pending state도 첫 commit까지 남는다.
- Decision Outcome: Relay actor 전환 event는 새 environment state를 적용하기 전에 shared Environment generation ref를 갱신하고, `RelayEnvironmentBoundary`가 suspend 가능한 route/query보다 위에서 이 identity를 제공한다. public `PostComposer`는 Profile ID·Parent ID별 local generation과 Environment generation을 함께 사용해 기존 stateful Composer 구현을 key로 재마운트하고, mutation callback은 mounted/local/surface/Environment generation이 모두 현재일 때만 상태와 성공 callback을 갱신한다. `ReplyComposerSurface`는 suspend하지 않는 outer boundary에서 Parent·Profile fragment record identity를 읽고 stateful contents 전체를 generation key로 교체해 composer body와 surface dirty/pending/confirm state를 함께 초기화한다.
- Alternatives Considered: passive effect를 layout effect로 바꾸는 방식은 render/commit된 stale state 자체를 제거하지 않는다. 각 route caller에서 Composer key를 조립하면 Profile·Environment 문맥 책임이 분산되고 누락될 수 있다. Environment 변경을 suspending descendant의 render에서만 감지하면 이전 mutation과 replacement query의 race를 막지 못한다. draft state에 identity를 중복 저장해 모든 setter를 guard하는 방식은 기존 Composer 상태 계약을 크게 재작성한다.
- Consequences: Profile·Parent·Relay Environment가 바뀐 첫 실제 Composer/surface commit은 초기 body·Visibility·error·pending·close 상태로 시작한다. replacement query가 suspend하는 동안 보존된 이전 UI는 이전 mutation completion을 받아도 close·toast·success callback을 실행하지 않는다. 기존 본문·media·Visibility·mutation UI는 stateful inner 구현에 유지된다.
- Confirmation / Follow-up: Storybook Profiler 기반 interaction에서 Profile+Parent 전환 뒤 첫 Composer body가 빈 문자열인지 검증한다. Relay Environment interaction은 replacement query를 이전 mutation보다 오래 suspend하고도 이전 success callback·surface close가 없으며, 새 surface 첫 commit의 body가 비어 있고 close가 enabled인지 확인한다. key 생성 unit test는 Profile과 Parent identity를 각각 구분한다.

### 상세 Reply 성공은 현재 route만 targeted refetch한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 결정(2026-07-30), `docs/design/reply-composer.md`, `PROD-425`
- Status: Active
- Context / Problem: `CreatePostPayload.post`에는 existing descendant connection edge나 cursor가 없으므로 client가 edge·정렬을 합성하면 thread 관계와 pagination 계약을 추측하게 된다.
- Decision Outcome: 상세 route는 제출 시점 callback의 성공 payload를 받은 뒤 현재 detail query의 fetch key를 갱신해 제한된 targeted refetch를 시작하고 Composer를 닫아 원래 Reply action으로 focus를 복원한다. 모든 Reply surface는 약 3초 뒤 자동으로 사라지는 `답글을 게시했어요` snackbar와 결과 Reply로 이동하는 `보기` action을 제공하지만 자동으로 route를 바꾸지 않는다. 목록 Reply 성공은 전역 Home·Profile·Bookmark membership을 합성하지 않는다. 새 Reply는 현재 query 범위에 포함될 때만 기존 thread 정렬에 따라 나타나며, 조상 행의 형제 분기나 pagination 범위 밖 결과를 connection에 합성하지 않는다. refetch 실패는 기존 detail query error·retry 경계를 사용하며 mutation 성공을 실패로 바꾸지 않는다.
- Alternatives Considered: 성공 직후 결과 Reply 상세로 자동 이동하면 현재 읽기 문맥과 focus 복원 계약이 사라진다. 성공 feedback을 생략하면 새 Reply가 현재 query 범위 밖일 때 mutation 성공 여부가 모호하다. Relay connection edge 합성은 edge type·cursor·정렬과 flattened descendant membership을 추측한다. 전역 목록 refetch는 현재 Parent thread 밖의 membership을 넓게 변경한다. refetch 완료까지 성공 close를 막으면 mutation 성공 lifecycle과 focus 복원이 network latency에 결합된다.
- Consequences: 성공한 Reply의 상세 표시에는 추가 network request가 필요하지만 현재 actor의 detail query 밖을 변경하지 않는다. 현재 query에 나타나지 않는 결과는 snackbar가 표시되는 동안 `보기`로 접근할 수 있으며, 사용자가 선택할 때만 새 Reply 상세로 이동한다. snackbar가 자동으로 사라진 뒤에는 이 transient action을 유지하지 않는다.
- Confirmation / Follow-up: PROD-425 자동화는 mutation 성공 직후 close·focus 복원, 성공 snackbar와 `보기`, 자동 이동 없음, targeted refetch 요청과 현재 query에 포함되는 결과의 thread 표시를 검증한다. 실제 API의 refetch 실패·retry, Web 짧은-height layout과 Android·iOS runtime은 실행하지 않았으며 각각 통합 runtime·Native 출시 gate의 별도 증거로 남긴다.

### Reply Notification은 source commit 후 기존 projection에 Best Effort로 추가한다

- Decision Date: 2026-07-23
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `PROD-426`
- Status: Active
- Context / Problem: Reply Notification을 Reply transaction 내에 포함하거나 별도 inbox/storage로 만들면 source 성공 격리 또는 기존 Notification 계약이 깨진다.
- Decision Outcome: Reply commit 후 같은 request에서 source-only 멱등 Notification 저장 경계를 await/catch한다. Reply kind는 기존 Notification projection·interface·connection·count·Read·badge/cache에 additive로 통합하고, source Reply에서 Parent Author Recipient, Reply Related Post, Reply Author Related Profile을 파생한다.
- Alternatives Considered: source transaction 내 저장은 Notification 실패가 Reply를 rollback한다. fire-and-forget은 process 종료와 오류 관찰 경계가 불명하다. 별도 Reply inbox/table은 기존 Notification API와 client를 중복한다.
- Consequences: Notification 저장 실패 시 item이 누락될 수 있지만 Reply는 유지된다. mixed kind visible predicate는 connection limit 전 SQL에서 적용하고 connection·count·Node·Read가 동일한 source 정합성을 사용해야 한다. Reply source hydration은 request-scoped `ctx.loader`를 사용하며, source PK에서 시작한 nested `EXISTS`는 Parent Author/Recipient mapping을 검증하되 Parent Tombstone을 Reply eligibility에서 제외한다.
- Confirmation / Follow-up: PROD-426에서 self-reply, invisible result, duplicate/concurrent source, 저장 실패 격리와 mixed inbox/count/Read/Node/client 이동을 검증한다. interface-only Notification list가 Reply source loader를 호출하지 않고 여러 concrete Reply source field가 요청당 한 batch로 mapping되는 회귀를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
