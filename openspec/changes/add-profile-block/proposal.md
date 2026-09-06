## Why

Profile Block의 저장 관계, durable cleanup, 공통 조회·상호작용 정책, GraphQL, client 상태와 관리 화면을 여러 구현 이슈가
같은 행동 계약으로 완성할 shared change가 필요하다. `PROD-821`이 새 저장 계약과 durable cleanup을 소유하고, `PROD-822`·
`PROD-823`·`PROD-813`이 책임이 독립적인 slice를 순서대로 완성·검증한다.

## What Changes

- Owner/Target 방향성과 조합 유일성을 가진 Profile Block 저장 관계와 생성·해제 mutation 계약을 추가한다. Owner는
  Local 또는 Remote일 수 있고, 도메인 capability에 특정 Account·Membership·Local 상태를 일반 조건으로 고정하지 않는다.
  현재 GraphQL ingress가 사용하는 selected Local Profile 경계는 GraphQL slice에만 적용하며 remote ingress는 `PROD-818`에
  남긴다.
- Block policy/admission을 통과한 생성은 durable cleanup orchestration을 시작한다. 이번 실행이 포착한 양방향 Follow Request·Follow
  Relationship과 제거된 Follow 객체의 직접 원인 Follow Notification을 정리하고, 필수 cleanup 완료 전에는 Block action을 성공으로 확정하지 않는다.
  이미 진입한 Follow transition이 cleanup 뒤 남긴 Follow/Request 또는 그 직접 원인 Notification은 남을 수 있지만 Active Block 동안 공통 정책에서
  inactive/invisible로 취급한다. Unblock은 현재 남아 있는 양방향 Follow/Request와 그 직접 원인 Notification을 정리한 뒤 Block을 제거하며 삭제된 관계를
  복구하지 않는다.
- 기존 Reaction·Repost·Bookmark와 직접 원인이 아닌 기존 Notification 및 Read State는 이번 action에서 변경하지 않는다. 모든
  Notification source의 신규 생성 suppression은 `PROD-327`, 숨겨진 row의 async physical cleanup은 `PROD-328`의 후속 scope로 남긴다.
- Profile Node·handle route·일반 Profile 검색에는 기존 Profile 조회 정책을 적용하고, Owner·Target 사이의 Post·Media 직접 조회와 Profile Post List에는 viewer 방향의
  콘텐츠 정책을 적용한다. Home·Local·Hashtag Post List·Post 검색은 상대 콘텐츠를 양방향으로 필터링하며, Follow 후보·새 로컬 상호작용과 Notification은 양방향
  보호 정책을 적용한다.
- Profile Block 관리 목록과 확인·pending·실패·접근성·selected Profile별 상태/cache 수렴 계약을 추가한다. 기존 레거시 Profile·Settings UI에 최신 canonical이 정한 direct Profile route를
  구현·통합해
  기본 Profile 정보와 viewer 방향의 콘텐츠 상태를 표시하고, `blocking` route는 콘텐츠 경고 뒤 허용된 결과와 `차단 해제` action을 제공하며, `blockedBy` route는
  콘텐츠 차단 상태를 표시한다. 경고 문구와 표시 기간은 후속 디자인 계약으로 남기고, `PROD-917`의 신규 UI 교체 범위는 이 change와 분리한다.
- `PROD-813`은 네 slice의 cross-slice E2E, canonical·Linear·OpenSpec 동기화와 최종 archive를 소유한다.

### Current issue slice — PROD-822

이번에는 기존 shared change에서 `PROD-822`의 정책·GraphQL 구현과 검증 범위를 구체화한다. `PROD-821`의 저장·cleanup,
`PROD-823`의 UI·client 상태와 `PROD-813`의 통합·archive 책임은 유지한다.

