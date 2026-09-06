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
  `PROD-822`의 ingress 경계다.
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
- `docs/domain/objects/post.md`
- `docs/domain/objects/media.md`
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

**Deliverable**

`PROD-821`의 저장·cleanup 결과를 사용하는 공통 Profile Block policy와 selected Local Profile actor 기반 GraphQL mutation·Owner 관리
connection을 제공한다. Profile identity는 기존 Profile 조회 정책을 사용하고, Post·Media direct 조회와 Profile Post List는 viewer 방향 콘텐츠 정책을
사용하며, Profile/Post/Media/Follow 후보·Home/Local/Hashtag Post List·search·기존 Notification과 새 로컬 interaction은 각 surface의
양방향 보호 정책을 소비하게 한다.

**Dependencies**

- cleanup PR #726을 `PROD-822`의 부모 layer로 두고 그 durable action·success gate를 소비한다. #726의 구현·검증 책임은 `PROD-821`에 남기며,
  이 그룹은 cleanup을 복제하거나 대신 소유하지 않는다. 부모 PR이 Draft여도 자식 layer 작업은 시작할 수 있다.
- 2.1의 공통 정책을 정한 뒤 각 consumer를 연결한다. 모든 공개 결과와 검증은 이 그룹이 소유하며, 완료 뒤 `PROD-823`이 소비한다.
- 신규 Hashtag Post List·Post 검색 endpoint를 만드는 일은 현재 task에 포함하지 않는다. 공통 후보 정책 검증과 기존 endpoint 통합 검증을 구분하고,
  구현 base에 해당 consumer가 새로 생겼다면 같은 공통 정책을 연결한다. 미구현 두 경로는 공통 정책 검증으로 이 shared change의 완료 기준을 충족하며
  실제 endpoint 구현·E2E를 archive 조건으로 두지 않는다. 전체 change의 cross-slice·archive는 `PROD-813`이 소유한다.

**Guardrails**

- 저장된 Owner → Target 관계를 양쪽 viewer 방향으로 평가한다. Profile Node·handle route·일반 Profile search는 기존 Profile 조회 정책을 사용하고,
  Post·Media direct 조회와 Profile Post List는 viewer 방향 콘텐츠 정책을 사용하며, Home·Local·Hashtag Post List·Post search·Follow 후보·interaction·
  Notification은 양방향 보호 정책을 사용한다. Repost는 Author와 Source Post Author를 모두 검사한다.
- Active Block은 cleanup 뒤 남은 Follow Request·Follow Relationship의 물리적 존재보다 우선하며, Follow·Reply·Reaction·Repost의 새 로컬 입력은 양쪽에서
  거부한다. page limit 뒤 client filter나 resolver별 정책 복제를 보안 경계로 사용하지 않는다.
- Profile Block pair의 기존 Notification은 connection·Unread count·Node·read 처리에서 숨기되, `PROD-821`의 직접 원인 삭제 이외의 기존 Notification을
  동기 삭제하거나 Read State를 바꾸지 않는다. 이 Notification policy는 방향성 있는 Post·Media direct 조회와 독립적으로 적용한다.
- Block이 이미 적용된 상태에서 시작한 새 Follow·Follow Request 승인은 관계를 저장하지 않는다. cleanup과 겹쳐 이미 진행 중이던 transition의
  잔존 row를 허용하는 기존 계약을 pair lock·전체 직렬화로 바꾸지 않는다. 잔존 row는 Node·목록·viewer 상태와 `FOLLOWERS`·Home 후보 권한의 근거가 아니다.
- Repost·Bookmark·기존 Reaction은 보존하며, 조회 가능한 Post의 Reaction count는 viewer와 무관하게 유지한다. Reaction Profile 목록에는 현재 조회 정책을 적용한다.
- 기존 unavailable Notification은 connection·Unread count·Node·read 처리에서 숨기되, `PROD-821`의 직접 원인 삭제 이외의 기존 Notification을
  동기 삭제하거나 Read State를 바꾸지 않는다.
- Notification은 각 Recipient 기준으로 Block을 판정하고 기존 Account membership과 지정 ID 읽음 처리 계약을 유지한다.
- 현재 source 신규 Notification 생성 suppression은 `PROD-327`, 비동기 물리 cleanup은 `PROD-328`에 남기며 이 그룹의 task·완료 증거로 삼지 않는다.
- GraphQL Block 생성·해제와 Owner 관리 조회는 검증된 Session의 selected Local Profile actor 및 Owner scope를 사용하고, request-specific DB actor state나 client-only filter로
  중앙 application policy를 대체하지 않는다. 일반 조회·Notification membership 권한을 이 Local 제한으로 바꾸지 않으며 remote ActivityPub ingress는 `PROD-818`에 남긴다.
