## 1. PROD-821 — Profile Block 저장과 durable cleanup

**Authority / Provenance**

- `docs/domain/objects/profile-block.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- `docs/domain/objects/reaction.md`
- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0003-policy-ownership-clarifications.md`
- `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`
- `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`
- `memory/database-migrations.md`
- `PROD-821`

**Deliverable**

Local 또는 Remote Owner가 Local 또는 Remote Target을 차단·해제할 수 있는 additive Profile Block 관계와 durable cleanup orchestration을
구현한다. Block policy/admission을 적용하고 이번 실행이 포착한 양방향 Follow Request·Follow Relationship과 직접 원인 Follow Notification을
required cleanup으로 정리하며, 필수 cleanup 완료 전에는 Block action을 성공으로 확정하지 않는다. 이미 진입한 Follow transition이 cleanup 뒤
관계를 남길 수 있으므로, Unblock은 현재 남아 있는 양방향 Follow/Request와 그 직접 원인 Notification을 정리한 뒤 Block을 제거하며 삭제된 관계를 복구하지 않는다.

**Guardrails**

- Owner → Target 방향의 단일 관계, 생성 시각, Owner/Target uniqueness·referential integrity·self-block 불변식과 no-backfill를 유지하고 별도
  lifecycle state·expiry·복제 속성을 추가하지 않는다.
- 도메인 capability에 특정 Account·Membership·Local 상태를 일반 Owner 조건으로 추가하지 않는다. GraphQL selected Local actor admission은
  `PROD-822-graphql`의 ingress 경계다.
- profile-block requirement의 captured cleanup·success gate·relaxed overlap을 준수하고, 기존 Reaction은 이번 action에서 변경하지 않는다.
- required cleanup 완료 전 성공 응답을 반환하지 않으며, 일시 오류·worker 재시작 시 이미 처리한 effect를 중복 적용하지 않는다.
- 기존 Reaction·Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification·Read State는 보존하고, Unblock은 profile-block requirement의 cleanup/no-restore 순서를 준수한다.
- 이 그룹은 Block 후 신규 입력 거부·공통 visibility/interaction policy·GraphQL(`PROD-822`), UI/Relay(`PROD-823`), 전체 cross-slice E2E·archive(`PROD-813`)를 구현하지 않는다.
- 현재 Notification source 신규 생성 suppression(`PROD-327`), ActivityPub Block/Undo(`PROD-818`), 비동기 물리 cleanup(`PROD-328`)을 추가하지 않는다.

**Verification**

- 기존 Profile·Follow·Reaction·Notification·Post row를 보존하는 additive migration과 uniqueness·referential integrity·self-block 불변식 및 관계 저장 정합성 검증을 수행한다.
- Local/Remote Owner·Target pair, duplicate/self와 Owner scope를 자동화된 관계·scope 회귀로 검증하고 ingress별 admission을 도메인 계약과 분리한다.
- durable orchestration이 Block 실행이 포착한 양방향 Follow Request·Follow Relationship, pending request와 직접 원인 Follow Notification을 처리하고 기존
  Reaction·Repost·Bookmark·비직접 Notification을 보존하는지 확인한다. Unblock이 현재 남은 관계와 그 직접 원인 Notification을 정리한 뒤 삭제 관계를
  복구하지 않는지도 확인한다.
- worker restart·일시 오류·retry 뒤 required cleanup success gate가 유지되는지, Block insert/cleanup 실패가 성공으로 확정되지 않는지와 Unblock
  no-restore를 자동화된 lifecycle 회귀로 확인한다.

- [x] 1.1 OpenSpec Gate 승인 후 Profile Block의 additive 저장 관계와 Owner/Target·생성 시각·uniqueness·referential integrity·self-block 불변식을 구현한다.
- [x] 1.2 Block policy/admission 뒤 durable cleanup orchestration을 시작하고 양방향 Follow Request·Follow Relationship과 직접 원인 Follow Notification의 required cleanup을 연결한다.
- [x] 1.3 profile-block requirement의 durable cleanup·success gate·Reaction 보존·Unblock no-restore를 구현한다.
- [x] 1.4 migration·관계 불변식·restart/retry·성공 gate·보존·Owner scope를 검증하는 자동화 회귀와 공개 계약 정합성 검증을 추가한다.

## 2. PROD-822 — Profile Block 정책과 GraphQL 경계

**Authority / Provenance**

