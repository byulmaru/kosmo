## 1. PROD-821 — Profile Block 저장과 원자적 관계 정리

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

OpenSpec Gate 승인 뒤, Active/Normal Local Owner가 Local 또는 Remote Target을 차단·해제할 수 있고 Profile Block
저장과 차단 생성 시 필요한 관계·Reaction·직접 원인 Follow Notification 정리가 하나의 원자적 경계에서 동작한다.

**Guardrails**

- Owner → Target 방향의 단일 관계, `createdAt`, Owner/Target unique·foreign-key·self-block 불변식을 유지하고 별도 state·expiry·복제 column과 기존 row backfill을 추가하지 않는다.
- Block row, 양방향 Follow Request·Follow Relationship, Target의 Owner Post Reaction, 제거된 Follow 객체의 직접 원인 Notification은 같은 commit/rollback 경계에 둔다.
- Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification·Read State는 보존하고, Unblock은 제거된 Follow·Reaction을 복구하지 않는다.
- 이 그룹은 조회/interaction policy·GraphQL(`PROD-822`), UI/Relay(`PROD-823`), 전체 E2E·archive(`PROD-813`)를 구현하지 않는다.
- 현재 Notification source 신규 생성 suppression(`PROD-327`), ActivityPub Block/Undo(`PROD-818`), 비동기 물리 cleanup(`PROD-328`)을 추가하지 않는다.

**Verification**

- 기존 Profile·Follow·Reaction·Notification·Post row를 보존하는 additive migration과 unique·foreign-key·self-block 제약 및 schema 검증을 수행한다.
- Local/Remote Target, Active Account·Membership·Local Owner 권한, duplicate/self/권한 없는 해제의 Core 또는 DB-backed test를 수행한다.
- 성공 transaction에서 양방향 관계·Target Reaction·직접 원인 Follow Notification만 정리되고 Repost·Bookmark·기타 Notification이 보존되는지 확인한다.
- Block insert 또는 정리 statement 실패 시 전체 rollback과 Unblock no-restore를 DB-backed regression으로 확인한다.

- [ ] 1.1 OpenSpec Gate 승인 후 Profile Block의 additive 저장 관계와 Owner/Target·createdAt·unique·foreign-key·self-block 불변식을 구현한다.
- [ ] 1.2 Active Account의 유효한 Membership과 Active/Normal Local Owner 경계에서 Block 생성·Owner 전용 해제를 구현한다.
- [ ] 1.3 Block 생성 transaction에서 양방향 Follow Request·Follow Relationship, Target의 Owner Post Reaction과 직접 원인 Follow Notification을 함께 정리하고 보존·비복구 규칙을 적용한다.
- [ ] 1.4 migration·authorization·성공/실패 원자성·보존·Unblock no-restore를 검증하는 Core/DB-backed test와 schema check를 추가한다.

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

`PROD-821`의 저장 관계를 사용하는 공통 Profile Block policy와 selected Profile actor 기반 GraphQL mutation·Owner
관리 connection을 제공하고, Profile/Post/Media/Follow 후보·Post list/search·기존 Notification과 새 로컬 interaction에
같은 정책을 적용한다.

**Guardrails**

- 저장 방향과 무관하게 양쪽 viewer/target을 blocked로 판정하고, 직접 조회·후보·Post list/search는 후보 반환 전에 Exclude한다. Repost는 Author와 Source Post Author를 모두 검사한다.
- Follow·Reply·Reaction·Repost의 새 로컬 입력은 양쪽에서 거부하며, page limit 뒤 client filter나 resolver별 정책 복제를 보안 경계로 사용하지 않는다.
- 기존 unavailable Notification은 connection·Unread count·Node·read 처리에서 숨기되, `PROD-821`의 직접 원인 삭제 이외의 기존 Notification을 동기 삭제하거나 Read State를 바꾸지 않는다.
- 현재 source 신규 Notification 생성 suppression은 `PROD-327`, 비동기 물리 cleanup은 `PROD-328`에 남기며 이 그룹의 task·완료 증거로 삼지 않는다.
- GraphQL은 검증된 Session의 Active Account와 selected Profile actor 및 Owner scope를 사용하고, DB actor GUC·operation 전용 session·client-only filter로 권한을 대체하지 않는다.
- 저장 transaction(`PROD-821`), UI/Relay(`PROD-823`)와 최종 cross-slice E2E/archive(`PROD-813`)를 이 그룹에서 재구현하지 않는다.

