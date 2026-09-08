## Context

이 기록은 이미 정해진 Profile Block 도메인 계약을 `PROD-821`·`PROD-822`·`PROD-823`·`PROD-813`의 순차 구현과
하나의 최종 lifecycle로 연결한다. `PROD-821`이 저장·durable cleanup과 shared change를 열고, `PROD-822`가
정책·GraphQL, `PROD-823`이 UI·client 상태, `PROD-813`이 cross-slice E2E·canonical sync·archive를 소유한다. OpenSpec 파일
작성만을 결과로 하는 별도 이슈는 만들지 않는다.

## Decision Records

현재 결정 기록은 14개이며 모두 `Active`다. 아래에 각 기록의 authority와 follow-up owner를 명시한다.

### 하나의 shared change가 공통 invariant와 최종 lifecycle을 소유한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `memory/issue-openspec-workflow.md`, `docs/domain/objects/profile-block.md`, `PROD-821`, `PROD-822`, `PROD-823`, `PROD-813`
- Status: Active
- Context / Problem: 구현 이슈마다 OpenSpec을 복제하거나 OpenSpec 전용 이슈를 따로 만들면 같은 Profile Block invariant가 갈라지고, 개별 slice 완료를 전체 완료·archive로 오인할 수 있다.
- Decision Outcome: `add-profile-block` 하나가 저장·정책·UI·통합 검증의 공통 행동 계약을 소유한다. 최초로 새 저장 계약을 여는 `PROD-821`이 artifact와 저장·durable cleanup task를 열고, `PROD-822`·`PROD-823`은 같은 change를 순차 갱신하며, `PROD-813`은 네 slice의 cross-slice 검증·canonical sync와 최종 archive를 소유한다. 이 change는 OpenSpec 파일 작성 자체를 독립 deliverable로 만들지 않는다.
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
- Decision Outcome: 저장된 Owner → Target row는 Profile Block pair를 양쪽 viewer 방향으로 평가하는 공통 관계 판정에 사용한다. Profile Node·handle route·일반 Profile 검색은 기존 Profile 조회 정책을 적용하고, Post·Media와 목록·상호작용·Notification은 각 surface의 방향별 또는 양방향 정책을 적용한다.
- Alternatives Considered: Owner 방향만 검사하면 차단을 unilateral visibility로 잘못 해석한다. 각 resolver나 앱 화면에서 predicate를 복제하면 surface 누락과 actor별 불일치가 생긴다. page limit 뒤 client filter는 cursor와 보안 결과를 깨뜨린다.
- Consequences: Profile·Post spec은 각 surface의 구체적인 Exclude/interaction 결과를, 이 결정은 대칭 predicate와 consumer 원칙을 소유한다. 기존 Post Visibility·Local PUBLIC eligibility와 cursor 계약은 유지한다.
- Confirmation / Follow-up: `PROD-822` policy/GraphQL test에서 direct·list·search·interaction 표면을 같은 fixture로 검증한다.

