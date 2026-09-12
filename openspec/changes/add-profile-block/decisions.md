## Context

이 기록은 이미 정해진 Profile Block 도메인 계약을 `PROD-821`·`PROD-822`·`PROD-823`·`PROD-813`의 순차 구현과
하나의 최종 lifecycle로 연결한다. `PROD-821`이 저장·durable cleanup과 shared change를 열고, `PROD-822`가
#770의 정책·스펙과 후속 `PROD-822-graphql`·`PROD-822-policy` 두 구현 layer를 소유하며, `PROD-823`이 UI·client 상태,
`PROD-813`이 cross-slice E2E·canonical sync·archive를 소유한다. OpenSpec 파일
작성만을 결과로 하는 별도 이슈는 만들지 않는다.

## Decision Records

현재 결정 기록은 15개이며 모두 `Active`다. 아래에 각 기록의 authority와 follow-up owner를 명시한다.

### 하나의 shared change가 공통 invariant와 최종 lifecycle을 소유한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `memory/issue-openspec-workflow.md`, `docs/domain/objects/profile-block.md`, `PROD-821`, `PROD-822`, `PROD-823`, `PROD-813`
- Status: Active
- Context / Problem: 구현 이슈마다 OpenSpec을 복제하거나 OpenSpec 전용 이슈를 따로 만들면 같은 Profile Block invariant가 갈라지고, 개별 slice 완료를 전체 완료·archive로 오인할 수 있다.
- Decision Outcome: `add-profile-block` 하나가 저장·정책·UI·통합 검증의 공통 행동 계약을 소유한다. 최초로 새 저장 계약을 여는 `PROD-821`이 artifact와 저장·durable cleanup task를 열고, `PROD-822`는 #770 정책·스펙 뒤에 `PROD-822-graphql` 관리 API layer와 그 자식 `PROD-822-policy` 실행 정책 layer를 순차적으로 갱신하며, `PROD-823`은 같은 change의 UI·client 상태를, `PROD-813`은 네 slice의 cross-slice 검증·canonical sync와 최종 archive를 소유한다. 이 change는 OpenSpec 파일 작성 자체를 독립 deliverable로 만들지 않는다.
- Alternatives Considered: 이슈마다 change를 하나씩 복제하면 visibility·cleanup·archive 조건이 중복되고 서로 다른 계약으로 drift한다. 모든 이슈를 하나의 구현 task로 합치면 authority와 독립 완료 조건을 잃는다. 둘 다 현재 이슈의 책임 경계와 맞지 않아 채택하지 않는다.
- Consequences: 네 이슈는 각자의 deliverable만 수행하지만 같은 delta와 decision을 갱신해야 한다. 한 slice가 완료되어도 `PROD-813`의 통합 검증과 archive 전까지 change는 active로 남는다.
- Confirmation / Follow-up: `tasks.md`의 이슈별 Deliverable·Guardrails·Verification을 순서대로 실행하고, `PROD-813`에서 Linear·canonical·OpenSpec 상태를 함께 확인한다.

### Profile Block은 Local·Remote Owner를 허용하는 방향성 저장 관계다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `PROD-821`, `PROD-822`
- Status: Active
- Context / Problem: 저장 방향과 ingress별 actor 경계를 혼동하면 Target이 관계를 관리하거나 Local·Remote 조합마다 별도 모델을 만들게 된다.
- Decision Outcome: Profile Block은 Owner Profile → Target Profile 방향의 존재 관계로 저장하고 `createdAt`과 Owner/Target 조합 unique 불변식만 보존한다. Owner는 Local 또는 Remote일 수 있고, 도메인 capability는 Account·Membership·Local 상태를 일반 생성 조건으로 고정하지 않는다. 관계 조회와 관리 목록은 Owner scope에 한정한다. 현재 GraphQL ingress의 selected Local Profile actor 경계는 GraphQL slice에만 적용하며 remote ActivityPub ingress는 `PROD-818`에 남긴다.
- Alternatives Considered: 양방향 row를 두 개 저장하면 실제 행위 주체와 중복 lifecycle이 생긴다. Target도 해제할 수 있게 하면 `ProfileBlock.Owner` 권한이 무너진다. 관계 상태·expiry를 추가하면 존재 자체가 active 차단이라는 canonical 계약을 확장한다.
- Consequences: 같은 Owner/Target pair는 하나의 row로 식별되고 차단 적용의 양방향성은 저장 중복이 아니라 공통 policy에서 계산한다. Remote ingress·delivery의 구체 계약은 이 change가 결정하지 않는다.
- Confirmation / Follow-up: `PROD-821`에서 Local·Remote pair, duplicate/self 및 Owner scope를 확인하고, `PROD-822`에서 selected Local GraphQL actor와 Owner-only connection을 검증한다.

