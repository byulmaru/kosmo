## Context

이 기록은 이미 정해진 Profile Block 도메인 계약을 `PROD-821`·`PROD-822`·`PROD-823`·`PROD-813`의 순차 구현과
하나의 최종 lifecycle로 연결한다. `PROD-821`이 저장·durable cleanup과 shared change를 열고, `PROD-822`가
정책·GraphQL, `PROD-823`이 UI·client 상태, `PROD-813`이 cross-slice E2E·canonical sync·archive를 소유한다. OpenSpec 파일
작성만을 결과로 하는 별도 이슈는 만들지 않는다.

## Decision Records

현재 결정 기록은 9개이며 모두 `Active`다. 각 기록의 authority와 follow-up owner는 아래에 명시한다.

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

### 공통 Profile Block predicate는 저장 방향과 무관하게 양쪽에 적용한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`
- Status: Active
- Context / Problem: Owner → Target row만 확인하면 Target이 Owner의 Profile·Post를 계속 조회하거나 상호작용할 수 있고, surface별 client filter는 page·Node·mutation에서 우회된다.
- Decision Outcome: `(viewer, target)` pair에 대해 저장된 Owner → Target row를 양쪽 방향의 blocked predicate로 정규화한다. Profile/Post/Media/Follow 후보, Home/Local/Profile/Hashtag Post List, 검색과 interaction consumer는 각자 소유한 surface contract에서 이 predicate를 사용한다.
- Alternatives Considered: Owner 방향만 검사하면 차단을 unilateral visibility로 잘못 해석한다. 각 resolver나 앱 화면에서 predicate를 복제하면 surface 누락과 actor별 불일치가 생긴다. page limit 뒤 client filter는 cursor와 보안 결과를 깨뜨린다.
- Consequences: Profile·Post spec은 각 surface의 구체적인 Exclude/interaction 결과를, 이 결정은 대칭 predicate와 consumer 원칙을 소유한다. 기존 Post Visibility·Local PUBLIC eligibility와 cursor 계약은 유지한다.
- Confirmation / Follow-up: `PROD-822` policy/GraphQL test에서 direct·list·search·interaction 표면을 같은 fixture로 검증한다.

### GraphQL은 selected Local Profile actor와 중앙 application policy를 따른다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/profile-block.md`, `PROD-822`, `PROD-823`
- Status: Active
- Context / Problem: GraphQL resolver가 입력 Profile ID를 actor로 신뢰하거나 resolver·loader마다 차단 조건을 복제하면 selected Profile 격리와 중앙 정책이 무너진다.
- Decision Outcome: 현재 GraphQL ingress의 mutation·Owner connection·Node/connection loader는 검증된 Session의 selected Local Profile actor를 사용한다. resolver·loader는 공통 core/application policy를 호출하고, 요청별 DB actor state(GUC 등)·client 전용 filter를 권한 또는 visibility의 대체 수단으로 사용하지 않는다. concrete helper와 field/payload 이름, resolver·loader 배치는 기존 naming·generated schema에 맞춘 구현 선택으로 남긴다.
- Alternatives Considered: 입력된 arbitrary Profile ID를 actor로 사용하면 다른 Owner의 관계를 변경할 수 있다. resolver-local predicate나 client-only filter는 policy drift와 visibility 우회를 만든다. 요청별 DB actor state를 권한 경계로 사용하면 현재 application policy와 runtime 경계를 확장한다.
- Consequences: selected Local Profile이 없는 GraphQL request는 기존 auth 경계에서 거부되고, Block 목록은 해당 actor가 Owner인 관계만 반환한다. remote ActivityPub ingress는 이 decision의 consumer가 아니다.
- Confirmation / Follow-up: `PROD-822`에서 Owner A/B·guest·membership mismatch와 direct/list Node 경계를 검증하고, `PROD-823`에서 selected Profile별 client 상태 결과를 확인한다.