### GraphQL은 selected Local Profile actor와 중앙 application policy를 따른다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/profile-block.md`, `PROD-822`, `PROD-823`
- Status: Active
- Context / Problem: GraphQL resolver가 입력 Profile ID를 actor로 신뢰하거나 resolver·loader마다 차단 조건을 복제하면 selected Profile 격리와 중앙 정책이 무너진다.
- Decision Outcome: 현재 GraphQL Block 생성·해제 mutation과 Owner 관리 조회의 connection·관계 Node/loader는 검증된 Session의 selected Local Profile actor를 사용한다. resolver·loader는 공통 core/application policy를 호출하고, 요청별 DB actor state(GUC 등)·client 전용 filter를 권한 또는 visibility의 대체 수단으로 사용하지 않는다. Block·Mute 관계의 Target은 기존 `Profile` ref와 global ID를 사용한다. Unblock은 실제 제거한 관계 ID를 반환하며 관계를 제거하지 않은 결과만 `null`로 나타낸다. concrete helper와 field/payload 이름, resolver·loader 배치는 기존 naming·generated schema에 맞춘 구현 선택으로 남긴다.
- Alternatives Considered: 입력된 arbitrary Profile ID를 actor로 사용하면 다른 Owner의 관계를 변경할 수 있다. resolver-local predicate나 client-only filter는 policy drift와 visibility 우회를 만든다. 요청별 DB actor state를 권한 경계로 사용하면 현재 application policy와 runtime 경계를 확장한다.
- Consequences: selected Local Profile이 없는 Block 생성·해제·Owner 관리 operation은 기존 auth 경계에서 거부되고, Block 목록은 해당 actor가 Owner인 관계만 반환한다. 일반 GraphQL 조회와 Notification의 Account membership 권한을 이 제한으로 바꾸지 않는다. 같은 Target의 Mute 관계는 Block과 별개이므로 Mute Owner connection·관계 Node·해제 경로에서 유지한다. remote ActivityPub ingress는 이 decision의 consumer가 아니다.
- Confirmation / Follow-up: `PROD-822`에서 Owner A/B·guest·membership mismatch와 direct/list Node 경계를 검증하고, `PROD-823`에서 selected Profile별 client 상태 결과를 확인한다.

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
- Decision Outcome: `PROD-823`은 기존 Profile 정보를 유지하고 viewer 방향의 콘텐츠 상태를 각 surface 정책에 맞게 표시한다. `PROD-861` 결과는 prerequisite evidence로 참고하고 신규 UI 교체는 `PROD-917` 후속 범위로 둔다. Block confirmation은 Mute와 분리된 Danger·pending·실패·retry 상태를 사용하고, Settings에는 `뮤트한 프로필`과 `차단한 프로필`을 별도 destination으로 둔다.
- Alternatives Considered: `PROD-861`을 이 change에 다시 포함하면 presentation·runtime lifecycle이 결합된다. Mute/Block 혼합 목록은 별도 관리 계약과 destination 상태를 잃는다. blocked 대상의 최신 detail을 다시 요청하면 visibility policy를 우회한다.
- Consequences: DSN-53 visual result와 861 implementation은 선행 증거이고, 823은 실제 mutation·management·접근성 runtime과 protected-data guard를 완성한다. 새 범용 safety component나 Settings shell을 추가하지 않는다.
- Confirmation / Follow-up: `PROD-823`에서 confirmation·별도 list·accessibility·viewport와 selected actor UI를 검증하고, `PROD-813`에서 플랫폼별 실제 runtime evidence를 별도로 기록한다.

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

### 새 로컬 Follow admission과 이미 진행 중인 transition의 잔존 결과를 구분한다