- `docs/domain/objects/profile-block.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/domain/objects/media.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- `docs/domain/objects/bookmark.md`
- `docs/domain/objects/reaction.md`
- `docs/domain/objects/notification.md`
- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0004-review-consistency-clarifications.md`
- `docs/domain/decisions/0012-post-interaction-followup-clarifications.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- `docs/design/profile-mute-block.md`
- `memory/coding-style.md`
- `memory/database-design.md`
- `memory/graphql-style.md`
- `PROD-822`
- `PROD-821` concurrency 정정 댓글 `5ceda55c-f3b6-4109-987c-27c12c413ce2`

**Stack layers**

- `PROD-822-graphql`: selected Local actor의 Block/Unblock mutation, Owner 관리 connection·관계 Node, 정확한 unblock 관계 ID,
  generated schema와 관리 API 테스트를 소유한다.
- `PROD-822-policy` (자식): GraphQL `node(id:)`·`profileByHandle` 직접 조회, `searchProfiles` 후보·콘텐츠·Follow·Notification과 새 상호작용 제한, 공통 admission,
  Local/ActivityPub 실행 경로와 회귀를 소유한다.

**Deliverable**

`PROD-821`의 저장·cleanup 결과를 사용한다. `PROD-822-graphql`은 selected Local Profile actor 기반 GraphQL Block/Unblock mutation,
Owner 관리 connection·관계 Node와 정확한 unblock 관계 ID, generated schema·관리 API 테스트를 제공한다. 그 자식
`PROD-822-policy`는 GraphQL `node(id:)`·`profileByHandle` 직접 조회, `searchProfiles` 후보·콘텐츠·Follow·Notification과 새 interaction 제한, 공통 admission,
Local/ActivityPub 실행 경로와 회귀를 제공한다. GraphQL `node(id:)`·`profileByHandle` 직접 조회는 기존 lifecycle·membership·공개 조회 정책으로 기본 정보를 유지하고, Profile 자체가 조회 불가하면
기존 null/unavailable 결과와 no special Block identity payload를 유지한다. `searchProfiles`가 exact-match 또는 partial-match 후보를 반환할 때는 양방향 Active Block 후보를
pagination·cursor·limit 전에 제외한다.

**Dependencies**

- cleanup PR #726을 `PROD-822`의 부모 layer로 두고 그 durable action·success gate를 소비한다. #726의 구현·검증 책임은 `PROD-821`에 남기며,
  이 그룹은 cleanup을 복제하거나 대신 소유하지 않는다. 부모 PR이 Draft여도 자식 layer 작업은 시작할 수 있다.
- #770은 canonical 문서와 OpenSpec 정책·계약만 소유한다. `PROD-822-graphql`이 selected Local actor 관리 API와 generated schema·관리 API 테스트를
  소유하고, 그 자식 `PROD-822-policy`가 공통 정책·Local/ActivityPub 실행 경로와 회귀를 소유한다.
- 2.1의 공통 정책은 `PROD-822-policy`가 정하고 각 policy consumer를 연결한다. 2.6~2.8·2.12의 관리 GraphQL 결과는
  `PROD-822-graphql`이 소유하며, 두 layer의 공개 결과와 검증은 완료 뒤 `PROD-823`이 소비한다.
- 신규 Hashtag Post List·Post 검색 endpoint를 만드는 일은 현재 task에 포함하지 않는다. 공통 후보 정책 검증과 기존 endpoint 통합 검증을 구분하고,
  구현 base에 해당 consumer가 새로 생겼다면 같은 공통 정책을 연결한다. 미구현 두 경로는 공통 정책 검증으로 이 shared change의 완료 기준을 충족하며
  실제 endpoint 구현·E2E를 archive 조건으로 두지 않는다. 전체 change의 cross-slice·archive는 `PROD-813`이 소유한다.

**Guardrails**

- 저장된 pair는 양쪽 viewer/target의 차단 상태 판정에 사용하되, GraphQL `node(id:)`·`profileByHandle` 직접 조회는 기존 lifecycle·membership·공개 조회 정책으로 기본 정보를 유지한다.
  `searchProfiles`가 exact-match 또는 partial-match 후보를 반환할 때는 양방향 Active Block 후보를 pagination·cursor·limit 전에 제외한다. direct Post·Media와 Profile Post List는 Owner → Target과
  Target → Owner 방향을 구분하고, 후보·Home·Local·Hashtag list/search·interaction은 양방향으로 후보 반환 전에 Exclude한다. Repost는 Author와 Source Post Author를 모두 검사한다.
- 유효한 Account에 selected Profile이 있으면 현재 selected Profile을 `searchProfiles` viewer로 사용한다. selected Profile이 없으면 기존 Account 인증과 공개 후보 결과를 유지하며
  Profile Block predicate나 selected Local Profile을 새로 요구하지 않는다. 임의 입력 actor나 이전 selected Profile·client cache를 viewer로 재사용하지 않는다.
- Active Block은 cleanup 뒤 남은 Follow Request·Follow Relationship의 물리적 존재보다 우선하며, Follow와 Reply·Quote·Reaction·Repost의 새 입력은 양쪽에서
  거부한다. 쓰기 admission assertion은 origin과 무관하게 공유하고 목록용 SQL predicate와 분리하며, page limit 뒤 client filter나 resolver별 정책 복제를 보안 경계로 사용하지 않는다.
- Profile Block pair의 기존 Notification은 connection·Unread count·Node·read 처리에서 숨기되, `PROD-821`의 직접 원인 삭제 이외의 기존 Notification을
  동기 삭제하거나 Read State를 바꾸지 않는다. 이 Notification policy는 방향성 있는 Post·Media 조회와 독립적으로 적용한다.
- Block이 이미 적용된 상태에서 시작한 새 Follow·Follow Request 승인은 관계를 저장하지 않는다. cleanup과 겹쳐 이미 진행 중이던 transition의
  잔존 row를 허용하는 기존 계약을 pair lock·전체 직렬화로 바꾸지 않는다. 잔존 row는 Node·목록·viewer 상태와 `FOLLOWERS`·Home 후보 권한의 근거가 아니다.
- Repost·Bookmark·기존 Reaction은 보존하며, 조회 가능한 Post의 Reaction count는 viewer와 무관하게 유지한다. Reaction Profile 목록에는 현재 조회 정책을 적용한다.
- `FOLLOWERS` Post 권한은 Follow 존재와 양방향 Active Block 부재를 함께 요구한다. `Hashtag.relatedProfiles`는 accepted ADR 0021과 active
  `hashtag-related-profile-api`의 정확한 Hashtag 관계·공개 Profile 조건을 유지하면서 selected Profile이 있으면 양방향 Active Block 후보를
  pagination 전에 제외하고, selected Profile이 없으면 기존 Account 인증과 공개 후보 결과를 유지한다.
- 기존 unavailable Notification은 connection·Unread count·Node·read 처리에서 숨기되, `PROD-821`의 직접 원인 삭제 이외의 기존 Notification을
  동기 삭제하거나 Read State를 바꾸지 않는다.
- Notification은 각 Recipient 기준으로 Block을 판정하고 기존 Account membership과 지정 ID 읽음 처리 계약을 유지한다.
- 현재 source 신규 Notification 생성 suppression은 `PROD-327`, 비동기 물리 cleanup은 `PROD-328`에 남기며 이 그룹의 task·완료 증거로 삼지 않는다.
- `PROD-822-graphql`의 GraphQL Block 생성·해제와 Owner 관리 조회는 검증된 Session의 selected Local Profile actor 및 Owner scope를 사용하고, request-specific DB actor state나 client-only filter로
  중앙 application policy를 대체하지 않는다. 일반 조회·Notification membership 권한을 이 Local 제한으로 바꾸지 않으며 remote ActivityPub ingress는 `PROD-818`에 남긴다.
- Block·Mute 관계의 Target은 기존 `Profile` 조회 결과와 global ID를 사용하고, Post·Media·Follow에는 각 surface의 Profile Block 정책을 적용한다.
  Block 관리 connection과 관계 Node는 Target의 기존 Profile 조회 조건을 적용하고 목록에서는 pagination 전에 제외한다. 생성·해제는 durable action의 완료 결과를 사용하고 성공한 해제는 실제 삭제한 관계 ID를 반환한다. 같은 operation의 actor 전환과 mutation 뒤에도 이전 loader 권한을 재사용하지 않는다.
- GraphQL `node(id:)`·`profileByHandle`로 직접 route handle의 Profile을 조회할 때 자신의 차단 여부·해제 관계 ID를 얻는 결과는 이전 client cache를 요구하지 않는다.
  자신의 Block이 없으면 다른 Owner의 관계 ID를 반환하지 않는다.
- Unblock 성공은 실제 삭제한 관계 ID를 반환하고 관계를 제거하지
  않은 결과만 `null`이며, 오류·partial 결과를 성공으로 확정하지 않는다.
- Mute와 Block 관리 관계는 독립적이다. 같은 Target의 Active Block에서도 기존 Mute 관계는 Owner connection·관계 Node·해제 경로에 남아야 한다.
- 저장·durable cleanup(`PROD-821`), UI/Relay(`PROD-823`)와 최종 cross-slice E2E/archive(`PROD-813`)를 이 그룹에서 재구현하지 않는다.

**Verification**

- `PROD-822-policy`는 양쪽 요청 방향의 GraphQL `node(id:)`·`profileByHandle` 직접 조회가 기존 lifecycle·membership·공개 Profile 조회 조건과 기본 Profile 정보를 유지하고,
  `searchProfiles` exact-match·partial-match와 `Hashtag.relatedProfiles` 후보가 양방향 Active Block 관계를 pagination·cursor·limit 전에 제외하는지 검증한다. Post·Media·Follow 후보와
  현재 존재하는 Home/Local/Profile list에는 각 surface의 방향별 또는 양방향 정책을 실제 경로에서 검증한다. Hashtag Post List·Post 검색은 endpoint가 구현 시점에 존재할 때만 실제 연결·공개 회귀를 요구하고, 없으면 공통 Author·Source Author 후보 정책을 검증한다.
- `PROD-822-policy`는 selected Profile이 없는 유효한 Account에서 `searchProfiles`와 `Hashtag.relatedProfiles`의 기존 Account 인증·공개 후보 결과 보존, A/B selected Profile 전환 시 현재 viewer 격리,
  exact remote materialization 완료 후 `searchProfiles` exact-match·partial-match 후보와 정확한 Hashtag 관계 후보의 양방향 Active Block 필터와 pagination 전 적용을 검증한다. 임의 입력 actor나
  이전 selected Profile·client cache가 viewer로 재사용되지 않는지 확인한다.
- `PROD-822-policy`는 cleanup 뒤 남은 Follow Request·Follow Relationship의 비활성·비노출, 양쪽의 새 Follow와 Reply·Quote·Reaction·Repost 거부 및 기존 Post Visibility·Local PUBLIC
  eligibility 공존을 자동화된 정책·상호작용 회귀로 검증한다. 실제 Local/ActivityPub consumer가 있는 Reply·Reaction·Repost는 각 origin의 거부 뒤 새 Post·Reaction·Repost row가 없는지 확인하고,
  `CreatePostInput.repostSourceId`를 사용하는 Local Quote는 차단 양방향에서 GraphQL 요청 거부와 새 Post row 부재를 확인한다.
  ingress가 없는 Quote origin은 공통 assertion 단위 결과와 실제 ingress 미검증을 구분한다.
- `PROD-822-graphql`은 selected Local Profile A/B, guest·membership mismatch와 arbitrary actor ID를 GraphQL mutation·Owner connection·Node/loader에서 검증한다.
- `PROD-822-graphql`은 이전 client cache 없이 GraphQL `node(id:)`·`profileByHandle` 기반 직접 route 진입·새로고침에서 정상 결과가 기본 Profile 정보와 현재 selected Local Owner 범위의 정확한 unblock 관계 ID를 제공하는지 확인하고,
  `PROD-822-policy`는 viewer 방향별 콘텐츠 상태를 검증한다. Profile 자체가 기존 lifecycle 정책으로 조회 불가하면 API의 기존 null/unavailable 결과와 Block 전용 identity payload 부재를 확인한다.
  자신의 Block이 없을 때 다른 Owner의 관계 ID를 반환하지 않고 Post·Media에는 각 surface 정책을 적용하는지 함께 검증한다.
- `PROD-822-policy`는 차단으로 unavailable인 기존 Notification의 connection·Unread count·Node·read 숨김과 직접 원인 Follow Notification 정리 경계를 검증한다.
- 선행 cleanup의 지연·실패·timeout, 해제의 정확한 관계 ID·no-restore·반대 Block 유지, 같은 Mutation 후속 field의 현재 actor·정책 결과를 검증한다.
- Local/Remote pair와 제삼자, 잔존 Follow/Request, Source Author만 차단된 Repost, 차단 후보가 앞부분을 채운 pagination, 여러 Recipient와 혼합 알림 ID를
  포함한다. 아직 없는 consumer는 공통 후보 정책 증거로 기록하고 실제 endpoint 검증으로 표시하지 않는다.
- `PROD-822-graphql`은 generated schema와 관리 API 테스트를, `PROD-822-policy`는 기존 Mute·Follow·Post visibility·Notification 회귀, Core unit·services,
  API integration·schema·TypeScript와 변경 파일 lint를 통과시킨다. 실제 변경한 shared caller가 있으면 `PROD-822-policy`가 Worker·Fedify 회귀도 확인한다.
  자세한 현재 경로와 검증 묶음은 `design.md`의 비규범적 guidance를 참고한다.

- [ ] 2.1 [PROD-822-policy] Local/Remote Owner·Target과 양쪽 viewer에 적용할 공통 pair 정책을 제공하고, Active Block이 잔존 Follow/Request보다 우선함을 검증한다.
- [ ] 2.2 [PROD-822-policy] GraphQL `node(id:)`·`profileByHandle` 직접 조회는 기존 lifecycle·membership·공개 Profile 조회 조건과 기본 Profile 정보를 유지하고, 유효한 Account의 current selected Profile을 viewer로 사용하는 `searchProfiles`와 `Hashtag.relatedProfiles`가 후보를 반환할 때 양방향 Active Block 후보를 pagination·cursor·limit 전에 제외한다. selected Profile이 없으면 두 surface의 기존 Account 인증·공개 후보 결과를 유지하고 selected Local Profile을 새로 요구하지 않는다. 관련 Follow 후보에도 양방향 차단을 적용한다.
- [ ] 2.3 [PROD-822-policy] Follow/Request Node·followers/following·요청 목록·viewer 상태와 Home·`FOLLOWERS` 권한이 차단 중 잔존 관계를 유효하게 사용하지 않도록 한다.
- [ ] 2.4 [PROD-822-policy] Post·PostContent·Media relation·Profile Post List와 Bookmark의 대상 Post projection에는 방향별 정책을, 현재 존재하는 Home·Local·Reaction Profile 목록에는 양방향 정책을 연결하고 Author·Source Author의 후보 제외와 cursor/pageInfo를 검증한다. Hashtag Post List·Post 검색은 endpoint가 구현 시점에 존재할 때만 같은 정책 연결·공개 회귀를 요구하고, 없으면 공통 Author·Source Author 후보 정책을 검증한다. Bookmark row·Owner 권한·Node·삭제는 보존하고 `Bookmark.post`의 nullable 결과와 `Profile.bookmarks` edge만 현재 Post 조회 정책에 맞추는 기존 계약을 유지한다.
- [ ] 2.5 [PROD-822-policy] Block 적용 뒤 시작한 로컬 Follow·Follow Request 승인과 Local/ActivityPub Reply·Reaction·Repost 및 기존 ActivityPub inbound Follow·Accept가 새 관계나 상호작용을 저장하지 않도록 쓰기 경계를 검증한다. Reply·Quote·Reaction·Repost는 origin과 무관한 공통 admission assertion을 사용하고 목록용 SQL predicate와 분리한다. Local Quote는 `CreatePostInput.repostSourceId`를 사용한 GraphQL 요청을 차단 양방향에서 각각 거부하고 새 Post row가 없음을 검증한다. ingress가 없는 Quote origin은 공통 assertion 단위 결과와 실제 ingress 미검증을 구분한다. 실제 consumer의 각 origin 거부 뒤 새 row가 없고 inbound 예상 거절이 내부 오류로 보고되지 않는지 확인한다.
- [ ] 2.6 [PROD-822-graphql] selected Local actor의 Block 생성·해제 mutation을 부모 layer의 durable action에 연결하고 cleanup 지연·실패·정확한 해제 ID·no-restore를 검증한다.
- [ ] 2.7 [PROD-822-graphql] Owner 전용 Block connection·관계 Node에서 조회 가능한 기존 Profile Target과 GraphQL `node(id:)`·`profileByHandle` 기반 직접 route 진입의 차단 여부·해제 ID를 제공하고, unavailable Target은 pagination 전과 관계 Node에서 제외하며 타인 Block ID 접근을 차단한다. lifecycle상 조회 불가 Target에는 기존 null/unavailable 결과와 Block 전용 identity payload 부재를 유지한다.
- [ ] 2.8 [PROD-822-graphql] Block·Unblock과 같은 operation의 selected Profile 전환 뒤 후속 field 및 다음 요청이 현재 actor·Block 정책을 반영하게 한다.
- [ ] 2.9 [PROD-822-policy] 기존 Notification의 Recipient별 list·Unread·Node·mark-read 비노출을 연결하고 비직접 row·Read State 보존과 혼합 ID 처리를 검증한다.
- [ ] 2.10 [PROD-822-policy] 현재 모든 consumer의 공개 계약 회귀, 미구현 Hashtag Post List·Post 검색의 공통 후보 정책과 Local Quote GraphQL ingress의 양방향 거부·새 Post row 부재를 검증한다. 존재하지 않는 endpoint·origin은 공통 정책 검증과 실제 ingress 미검증을 구분해 기록하고, 이후 해당 consumer를 도입하는 기능 이슈가 연결·실제 E2E를 소유한다.
- [ ] 2.11 [PROD-822-graphql + PROD-822-policy] `PROD-822-graphql`은 generated GraphQL schema·적용 문서·관리 API 테스트를, `PROD-822-policy`는 실제 공개 결과와 Core·API·Fedify 및 영향받은 caller 회귀·required checks를 정렬·검증한다.
- [ ] 2.12 [PROD-822-graphql] 같은 Target의 Mute·Block 관계가 함께 있을 때 기존 Profile 조회와 Mute Owner connection·관계 Node·해제 경로의 독립성을 검증한다.

## 3. PROD-823 — Profile Block UI·Relay 관리 흐름

2026-09-09 리뷰 반영: PROD-861은 메뉴·목록 presentation만 유지하며 부모 mutation callback과 가짜 요청 fixture를 제거한다.
이 그룹이 실제 action의 요청·confirmation·pending·오류·Relay 갱신과 메뉴·버튼 공통 동작을 구현·검증한다.
PROD-917은 인계된 action을 신규 UI에 합성한다. 기존 presentation 검증을 아래 task의 완료 증거로 사용하지 않는다.

**Authority / Provenance**

- `docs/design/profile-mute-block.md`
- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `docs/domain/objects/profile-block.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `PROD-823`
- `DSN-51`
- `DSN-53`
- 후속 UI 교체 `PROD-917`

