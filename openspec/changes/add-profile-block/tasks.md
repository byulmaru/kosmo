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

OpenSpec Gate 승인 뒤, Local 또는 Remote Owner가 Local 또는 Remote Target을 차단·해제할 수 있는 additive Profile Block
관계와 durable cleanup orchestration을 구현한다. Block policy/admission을 적용하고 이번 실행이 포착한 양방향 Follow Request·Follow Relationship과
직접 원인 Follow Notification을 required cleanup으로 정리하며, 필수 cleanup 완료 전에는 Block action을 성공으로 확정하지 않는다. 이미 진입한 Follow
transition이 cleanup 뒤 관계를 남길 수 있으므로, Unblock은 현재 남아 있는 양방향 Follow/Request와 그 직접 원인 Notification을 정리한 뒤 Block을 제거하며
삭제된 관계를 복구하지 않는다.

**Guardrails**

- Owner → Target 방향의 단일 관계, 생성 시각, Owner/Target uniqueness·referential integrity·self-block 불변식과 no-backfill를 유지하고 별도
  lifecycle state·expiry·복제 속성을 추가하지 않는다.
- 도메인 capability에 특정 Account·Membership·Local 상태를 일반 Owner 조건으로 추가하지 않는다. GraphQL selected Local actor admission은
  `PROD-822`의 ingress 경계다.
- profile-block requirement의 captured cleanup·success gate·relaxed overlap을 준수하고, 기존 Reaction은 이번 action에서 변경하지 않는다.
- required cleanup 완료 전 성공 응답을 반환하지 않으며, 일시 오류·worker 재시작 시 이미 처리한 effect를 중복 적용하지 않는다.
- 기존 Reaction·Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification·Read State는 보존하고, Unblock은 profile-block requirement의 cleanup/no-restore
  순서를 준수한다.
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

- [ ] 1.1 OpenSpec Gate 승인 후 Profile Block의 additive 저장 관계와 Owner/Target·생성 시각·uniqueness·referential integrity·self-block 불변식을 구현한다.
- [ ] 1.2 Block policy/admission 뒤 durable cleanup orchestration을 시작하고 양방향 Follow Request·Follow Relationship과 직접 원인 Follow Notification의 required cleanup을 연결한다.
- [ ] 1.3 profile-block requirement의 durable cleanup·success gate·Reaction 보존·Unblock no-restore를 구현한다.
- [ ] 1.4 migration·관계 불변식·restart/retry·성공 gate·보존·Owner scope를 검증하는 자동화 회귀와 공개 계약 정합성 검증을 추가한다.

## 2. PROD-822 — Profile Block 정책과 GraphQL 경계

**Authority / Provenance**

- `docs/domain/objects/profile-block.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/notification.md`
- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0004-review-consistency-clarifications.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `PROD-822`

**Deliverable**

`PROD-821`의 저장 관계를 사용하는 공통 Profile Block policy와 selected Local Profile actor 기반 GraphQL mutation·Owner 관리
connection을 제공한다. Profile/Post/Media/Follow 후보·Home/Local/Profile/Hashtag Post List·search·기존 Notification과 새 로컬
interaction이 같은 정책을 소비하게 한다.

**Guardrails**

- 저장 방향과 무관하게 양쪽 viewer/target을 blocked로 판정하고, 직접 조회·후보·Post list/search는 후보 반환 전에 Exclude한다. Repost는 Author와
  Source Post Author를 모두 검사한다.
- Active Block은 cleanup 뒤 남은 Follow Request·Follow Relationship의 물리적 존재보다 우선하며, Follow·Reply·Reaction·Repost의 새 로컬 입력은 양쪽에서
  거부한다. page limit 뒤 client filter나 resolver별 정책 복제를 보안 경계로 사용하지 않는다.
- 기존 unavailable Notification은 connection·Unread count·Node·read 처리에서 숨기되, `PROD-821`의 직접 원인 삭제 이외의 기존 Notification을
  동기 삭제하거나 Read State를 바꾸지 않는다.
- 현재 source 신규 Notification 생성 suppression은 `PROD-327`, 비동기 물리 cleanup은 `PROD-328`에 남기며 이 그룹의 task·완료 증거로 삼지 않는다.
- GraphQL ingress는 검증된 Session의 selected Local Profile actor 및 Owner scope를 사용하고, request-specific DB actor state나 client-only filter로
  중앙 application policy를 대체하지 않는다. remote ActivityPub ingress는 `PROD-818`에 남긴다.