- Decision Date: 2026-09-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/follow-relationship.md`, `memory/database-design.md`, `PROD-822`; `PROD-821` concurrency 정정 댓글 `5ceda55c-f3b6-4109-987c-27c12c413ce2`.
- Status: Active
- Context / Problem: Block 뒤 새 Follow를 거부한다는 결과를 모든 in-flight transition의 commit 금지로 해석하면 이미 승인된 overlap 허용과 충돌한다. 반대로 잔존 row를 허용한다는 이유로 새 Follow나 승인을 허용하면 Active Block이 무력해진다.
- Decision Outcome: Block이 이미 적용된 상태에서 시작한 로컬 Follow·Follow Request 승인은 새 관계를 만들기 전에 공통 pair 정책으로 거부한다. cleanup과 겹쳐 이미 진행 중이던 transition이 남긴 row는 허용하되 Active Block 동안 관계 조회·viewer 상태·Home 후보·`FOLLOWERS` 접근의 유효한 근거로 사용하지 않는다.
- Alternatives Considered: Profile pair 전체 직렬화와 모든 물리 row 부재 보장은 기존 승인 범위를 강화하므로 채택하지 않는다. GraphQL 앞단만 검사하거나 잔존 관계를 유효한 Follow로 반환하는 방식은 공통 admission·visibility 결과를 만족하지 못한다.
- Consequences: 새 admission 거부와 잔존 row 비활성·비노출은 각각 자동화 검증한다. `PROD-821`은 captured cleanup·Unblock 정리를, `PROD-822`는 정책·admission을, `PROD-813`은 cross-slice 검증을 계속 소유한다.
- Confirmation / Follow-up: Block 뒤 시작한 FOLLOW·로컬 APPROVE의 저장 거부, 잔존 Follow/Request fixture의 Node·목록·권한 비활성, 해제 뒤 반대 Block과 다른 정책 재평가를 검증한다. 기존 cleanup decision을 대체하지 않고 그 소비 경계를 구체화한다.

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

### 미구현 Post List·검색은 공통 후보 정책 검증으로 완료한다

- Decision Date: 2026-09-06
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-822`·`PROD-813` 본문 `미구현 Post List·검색의 완료 기준 (2026-09-06 사용자 결정)`, `docs/domain/policies/post-list.md`, `memory/issue-openspec-workflow.md`.
- Status: Active
- Context / Problem: Hashtag Post List·Post 검색 endpoint가 없는데 실제 endpoint E2E를 전체 change의 archive 조건으로 요구하면 독립 기능의 구현까지 기다려야 한다.
- Decision Outcome: 아직 없는 두 endpoint는 공통 Block 후보 정책 검증까지만 이 shared change의 완료 기준으로 삼는다. 신규 endpoint 구현·실제 E2E를 archive 조건으로 두지 않고, 공통 정책 검증과 실제 API 검증의 미실행을 구분해 기록한다. 현재 consumer와 검증 시점에 이미 제공되는 endpoint는 실제 공개 결과로 검증한다.
- Alternatives Considered: endpoint 구현·E2E까지 완료해야 archive하는 대안과 공통 정책 검증으로 완료하는 대안을 제시했고, 사용자가 후자를 선택했다. 모든 Post List·검색에 적용되는 canonical Exclude 정책은 두 대안 모두 유지한다.
- Consequences: `PROD-822`의 공통 후보 정책 검증과 `PROD-813`의 완료·archive 조건을 같은 범위로 맞춘다. archive 이후 추가되는 endpoint의 연결·검증은 해당 기능 이슈가 소유하며 이 change를 미완료로 유지하거나 다시 열지 않는다.
- Confirmation / Follow-up: 2.10에서 정책 실행 결과와 실제 endpoint 미실행을 구분하고, 4.1·4.2·4.3에서 이 경계에 맞는 통합 증거와 archive 조건을 확인한다.

### PROD-822는 cleanup PR 위에 독립 책임의 Stack layer로 구현한다

- Decision Date: 2026-09-06
- Decision Class: Implementation Choice
- Authority / Provenance: 2026-09-06 사용자 결정, `PROD-821`, `PROD-822`, `PROD-813`, `docs/domain/objects/profile-block.md`, `memory/issue-openspec-workflow.md`
- Status: Active
- Context / Problem: 현재 `main`에는 additive Profile Block 저장 관계만 있고 cleanup PR #726은 Open·Draft다. cleanup과 정책·GraphQL의 책임을 분리하면서 자식 구현이 부모 PR merge까지 불필요하게 멈추지 않도록 Stack 순서를 명확히 해야 한다.
- Decision Outcome: `PROD-822`는 #726을 부모 layer로 삼아 Stack을 쌓고 그 durable action·success gate를 소비한다. #726의 저장·cleanup 구현과 검증은 `PROD-821` 책임으로 유지하며, `PROD-822`는 정책·GraphQL 책임만 독립적으로 구현한다. 부모 PR이 Draft여도 자식 layer 구현을 시작할 수 있다.
- Alternatives Considered: #726이 merge될 때까지 기다린 뒤 `main`에서 시작하는 방안, cleanup을 `PROD-822`에 복제하는 방안, #726 위에 자식 layer를 쌓는 방안을 비교했다. 사용자는 책임을 분리한 Stack을 선택했다.
- Consequences: task 1.2~1.4는 `PROD-821`과 #726에 남고, `PROD-822` task는 policy·GraphQL consumer와 부모 action 연동만 소유한다. PR diff와 리뷰 책임은 분리되지만 자식 PR의 검증 base는 #726 결과를 포함한다.
- Confirmation / Follow-up: `PROD-822` 브랜치의 Git ancestry와 GitHub PR base가 #726 head를 부모로 가리키는지 확인한다. #726 구현을 자식 diff에 복제하지 않고 각 layer의 검증 결과를 별도로 기록한다.

## Remaining Decisions

없음. 미구현 endpoint 완료 경계와 #726 위 Stack 책임 분리는 2026-09-06 사용자 결정으로 확정했다.

## Superseded Decisions

없음.