**Deliverable**

`PROD-822`의 서버 확정 상태와 최신 canonical의 기존 Profile 정보·viewer 방향 콘텐츠 상태를 소비해 Profile Block
confirmation·pending·실패·retry, Mute와 분리된 관리 목록과 selected Profile별 client 상태 수렴을 제공한다. 신규 UI 교체는 `PROD-917` 후속 범위다.

**Guardrails**

- 기존 레거시 Profile·Settings UI에 최신 canonical의 direct Profile route와 기존 Profile 정보·viewer 방향 콘텐츠 상태를 구현·통합한다. `blocking` route의
  frontend 콘텐츠 경고와 `blockedBy` route의 콘텐츠 차단 상태를 표시하며, `PROD-861`은 공용 presentation 선행 구현 증거로, `PROD-917`의 신규 UI 교체는
  후속 범위로 관리한다. 기존 화면의 기능·접근성·client 회귀와 검증 결과 인계는 `PROD-823`이 소유하며, 신규 UI 교체·수신 확인은 완료 조건으로 삼지 않는다.
- Block과 Mute는 별도 Settings destination으로 유지하고, Block 목록의 loading/error·retry/empty/pagination·unblock 상태를 소유한다. 차단된 상세
  데이터는 각 viewer 방향 콘텐츠 정책에 따라 표시한다.