### Profile Block cleanup은 required 결과를 보장하는 durable orchestration이다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-821`
- Status: Active
- Context / Problem: Block row와 Follow·Notification 정리를 한 로컬 commit에만 묶으면 worker 재시작·retry에서 durable completion을 보장할 수 없다.
- Decision Outcome: Block policy/admission 뒤 Profile Block 생성은 이번 실행이 포착한 양방향 Follow Request·Follow Relationship removal, pending request cleanup과 직접 원인 Follow Notification cleanup을 durable orchestration으로 수행한다. required cleanup 완료 전에는 Block action을 성공으로 확정하지 않는다. 이미 진입한 Follow transition이 cleanup 뒤 Follow/Request 또는 그 직접 원인 Notification을 남길 수 있지만 Active Block 동안 공통 정책에서 inactive/invisible로 취급한다. Unblock은 현재 남아 있는 양방향 Follow/Request와 그 직접 원인 Notification을 정리한 뒤 Profile Block을 제거하며, 차단 생성 때 제거된 Follow Request·Follow Relationship을 복구하지 않는다. 기존 Reaction·Repost·Bookmark와 비직접 원인 기존 Notification·Read State는 이번 action에서 변경하지 않는다.
- Alternatives Considered: 로컬 commit만 성공으로 확정하면 cleanup이 남은 부분 성공을 관찰할 수 있다. 필요한 결과를 보장하는 다른 durable composition은 허용되며, 구체 Workflow·transaction·query·helper topology는 구현 중 선택한다. Repost·Bookmark나 기존 Reaction까지 변경하거나 Unblock 때 Follow 관계를 복구하면 현재 보존 계약을 위반한다.
- Consequences: `PROD-821`은 required cleanup success gate, 양방향 pending/relationship, direct-cause Notification과 restart/retry idempotency를 검증한다. 기존 lifecycle과 어떻게 조합할지, 어떤 runtime 경계를 사용할지는 구현 PR의 선택으로 남긴다.
- Confirmation / Follow-up: `PROD-821`에서 required cleanup success gate, 양방향 pending/relationship, direct-cause Notification과 restart/retry를 검증하고 Reaction을 변경하지 않는지 확인한다.

### Profile Block은 surface별 정책을 저장 방향과 함께 적용한다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`
- Status: Active
- Context / Problem: Owner → Target row만 확인하면 Target이 Owner의 Profile·Post를 계속 조회하거나 상호작용할 수 있고, surface별 client filter는 page·Node·mutation에서 우회된다.
- Decision Outcome: 저장된 Owner → Target row는 Profile Block pair를 양쪽 viewer 방향으로 평가하는 공통 관계 판정에 사용한다. GraphQL `node(id:)`·`profileByHandle` 직접 조회는 기존 lifecycle·membership·공개 조회 정책을 적용해 기본 정보를 유지하고, 유효한 Account에 selected Profile이 있으면 그 Profile을 viewer로 사용해 GraphQL `searchProfiles`의 exact-match·partial-match 후보에서 양방향 Active Block 관계인 후보를 pagination·cursor·limit 전에 제외한다. selected Profile이 없으면 기존 Account 인증과 공개 후보 결과를 유지하며 Profile Block predicate나 selected Local Profile을 새로 요구하지 않는다. 임의 입력 actor나 이전 selected Profile·client cache를 viewer로 재사용하지 않는다. Post·Media와 목록·상호작용·Notification은 각 surface의 방향별 또는 양방향 정책을 적용한다.
- Alternatives Considered: Owner 방향만 검사하면 차단을 unilateral visibility로 잘못 해석한다. 각 resolver나 앱 화면에서 predicate를 복제하면 surface 누락과 actor별 불일치가 생긴다. page limit 뒤 client filter는 cursor와 보안 결과를 깨뜨린다.
- Consequences: Profile·Post spec은 각 surface의 구체적인 Exclude/interaction 결과를, 이 결정은 대칭 predicate와 consumer 원칙을 소유한다. 기존 Post Visibility·Local PUBLIC eligibility와 cursor 계약은 유지한다.
- Confirmation / Follow-up: `PROD-822-policy`에서 GraphQL `node(id:)`·`profileByHandle` 직접 조회, `searchProfiles`·list·interaction 표면을 같은 fixture로, `PROD-822-graphql`에서 관리 GraphQL API와 정확한 unblock ID를 검증한다.

