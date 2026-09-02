## Context

이 기록은 이미 정해진 Profile Block 도메인 계약을 `PROD-821`·`PROD-822`·`PROD-823`·`PROD-813`의 순차 구현과
하나의 최종 lifecycle로 연결한다. `PROD-821`이 저장·원자적 정리와 이 shared change를 열고, `PROD-822`가
정책·GraphQL, `PROD-823`이 UI·Relay, `PROD-813`이 완료된 `PROD-649` Local Timeline을 포함한 cross-slice E2E와
canonical sync·archive를 소유한다. OpenSpec 파일 작성만을 결과로 하는 별도 이슈는 만들지 않는다.

## Decision Records

### 하나의 shared change가 공통 invariant와 최종 lifecycle을 소유한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `memory/issue-openspec-workflow.md`, `docs/domain/objects/profile-block.md`, `PROD-821`, `PROD-822`, `PROD-823`, `PROD-813`
- Status: Active
- Context / Problem: 구현 이슈마다 OpenSpec을 복제하거나 OpenSpec 전용 이슈를 따로 만들면 같은 Profile Block invariant가 갈라지고, 개별 slice 완료를 전체 완료·archive로 오인할 수 있다.
- Decision Outcome: `add-profile-block` 하나가 저장·정책·UI·통합 검증의 공통 행동 계약을 소유한다. 최초로 새 저장 계약을 여는 `PROD-821`이 artifact와 저장·원자적 정리 task를 열고, `PROD-822`·`PROD-823`은 같은 change를 순차 갱신하며, `PROD-813`은 네 slice의 cross-slice 검증·canonical sync와 최종 archive를 소유한다. 이 change는 OpenSpec 파일 작성 자체를 독립 deliverable로 만들지 않는다.
- Alternatives Considered: 이슈마다 change를 하나씩 복제하면 visibility·cleanup·archive 조건이 중복되고 서로 다른 계약으로 drift한다. 모든 이슈를 하나의 구현 task로 합치면 authority와 독립 완료 조건을 잃는다. 둘 다 현재 이슈의 책임 경계와 맞지 않아 채택하지 않는다.
- Consequences: 네 이슈는 각자의 deliverable만 수행하지만 같은 delta와 decision을 갱신해야 한다. 한 slice가 완료되어도 `PROD-813`의 통합 검증과 archive 전까지 change는 active로 남는다.
- Confirmation / Follow-up: `tasks.md`의 이슈별 Deliverable·Guardrails·Verification을 순서대로 실행하고, `PROD-813`에서 Linear·canonical·OpenSpec 상태를 함께 확인한다.

### Profile Block은 방향성 있는 owner-only 저장 관계다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `PROD-821`, `PROD-822`
- Status: Active
- Context / Problem: 차단의 저장 방향과 적용 방향을 혼동하면 Target이 관계를 관리하거나 Local·Remote 조합마다 별도 모델을 만들게 된다.
- Decision Outcome: Profile Block은 Owner Profile → Target Profile 방향의 존재 관계로 저장하고, `createdAt`과 Owner/Target 조합의 unique 불변식만 보존한다. 별도 상태·만료·복제 column은 두지 않는다. Active Account의 유효한 Member인 Active/Normal Local Owner만 생성·해제할 수 있고, Local 또는 Remote Target은 Owner와 달라야 한다. 관계 조회와 관리 목록은 Owner scope에 한정한다.
- Alternatives Considered: 양방향 row를 두 개 저장하면 실제 행위 주체와 중복 lifecycle이 생긴다. Target도 해제할 수 있게 하면 `ProfileBlock.Owner` 권한과 selected Profile 경계가 무너진다. 관계 상태·expiry를 추가하면 존재 자체가 active 차단이라는 canonical 계약을 확장한다.
- Consequences: 같은 Owner/Target pair는 하나의 row로 식별되고, 차단 적용의 양방향성은 저장 중복이 아니라 공통 policy에서 계산한다. Remote Target은 동일한 local relation 저장 경계를 사용하며 ActivityPub delivery는 이 change에 포함되지 않는다.
- Confirmation / Follow-up: `PROD-821` schema·authorization test에서 duplicate/self/권한 오류와 Local·Remote pair를 확인하고, `PROD-822`에서 Owner-only GraphQL connection을 검증한다.