- 기존 Button·ActionMenu·ModalSheet·Toast·SettingsItem과 canonical 접근성·viewport 계약을 재사용하고 새 범용 safety component·Settings shell을
  만들지 않는다.
- 성공은 서버 확정 결과로 client 상태를 수렴하고 실패 시 optimistic Block을 확정하지 않는다. selected Profile/Session 전환 때 각 actor의
  기본 Profile 정보·콘텐츠 상태·Block 목록을 해당 actor 결과로 격리하며 Unblock 때 제거된 Follow Request·Follow Relationship을 optimistic 복구하지 않는다.
- API의 기존 `Profile` global ID와 `ProfileBlock` 관계 ID 및 해제 payload의 의미를 구분한다.
  `targetProfile`은 별도 typename·ID 없이 기존 Profile cache로 정규화하고, 실제 성공·미제거·오류 응답에 맞춰 상태를 수렴시킨다.
- 새로고침·직접 링크는 이전 cache나 관리 목록 선행 로딩 없이 기존 Target Profile 조회와 현재 Owner의 서버 차단 결과를 사용한다.
  Profile이 조회되면 기본 Profile 정보와 방향성 콘텐츠 상태를 유지하고, 조회되지 않을 때만 자신의 Block은 identity-free `blocking`과
  해당 관계 ID의 해제를, 상대에게 차단된 경우는 actionless `blockedBy`를 표시한다.