### GraphQL은 selected Local Profile actor와 중앙 application policy를 따른다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/profile-block.md`, `PROD-822`, `PROD-823`
- Status: Active
- Context / Problem: GraphQL resolver가 입력 Profile ID를 actor로 신뢰하거나 resolver·loader마다 차단 조건을 복제하면 selected Profile 격리와 중앙 정책이 무너진다.
- Decision Outcome: `PROD-822-graphql`의 GraphQL Block 생성·해제 mutation과 Owner 관리 조회의 connection·관계 Node/loader는 검증된 Session의 selected Local Profile actor를 사용하고, 정확한 unblock 관계 ID와 generated schema·관리 API 테스트를 제공한다. `PROD-822-policy`는 공통 core/application policy를 호출해 GraphQL `node(id:)`·`profileByHandle` 직접 조회, `searchProfiles` 후보·콘텐츠·Follow·Notification·새 상호작용 제한과 Local/ActivityPub 실행 경로를 연결·검증한다. resolver·loader와 policy consumer는 요청별 DB actor state(GUC 등)·client 전용 filter를 권한 또는 visibility의 대체 수단으로 사용하지 않는다. Block·Mute 관계의 Target은 기존 `Profile` ref와 global ID를 사용한다. Unblock은 실제 제거한 관계 ID를 반환하며 관계를 제거하지 않은 결과만 `null`로 나타낸다. concrete helper와 field/payload 이름, resolver·loader 배치는 기존 naming·generated schema에 맞춘 구현 선택으로 남긴다.
- Alternatives Considered: 입력된 arbitrary Profile ID를 actor로 사용하면 다른 Owner의 관계를 변경할 수 있다. resolver-local predicate나 client-only filter는 policy drift와 visibility 우회를 만든다. 요청별 DB actor state를 권한 경계로 사용하면 현재 application policy와 runtime 경계를 확장한다.
- Consequences: selected Local Profile이 없는 Block 생성·해제·Owner 관리 operation은 기존 auth 경계에서 거부되고, Block 목록은 해당 actor가 Owner인 관계만 반환한다. 일반 GraphQL 조회와 Notification의 Account membership 권한을 이 제한으로 바꾸지 않는다. 같은 Target의 Mute 관계는 Block과 별개이므로 Mute Owner connection·관계 Node·해제 경로에서 유지한다. remote ActivityPub ingress는 이 decision의 consumer가 아니다.
- Confirmation / Follow-up: `PROD-822-graphql`에서 Owner A/B·guest·membership mismatch와 관리 connection·Node 경계를 검증하고, `PROD-822-policy`에서 GraphQL `node(id:)`·`profileByHandle`·`searchProfiles`와 정책 consumer를 검증하며, `PROD-823`에서 selected Profile별 client 상태 결과를 확인한다.

### 기존 Notification은 가시성으로 숨기고 source 생성 연결은 후속으로 둔다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0002-pr-review-domain-adjustments.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `docs/domain/decisions/0007-spec-boundary-and-state-clarifications.md`, `PROD-821`, `PROD-822`, `PROD-813`
- Status: Active
- Context / Problem: Profile Block pair가 있는 기존 Notification을 그대로 반환하면 차단된 Related Profile/Post에 대한 접근 정책을 우회하지만, 모든 source를 이번 local capability에 연결하면 별도 책임과 lifecycle을 흡수한다.
- Decision Outcome: Profile Block pair와 Recipient·Related Profile/Post 정책에 따라 unavailable 기존 Notification은 connection·Unread count·Node·read 처리에서 숨긴다. 이 Notification visibility는 Recipient가 Related Post를 직접 조회할 수 있는 방향의 Post·Media policy와 독립적으로 적용한다. Block 생성으로 제거되는 Follow Request/Relationship을 직접 원인으로 하는 Notification만 `PROD-821`의 durable cleanup에서 삭제하며, 다른 기존 Notification과 Read State는 보존한다. 모든 source의 신규 생성 suppression과 숨겨진 row의 async physical cleanup은 이 change의 task·완료 증거가 아니다.
- Alternatives Considered: 모든 source 생성 경로를 여기서 수정하면 후속 공용 정책과 책임이 중복된다. 기존 unavailable row를 전부 삭제하면 비직접 원인 보존 계약을 위반한다. queue/worker/scan을 추가하면 별도 lifecycle이 합쳐진다.
- Consequences: API surface는 Profile Block pair와 Recipient·Related Profile/Post 정책을 매 요청 평가하며 hidden row가 남아도 사용자에게 노출하지 않는다. source suppression은 `PROD-327`, async physical cleanup은 `PROD-328`, remote ActivityPub는 `PROD-818`의 후속 boundary로 남는다.
- Confirmation / Follow-up: `PROD-822`에서 list/count/Node/read visibility를, `PROD-821`에서 direct-cause deletion을, `PROD-813`에서 두 후속 이슈가 완료 조건이 아님을 확인한다.