- Owner 관리 정보는 관계 식별에 필요한 Target 정보로 한정하고 일반 Profile·Post·Media·Follow 조회 권한을 열지 않는다. 생성·해제는 durable action의
  완료 결과를 사용하고 성공한 해제는 실제 삭제한 관계 ID를 반환한다. 같은 operation의 actor 전환과 mutation 뒤에도 이전 loader 권한을 재사용하지 않는다.
- 직접 route handle로 자신의 차단 여부·해제 관계 ID를 얻는 결과는 일반 Target Profile 조회나 이전 client cache를 요구하지 않는다.
  자신의 Block이 없으면 다른 Owner의 관계 ID나 보호된 Profile payload를 반환하지 않는다.
- 저장·durable cleanup(`PROD-821`), UI/Relay(`PROD-823`)와 최종 cross-slice E2E/archive(`PROD-813`)를 이 그룹에서 재구현하지 않는다.

**Verification**

- 양쪽 요청 방향의 Profile Node·handle route·일반 Profile search가 기존 Profile 조회 조건을 유지하는지, Owner → Target과 Target → Owner의 Post·Media
  direct 조회 및 Profile Post List가 viewer 방향 정책을 따르는지 검증한다.
- Home/Local/Hashtag list·Post search에서 양방향 Author/Source Author 보호와 cursor 전 필터링을 검증하고, Profile Post List의 viewer 방향 정책을 검증한다.
- cleanup 뒤 남은 Follow Request·Follow Relationship의 비활성·비노출, 양쪽의 새 Follow·Reply·Reaction·Repost 거부와 기존 Post Visibility·Local PUBLIC
  eligibility 공존을 자동화된 정책·상호작용 회귀로 검증한다.
- selected Local Profile A/B, guest·membership mismatch와 arbitrary actor ID를 GraphQL mutation·Owner connection·Node/loader에서 검증한다.
- 이전 client cache 없이 직접 route 진입·새로고침, A/B 전환에서 자신의 차단 여부와 정확한 해제 ID를 확인한다. 자신의 Block이 없는 unavailable 결과와
  Target identity·일반 Profile·Post·Media 조회 우회 실패를 함께 검증한다.
- 차단으로 unavailable인 기존 Notification의 connection·Unread count·Node·read 숨김과 직접 원인 Follow Notification 정리 경계를 검증한다.
- 선행 cleanup의 지연·실패·timeout, 해제의 정확한 관계 ID·no-restore·반대 Block 유지, 같은 Mutation 후속 field의 현재 actor·정책 결과를 검증한다.
- Local/Remote pair와 제삼자, 잔존 Follow/Request, Source Author만 차단된 Repost, 차단 후보가 앞부분을 채운 pagination, 여러 Recipient와 혼합 알림 ID를
  포함한다. 아직 없는 consumer는 공통 후보 정책 증거로 기록하고 실제 endpoint 검증으로 표시하지 않는다.
- 기존 Mute·Follow·Post visibility·Notification 회귀, Core unit·services, API integration·schema·TypeScript와 변경 파일 lint를 통과시킨다.
  실제 변경한 shared caller가 있으면 Worker·Fedify 회귀도 확인한다. 자세한 현재 경로와 검증 묶음은 `design.md`의 비규범적 guidance를 참고한다.

- [x] 2.1 Local/Remote Owner·Target과 양쪽 viewer에 적용할 공통 pair 정책을 제공하고, Active Block이 잔존 Follow/Request보다 우선함을 검증한다.
- [x] 2.2 Profile Node·exact/partial 검색·관련 Profile 후보에서 양방향 차단을 적용하고 제삼자의 기존 조회 권한을 보존한다.
- [x] 2.3 Follow/Request Node·followers/following·요청 목록·viewer 상태와 Home·`FOLLOWERS` 권한이 차단 중 잔존 관계를 유효하게 사용하지 않도록 한다.
- [x] 2.4 Post·PostContent·Media relation·기존 Post 목록·Bookmark·Reaction Profile 목록에 정책을 연결하고 Author·Source Author의 후보 제외와 cursor/pageInfo를 검증한다.
- [x] 2.5 Block 적용 뒤 시작한 로컬 Follow·Follow Request 승인·Reply·Reaction·Repost가 새 관계나 상호작용을 저장하지 않도록 쓰기 경계를 검증한다.
- [x] 2.6 selected Local actor의 Block 생성·해제 mutation을 부모 layer의 durable action에 연결하고 cleanup 지연·실패·정확한 해제 ID·no-restore를 검증한다.
- [x] 2.7 Owner 전용 Block connection·관계 Node·최소 Target 관리 정보와 직접 route 진입의 차단 여부·해제 ID를 제공하고 일반 Profile·nested field·타인 Block ID 우회를 차단한다.
- [x] 2.8 Block·Unblock과 같은 operation의 selected Profile 전환 뒤 후속 field 및 다음 요청이 현재 actor·Block 정책을 반영하게 한다.
- [x] 2.9 기존 Notification의 Recipient별 list·Unread·Node·mark-read 비노출을 연결하고 비직접 row·Read State 보존과 혼합 ID 처리를 검증한다.
- [x] 2.10 현재 모든 consumer의 공개 계약 회귀와 미구현 Hashtag Post List·Post 검색의 공통 후보 정책 검증을 수행하고 실제 endpoint 검증 여부를 구분해 기록한다.
- [x] 2.11 generated GraphQL schema·적용 문서와 실제 공개 결과를 정렬하고 Core·API 및 영향받은 caller 회귀와 required checks를 통과시킨다.