- 해제는 Profile 메뉴·`blocking` 상태·차단 목록 모두 확인창에서 확정한 뒤 요청한다. 취소 시 요청하지 않으며 identity-free 확인창에도
  Target identity를 표시하지 않는다. 해제 pending의 중복 입력·dismiss 차단과 실패 후 재시도를 검증한다.
- 공통 Settings source의 최초 owner는 실제 구현 변경 증거로 확인한다. `PROD-814`가 먼저 통합한 경우 그 source를 재사용하고, Block destination의
  route·data·action과 검증을 완료한 뒤 `뮤트한 프로필 → 차단한 프로필` 순서로 공개한다. 미완성 destination을 노출하지 않는다.
- 저장·정책(`PROD-821`·`PROD-822`)과 전체 E2E/archive(`PROD-813`)의 책임을 이 그룹으로 옮기지 않는다.

**Verification**

- confirmation 취소, pending 중복/dismiss, 성공·실패·retry와 기존 레거시 Profile·Settings UI의 action/state를 app component 또는 E2E로 검증한다.
- direct `blocking` Profile route에서 `차단한 프로필의 게시물입니다`와 `게시물 보기`를 표시하고, action 전에는 시간 경과만으로 Post·Media를 노출하지 않으며 action 뒤 허용된 콘텐츠를 표시하는지 검증한다. Profile handle·selected actor lifecycle 전환 뒤에는 경고가 다시 적용되는지 component 또는 E2E로 실행한다.
- Settings의 분리된 Block 목록에서 loading/error·retry/empty/pagination·unblock과 다른 Target 상태 보존을 검증한다.
- selected Profile A/B와 Session 전환에서 actor별 상태 격리·서버 결과 수렴·optimistic state isolation을 검증한다. Block 성공 뒤 기본 Profile 정보는 유지하고,
  각 surface 정책상 unavailable한 Post·Media·Notification만 숨기거나 갱신하며 정상 refetch로 현재 서버 상태에 수렴하는지 확인한다.