### UI는 기존 레거시 presentation과 별도 Block destination을 사용한다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: 정본 `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `docs/design/accessibility.md`, `DSN-51`, `DSN-53`; 책임 이슈 `PROD-823`; 후속 UI 교체 `PROD-917`
- Status: Active
- Context / Problem: 공용 presentation 이관 결과를 Block runtime 계약으로 오인하거나 Mute와 Block을 하나의 목록으로 합치면 Profile Block 책임이 바뀐다.
- Decision Outcome: `PROD-823`은 기존 레거시 Profile·Settings UI를 사용해 `DSN-51`·`DSN-53`과 최신 canonical이 정한 direct Profile route 계약을 구현·통합한다. 양쪽 route는 기존 Profile 조회 정책에 따른 기본 Profile 정보를 표시하고, `blocking` route는 Target의 허용된 Post·Media를 표시하기 전에 `차단한 프로필의 게시물입니다` 경고와 `게시물 보기` action을 제공한다. 경고는 현재 Profile handle과 selected actor lifecycle마다 다시 적용하고, 사용자가 action을 실행하기 전에는 시간 경과만으로 콘텐츠를 표시하지 않는다. `blockedBy` route는 상대의 기본 Profile 정보와 콘텐츠 차단 상태를 표시한다. 양방향 Block에서는 양쪽 route에 콘텐츠 차단 상태를 적용하고 `blocking` route의 `차단 해제` action을 유지한다. `PROD-861`의 공용 presentation 이관·Storybook 확정은 완료된 선행 구현 증거로 사용하고, `PROD-917`의 신규 UI 교체만 후속 범위로 유지한다. Block confirmation은 Mute와 분리된 Danger·pending·실패·retry 상태를 사용하고, Settings에는 `뮤트한 프로필`과 `차단한 프로필`을 별도 destination으로 둔다. 2026-09-05 canonical `docs/design/profile-mute-block.md`에 반영한 승인에 따라 Unblock도 같은 공용 확인창을 거치고, 2026-09-08 사용자 검토에 따라 Danger action으로 확정한 뒤 실행하며, 취소·pending·실패 lifecycle을 유지한다.
- Alternatives Considered: 공용 presentation 이관이나 신규 UI 교체를 현재 lifecycle에 결합하면 기존 레거시 UI의 구현·통합 검증과 runtime 책임이 지연된다. Mute/Block 혼합 목록은 별도 관리 계약과 destination 상태를 잃는다. 경고와 콘텐츠 상태를 별도 route 계약으로 관리하지 않으면 API 조회 정책과 presentation 책임이 섞인다.
- Consequences: `PROD-823`은 완료된 `PROD-861`의 공용 presentation·Storybook 결과를 선행 증거로 사용해 기존 레거시 UI의 실제 mutation·management·접근성 runtime과 서버 정책에 따른 direct route 상태 수렴을 완성하고, `PROD-813`은 그 통합 결과를 검증한다. `PROD-917`의 신규 UI 교체는 별도 후속 책임으로 유지하며, 새 범용 safety component나 Settings shell을 현재 change에 추가하지 않는다.
- Confirmation / Follow-up: `PROD-823`과 `PROD-813`은 `PROD-861` 결과를 포함한 기존 레거시 UI의 구현·통합을 기준으로 confirmation·별도 list·accessibility·viewport·selected actor UI와 플랫폼별 실제 runtime evidence를 검증한다. `PROD-861` 완료만으로 API·cache·Native runtime 검증까지 완료됐다고 일반화하지 않고, `PROD-917`의 신규 UI 교체만 별도 후속 일정으로 기록한다.
- 추가 경계: 현재 서버 정책을 다시 평가하는 refetch는 상태 수렴에 필요하며, 금지 대상은 이전 client cache나 grant만으로 각 surface에서 unavailable한 detail을 복구하는 경우다.

### Client 상태는 selected actor 경계 안에서 서버 결과로 수렴한다

- Decision Date: 2026-09-08
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `PROD-823`, `PROD-813`
- Status: Active
- Context / Problem: Block 성공 뒤 Profile 기본 정보, 콘텐츠 상태, 이미 표시 중인 timeline·Notification과 관리 목록을 서버 결과에 맞춰 갱신하지 않거나 Profile 전환 때 이전 actor의 상태를 재사용하면 stale content state와 Owner 간 상태 누수가 생긴다.
- Decision Outcome: Block·Unblock 성공 결과는 현재 selected Local Profile actor의 client 상태를 서버 확정 결과와 일치시켜야 한다. 현재 Profile 화면과 이미 표시 중인 Home·Local·Hashtag timeline·Profile Post List·Notification은 각 surface의 서버 Profile Block 정책에 따라 숨기거나 갱신하고, Block 목록은 해당 Owner 관계를 반영한다. 실패 시 optimistic Block을 성공으로 확정하지 않으며, selected Profile/Session 전환은 각 actor의 Block 상태를 해당 actor의 결과로 격리한다. Unblock은 삭제된 Follow Request·Follow Relationship을 optimistic으로 복구하지 않는다.
- Alternatives Considered: actor 간 상태를 공유하면 selected Profile 격리를 깨뜨린다. 모든 상태를 무조건 초기화하면 unrelated state까지 버리고 actor 경계를 과도하게 넓힐 수 있다. client-only hide는 서버 payload와 direct query 누수를 막지 못한다.
- Consequences: `PROD-823`은 서버 결과 수렴과 actor switch 회귀를, `PROD-813`은 cross-slice UI/API 결과를 검증한다. `PROD-917`은 후속 UI 교체에서도 같은 actor·content policy 경계를 유지한다. client 상태를 갱신하는 구체 mechanism은 영향 범위에 맞춰 구현 시 정한다.
- Confirmation / Follow-up: `PROD-823`에서 success/failure·A/B actor·Unblock no-restore 뒤 client 상태 수렴을 확인하고, `PROD-813`에서 Profile switch와 cross-slice actor 상태 격리를 E2E로 확인한다.