**Verification**

- 양쪽 요청 방향의 Profile Node·exact/partial search·Post·Media·Follow 후보와 Home/Local/Profile/Hashtag list·Post search에서 Author/Source Author Exclude 및 cursor 전 필터링을 검증한다.
- 양쪽의 새 Follow·Reply·Reaction·Repost 거부와 기존 Post Visibility·Local PUBLIC eligibility 공존을 API/Core integration test로 검증한다.
- selected Profile A/B, guest·membership mismatch와 arbitrary actor ID를 GraphQL mutation·Owner connection·Node/loader에서 검증한다.
- 차단으로 unavailable인 기존 Notification의 connection·Unread count·Node·read 숨김과 직접 원인 Follow Notification 정리 경계를 검증한다.

- [ ] 2.1 `PROD-821` relation을 양방향으로 평가하는 공통 visibility policy를 Profile/Post/Media 직접 조회, Follow 후보, Post list/search consumer에 연결한다.
- [ ] 2.2 새 Follow·Reply·Reaction·Repost 입력이 공통 Profile Block policy를 통과하지 못하도록 하고 Author·Source Author 및 cursor 전 Exclude를 구현한다.
- [ ] 2.3 selected Profile actor와 Owner scope를 사용하는 Profile Block 생성·해제 mutation과 Owner 관리 connection/Node 경계를 GraphQL에 추가한다.
- [ ] 2.4 기존 unavailable Notification의 list·Unread·Node·read 가시성 policy를 연결하고 source 신규 생성 suppression이나 async cleanup은 추가하지 않는다.
- [ ] 2.5 양방향 policy·interaction rejection·GraphQL auth/actor isolation·Notification visibility를 검증하는 API/Core integration test와 schema check를 통과시킨다.

## 3. PROD-823 — Profile Block UI·Relay 관리 흐름

**Authority / Provenance**

