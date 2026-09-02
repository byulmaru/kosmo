## Why

Profile Block의 저장 관계, durable cleanup, 공통 조회·상호작용 정책, GraphQL, Relay와 관리 화면을 여러 구현 이슈가
같은 행동 계약으로 완성할 shared change가 필요하다. `PROD-821`이 새 저장 계약과 이 change를 열고, `PROD-822`·
`PROD-823`·`PROD-813`이 책임이 독립적인 slice를 순서대로 완성·검증한다.

## What Changes

- Owner/Target 방향성과 조합 유일성을 가진 Profile Block 저장 관계와 생성·해제 mutation 계약을 추가한다. Owner는
  Local 또는 Remote일 수 있고, 도메인 capability에 특정 Account·Membership·Local 상태를 일반 조건으로 고정하지 않는다.
  현재 GraphQL ingress가 사용하는 selected Local Profile 경계는 GraphQL slice에만 적용하며 remote ingress는 `PROD-818`에
  남긴다.
- Block policy/admission을 통과한 생성은 durable Temporal cleanup orchestration을 시작한다. 기존 Follow Request·Follow
  Relationship removal transition/effect-plan을 양방향에 재사용하고, pending request와 제거된 Follow 객체의 직접 원인
  Follow Notification을 정리한다. 필수 cleanup 완료 전에는 Block action을 성공으로 확정하지 않는다.
- 기존 Reaction·Repost·Bookmark와 직접 원인이 아닌 기존 Notification 및 Read State는 이번 action에서 변경하지 않는다. 모든
  Notification source의 신규 생성 suppression은 `PROD-327`, 숨겨진 row의 async physical cleanup은 `PROD-328`의 후속 scope로 남긴다.
- Owner/Target 사이의 Profile·Post·Media·Follow 후보 조회 차단과 Home·Local·Profile·Hashtag Post List·검색의 공통
  Profile Block Exclude 및 새 로컬 상호작용 거부를 연결한다.
- Profile Block 관리 목록과 확인·pending·실패·접근성·Relay actor/cache 수렴 계약을 추가한다. 기존 presentation contract를
  유지하고 구체 route presentation을 선결하지 않으며, 보호된 데이터를 복구하지 않는다.
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
- Linear contract and archive: [PROD-813](https://linear.app/byulmaru/issue/PROD-813)
- Linear implementation slices: [PROD-821](https://linear.app/byulmaru/issue/PROD-821),
  [PROD-822](https://linear.app/byulmaru/issue/PROD-822), [PROD-823](https://linear.app/byulmaru/issue/PROD-823)
- Presentation prerequisite evidence: [PROD-861](https://linear.app/byulmaru/issue/PROD-861). 기존 presentation contract는 canonical
  design과 후속 승인된 presentation authority에 따라 소비한다.
- Deferred boundaries: [PROD-327](https://linear.app/byulmaru/issue/PROD-327),
  [PROD-818](https://linear.app/byulmaru/issue/PROD-818), [PROD-328](https://linear.app/byulmaru/issue/PROD-328)

## Capabilities

### New Capabilities

- `profile-block`: Profile Block 저장 관계, 생성·해제, durable cleanup, 공통 symmetric policy와 로컬 API 계약
- `profile-block-ui`: Profile action, 관리 목록, 승인된 presentation 소비와 Relay/cache 상태 수렴

### Modified Capabilities

- `data-model`: Profile Block 관계의 additive 저장 모델, unique/foreign-key/self 불변식과 no-backfill 계약
- `profile`: Profile object·route·검색·Follow 후보·새 Follow 입력에 Profile Block 정책 적용
- `post`: Home·Local·Profile·Hashtag Post List, Post/Media 조회·검색과 Reply/Reaction/Repost 입력에 Profile Block 정책 적용
- `notification`: Block으로 제거되는 Follow 객체의 직접 원인 Notification 정리와 조회 불가 기존 Notification 숨김 연결;
  source 신규 생성 suppression은 `PROD-327`에 유보

## Impact

- API/Core: Profile Block 저장·삭제 action, durable cleanup orchestration, 공통 Profile/Post/Media/Follow visibility predicate,
  GraphQL object/connection/mutation과 Node 조회 경계가 영향받는다.
- Database: 기존 row를 backfill하지 않는 additive Profile Block 관계, Owner/Target uniqueness와 foreign key가 영향받는다.
  migration/rollback safety는 design과 `PROD-821` 검증 guardrail로 다룬다.
- App: Profile action/confirmation, Settings의 분리된 Block 목록과 selected Profile별 Relay actor store/cache 수렴이 영향받는다.
  차단된 상세 데이터를 UI가 복구하는 별도 route shell은 요구하지 않는다.
- Verification: `PROD-821 → PROD-822 → PROD-823 → PROD-813` 순서의 slice 검증과 cross-slice E2E가 필요하다.
  federation·source suppression·async cleanup runtime은 이 change에 포함하지 않는다.