### 공통 관계 action과 surface 조합을 같은 이슈의 두 PR로 분리한다

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/profile-mute-block.md`, `PROD-823`, PR #772 review `5163335465`
- Status: Active
- Context / Problem: Profile route와 차단 관리 목록이 각각 해제 mutation·확인창·pending·실패·Relay 갱신을 조립하면 Follow 관계 action과 차단 상태가 surface마다 달라지고 회귀 검증이 중복된다.
- Decision Outcome: 새 이슈를 만들지 않고 `PROD-823` 하나에 두 Stack PR을 연결한다. 부모 PR은 기존 `FollowButton`의 Block 관계 fragment·해제 lifecycle과 공통 회귀를 소유한다. 자식 #772는 Profile route와 관리 목록에서 그 action의 노출 여부, 목록 조회·pagination과 focus fallback을 조합한다. identity-free route의 해제 fallback은 Profile fragment가 없으므로 #772에 유지한다.
- Alternatives Considered: surface별 해제 action 유지는 상태·오류·cache 책임을 중복한다. 별도 Linear 이슈 생성은 이미 승인된 `PROD-823` 행동 범위를 불필요하게 나눈다.
- Consequences: 양방향 Block에서도 자신의 해제 action을 유지하고, 해제 뒤 서버 결과가 `blockedBy`만 남으면 부모 surface가 action을 숨긴다. 공통 action은 이전 Follow를 복구하지 않는다.
- Confirmation / Follow-up: 부모 PR에서 공통 상태·hover/focus·Native tap·mutation·actor 회귀를, #772에서 Profile/Settings 연결·pagination·focus와 상대 Block 잔존 수렴을 검증한다.

### 저장 schema는 additive 확장과 no-backfill rollout을 따른다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `memory/database-migrations.md`, `PROD-821`
- Status: Active
- Context / Problem: 새 relation을 기존 Profile·Follow·Reaction·Notification 상태에 억지로 합치거나 과거 데이터에 backfill하면 구버전 workload와 migration·rollback 경계가 불필요하게 넓어진다.
- Decision Outcome: Profile Block은 기존 domain row를 변경하거나 과거 관계를 backfill하지 않는 additive migration으로 배포하며, Owner/Target 참조 무결성·uniqueness·self-block 거부를 보장한다. migration naming·history·rollback safety는 repository workflow와 `design.md` guardrail을 따르고, 구체 physical shape와 tooling은 구현 시 정한다.
- Alternatives Considered: 기존 Profile row에 Block state를 추가하면 관계 방향·다중 Target·Owner 관리가 손상될 수 있다. 기존 관계를 backfill하면 배포 시점과 사용자-visible cleanup을 섞는다. 어떤 저장·migration 수단을 쓰든 현재 additive/no-backfill 결과를 벗어나면 채택하지 않는다.
- Consequences: old/new app이 schema 확장 중 공존할 수 있고 Profile Block을 사용하지 않는 기존 데이터는 그대로 남는다. migration 실패·rollback 안전성과 관계 불변식은 `PROD-821`에서 확인한다.
- Confirmation / Follow-up: `PROD-821`에서 additive migration, referential integrity, uniqueness, self-block 거부, 기존 row 보존과 rollback evidence를 검증하고, `PROD-813` archive 전까지 정합성을 확인한다.

### 새 Follow admission과 이미 진행 중인 transition의 잔존 결과를 구분한다

- Decision Date: 2026-09-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/follow-relationship.md`, `memory/database-design.md`, `PROD-822`; `PROD-821` concurrency 정정 댓글 `5ceda55c-f3b6-4109-987c-27c12c413ce2`.
- Status: Active
- Context / Problem: Block 뒤 새 Follow를 거부한다는 결과를 모든 in-flight transition의 commit 금지로 해석하면 이미 승인된 overlap 허용과 충돌한다. 반대로 잔존 row를 허용한다는 이유로 새 Follow나 승인을 허용하면 Active Block이 무력화된다. 공통 transition을 소비하는 기존 ActivityPub Follow·Accept는 이 정책 거절을 내부 장애와 구분해야 한다.
- Decision Outcome: Block이 이미 적용된 상태에서 시작한 로컬 Follow·Follow Request 승인과 기존 ActivityPub inbound Follow·Accept는 새 관계를 만들기 전에 공통 pair 정책으로 거부한다. inbound 경계는 이 예상 가능한 도메인 거절을 `rejected`로 관찰하고 `internal_failure`로 보고하거나 다시 던지지 않는다. cleanup과 겹쳐 이미 진행 중이던 transition이 남긴 row는 허용하되 Active Block 동안 관계 조회·viewer 상태·Home 후보·`FOLLOWERS` 접근의 유효한 근거로 사용하지 않는다.
- Alternatives Considered: Profile pair 전체 직렬화와 모든 물리 row 부재 보장은 기존 승인 범위를 강화하므로 채택하지 않는다. GraphQL 앞단만 검사하거나 잔존 관계를 유효한 Follow로 반환하는 방식은 공통 admission·visibility 결과를 만족하지 못한다.
- Consequences: 새 admission 거부와 잔존 row 비활성·비노출은 각각 자동화 검증한다. 기존 ActivityPub Follow·Accept의 차단 거절은 관계 미생성과 내부 오류 미보고를 함께 확인한다. `PROD-821`은 captured cleanup·Unblock 정리를, `PROD-822`는 정책·admission을, `PROD-813`은 cross-slice 검증을 계속 소유한다.
- Confirmation / Follow-up: Block 뒤 시작한 FOLLOW·로컬 APPROVE와 ActivityPub Follow·Accept의 저장 거부, inbound 내부 오류 미보고, 잔존 Follow/Request fixture의 Node·목록·권한 비활성, 해제 뒤 반대 Block과 다른 정책 재평가를 검증한다. ActivityPub Block/Undo 구현 범위를 가져오지 않으며 기존 cleanup decision을 대체하지 않고 그 소비 경계를 구체화한다.