- `docs/design/profile-mute-block.md`
- `docs/design/settings.md`
- `docs/design/profile-hero.md`
- `docs/design/accessibility.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `DSN-53`
- `PROD-823`

**Deliverable**

`PROD-822`의 서버 확정 상태와 DSN-53의 공용 presentation을 소비해 Profile Block 확인·pending·실패·retry, 별도
관리 목록, `blocking`/`blockedBy` 최소 Profile shell과 selected Profile별 Relay/cache 수렴을 제공한다.

**Guardrails**

- `PROD-861`은 공용 presentation 선행 구현 증거로만 소비하며 그 이관 자체를 이 그룹에서 구현하거나 완료 조건으로 다시 소유하지 않는다.
- Block과 Mute는 별도 Settings destination으로 유지하고, `blocking`은 `차단한 프로필입니다`·`차단 해제`, `blockedBy`는 `이 프로필을 볼 수 없습니다`만 제공한다. blockedBy에서 최신 상세·수치·Post·Media·Follow·Message를 재조회하지 않는다.
- 기존 Button·ActionMenu·ModalSheet·Toast·Settings/Profile shell과 canonical 접근성·viewport 계약을 재사용하고 새 범용 safety component·Settings shell을 만들지 않는다.
- 성공은 서버 확정 결과로 cache를 수렴하고 실패 시 optimistic Block을 확정하지 않는다. selected Profile/Session 전환 때 다른 Owner의 Store·connection·cursor를 재사용하지 않으며 Unblock 때 Follow·Reaction을 optimistic 복구하지 않는다.
- 저장·정책(`PROD-821`·`PROD-822`)과 전체 E2E/archive(`PROD-813`)의 책임을 이 그룹으로 옮기지 않는다.

**Verification**

- confirmation 취소, pending 중복/dismiss, 성공·실패·retry와 blocking/blockedBy copy·action을 app component/Storybook 또는 E2E로 검증한다.
- Settings의 분리된 Block 목록에서 loading/error·retry/empty/pagination·unblock과 다른 Target 상태 보존을 검증한다.
- selected Profile A/B와 Session 전환에서 Relay Environment/Store·connection·cursor·optimistic state isolation 및 Block 성공 후 Profile/Post/Notification hide를 검증한다.
- Web 1024/1440·Mobile 390 Light/Dark, keyboard/보조 기술, Web Escape·Native back·focus 복원과 실제 Web/iOS/Android presentation evidence를 실행 환경별로 기록한다.

- [ ] 3.1 공용 confirmation과 Profile route의 pending·실패·retry·`blocking`/`blockedBy` 최소 shell을 서버 mutation 상태와 연결한다.
- [ ] 3.2 Settings에 Mute와 분리된 Block 관리 destination·목록 상태·pagination·unblock action을 연결한다.
- [ ] 3.3 selected Profile actor 경계 안에서 Block/Unblock 성공·실패 payload에 따라 관리 connection과 표시 중 Profile·Post·Notification cache를 수렴시킨다.
- [ ] 3.4 접근성·viewport·Web/Native presentation regression과 actor 전환·Unblock no-restore 검증을 추가하고 통과시킨다.

## 4. PROD-813 — Local Timeline 포함 cross-slice E2E·canonical sync·archive

**Authority / Provenance**

- `docs/domain/objects/profile-block.md`
- `docs/domain/objects/notification.md`
- `docs/domain/policies/post-list.md`
- `docs/design/local-timeline.md`
- `docs/design/profile-mute-block.md`
- `memory/issue-openspec-workflow.md`
- `PROD-649` 완료 계약
- `PROD-821`
- `PROD-822`
- `PROD-823`
- `PROD-813` 최신 본문·댓글

**Deliverable**

`PROD-821` → `PROD-822` → `PROD-823` 결과를 Local·Remote Target과 selected Profile 흐름에 연결해 차단·해제의
cross-slice E2E와 Local Timeline 회귀를 완료하고, 최신 canonical·Linear·OpenSpec을 동기화한 뒤 전체 change를 archive한다.

**Guardrails**

- 완료된 `PROD-649`의 configured Local Instance PUBLIC eligible 후보·정렬·immutable cursor·selected Profile actor 격리를 유지하고, Block Author와 Repost Source Author만 공통 policy로 후보에서 Exclude한다. `PROD-649`를 Block 구현 선행 blocker로 되돌리지 않는다.
- Local/Remote Target, 양쪽 직접 조회·list/search·새 interaction, Follow/Reaction/직접 원인 Notification cleanup, Repost/Bookmark 보존·Unblock 비복구와 Profile 전환 isolation을 한 완료 흐름으로 검증한다.
- `PROD-327`의 현재 Notification source 신규 생성 suppression, `PROD-818`의 ActivityPub Block/Undo, `PROD-328`의 async physical cleanup은 이 change의 구현·완료 증거가 아니다.
- `PROD-861` Storybook/presentation 결과를 API·cache·Native runtime 완료 증거로 일반화하지 않는다. 환경별 실제 증거와 미검증 범위를 분리 기록한다.
- 모든 declared task와 required validation, canonical·Linear 정합성이 완료되기 전에는 archive하지 않는다.

**Verification**

- Local/Remote Target 각각의 block·unblock, 양방향 Profile/Post/Media/Follow 후보, Post list/search, 새 interaction rejection과 cleanup/no-restore를 Web/API cross-slice E2E로 검증한다.
- 완료된 Local Timeline에서 Block Author·Repost Source Author Exclude, 차단되지 않은 PUBLIC eligible Post의 immutable cursor pagination, selected Profile A/B isolation을 검증한다.
- Web·iOS·Android와 접근성 실행 결과를 플랫폼별로 기록하고, 구현하지 않은 ActivityPub·Notification source·async cleanup 범위를 별도로 확인한다.
- 최신 Linear 본문·관계·댓글과 canonical domain/design 문서를 다시 읽어 requirement provenance·소유권·실행 순서를 대조한다.
- `openspec validate add-profile-block --strict`, Prettier 검사와 `git diff --check`를 통과한 뒤에만 archive gate를 진행한다.

- [ ] 4.1 `PROD-821`·`PROD-822`·`PROD-823` 결과를 연결한 Local/Remote block·unblock 및 direct/list/search/interaction/cleanup cross-slice E2E를 실행한다.
- [ ] 4.2 완료된 `PROD-649` Local Timeline에 Author·Source Author Block Exclude와 PUBLIC·cursor·selected Profile 회귀 검증을 추가한다.
- [ ] 4.3 Web·iOS·Android·접근성 runtime evidence와 미검증·제외 범위를 환경별로 기록하고 Profile 전환/cache isolation을 확인한다.
- [ ] 4.4 최신 canonical·Linear·OpenSpec 정합성을 확인하고 strict validation·Prettier·diff 검증과 모든 task 완료 뒤 `add-profile-block`을 archive한다.