- 저장 durable cleanup(`PROD-821`), UI/Relay(`PROD-823`)와 최종 cross-slice E2E/archive(`PROD-813`)를 이 그룹에서 재구현하지 않는다.

**Verification**

- 양쪽 요청 방향의 Profile Node·exact/partial search·Post·Media·Follow 후보와 Home/Local/Profile/Hashtag list·Post search에서 Author/Source
  Author Exclude 및 cursor 전 필터링을 검증한다.
- cleanup 뒤 남은 Follow Request·Follow Relationship의 비활성·비노출, 양쪽의 새 Follow·Reply·Reaction·Repost 거부와 기존 Post Visibility·Local PUBLIC
  eligibility 공존을 자동화된 정책·상호작용 회귀로 검증한다.
- selected Local Profile A/B, guest·membership mismatch와 arbitrary actor ID를 GraphQL mutation·Owner connection·Node/loader에서 검증한다.
- 차단으로 unavailable인 기존 Notification의 connection·Unread count·Node·read 숨김과 직접 원인 Follow Notification 정리 경계를 검증한다.

- [ ] 2.1 `PROD-821` relation을 양방향으로 평가하고 cleanup 뒤 남은 Follow Request·Follow Relationship보다 우선하는 공통 visibility policy를 Profile/Post/Media
      직접 조회, Follow 후보, Post list/search consumer에 연결한다.
- [ ] 2.2 Block 확정 뒤 새 Follow commit과 Reply·Reaction·Repost 입력이 공통 Profile Block policy를 통과하지 못하도록 하고 Author·Source Author 및 cursor 전
      Exclude를 구현한다.
- [ ] 2.3 selected Local Profile actor와 Owner scope를 사용하는 Profile Block 생성·해제 mutation과 Owner 관리 connection/Node 경계를 GraphQL에 추가한다.
- [ ] 2.4 기존 unavailable Notification의 list·Unread·Node·read 가시성 policy를 연결하고 source 신규 생성 suppression이나 async cleanup은 추가하지 않는다.
- [ ] 2.5 양방향 policy·interaction rejection·GraphQL actor isolation·Post List consumer·Notification visibility를 검증하는 자동화된 정책·공개 계약 회귀를
      통과시킨다.

## 3. PROD-823 — Profile Block UI·Relay 관리 흐름

**Authority / Provenance**

- `docs/design/profile-mute-block.md`
- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `PROD-823`
- `DSN-51`
- `DSN-53`
- presentation prerequisite evidence `PROD-861` (정본 아님)

**Deliverable**

`PROD-822`의 서버 확정 상태와 최신 canonical이 승인한 identity-free `blocking`·`blockedBy` route presentation을 소비해 Profile Block
confirmation·pending·실패·retry, Mute와 분리된 관리 목록과 selected Profile별 client 상태 수렴을 제공한다. presentation 결정·이관 자체는 이
change가 소유하지 않으며 보호된 Profile·Post·Media·Notification 데이터를 UI가 복구하지 않는다.

**Guardrails**

- 최신 canonical이 승인한 identity-free `blocking`·`blockedBy` route presentation을 소비한다. `PROD-861`은 공용 presentation 선행 구현 증거로만
  참고하며 presentation 결정·이관 자체를 이 그룹에서 구현하거나 완료 조건으로 다시 소유하지 않는다.
- Block과 Mute는 별도 Settings destination으로 유지하고, Block 목록의 loading/error·retry/empty/pagination·unblock 상태를 소유한다. 차단된 상세
  데이터를 재조회하지 않는다.
- 기존 Button·ActionMenu·ModalSheet·Toast·SettingsItem과 canonical 접근성·viewport 계약을 재사용하고 새 범용 safety component·Settings shell을
  만들지 않는다.
- 성공은 서버 확정 결과로 client 상태를 수렴하고 실패 시 optimistic Block을 확정하지 않는다. selected Profile/Session 전환 때 다른 Owner의
  Block 상태를 재사용하지 않으며 Unblock 때 제거된 Follow Request·Follow Relationship을 optimistic 복구하지 않는다.