### 생성 시 관계 정리는 하나의 원자적 transaction에서 끝낸다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-821`
- Status: Active
- Context / Problem: Block row와 Follow·Reaction·Notification 정리를 서로 다른 commit으로 수행하면 차단만 남거나 관계가 일부만 정리되는 상태가 생긴다.
- Decision Outcome: Block 생성은 양방향 Follow Request·Follow Relationship, Target이 Owner의 Post에 남긴 Reaction, 제거되는 Follow 객체를 직접 원인으로 하는 Notification을 Block row와 같은 local transaction에서 commit·rollback한다. Repost Post와 Bookmark 및 Follow 객체가 직접 원인이 아닌 다른 Notification과 Read State는 이 action에서 삭제하거나 변경하지 않는다. Unblock은 Block row만 제거하고, 생성 중 정리된 Follow·Reaction을 복구하지 않는다.
- Alternatives Considered: 기존 여러 public service를 순서대로 호출하고 각각 commit하면 부분 성공을 관찰할 수 있다. Repost·Bookmark까지 일괄 삭제하면 canonical 보존 계약을 위반한다. Unblock 때 관계를 자동 복구하면 사용자의 차단 전 상태를 임의로 재생성한다.
- Consequences: transaction 실패는 Block과 모든 정리 변경을 함께 되돌린다. 차단 해제 후 새 요청은 현재 정책을 다시 평가하지만 과거 관계·Reaction의 복구를 보장하지 않는다.
- Confirmation / Follow-up: `PROD-821`에서 성공·실패 transaction과 보존/비복구 fixture를 검증하고, `PROD-813`에서 양방향 관계와 Repost·Bookmark 보존을 cross-slice로 재확인한다.

### 공통 Profile Block predicate는 저장 방향과 무관하게 양쪽에 적용한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`, `PROD-813`
- Status: Active
- Context / Problem: Owner → Target row만 확인하면 Target이 Owner의 Profile·Post를 계속 조회하거나 상호작용할 수 있고, surface별 client filter는 page·Node·mutation에서 우회된다.
- Decision Outcome: `(viewer, target)` pair에 대해 저장된 Owner → Target row를 양쪽 방향의 blocked predicate로 정규화한다. Profile·Post·Media·Follow 후보·Home/Local/Profile/Hashtag list·검색·Notification과 새 로컬 상호작용의 각 consumer는 후보 반환·payload 생성·write validation 전에 같은 predicate를 사용한다. Block 중 양쪽의 새 Follow·Reply·Reaction·Repost는 허용하지 않으며, Repost 후보는 Repost Author와 Source Post Author 모두를 검사한다.
- Alternatives Considered: Owner 방향만 검사하면 차단을 unilateral visibility로 잘못 해석한다. 각 GraphQL resolver나 앱 화면에서 predicate를 복제하면 surface 누락과 actor별 불일치가 생긴다. page limit 뒤 client filter는 cursor와 보안 결과를 깨뜨린다.
- Consequences: Profile·Post spec은 각 surface의 구체적인 Exclude/interaction 결과를, 이 결정은 대칭 predicate와 consumer 원칙을 소유한다. Post Visibility·Local PUBLIC eligibility 같은 기존 정책은 유지하고 Profile Block이 그 접근 범위를 넓히지 않는다.
- Confirmation / Follow-up: `PROD-822` policy/GraphQL test에서 direct·list·search·interaction 표면을 같은 fixture로 검증하고, `PROD-813`에서 Web/API E2E와 Local Timeline 회귀를 확인한다.

### GraphQL은 selected Profile actor와 중앙 application policy를 따른다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/profile-block.md`, `PROD-821`, `PROD-822`, `PROD-823`
- Status: Active
- Context / Problem: GraphQL resolver가 입력 Profile ID를 actor로 신뢰하거나 resolver·loader마다 차단 조건을 복제하면 Account membership과 selected Profile 격리가 무너진다.
- Decision Outcome: GraphQL mutation·Owner connection·Node/connection loader는 검증된 Session의 Active Account와 selected Profile actor를 사용한다. resolver·loader는 공통 core/application policy를 호출하고, 요청별 DB actor GUC·operation 전용 database session·client 전용 필터를 권한 또는 visibility의 대체 수단으로 사용하지 않는다. 구체적인 helper 파일·함수와 GraphQL field/payload 이름은 기존 naming·generated schema에 맞추는 구현 선택으로 남긴다.
- Alternatives Considered: 입력된 arbitrary Profile ID를 actor로 사용하면 다른 Owner의 관계를 변경할 수 있다. resolver-local predicate는 정책 drift를 만든다. DB GUC/session 기반 격리는 현재 application policy와 runtime 경계를 확장하고 test·운영 복잡도를 추가한다.
- Consequences: selected Profile 전환과 membership 오류는 기존 GraphQL auth 경계에서 거부되고, Block 목록은 해당 selected Profile이 Owner인 관계만 반환한다. API schema의 concrete naming은 구현 시 repository convention을 따른다.
- Confirmation / Follow-up: `PROD-822`에서 Owner A/B·guest·membership mismatch fixture와 direct/list Node 경계를 검증하고, `PROD-823`에서 selected Profile별 actor Store 결과를 확인한다.