- GraphQL `node(id:)`·`profileByHandle` 기반 새로고침·직접 링크 진입에서 기존 Profile 정보와 API의 현재 Owner 결과·정확한 관계 ID의 해제를 제공한다.
  이전 Profile cache 없이 검증하며 A/B 전환 뒤 이전 해제 ID를 재사용하지 않는다.
- Web 1024/1440·Mobile 390 Light/Dark, keyboard/보조 기술, Web Escape·Native back·focus 복원과 실제 Web/iOS/Android presentation evidence를
  실행 환경별로 기록한다.

- [ ] 3.1 기존 차단·차단 해제 공용 confirmation을 Profile mutation 상태에 연결해 확인 전 요청 차단·취소·pending·실패·retry를 구현한다. direct `blocking` Profile route는 `차단한 프로필의 게시물입니다`와 `게시물 보기`를 제공하고, 현재 Profile handle·selected actor lifecycle에서 명시적 확인 전까지 콘텐츠를 숨기며 새 route lifecycle에는 경고를 다시 적용한다.
- [ ] 3.2 Settings에 Mute와 분리된 Block 관리 destination·목록 상태·pagination·unblock action을 연결한다.
- [ ] 3.3 selected Local Profile actor 경계 안에서 Block/Unblock 성공·실패 결과에 따라 관리 목록과 표시 중 Profile·Post·Notification 상태를
      서버 정책에 맞게 수렴시키고, GraphQL `node(id:)`·`profileByHandle` 기반 직접 route 진입·새로고침의 기존 Profile 정보와 정확한 해제 관계를 연결한다. 정상 route 결과는 identity-free가 아니며,
      Profile 자체가 기존 lifecycle 정책으로 조회 불가할 때 UI에서만 조건부 identity-free fallback을 사용한다.