- `PROD-822`는 cleanup [PR #726](https://github.com/byulmaru/kosmo/pull/726)을 부모 layer로 삼아 Stack을 쌓는다. #726의
  저장·cleanup 구현 책임과 검증은 그대로 분리하고, `PROD-822`는 그 공개 결과를 소비해 정책·GraphQL 책임만 구현한다. #726의 구현을
  `PROD-822`에 복제하거나 대신 소유하지 않는다.

- Active Block을 양방향으로 평가하고, 남아 있는 Follow Request·Follow Relationship을 조회·권한 판정의 근거로 사용하지 않는다.
- Profile·Post·PostContent·Media, 관계 Node, 기존 목록·검색·Notification 조회가 같은 정책을 적용한다. 목록의 후보 제외는 pagination 전에 수행한다.
- Block이 이미 적용된 상태에서 시작한 로컬 Follow·Follow Request 승인·Reply·Reaction·Repost는 새 관계나 상호작용을 저장하지 않는다.
  cleanup과 겹쳐 이미 진행 중이던 Follow transition의 잔존 row는 기존 승인 범위대로 허용하고 비활성·비노출로 취급한다.
- GraphQL 생성·해제는 선행 durable action의 완료를 기다리며, Owner 관리 정보는 일반 Profile 조회와 구분한다.
  selected Local Profile과 request-scoped loader의 actor 격리를 함께 검증한다.
- 직접 Profile route에 새로고침·링크로 진입해도 현재 Owner의 차단 여부와 해제할 관계 ID를 얻을 수 있게 한다.
  일반 Target Profile 조회나 이전 client cache 없이 승인된 identity-free 화면과 해제 action을 연결한다.
- 기존 consumer의 공개 결과와 공통 후보 정책을 검증한다. 아직 없는 Hashtag Post List·Post 검색 endpoint를 새로 만드는 일은
  이번 shared change에 포함하지 않는다. `PROD-822`와 `PROD-813`은 해당 경로의 공통 후보 정책 검증까지만 완료 기준으로 삼으며,
  실제 endpoint 구현·E2E를 archive 조건으로 요구하지 않는다. 공통 정책 검증 결과와 실제 API 통합 검증을 실행하지 않았다는 사실을 구분해 기록한다.
  검증 시점에 이미 구현된 consumer는 실제 API 검증 대상이며, archive 이후 추가되는 endpoint는 해당 기능 이슈가 연결·검증을 소유한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`,
  `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`,
  `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`,
  `docs/domain/objects/media.md`, `docs/domain/policies/post-list.md`,
  `docs/domain/decisions/0003-policy-ownership-clarifications.md`,
  `docs/domain/decisions/0004-review-consistency-clarifications.md`,
  `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`,
  `docs/domain/decisions/0010-post-interaction-contracts.md`,
  `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`,
  `docs/design/profile-mute-block.md`, `docs/design/settings.md`,
  `memory/issue-openspec-workflow.md`
- Linear integration and archive owner: [PROD-813](https://linear.app/byulmaru/issue/PROD-813)
- Linear implementation slices: [PROD-821](https://linear.app/byulmaru/issue/PROD-821),
  [PROD-822](https://linear.app/byulmaru/issue/PROD-822), [PROD-823](https://linear.app/byulmaru/issue/PROD-823)
- 현재 slice의 추가 근거: `docs/domain/decisions/0012-post-interaction-followup-clarifications.md`,
  `docs/architecture/core-services.md`, `memory/coding-style.md`, `memory/database-design.md`, `memory/graphql-style.md`;
  `PROD-821`의 2026-09-03 concurrency 정정 댓글 `5ceda55c-f3b6-4109-987c-27c12c413ce2`와
  2026-09-02 구현 수단 비규범화 정정 댓글 `88a988b6-4877-476f-8e93-926fcc0f8e10`.
- 2026-09-06 사용자 범위 결정은 `PROD-822`·`PROD-813` 본문의 미구현 Post List·검색 완료 기준에 반영했다.
  직접 route 진입의 API·UI 연결은 기존 canonical design과 `PROD-822`·`PROD-823`의 공개 결과·완료 조건을 따른다.
- 2026-09-06 사용자 Stack 결정은 `PROD-821`·`PROD-822`·`PROD-813` 본문과 이 change의 구현 순서에 반영했다.
  `PROD-822`는 #726 위에 쌓되 cleanup 책임을 흡수하지 않는다.
- Presentation authority/evidence: `DSN-51`, `DSN-53`; [PROD-861](https://linear.app/byulmaru/issue/PROD-861)은 선행 구현 증거다. 최신 canonical의
  identity-free route presentation을 소비하며 presentation 결정·이관 자체는 이 change가 소유하지 않는다.
- UI implementation/integration: `PROD-823`이 기존 레거시 Profile·Settings UI에 `DSN-51`, `DSN-53`과 최신 canonical이 정한 direct Profile route 계약을 구현·통합한다.
  공용 presentation 이관·Storybook 확정은 [PROD-861](https://linear.app/byulmaru/issue/PROD-861), 신규 UI 교체는 [PROD-917](https://linear.app/byulmaru/issue/PROD-917)의 각각 후속 범위다.
- Deferred boundaries: [PROD-327](https://linear.app/byulmaru/issue/PROD-327),
  [PROD-818](https://linear.app/byulmaru/issue/PROD-818), [PROD-328](https://linear.app/byulmaru/issue/PROD-328)

## Capabilities

### New Capabilities

- `profile-block`: Profile Block 저장 관계, 생성·해제, durable cleanup, 공통 symmetric policy와 로컬 API 계약
- `profile-block-ui`: Profile action, 관리 목록, 기존 레거시 UI 기반 direct route 구현·통합과 selected Profile별 상태/cache 수렴

### Modified Capabilities

- `data-model`: Profile Block 관계의 additive 저장 모델, uniqueness/referential integrity/self-block 불변식과 no-backfill 계약
- `profile`: 기존 Profile object·route·일반 검색 조회 조건 유지와 Follow 후보·새 Follow 입력에 Profile Block 정책 적용
- `post`: 방향성 있는 Profile Post·Post/Media 조회, 양방향 Home·Local·Hashtag Post List, Post 검색과 Reply/Quote/Reaction/Repost 입력에 Profile Block 정책 적용
- `notification`: Block으로 제거되는 Follow 객체의 직접 원인 Notification 정리와 조회 불가 기존 Notification 숨김 연결;
  source 신규 생성 suppression은 `PROD-327`에 유보

## Impact

- API/Core: Profile Block 저장·삭제 action, durable cleanup orchestration, Profile identity·Post/Media·Follow visibility와
  interaction/Notification 정책, GraphQL object/connection/mutation과 Node 조회 경계가 영향받는다.
- Database: 기존 row를 backfill하지 않는 additive Profile Block 관계, Owner/Target uniqueness와 referential integrity가 영향받는다.
  migration/rollback safety는 design과 `PROD-821` 검증 guardrail로 다룬다.
- App: Profile action/confirmation, Settings의 분리된 Block 목록과 selected Profile별 상태·cache 수렴이 영향받는다.
  direct Profile route에서 최신 canonical이 승인한 identity-free presentation을 기존 레거시 UI에 구현·통합하며, 차단된 상세 데이터를 UI가 복구하지 않는다.
- Verification: `PROD-821` 저장·cleanup(#726) → `PROD-822` 정책·GraphQL → `PROD-823` → `PROD-813` 순서의 slice 검증과 cross-slice E2E가 필요하다.
  federation·source suppression·async cleanup runtime은 이 change에 포함하지 않는다.