### 기존 Notification은 가시성으로 숨기고 source 생성 연결은 후속으로 둔다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0002-pr-review-domain-adjustments.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `docs/domain/decisions/0007-spec-boundary-and-state-clarifications.md`, `PROD-821`, `PROD-822`, `PROD-813`
- Status: Active
- Context / Problem: 차단 뒤 Related Profile/Post를 볼 수 없는 기존 Notification을 그대로 반환하면 접근 정책을 우회하지만, 현재 모든 Notification source를 이번 local capability에 연결하면 `PROD-327`과 별도 lifecycle을 흡수한다.
- Decision Outcome: unavailable 기존 Notification은 connection·Unread count·Node·read 처리에서 숨긴다. Block 생성으로 제거되는 Follow Request/Relationship을 직접 원인으로 하는 Notification만 `PROD-821` transaction에서 동기 삭제하며, 다른 기존 Notification과 Read State는 보존한다. Follow·Follow Request·Reply·Reaction·Repost source 전체의 신규 생성 suppression 연결은 `PROD-327`에 유보하고 이 change의 task·완료 증거로 삼지 않는다. 숨겨진 row의 비동기 물리 cleanup은 `PROD-328` 후속 lifecycle로 남긴다.
- Alternatives Considered: 모든 source 생성 경로를 여기서 수정하면 327의 공통 정책과 책임이 중복된다. 기존 unavailable row를 이 action에서 전부 삭제하면 Read State·비직접 원인 보존 계약을 위반한다. 이 change에 queue/worker/scan을 추가하면 328의 독립 rollout 경계를 합친다.
- Consequences: API surface는 차단 관계를 매 요청 평가하며, 숨겨진 row가 남아도 사용자에게 노출하지 않는다. `PROD-327`과 `PROD-328`이 별도 change로 진행되기 전까지 source suppression·async physical cleanup은 검증 대상이 아니다.
- Confirmation / Follow-up: `PROD-822`에서 list/count/Node/read visibility를 검증하고, `PROD-821`에서 direct-cause deletion만 확인하며, `PROD-813`은 두 후속 이슈를 이 change의 완료 조건으로 요구하지 않는다.

### Local Timeline은 완료된 PROD-649 후보 계약 위에 Block Exclude를 소비한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/policies/post-list.md`, `docs/design/local-timeline.md`, `PROD-649` 완료 계약, `PROD-813` 최신 본문·댓글
- Status: Active
- Context / Problem: 이전 Local Timeline 문구가 Profile Block을 후속 검증에서 제외하면 완료된 649의 PUBLIC·cursor·actor 계약과 실제 813의 cross-slice 책임이 분리된다.
- Decision Outcome: `PROD-813`은 Local Timeline에서 configured Local Instance의 기존 PUBLIC eligible Post 후보·정렬·immutable cursor·selected Profile actor 격리를 유지하면서 공통 Profile Block predicate로 blocked Author와 Repost Source Author를 후보에서 제외한다. `PROD-649`는 Block 선행 blocker가 아니며, 813이 완료된 계약을 소비해 통합 검증한다.
- Alternatives Considered: 649가 Block 구현을 기다리도록 blocker로 유지하면 이미 완료된 Local Timeline slice를 불필요하게 재개한다. page limit 이후 앱에서 제거하면 cursor semantics와 결과 수가 달라진다. Local 전용 predicate를 추가하면 공통 policy가 갈라진다.
- Consequences: Local Timeline은 Block change의 최종 통합 증거가 되지만 PROD-649의 기존 PUBLIC/eligibility/cursor 계약은 바뀌지 않는다. Author와 Source Author를 함께 검사해야 Repost leak을 막을 수 있다.
- Confirmation / Follow-up: `PROD-813` E2E에서 Local·Remote Target, Author/Source Author, cursor pagination과 selected Profile 전환을 함께 검증하고, 최신 Linear 관계에서 649 blocker 제거 상태를 확인한다.