## 3. PROD-823 — Profile Block UI·Relay 관리 흐름

**Authority / Provenance**

- `docs/design/profile-mute-block.md`
- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `PROD-823`
- `DSN-51`
- `DSN-53`
- 후속 UI 교체 `PROD-917`

**Deliverable**

`PROD-822`의 서버 확정 상태와 최신 canonical이 정한 direct Profile route 계약을 기존 레거시 Profile·Settings UI에 구현·통합해 Profile Block
confirmation·pending·실패·retry, Mute와 분리된 관리 목록과 selected Profile별 client 상태 수렴을 제공한다. 양쪽 route는 기본 Profile 정보를 표시하고, `blocking` route는
frontend 콘텐츠 경고 뒤 허용된 콘텐츠와 `차단 해제` action을 제공하며, `blockedBy` route는 콘텐츠 차단 상태를 표시한다. `PROD-917`의
신규 UI 교체는 후속 범위로 유지한다.

**Guardrails**

- 기존 레거시 Profile·Settings UI에 최신 canonical이 정한 direct Profile route 계약을 구현·통합한다. `blocking` route의 frontend 콘텐츠 경고와
  `blockedBy` route의 콘텐츠 차단 상태를 표시하며, `PROD-917`의 신규 UI 교체는 후속 범위로 관리한다.
- Block과 Mute는 별도 Settings destination으로 유지하고, Block 목록의 loading/error·retry/empty/pagination·unblock 상태를 소유한다. 차단된 상세
  데이터는 각 viewer 방향 콘텐츠 정책에 따라 표시한다.
- 기존 Button·ActionMenu·ModalSheet·Toast·SettingsItem과 canonical 접근성·viewport 계약을 재사용하고 새 범용 safety component·Settings shell을
  만들지 않는다.
- 성공은 서버 확정 결과로 client 상태를 수렴하고 실패 시 optimistic Block을 확정하지 않는다. selected Profile/Session 전환 때 각 actor의
  기본 Profile 정보·콘텐츠 상태·Block 목록을 해당 actor 결과로 격리하며 Unblock 때 제거된 Follow Request·Follow Relationship을 optimistic 복구하지 않는다.
- 저장·정책(`PROD-821`·`PROD-822`)과 전체 E2E/archive(`PROD-813`)의 책임을 이 그룹으로 옮기지 않는다.

**Verification**

- confirmation 취소, pending 중복/dismiss, 성공·실패·retry와 기존 레거시 Profile·Settings UI의 action/state를 app component 또는 E2E로 검증한다.
- Settings의 분리된 Block 목록에서 loading/error·retry/empty/pagination·unblock과 다른 Target 상태 보존을 검증한다.
- selected Profile A/B와 Session 전환에서 actor별 상태 격리·서버 결과 수렴·optimistic state isolation 및 Block 성공 후 기본 Profile 정보,
  viewer 방향 콘텐츠 상태와 이미 표시 중인 Home·Local·Hashtag timeline·Profile Post List·Notification client 상태의 surface별 갱신을 검증한다.
- 새로고침·직접 링크 진입에서 API의 현재 Owner 결과로 identity-free `blocking`·정확한 관계 ID의 해제를 제공하고, 상대에게만 차단된 경우
  actionless `blockedBy`를 표시한다. 이전 Profile cache 없이 검증하며 A/B 전환 뒤 이전 해제 ID를 재사용하지 않는다.
- Web 1024/1440·Mobile 390 Light/Dark, keyboard/보조 기술, Web Escape·Native back·focus 복원과 실제 Web/iOS/Android presentation evidence를
  실행 환경별로 기록한다.