### 기존 Notification의 차단은 각 Recipient 기준으로 판정한다

- Decision Date: 2026-09-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/objects/profile-block.md`, `PROD-822`; `PROD-821` 범위 정정 댓글 `dd0372f2-4356-46de-86f4-f8c4b503417c`.
- Status: Active
- Context / Problem: Notification은 Account가 Recipient Profile membership으로 조회·읽음 처리한다. 이를 selected Profile 하나의 Block 관계로 평가하면 같은 Account의 다른 Recipient 결과가 잘못 바뀐다.
- Decision Outcome: 각 Notification의 Recipient와 Related Profile·Post를 기준으로 현재 availability를 평가한다. connection·Unread·Node·mark-read는 조회 불가 item을 같은 방식으로 제외하고 비직접 원인 row·Read State를 유지한다. Unblock 뒤에는 현재 정책을 다시 평가하며 별도의 과거 Notification 복구 결과를 약속하지 않는다.
- Alternatives Considered: selected Profile로 Recipient를 대체하면 기존 Account membership 계약과 맞지 않는다. 조회 단계에서 row를 물리 삭제하거나 source 전체에 suppression을 추가하면 현재 slice의 책임을 바꾼다.
- Consequences: 읽음 처리의 중복 ID·없는 ID·숨겨진 ID는 기존 no-op·멱등성 계약을 유지한다. `PROD-327` source suppression과 `PROD-328` 물리 cleanup은 이 검증 결과에 포함하지 않는다.
- Confirmation / Follow-up: Recipient A/B와 같은 Account, 현재 source별 unavailable item, 혼합 ID 읽음 처리와 보존 row·Read State를 함께 검증한다.

### 미구현 Post List·검색은 공통 정책, 현재 Quote ingress는 실제 경로로 검증한다

- Decision Date: 2026-09-06
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-822`·`PROD-813` 본문 `미구현 Post List·검색의 완료 기준 (2026-09-06 사용자 결정)`, `docs/domain/policies/post-list.md`, `docs/domain/objects/post.md`, `openspec/changes/add-profile-block/specs/post/spec.md`, `memory/issue-openspec-workflow.md`, PR #770 review.
- Status: Active
- Context / Problem: Hashtag Post List·Post 검색 endpoint는 아직 없지만, 현재 base에는 `CreatePostInput.repostSourceId`와 GraphQL `createPost` 저장 경로가 있어 Local Quote가 실제 consumer다. 없는 endpoint와 존재하는 Quote ingress를 모두 공통 정책 단위 검증으로 분류하면 Local Quote의 우회를 실제 요청에서 발견하지 못한다.
- Decision Outcome: 아직 없는 Post List·검색 endpoint는 공통 Block 후보 정책으로 검증한다. Local Quote는 `CreatePostInput.repostSourceId`를 사용한 GraphQL `createPost`를 차단 양방향에서 각각 실행해 요청 거부와 새 Post row 부재를 검증한다. Quote ingress가 없는 origin은 그 origin에 한해 공통 assertion 검증과 실제 ingress 미검증을 구분한다.
- Alternatives Considered: consumer 구현·E2E까지 완료해야 archive하는 대안과 공통 정책 검증으로 완료하는 대안을 비교했다. 모든 Post List·검색 Exclude와 Quote admission에 적용되는 canonical 정책은 두 대안 모두 유지한다.
- Consequences: `PROD-822`의 공통 정책·실제 Local Quote ingress 검증과 `PROD-813`의 완료·archive 조건을 같은 범위로 맞춘다. archive 이후 추가되는 endpoint나 아직 없는 Quote origin ingress의 정책 연결·실제 E2E는 해당 consumer를 도입하는 기능 이슈가 소유하고 이 change를 미완료로 유지하거나 다시 열지 않는다.
- Confirmation / Follow-up: 2.5·2.10에서 Local Quote의 양방향 GraphQL 거부·새 Post row 부재와 ingress가 없는 origin의 공통 assertion·미실행 구분을, 4.1·4.2·4.3에서 이 경계에 맞는 통합 증거와 archive 조건을 확인한다.

### PROD-822는 cleanup PR 위에 독립 책임의 Stack layer로 구현한다