- 저장·정책(`PROD-821`·`PROD-822`)과 전체 E2E/archive(`PROD-813`)의 책임을 이 그룹으로 옮기지 않는다.

**Verification**

- confirmation 취소, pending 중복/dismiss, 성공·실패·retry와 공용 presentation의 action/state를 app component/Storybook 또는 E2E로 검증한다.
- Settings의 분리된 Block 목록에서 loading/error·retry/empty/pagination·unblock과 다른 Target 상태 보존을 검증한다.
- selected Profile A/B와 Session 전환에서 actor별 상태 격리·서버 결과 수렴·optimistic state isolation 및 Block 성공 후 보호된 Profile/Post/Notification
  hide를 검증한다.
- Web 1024/1440·Mobile 390 Light/Dark, keyboard/보조 기술, Web Escape·Native back·focus 복원과 실제 Web/iOS/Android presentation evidence를
  실행 환경별로 기록한다.

- [ ] 3.1 승인된 공용 confirmation을 Profile mutation 상태에 연결해 취소·pending·실패·retry와 보호된 데이터 비복구를 구현한다.
- [ ] 3.2 Settings에 Mute와 분리된 Block 관리 destination·목록 상태·pagination·unblock action을 연결한다.
- [ ] 3.3 selected Local Profile actor 경계 안에서 Block/Unblock 성공·실패 결과에 따라 관리 목록과 표시 중 Profile·Post·Notification 상태를
      서버 정책에 맞게 수렴시킨다.
- [ ] 3.4 접근성·viewport·Web/Native presentation regression과 actor 전환·Unblock no-restore 검증을 추가하고 통과시킨다.

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

**Deliverable**

`PROD-821` → `PROD-822` → `PROD-823` 결과를 Local·Remote Target과 selected Profile 흐름에 연결해 차단·해제의 cross-slice
E2E를 완료하고, 최신 canonical·Linear·OpenSpec을 동기화한 뒤 모든 task와 validation이 완료된 경우에만 전체 change를 archive한다.

**Guardrails**

- Local·Remote Target, 양쪽 직접 조회·list/search·새 interaction, Follow/직접 원인 Notification cleanup, 기존 Reaction·Repost/Bookmark 보존,
  Follow 관계 Unblock 비복구와 Profile 전환 isolation을 한 완료 흐름으로 검증한다.
- `PROD-327`의 현재 Notification source 신규 생성 suppression, `PROD-818`의 ActivityPub Block/Undo, `PROD-328`의 async physical cleanup은 이 change의
  구현·완료 증거가 아니다.
- `PROD-861` Storybook/presentation 결과를 API·cache·Native runtime 완료 증거로 일반화하지 않는다. 환경별 실제 증거와 미검증 범위를 분리 기록한다.
- 모든 declared task와 required validation, canonical·Linear 정합성이 완료되기 전에는 archive하지 않는다.

**Verification**

- Local/Remote Target 각각의 block·unblock, 양방향 Profile/Post/Media/Follow 후보, Post list/search, 새 interaction rejection과 cleanup/no-restore를
  Web/API cross-slice E2E로 검증한다.
- Web·iOS·Android와 접근성 실행 결과를 플랫폼별로 기록하고, 구현하지 않은 ActivityPub·Notification source·async cleanup 범위를 별도로 확인한다.
- 최신 Linear 본문·관계·댓글과 canonical domain/design 문서를 다시 읽어 requirement provenance·소유권·실행 순서를 대조한다.
- `openspec validate add-profile-block --strict`, Prettier 검사와 `git diff --check`를 통과한 뒤에만 archive gate를 진행한다.

- [ ] 4.1 `PROD-821`·`PROD-822`·`PROD-823` 결과를 연결한 Local/Remote block·unblock 및 direct/list/search/interaction/cleanup cross-slice E2E를 실행한다.
- [ ] 4.2 cross-slice UI/API 결과와 selected Profile actor 상태 격리, 보존·비복구 및 후속 범위 경계를 플랫폼별 evidence로 기록한다.
- [ ] 4.3 최신 canonical·Linear·OpenSpec 정합성을 확인하고 strict validation·Prettier·diff 검증과 모든 task 완료 뒤 `add-profile-block`을 archive한다.