- [ ] 3.1 기존 공용 confirmation을 Profile mutation 상태에 연결해 취소·pending·실패·retry와 direct Profile route의 경고·콘텐츠 상태를 구현한다.
- [ ] 3.2 Settings에 Mute와 분리된 Block 관리 destination·목록 상태·pagination·unblock action을 연결한다.
- [ ] 3.3 selected Local Profile actor 경계 안에서 Block/Unblock 성공·실패 결과에 따라 관리 목록과 표시 중 기본 Profile 정보·viewer 방향
      콘텐츠 상태·Home/Local/Hashtag timeline·Profile Post List·Notification client 상태를 각 surface 서버 정책에 맞게 수렴시키고, 직접 route 진입·새로고침의
      identity-free 상태와 정확한 해제 관계를 연결한다.
- [ ] 3.4 접근성·viewport·Web/Native direct route presentation regression과 actor 전환·Unblock no-restore를 검증하고 `PROD-917` 후속 UI
      교체 경계를 유지한다.

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
- Local·Remote Target, 양쪽 직접 조회·현재 구현된 list/search·새 interaction, Follow/직접 원인 Notification cleanup, 기존 Reaction·Repost/Bookmark 보존,
  Follow 관계 Unblock 비복구와 Profile 전환 isolation을 한 완료 흐름으로 검증한다.
- `PROD-327`의 현재 Notification source 신규 생성 suppression, `PROD-818`의 ActivityPub Block/Undo, `PROD-328`의 async physical cleanup은 이 change의
  구현·완료 증거가 아니다.
- `PROD-861` Storybook/presentation 결과를 API·cache·Native runtime 완료 증거로 일반화하지 않는다. 환경별 실제 증거와 미검증 범위를 분리 기록한다.
- 미구현 Hashtag Post List·Post 검색은 공통 정책 검증 결과와 실제 API 미실행을 구분해 기록한다. 검증 시점에 endpoint가 이미 제공되면 실제 공개 결과로 검증하며,
archive 이후 추가되는 endpoint의 연결·검증은 해당 기능 이슈가 소유한다. 미래 endpoint를 기다리기 위해 이 change를 미완료로 유지하거나 다시 열지 않는다.
- 모든 declared task와 required validation, canonical·Linear 정합성이 완료되기 전에는 archive하지 않는다.

**Verification**

- Local/Remote Target 각각의 block·unblock, 기존 Profile identity 조회, Owner → Target과 Target → Owner의 Post/Media direct 정책, Profile Post List viewer
  방향 정책, 양방향 Follow 후보·Home/Local/Hashtag Post list·Post search·새 interaction·Notification과 cleanup/no-restore를 Web/API cross-slice E2E로 검증한다.
- Local/Remote Target 각각의 block·unblock, 양방향 Profile/Post/Media/Follow 후보, 현재 구현된 Post list/search, 새 interaction rejection과 cleanup/no-restore를
  Web/API cross-slice E2E로 검증한다.
- 이전 cache 없는 직접 Profile 진입·새로고침·actor 전환에서 identity-free 화면과 Owner 해제 ID의 API·UI 연결을 확인한다.
- 아직 없는 Hashtag Post List·Post 검색은 2.10의 공통 후보 정책 실행 결과와 실제 endpoint 미실행 기록을 완료 증거로 확인한다.
- Web·iOS·Android와 접근성 실행 결과를 플랫폼별로 기록하고, 구현하지 않은 ActivityPub·Notification source·async cleanup 범위를 별도로 확인한다.
- 최신 Linear 본문·관계·댓글과 canonical domain/design 문서를 다시 읽어 requirement provenance·소유권·실행 순서를 대조한다.
- `openspec validate add-profile-block --strict`, Prettier 검사와 `git diff --check`를 통과한 뒤에만 archive gate를 진행한다.

- [ ] 4.1 `PROD-821`·`PROD-822`·`PROD-823` 결과를 연결한 Local/Remote block·unblock 및 Profile identity, directional direct content/Profile Post List,
      bilateral Home/Local/Hashtag list·search/interaction/Notification/cleanup cross-slice E2E를 실행하고, 미구현 Hashtag Post List·Post 검색의 공통 정책 검증 결과를 확인한다.
- [ ] 4.2 cross-slice UI/API 결과와 selected Profile actor 상태 격리, 기본 Profile 정보·viewer 방향 콘텐츠 상태, 보존·비복구 및 `PROD-917` 후속
      범위 경계와 직접 route 진입·새로고침의 identity-free 상태 및 정확한 해제 ID를 플랫폼별 evidence로 기록한다.
- [ ] 4.3 최신 canonical·Linear·OpenSpec 정합성을 확인하고 strict validation·Prettier·diff 검증과 모든 task 완료 뒤 `add-profile-block`을 archive한다.
