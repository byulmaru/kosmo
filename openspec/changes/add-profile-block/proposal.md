## Why

Profile Block의 저장 관계, durable cleanup, 공통 조회·상호작용 정책, GraphQL, client 상태와 관리 화면을 여러 구현 이슈가
같은 행동 계약으로 완성할 shared change가 필요하다. `PROD-821`이 새 저장 계약과 이 change를 열고, `PROD-822`·
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
  direct Profile route에서 기본 Profile 정보, viewer 방향 콘텐츠 상태와 frontend 경고를 기존 레거시 UI에 구현·통합하며 최신 canonical route 계약을 따른다.
- Verification: `PROD-821 → PROD-822 → PROD-823 → PROD-813` 순서의 slice 검증과 cross-slice E2E가 필요하다.
  federation·source suppression·async cleanup runtime은 이 change에 포함하지 않는다.
