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
- Authority / Provenance: 사용자 결정(2026-07-30), `docs/design/reply-composer.md`, `PROD-425`
- Status: Active
- Context / Problem: 같은 `PostListItem`이 목록과 상세 thread에서 재사용되므로 화면 폭만으로 Reply surface를 고르면 상세의 행별 inline 계약이 목록 modal·전체 화면 계약으로 바뀐다. 순수 Repost는 direct Source를 Action Bar target으로 사용하므로 바깥 display Post identity를 잃으면 Reply eligibility도 잘못 활성화된다.
- Decision Outcome: 목록은 Web `>= compact`에서 content 길이와 관계없이 600×720px modal을 사용하되 작은 viewport에서는 높이를 `85dvh`로 제한하고, Web `< compact`와 Native에서는 전체 화면 Reply surface를 사용한다. 상세 thread owner는 current·ancestor·descendant의 Reply action에 inline surface mode와 하나의 active direct Parent를 공급한다. 현재 action 재활성화와 다른 Parent 선택은 surface의 dirty 확인·pending 차단 lifecycle을 거쳐 닫거나 전환한다. display Post와 Action Bar target을 분리해 Repost action의 Source target은 유지하되 바깥 display Post가 contentless Repost이면 Reply config를 disabled로 제공하고 callback·composer·mutation 진입을 차단한다. selected Profile이 없는 guest에는 PROD-425의 Reply config를 새로 노출하지 않고 guest 인증 위임과 최종 action 조합은 PROD-432가 소유한다.
- Alternatives Considered: 짧은 content에 자연 높이를 사용하는 modal은 선택하지 않고 작성 surface의 고정된 720px frame을 유지한다. 하나의 전역 modal은 상세 inline 계약을 위반한다. `PostListItem`이 폭만으로 shell을 고르면 상세 thread 맥락을 알 수 없다. surface 상태를 우회해 active Parent를 직접 토글하면 dirty draft가 확인 없이 폐기되고 pending 성공 callback이 유실될 수 있다. Source Content에서 Reply eligibility를 다시 계산하면 contentless Repost 차단 계약을 잃는다. PROD-425에서 새 guest 로그인 목적지를 만들면 PROD-432의 인증 위임 범위를 선점한다.
- Consequences: 목록·상세 route는 selected Profile fragment와 surface mode를 actual Post row까지 전달하고, Reply shell은 Parent presentation과 open·close lifecycle만 소유하며 입력·mutation 상태는 기존 composer를 재사용한다. 짧은 Web modal에도 720px frame이 유지되고 viewport가 작을 때만 `85dvh`로 축소된다. PROD-432는 guest 인증 위임과 전체 action 조합을 통합 검증한다.
- Confirmation / Follow-up: PROD-425의 component·route 검증에서 일반 Post·Reply·Quote 진입, 순수 Repost disabled, 목록 modal·전체 화면, 상세 행별 inline, selected Profile 없음의 unchanged partial rollout과 controlled `expanded`를 확인한다.

### 상세 Reply 성공은 현재 route만 targeted refetch한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/reply-composer.md`, `PROD-425`
- Status: Active
- Context / Problem: `CreatePostPayload.post`에는 existing descendant connection edge나 cursor가 없으므로 client가 edge·정렬을 합성하면 thread 관계와 pagination 계약을 추측하게 된다.
- Decision Outcome: 상세 route는 제출 시점 callback의 성공 payload를 받은 뒤 현재 detail query의 fetch key를 갱신해 제한된 targeted refetch를 시작하고 Composer를 닫아 원래 Reply action으로 focus를 복원한다. 목록 Reply 성공은 전역 Home·Profile·Bookmark membership을 합성하지 않는다. refetch 실패는 기존 detail query error·retry 경계를 사용하며 mutation 성공을 실패로 바꾸거나 별도 success toast를 추가하지 않는다.
- Alternatives Considered: Relay connection edge 합성은 edge type·cursor·정렬과 flattened descendant membership을 추측한다. 전역 목록 refetch는 현재 Parent thread 밖의 membership을 넓게 변경한다. refetch 완료까지 성공 close를 막으면 mutation 성공 lifecycle과 focus 복원이 network latency에 결합된다.
- Consequences: 성공한 Reply의 상세 표시에는 추가 network request가 필요하지만 현재 actor의 detail query 밖을 변경하지 않는다. route integration 검증은 fetch key 변경, refetch 성공 반영, 기존 error·retry 경계와 close/focus 순서를 확인해야 한다.
- Confirmation / Follow-up: PROD-425 route test와 Web runtime에서 mutation 성공 직후 close·focus 복원, targeted refetch 요청과 결과 thread 표시를 검증하고 refetch 실패 시 기존 thread와 retry가 유지되는지 확인한다.

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