- Decision Date: 2026-09-06
- Decision Class: Implementation Choice
- Authority / Provenance: 2026-09-06 사용자 결정, `PROD-821`, `PROD-822`, `PROD-813`, `docs/domain/objects/profile-block.md`, `memory/issue-openspec-workflow.md`
- Status: Active
- Context / Problem: 현재 `main`에는 additive Profile Block 저장 관계만 있고 cleanup PR #726은 Open·Draft다. cleanup과 정책·GraphQL의 책임을 분리하면서 자식 구현이 부모 PR merge까지 불필요하게 멈추지 않도록 Stack 순서를 명확히 해야 한다.
- Decision Outcome: `PROD-822`는 #726을 부모로 삼아 그 durable action·success gate를 소비하는 Stack을 쌓는다. #726의 저장·cleanup 구현과 검증은 `PROD-821` 책임으로 유지하며, #770의 정책·스펙 뒤에 `PROD-822-graphql` layer를 두고 그 자식 `PROD-822-policy` layer를 둔다. `PROD-822-graphql`은 selected Local actor의 Block/Unblock mutation, Owner 관리 connection·관계 Node, 정확한 unblock 관계 ID, generated schema와 관리 API 테스트를, `PROD-822-policy`는 GraphQL `node(id:)`·`profileByHandle` 직접 조회, `searchProfiles` 후보·콘텐츠·Follow·Notification과 새 상호작용 제한, 공통 admission, Local/ActivityPub 실행 경로와 회귀를 소유한다. 부모 PR이 Draft여도 자식 layer 구현을 시작할 수 있다.
- Alternatives Considered: #726이 merge될 때까지 기다린 뒤 `main`에서 시작하는 방안, cleanup을 `PROD-822`에 복제하는 방안, #726 위에 자식 layer를 쌓는 방안을 비교했다. 사용자는 책임을 분리한 Stack을 선택했다.
- Consequences: task 1.2~1.4는 `PROD-821`과 #726에 남고, `PROD-822-graphql` task는 selected Local 관리 API와 generated schema·관리 API 테스트를, `PROD-822-policy` task는 policy consumer·공통 admission·Local/ActivityPub 실행 회귀를 소유한다. PR diff와 리뷰 책임은 분리되지만 자식 PR의 검증 base는 #726 결과를 포함한다.
- Confirmation / Follow-up: `PROD-822-graphql`과 `PROD-822-policy`의 Git ancestry와 GitHub PR base가 각각 선행 layer를 부모로 가리키는지 확인한다. #726 구현을 자식 diff에 복제하지 않고 각 layer의 검증 결과를 별도로 기록한다.