- [ ] 3.4 접근성·viewport·Web/Native presentation regression과 actor 전환·Unblock no-restore 검증을 추가하고 통과시킨다.
- selected Profile A/B와 Session 전환에서 actor별 상태 격리·서버 결과 수렴·optimistic state isolation 및 Block 성공 후 기본 Profile 정보,
  viewer 방향 콘텐츠 상태와 이미 표시 중인 Home·Local·Hashtag timeline·Profile Post List·Notification client 상태의 surface별 갱신을 검증한다.
- cache 없는 직접 링크·새로고침에서 자신의 Block 관계 ID로 해제하는 경로, 상대에게만 차단된 actionless 경로와 양방향 Block 해제 후
  `blockedBy`로 수렴하는 경로를 검증한다. A의 요청 중 B로 전환한 뒤 도착하는 응답이 B의 화면·목록·피드백을 바꾸지 않는지도 확인한다.
- 실제 공개 응답의 기존 `Profile` global ID를 사용하는 생성 성공·오류·partial response와 해제된 관계 ID·미제거 `null`·오류 응답을
  실행해 상태 수렴을 검증한다. 별도 Target typename·ID나 반대 의미의 성공 fixture로 API 계약을 숨기지 않는다.
- Web 1024/1440·Mobile 390 Light/Dark, keyboard/보조 기술, Web Escape·Native back·focus 복원과 실제 Web/iOS/Android presentation evidence를
  실행 환경별로 기록한다.

- [x] 3.1 기존 공용 confirmation을 Profile mutation 상태에 연결해 취소·pending·실패·retry와 direct Profile route의 경고·콘텐츠 상태 및 보호된 데이터 비복구를 구현한다.
- [x] 3.2 Settings에 Mute와 분리된 Block 관리 destination·목록 상태·pagination·unblock action을 연결한다.
- [x] 3.3 생성 응답의 기존 Profile global ID와 Block 관계 ID, 해제 성공의 관계 ID·미제거 `null`·오류/partial 결과를 client 계약에 맞게 처리하고, selected Local
      Profile actor 경계 안에서 Block/Unblock 성공·실패 결과에 따라 관리 목록과 표시 중 기본 Profile 정보·viewer 방향
      콘텐츠 상태·Home/Local/Hashtag timeline·Profile Post List·Notification client 상태를 각 surface 서버 정책에 맞게 수렴시킨다.
- [ ] 3.4 접근성·viewport·Web/Native direct route presentation regression과 actor 전환·Unblock no-restore, 확인창 dismiss 후 Profile 메뉴
      trigger와 Settings 목록의 다음 항목 또는 heading fallback focus 복원을 검증하고 `PROD-917` 후속 UI 교체 경계를 유지한다.
- [x] 3.5 직접 링크·새로고침·selected Profile 전환에서 현재 Owner의 차단 결과와 조회 가능한 기본 Profile을 소비하고, Profile 미조회 시 identity-free 상태와 자신의 Block 관계 ID 기반 해제를 연결한다.
- [x] 3.6 차단 결과 재조회, 양방향 Block의 자기 관계 해제와 이전 actor의 늦은 응답을 실행하는 data/cache integration 회귀를 통과시킨다.
- [x] 3.7 선행 API와 실제 공통 Settings source를 통합한 상태에서 표준 `pnpm --filter @kosmo/app relay`,
      `pnpm --filter @kosmo/app check`, `pnpm --filter @kosmo/app test:unit` 및 변경 범위 lint·format 검증을 통과시킨다.
- [x] 3.8 기존 UI의 코드·PR·진입점, 데이터와 loading·empty·error·pending 인터페이스, action 입력·결과·오류·재시도·pagination,
      실제 기능·접근성·cache·프로필 전환 증거와 남은 제약을 PROD-917에 인계하고 PROD-813의 통합 검증에 제공한다.

## 4. PROD-813 — Profile Block cross-slice E2E·canonical sync·archive

**Authority / Provenance**

- `docs/domain/objects/profile-block.md`
- `docs/domain/objects/notification.md`
- `docs/domain/policies/post-list.md`
- `docs/design/profile-mute-block.md`
- `memory/issue-openspec-workflow.md`
- `PROD-821`
- `PROD-822`
- `PROD-823`
- `PROD-813` 최신 본문·댓글
- `PROD-917` 후속 UI 교체 범위

**Deliverable**