### UI는 정본 presentation과 별도 Block destination을 소비한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: 정본 `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `docs/design/profile-hero.md`, `docs/design/accessibility.md`, `DSN-53`; 책임 이슈 `PROD-823`; 선행 presentation 구현 증거 `PROD-861` (정본 아님)
- Status: Active
- Context / Problem: 공용 presentation 이관 결과를 Block runtime 계약으로 오인하거나 Mute와 Block을 하나의 목록·route로 합치면 DSN-53 IA와 Profile Block 책임이 바뀐다.
- Decision Outcome: `PROD-823`은 `PROD-861`의 공용 presentation 선행 결과를 소비하되 그 구현 자체를 소유하지 않는다. Block confirmation은 Mute와 분리된 Danger·pending·실패·retry 상태를 사용하고, Settings에는 `뮤트한 프로필`과 `차단한 프로필`을 별도 destination으로 둔다. `blocking`은 `차단한 프로필입니다`와 `차단 해제`, `blockedBy`는 `이 프로필을 볼 수 없습니다`만 제공하는 최소 route shell을 유지하며 최신 상세·수치·Post·Media·Follow·Message를 재조회하지 않는다. 기존 공용 Button·ActionMenu·ModalSheet·Toast·Settings/Profile shell과 canonical 접근성·viewport 계약을 재사용한다.
- Alternatives Considered: `PROD-861`을 이 change에 다시 포함하면 presentation·runtime lifecycle이 결합된다. Mute/Block 혼합 목록은 별도 관리 계약과 destination 상태를 잃는다. blockedBy에 최신 Profile detail을 다시 요청하면 visibility 정책과 최소 shell을 우회한다.
- Consequences: DSN-53의 visual result는 선행 증거이고, 823은 실제 mutation·route·management·접근성 runtime을 완성한다. 새 범용 safety component나 Settings shell을 추가하지 않는다.
- Confirmation / Follow-up: `PROD-823`에서 Web 1024/1440·Mobile 390 Light/Dark, keyboard·Native back/focus, blocking/blockedBy와 list 상태를 검증하고, `PROD-813`에서 플랫폼별 실제 runtime 증거를 별도로 기록한다.

### Relay cache는 selected actor 경계 안에서 서버 결과로 수렴한다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `PROD-823`, `PROD-813`
- Status: Active
- Context / Problem: Block 성공 후 Profile·Post·Notification과 관리 connection을 그대로 두거나, Profile 전환 때 이전 Store·cursor를 재사용하면 stale visibility와 Owner 간 cache 누수가 생긴다.
- Decision Outcome: Relay는 현재 selected Profile actor의 Environment/Store에서만 Block connection과 영향받는 node를 갱신한다. 성공 payload와 공통 server policy를 기준으로 현재 surface·Block list·이미 표시된 unavailable Profile/Post/Notification을 좁게 숨기거나 제거하고, 실패 시 optimistic Block을 확정하지 않는다. selected Profile/Session 전환은 이전 connection·cursor·optimistic 결과를 새 actor에 재사용하지 않으며, Unblock은 삭제된 Follow·Reaction을 optimistic으로 복구하지 않는다. 구체적인 payload field와 connection updater/directive는 구현 선택으로 남긴다.
- Alternatives Considered: process 전역 Block store는 selected Profile 격리를 깨뜨린다. 모든 store를 무조건 reset하면 필요한 unrelated state까지 버리고 actor 경계를 과도하게 넓힌다. client-only hide는 서버 payload와 direct query에서 누수를 막지 못한다.
- Consequences: 823은 좁은 cache 수렴과 actor switch 회귀를, 813은 cross-slice UI/API 결과를 검증한다. 성공 payload의 구체적인 ID 집합은 schema 구현 시 영향 범위에 맞춰 정한다.
- Confirmation / Follow-up: `PROD-823` Relay test에서 success/failure·A/B actor·Unblock no-restore를 확인하고, `PROD-813`에서 Profile switch와 Local Timeline cache 격리를 E2E로 확인한다.

### 저장 schema는 additive 확장과 no-backfill rollout을 따른다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `memory/database-migrations.md`, `PROD-821`
- Status: Active
- Context / Problem: 새 relation을 기존 Profile·Follow·Reaction·Notification 상태에 억지로 합치거나 과거 데이터에 backfill하면 구버전 workload와 migration·rollback 경계가 불필요하게 넓어진다.
- Decision Outcome: Profile Block은 독립 table·foreign key·Owner/Target unique/check/index를 추가하는 additive migration으로 배포하고 기존 domain row와 과거 관계를 backfill하거나 변경하지 않는다. 구체적인 migration naming·history와 rollback command는 repository의 migration workflow에 따르며 이 decision이 새 migration runner나 API compatibility layer를 추가하지 않는다.
- Alternatives Considered: 기존 Profile row에 Block state를 추가하면 관계 방향·다중 Target·Owner 관리가 손상된다. 기존 관계를 backfill하면 배포 시점과 사용자-visible cleanup을 섞는다. 별도 migration framework는 현재 Drizzle 경계를 확장한다.
- Consequences: old/new app이 schema 확장 중 공존할 수 있고, Profile Block을 사용하지 않는 기존 데이터는 그대로 남는다. migration 실패·rollback 안전성은 `design.md`의 rollout guardrail과 821 migration test에서 확인한다.
- Confirmation / Follow-up: `PROD-821`에서 additive migration, constraint, 기존 row 보존과 schema snapshot을 검증하고, 813 archive 전까지 migration/rollback 증거를 기록한다.

## Remaining Decisions

없음.

## Superseded Decisions

없음.
