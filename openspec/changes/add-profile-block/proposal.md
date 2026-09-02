## Why

Profile Block의 도메인 계약은 이미 확정되어 있지만, 저장 관계·원자적 정리·조회 정책·GraphQL·Relay·관리 화면과
Local Timeline 회귀를 여러 구현 이슈가 일관되게 적용할 공유 행동 계약이 없다. `PROD-821`이 이 계약을 처음 열고
저장 결과를 구현한 뒤 `PROD-822`, `PROD-823`, `PROD-813`이 같은 로컬 capability를 순서대로 완성하고 검증한다.

## What Changes

- Owner/Target 방향성과 조합 유일성을 가진 Profile Block 저장 관계와 생성·해제 mutation 계약을 추가한다.
- Block 생성 시 Follow Request/Relationship, Target이 Owner의 Post에 남긴 Reaction과 그 Follow 객체를 직접 원인으로
  하는 Notification을 같은 원자적 경계에서 정리한다. Repost, Bookmark와 다른 기존 Notification은 보존한다.
- Owner/Target 사이의 Profile·Post·Media·Follow 후보 조회 차단과 모든 Post List·검색 결과의 Profile Block Exclude,
  차단으로 조회 불가가 된 기존 Notification의 가시성 정책을 연결한다. 현재 Notification source의 신규 생성 억제
  연결은 `PROD-327`에 유보한다.
- Profile Block 목록, Profile route의 `blocking`/`blockedBy` 최소 셸, 확인·pending·실패·접근성·Relay actor/cache 수렴
  계약을 추가한다.
- 완료된 `PROD-649` Local Timeline 계약에 Profile Block Exclude 회귀를 연결하고, `PROD-813`이 cross-slice E2E와
  canonical 동기화 및 최종 archive를 소유한다.
- `PROD-861` 공용 presentation 이관, `PROD-327` Notification 신규 생성 정책, `PROD-818` ActivityPub Block/Undo,
  `PROD-328` 비동기 cleanup은 이 change의 구현·완료 범위에 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`,
  `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`,
  `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`,
  `docs/domain/policies/post-list.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`,
  `docs/domain/decisions/0010-post-interaction-contracts.md`,
  `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`,
  `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `docs/design/local-timeline.md`,
  `memory/issue-openspec-workflow.md`
- Linear Contract: [PROD-813](https://linear.app/byulmaru/issue/PROD-813), Profile Block 로컬 흐름과 전체 완료·archive 책임
- Linear Implementations: [PROD-821](https://linear.app/byulmaru/issue/PROD-821),
  [PROD-822](https://linear.app/byulmaru/issue/PROD-822),
  [PROD-823](https://linear.app/byulmaru/issue/PROD-823); presentation 선행 [PROD-861](https://linear.app/byulmaru/issue/PROD-861)
- Excluded follow-up authorities: [PROD-327](https://linear.app/byulmaru/issue/PROD-327),
  [PROD-818](https://linear.app/byulmaru/issue/PROD-818), [PROD-328](https://linear.app/byulmaru/issue/PROD-328)
- Completed upstream integration: [PROD-649](https://linear.app/byulmaru/issue/PROD-649), Local Timeline

## Capabilities

### New Capabilities

- `profile-block`: Profile Block 저장 관계, 생성·해제, 공통 visibility/interaction 정책과 로컬 API 계약
- `profile-block-ui`: Profile action, 관리 목록, 차단 관계의 최소 Profile 셸과 Relay/cache 상태 수렴

### Modified Capabilities

- `data-model`: Profile Block 관계의 additive 저장 모델, unique/foreign-key 불변식과 원자적 정리 경계
- `profile`: Profile object·route·검색 및 상대 Profile/Follow 후보 조회에 Block 정책 적용
- `post`: Home·Local·Profile·Hashtag Post List와 Post/Media 조회에 Profile Block Exclude 적용
- `notification`: Block으로 제거되는 Follow 객체의 직접 원인 Notification 정리와 조회 불가 기존 Notification 숨김 연결;
  현재 source 신규 생성 억제 연결은 `PROD-327`에 유보

## Impact

- API/Core: Profile Block 저장·삭제 action, owner authorization, 공통 Profile/Post/Media/Follow visibility predicate,
  GraphQL object/connection/mutation과 Node 조회 경계가 영향받는다.
- Database: 기존 테이블을 깨뜨리지 않는 additive Profile Block 관계와 조합 uniqueness 및 필요한 foreign key가 영향받는다.
- App: Profile action/confirmation, Settings의 분리된 Block 목록, blocked Profile 최소 셸, selected Profile별 Relay actor
  store와 cache invalidation이 영향받는다.
- Verification: `PROD-821 → PROD-822 → PROD-823 → PROD-813` 순서의 slice 검증과 Local Timeline·cross-slice E2E가 필요하다.
  이번 change는 federation delivery나 async cleanup의 runtime을 추가하지 않는다.