### 기존 Notification은 가시성으로 숨기고 source 생성 연결은 후속으로 둔다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0002-pr-review-domain-adjustments.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `docs/domain/decisions/0007-spec-boundary-and-state-clarifications.md`, `PROD-821`, `PROD-822`, `PROD-813`
- Status: Active
- Context / Problem: 차단 뒤 Related Profile/Post를 볼 수 없는 기존 Notification을 그대로 반환하면 접근 정책을 우회하지만, 모든 source를 이번 local capability에 연결하면 별도 책임과 lifecycle을 흡수한다.
- Decision Outcome: unavailable 기존 Notification은 connection·Unread count·Node·read 처리에서 숨긴다. Block 생성으로 제거되는 Follow Request/Relationship을 직접 원인으로 하는 Notification만 821 durable cleanup에서 삭제하며, 다른 기존 Notification과 Read State는 보존한다. 모든 source의 신규 생성 suppression과 숨겨진 row의 async physical cleanup은 이 change의 task·완료 증거가 아니다.
- Alternatives Considered: 모든 source 생성 경로를 여기서 수정하면 후속 공용 정책과 책임이 중복된다. 기존 unavailable row를 전부 삭제하면 비직접 원인 보존 계약을 위반한다. queue/worker/scan을 추가하면 별도 lifecycle이 합쳐진다.
- Consequences: API surface는 차단 관계를 매 요청 평가하며 숨겨진 row가 남아도 사용자에게 노출하지 않는다. source suppression은 `PROD-327`, async physical cleanup은 `PROD-328`, remote ActivityPub는 `PROD-818`의 후속 boundary로 남는다.
- Confirmation / Follow-up: `PROD-822`에서 list/count/Node/read visibility를, `PROD-821`에서 direct-cause deletion을, `PROD-813`에서 두 후속 이슈가 완료 조건이 아님을 확인한다.

### UI는 승인된 presentation과 별도 Block destination을 소비한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: 정본 `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `docs/design/accessibility.md`, `DSN-51`, `DSN-53`; 책임 이슈 `PROD-823`; 선행 presentation 구현 증거 `PROD-861` (정본 아님)
- Status: Active
- Context / Problem: 공용 presentation 이관 결과를 Block runtime 계약으로 오인하거나 Mute와 Block을 하나의 목록으로 합치면 Profile Block 책임이 바뀐다.
- Decision Outcome: `PROD-823`은 `DSN-51`·`DSN-53`과 최신 canonical이 승인한 identity-free `blocking`·`blockedBy` route presentation을 소비하고, `PROD-861` 결과는 prerequisite evidence로 참고하되 presentation 결정·이관 자체를 소유하지 않는다. Block confirmation은 Mute와 분리된 Danger·pending·실패·retry 상태를 사용하고, Settings에는 `뮤트한 프로필`과 `차단한 프로필`을 별도 destination으로 둔다. UI는 차단된 Profile·Post·Media·Notification을 재조회하거나 optimistic 상태로 복구하지 않는다.
- Alternatives Considered: `PROD-861`을 이 change에 다시 포함하면 presentation·runtime lifecycle이 결합된다. Mute/Block 혼합 목록은 별도 관리 계약과 destination 상태를 잃는다. blocked 대상의 최신 detail을 다시 요청하면 visibility policy를 우회한다.
- Consequences: DSN-53 visual result와 861 implementation은 선행 증거이고, 823은 실제 mutation·management·접근성 runtime과 protected-data guard를 완성한다. 새 범용 safety component나 Settings shell을 추가하지 않는다.
- Confirmation / Follow-up: `PROD-823`에서 confirmation·별도 list·accessibility·viewport와 selected actor UI를 검증하고, `PROD-813`에서 플랫폼별 실제 runtime evidence를 별도로 기록한다.

### Client 상태는 selected actor 경계 안에서 서버 결과로 수렴한다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `PROD-823`, `PROD-813`
- Status: Active
- Context / Problem: Block 성공 후 Profile·Post·Notification과 관리 목록을 그대로 두거나 Profile 전환 때 이전 actor의 상태를 재사용하면 stale visibility와 Owner 간 상태 누수가 생긴다.
- Decision Outcome: Block·Unblock 성공 결과는 현재 selected Local Profile actor의 client 상태를 서버 확정 결과와 일치시켜야 한다. 차단으로 접근할 수 없게 된 Profile·Post·Notification은 보호된 데이터를 복구하지 않는 범위에서 수렴시키고, 실패 시 optimistic Block을 성공으로 확정하지 않는다. selected Profile/Session 전환은 이전 Owner의 Block 상태를 새 actor에 재사용하지 않으며, Unblock은 삭제된 Follow Request·Follow Relationship을 optimistic으로 복구하지 않는다.
- Alternatives Considered: actor 간 상태를 공유하면 selected Profile 격리를 깨뜨린다. 모든 상태를 무조건 초기화하면 unrelated state까지 버리고 actor 경계를 과도하게 넓힐 수 있다. client-only hide는 서버 payload와 direct query 누수를 막지 못한다.
- Consequences: `PROD-823`은 서버 결과 수렴과 actor switch 회귀를, `PROD-813`은 cross-slice UI/API 결과를 검증한다. client 상태를 갱신하는 구체 mechanism은 영향 범위에 맞춰 구현 시 정한다.
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

## Remaining Decisions

없음.

## Superseded Decisions

없음.