### PROD-822 정책과 GraphQL 실행 구현을 자식 Stack layer로 분리한다

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: 2026-09-10 사용자 결정, `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `PROD-822`, PR #770 최신 review
- Status: Active
- Context / Problem: #770이 관리 GraphQL API, 기존 조회·상호작용 정책과 실행 회귀를 한 diff에 포함해 계약 검토와 런타임 영향 검토를 독립적으로 수행하기 어렵다. 또한 Local 전용 조건과 ActivityPub 유입을 혼동하거나 쓰기 admission과 목록 SQL predicate를 같은 helper 책임으로 합치면 origin별 우회와 정책 drift가 생긴다.
- Decision Outcome: #770은 canonical 문서와 `add-profile-block` OpenSpec 정책·계약만 소유한다. 후속 `PROD-822-graphql` layer는 selected Local actor의 Block/Unblock mutation, Owner 관리 connection·관계 Node, 정확한 unblock 관계 ID, generated GraphQL schema와 관리 API 테스트를 소유한다. 그 자식 `PROD-822-policy` layer는 GraphQL `node(id:)`·`profileByHandle` 직접 조회, `searchProfiles`와 `Hashtag.relatedProfiles` 후보·콘텐츠·Follow·Notification과 새 상호작용 제한, 공통 admission, Local/ActivityPub 실행 경로와 회귀를 소유한다. 유효한 Account의 현재 selected Profile을 두 Profile 탐색 surface의 viewer로 사용해 양방향 Active Block 후보를 pagination 전에 제외하며, selected Profile이 없으면 기존 Account 인증과 공개 후보 결과를 유지하고 임의 actor·이전 selected Profile·client cache를 재사용하지 않는다. Reply·Quote·Reaction·Repost의 쓰기 admission은 origin과 무관한 공통 assertion을 사용하고 목록용 SQL predicate와 분리한다. Local Quote는 `CreatePostInput.repostSourceId`를 사용한 GraphQL `createPost`를 차단 양방향에서 실행해 요청 거부와 새 Post row 부재를 검증하고, ingress가 없는 Quote origin만 assertion 단위 검증과 실제 ingress 미검증을 구분한다. `FOLLOWERS` 권한은 Follow 존재와 양방향 Active Block 부재를 함께 요구한다. Remote Owner의 ActivityPub Block/Undo ingress는 `PROD-818` 범위로 남긴다.
- Alternatives Considered: 모든 구현을 #770에 유지하면 계약·GraphQL 관리 API·기존 실행 경로를 한 번에 검토해야 한다. origin별 admission 또는 목록 predicate 재사용은 요구 결과를 누락하거나 pagination 책임을 섞는다. `Hashtag.relatedProfiles`를 Block-filter하지 않는 기존 계약은 직접 Profile 조회와 탐색 후보를 같은 정책으로 취급하므로 채택하지 않는다.
- Consequences: #770 final diff에는 `docs/**`와 `openspec/changes/add-profile-block/**`만 남고, `PROD-822-graphql`은 관리 GraphQL API와 generated schema를, `PROD-822-policy`는 GraphQL `node(id:)`·`profileByHandle`·`searchProfiles`를 포함한 apps/packages policy consumer와 Local/ActivityPub 실행 회귀를 수정·검증한다. 이 분리는 전체 OpenSpec 완료나 archive를 뜻하지 않으며 task 2 구현·검증은 두 후속 PR 완료 전까지 미완료다.
- Confirmation / Follow-up: #770에서 strict OpenSpec validation과 diff 경계를 확인한다. `PROD-822-graphql`에서 selected Local actor 관리 API·정확한 unblock ID·관리 API 테스트를, `PROD-822-policy`에서 Local/ActivityPub Reply·Reaction·Repost 저장 거부와 Local Quote GraphQL의 양방향 거부·새 Post row 부재, ingress가 없는 Quote origin의 공통 admission assertion, 잔존 Follow의 `FOLLOWERS` 접근 거부, `Hashtag.relatedProfiles`의 selected/no-selected Profile·양쪽 Block 방향·pagination 회귀와 policy consumer 회귀를 실행한다.

### Direct blocking route의 경고 최소 계약을 현행 동작으로 확정한다

- Decision Date: 2026-09-11
- Decision Class: User Decision
- Authority / Provenance: 2026-09-11 사용자 결정 “현행 계약 확정”, `DSN-53`, `PROD-823`, 완료된 선행 구현 증거 `PROD-861`, 후속 신규 UI 교체 `PROD-917`, `docs/design/profile-mute-block.md`, PR #770 review.
- Status: Active
- Context / Problem: 기존 계약은 direct `blocking` Profile route의 콘텐츠 경고를 필수로 요구하면서도 안내 문구와 유지 기간을 후속 결정으로 남겨, 현재 `PROD-823` 구현과 검증의 완료 기준을 확정할 수 없었다.
- Decision Outcome: direct `blocking` Profile route는 `차단한 프로필의 게시물입니다` 경고와 `게시물 보기` action을 제공한다. 사용자가 action을 실행하기 전에는 시간 경과만으로 Post·Media 콘텐츠를 표시하지 않는다. Profile handle 또는 selected actor lifecycle이 바뀌면 새 route lifecycle에 경고를 다시 적용한다.
- Alternatives Considered: 별도 디자인 이슈를 새로 만들거나 완료된 `DSN-53`을 재개하는 대신, 사용자가 현재 구현과 canonical에 맞춘 최소 행동 계약을 확정했다.
- Consequences: `PROD-823`은 기존 UI에서 위 상태 전이를 구현·검증하고 `PROD-813`에 통합 증거를 인계한다. 완료된 `PROD-861`은 재개하지 않으며, `PROD-917`은 이 동작을 재결정하지 않고 신규 UI 교체 후 회귀를 검증한다.
- Confirmation / Follow-up: component 또는 E2E에서 최초 경고·action, 명시적 action 전 비노출과 action 후 허용 콘텐츠 표시, 임의 시간 경과 후 비노출 유지, Profile handle·selected actor lifecycle 전환 후 경고 재적용을 검증한다.

### 차단 해제는 확인창에서 확정한 뒤 요청한다

- Decision Date: 2026-09-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-mute-block.md`의 Profile action과 완료 피드백, `PROD-823`의 차단 해제 확인 방식
  (2026-09-06 사용자 결정: “Block은 확인창 방식”).
- Status: Active
- Context / Problem: 기존 공용 UI는 해제 확인을 제공하지만 canonical에 확인 여부가 명시되지 않아 runtime 연결 기준을 확인했다.
- Decision Outcome: Profile 메뉴, identity-free `blocking` 상태와 차단 관리 목록의 해제는 확인창을 거친다. `취소`는 요청하지 않고,
  Danger `차단 해제` 확정 뒤에만 요청한다. 확인창은 이전 팔로우 관계가 복구되지 않음을 알리며 identity-free 상태에서는 Target identity를 표시하지 않는다.
- Alternatives Considered: 확인 없이 즉시 요청하는 방식도 검토했지만 사용자가 기존 Block UI의 확인창 방식을 선택했다.
- Consequences: 해제 확인의 취소·pending 중복 입력 및 dismiss 차단·실패 후 재시도를 runtime 검증에 포함한다. 기존 서버 확정 상태와
  actor 격리, Unblock no-restore는 유지한다.
- Confirmation / Follow-up: 사용자 선택을 canonical·Linear에 반영했다. PROD-861의 공용 presentation을 소비하며 전체 Spec 승인과
  PROD-822·PROD-861의 선행 완료는 별도로 확인한다.

## Remaining Decisions

없음. direct `blocking` route 경고의 최소 행동 계약, 미구현 endpoint 완료 경계, #726 위 Stack 책임 분리와 #770 → `PROD-822-graphql` → `PROD-822-policy` 소유 경계는 사용자 결정으로 확정했다.

## Superseded Decisions

없음.