`PROD-821` → `PROD-822` → `PROD-823` 결과를 Local·Remote Target과 selected Profile 흐름에 연결해 차단·해제의 cross-slice
E2E를 완료하고, 최신 canonical·Linear·OpenSpec을 동기화한 뒤 모든 task와 validation이 완료된 경우에만 전체 change를 archive한다.
미구현 Hashtag Post List·Post 검색은 공통 후보 정책 검증으로 완료 조건을 충족하며, 실제 endpoint 구현·E2E는 archive 조건이 아니다.

**Guardrails**

- Local·Remote Target, 기존 Profile 조회 조건, viewer 방향의 직접 Post·Media 조회, 양방향 list/search·새 interaction·Notification, Follow/직접 원인
  cleanup, 기존 Reaction·Repost/Bookmark 보존, Follow 관계 Unblock 비복구와 Profile 전환 isolation을 한 완료 흐름으로 검증한다.
- `PROD-327`의 현재 Notification source 신규 생성 suppression, `PROD-818`의 ActivityPub Block/Undo, `PROD-328`의 async physical cleanup은 이 change의
  구현·완료 증거가 아니다.
- 기존 레거시 Profile·Settings UI의 구현·통합 결과를 API·cache·Native runtime 결과와 함께 환경별 실제 evidence로 기록한다. `PROD-917` 신규 UI 교체는
  현재 change와 분리된 후속 범위로 유지한다.
- `PROD-861` Storybook/presentation 결과를 API·cache·Native runtime 완료 증거로 일반화하지 않는다. 환경별 실제 증거와 미검증 범위를 분리 기록한다.
- 미구현 Hashtag Post List·Post 검색은 공통 정책 검증 결과와 실제 API 미실행을 구분해 기록한다. 검증 시점에 endpoint가 이미 제공되면 실제 공개 결과로 검증하며,
  archive 이후 추가되는 endpoint의 연결·검증은 해당 기능 이슈가 소유한다. 미래 endpoint를 기다리기 위해 이 change를 미완료로 유지하거나 다시 열지 않는다.
- 모든 declared task와 required validation, canonical·Linear 정합성이 완료되기 전에는 archive하지 않는다.

**Verification**

- Local/Remote Target 각각의 block·unblock, GraphQL `node(id:)`·`profileByHandle` 기존 Profile identity 조회, Owner → Target과 Target → Owner의 Post/Media direct 정책, Profile Post List·Bookmark viewer
  방향 정책, 양방향 Follow 후보·Home/Local list·`searchProfiles`·`Hashtag.relatedProfiles`·새 interaction·Notification과 cleanup/no-restore를 현재 구현된 consumer의 Web/API cross-slice E2E로 검증한다.
- 이전 cache 없는 GraphQL `node(id:)`·`profileByHandle` 기반 직접 Profile 진입·새로고침·actor 전환에서 기존 Profile 정보와 Owner 해제 ID의 API·UI 연결을 확인한다.
- 아직 없는 Hashtag Post List·Post 검색은 2.10의 공통 후보 정책 실행 결과와 실제 endpoint 미실행 기록을 완료 증거로 확인한다.
- Web·iOS·Android와 접근성 실행 결과를 플랫폼별로 기록하고, 구현하지 않은 ActivityPub Block/Undo ingress·Notification source suppression·async cleanup 범위를 별도로 확인한다.
- 최신 Linear 본문·관계·댓글과 canonical domain/design 문서를 다시 읽어 requirement provenance·소유권·실행 순서를 대조한다.
- `openspec validate add-profile-block --strict`, Prettier 검사와 `git diff --check`를 통과한 뒤에만 archive gate를 진행한다.

- [ ] 4.1 `PROD-821`·`PROD-822`·`PROD-823` 결과를 연결한 Local/Remote block·unblock 및 GraphQL `node(id:)`·`profileByHandle` Profile identity, directional direct content/Profile Post List·Bookmark,
      bilateral Home/Local list·`searchProfiles`·`Hashtag.relatedProfiles`·interaction·Notification·cleanup의 현재 구현된 consumer cross-slice E2E를 실행한다. 미구현 Hashtag Post List·Post 검색은 실제 endpoint E2E가 아니라 공통 후보 정책 검증 결과와 endpoint 미실행 기록을 확인한다.
- [ ] 4.2 cross-slice UI/API 결과와 selected Profile actor 상태 격리, 기본 Profile 정보·viewer 방향 콘텐츠 상태, 보존·비복구 및 `PROD-917` 후속
      범위 경계를 플랫폼별 evidence로 기록한다. 정상적인 GraphQL `node(id:)`·`profileByHandle` 직접 route 진입·새로고침은 기본 Profile 정보, viewer 방향별 콘텐츠 상태와
      selected Local Owner 범위의 정확한 unblock 관계 ID를 검증한다. API의 lifecycle상 null/unavailable 결과와 UI의 조건부 fallback 표시를 구분해 기록한다.
- [ ] 4.3 최신 canonical·Linear·OpenSpec 정합성을 확인하고 strict validation·Prettier·diff 검증과 모든 task 완료 뒤 `add-profile-block`을 archive한다.
